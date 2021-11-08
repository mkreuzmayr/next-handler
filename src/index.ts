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
export type Schemas<TQuery, TBody> = {
  query?: ZodSchemaLike<TQuery>;
  body?: ZodSchemaLike<TBody>;
};

type IncomingApiRequest<TApiRequest = IncomingMessage> = TApiRequest & {
  body?: any;
  query?: any;
};

// Type definition object for handlers
export type HandlerDefinition = Partial<
  Record<
    HttpMethod,
    {
      schemas: Schemas<unknown, unknown>;
      handler: Handler<unknown, unknown, unknown>;
    }
  >
>;

// Option type for handlerFactory options
export type HandlerFactoryOptions<TApiRequest, TApiResponse> = {
  onError?: (
    ctx: RequestContext<TApiRequest, TApiResponse> & { err: unknown }
  ) => void;
  onNotFound?: (ctx: RequestContext<TApiRequest, TApiResponse>) => void;
};

export type ZodSchemaLike<TInput = unknown> = {
  parseAsync: (input: any) => Promise<TInput>;
};

export const jsonResponse = (
  res: any,
  status: number,
  data?: unknown
): void => {
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
  TApiResponse extends ServerResponse
>(
  method: TMethod,
  tdef: HandlerDefinition,
  options?: HandlerFactoryOptions<TApiRequest, TApiResponse>
) => {
  return <TBody = unknown, TQuery = unknown, TResponseData = unknown>(
    schemas: Schemas<TQuery, TBody>,
    handler: Handler<TBody, TQuery, TResponseData, TApiRequest, TApiResponse>
  ) => {
    // Extend old type definition with new handler type
    type NewHandlerFactory = typeof tdef & Record<TMethod, typeof handler>;
    // Return handler with new type definiton
    return nextHandler<TApiRequest, TApiResponse, NewHandlerFactory>(options, {
      ...tdef,
      [method]: {
        handler,
        schemas,
      },
    } as NewHandlerFactory);
  };
};

const buildHandler =
  <TApiRequest extends IncomingMessage, TApiResponse extends ServerResponse>(
    tdef: HandlerDefinition,
    options?: HandlerFactoryOptions<TApiRequest, TApiResponse>
  ) =>
  () =>
  async (req: IncomingApiRequest<TApiRequest>, res: TApiResponse) => {
    try {
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
          res.statusCode = 0;
          const promise = handler({ req: { ...req, body, query }, res });
          // Promise.resolve does not care if it is a Promise or not
          const response = await Promise.resolve(promise);
          // Check if return type is a status tuple
          const status = res.statusCode === 0 ? 200 : res.statusCode;
          return jsonResponse(res, status, response);
        }
      }
      // If method or handler function is not availabe call onNotFound or return 404
      const onNotFound = options?.onNotFound;
      if (onNotFound) {
        return onNotFound({ req, res });
      }
      return jsonResponse(res, 404);
    } catch (err) {
      const onError = options?.onError;
      if (onError) {
        return onError({ req, res, err });
      }
      return jsonResponse(res, 500);
    }
  };

export const nextHandler = <
  TApiRequest extends IncomingMessage,
  TApiResponse extends ServerResponse,
  TDef extends HandlerDefinition = HandlerDefinition
>(
  options?: HandlerFactoryOptions<TApiRequest, TApiResponse>,
  _tdef: TDef = {} as TDef
) => {
  return {
    _tdef,
    get: factoryFunction('get', _tdef, options),
    post: factoryFunction('post', _tdef, options),
    put: factoryFunction('put', _tdef, options),
    patch: factoryFunction('patch', _tdef, options),
    delete: factoryFunction('delete', _tdef, options),
    build: buildHandler(_tdef, options),
  };
};

export const nh = nextHandler;

export type inferType<THandler> = THandler extends Handler<
  infer TBody,
  infer TQuery,
  infer TResponseData
>
  ? {
      body: TBody;
      query: TQuery;
      data: TResponseData;
    }
  : never;

export type inferBodyType<THandler> = inferType<THandler>['body'];
export type inferQueryType<THandler> = inferType<THandler>['query'];
export type inferResponseType<THandler> = inferType<THandler>['data'];
