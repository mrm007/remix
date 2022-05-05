import type { VercelRequest, VercelResponse } from "@vercel/node";
import type {
  AppLoadContext,
  ServerBuild,
  RequestInit as NodeRequestInit,
  Response as NodeResponse,
} from "@remix-run/node";
import {
  // This has been added as a global in node 15+
  AbortController,
  createRequestHandler as createRemixRequestHandler,
  Headers as NodeHeaders,
  Request as NodeRequest,
  pipeReadableStreamToWritable,
} from "@remix-run/node";

/**
 * A function that returns the value to use as `context` in route `loader` and
 * `action` functions.
 *
 * You can think of this as an escape hatch that allows you to pass
 * environment/platform-specific values through to your loader/action.
 */
export type GetLoadContextFunction = (
  req: VercelRequest,
  res: VercelResponse
) => AppLoadContext;

export type RequestHandler = (
  req: VercelRequest,
  res: VercelResponse
) => Promise<void>;

/**
 * Returns a request handler for Vercel's Node.js runtime that serves the
 * response using Remix.
 */
export function createRequestHandler({
  build,
  getLoadContext,
  mode = process.env.NODE_ENV,
}: {
  build: ServerBuild;
  getLoadContext?: GetLoadContextFunction;
  mode?: string;
}): RequestHandler {
  let handleRequest = createRemixRequestHandler(build, mode);

  return async (req, res) => {
    let request = createRemixRequest(req);
    let loadContext =
      typeof getLoadContext === "function"
        ? getLoadContext(req, res)
        : undefined;

    let response = await handleRequest(request, loadContext);

    sendRemixResponse(res, response as NodeResponse);
  };
}

export function createRemixHeaders(
  requestHeaders: VercelRequest["headers"]
): NodeHeaders {
  let headers = new NodeHeaders();
  for (let key in requestHeaders) {
    let header = requestHeaders[key]!;
    // set-cookie is an array (maybe others)
    if (Array.isArray(header)) {
      for (let value of header) {
        headers.append(key, value);
      }
    } else {
      headers.append(key, header);
    }
  }

  return headers;
}

export function createRemixRequest(req: VercelRequest): NodeRequest {
  let host = req.headers["x-forwarded-host"] || req.headers["host"];
  // doesn't seem to be available on their req object!
  let protocol = req.headers["x-forwarded-proto"] || "https";
  let url = new URL(req.url!, `${protocol}://${host}`);

  let init: NodeRequestInit = {
    method: req.method,
    headers: createRemixHeaders(req.headers),
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req;
  }

  return new NodeRequest(url.href, init);
}

export function sendRemixResponse(
  res: VercelResponse,
  nodeResponse: NodeResponse
): void {
  res.statusMessage = nodeResponse.statusText;
  let multiValueHeaders = nodeResponse.headers.raw();
  res.writeHead(
    nodeResponse.status,
    nodeResponse.statusText,
    multiValueHeaders
  );

  if (nodeResponse.body) {
    pipeReadableStreamToWritable(nodeResponse.body, res);
  } else {
    res.end();
  }
}
