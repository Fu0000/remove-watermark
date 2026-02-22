import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { assertAdminRbacConfig } from "./common/admin-rbac";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  assertAdminRbacConfig();
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000, "0.0.0.0");
}

bootstrap();
