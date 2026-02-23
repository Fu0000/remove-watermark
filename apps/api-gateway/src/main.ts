import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { assertAdminRbacConfig } from "./common/admin-rbac";
import { beginApiRequest, createApiMetricsState, endApiRequest, observeApiRequest, renderPrometheusMetrics } from "./metrics";
import { AppModule } from "./modules/app.module";

const METRICS_SKIP_PATHS = new Set(["/metrics", "/healthz"]);

function stripQueryString(url: string) {
  const queryIndex = url.indexOf("?");
  if (queryIndex < 0) {
    return url || "/";
  }
  const path = url.slice(0, queryIndex);
  return path.length > 0 ? path : "/";
}

function shouldSkipMetrics(url: string | undefined) {
  if (!url) {
    return false;
  }
  const path = stripQueryString(url);
  return METRICS_SKIP_PATHS.has(path);
}

function resolveRouteLabel(request: any) {
  const routeFromRouter = request?.routeOptions?.url ?? request?.routerPath;
  if (typeof routeFromRouter === "string" && routeFromRouter.trim().length > 0) {
    return routeFromRouter;
  }
  return stripQueryString(request?.raw?.url || "/");
}

function resolveMethod(request: any) {
  if (typeof request?.method === "string") {
    return request.method;
  }
  if (typeof request?.raw?.method === "string") {
    return request.raw.method;
  }
  return "UNKNOWN";
}

async function bootstrap() {
  assertAdminRbacConfig();
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
  const adapter = app.getHttpAdapter();
  const fastify = adapter.getInstance();
  const metricsState = createApiMetricsState();
  const requestStartedAt = new WeakMap<object, number>();

  fastify.addHook("onRequest", (request: any, _reply: any, done: () => void) => {
    if (shouldSkipMetrics(request?.raw?.url)) {
      done();
      return;
    }
    beginApiRequest(metricsState);
    if (request?.raw && typeof request.raw === "object") {
      requestStartedAt.set(request.raw, Date.now());
    }
    done();
  });

  fastify.addHook("onResponse", (request: any, reply: any, done: () => void) => {
    if (shouldSkipMetrics(request?.raw?.url)) {
      done();
      return;
    }

    const startedAt =
      request?.raw && typeof request.raw === "object" ? requestStartedAt.get(request.raw) || Date.now() : Date.now();
    endApiRequest(metricsState);
    observeApiRequest(metricsState, {
      method: resolveMethod(request),
      route: resolveRouteLabel(request),
      statusCode: Number(reply?.statusCode || 0),
      durationMs: Date.now() - startedAt
    });
    done();
  });

  fastify.get("/healthz", async (_request: any, reply: any) => {
    reply.header("content-type", "application/json; charset=utf-8");
    return { status: "ok" };
  });

  fastify.get("/metrics", async (_request: any, reply: any) => {
    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
    return renderPrometheusMetrics(metricsState);
  });

  const exactAllowlist = new Set([
    "http://127.0.0.1:10086",
    "http://localhost:10086",
    "http://127.0.0.1:10087",
    "http://localhost:10087",
    "http://127.0.0.1:3000",
    "http://localhost:3000"
  ]);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => {
      // Non-browser clients (curl/scripts) do not carry Origin.
      if (!origin) {
        callback(null, true);
        return;
      }

      const localDevOriginPattern =
        /^http:\/\/(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;
      if (exactAllowlist.has(origin) || localDevOriginPattern.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin denied: ${origin}`), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"]
  });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000, "0.0.0.0");
}

bootstrap();
