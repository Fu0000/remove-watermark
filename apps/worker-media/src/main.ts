import { createLogger, readEnv } from "@packages/shared";

const appName = "worker-media";
const logger = createLogger(appName);

async function bootstrap() {
  const env = readEnv("NODE_ENV", "dev");
  const queueName = readEnv("QUEUE_NAME", appName);

  logger.info({ env, queueName }, "service initialized");
}

bootstrap().catch((error) => {
  logger.error({ error }, "service startup failed");
  process.exit(1);
});
