import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/modules/app.module";
import { TasksService } from "../src/modules/tasks/tasks.service";

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

test("GET /v1/plans should return sorted plans list", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const response = await server.inject({
    method: "GET",
    url: "/v1/plans",
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "req_contract_plans_1"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.code, 0);
  assert.equal(body.requestId, "req_contract_plans_1");
  assert.equal(Array.isArray(body.data), true);
  assert.equal(body.data.length >= 3, true);
  assert.equal(body.data[0].planId, "free");
  assert.equal(typeof body.data[0].sortOrder, "number");
  assert.equal(body.data[0].sortOrder <= body.data[1].sortOrder, true);

  await app.close();
});

test("POST /v1/subscriptions/checkout should return order and payment payload", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const response = await server.inject({
    method: "POST",
    url: "/v1/subscriptions/checkout",
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "req_contract_sub_checkout_1",
      "content-type": "application/json"
    },
    payload: {
      planId: "pro_month",
      channel: "wechat_pay",
      clientReturnUrl: "https://app.example.com/pay/result"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.code, 0);
  assert.equal(body.requestId, "req_contract_sub_checkout_1");
  assert.equal(typeof body.data.orderId, "string");
  assert.equal(body.data.orderId.startsWith("ord_"), true);
  assert.equal(typeof body.data.paymentPayload.nonceStr, "string");
  assert.equal(typeof body.data.paymentPayload.timeStamp, "string");
  assert.equal(typeof body.data.paymentPayload.sign, "string");

  await app.close();
});

test("GET /v1/subscriptions/me should return current subscription", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const response = await server.inject({
    method: "GET",
    url: "/v1/subscriptions/me",
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "req_contract_sub_me_1"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.code, 0);
  assert.equal(body.requestId, "req_contract_sub_me_1");
  assert.equal(typeof body.data.status, "string");
  assert.equal(typeof body.data.planId, "string");
  assert.equal(typeof body.data.autoRenew, "boolean");

  await app.close();
});

test("POST /v1/subscriptions/mock-confirm should activate pending subscription", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const checkout = await server.inject({
    method: "POST",
    url: "/v1/subscriptions/checkout",
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "req_contract_sub_confirm_checkout_1",
      "content-type": "application/json"
    },
    payload: {
      planId: "pro_month",
      channel: "wechat_pay",
      clientReturnUrl: "https://app.example.com/pay/result"
    }
  });
  assert.equal(checkout.statusCode, 200);
  const orderId = checkout.json().data.orderId as string;

  const confirm = await server.inject({
    method: "POST",
    url: "/v1/subscriptions/mock-confirm",
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "req_contract_sub_confirm_1",
      "content-type": "application/json"
    },
    payload: {
      orderId
    }
  });

  assert.equal(confirm.statusCode, 200);
  const confirmBody = confirm.json();
  assert.equal(confirmBody.code, 0);
  assert.equal(confirmBody.data.status, "ACTIVE");
  assert.equal(confirmBody.data.planId, "pro_month");
  assert.equal(typeof confirmBody.data.effectiveAt, "string");

  const mine = await server.inject({
    method: "GET",
    url: "/v1/subscriptions/me",
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "req_contract_sub_confirm_me_1"
    }
  });
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.json().data.status, "ACTIVE");

  await app.close();
});

test("GET /v1/usage/me should return usage summary", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const response = await server.inject({
    method: "GET",
    url: "/v1/usage/me",
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "req_contract_usage_me_1"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.code, 0);
  assert.equal(body.requestId, "req_contract_usage_me_1");
  assert.equal(typeof body.data.quotaTotal, "number");
  assert.equal(typeof body.data.quotaLeft, "number");
  assert.equal(typeof body.data.periodStart, "string");
  assert.equal(typeof body.data.periodEnd, "string");
  assert.equal(Array.isArray(body.data.ledgerItems), true);

  await app.close();
});

