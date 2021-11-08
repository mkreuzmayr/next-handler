import { expectTypeOf } from 'expect-type';
import { createServer } from 'http';
import supertest from 'supertest';
import { z } from 'zod';
import { InferType, nh } from '../src/index';

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

test('notFound', async () => {
  const handler = nh().get({}, () => {
    throw new Error();
  });

  return await rq(handler)
    .post('/')
    .expect('Content-Type', 'application/json')
    .expect(404)
    .expect('');
});

test('custom-error', async () => {
  const errorData = { error: 'Teapot Error' };

  const handler = nh({
    onError: async ({ res }) => {
      res.statusCode = 418;
      return errorData;
    },
  }).get({}, () => {
    throw new Error();
  });

  expectTypeOf(errorData).toMatchTypeOf<InferType<typeof handler>['error']>();

  return await rq(handler)
    .get('/')
    .expect('Content-Type', 'application/json')
    .expect(418)
    .expect(JSON.stringify(errorData));
});

test('custom-notFound', async () => {
  const notFoundData = { error: 'Unavailable' };

  const handler = nh({
    onNotFound: async ({ res }) => {
      res.statusCode = 451;
      return notFoundData;
    },
  }).put({}, () => {
    throw new Error();
  });

  expectTypeOf(notFoundData).toMatchTypeOf<
    InferType<typeof handler>['notFound']
  >();

  return await rq(handler)
    .patch('/')
    .expect('Content-Type', 'application/json')
    .expect(451)
    .expect(JSON.stringify(notFoundData));
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
      expectTypeOf(req.body).toMatchTypeOf<{ name: string; number: number }>();
      return req.body;
    }
  );

  const data = { name: 'John', number: 15 };

  expectTypeOf(data).toMatchTypeOf<InferType<typeof handler>['post']['data']>();

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
      expectTypeOf(req.query).toMatchTypeOf<{ text: string; id: number }>();
      return req.query;
    }
  );

  const query = { text: 'test', id: 0 };

  expectTypeOf(query).toMatchTypeOf<
    InferType<typeof handler>['post']['query']
  >();

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
