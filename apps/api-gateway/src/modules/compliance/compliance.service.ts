import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { TaskRecord } from "../tasks/tasks.service";
import { TasksService } from "../tasks/tasks.service";
import { PrismaService } from "../common/prisma.service";

interface UploadPolicyInput {
  fileName: string;
  fileSize: number;
  mediaType: "image" | "video";
  mimeType: string;
  sha256?: string;
}

interface RequestContext {
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

interface AssetRecord {
  assetId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mediaType: "IMAGE" | "VIDEO";
  mimeType: string;
  sha256?: string;
  uploadUrl: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  cleanupStatus: "PENDING" | "DONE";
}

interface TaskViewDeletionRecord {
  userId: string;
  taskId: string;
  deletedAt: string;
}

interface DeleteRequestRecord {
  requestId: string;
  userId: string;
  reason: string;
  status: "PENDING";
  eta: string;
  createdAt: string;
  updatedAt: string;
}

interface IdempotencyRecord {
  payloadHash: string;
  result: unknown;
}

interface AuditLogRecord {
  auditId: string;
  userId: string;
  traceId: string;
  requestId: string;
  ip: string;
  userAgent: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export type DeleteAssetResult =
  | { kind: "SUCCESS"; data: { assetId: string; status: "DELETED"; deletedAt: string; cleanupStatus: "PENDING" } }
  | { kind: "NOT_FOUND" }
  | { kind: "IDEMPOTENCY_CONFLICT" };

export type DeleteTaskViewResult =
  | { kind: "SUCCESS"; data: { taskId: string; status: "DELETED"; deletedAt: string } }
  | { kind: "NOT_FOUND" }
  | { kind: "IDEMPOTENCY_CONFLICT" };

export type CreateAccountDeleteRequestResult =
  | { kind: "SUCCESS"; data: { requestId: string; status: "PENDING"; eta: string } }
  | { kind: "IDEMPOTENCY_CONFLICT" };

const DELETE_REQUEST_SLA_HOURS = 24;

@Injectable()
export class ComplianceService {
  private readonly preferPrismaStore =
    process.env.COMPLIANCE_STORE === "prisma" ||
    process.env.TASKS_STORE === "prisma" ||
    Boolean(process.env.DATABASE_URL);

  private readonly assets = new Map<string, AssetRecord>();
  private readonly taskViewDeletions = new Map<string, TaskViewDeletionRecord>();
  private readonly deleteRequests = new Map<string, DeleteRequestRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly auditLogs: AuditLogRecord[] = [];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TasksService) private readonly tasksService: TasksService
  ) {}