test("POST /v1/tasks should return 40302 when free quota is exceeded", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  for (let index = 0; index < 20; index += 1) {
    const response = await server.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: {
        authorization: "Bearer test-token",
        "idempotency-key": `idem_contract_quota_${index}`,
        "content-type": "application/json"
      },
      payload: {
        assetId: `ast_quota_${index}`,
        mediaType: "IMAGE",
        taskPolicy: "FAST"
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().code, 0);
  }

  const overflow = await server.inject({
    method: "POST",
    url: "/v1/tasks",
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_quota_overflow",
      "content-type": "application/json"
    },
    payload: {
      assetId: "ast_quota_overflow",
      mediaType: "IMAGE",
      taskPolicy: "FAST"
    }
  });

  assert.equal(overflow.statusCode, 403);
  assert.equal(overflow.json().code, 40302);

  await app.close();
});

test("webhook endpoints should support create/list/update/delete", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const create = await server.inject({
    method: "POST",
    url: "/v1/webhooks/endpoints",
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "req_contract_webhook_create_1",
      "content-type": "application/json"
    },
    payload: {
      name: "primary-prod",
      url: "https://client.example.com/callback",
      events: ["task.succeeded", "task.failed"],
      timeoutMs: 5000,
      maxRetries: 6
    }
  });
  assert.equal(create.statusCode, 200);
  assert.equal(create.json().code, 0);
  assert.equal(create.json().data.status, "ACTIVE");
  assert.equal(typeof create.json().data.endpointId, "string");
  const endpointId = create.json().data.endpointId as string;

  const list = await server.inject({
    method: "GET",
    url: "/v1/webhooks/endpoints",
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().code, 0);
  assert.equal(list.json().data.some((item: { endpointId: string }) => item.endpointId === endpointId), true);

  const patch = await server.inject({
    method: "PATCH",
    url: `/v1/webhooks/endpoints/${endpointId}`,
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    payload: {
      status: "PAUSED",
      timeoutMs: 6000
    }
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().data.status, "PAUSED");
  assert.equal(patch.json().data.timeoutMs, 6000);

  const deleted = await server.inject({
    method: "DELETE",
    url: `/v1/webhooks/endpoints/${endpointId}`,
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.json().data.status, "DELETED");

  const listAfterDelete = await server.inject({
    method: "GET",
    url: "/v1/webhooks/endpoints",
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(listAfterDelete.statusCode, 200);
  assert.equal(listAfterDelete.json().data.some((item: { endpointId: string }) => item.endpointId === endpointId), false);

  await app.close();
});

test("webhook deliveries should support test dispatch and retry", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const create = await server.inject({
    method: "POST",
    url: "/v1/webhooks/endpoints",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    payload: {
      name: "failing-endpoint",
      url: "https://client.example.com/fail",
      events: ["task.failed"],
      timeoutMs: 5000,
      maxRetries: 2
    }
  });
  assert.equal(create.statusCode, 200);
  const endpointId = create.json().data.endpointId as string;

  const testDelivery = await server.inject({
    method: "POST",
    url: `/v1/webhooks/endpoints/${endpointId}/test`,
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(testDelivery.statusCode, 200);
  const deliveryId = testDelivery.json().data.deliveryId as string;
  assert.equal(typeof deliveryId, "string");

  const failedList = await server.inject({
    method: "GET",
    url: `/v1/webhooks/deliveries?endpointId=${endpointId}&status=FAILED&page=1&pageSize=10`,
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(failedList.statusCode, 200);
  assert.equal(failedList.json().data.total >= 1, true);
  const failedItem = failedList
    .json()
    .data.items.find((item: { deliveryId: string }) => item.deliveryId === deliveryId) as
    | {
        deliveryId: string;
        requestHeaders: Record<string, string>;
        signatureValidated: boolean;
        failureCode?: string;
      }
    | undefined;
  assert.equal(Boolean(failedItem), true);
  assert.equal(failedItem?.requestHeaders["X-Webhook-Id"], deliveryId);
  assert.equal(typeof failedItem?.requestHeaders["X-Webhook-Timestamp"], "string");
  assert.equal(/^v1=[a-f0-9]{64}$/.test(failedItem?.requestHeaders["X-Webhook-Signature"] || ""), true);
  assert.equal(typeof failedItem?.requestHeaders["X-Webhook-Key-Id"], "string");
  assert.equal(failedItem?.signatureValidated, true);
  assert.equal(failedItem?.failureCode, "SIMULATED_DISPATCH_FAILURE");

  const patch = await server.inject({
    method: "PATCH",
    url: `/v1/webhooks/endpoints/${endpointId}`,
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    payload: {
      url: "https://client.example.com/callback",
      status: "ACTIVE"
    }
  });
  assert.equal(patch.statusCode, 200);

  const retry = await server.inject({
    method: "POST",
    url: `/v1/webhooks/deliveries/${deliveryId}/retry`,
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(retry.statusCode, 200);
  const retriedDeliveryId = retry.json().data.deliveryId as string;
  assert.equal(typeof retriedDeliveryId, "string");
  assert.notEqual(retriedDeliveryId, deliveryId);

  const successList = await server.inject({
    method: "GET",
    url: `/v1/webhooks/deliveries?endpointId=${endpointId}&status=SUCCESS&page=1&pageSize=10`,
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(successList.statusCode, 200);
  const successItem = successList
    .json()
    .data.items.find((item: { deliveryId: string }) => item.deliveryId === retriedDeliveryId) as
    | {
        deliveryId: string;
        requestHeaders: Record<string, string>;
        signatureValidated: boolean;
      }
    | undefined;
  assert.equal(Boolean(successItem), true);
  assert.equal(/^v1=[a-f0-9]{64}$/.test(successItem?.requestHeaders["X-Webhook-Signature"] || ""), true);
  assert.equal(successItem?.signatureValidated, true);

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

test("POST /v1/tasks/{taskId}/cancel should be idempotent for same key", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const create = await server.inject({
    method: "POST",
    url: "/v1/tasks",
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_cancel_create",
      "content-type": "application/json"
    },
    payload: {
      assetId: "ast_cancel_1001",
      mediaType: "IMAGE"
    }
  });

  const taskId = create.json().data.taskId as string;
  const cancelHeaders = {
    authorization: "Bearer test-token",
    "idempotency-key": "idem_contract_cancel_action"
  };

  const first = await server.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/cancel`,
    headers: cancelHeaders
  });

  const second = await server.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/cancel`,
    headers: cancelHeaders
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json().data.status, "CANCELED");
  assert.equal(second.json().data.status, "CANCELED");
  assert.equal(first.json().data.taskId, second.json().data.taskId);

  await app.close();
});

test("POST /v1/tasks/{taskId}/retry should be idempotent for FAILED task", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();
  const tasksService = app.get(TasksService);

  await tasksService.seedFailedTask("u_1001", "tsk_failed_contract_1");

  const retryHeaders = {
    authorization: "Bearer test-token",
    "idempotency-key": "idem_contract_retry_action"
  };

  const first = await server.inject({
    method: "POST",
    url: "/v1/tasks/tsk_failed_contract_1/retry",
    headers: retryHeaders
  });

  const second = await server.inject({
    method: "POST",
    url: "/v1/tasks/tsk_failed_contract_1/retry",
    headers: retryHeaders
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json().data.status, "QUEUED");
  assert.equal(second.json().data.status, "QUEUED");

  await app.close();
});

test("POST /v1/tasks/{taskId}/retry should reject idempotency-key mismatch payload", async () => {
  const app = await setup();
  const server = app.getHttpAdapter().getInstance();

  const create = await server.inject({
    method: "POST",
    url: "/v1/tasks",
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": "idem_contract_conflict_create",
      "content-type": "application/json"
    },
    payload: {
      assetId: "ast_conflict_1001",
      mediaType: "IMAGE"
    }
  });

  const taskId = create.json().data.taskId as string;
  const sharedKey = "idem_contract_action_conflict";

  const cancel = await server.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/cancel`,
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": sharedKey
    }
  });
  assert.equal(cancel.statusCode, 200);

  const retry = await server.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/retry`,
    headers: {
      authorization: "Bearer test-token",
      "idempotency-key": sharedKey
    }
  });

  assert.equal(retry.statusCode, 409);
  assert.equal(retry.json().code, 40901);

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
