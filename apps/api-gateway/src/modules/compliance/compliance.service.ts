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
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  eta: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  summary?: Record<string, unknown>;
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

export interface AccountDeleteRequestView {
  requestId: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  reason: string;
  eta: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListAccountDeleteRequestsInput {
  status?: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  page: number;
  pageSize: number;
}

export interface AuditLogView {
  auditId: string;
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

export interface ListAuditLogsInput {
  action?: string;
  resourceType?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface ProcessDeleteRequestsOptions {
  limit?: number;
  dueOnly?: boolean;
  now?: Date;
}

export interface ProcessDeleteRequestsSummary {
  scanned: number;
  processed: number;
  failed: number;
}

const DELETE_REQUEST_SLA_HOURS = 24;
const DEFAULT_AUDIT_RETENTION_DAYS = 180;

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

  async listAccountDeleteRequests(
    userId: string,
    input: ListAccountDeleteRequestsInput
  ): Promise<{ items: AccountDeleteRequestView[]; page: number; pageSize: number; total: number }> {
    const page = Math.max(1, input.page);
    const pageSize = Math.min(100, Math.max(1, input.pageSize));

    if (this.preferPrismaStore) {
      try {
        const where: Prisma.AccountDeleteRequestWhereInput = { userId };
        if (input.status) {
          where.status = input.status;
        }

        const [total, rows] = await Promise.all([
          this.prisma.accountDeleteRequest.count({ where }),
          this.prisma.accountDeleteRequest.findMany({
            where,
            orderBy: [{ createdAt: "desc" }],
            skip: (page - 1) * pageSize,
            take: pageSize
          })
        ]);

        return {
          items: rows.map((row) => this.toDeleteRequestViewFromDb(row)),
          page,
          pageSize,
          total
        };
      } catch {
        // fallback to memory path
      }
    }

    const items = [...this.deleteRequests.values()]
      .filter((item) => item.userId === userId)
      .filter((item) => (input.status ? item.status === input.status : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return {
      items: items.slice((page - 1) * pageSize, page * pageSize).map((item) => this.toDeleteRequestView(item)),
      page,
      pageSize,
      total: items.length
    };
  }

  async getAccountDeleteRequest(userId: string, requestId: string): Promise<AccountDeleteRequestView | undefined> {
    if (this.preferPrismaStore) {
      try {
        const row = await this.prisma.accountDeleteRequest.findFirst({
          where: {
            requestId,
            userId
          }
        });
        if (row) {
          return this.toDeleteRequestViewFromDb(row);
        }
      } catch {
        // fallback to memory path
      }
    }

    const record = this.deleteRequests.get(requestId);
    if (!record || record.userId !== userId) {
      return undefined;
    }
    return this.toDeleteRequestView(record);
  }

  async listAuditLogs(
    userId: string,
    input: ListAuditLogsInput
  ): Promise<{ items: AuditLogView[]; page: number; pageSize: number; total: number }> {
    const page = Math.max(1, input.page);
    const pageSize = Math.min(100, Math.max(1, input.pageSize));
    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;

    if (this.preferPrismaStore) {
      try {
        const where: Prisma.AuditLogWhereInput = { userId };
        if (input.action) {
          where.action = input.action;
        }
        if (input.resourceType) {
          where.resourceType = input.resourceType;
        }
        if (from || to) {
          where.createdAt = {};
          if (from) {
            where.createdAt.gte = from;
          }
          if (to) {
            where.createdAt.lte = to;
          }
        }

        const [total, rows] = await Promise.all([
          this.prisma.auditLog.count({ where }),
          this.prisma.auditLog.findMany({
            where,
            orderBy: [{ createdAt: "desc" }],
            skip: (page - 1) * pageSize,
            take: pageSize
          })
        ]);

        return {
          items: rows.map((item) => ({
            auditId: item.auditId,
            traceId: item.traceId,
            requestId: item.requestId,
            ip: item.ip,
            userAgent: item.userAgent,
            action: item.action,
            resourceType: item.resourceType,
            resourceId: item.resourceId || undefined,
            meta: this.normalizeJsonRecord(item.metaJson),
            createdAt: item.createdAt.toISOString()
          })),
          page,
          pageSize,
          total
        };
      } catch {
        // fallback to memory path
      }
    }

    const items = this.auditLogs
      .filter((item) => item.userId === userId)
      .filter((item) => (input.action ? item.action === input.action : true))
      .filter((item) => (input.resourceType ? item.resourceType === input.resourceType : true))
      .filter((item) => (from ? new Date(item.createdAt) >= from : true))
      .filter((item) => (to ? new Date(item.createdAt) <= to : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return {
      items: items.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
        auditId: item.auditId,
        traceId: item.traceId,
        requestId: item.requestId,
        ip: item.ip,
        userAgent: item.userAgent,
        action: item.action,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        meta: item.meta,
        createdAt: item.createdAt
      })),
      page,
      pageSize,
      total: items.length
    };
  }

  async processPendingDeleteRequests(options: ProcessDeleteRequestsOptions = {}): Promise<ProcessDeleteRequestsSummary> {
    const limit = Math.max(1, options.limit || 20);
    const dueOnly = options.dueOnly !== false;
    const now = options.now || new Date();

    if (this.preferPrismaStore) {
      try {
        return this.processPendingDeleteRequestsWithPrisma(limit, dueOnly, now);
      } catch {
        // fallback to memory path
      }
    }

    const candidates = [...this.deleteRequests.values()]
      .filter((item) => item.status === "PENDING")
      .filter((item) => (dueOnly ? new Date(item.eta).getTime() <= now.getTime() : true))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit);

    let processed = 0;
    let failed = 0;
    for (const item of candidates) {
      item.status = "PROCESSING";
      item.startedAt = now.toISOString();
      item.updatedAt = now.toISOString();
      try {
        const summary = await this.executeDeleteRequestInMemory(item.userId, now);
        item.status = "DONE";
        item.finishedAt = now.toISOString();
        item.updatedAt = now.toISOString();
        item.summary = summary;
        await this.appendAuditLog(item.userId, {
          action: "account.delete.completed",
          resourceType: "account",
          resourceId: item.userId,
          meta: {
            requestId: item.requestId,
            ...summary
          }
        });
        processed += 1;
      } catch (error) {
        item.status = "FAILED";
        item.finishedAt = now.toISOString();
        item.updatedAt = now.toISOString();
        item.errorMessage = error instanceof Error ? error.message : "unknown error";
        await this.appendAuditLog(item.userId, {
          action: "account.delete.failed",
          resourceType: "account",
          resourceId: item.userId,
          meta: {
            requestId: item.requestId,
            errorMessage: item.errorMessage
          }
        });
        failed += 1;
      }
    }

    return {
      scanned: candidates.length,
      processed,
      failed
    };
  }

