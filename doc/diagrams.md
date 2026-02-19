# 去水印项目时序图/流程图（v1.0）

## 1. 文档信息

| 字段 | 内容 |
|---|---|
| 文档名称 | Diagrams |
| 版本 | v1.0 |
| 状态 | Ready for Review |
| 对应TAD | `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md` |
| 对应API | `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md` |
| 对应事件契约 | `/Users/codelei/Documents/ai-project/remove-watermark/doc/event-contracts.md` |
| 更新时间 | 2026-02-19 |

## 2. 文档目标、范围、规则、示例、验收

### 2.1 目标
- 用图形化方式固化关键业务链路与异常处理流程。
- 为研发、测试、运维提供统一时序参考，避免口头解释偏差。

### 2.2 范围
- 上传直传、任务创建预扣、状态推进、失败重试、取消释放、订阅生效、Webhook投递。

### 2.3 规则
- 所有时序必须与统一状态机一致。
- 事件名必须与 `event-contracts.md` 一致。
- 图示中的接口路径必须与 `api-spec.md` 一致。

### 2.4 示例
- `task.failed` 触发后会同时走 `quota.released` 和通知/Webhook分发链路。

### 2.5 验收
- 覆盖主流程+异常流程。
- 图中每个关键步骤可映射到 API/DB/事件文档。

## 3. 系统流程图（端到端）

```mermaid
flowchart LR
  U[用户端] --> A[API Gateway]
  A --> M[MinIO 直传]
  A --> D[(PostgreSQL)]
  A --> Q[(Redis/BullMQ)]
  Q --> O[Orchestrator]
  O --> W1[media-worker]
  O --> W2[detect-worker]
  O --> W3[inpaint-worker]
  O --> W4[result-worker]
  W4 --> M
  O --> E[outbox_events]
  E --> H[webhook-dispatcher]
  H --> C[客户Webhook地址]
```

## 4. 上传直传流程（Flowchart）

```mermaid
flowchart TD
  A[进入上传页] --> B[GET /v1/system/capabilities]
  B --> C{能力可用?}
  C -- 否 --> C1[回退 taskPolicy=FAST]
  C -- 是 --> D[选择文件]
  C1 --> D
  D --> E[POST /v1/assets/upload-policy]
  E --> F{校验格式/大小}
  F -- 通过 --> G[获取 uploadUrl]
  F -- 不通过 --> X[返回 40002/40003]
  G --> H[客户端直传 MinIO]
  H --> I[回传 assetId]
  I --> J[进入编辑页]
```

## 5. 任务创建与预扣时序图

```mermaid
sequenceDiagram
  participant U as User
  participant API as API Gateway
  participant DB as PostgreSQL
  participant Q as BullMQ

  U->>API: POST /v1/tasks (Idempotency-Key)
  API->>DB: BEGIN
  API->>DB: INSERT tasks(status=QUEUED)
  API->>DB: INSERT usage_ledger(status=HELD)
  API->>DB: INSERT outbox_events(task.created)
  API->>DB: COMMIT
  API-->>U: taskId + quota(HELD)
  API->>Q: enqueue task.created
```

## 6. 任务状态推进时序图

```mermaid
sequenceDiagram
  participant O as Orchestrator
  participant M as media-worker
  participant D as detect-worker
  participant I as inpaint-worker
  participant R as result-worker
  participant DB as PostgreSQL

  O->>DB: status=PREPROCESSING
  O->>M: run preprocess
  M-->>O: step.success
  O->>DB: status=DETECTING
  O->>D: run detect
  D-->>O: step.success
  O->>DB: status=INPAINTING
  O->>I: run inpaint
  I-->>O: step.success
  O->>DB: status=PACKAGING
  O->>R: run package
  R-->>O: resultKey/previewKey
  O->>DB: status=SUCCEEDED + usage_ledger(COMMITTED)
  O->>DB: outbox_events(task.succeeded)
```

## 7. 失败重试流程图

```mermaid
flowchart TD
  A[任务失败] --> B[记录 error_code]
  B --> C[usage_ledger RELEASED]
  C --> D[outbox task.failed]
  D --> E{重试次数 < 2?}
  E -- 是 --> F[POST /v1/tasks/{taskId}/retry]
  F --> G[status=QUEUED, attempt+1]
  E -- 否 --> H[标记最终FAILED]
```

## 8. 取消任务释放额度时序图

```mermaid
sequenceDiagram
  participant U as User
  participant API as API Gateway
  participant DB as PostgreSQL

  U->>API: POST /v1/tasks/{taskId}/cancel
  API->>DB: SELECT task status
  API->>DB: UPDATE tasks SET status=CANCELED
  API->>DB: INSERT usage_ledger(status=RELEASED, source=TASK_CANCEL)
  API->>DB: INSERT outbox_events(task.canceled)
  API-->>U: cancel success
```

## 9. 订阅生效时序图

