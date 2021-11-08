import { createServer } from 'http';
import supertest from 'supertest';
import { z } from 'zod';
import { jsonResponse, nh } from '../src/index';

const rq = (handler: any) => supertest(createServer(handler.build()));

test('ok', async () => {
  const handler = nh().get({}, ({ res }) => {
    res.setHeader('Test-Header', 'FooBar');
    return 'test';
  });

  return await rq(handler)
    .get('/')
    .expect('Content-Type', 'application/json')
    .expect(200)
    .expect('Test-Header', 'FooBar')
    .expect(JSON.stringify('test'));
});

test('error', async () => {
  const handler = nh().get({}, () => {
    throw new Error();
  });

  return await rq(handler)
    .get('/')
    .expect('Content-Type', 'application/json')
    .expect(500)
    .expect('');
});

test('custom-error', async () => {
  const handler = nh({
    onError: (ctx) => {
      jsonResponse(ctx!.res, 418);
    },
  }).get({}, () => {
    throw new Error();
  });

  return await rq(handler)
    .get('/')
    .expect('Content-Type', 'application/json')
    .expect(418)
    .expect('');
});

test('body', async () => {
  const handler = nh().post(
    {
      body: z.object({
        name: z.string(),
        number: z.number(),
      }),
    },
    ({ req }) => {
      return req.body;
    }
  );

  const data = { name: 'John', number: 15 };

  return await rq(handler)
    .post('')
    .send(data)
    .expect('Content-Type', 'application/json')
    .expect(200)
    .expect(data);
});

test('body-fail', async () => {
  const handler = nh().post(
    {
      body: z.object({
        name: z.string(),
        number: z.number(),
      }),
    },
    ({ req }) => {
      return req.body;
    }
  );

  return await rq(handler)
    .post('/')
    .send({ name: 'John' })
    .expect('Content-Type', 'application/json')
    .expect(500)
    .expect('');
});

test('query', async () => {
  const handler = nh().post(
    {
      query: z.object({
        text: z.string(),
        id: z.string().transform((id) => parseInt(id)),
      }),
    },
    ({ req }) => {
      return req.query;
    }
  );

  return await rq(handler)
    .post('/?text=test&id=0')
    .expect('Content-Type', 'application/json')
    .expect(200)
    .expect(JSON.stringify({ text: 'test', id: 0 }));
});

test('query-fail', async () => {
  const handler = nh().post(
    {
      query: z.object({
        text: z.string(),
        id: z.string().transform((id) => parseInt(id)),
      }),
    },
    ({ req }) => {
      return req.query;
    }
  );

  return await rq(handler)
    .post('/?text=test')
    .expect('Content-Type', 'application/json')
    .expect(500)
    .expect('');
});
