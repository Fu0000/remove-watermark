import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { assertAdminRbacConfig } from "./common/admin-rbac";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  assertAdminRbacConfig();
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
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
