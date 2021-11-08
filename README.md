<div align="center">
  <br />
  <h1>
    🧑‍🔧
    <br />
    next-handler
    <br />
    <a href="https://www.npmjs.com/package/next-handler">
       <img src="https://img.shields.io/npm/v/next-handler.svg" alt="npm package" />
    </a>
    
  </h1>
  <h3>Type save handler generator for <a href="https://nextjs.org/">Next.js</a> <a href="https://nextjs.org/docs/api-routes/introduction">API Routes</a>.</h3>
  <br />
  <br />
</div>

## Features

- 🔒 Full type safety on body, query & response
- ✅ Zod type validation out of the box
- ✉️ Send json response via return
- 👮 Error and notFound handlers
- 🍃 Zero dependencies

## Installation

```sh
npm install next-handler
# or
yarn add next-handler
```

## Basic Usage

```typescript
import { nh } from 'next-handler';

const handler = nh().post(
  {
    query: z.object({
      id: z.string().transform((id) => parseInt(id)),
    }),
    body: z.object({
      data: z.string(),
    }),
  },
  ({ req }) => {
    // full type safety provided on query and body
    data.set(req.query.id, req.body.data);

    // send json response via return
    return { ok: true };
  }
);

export default handler.build();
```
