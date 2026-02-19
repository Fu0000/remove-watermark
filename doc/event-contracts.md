# 去水印项目事件契约（v1.0）

## 1. 文档信息

| 字段 | 内容 |
|---|---|
| 文档名称 | Event Contracts |
| 版本 | v1.0 |
| 状态 | Ready for Development |
| 对应PRD | `/Users/codelei/Documents/ai-project/remove-watermark/doc/prd.md` |
| 对应API | `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md` |
| 对应DB | `/Users/codelei/Documents/ai-project/remove-watermark/doc/database-design.md` |
| 消息中间件 | BullMQ/Redis + Outbox（PostgreSQL） |
| 更新时间 | 2026-02-19 |

## 2. 文档目标、范围、规则、示例、验收

### 2.1 目标
- 定义系统内部与对外（Webhook）事件的统一契约。
- 保证事件生产、消费、重放、审计具备一致语义。
- 避免跨服务对 payload 字段理解不一致。

### 2.2 范围
- 内部领域事件：任务、订阅、配额、账户删除。
- 对外集成事件：出站 Webhook 事件。
- 覆盖 schema、版本策略、幂等键、重试与死信策略。

### 2.3 规则
- 事件命名固定 `domain.action`（小写、点分）。
- 事件 envelope 必须包含 `eventId/eventType/version/occurredAt/traceId/producer/idempotencyKey/payload`。
- 向后兼容策略：仅允许新增可选字段，不允许删除或改语义。

### 2.4 示例
- `task.succeeded` 事件在 Outbox 发布后，可同时驱动：
  - 通知中心写入 `notifications`
  - Webhook 投递器发起回调

### 2.5 验收
- 所有事件均有 schema 与示例 JSON。
- 每个事件都定义 producer、consumer、幂等规则与失败策略。
- 事件字段可追溯到数据库表和 API 类型定义。

## 3. 事件分类

| 分类 | 说明 | 传输路径 |
|---|---|---|
| Internal Domain Events | 服务内部状态变化通知 | Outbox -> BullMQ |
| Integration Events | 对外系统消费事件 | Outbox -> Webhook Dispatcher |
| System Events | 技术治理事件（DLQ、重放） | BullMQ + 监控系统 |

## 4. 事件命名与版本规范

### 4.1 命名规范
- 格式：`<domain>.<action>`
- 示例：`task.created`, `subscription.activated`, `quota.committed`
- 禁止：`TaskCreated`, `task_created`, `task.create.done`

### 4.2 版本规范
- 字段：`version`（正整数）。
- 首版为 `1`。
- 发生破坏性变更时升主版本并新增 `eventType` 后缀（如 `task.succeeded.v2`）或专门通道。

## 5. 通用 EventEnvelope 契约

```json
{
  "eventId": "evt_01HXX...",
  "eventType": "task.succeeded",
  "version": 1,
  "occurredAt": "2026-02-19T10:00:00Z",
  "traceId": "req_7f8a...",
  "producer": "worker-orchestrator",
  "idempotencyKey": "task:tsk_3001:attempt:1:step:PACKAGING:success",
  "riskFlags": [],
  "payload": {}
}
```

### 5.1 字段定义

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| eventId | string | 是 | 全局唯一事件ID |
| eventType | string | 是 | 事件名 |
| version | number | 是 | 事件版本 |
| occurredAt | string(ISO8601) | 是 | 事件发生时间 |
| traceId | string | 是 | 关联请求链路 |
| producer | string | 是 | 生产者服务名 |
| idempotencyKey | string | 是 | 消费幂等键 |
| riskFlags | string[] | 否 | 风险标签（研究级模型/许可待核等） |
| payload | object | 是 | 业务负载 |

## 6. 内部事件契约（固定清单）

### 6.1 事件清单
- `task.created`
- `task.step.updated`
- `task.succeeded`
- `task.failed`
- `task.canceled`
- `subscription.activated`
- `quota.held`
- `quota.committed`
- `quota.released`
- `account.delete.requested`

### 6.2 事件定义矩阵

| eventType | producer | consumers | 核心payload字段 |
|---|---|---|---|
| task.created | api-gateway | orchestrator, metrics | `taskId,userId,taskType,qualityLevel,inputAssetId` |
| task.step.updated | worker-* | orchestrator, metrics | `taskId,step,status,attempt,durationMs` |
| task.succeeded | worker-orchestrator | notification, webhook-dispatcher, metrics | `taskId,userId,resultKey,previewKey,durationMs,executionProfile,riskFlags?` |
| task.failed | worker-orchestrator | notification, webhook-dispatcher, risk-control | `taskId,userId,errorCode,errorMessage,attempt,executionProfile,riskFlags?` |
| task.canceled | api-gateway/orchestrator | quota-service, metrics | `taskId,userId,reason` |
| subscription.activated | billing-service | entitlement-service, notification, webhook-dispatcher | `subscriptionId,userId,planId,effectiveAt,expireAt` |
| quota.held | quota-service | metrics,audit | `ledgerId,userId,taskId,consumeUnit` |
| quota.committed | quota-service | metrics,audit | `ledgerId,userId,taskId,consumeUnit` |
| quota.released | quota-service | metrics,audit | `ledgerId,userId,taskId,consumeUnit,reason` |
| account.delete.requested | api-gateway | privacy-worker,audit | `requestId,userId,reason` |