  async purgeExpiredAuditLogs(retentionDays = DEFAULT_AUDIT_RETENTION_DAYS, now = new Date()): Promise<{ deleted: number; cutoff: string }> {
    const days = Math.max(1, retentionDays);
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    if (this.preferPrismaStore) {
      try {
        const deleted = await this.prisma.auditLog.deleteMany({
          where: {
            createdAt: {
              lt: cutoff
            }
          }
        });
        return {
          deleted: deleted.count,
          cutoff: cutoff.toISOString()
        };
      } catch {
        // fallback to memory path
      }
    }

    const before = this.auditLogs.length;
    const remained = this.auditLogs.filter((item) => new Date(item.createdAt).getTime() >= cutoff.getTime());
    this.auditLogs.splice(0, this.auditLogs.length, ...remained);
    return {
      deleted: before - remained.length,
      cutoff: cutoff.toISOString()
    };
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

  private async processPendingDeleteRequestsWithPrisma(
    limit: number,
    dueOnly: boolean,
    now: Date
  ): Promise<ProcessDeleteRequestsSummary> {
    const where: Prisma.AccountDeleteRequestWhereInput = {
      status: "PENDING"
    };
    if (dueOnly) {
      where.etaAt = { lte: now };
    }

    const candidates = await this.prisma.accountDeleteRequest.findMany({
      where,
      orderBy: [{ createdAt: "asc" }],
      take: limit
    });

    let processed = 0;
    let failed = 0;

    for (const candidate of candidates) {
      const claimed = await this.prisma.accountDeleteRequest.updateMany({
        where: {
          requestId: candidate.requestId,
          status: "PENDING"
        },
        data: {
          status: "PROCESSING",
          startedAt: now,
          updatedAt: now
        }
      });

      if (claimed.count !== 1) {
        continue;
      }

      try {
        const summary = await this.prisma.$transaction(async (tx) => {
          const deletedAssets = await tx.asset.updateMany({
            where: {
              userId: candidate.userId,
              deletedAt: null
            },
            data: {
              status: "DELETED",
              cleanupStatus: "PENDING",
              deletedAt: now,
              updatedAt: now
            }
          });

          const tasks = await tx.task.findMany({
            where: { userId: candidate.userId },
            select: { taskId: true }
          });

          if (tasks.length > 0) {
            await tx.taskViewDeletion.createMany({
              data: tasks.map((item) => ({
                deletionId: this.buildId("tvd"),
                userId: candidate.userId,
                taskId: item.taskId,
                deletedAt: now
              })),
              skipDuplicates: true
            });
          }

          await tx.accountDeleteRequest.update({
            where: { requestId: candidate.requestId },
            data: {
              status: "DONE",
              finishedAt: now,
              errorMessage: null,
              summaryJson: {
                deletedAssets: deletedAssets.count,
                hiddenTasks: tasks.length
              },
              updatedAt: now
            }
          });

          return {
            deletedAssets: deletedAssets.count,
            hiddenTasks: tasks.length
          };
        });

        await this.appendAuditLog(candidate.userId, {
          action: "account.delete.completed",
          resourceType: "account",
          resourceId: candidate.userId,
          meta: {
            requestId: candidate.requestId,
            ...summary
          }
        });

        processed += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "unknown error";
        await this.prisma.accountDeleteRequest.update({
          where: { requestId: candidate.requestId },
          data: {
            status: "FAILED",
            finishedAt: now,
            errorMessage,
            updatedAt: now
          }
        });

        await this.appendAuditLog(candidate.userId, {
          action: "account.delete.failed",
          resourceType: "account",
          resourceId: candidate.userId,
          meta: {
            requestId: candidate.requestId,
            errorMessage
          }
        });
        failed += 1;
      }
    }

    return {
      scanned: candidates.length,
      processed,
      failed
    };
  }

  private async executeDeleteRequestInMemory(userId: string, now: Date): Promise<{ deletedAssets: number; hiddenTasks: number }> {
    let deletedAssets = 0;

    for (const asset of this.assets.values()) {
      if (asset.userId !== userId || asset.deletedAt) {
        continue;
      }
      asset.deletedAt = now.toISOString();
      asset.updatedAt = now.toISOString();
      asset.cleanupStatus = "PENDING";
      deletedAssets += 1;
    }

    const tasks = await this.tasksService.listByUser(userId);
    for (const task of tasks) {
      this.taskViewDeletions.set(this.composeTaskDeletionKey(userId, task.taskId), {
        userId,
        taskId: task.taskId,
        deletedAt: now.toISOString()
      });
    }

    return {
      deletedAssets,
      hiddenTasks: tasks.length
    };
  }

  private toDeleteRequestView(item: DeleteRequestRecord): AccountDeleteRequestView {
    return {
      requestId: item.requestId,
      status: item.status,
      reason: item.reason,
      eta: item.eta,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      errorMessage: item.errorMessage,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private toDeleteRequestViewFromDb(item: {
    requestId: string;
    status: string;
    reason: string;
    etaAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AccountDeleteRequestView {
    return {
      requestId: item.requestId,
      status: item.status as "PENDING" | "PROCESSING" | "DONE" | "FAILED",
      reason: item.reason,
      eta: item.etaAt.toISOString(),
      startedAt: item.startedAt?.toISOString(),
      finishedAt: item.finishedAt?.toISOString(),
      errorMessage: item.errorMessage || undefined,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    };
  }

  private normalizeJsonRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private composeTaskDeletionKey(userId: string, taskId: string): string {
    return `${userId}:${taskId}`;
  }

  private buildId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }
}