```mermaid
sequenceDiagram
  participant U as User
  participant API as API Gateway
  participant PAY as WeChat Pay
  participant DB as PostgreSQL

  U->>API: POST /v1/subscriptions/checkout
  API-->>U: paymentPayload
  U->>PAY: 完成支付
  PAY->>API: 支付回调
  API->>DB: BEGIN
  API->>DB: subscriptions.status=ACTIVE
  API->>DB: UPSERT entitlements(quota)
  API->>DB: INSERT outbox_events(subscription.activated)
  API->>DB: COMMIT
```

## 10. Webhook 投递重试与签名校验时序图

```mermaid
sequenceDiagram
  participant DISP as webhook-dispatcher
  participant DB as PostgreSQL
  participant C as Client Webhook

  DISP->>DB: 拉取 outbox pending events
  DISP->>DB: 查 endpoint 配置
  DISP->>DISP: 生成签名(HMAC-SHA256)
  DISP->>C: POST webhook + headers(signature,timestamp,event-id)
  alt 2xx
    C-->>DISP: 200 OK
    DISP->>DB: delivery status=SUCCESS
  else 非2xx/超时
    C-->>DISP: 4xx/5xx or timeout
    DISP->>DB: delivery status=RETRYING, next_retry_at
    DISP->>DB: retry_count + 1
    opt 超过上限
      DISP->>DB: delivery status=DEAD
    end
  end
```

### 10.1 能力协商与降级路径

```mermaid
sequenceDiagram
  participant U as User
  participant API as API Gateway
  participant ORCH as Orchestrator

  U->>API: GET /v1/system/capabilities
  API-->>U: models/renderers/defaults
  U->>API: POST /v1/tasks(taskPolicy=QUALITY)
  API->>ORCH: create task
  alt QUALITY 能力不可用
    ORCH-->>API: fallback FAST + riskFlags
    API-->>U: accepted with fallback profile
  else QUALITY 可用
    ORCH-->>API: keep QUALITY
    API-->>U: accepted
  end
```

### 10.2 风险标签透传

```mermaid
sequenceDiagram
  participant O as Orchestrator
  participant E as Outbox
  participant W as Webhook Dispatcher
  participant C as Client System

  O->>E: publish task.succeeded (riskFlags, executionProfile)
  E->>W: consume event
  W->>C: webhook payload includes riskFlags/executionProfile
  C-->>W: 200 OK
```

### 10.3 文档渲染回退（V1.1）

```mermaid
sequenceDiagram
  participant U as User
  participant API as API Gateway
  participant DOC as Doc Adapter
  participant REN as Renderer Worker

  U->>API: POST /v1/tasks(taskType=document)
  API->>DOC: PPT/PPTX -> PDF (LibreOffice)
  DOC-->>REN: render pages
  REN->>REN: try PDFium
  alt PDFium 不可用或失败
    REN->>REN: fallback Poppler
    alt Poppler 失败
      REN->>REN: fallback PyMuPDF
    end
  end
  alt 渲染链路全部失败
    REN-->>API: failed + traceId + riskFlags
    API-->>U: 提示上传 PDF 重试
  else 成功
    REN-->>API: success
    API-->>U: task accepted
  end
```

## 11. 运营回放流程图

```mermaid
flowchart TD
  A[运营后台查询失败任务] --> B[定位 taskId/eventId]
  B --> C[检查失败原因和重试次数]
  C --> D{允许重放?}
  D -- 是 --> E[触发 replay API]
  E --> F[写审计日志]
  F --> G[任务重新入队]
  D -- 否 --> H[标记人工处理]
```

## 12. 删除与审计流程图

```mermaid
flowchart LR
  U[用户发起删除请求] --> A[POST /v1/account/delete-request]
  A --> B[写 audit_logs]
  A --> C[生成 delete task]
  C --> D[异步清理 DB+MinIO]
  D --> E[outbox account.delete.completed]
  E --> F[通知/Webhook]
```

## 13. 状态机图（统一）

```mermaid
stateDiagram-v2
  [*] --> UPLOADED
  UPLOADED --> QUEUED
  QUEUED --> PREPROCESSING
  PREPROCESSING --> DETECTING
  DETECTING --> INPAINTING
  INPAINTING --> PACKAGING
  PACKAGING --> SUCCEEDED
  PACKAGING --> FAILED
  QUEUED --> CANCELED
  PREPROCESSING --> CANCELED
  DETECTING --> CANCELED
  FAILED --> QUEUED: retry
```

## 14. 验收清单

1. 已覆盖计划中的 7 个关键图清单。
2. 图中状态、事件名、API 路径与基线文档一致。
3. 异常流程（失败、取消、重试、DEAD）完整可追踪。
4. 图可直接用于研发评审与测试用例编写。

## 15. 版本记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.1 | 2026-02-19 | 增加文档渲染回退时序图，补齐能力协商与风险透传在图层的闭环 |
| v1.0 | 2026-02-19 | 首版时序图/流程图文档，覆盖主流程与异常流程 |
