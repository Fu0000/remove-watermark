import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { processQueueJob, prisma, type RetryPolicyOptions, type WorkerRuntimeOptions } from "../src/main.ts";

type MutableTask = {
  taskId: string;
  userId: string;
  assetId: string;
  mediaType: "IMAGE" | "VIDEO" | "PDF" | "PPT";
  status: "QUEUED" | "PREPROCESSING" | "DETECTING" | "INPAINTING" | "PACKAGING" | "SUCCEEDED" | "FAILED";
  progress: number;
  version: number;
  resultUrl: string | null;
  resultJson: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: Date;
};

type TestStore = {
  task: MutableTask | null;
  region: unknown | null;
  mask: unknown | null;
  usageLedger: Array<Record<string, unknown>>;
  outboxEvents: Array<Record<string, unknown>>;
};

type FetchCall = {
  url: string;
  path: string;
  body: Record<string, unknown>;
};

class MockQueue {
  public adds: Array<{ name: string; data: Record<string, unknown>; options: Record<string, unknown> }> = [];

  async add(name: string, data: Record<string, unknown>, options: Record<string, unknown>) {
    this.adds.push({ name, data, options });
    return {} as unknown;
  }
}

const runtime: WorkerRuntimeOptions = {
  stepDelayMs: 0,
  waitMaskDelayMs: 1,
  maxStepIterations: 16,
  followupDelayMs: 1,
  inferenceGatewayUrl: "http://inference.local",
  inferenceSharedToken: "test-token",
  resultExpireDays: 7,
  assetSourceMode: "minio",
  minioAssetBucket: "assets"
};

const retryPolicy: RetryPolicyOptions = {
  maxRetries: 2,
  baseDelayMs: 10,
  jitterRatio: 0
};

const originals = {
  transaction: prisma.$transaction,
  taskFindUnique: prisma.task.findUnique,
  taskUpdateMany: prisma.task.updateMany,
  taskRegionFindUnique: prisma.taskRegion.findUnique,
  taskMaskFindUnique: prisma.taskMask.findUnique,
  usageCreateMany: prisma.usageLedger.createMany,
  outboxCreate: prisma.outboxEvent.create
};

const originalFetch = globalThis.fetch;

let store: TestStore;
let inferenceCalls: FetchCall[];

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function installPrismaMock() {
  (prisma as unknown as { $transaction: (arg: unknown) => Promise<unknown> }).$transaction = async (
    arg: unknown
  ) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof prisma) => unknown)(prisma);
    }
    return arg;
  };

  (prisma.task as unknown as { findUnique: (args: unknown) => Promise<unknown> }).findUnique = async (
    args: unknown
  ) => {
    const where = (args as { where?: { taskId?: string } }).where;
    if (!store.task || where?.taskId !== store.task.taskId) {
      return null;
    }
    return deepClone(store.task);
  };

  (prisma.task as unknown as { updateMany: (args: unknown) => Promise<{ count: number }> }).updateMany = async (
    args: unknown
  ) => {
    if (!store.task) {
      return { count: 0 };
    }

    const { where, data } = args as {
      where?: { taskId?: string; version?: number; status?: string };
      data?: Record<string, unknown>;
    };

    if (where?.taskId && where.taskId !== store.task.taskId) {
      return { count: 0 };
    }
    if (typeof where?.version === "number" && where.version !== store.task.version) {
      return { count: 0 };
    }
    if (typeof where?.status === "string" && where.status !== store.task.status) {
      return { count: 0 };
    }

    if (typeof data?.status === "string") {
      store.task.status = data.status as MutableTask["status"];
    }
    if (typeof data?.progress === "number") {
      store.task.progress = data.progress;
    }
    if ("resultUrl" in (data || {})) {
      store.task.resultUrl = (data?.resultUrl as string | null | undefined) ?? null;
    }
    if ("resultJson" in (data || {})) {
      store.task.resultJson = (data?.resultJson as unknown) ?? null;
    }
    if ("errorCode" in (data || {})) {
      store.task.errorCode = (data?.errorCode as string | null | undefined) ?? null;
    }
    if ("errorMessage" in (data || {})) {
      store.task.errorMessage = (data?.errorMessage as string | null | undefined) ?? null;
    }

    const versionData = data?.version as { increment?: number } | undefined;
    if (typeof versionData?.increment === "number") {
      store.task.version += versionData.increment;
    }

    store.task.updatedAt = new Date();
    return { count: 1 };
  };

  (prisma.taskRegion as unknown as { findUnique: (args: unknown) => Promise<unknown> }).findUnique = async (
    args: unknown
  ) => {
    const where = (args as { where?: { taskId?: string } }).where;
    if (!store.region || where?.taskId !== store.task?.taskId) {
      return null;
    }
    return {
      taskId: store.task?.taskId,
      regionsJson: deepClone(store.region)
    };
  };

  (prisma.taskMask as unknown as { findUnique: (args: unknown) => Promise<unknown> }).findUnique = async (
    args: unknown
  ) => {
    const where = (args as { where?: { taskId?: string } }).where;
    if (!store.mask || where?.taskId !== store.task?.taskId) {
      return null;
    }
    return {
      taskId: store.task?.taskId,
      polygons: [],
      brushStrokes: []
    };
  };

  (prisma.usageLedger as unknown as { createMany: (args: unknown) => Promise<unknown> }).createMany = async (
    args: unknown
  ) => {
    const data = (args as { data?: Array<Record<string, unknown>> }).data || [];
    store.usageLedger.push(...deepClone(data));
    return { count: data.length };
  };

  (prisma.outboxEvent as unknown as { create: (args: unknown) => Promise<unknown> }).create = async (
    args: unknown
  ) => {
    const data = (args as { data?: Record<string, unknown> }).data || {};
    store.outboxEvents.push(deepClone(data));
    return data;
  };
}

