import test from "node:test";
import assert from "node:assert/strict";
import { ComplianceService } from "../src/modules/compliance/compliance.service";
import { TasksService } from "../src/modules/tasks/tasks.service";

test("processPendingDeleteRequests should move request from PENDING to DONE", async () => {
  const tasksService = new TasksService({ disablePersistence: true });
  const complianceService = new ComplianceService({} as never, tasksService);

  await tasksService.createTask("u_1001", "idem_task_1", {
    assetId: "ast_task_1",
    mediaType: "IMAGE",
    taskPolicy: "FAST"
  });

  const upload = await complianceService.createUploadPolicy(
    "u_1001",
    {
      fileName: "origin.png",
      fileSize: 1024,
      mediaType: "image",
      mimeType: "image/png"
    },
    {
      requestId: "req_upload_1",
      ip: "127.0.0.1",
      userAgent: "unit-test"
    }
  );

  const createDelete = await complianceService.createAccountDeleteRequest("u_1001", "cleanup", "idem_delete_req_1", {
    requestId: "req_delete_1",
    ip: "127.0.0.1",
    userAgent: "unit-test"
  });
  assert.equal(createDelete.kind, "SUCCESS");

  const before = await complianceService.listAccountDeleteRequests("u_1001", {
    page: 1,
    pageSize: 20
  });
  assert.equal(before.total, 1);
  assert.equal(before.items[0]?.status, "PENDING");

  const summary = await complianceService.processPendingDeleteRequests({
    dueOnly: false,
    limit: 10
  });
  assert.equal(summary.scanned, 1);
  assert.equal(summary.processed, 1);
  assert.equal(summary.failed, 0);

  const detail = await complianceService.getAccountDeleteRequest("u_1001", createDelete.data.requestId);
  assert.equal(detail?.status, "DONE");
  assert.equal(typeof detail?.startedAt, "string");
  assert.equal(typeof detail?.finishedAt, "string");

  const deletedAsset = await complianceService.deleteAsset("u_1001", upload.assetId, "idem_asset_delete_1");
  assert.equal(deletedAsset.kind, "SUCCESS");
  if (deletedAsset.kind === "SUCCESS") {
    assert.equal(deletedAsset.data.status, "DELETED");
  }

  const visibleTasks = await complianceService.filterVisibleTasks("u_1001", await tasksService.listByUser("u_1001"));
  assert.equal(visibleTasks.length, 0);

  const audits = await complianceService.listAuditLogs("u_1001", {
    page: 1,
    pageSize: 50
  });
  assert.equal(audits.items.some((item) => item.action === "account.delete.requested"), true);
  assert.equal(audits.items.some((item) => item.action === "account.delete.completed"), true);
});

test("purgeExpiredAuditLogs should cleanup logs older than retention window", async () => {
  const tasksService = new TasksService({ disablePersistence: true });
  const complianceService = new ComplianceService({} as never, tasksService);

  await complianceService.createUploadPolicy("u_1001", {
    fileName: "retention.png",
    fileSize: 128,
    mediaType: "image",
    mimeType: "image/png"
  });

  const before = await complianceService.listAuditLogs("u_1001", {
    page: 1,
    pageSize: 20
  });
  assert.equal(before.total >= 1, true);

  const futureNow = new Date(Date.now() + 190 * 24 * 60 * 60 * 1000);
  const purged = await complianceService.purgeExpiredAuditLogs(180, futureNow);
  assert.equal(purged.deleted >= 1, true);

  const after = await complianceService.listAuditLogs("u_1001", {
    page: 1,
    pageSize: 20
  });
  assert.equal(after.total, 0);
});
