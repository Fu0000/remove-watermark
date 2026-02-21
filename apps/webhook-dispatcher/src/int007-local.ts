import assert from "node:assert/strict";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { PrismaClient, type Prisma } from "@prisma/client";
import { dispatchPendingEvents } from "./dispatcher";

interface ReceivedEvent {
  eventId: string;
  deliveryId: string;
  signature: string;
  timestamp: string;
  keyId: string;
}

interface ReceiverStats {
  totalRequests: number;
  verifiedRequests: number;
  invalidSignatureRequests: number;
  duplicateAccepted: number;
  sideEffectsApplied: number;
}

function buildId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function main() {
  const prisma = new PrismaClient();
  const userId = "u_1001";
  const taskId = buildId("tsk_int007");
  const eventId = buildId("evt_int007");
  const endpointId = buildId("wh_ep");
  const signingSecret = "int007_local_secret_k1";
  const signingKeyId = "k1";
  const processedEvents = new Set<string>();
  const firstAttemptFailedAfterProcess = new Set<string>();
  const receivedEvents: ReceivedEvent[] = [];

  const stats: ReceiverStats = {
    totalRequests: 0,
    verifiedRequests: 0,
    invalidSignatureRequests: 0,
    duplicateAccepted: 0,
    sideEffectsApplied: 0
  };

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      stats.totalRequests += 1;
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const signature = typeof req.headers["x-webhook-signature"] === "string" ? req.headers["x-webhook-signature"] : "";
      const timestamp = typeof req.headers["x-webhook-timestamp"] === "string" ? req.headers["x-webhook-timestamp"] : "";
      const keyId = typeof req.headers["x-webhook-key-id"] === "string" ? req.headers["x-webhook-key-id"] : "";
      const deliveryId = typeof req.headers["x-webhook-id"] === "string" ? req.headers["x-webhook-id"] : "";

      let parsed: { eventId?: string } = {};
      try {
        parsed = JSON.parse(rawBody) as { eventId?: string };
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, reason: "invalid_json" }));
        return;
      }

      const eventBodyId = parsed.eventId;
      if (!eventBodyId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, reason: "missing_event_id" }));
        return;
      }

      const timestampNumber = Number.parseInt(timestamp, 10);
      if (!Number.isInteger(timestampNumber) || Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) {
        stats.invalidSignatureRequests += 1;
        res.statusCode = 401;
        res.end(JSON.stringify({ ok: false, reason: "timestamp_out_of_window" }));
        return;
      }
      if (keyId !== signingKeyId) {
        stats.invalidSignatureRequests += 1;
        res.statusCode = 401;
        res.end(JSON.stringify({ ok: false, reason: "unexpected_key_id" }));
        return;
      }

      const expected = `v1=${createHmac("sha256", signingSecret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
      if (!safeCompare(signature, expected)) {
        stats.invalidSignatureRequests += 1;
        res.statusCode = 401;
        res.end(JSON.stringify({ ok: false, reason: "signature_mismatch" }));
        return;
      }
      stats.verifiedRequests += 1;
      receivedEvents.push({
        eventId: eventBodyId,
        deliveryId,
        signature,
        timestamp,
        keyId
      });

      // Simulate external system: first request already applies side effect but returns 5xx.
      if (!processedEvents.has(eventBodyId)) {
        processedEvents.add(eventBodyId);
        stats.sideEffectsApplied += 1;
      } else {
        stats.duplicateAccepted += 1;
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, deduped: true }));
        return;
      }

      if (!firstAttemptFailedAfterProcess.has(eventBodyId)) {
        firstAttemptFailedAfterProcess.add(eventBodyId);
        res.statusCode = 503;
        res.end(JSON.stringify({ ok: false, reason: "post_process_failure" }));
        return;
      }

      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind verifier server");
  }
  const endpointUrl = `http://127.0.0.1:${address.port}/external/webhook`;

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

    await prisma.webhookEndpoint.create({
      data: {
        endpointId,
        userId,
        name: "int007-local-endpoint",
        url: endpointUrl,
        status: "ACTIVE",
        eventsJson: ["task.succeeded"] as unknown as Prisma.InputJsonValue,
        timeoutMs: 5000,
        maxRetries: 2,
        activeKeyId: signingKeyId,
        secretJson: {
          [signingKeyId]: signingSecret
        } as unknown as Prisma.InputJsonValue,
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

    let outboxStatus: string | undefined;
    for (let index = 0; index < 50; index += 1) {
      await dispatchPendingEvents(prisma, {
        batchSize: 100,
        retryScheduleMs: [100, 200, 500],
        defaultTimeoutMs: 3000
      });

      const outbox = await prisma.outboxEvent.findUnique({
        where: { eventId },
        select: { status: true }
      });
      outboxStatus = outbox?.status;
      if (outboxStatus === "PUBLISHED") {
        break;
      }
      await sleep(120);
    }

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { eventId, endpointId },
      orderBy: [{ attempt: "asc" }]
    });

    assert.equal(outboxStatus, "PUBLISHED", "outbox event should eventually be published");
    assert.equal(stats.invalidSignatureRequests, 0, "no invalid signature should be observed");
    assert.equal(stats.verifiedRequests >= 2, true, "should have at least two verified webhook requests");
    assert.equal(stats.sideEffectsApplied, 1, "external side-effect must be applied exactly once");
    assert.equal(stats.duplicateAccepted >= 1, true, "retry should be accepted as deduplicated request");
    assert.equal(receivedEvents.every((item) => item.eventId === eventId), true, "all received events should share same eventId");
    assert.equal(new Set(receivedEvents.map((item) => item.deliveryId)).size >= 2, true, "retry should produce new deliveryId");
    assert.equal(deliveries.length >= 2, true, "delivery records should include retry attempts");
    assert.equal(deliveries.some((item) => item.attempt === 1 && item.status === "FAILED"), true, "attempt=1 should fail");
    assert.equal(deliveries.some((item) => item.attempt === 2 && item.status === "SUCCESS"), true, "attempt=2 should succeed");

    console.log("[int007-local] external signature validation passed");
    console.log(
      JSON.stringify(
        {
          eventId,
          endpointId,
          outboxStatus,
          stats,
          deliveries: deliveries.map((item) => ({
            deliveryId: item.deliveryId,
            attempt: item.attempt,
            status: item.status,
            responseStatus: item.responseStatus
          }))
        },
        null,
        2
      )
    );
  } finally {
    server.close();
    await prisma.webhookDelivery.deleteMany({ where: { eventId, endpointId } });
    await prisma.outboxEvent.deleteMany({ where: { eventId } });
    await prisma.webhookEndpoint.deleteMany({ where: { endpointId } });
    await prisma.task.deleteMany({ where: { taskId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[int007-local] failed", error);
  process.exit(1);
});