function restorePrismaMock() {
  prisma.$transaction = originals.transaction;
  prisma.task.findUnique = originals.taskFindUnique;
  prisma.task.updateMany = originals.taskUpdateMany;
  prisma.taskRegion.findUnique = originals.taskRegionFindUnique;
  prisma.taskMask.findUnique = originals.taskMaskFindUnique;
  prisma.usageLedger.createMany = originals.usageCreateMany;
  prisma.outboxEvent.create = originals.outboxCreate;
}

function createFetchResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function installFetchMock(
  handler: (call: FetchCall) => Promise<Response> | Response
) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const rawUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const payload =
      init?.body && typeof init.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    const call: FetchCall = {
      url: rawUrl,
      path: new URL(rawUrl).pathname,
      body: payload
    };
    inferenceCalls.push(call);
    return handler(call);
  }) as typeof fetch;
}

function seedTask(partial: Partial<MutableTask> = {}): MutableTask {
  return {
    taskId: "task_demo",
    userId: "u_1001",
    assetId: "asset_1001",
    mediaType: "IMAGE",
    status: "QUEUED",
    progress: 5,
    version: 1,
    resultUrl: null,
    resultJson: null,
    errorCode: null,
    errorMessage: null,
    updatedAt: new Date(),
    ...partial
  };
}

