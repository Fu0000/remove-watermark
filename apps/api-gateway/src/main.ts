import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { assertAdminRbacConfig } from "./common/admin-rbac";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  assertAdminRbacConfig();
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
  app.enableCors({
    origin: [
      "http://127.0.0.1:10086",
      "http://localhost:10086",
      "http://127.0.0.1:3000",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"]
  });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000, "0.0.0.0");
}

bootstrap();
