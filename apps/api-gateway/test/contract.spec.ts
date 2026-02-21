import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/modules/app.module";

async function setup(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
  await app.init();
  const server = app.getHttpAdapter().getInstance();
  await server.ready();
  return app;
}

test("GET /v1/system/capabilities should return defaults", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const response = await server.inject({
    method: "GET",
    url: "/v1/system/capabilities",
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "req_contract_1"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.code, 0);
  assert.equal(body.requestId, "req_contract_1");
  assert.equal(body.data.defaults.imagePolicy, "FAST");

  await app.close();
});

test("POST /v1/tasks should require Idempotency-Key", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const response = await server.inject({
    method: "POST",
    url: "/v1/tasks",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    payload: {
      assetId: "ast_1001",
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.code, 40001);

  await app.close();
});

test("POST /v1/tasks should be idempotent for same key and payload", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const headers = {
    authorization: "Bearer test-token",
    "idempotency-key": "idem_contract_1",
    "content-type": "application/json"
  };

  const first = await server.inject({
    method: "POST",
    url: "/v1/tasks",
    headers,
    payload: {
      assetId: "ast_2001",
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  const second = await server.inject({
    method: "POST",
    url: "/v1/tasks",
    headers,
    payload: {
      assetId: "ast_2001",
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json().data.taskId, second.json().data.taskId);

  await app.close();
});

test("tasks list/detail/cancel should work with authorization", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const create = await server.inject({
    method: "POST",
    url: "/v1/tasks",
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_2",
      "content-type": "application/json"
    },
    payload: {
      assetId: "ast_3001",
      mediaType: "IMAGE"
    }
  });

  const taskId = create.json().data.taskId as string;

  const list = await server.inject({
    method: "GET",
    url: "/v1/tasks",
    headers: {
      authorization: "Bearer test-token"
    }
  });

  assert.equal(list.statusCode, 200);
  assert.equal(list.json().data.total >= 1, true);

  const detail = await server.inject({
    method: "GET",
    url: `/v1/tasks/${taskId}`,
    headers: {
      authorization: "Bearer test-token"
    }
  });

  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().data.taskId, taskId);

  const cancel = await server.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/cancel`,
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_3"
    }
  });

  assert.equal(cancel.statusCode, 200);
  assert.equal(cancel.json().data.status, "CANCELED");

  await app.close();
});

test("POST /v1/assets/upload-policy should return signed payload envelope", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const response = await server.inject({
    method: "POST",
    url: "/v1/assets/upload-policy",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    payload: {
      fileName: "demo.png",
      fileSize: 1024,
      mediaType: "image",
      mimeType: "image/png",
      sha256: "abcd"
    }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.equal(body.code, 0);
  assert.equal(typeof body.data.assetId, "string");
  assert.equal(typeof body.data.expireAt, "string");

  await app.close();
});

test("POST /v1/tasks/{taskId}/mask should update version", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const create = await server.inject({
    method: "POST",
    url: "/v1/tasks",
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_mask_create",
      "content-type": "application/json"
    },
    payload: {
      assetId: "ast_mask_1001",
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  const taskId = create.json().data.taskId as string;

  const firstMask = await server.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/mask`,
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_mask_1",
      "content-type": "application/json"
    },
    payload: {
      imageWidth: 1920,
      imageHeight: 1080,
      polygons: [
        [
          [100, 100],
          [200, 100],
          [200, 200],
          [100, 200]
        ]
      ],
      brushStrokes: [],
      version: 0
    }
  });

  assert.equal(firstMask.statusCode, 200);
  assert.equal(firstMask.json().data.version, 1);

  const secondMask = await server.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/mask`,
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_mask_2",
      "content-type": "application/json"
    },
    payload: {
      imageWidth: 1920,
      imageHeight: 1080,
      polygons: [
        [
          [120, 120],
          [220, 120],
          [220, 220],
          [120, 220]
        ]
      ],
      brushStrokes: [],
      version: 1
    }
  });

  assert.equal(secondMask.statusCode, 200);
  assert.equal(secondMask.json().data.version, 2);

  await app.close();
});

test("GET /v1/tasks/{taskId}/result should return url after processing", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const create = await server.inject({
    method: "POST",
    url: "/v1/tasks",
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_result_create",
      "content-type": "application/json"
    },
    payload: {
      assetId: "ast_result_1001",
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  const taskId = create.json().data.taskId as string;

  const mask = await server.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/mask`,
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_result_mask",
      "content-type": "application/json"
    },
    payload: {
      imageWidth: 1280,
      imageHeight: 720,
      polygons: [
        [
          [20, 20],
          [80, 20],
          [80, 80],
          [20, 80]
        ]
      ],
      brushStrokes: [],
      version: 0
    }
  });

  assert.equal(mask.statusCode, 200);

  let status = "PREPROCESSING";
  for (let i = 0; i < 6; i += 1) {
    const detail = await server.inject({
      method: "GET",
      url: `/v1/tasks/${taskId}`,
      headers: {
        authorization: "Bearer test-token"
      }
    });

    status = detail.json().data.status as string;
    if (status === "SUCCEEDED") {
      break;
    }
  }

  assert.equal(status, "SUCCEEDED");

  const result = await server.inject({
    method: "GET",
    url: `/v1/tasks/${taskId}/result`,
    headers: {
      authorization: "Bearer test-token"
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(typeof result.json().data.resultUrl, "string");
  assert.equal(typeof result.json().data.expireAt, "string");

  await app.close();
});
