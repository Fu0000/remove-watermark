import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskActionPayloadHash,
  parseTaskActionResult,
  planTaskActionTransition,
  resolveTaskActionIdempotencyReplay
} from "../src/modules/tasks/task-action.service";

test("buildTaskActionPayloadHash should encode action and task id", () => {
  assert.equal(buildTaskActionPayloadHash("CANCEL", "tsk_1001"), "CANCEL:tsk_1001");
});

test("resolveTaskActionIdempotencyReplay should return conflict on payload mismatch", () => {
  const result = resolveTaskActionIdempotencyReplay(
    {
      payloadHash: "CANCEL:tsk_1001",
      result: {
        kind: "NOT_FOUND"
      }
    },
    "RETRY:tsk_1001"
  );

  assert.deepEqual(result, {
    kind: "IDEMPOTENCY_CONFLICT"
  });
});

test("resolveTaskActionIdempotencyReplay should mark success as replayed", () => {
  const result = resolveTaskActionIdempotencyReplay(
    {
      payloadHash: "RETRY:tsk_1001",
      result: {
        kind: "SUCCESS",
        taskId: "tsk_1001",
        status: "QUEUED",
        replayed: false
      }
    },
    "RETRY:tsk_1001"
  );

  assert.deepEqual(result, {
    kind: "SUCCESS",
    taskId: "tsk_1001",
    status: "QUEUED",
    replayed: true
  });
});

test("planTaskActionTransition should validate cancel/retry preconditions", () => {
  const cancelInvalid = planTaskActionTransition("CANCEL", "PACKAGING", new Set(["QUEUED", "DETECTING"]));
  assert.equal(cancelInvalid.kind, "INVALID");

  const retryAllowed = planTaskActionTransition("RETRY", "FAILED", new Set(["QUEUED"]));
  assert.deepEqual(retryAllowed, {
    kind: "ALLOWED",
    nextStatus: "QUEUED",
    clearError: true
  });
});

test("parseTaskActionResult should reject malformed payload", () => {
  assert.equal(parseTaskActionResult({ kind: "SUCCESS", taskId: "tsk_1001", status: "QUEUED" }), undefined);
  assert.equal(parseTaskActionResult({ kind: "INVALID_TRANSITION" }), undefined);
});
