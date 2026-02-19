# 后端服务框架规范（Node Monorepo，v1.0）

## 1. 目标
- 固化 Node 后端服务落地结构，保证可扩展与一致性。
- 让 API、Worker、账务、Webhook 在统一工程模型下可协同开发。

## 2. 范围
- 覆盖服务拆分、边界、配置、可观测、事务一致性与降级策略。
- 对齐 `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md` 与 `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`。

## 3. 规则

### 3.1 Monorepo 结构
```text
apps/
  api-gateway
  worker-orchestrator
  worker-media
  worker-detect
  worker-inpaint
  worker-result
  webhook-dispatcher
  billing-service
packages/
  contracts
  shared
  observability
  eslint-config
  tsconfig
```

### 3.2 技术基线
- Node 20
- NestJS + Fastify
- Prisma + PostgreSQL
- BullMQ + Redis
- MinIO
- OpenTelemetry + Prometheus

### 3.3 架构边界
- 控制面：Node 服务。
- 推理面：Triton 服务（Node 调用）。
- 强制一致性：关键业务写入必须使用 `事务 + Outbox`。

### 3.4 服务职责
| 服务 | 职责 |
|---|---|
| api-gateway | 鉴权、请求校验、任务创建、查询与聚合 |
| worker-orchestrator | 状态机推进、重试、降级路由 |
| worker-media/detect/inpaint/result | 分阶段异步处理 |
| webhook-dispatcher | 出站回调签名、重试、死信 |
| billing-service | 订阅、配额、账务一致性 |

### 3.5 配置管理
- 采用 12-factor，配置仅由环境变量驱动。
- 环境分层：`dev/shared/staging/prod`。
- Feature Flag 用于灰度能力（例如 `QUALITY` 档位开关）。

### 3.6 状态机与错误码
- 状态机、错误码语义只从 `api-spec.md` 获取。
- 禁止服务私有定义冲突状态。

### 3.7 可观测
- 统一日志字段：`requestId/traceId/userId/taskId/eventId/errorCode`。
- 统一指标前缀：`task_*`, `queue_*`, `webhook_*`, `quota_*`。
- Trace 必须跨 API -> Queue -> Worker -> Webhook 全链路贯通。

## 4. 模板/示例

### 4.1 服务配置模板
```env
APP_NAME=api-gateway
NODE_ENV=staging
DB_URL=postgresql://...
REDIS_URL=redis://...
MINIO_ENDPOINT=http://...
TRITON_ENDPOINT=http://...
FEATURE_QUALITY_ENABLED=true
```

### 4.2 事务边界示例
- 任务创建事务：`tasks + usage_ledger(HELD) + outbox_events(task.created)`。
- 成功完成事务：`tasks(SUCCEEDED) + task_results + usage_ledger(COMMITTED) + outbox_events(task.succeeded)`。

## 5. 验收
- 服务职责不重叠、可独立扩容。
- 所有关键事务边界可在代码评审中定位。
- 降级策略、重试策略与 TAD 对齐。

## 6. 版本记录
| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0 | 2026-02-19 | 首版后端服务框架规范（Node Monorepo） |