  async createUploadPolicy(
    userId: string,
    input: UploadPolicyInput,
    context: RequestContext = {}
  ): Promise<{
    assetId: string;
    uploadUrl: string;
    headers: Record<string, string>;
    expireAt: string;
  }> {
    const assetId = this.buildId("ast");
    const uploadUrl = "https://minio.local/signed-upload-url";
    const now = new Date();
    const mediaType = input.mediaType.toUpperCase() as "IMAGE" | "VIDEO";

    if (this.preferPrismaStore) {
      try {
        await this.prisma.asset.create({
          data: {
            assetId,
            userId,
            fileName: input.fileName,
            fileSize: input.fileSize,
            mediaType,
            mimeType: input.mimeType,
            sha256: input.sha256,
            status: "ACTIVE",
            cleanupStatus: "PENDING",
            createdAt: now,
            updatedAt: now
          }
        });
      } catch {
        this.assets.set(assetId, {
          assetId,
          userId,
          fileName: input.fileName,
          fileSize: input.fileSize,
          mediaType,
          mimeType: input.mimeType,
          sha256: input.sha256,
          uploadUrl,
          cleanupStatus: "PENDING",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        });
      }
    } else {
      this.assets.set(assetId, {
        assetId,
        userId,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mediaType,
        mimeType: input.mimeType,
        sha256: input.sha256,
        uploadUrl,
        cleanupStatus: "PENDING",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
    }

    await this.appendAuditLog(userId, {
      action: "asset.upload_policy.created",
      resourceType: "asset",
      resourceId: assetId,
      context,
      meta: {
        fileName: input.fileName,
        fileSize: input.fileSize,
        mediaType
      }
    });

    return {
      assetId,
      uploadUrl,
      headers: {
        "x-amz-meta-user-id": userId,
        "x-amz-meta-file-name": input.fileName,
        "x-amz-meta-media-type": input.mediaType,
        "x-amz-meta-mime-type": input.mimeType,
        "x-amz-meta-file-size": String(input.fileSize),
        "x-amz-meta-sha256": input.sha256 || ""
      },
      expireAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    };
  }

  async deleteAsset(
    userId: string,
    assetId: string,
    idempotencyKey: string,
    context: RequestContext = {}
  ): Promise<DeleteAssetResult> {
    const payloadHash = JSON.stringify({
      action: "delete_asset",
      assetId
    });
    const idemResult = await this.resolveIdempotency<DeleteAssetResult>(userId, idempotencyKey, payloadHash);
    if (idemResult.kind === "HIT") {
      return idemResult.result;
    }
    if (idemResult.kind === "CONFLICT") {
      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    const now = new Date();
    let successResult: DeleteAssetResult | undefined;

    if (this.preferPrismaStore) {
      try {
        const updated = await this.prisma.asset.updateMany({
          where: {
            assetId,
            userId,
            deletedAt: null
          },
          data: {
            status: "DELETED",
            cleanupStatus: "PENDING",
            deletedAt: now,
            updatedAt: now
          }
        });

        if (updated.count === 1) {
          successResult = {
            kind: "SUCCESS",
            data: {
              assetId,
              status: "DELETED",
              deletedAt: now.toISOString(),
              cleanupStatus: "PENDING"
            }
          };
        } else {
          const existing = await this.prisma.asset.findFirst({
            where: {
              assetId,
              userId
            }
          });
          if (existing && existing.deletedAt) {
            successResult = {
              kind: "SUCCESS",
              data: {
                assetId,
                status: "DELETED",
                deletedAt: existing.deletedAt.toISOString(),
                cleanupStatus: "PENDING"
              }
            };
          }
        }
      } catch {
        // fallback to memory path
      }
    }

    if (!successResult) {
      const memoryAsset = this.assets.get(assetId);
      if (!memoryAsset || memoryAsset.userId !== userId) {
        const notFoundResult: DeleteAssetResult = { kind: "NOT_FOUND" };
        await this.persistIdempotency(userId, idempotencyKey, payloadHash, notFoundResult);
        return notFoundResult;
      }

      if (!memoryAsset.deletedAt) {
        memoryAsset.deletedAt = now.toISOString();
        memoryAsset.updatedAt = memoryAsset.deletedAt;
      }
      successResult = {
        kind: "SUCCESS",
        data: {
          assetId,
          status: "DELETED",
          deletedAt: memoryAsset.deletedAt,
          cleanupStatus: "PENDING"
        }
      };
    }

    await this.persistIdempotency(userId, idempotencyKey, payloadHash, successResult);
    await this.appendAuditLog(userId, {
      action: "asset.delete.requested",
      resourceType: "asset",
      resourceId: assetId,
      context,
      meta: {
        status: successResult.kind === "SUCCESS" ? successResult.data.status : "UNKNOWN"
      }
    });
    return successResult;
  }

  async deleteTaskView(
    userId: string,
    taskId: string,
    idempotencyKey: string,
    context: RequestContext = {}
  ): Promise<DeleteTaskViewResult> {
    const payloadHash = JSON.stringify({
      action: "delete_task_view",
      taskId
    });
    const idemResult = await this.resolveIdempotency<DeleteTaskViewResult>(userId, idempotencyKey, payloadHash);
    if (idemResult.kind === "HIT") {
      return idemResult.result;
    }
    if (idemResult.kind === "CONFLICT") {
      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    const now = new Date();
    let foundTask = false;
    let successResult: DeleteTaskViewResult | undefined;

    if (this.preferPrismaStore) {
      try {
        const task = await this.prisma.task.findFirst({
          where: {
            taskId,
            userId
          },
          select: { taskId: true }
        });
        foundTask = Boolean(task);

        if (task) {
          const row = await this.prisma.taskViewDeletion.upsert({
            where: {
              userId_taskId: {
                userId,
                taskId
              }
            },
            update: {
              deletedAt: now
            },
            create: {
              deletionId: this.buildId("tvd"),
              userId,
              taskId,
              deletedAt: now
            }
          });

          successResult = {
            kind: "SUCCESS",
            data: {
              taskId,
              status: "DELETED",
              deletedAt: row.deletedAt.toISOString()
            }
          };
        }
      } catch {
        // fallback to memory path
      }
    }

    if (!successResult) {
      if (!foundTask) {
        const task = await this.tasksService.getByUser(userId, taskId, { advance: false });
        foundTask = Boolean(task);
      }
      if (!foundTask) {
        const notFoundResult: DeleteTaskViewResult = { kind: "NOT_FOUND" };
        await this.persistIdempotency(userId, idempotencyKey, payloadHash, notFoundResult);
        return notFoundResult;
      }

      const key = this.composeTaskDeletionKey(userId, taskId);
      const existing = this.taskViewDeletions.get(key);
      const deletedAt = existing?.deletedAt || now.toISOString();
      this.taskViewDeletions.set(key, {
        userId,
        taskId,
        deletedAt
      });
      successResult = {
        kind: "SUCCESS",
        data: {
          taskId,
          status: "DELETED",
          deletedAt
        }
      };
    }

    await this.persistIdempotency(userId, idempotencyKey, payloadHash, successResult);
    await this.appendAuditLog(userId, {
      action: "task.view.delete.requested",
      resourceType: "task",
      resourceId: taskId,
      context,
      meta: {
        status: successResult.kind === "SUCCESS" ? successResult.data.status : "UNKNOWN"
      }
    });

    return successResult;
  }

  async createAccountDeleteRequest(
    userId: string,
    reason: string,
    idempotencyKey: string,
    context: RequestContext = {}
  ): Promise<CreateAccountDeleteRequestResult> {
    const payloadHash = JSON.stringify({
      action: "account_delete_request",
      reason
    });
    const idemResult = await this.resolveIdempotency<CreateAccountDeleteRequestResult>(userId, idempotencyKey, payloadHash);
    if (idemResult.kind === "HIT") {
      return idemResult.result;
    }
    if (idemResult.kind === "CONFLICT") {
      return { kind: "IDEMPOTENCY_CONFLICT" };
    }

    const now = new Date();
    const eta = new Date(now.getTime() + DELETE_REQUEST_SLA_HOURS * 60 * 60 * 1000);
    const requestId = this.buildId("del_req");
    const successResult: CreateAccountDeleteRequestResult = {
      kind: "SUCCESS",
      data: {
        requestId,
        status: "PENDING",
        eta: eta.toISOString()
      }
    };

    if (this.preferPrismaStore) {
      try {
        const row = await this.prisma.accountDeleteRequest.create({
          data: {
            requestId,
            userId,
            reason,
            status: "PENDING",
            etaAt: eta,
            createdAt: now,
            updatedAt: now
          }
        });

        successResult.data.requestId = row.requestId;
        successResult.data.eta = row.etaAt.toISOString();
      } catch {
        this.deleteRequests.set(requestId, {
          requestId,
          userId,
          reason,
          status: "PENDING",
          eta: eta.toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        });
      }
    } else {
      this.deleteRequests.set(requestId, {
        requestId,
        userId,
        reason,
        status: "PENDING",
        eta: eta.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
    }

    await this.persistIdempotency(userId, idempotencyKey, payloadHash, successResult);
    await this.appendAuditLog(userId, {
      action: "account.delete.requested",
      resourceType: "account",
      resourceId: userId,
      context,
      meta: {
        requestId: successResult.data.requestId,
        eta: successResult.data.eta
      }
    });

    return successResult;
  }

  async isTaskDeleted(userId: string, taskId: string): Promise<boolean> {
    if (this.preferPrismaStore) {
      try {
        const row = await this.prisma.taskViewDeletion.findUnique({
          where: {
            userId_taskId: {
              userId,
              taskId
            }
          },
          select: { taskId: true }
        });
        if (row) {
          return true;
        }
      } catch {
        // fallback to memory path
      }
    }

    return this.taskViewDeletions.has(this.composeTaskDeletionKey(userId, taskId));
  }

  async filterVisibleTasks(userId: string, tasks: TaskRecord[]): Promise<TaskRecord[]> {
    if (tasks.length === 0) {
      return tasks;
    }

    if (this.preferPrismaStore) {
      try {
        const deletedRows = await this.prisma.taskViewDeletion.findMany({
          where: {
            userId,
            taskId: {
              in: tasks.map((item) => item.taskId)
            }
          },
          select: { taskId: true }
        });
        if (deletedRows.length > 0) {
          const deletedSet = new Set(deletedRows.map((item) => item.taskId));
          return tasks.filter((task) => !deletedSet.has(task.taskId));
        }
      } catch {
        // fallback to memory path
      }
    }

    return tasks.filter((task) => !this.taskViewDeletions.has(this.composeTaskDeletionKey(userId, task.taskId)));
  }

  private async resolveIdempotency<T>(
    userId: string,
    idempotencyKey: string,
    payloadHash: string
  ): Promise<{ kind: "MISS" } | { kind: "CONFLICT" } | { kind: "HIT"; result: T }> {
    if (this.preferPrismaStore) {
      try {
        const row = await this.prisma.complianceIdempotency.findUnique({
          where: {
            userId_idempotencyKey: {
              userId,
              idempotencyKey
            }
          }
        });
        if (row) {
          if (row.payloadHash !== payloadHash) {
            return { kind: "CONFLICT" };
          }
          return {
            kind: "HIT",
            result: row.resultJson as unknown as T
          };
        }
      } catch {
        // fallback to memory path
      }
    }

    const memory = this.idempotency.get(`${userId}:${idempotencyKey}`);
    if (!memory) {
      return { kind: "MISS" };
    }
    if (memory.payloadHash !== payloadHash) {
      return { kind: "CONFLICT" };
    }
    return { kind: "HIT", result: memory.result as T };
  }

  private async persistIdempotency(
    userId: string,
    idempotencyKey: string,
    payloadHash: string,
    result: unknown
  ): Promise<void> {
    const now = new Date();

    if (this.preferPrismaStore) {
      try {
        await this.prisma.complianceIdempotency.upsert({
          where: {
            userId_idempotencyKey: {
              userId,
              idempotencyKey
            }
          },
          update: {
            payloadHash,
            resultJson: result as Prisma.InputJsonValue,
            updatedAt: now
          },
          create: {
            id: this.buildId("cmp_idem"),
            userId,
            idempotencyKey,
            payloadHash,
            resultJson: result as Prisma.InputJsonValue,
            createdAt: now,
            updatedAt: now
          }
        });
        return;
      } catch {
        // fallback to memory path
      }
    }

    this.idempotency.set(`${userId}:${idempotencyKey}`, {
      payloadHash,
      result
    });
  }

  private async appendAuditLog(
    userId: string,
    input: {
      action: string;
      resourceType: string;
      resourceId?: string;
      context?: RequestContext;
      meta?: Record<string, unknown>;
    }
  ): Promise<void> {
    const now = new Date();
    const record: AuditLogRecord = {
      auditId: this.buildId("aud"),
      userId,
      traceId: input.context?.requestId || crypto.randomUUID(),
      requestId: input.context?.requestId || crypto.randomUUID(),
      ip: input.context?.ip || "0.0.0.0",
      userAgent: input.context?.userAgent || "unknown",
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      meta: input.meta || {},
      createdAt: now.toISOString()
    };

    if (this.preferPrismaStore) {
      try {
        await this.prisma.auditLog.create({
          data: {
            auditId: record.auditId,
            userId: record.userId,
            traceId: record.traceId,
            requestId: record.requestId,
            ip: record.ip,
            userAgent: record.userAgent,
            action: record.action,
            resourceType: record.resourceType,
            resourceId: record.resourceId,
            metaJson: record.meta as Prisma.InputJsonValue,
            createdAt: now
          }
        });
        return;
      } catch {
        // fallback to memory path
      }
    }

    this.auditLogs.push(record);
  }

  private composeTaskDeletionKey(userId: string, taskId: string): string {
    return `${userId}:${taskId}`;
  }

  private buildId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }
}
