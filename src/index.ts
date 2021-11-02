export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

// Request type with added body and query types
export type ApiRequestTyped<TApiRequest, TBody, TQuery> = {
  body: TBody;
  query: TQuery;
} & Omit<TApiRequest, 'body' | 'query'>;

// Handler context parameter type
export type RequestContext<TApiRequest, TApiResponse, TBody, TQuery, TContext> =
  {
    req: ApiRequestTyped<TApiRequest, TBody, TQuery>;
    res: TApiResponse;
  } & TContext;

// Parameter type for context creation function
export type ApiContextFuncProps<TApiRequest, TApiResponse> = {
  req: TApiRequest;
  res: TApiResponse;
};

// Function type for context creation
export type ApiContextFunc<TApiRequest, TApiResponse, TContext> = (
  ctx: ApiContextFuncProps<TApiRequest, TApiResponse>
) => TContext;

// Handler response tuple
export type HandlerResponse<TResponseData> =
  | [number, TResponseData | TResponseData[]]
  | TResponseData
  | TResponseData[];

// Handler himself
export type Handler<TBody, TQuery, TResponseData, TContext> = (
  ctx: RequestContext<unknown, unknown, TBody, TQuery, TContext>
) => HandlerResponse<TResponseData> | Promise<HandlerResponse<TResponseData>>;

// Type definition object for handlers
export type HandlerDefinition<TContext> = Partial<
  Record<HttpMethod, Handler<unknown, unknown, unknown, TContext>>
>;

// Option Type for handlerFactory options
export type HandlerFactoryOptions<TApiRequest, TApiResponse, TContext> = {
  createContext?: ApiContextFunc<TApiRequest, TApiResponse, TContext>;
  onError?: (err: unknown, ctx: TContext | undefined) => void;
  onNotFound?: (ctx: TContext | undefined) => void;
};

export type ZodSchemaLike<TInput = unknown> = {
  parseAsync: (input: any) => Promise<TInput>;
};

const jsonResponse = (res: any, status: number, data?: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(data ? JSON.stringify(data) : '');
};

// function to create generic handler methods for method chaining
const factoryFunction = <
  TMethod extends HttpMethod,
  TApiRequest,
  TApiResponse,
  TContext
>(
  method: TMethod,
  tdef: HandlerDefinition<TContext>,
  options?: HandlerFactoryOptions<TApiRequest, TApiResponse, TContext>
) => {
  return <TBody = unknown, TQuery = unknown, TResponseData = unknown>(
    schemas: {
      query?: ZodSchemaLike<TQuery>;
      body?: ZodSchemaLike<TBody>;
    },
    handler: Handler<TBody, TQuery, TResponseData, TContext>
  ) => {
    // Extend old type definition with new handler type
    type NewHandlerFactory = typeof tdef & Record<TMethod, typeof handler>;
    // Return handler with new type definiton
    return createHandler<
      TApiRequest,
      TApiResponse,
      TContext,
      NewHandlerFactory
    >(options, {
      ...tdef,
      [method]: handler,
    } as NewHandlerFactory);
  };
};

const buildHandler =
  <TApiRequest, TApiResponse, TContext>(
    tdef: HandlerDefinition<TContext>,
    options?: HandlerFactoryOptions<TApiRequest, TApiResponse, TContext>
  ) =>
  () =>
  async (req: any, res: any) => {
    let context: TContext | undefined = undefined;
    try {
      const createContext = options?.createContext;
      context = createContext ? createContext({ req, res }) : ({} as TContext);
      if (req.method) {
        // Cast method to lower case to be able to query _tdef
        const method = req.method.toLowerCase() as HttpMethod;
        const handlerFunc = tdef[method];
        if (handlerFunc) {
          const promise = handlerFunc({ req, res, ...context });
          // Promise.resolve does not care if it is a Promise or not
          const response = await Promise.resolve(promise);
          // Check if return type is a status tuple
          if (Array.isArray(response)) {
            const [status, data] = response;
            jsonResponse(res, status, data);
          } else {
            jsonResponse(res, 200, response);
          }
        }
      }
      // If method or handler function is not availabe call onNotFound or return 404
      const onNotFound = options?.onNotFound;
      if (onNotFound) {
        return onNotFound(context);
      }
      jsonResponse(res, 404);
    } catch (err) {
      const onError = options?.onError;
      if (onError) {
        return onError(err, context);
      }
      jsonResponse(res, 400);
    }
  };

export const createHandler = <
  TApiRequest,
  TApiResponse,
  TContext = RequestContext<
    TApiRequest,
    TApiResponse,
    unknown,
    unknown,
    unknown
  >,
  TDef extends HandlerDefinition<TContext> = HandlerDefinition<TContext>
>(
  options?: HandlerFactoryOptions<TApiRequest, TApiResponse, TContext>,
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

export type inferType<THandler> = THandler extends Handler<
  infer TBody,
  infer TQuery,
  infer TResponseData,
  infer TContext
>
  ? {
      body: TBody;
      query: TQuery;
      data: TResponseData;
      context: TContext;
    }
  : never;

export type inferBodyType<THandler> = inferType<THandler>['body'];
export type inferQueryType<THandler> = inferType<THandler>['query'];
export type inferResponseType<THandler> = inferType<THandler>['data'];
export type inferContextType<THandler> = inferType<THandler>['context'];