describe("worker orchestrator integration (mock inference)", () => {
  beforeEach(() => {
    store = {
      task: seedTask(),
      region: { regions: [{ box_2d: [0.1, 0.1, 0.4, 0.4] }] },
      mask: null,
      usageLedger: [],
      outboxEvents: []
    };
    inferenceCalls = [];
    installPrismaMock();
  });

  afterEach(() => {
    restorePrismaMock();
    globalThis.fetch = originalFetch;
  });

  it("completes IMAGE pipeline", async () => {
    store.task = seedTask({ mediaType: "IMAGE", status: "QUEUED" });
    installFetchMock(async (call) => {
      if (call.path === "/internal/inpaint/image") {
        return createFetchResponse(200, { outputUrl: "https://minio.local/result/image-final.png" });
      }
      return createFetchResponse(200, {});
    });

    const queue = new MockQueue();
    await processQueueJob(queue as never, store.task.taskId, runtime, retryPolicy);

    assert.equal(store.task?.status, "SUCCEEDED");
    assert.equal(store.task?.resultUrl, "https://minio.local/result/image-final.png");
    const artifacts = (store.task?.resultJson as { artifacts?: Array<{ type?: string }> })?.artifacts || [];
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0]?.type, "IMAGE");
    assert.equal(store.outboxEvents.some((event) => event.eventType === "task.succeeded"), true);
  });

  it("completes VIDEO pipeline", async () => {
    store.task = seedTask({ mediaType: "VIDEO", status: "QUEUED" });
    installFetchMock(async (call) => {
      if (call.path === "/internal/inpaint/video") {
        return createFetchResponse(200, { outputUrl: "https://minio.local/result/video-final.mp4" });
      }
      return createFetchResponse(200, {});
    });

    const queue = new MockQueue();
    await processQueueJob(queue as never, store.task.taskId, runtime, retryPolicy);

    assert.equal(store.task?.status, "SUCCEEDED");
    assert.equal(store.task?.resultUrl, "https://minio.local/result/video-final.mp4");
    const artifacts = (store.task?.resultJson as { artifacts?: Array<{ type?: string }> })?.artifacts || [];
    assert.equal(artifacts[0]?.type, "VIDEO");
  });

  it("completes PDF pipeline and packages PDF+ZIP artifacts", async () => {
    store.task = seedTask({ mediaType: "PDF", status: "QUEUED" });
    installFetchMock(async (call) => {
      if (call.path === "/internal/doc/inpaint-pages") {
        return createFetchResponse(200, { outputUrl: "https://minio.local/result/pdf-page.png" });
      }
      if (call.path === "/internal/doc/package") {
        return createFetchResponse(200, {
          pdfUrl: "https://minio.local/result/pdf-final.pdf",
          zipUrl: "https://minio.local/result/pdf-pages.zip"
        });
      }
      return createFetchResponse(200, {});
    });

    const queue = new MockQueue();
    await processQueueJob(queue as never, store.task.taskId, runtime, retryPolicy);

    assert.equal(store.task?.status, "SUCCEEDED");
    assert.equal(store.task?.resultUrl, "https://minio.local/result/pdf-final.pdf");
    const artifacts =
      (store.task?.resultJson as { artifacts?: Array<{ type?: string; url?: string }> })?.artifacts || [];
    assert.equal(artifacts.length, 2);
    assert.equal(artifacts[0]?.type, "PDF");
    assert.equal(artifacts[1]?.type, "ZIP");
    assert.equal(inferenceCalls.some((call) => call.path === "/internal/doc/render-pdf"), true);
  });

  it("waits in DETECTING when regions are missing and resumes after regions are provided", async () => {
    store.task = seedTask({ mediaType: "VIDEO", status: "DETECTING", progress: 35 });
    store.region = null;

    installFetchMock(async (call) => {
      if (call.path === "/internal/inpaint/video") {
        return createFetchResponse(200, { outputUrl: "https://minio.local/result/video-recovered.mp4" });
      }
      return createFetchResponse(200, {});
    });

    const queue = new MockQueue();
    await processQueueJob(queue as never, store.task.taskId, runtime, retryPolicy);

    assert.equal(store.task?.status, "DETECTING");
    assert.equal(queue.adds.length, 1);
    assert.equal(queue.adds[0]?.data.reason, "followup");

    store.region = { regions: [{ frameIndex: 1, box_2d: [0.2, 0.2, 0.3, 0.3] }] };
    queue.adds.length = 0;

    await processQueueJob(queue as never, store.task.taskId, runtime, retryPolicy);
    assert.equal(store.task?.status, "SUCCEEDED");
    assert.equal(queue.adds.length, 0);
  });

  it("marks task FAILED when PPT preprocessing returns non-retryable error", async () => {
    store.task = seedTask({ mediaType: "PPT", status: "QUEUED" });
    installFetchMock(async (call) => {
      if (call.path === "/internal/doc/ppt-to-pdf") {
        return createFetchResponse(422, { code: "DOC_CONVERT_FAILED" });
      }
      return createFetchResponse(200, {});
    });

    const queue = new MockQueue();
    await processQueueJob(queue as never, store.task.taskId, runtime, retryPolicy);

    assert.equal(store.task?.status, "FAILED");
    assert.equal(store.task?.errorCode, "50021");
    assert.equal(store.usageLedger.some((item) => item.status === "RELEASED"), true);
    assert.equal(store.outboxEvents.some((event) => event.eventType === "task.failed"), true);
  });

  it("throws retryable error on inference timeout and keeps task non-terminal", async () => {
    store.task = seedTask({ mediaType: "VIDEO", status: "INPAINTING", progress: 60 });
    installFetchMock(async (call) => {
      if (call.path === "/internal/inpaint/video") {
        throw new Error("timeout");
      }
      return createFetchResponse(200, {});
    });

    const queue = new MockQueue();
    await assert.rejects(() =>
      processQueueJob(queue as never, store.task?.taskId || "task_demo", runtime, retryPolicy)
    );
    assert.equal(store.task?.status, "INPAINTING");
  });
});
