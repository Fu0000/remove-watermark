import test from "node:test";
import assert from "node:assert/strict";
import { TasksService } from "../src/modules/tasks/tasks.service";

function createService() {
  return new TasksService({ disablePersistence: true });
}

test("createTask should persist task + usage_ledger + outbox in one transaction", async () => {
  const service = createService();

  const first = await service.createTask("u_1001", "idem_unit_create_1", {
    assetId: "ast_unit_1",
    mediaType: "IMAGE",
    taskPolicy: "FAST"
  });

  assert.equal(first.created, true);
  const snapshotAfterCreate = service.getDebugSnapshot();
  assert.equal(snapshotAfterCreate.taskCount, 1);
  assert.equal(snapshotAfterCreate.usageLedgerCount, 1);
  assert.equal(snapshotAfterCreate.outboxEventCount, 1);

  const replay = await service.createTask("u_1001", "idem_unit_create_1", {
    assetId: "ast_unit_1",
    mediaType: "IMAGE",
    taskPolicy: "FAST"
  });

  assert.equal(replay.created, false);
  const snapshotAfterReplay = service.getDebugSnapshot();
  assert.equal(snapshotAfterReplay.taskCount, 1);
  assert.equal(snapshotAfterReplay.usageLedgerCount, 1);
  assert.equal(snapshotAfterReplay.outboxEventCount, 1);
});

test("advanceTaskStatus should enforce optimistic version lock", async () => {
  const service = createService();
  const created = await service.createTask("u_1001", "idem_unit_create_2", {
    assetId: "ast_unit_2",
    mediaType: "IMAGE",
    taskPolicy: "FAST"
  });

  const taskId = created.task.taskId;

  const mask = await service.upsertMask(
    "u_1001",
    taskId,
    {
      imageWidth: 1920,
      imageHeight: 1080,
      polygons: [
        [
          [10, 10],
          [20, 10],
          [20, 20],
          [10, 20]
        ]
      ],
      brushStrokes: [],
      version: 0
    }
  );

  assert.equal(mask?.conflict, false);

  const beforeAdvance = await service.getByUser("u_1001", taskId, { advance: false });
  assert.equal(beforeAdvance?.status, "PREPROCESSING");
  const staleVersion = beforeAdvance?.version || 0;

  const success = await service.advanceTaskStatus("u_1001", taskId, {
    fromStatus: "PREPROCESSING",
    toStatus: "DETECTING",
    expectedVersion: staleVersion,
    progress: 35
  });

  assert.equal(success.kind, "SUCCESS");

  const stale = await service.advanceTaskStatus("u_1001", taskId, {
    fromStatus: "DETECTING",
    toStatus: "INPAINTING",
    expectedVersion: staleVersion,
    progress: 60
  });

  assert.equal(stale.kind, "VERSION_CONFLICT");
});
