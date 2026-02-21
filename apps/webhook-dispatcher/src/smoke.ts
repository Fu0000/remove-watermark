import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient, type Prisma } from "@prisma/client";
import { dispatchPendingEvents } from "./dispatcher";

function buildId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

async function main() {
  const prisma = new PrismaClient();
  const requests: Array<{ headers: Record<string, string>; body: string }> = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") {
          headers[key] = value;
        }
      }
      requests.push({
        headers,
        body: Buffer.concat(chunks).toString("utf8")
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind local webhook server");
  }
  const endpointUrl = `http://127.0.0.1:${address.port}/webhook`;

  const taskId = buildId("tsk_smoke");
  const eventId = buildId("evt_smoke");
  const endpointId = buildId("wh_ep");
  const userId = buildId("u_smoke");

  try {
    await prisma.task.create({
      data: {
        taskId,
        userId,
        assetId: buildId("ast"),
        mediaType: "image",
        taskPolicy: "FAST",
        status: "SUCCEEDED",
        progress: 100,
        version: 1,
        resultUrl: `https://minio.local/result/${taskId}.png`,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    await prisma.outboxEvent.create({
      data: {
        eventId,
        eventType: "task.succeeded",
        aggregateType: "task",
        aggregateId: taskId,
        status: "PENDING",
        retryCount: 0,
        createdAt: new Date()
      }
    });

    await prisma.webhookEndpoint.create({
      data: {
        endpointId,
        userId,
        name: "smoke-endpoint",
        url: endpointUrl,
        status: "ACTIVE",
        eventsJson: ["task.succeeded"] as unknown as Prisma.InputJsonValue,
        timeoutMs: 5000,
        maxRetries: 2,
        activeKeyId: "k1",
        secretJson: {
          k1: "smoke_secret_k1"
        } as unknown as Prisma.InputJsonValue,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    let attempts = 0;
    let outbox = await prisma.outboxEvent.findUnique({
      where: { eventId },
      select: {
        status: true,
        retryCount: true
      }
    });
    let lastBatchResult = {
      scanned: 0,
      published: 0,
      deliveriesCreated: 0
    };

    while (attempts < 20 && outbox?.status === "PENDING") {
      const result = await dispatchPendingEvents(prisma, {
        batchSize: 20,
        retryScheduleMs: [1000, 2000, 4000],
        defaultTimeoutMs: 3000
      });
      lastBatchResult = {
        scanned: result.scanned,
        published: result.published,
        deliveriesCreated: result.deliveriesCreated
      };
      outbox = await prisma.outboxEvent.findUnique({
        where: { eventId },
        select: {
          status: true,
          retryCount: true
        }
      });
      attempts += 1;
      if (outbox?.status === "PENDING") {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { eventId },
      orderBy: [{ attempt: "asc" }]
    });

    assert.equal(outbox?.status, "PUBLISHED");
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, "SUCCESS");
    assert.equal(deliveries[0].responseStatus, 200);
    const matchedRequest = requests.find((item) => item.headers["x-webhook-id"] === deliveries[0].deliveryId);
    assert.equal(Boolean(matchedRequest), true);
    assert.equal(/^v1=[a-f0-9]{64}$/.test(matchedRequest?.headers["x-webhook-signature"] || ""), true);
    assert.equal(matchedRequest?.headers["x-webhook-key-id"], "k1");

    console.log("[webhook-smoke] dispatch flow passed");
    console.log(
      JSON.stringify(
        {
          scanned: lastBatchResult.scanned,
          published: lastBatchResult.published,
          deliveriesCreated: lastBatchResult.deliveriesCreated,
          loopAttempts: attempts,
          outboxStatus: outbox?.status,
          deliveryId: deliveries[0].deliveryId
        },
        null,
        2
      )
    );
  } finally {
    server.close();
    await prisma.webhookDelivery.deleteMany({ where: { eventId } });
    await prisma.webhookEndpoint.deleteMany({ where: { endpointId } });
    await prisma.outboxEvent.deleteMany({ where: { eventId } });
    await prisma.task.deleteMany({ where: { taskId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[webhook-smoke] failed", error);
  process.exit(1);
});
