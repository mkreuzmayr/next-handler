import { IncomingMessage, ServerResponse } from 'http';
import { parse as urlParse } from 'url';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

// Request type with added body and query types
export type ApiRequestTyped<TApiRequest, TBody, TQuery> = {
  body: TBody;
  query: TQuery;
} & Omit<TApiRequest, 'body' | 'query'>;

// Handler context parameter type
export type RequestContext<TApiRequest, TApiResponse> = {
  req: TApiRequest;
  res: TApiResponse;
};

// Handler himself
export type Handler<
  TBody,
  TQuery,
  TResponseData,
  TApiRequest = unknown,
  TApiResponse = unknown
> = (
  ctx: RequestContext<ApiRequestTyped<TApiRequest, TBody, TQuery>, TApiResponse>
) => TResponseData | Promise<TResponseData>;

// Validation schema container
type Schemas<TQuery, TBody> = {
  query?: ZodSchemaLike<TQuery>;
  body?: ZodSchemaLike<TBody>;
};

type IncomingApiRequest<TApiRequest = IncomingMessage> = TApiRequest & {
  body?: any;
  query?: any;
};

// Type definition object for handlers
type HandlerDefinition = Partial<
  Record<
    HttpMethod,
    {
      schemas: Schemas<unknown, unknown>;
      handler: Handler<unknown, unknown, unknown, unknown, unknown>;
    }
  >
>;

// Option type for handlerFactory options
export type HandlerFactoryOptions<
  TApiRequest,
  TApiResponse,
  TError,
  TNotFound
> = {
  onError?: (
    ctx: RequestContext<TApiRequest, TApiResponse> & { err: unknown }
  ) => TError | Promise<TError>;
  onNotFound?: (
    ctx: RequestContext<TApiRequest, TApiResponse>
  ) => TNotFound | Promise<TNotFound>;
};

export type ZodSchemaLike<TInput = unknown> = {
  parseAsync: (input: any) => Promise<TInput>;
};

const jsonResponse = (res: any, status: number, data?: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(data ? JSON.stringify(data) : '');
};

const parseBody = async (req: IncomingApiRequest): Promise<unknown> => {
  if (req.body) {
    return req.body;
  }
  const buffers = [];
  for await (const chunk of req) {
    buffers.push(chunk);
  }
  const data = Buffer.concat(buffers).toString();
  return data ? JSON.parse(data) : null;
};

const parseQuery = (req: IncomingApiRequest): unknown => {
  if (req.query) {
    return req.query;
  }
  return urlParse(req.url ?? '', true).query;
};

const checkSchema = async (obj: unknown, schema?: ZodSchemaLike) => {
  return schema ? await schema.parseAsync(obj) : obj;
};

// Function to create generic handler methods for method chaining
const factoryFunction = <
  TMethod extends HttpMethod,
  TApiRequest extends IncomingMessage,
  TApiResponse extends ServerResponse,
  TError,
  TNotFound
>(
  method: TMethod,
  tdef: HandlerDefinition,
  options?: HandlerFactoryOptions<TApiRequest, TApiResponse, TError, TNotFound>
) => {
  return <TBody = unknown, TQuery = unknown, TResponseData = unknown>(
    schemas: Schemas<TQuery, TBody>,
    handler: Handler<TBody, TQuery, TResponseData, TApiRequest, TApiResponse>
  ) => {
    // Extend old type definition with new handler type
    type NewHandlerFactory = typeof tdef & Record<TMethod, typeof handler>;
    // Return handler with new type definiton
    return nextHandler<
      TApiRequest,
      TApiResponse,
      NewHandlerFactory,
      TError,
      TNotFound
    >(options, {
      ...tdef,
      [method]: {
        handler,
        schemas,
      },
    } as NewHandlerFactory);
  };
};

const callHandler = async <THandler extends (...args: any) => any>(
  res: ServerResponse,
  handler: THandler | undefined,
  handlerArg: Parameters<THandler>[0],
  defaultStatus: number
) => {
  if (!handler) {
    return jsonResponse(res, defaultStatus);
  }
  const promise = handler(handlerArg);
  const response = await Promise.resolve(promise);
  const status = res.statusCode === 0 ? defaultStatus : res.statusCode;
  return jsonResponse(res, status, response);
};

const buildHandler =
  <
    TApiRequest extends IncomingMessage,
    TApiResponse extends ServerResponse,
    TError = unknown,
    TNotFound = unknown
  >(
    tdef: HandlerDefinition,
    options?: HandlerFactoryOptions<
      TApiRequest,
      TApiResponse,
      TError,
      TNotFound
    >
  ) =>
  () =>
  async (req: IncomingApiRequest<TApiRequest>, res: TApiResponse) => {
    try {
      res.statusCode = 0;
      if (req.method) {
        // Cast method to lower case to be able to query _tdef
        const method = req.method.toLowerCase() as HttpMethod;
        const handlerContainer = tdef[method];
        if (handlerContainer) {
          const { handler, schemas } = handlerContainer;
          const parsedBody = await parseBody(req);
          const parsedQuery = parseQuery(req);
          const body = checkSchema(parsedBody, schemas.body);
          const query = await checkSchema(parsedQuery, schemas.query);
          return await callHandler(
            res,
            handler,
            { req: { ...req, body, query }, res },
            200
          );
        }
      }
      await callHandler(res, options?.onNotFound, { req, res }, 404);
    } catch (err) {
      await callHandler(res, options?.onError, { req, res, err }, 500);
    }
  };

export const nextHandler = <
  TApiRequest extends IncomingMessage,
  TApiResponse extends ServerResponse,
  TDef extends HandlerDefinition = HandlerDefinition,
  TError = undefined,
  TNotFound = undefined
>(
  options?: HandlerFactoryOptions<TApiRequest, TApiResponse, TError, TNotFound>,
  _tdef: TDef = {} as TDef
) => {
  return {
    _tdef,
    _options: options,
    get: factoryFunction('get', _tdef, options),
    post: factoryFunction('post', _tdef, options),
    put: factoryFunction('put', _tdef, options),
    patch: factoryFunction('patch', _tdef, options),
    delete: factoryFunction('delete', _tdef, options),
    build: buildHandler(_tdef, options),
  };
};

export const nh = nextHandler;

type NextHandler = ReturnType<typeof nextHandler>;

export type InferType<TFactory extends NextHandler> = InferDefType<
  TFactory['_tdef']
> &
  InferErrorAndNotFoundTypes<TFactory['_options']>;

type InferErrorAndNotFoundTypes<TFactoryOpts> =
  TFactoryOpts extends HandlerFactoryOptions<
    infer TApiRequest,
    infer TApiResponse,
    infer TError,
    infer TNotFound
  >
    ? { error: TError; notFound: TNotFound }
    : never;

type InferDefType<TDef extends HandlerDefinition> = {
  [TMethod in HttpMethod]: InferHandlerTypes<TDef[TMethod]>;
};

type InferHandlerTypes<THandler> = THandler extends Handler<
  infer TBody,
  infer TQuery,
  infer TResponseData,
  infer TApiRequest,
  infer TApiResponse
>
  ? {
      body: TBody;
      query: TQuery;
      data: TResponseData;
    }
  : never;