补充规则：
- `executionProfile` 来源于任务实际执行策略（可能与请求策略不同，例如 QUALITY 回退 FAST）。
- `riskFlags` 来源于能力协商、模型许可与渲染回退过程，可为空数组。

### 6.3 内部事件示例

#### task.failed

```json
{
  "eventId": "evt_task_failed_001",
  "eventType": "task.failed",
  "version": 1,
  "occurredAt": "2026-02-19T10:10:00Z",
  "traceId": "req_abcd",
  "producer": "worker-orchestrator",
  "idempotencyKey": "task:tsk_3001:attempt:2:failed",
  "payload": {
    "taskId": "tsk_3001",
    "userId": "u_1001",
    "errorCode": "50001",
    "errorMessage": "model timeout",
    "attempt": 2,
    "executionProfile": "FAST",
    "riskFlags": ["MODEL_LICENSE_REVIEW_PENDING"]
  }
}
```

#### quota.committed

```json
{
  "eventId": "evt_quota_committed_001",
  "eventType": "quota.committed",
  "version": 1,
  "occurredAt": "2026-02-19T10:11:00Z",
  "traceId": "req_abcd",
  "producer": "quota-service",
  "idempotencyKey": "ledger:led_001:committed",
  "payload": {
    "ledgerId": "led_001",
    "userId": "u_1001",
    "taskId": "tsk_3001",
    "consumeUnit": 1,
    "status": "COMMITTED"
  }
}
```

## 7. Webhook 事件契约（对外）

### 7.1 对外事件清单
- `task.succeeded`
- `task.failed`
- `subscription.activated`
- `subscription.expiring`
- `account.delete.completed`

### 7.2 Webhook payload 约束
- 必含字段：`eventId,eventType,version,occurredAt,traceId,data`。
- 可选字段：`executionProfile`,`riskFlags`。
- `data` 字段仅暴露用户可见业务信息，不透出内部敏感字段（如模型节点、内部IP）。

### 7.3 Webhook 示例

```json
{
  "eventId": "evt_webhook_001",
  "eventType": "task.succeeded",
  "version": 1,
  "occurredAt": "2026-02-19T10:12:00Z",
  "traceId": "req_abcd",
  "executionProfile": "FAST",
  "riskFlags": ["MODEL_LICENSE_REVIEW_PENDING"],
  "data": {
    "taskId": "tsk_3001",
    "userId": "u_1001",
    "status": "SUCCEEDED",
    "resultUrl": "https://minio.../result.mp4?sig=...",
    "expireAt": "2026-03-21T12:00:00Z"
  }
}
```

## 8. 幂等、重放与死信策略

### 8.1 幂等键规则
- 默认格式：`<aggregate>:<id>:<attempt>:<action>`。
- 示例：
  - `task:tsk_3001:1:created`
  - `task:tsk_3001:2:failed`
  - `ledger:led_001:committed`

### 8.2 消费幂等
- 消费者必须基于 `eventId` 或 `idempotencyKey` 去重。
- 幂等记录建议落地在 `idempotency_keys` 或消费者本地表。

### 8.3 重试策略
- 瞬态错误：指数退避（1m/2m/5m/15m/30m/60m）。
- 达到 `max_retries` 后进入 `DLQ`（`task.deadletter` 或 `webhook_deliveries.status=DEAD`）。

### 8.4 重放策略
- 支持按 `eventId` 或 `aggregate_id` 手动重放。
- 重放必须记录审计日志并附 `replayReason`。

## 9. 可观测字段规范

| 字段 | 说明 |
|---|---|
| traceId | 请求链路追踪 |
| eventId | 事件全局唯一ID |
| producer | 生产者服务 |
| latencyMs | 投递/处理时延 |
| retryCount | 当前重试次数 |
| deliveryStatus | 投递结果 |

## 10. 兼容性与治理规则

1. 新增字段必须可选，默认不影响旧消费者。
2. 删除字段需先经历“弃用窗口”（>=2个版本）。
3. 事件契约变更需更新：
   - `event-contracts.md`
   - `/Users/codelei/Documents/ai-project/remove-watermark/doc/webhook.md`
   - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
4. 每次上线前执行契约测试（producer/consumer 双向）。

## 11. 验收清单

1. 内部事件清单与 PRD 功能链路完全对应。
2. Webhook 事件与 webhook 文档一致。
3. 每个事件均有 envelope 与 payload 示例。
4. 重试、死信、重放策略可实现且可观测。
5. 事件字段可落库到 `outbox_events` 与 `webhook_deliveries`。

## 12. 版本记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.1 | 2026-02-19 | 增补 executionProfile/riskFlags 来源规则与示例，统一能力协商与回退语义 |
| v1.0 | 2026-02-19 | 首版事件契约，覆盖内部+Webhook事件、版本策略、幂等与重放 |
