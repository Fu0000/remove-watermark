# 研发进度管理规范（v1.1）

## 1. 目标
- 建立可持续执行的研发节奏，确保 12 周内可交付。
- 提供统一的进度、风险、依赖透明机制。

## 2. 范围
- 适用于产品、前端、后端、测试、算法、运维协作。
- 交付模型：`Trunk-Based + Feature Flag`。

## 3. 规则

### 3.1 工作拆解
- 层级固定：`Epic -> Feature -> Story -> Task`。
- 每个 Story 必须映射至少一个 FR/NFR/MET。

### 3.2 状态流
- 固定流转：`Backlog -> Ready -> In Progress -> In Review -> QA -> Done`。
- 超过 3 天无更新任务自动标记为风险项。

### 3.3 会议节奏
- 日站会：15 分钟，聚焦阻塞与承诺。
- 周计划会：冻结本周目标与资源。
- 周复盘会：复盘偏差、风险、效率指标。

### 3.4 里程碑对齐（PRD M0-M4）
| 阶段 | 周期 | 交付目标 |
|---|---|---|
| M0 | 第1-2周 | 需求冻结、接口草案、指标冻结 |
| M1 | 第3-5周 | 图片链路灰度上线 |
| M2 | 第6-8周 | 视频链路与订阅能力上线 |
| M3 | 第9-10周 | 稳定性与漏斗优化 |
| M4 | 第11-12周 | 正式发布与 V1.1 冻结 |

## 4. 模板/示例

### 4.1 研发进度总表模板
| Epic | Feature | Owner | Start | End | 状态 | 阻塞项 | 风险等级 |
|---|---|---|---|---|---|---|---|
| 任务系统 | 图片链路 | 后端A | 2026-02-20 | 2026-03-05 | In Progress | GPU 环境待就绪 | 中 |

### 4.2 风险登记模板
| riskId | 描述 | 概率 | 影响 | 应对措施 | Owner | 截止日期 |
|---|---|---|---|---|---|---|
| R-TECH-001 | 视频质量不稳定 | 中 | 高 | QUALITY 降级开关 | 算法A | 2026-03-10 |

### 4.3 依赖跟踪模板
| 依赖项 | 提供方 | 当前状态 | 阻塞范围 | 期望解决时间 |
|---|---|---|---|---|
| 支付联调账号 | 支付团队 | 待分配 | 订阅验收 | 2026-03-01 |

## 5. 验收
- 每周形成：计划达成率、阻塞项清单、下周承诺。
- 风险台账与里程碑偏差可追踪。
- 任一延期项都能定位责任人与恢复计划。

## 6. 版本记录
| 版本 | 日期 | 说明 |
|---|---|---|
| v1.1 | 2026-02-19 | 新增 v1.0 执行版研发任务清单、联调计划、测试证据、完成状态与关键结果看板 |
| v1.0 | 2026-02-19 | 首版研发进度管理规范与模板 |

## 7. v1.0 执行版研发任务清单（M0-M4）

说明：
- 状态流严格使用：`Backlog -> Ready -> In Progress -> In Review -> QA -> Done`。
- 时间基线：`2026-02-23` 开始执行（可按实际启动日平移）。
- 范围口径：`v1.0 = 图片 + 视频`。

### 7.1 环境准备（Environment Readiness）

| Task ID | Epic | Task | Owner | Start | End | 状态 | 联调依赖 | 测试层级 | 关键结果 |
|---|---|---|---|---|---|---|---|---|---|
| ENV-001 | 平台基础 | 建立 `dev/shared/staging/prod` 环境拓扑与命名 | 运维 | 2026-02-23 | 2026-02-25 | Ready | FE/BE 共用环境 | smoke | 4 套环境可用 |
| ENV-002 | 平台基础 | PostgreSQL/Redis/MinIO/Triton 基础实例与网络打通 | 运维 | 2026-02-23 | 2026-02-27 | Ready | 后端服务启动 | integration | 关键中间件健康检查通过 |
| ENV-003 | 平台基础 | OTel + Prometheus + Grafana + 日志采集落地 | 运维 | 2026-02-24 | 2026-02-28 | Ready | 全链路追踪 | smoke | `traceId` 可跨服务追踪 |
| ENV-004 | 平台基础 | CI 门禁（lint/unit/contract）与发布流水线 | 平台工程 | 2026-02-24 | 2026-02-28 | Ready | PR 合并门禁 | unit/contract | PR 阶段自动门禁生效 |

### 7.2 数据准备（Data Readiness）

| Task ID | Epic | Task | Owner | Start | End | 状态 | 联调依赖 | 测试层级 | 关键结果 |
|---|---|---|---|---|---|---|---|---|---|
| DATA-001 | 数据基线 | Prisma schema 与 DDL 基线同步（含回滚脚本） | 后端 | 2026-02-24 | 2026-02-28 | In Progress | shared 部署 | integration | Prisma schema + init migration 已落地，待 shared PostgreSQL 验证 |
| DATA-002 | 数据基线 | 初始化套餐/权益种子数据（Free/Pro 月付/年付） | 后端 | 2026-02-26 | 2026-03-01 | In Review | 订阅联调 | integration | `plans` 表与种子命令已落地，`GET /v1/plans` 可由 DB 驱动并保持回退 |
| DATA-003 | 数据基线 | `idempotency_keys/outbox_events/usage_ledger` 去重索引校验 | 后端 | 2026-02-26 | 2026-03-02 | In Review | 任务/账务一致性 | contract/integration | 去重索引校验脚本已落地，冲突防重可稳定复现 |
| DATA-004 | 数据基线 | 测试样本库（图片/视频，含失败样本）与标注策略 | 测试+算法 | 2026-02-25 | 2026-03-03 | Ready | E2E 与回归 | e2e/regression | FR 场景样本覆盖 >= 90% |

### 7.3 服务准备（Service Readiness）

| Task ID | Epic | Task | Owner | Start | End | 状态 | 联调依赖 | 测试层级 | 关键结果 |
|---|---|---|---|---|---|---|---|---|---|
| SVC-001 | 服务基线 | Monorepo 初始化（apps/packages 结构、eslint/tsconfig） | 后端 | 2026-02-23 | 2026-02-25 | Done | FE/BE 契约共享 | unit | 项目骨架可编译 |
| SVC-002 | 服务基线 | `api-gateway` 基础模块（auth/assets/tasks/plans） | 后端 | 2026-02-24 | 2026-03-03 | In Review | FE 调用 | contract | OpenAPI 可导出联调 |
| SVC-003 | 服务基线 | `worker-orchestrator/media/detect/inpaint/result` 队列骨架 | 后端 | 2026-02-25 | 2026-03-05 | In Review | 任务状态推进 | integration | `worker-orchestrator` 已接入 Redis/BullMQ 编排骨架，待 shared/staging 验证 |
| SVC-004 | 服务基线 | `webhook-dispatcher`（签名、重试、死信） | 后端 | 2026-03-10 | 2026-03-20 | In Progress | 外部回调联调 | contract/integration | 已接入 outbox 轮询、签名派发与 delivery 持久化，并新增 `webhook_success_rate/webhook_retry_total` 指标与阈值告警 |
| SVC-005 | 服务基线 | `billing-service`（订阅、权益生效、账务流水） | 后端 | 2026-03-17 | 2026-03-30 | Backlog | 套餐支付联调 | integration/contract | `HELD/COMMITTED/RELEASED` 闭环 |

### 7.4 前端研发任务（Mini/Web + Admin）

| Task ID | Epic | Task | Owner | Start | End | 状态 | 需求映射 | 联调接口 | 测试层级 | 完成状态 |
|---|---|---|---|---|---|---|---|---|---|---|
| FE-001 | 用户端主链路 | 登录态与会话续期 | 前端 | 2026-03-02 | 2026-03-06 | In Review | FR-001 | `/v1/auth/*` | unit/e2e | 登录会话与鉴权头链路已联调 |
| FE-002 | 用户端主链路 | 上传页（格式校验、分片上传、失败恢复） | 前端 | 2026-03-02 | 2026-03-10 | In Review | FR-002 | `/v1/assets/upload-policy` | e2e | 上传策略+任务创建链路已联调 |
| FE-003 | 用户端主链路 | 编辑页（自动检测+手动蒙版） | 前端 | 2026-03-05 | 2026-03-14 | In Review | FR-003/FR-004 | `/v1/tasks`, `/v1/tasks/{taskId}/mask` | e2e/regression | 真实绘制交互与版本冲突处理已联调 |
| FE-004 | 用户端主链路 | 任务中心（轮询/SSE 回退、重试/取消） | 前端 | 2026-03-09 | 2026-03-18 | In Review | FR-005/FR-006 | `/v1/tasks*` | contract/e2e | 刷新/取消/重试联调动作与 H5 构建验证已通过 |
| FE-005 | 用户端主链路 | 结果页（预览、下载、过期提示） | 前端 | 2026-03-12 | 2026-03-18 | In Review | FR-007 | `/v1/tasks/{taskId}/result` | e2e | 结果查询、预览/复制下载地址、过期提示已联调 |
| FE-006 | 商业化 | 套餐页/账单页/订阅入口 | 前端 | 2026-03-23 | 2026-04-03 | Backlog | FR-008 | `/v1/plans`, `/v1/subscriptions/*`, `/v1/usage/me` | contract/e2e | 未开始 |
| FE-007 | 数据治理 | 账户/隐私与删除申请页 | 前端 | 2026-03-30 | 2026-04-06 | Backlog | FR-010 | 删除相关接口 | e2e | 未开始 |
| FE-008 | 管理后台 | 任务检索/异常重放/套餐管理最小集 | 前端（后台） | 2026-03-23 | 2026-04-10 | In Progress | FR-012 | `/admin/*` | e2e/smoke | 页面与 RBAC 骨架已完成 |

### 7.5 后端研发任务（API + Worker + Billing）

| Task ID | Epic | Task | Owner | Start | End | 状态 | 需求映射 | 测试层级 | 完成状态 | 关键结果 |
|---|---|---|---|---|---|---|---|---|---|---|
| BE-001 | 契约实现 | `GET /v1/system/capabilities` + 默认策略 | 后端 | 2026-02-26 | 2026-03-03 | In Review | FR-005 | contract | 契约测试已通过 | 能力协商可回退 FAST |
| BE-002 | 上传链路 | `POST /v1/assets/upload-policy` + MinIO 签名 | 后端 | 2026-02-26 | 2026-03-04 | In Review | FR-002 | integration/contract | 契约测试已通过 | 上传策略 10 分钟有效 |
| BE-003 | 任务编排 | `POST /v1/tasks` + 幂等 + 预扣事务 | 后端 | 2026-03-01 | 2026-03-08 | In Review | FR-005/FR-008 | integration/contract | 文件态 + Prisma 持久化分支已落地，事务化创建已联调 | `tasks + usage_ledger + outbox` 同事务 |
| BE-004 | 状态推进 | Orchestrator 状态机推进与乐观锁版本控制 | 后端 | 2026-03-03 | 2026-03-12 | In Review | FR-005/FR-006 | unit/integration | 乐观锁与状态迁移校验已覆盖 Prisma 分支 | 非法迁移拦截 100% |
| BE-005 | 结果交付 | `GET /v1/tasks/{taskId}/result` + 结果 TTL | 后端 | 2026-03-09 | 2026-03-15 | In Review | FR-007 | integration | 契约测试已通过（含结果可用路径） | 结果链接按策略失效 |
| BE-006 | 失败恢复 | retry/cancel 语义与并发互斥 | 后端 | 2026-03-09 | 2026-03-16 | In Review | FR-005/FR-006 | unit/contract | 动作幂等与冲突路径契约测试已通过 | 重试与取消冲突可控 |
| BE-007 | 商业化 | plans/subscriptions/usage 接口与账务对账任务 | 后端 | 2026-03-20 | 2026-04-05 | In Review | FR-008 | integration/contract | 已补齐本地订阅确认（mock-confirm）+ 任务创建配额门禁（40302）+ 净额扣减口径；真实支付回调/退款回滚待补齐 | 订阅、配额与对账基线可联调 |
| BE-008 | 通知回调 | webhook endpoint 管理/投递/重试/手动重放 | 后端 | 2026-03-24 | 2026-04-10 | In Progress | FR-009 | integration/contract | 已落地 endpoint 管理 + test/retry + HMAC-SHA256 签名头，并接入 dispatcher（outbox 轮询、签名出站、delivery 持久化、指标告警）；本地外部验签联调已通过，待 shared/staging 云端验收 | DEAD 信队列可运维回放 |
| BE-009 | 合规治理 | 素材/任务/账户删除与审计日志链路 | 后端 | 2026-03-30 | 2026-04-12 | Backlog | FR-010/FR-011 | integration/e2e | 未开始 | 删除 SLA <= 24h |

### 7.6 联调对接任务（FE/BE/QA/OPS）

| Task ID | 对接项 | Owner | Start | End | 状态 | 验收标准 | 备注 |
|---|---|---|---|---|---|---|---|
| INT-001 | 契约冻结（字段/错误码/状态机） | 产品+前后端 | 2026-02-24 | 2026-02-28 | In Progress | OpenAPI 冻结并发布 | shared 联调前置 |
| INT-002 | Header 校验（Authorization/Idempotency-Key/X-Request-Id） | 前后端 | 2026-03-01 | 2026-03-04 | In Review | 三个 Header 行为一致 | shared smoke 脚本已落地，待 shared 域名可达后验收 |
| INT-003 | 上传 -> 创建任务主链路联调 | 前后端+测试 | 2026-03-05 | 2026-03-12 | In Progress | 端到端成功率 >= 95% | 本地 smoke 已通过，待云端 shared 验收 |
| INT-004 | 任务中心状态刷新与错误路径联调 | 前后端+测试 | 2026-03-10 | 2026-03-18 | In Review | 状态渲染与错误码一致 | 本地 smoke 已覆盖状态推进与错误路径；按阶段例外以本地证据验收，云端认证后置发布前门禁 |
| INT-005 | 结果下载与过期策略联调 | 前后端+测试 | 2026-03-14 | 2026-03-20 | In Review | 过期前提醒与失效行为一致 | 本地 smoke 已覆盖结果下载与 expireAt 校验；按阶段例外以本地证据验收，云端认证后置发布前门禁 |
| INT-006 | 订阅/配额扣减联调 | 前后端+测试+支付 | 2026-03-24 | 2026-04-07 | In Progress | 扣减一致率 100% | 本地已覆盖 mock-confirm + 预扣下降 + 取消回升；待真实支付回调与退款回滚 |
| INT-007 | Webhook 对接联调（验签/重试/幂等） | 后端+外部系统 | 2026-03-28 | 2026-04-12 | In Progress | 签名校验通过，重试可观测 | 本地已完成 test/retry/query + dispatcher outbox 派发 smoke + 外部验签幂等脚本 + dev/shared/staging 本地映射矩阵，待 shared/staging 云端联调 |
| INT-008 | staging 全链路回归与发布演练 | 全体 | 2026-04-28 | 2026-05-10 | Backlog | 发布准入清单全绿 | 不允许跳过 staging |

### 7.7 项目治理任务（PM/QA/ALG/OPS）

| Task ID | Task | Owner | 状态 | 截止时间 | 风险等级 | 下一步 |
|---|---|---|---|---|---|---|
| PM-001 | FR/NFR/MET 映射到 Story 与测试用例 | 产品+测试 | In Progress | 2026-02-28 | 中 | 完成 FR-001~FR-012 映射表 |
| PM-002 | 风险台账维护（许可/成本/性能） | 产品+技术负责人 | In Progress | 2026-03-03 | 高 | 补齐触发条件与替代方案 |
| QA-001 | 测试计划与回归集建立（unit/integration/contract/e2e/smoke） | 测试 | Ready | 2026-03-05 | 中 | 完成主链路 case 编排 |
| ALG-001 | FAST/QUALITY 模型路由及风险标记 | 算法 | Backlog | 2026-03-22 | 高 | 输出质量/成本基线报告 |
| OPS-001 | 扩缩容与降级阈值告警（queue_depth、INPAINTING P95） | 运维 | Ready | 2026-03-15 | 中 | 完成告警模板与演练 |

## 8. 测试情况与证据（截至 2026-02-21）

### 8.1 已执行检查（文档与约束一致性）

| 检查项 | 执行命令 | 结果 | 结论 |
|---|---|---|---|
| Monorepo 依赖安装 | `pnpm install` | `Done in 4m 23s` | 工作区依赖已完整安装，可执行后续联调与构建 |
| 框架静态类型检查 | `pnpm -r typecheck` | `15 of 16 workspace passed` | 三端与共享包初始化代码可通过 TypeScript 校验 |
| 工作区 lint 占位检查 | `pnpm -r lint` | `15/15 workspace passed` | lint 脚本已统一挂载，后续可替换为 ESLint 实检 |
| 用户前端目录规范检查 | `for dir in pages components modules stores services utils; do find apps/user-frontend/src/$dir -type f \\| wc -l; done` | `目录均存在且有文件` | 已对齐 `frontend-framework.md` 目录约束 |
| 管理端构建验证 | `pnpm --filter @apps/admin-console build` | `Next build passed` | 管理端框架可完成生产构建 |
| API 网关构建验证 | `pnpm --filter @apps/api-gateway build` | `tsc passed` | 后端网关骨架可完成编译 |
| API 网关契约测试 | `pnpm --filter @apps/api-gateway test:contract` | `18 passed / 0 failed` | 关键契约（含 `/v1/plans`、`/v1/subscriptions/*`、`/v1/usage/me`、`/v1/webhooks/*`、`cancel/retry` 幂等与冲突路径、`mock-confirm`、`40302` 配额门禁）可联调 |
| API 网关单元测试 | `pnpm --filter @apps/api-gateway test:unit` | `2 passed / 0 failed` | `BE-003/BE-004`（事务创建与乐观锁）核心规则可回归 |
| Prisma 客户端生成校验（本轮） | `pnpm --filter @apps/api-gateway prisma:generate` | `passed` | Prisma schema 与客户端代码生成可用，支持后续 shared DB 联调 |
| 本地 PostgreSQL 迁移部署验证（本轮） | `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma` | `passed（应用 20260222030000_add_webhook_tables）` | webhook 持久化表（`webhook_endpoints/webhook_deliveries`）已在本地 PostgreSQL 生效 |
| 账务对账迁移部署验证（本轮） | `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma` | `passed（应用 20260222013500_add_billing_reconciliation_tables）` | 对账基础表（monthly/checkpoints/runs）已在本地 PostgreSQL 生效 |
| 套餐种子数据初始化验证（本轮） | `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway prisma:seed:plans` | `passed（seeded plans=3）` | Free/Pro 月付/年付种子可幂等写入 |
| 去重索引校验（DATA-003，本轮） | `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway test:data-dedupe-index` | `passed` | `idempotency_keys/outbox_events/usage_ledger` 去重约束存在且二次写入可被稳定拦截 |
| Prisma 模式 shared smoke（本轮，本地） | `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark TASKS_STORE=prisma SUBSCRIPTIONS_STORE=prisma pnpm --filter @apps/api-gateway test:shared-smoke` | `passed` | `INT-002~INT-006` 在 Prisma 持久化分支可通过 |
| Prisma 持久化重启校验（本轮） | `重启网关后 GET /v1/tasks` + `psql count` | `passed（tasks=2, task_masks=1, idempotency_keys=2, usage_ledger=3, outbox_events=3）` | 本地重启后任务与幂等相关数据不丢失 |
| Worker 编排类型检查（本轮） | `pnpm --filter @apps/worker-orchestrator typecheck` | `passed` | `worker-orchestrator` 编排循环可编译 |
| 双进程联调 smoke（API + Worker，本轮） | `启动 api-gateway(TASKS_STORE=prisma) + worker-orchestrator 后执行 pnpm --filter @apps/api-gateway test:shared-smoke` | `passed` | 状态由 Worker 推进，API 查询路径不再承担推进副作用 |
| BullMQ 依赖与消息驱动校验（本轮） | `worker-orchestrator 引入 bullmq` + `outbox dispatch log` | `passed（published>0）` | 已验证 outbox 事件可发布到 Redis 队列并被 consumer 消费 |
| Worker deadletter/retry 策略校验（本轮） | `pnpm --filter @apps/worker-orchestrator typecheck` + `pnpm --filter @apps/api-gateway test:shared-smoke`（双进程） | `passed` | 已落地 `maxRetries=2`、指数退避+jitter、不可重试直入死信、outbox 超限转 `DEAD` 与死信告警阈值基线 |
| Deadletter 手动重放脚本校验（本轮） | `DLQ_DRY_RUN=true pnpm --filter @apps/worker-orchestrator ops:deadletter:replay` | `passed` | 已支持按 `jobId/taskId/eventId` 筛选重放；支持 `outbox DEAD -> PENDING` 复位与 dry-run 演练 |
| Deadletter 批量重放参数校验（本轮） | `DLQ_DRY_RUN=true DLQ_SOURCE=all DLQ_LOOKBACK_MINUTES=1440 DLQ_REPLAY_CONCURRENCY=4 pnpm --filter @apps/worker-orchestrator ops:deadletter:replay` | `passed` | 已支持按来源过滤、时间窗口筛选与并发重放控制 |
| Deadletter 并发上限保护校验（本轮） | `DLQ_REPLAY_CONCURRENCY=20` 分别在 `DLQ_ALLOW_HIGH_CONCURRENCY=false/true` 下执行 `ops:deadletter:replay` | `passed` | 默认并发上限 `10`；仅在显式开启高并发开关时允许提升至 `20` |
| Deadletter 高并发批量阻断校验（本轮） | `DLQ_DRY_RUN=false + DLQ_ALLOW_HIGH_CONCURRENCY=true + DLQ_REPLAY_CONCURRENCY=20 + DLQ_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD=1` 执行 `ops:deadletter:replay` | `passed（预期阻断）` | 达到阈值且未显式二次确认时，脚本会直接拒绝执行 |
| Deadletter 阻断/放行一键演练校验（本轮） | `DATABASE_URL=... REDIS_URL=... pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill` | `passed` | 已脚本化“构造样本 -> 阻断验证 -> 放行验证 -> 自动清理”闭环，可直接用于 shared/staging 演练 |
| Deadletter 演练矩阵校验（本轮） | `DEV/SHARED/STAGING DATABASE_URL + REDIS_URL` 均指向本地地址后执行 `pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill:matrix` | `passed（dev/shared/staging-local）` | 已按当前阶段口径完成三目标矩阵演练，云端地址切换后可复用同命令补齐最终证据 |
| 用户前端类型检查（本轮） | `pnpm --filter @apps/user-frontend typecheck` | `passed` | FE 联调代码可通过静态校验 |
| 工作区类型检查（本轮） | `pnpm -r typecheck` | `15 of 16 workspace passed` | 前后端联动改动无类型回归 |
| 用户端 H5 构建验证（本轮） | `pnpm --filter @apps/user-frontend build:h5` | `passed（2 warnings）` | 编辑页真实绘制交互可完成多端构建（保留包体告警待优化） |
| shared 联调 smoke（INT-002/INT-007，本地 fallback） | `pnpm --filter @apps/api-gateway test:shared-smoke` | `passed` | 本地地址 `http://127.0.0.1:3000` 已覆盖 Header、上传创建、状态刷新、结果查询、订阅确认/配额扣减、webhook test/retry 与签名头校验，云端 shared 地址待切换 |
| shared 联调 smoke 矩阵（INT-002/INT-007，本地 fallback） | `pnpm --filter @apps/api-gateway test:shared-smoke:matrix` | `passed（dev=passed）` | 已支持一键矩阵执行与 Markdown 报告输出，shared/staging 待提供云端地址后接入 |
| Webhook Dispatcher 类型检查（本轮） | `pnpm --filter @apps/webhook-dispatcher typecheck` | `passed` | `webhook-dispatcher` 出站派发链路可编译 |
| Webhook Dispatcher 指标阈值单元测试（本轮） | `pnpm --filter @apps/webhook-dispatcher test:unit` | `passed（3/3）` | 已覆盖成功率告警、重试率告警与窗口重置逻辑 |
| Webhook Dispatcher 本地 smoke（本轮） | `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/webhook-dispatcher test:smoke` | `passed` | 已验证 outbox `PENDING -> PUBLISHED`、签名头生成与 `webhook_deliveries(SUCCESS)` 持久化闭环 |
| INT-007 外部验签/重试/幂等本地联调（本轮） | `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/webhook-dispatcher test:int007-local` | `passed` | 已验证“首投递处理后 503 -> retry 成功”场景下，外部验签通过且同 `eventId` 业务副作用仅执行一次 |
| INT-007 本地映射矩阵（本轮） | `DEV/SHARED/STAGING_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/webhook-dispatcher test:int007-local:matrix` | `passed（dev/shared/staging-local）` | 一次命令覆盖三目标 `smoke + int007-local`，并输出 Markdown 报告，后续可直接替换为云端地址复用 |
| Billing 对账任务集成测试（本轮） | `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/billing-service test:integration` | `passed（1/1）` | 小时增量 + 月聚合 + 日终全量框架在本地 PostgreSQL 可回归 |
| Billing 服务类型检查（本轮） | `pnpm --filter @apps/billing-service typecheck` | `passed` | 对账任务代码可通过静态类型校验 |
| 状态机字面量一致性抽检 | `rg -n "UPLOADED -> QUEUED -> PREPROCESSING -> DETECTING -> INPAINTING -> PACKAGING -> SUCCEEDED\\|FAILED\\|CANCELED" doc \| wc -l` | `6` | 关键文档存在统一字面量 |
| 幂等约束覆盖抽检 | `rg -n "Idempotency-Key" doc \| wc -l` | `11` | 创建任务幂等约束已在多文档显式出现 |
| Node+Triton 架构边界抽检 | `rg -n "Node 控制面 \\+ Triton 推理面|Node.*Triton" doc/project-constraints.md doc/prd.md doc/tad.md doc/plan.md` | 命中 `plan.md`、`tad.md` | 架构口径一致，需在实施阶段继续守护 |
| MinIO 术语一致性抽检 | `rg -n "MinIO" doc/project-constraints.md doc/prd.md doc/api-spec.md doc/tad.md doc/plan.md` | 多文档命中 | 对象存储术语一致 |

### 8.2 后续测试计划（按门禁）
- PR 阶段：`unit + lint + contract`。
- shared/staging：`integration + e2e + regression + performance smoke`。
- 发布前：`NFR-001~NFR-007` 验证与 `P0/P1=0`。

## 9. 完成状态看板（截至 2026-02-21）

统计口径：本节任务清单（ENV/DATA/SVC/FE/BE/INT/治理）共 `43` 项。

| 状态 | 数量 | 占比 |
|---|---:|---:|
| Done | 1 | 2.3% |
| In Progress | 10 | 23.3% |
| Ready | 7 | 16.3% |
| Backlog | 8 | 18.6% |
| In Review | 17 | 39.5% |
| QA | 0 | 0.0% |

## 10. 关键结果（KR）跟踪（v1.0）

| KR ID | 指标映射 | 目标值 | 当前基线（2026-02-19） | 当前状态 |
|---|---|---|---|---|
| KR-001 | MET-002 上传到任务创建转化率 | `>= 60%` | 待联调后建立 | 未开始 |
| KR-002 | MET-003 任务成功率（剔除取消） | `>= 95%` | 待联调后建立 | 未开始 |
| KR-003 | MET-004 图片 TTFR P95 | `< 8s` | 待压测与灰度 | 未开始 |
| KR-004 | NFR-002 API 月可用性 | `>= 99.9%` | 待监控看板上线 | 未开始 |
| KR-005 | 账务一致性（配额扣减一致率） | `= 100%` | 已有本地增量证据，待真实支付回调/退款回滚闭环 | In Progress |

## 11. 阻塞项与风险（24h 回填机制）

| Blocker ID | 描述 | Owner | 影响范围 | SLA | 下一步 |
|---|---|---|---|---|---|
| BLK-001 | shared 环境 Triton/GPU 资源未完成分配 | 运维 | 视频链路、性能基线 | 24h 回填 | 完成资源配额与可用性验证 |
| BLK-002 | 支付联调测试账号与回调沙箱待开通 | 支付对接人 | 订阅链路、账务验证 | 24h 回填 | 明确开通时间与替代测试方案 |
| BLK-003 | [已解除 2026-02-20] `@apps/user-frontend` `build:h5` webpack alias 校验异常（`@tarojs/shared`）已修复 | 前端 | H5 端构建与联调节奏 | 24h 回填 | 跟踪包体告警并推进体积优化 |
| BLK-004 | [已转发布前门禁 2026-02-21] 云端 shared/staging 域名与认证待切换（当前以本地 `127.0.0.1` 执行联调） | 前后端 | 发布前云端部署认证 | 24h 回填 | 发布前最后一步执行云端 smoke + 认证验收 |

## 12. 本次执行回填（框架初始化）

- 任务编号：`INIT-20260219-01`
- 需求映射：`FR-001/FR-002/FR-005/FR-012`、`NFR-006/NFR-007`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/frontend-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/admin-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 实施摘要：
  - 初始化 Monorepo：`apps/* + packages/* + pnpm workspace`
  - 初始化用户前端（Taro + React）：`apps/user-frontend`，覆盖 `pages/components/modules/stores/services/utils` 目录，落地多端适配工具与统一页面骨架
  - 初始化管理端（Next.js + Ant Design）：`apps/admin-console`，落地 `pages/features/components/services/auth` 目录与 RBAC 基础
  - 初始化后端服务骨架：`apps/api-gateway` 与 `worker-* / webhook-dispatcher / billing-service`
  - 初始化共享包：`packages/contracts/shared/observability/eslint-config/tsconfig`
- 测试证据：
  - `pnpm install`：成功（含警告，不阻塞）
  - `pnpm -r typecheck`：通过
  - `pnpm -r lint`：通过（当前为占位脚本）
  - `pnpm --filter @apps/admin-console build`：通过
  - `pnpm --filter @apps/api-gateway build`：通过
  - `pnpm --filter @apps/user-frontend build:h5`：失败（已登记 `BLK-003`）
- 风险与回滚：
  - 风险：`lint` 尚为占位脚本，尚未接入真实 ESLint 规则
  - 回滚：删除 `apps/` 与 `packages/` 初始化目录并恢复本文件状态
- 当前状态：`In Progress`
- 下一步：
  - 接入真实 ESLint（替换占位 lint）
  - 完成 `api-gateway` 模块拆分与契约测试
  - 完成用户端上传/任务接口联调

## 13. 本次执行回填（api-gateway 契约闭环）

- 任务编号：`DEV-20260220-API-01`
- 需求映射：`FR-001/FR-002/FR-005/FR-006`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
- 实施摘要：
  - 新增认证接口：`POST /v1/auth/wechat-login`、`POST /v1/auth/refresh`
  - 完成任务接口最小闭环：`POST/GET /v1/tasks`、`GET /v1/tasks/{taskId}`、`POST /v1/tasks/{taskId}/cancel|retry`、`GET /v1/tasks/{taskId}/result`
  - 完成上传策略接口鉴权与统一响应封装：`POST /v1/assets/upload-policy`
  - 增加 `Idempotency-Key` 约束与基础幂等逻辑（内存态）
  - 新增契约测试：`apps/api-gateway/test/contract.spec.ts`
- 测试证据：
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:contract`：通过（5/5）
- 风险与回滚：
  - 风险：当前为内存态任务存储，重启后数据不保留，仅用于联调阶段
  - 回滚：回退 `apps/api-gateway/src/modules/*` 与 `apps/api-gateway/test/contract.spec.ts` 相关改动
- 当前状态：`In Review`
- 下一步：
  - 接入持久化存储（PostgreSQL + Prisma）替换内存态
  - 接入真实 `userId` 与 token 解析，替换当前联调占位用户
  - 与前端联调 `FE-001/FE-002/FE-004`

## 14. 本次执行回填（FE 联调主链路）

- 任务编号：`DEV-20260220-FE-01`
- 需求映射：`FR-001/FR-002/FR-005/FR-006`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/frontend-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
- 实施摘要：
  - 重构跨端请求层为 `Taro.request`，统一注入 `Authorization`、`X-Request-Id`、`Idempotency-Key`
  - 新增登录服务与会话状态：`/v1/auth/wechat-login` 联调
  - 新增上传策略服务并打通“申请上传策略 -> 创建任务”链路
  - 新增任务列表/取消/重试调用，任务页可触发基础联调动作
- 测试证据：
  - `pnpm --filter @apps/user-frontend typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:contract`：通过（5/5）
  - `pnpm -r typecheck`：通过（15/15）
- 风险与回滚：
  - 风险：H5 产物存在包体告警（`js/app.js` 与入口体积超推荐阈值），需在后续迭代做性能优化
  - 回滚：回退 `apps/user-frontend/src/{services,stores,pages}` 本轮改动
- 当前状态：`In Review`
- 下一步：
  - 在 shared 环境完成 `INT-002` 验收并推进 `INT-003`
  - 优化 H5 包体与依赖拆分，降低首包体积告警

## 15. 本次执行回填（FE 构建阻塞修复）

- 任务编号：`DEV-20260220-FE-02`
- 需求映射：`NFR-006`、`FR-001/FR-002/FR-005/FR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/frontend-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/testing-workflow.md`
- 实施摘要：
  - 修复 Taro H5 构建阻塞：补齐 `@tarojs/shared` 直接依赖，修复 webpack alias 校验失败
  - 增加 `babel.config.js` 与 `babel-preset-taro`/`@babel/preset-react`，恢复 TSX 解析链路
  - 在 Taro 配置补齐 `@ -> src` alias，消除构建期路径解析失败
  - 清理构建产物并补充 `.gitignore`（`apps/user-frontend/.swc`）
- 测试证据：
  - `pnpm --filter @apps/user-frontend typecheck`：通过
  - `pnpm --filter @apps/user-frontend build:h5`：通过（含 2 条包体告警）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（5/5）
  - `pnpm -r typecheck`：通过（15/15）
- 风险与回滚：
  - 风险：H5 首包体积告警（性能风险，非阻塞）
  - 回滚：回退 `apps/user-frontend/{config,src,package.json,babel.config.js}` 与 `pnpm-lock.yaml` 改动
- 当前状态：`In Review`
- 下一步：
  - 在 shared 环境验证 `INT-002` Header 一致性并推进 `INT-003`
  - 制定 H5 包体优化方案（按页面拆包、依赖裁剪）

## 16. 本次执行回填（shared 联调接入准备）

- 任务编号：`DEV-20260221-INT-01`
- 需求映射：`FR-001/FR-002/FR-005/FR-006`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/frontend-framework.md`
- 实施摘要：
  - 新增 shared 联调 smoke 脚本：`apps/api-gateway/scripts/shared-smoke.ts`
  - 新增命令：`pnpm --filter @apps/api-gateway test:shared-smoke`，覆盖 `INT-002/INT-003` 最小验收路径
  - 用户前端接入 shared 环境运行时配置：`API Base URL`、固定联调账号参数（`admin/admin123`）
  - 前端首页登录链路改为读取运行时配置并透传 shared 联调参数
- 测试证据：
  - `pnpm --filter @apps/user-frontend typecheck`：通过
  - `pnpm --filter @apps/user-frontend build:h5`：通过（含 2 条包体告警）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（5/5）
  - `pnpm -r typecheck`：通过（15/15）
  - `pnpm --filter @apps/api-gateway test:shared-smoke`：通过（本地地址 `http://127.0.0.1:3000`）
- 风险与回滚：
  - 风险：云端 shared 地址未就绪，当前仅完成本地 fallback 验收
  - 回滚：回退 `apps/api-gateway/scripts/shared-smoke.ts` 与 `apps/user-frontend/src/config/runtime.ts` 及相关调用
- 当前状态：`In Progress`
- 下一步：
  - 等待阿里云 shared 地址并切换 `SHARED_BASE_URL`
  - 在云端 shared 执行 smoke 并回填 `INT-002/INT-003` 最终验收结果

## 17. 本次执行回填（编辑页蒙版链路）

- 任务编号：`DEV-20260221-FE-03`
- 需求映射：`FR-003/FR-004`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/frontend-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/testing-workflow.md`
- 实施摘要：
  - 后端新增 `POST /v1/tasks/{taskId}/mask` 契约实现（鉴权、幂等头校验、版本递增）
  - 新增契约测试覆盖蒙版版本更新场景（`contract.spec.ts`）
  - 前端编辑页接入“创建任务 -> 提交示例蒙版 -> 进入任务中心”联调路径
  - 前端任务服务新增 `upsertTaskMask` 调用
- 测试证据：
  - `pnpm --filter @apps/api-gateway test:contract`：通过（6/6）
  - `pnpm --filter @apps/user-frontend typecheck`：通过
  - `pnpm --filter @apps/user-frontend build:h5`：通过（含 2 条包体告警）
  - `pnpm -r typecheck`：通过（15/15）
- 风险与回滚：
  - 风险：当前蒙版提交为示例数据链路，真实画笔/多边形编辑器待后续组件化
  - 回滚：回退 `apps/api-gateway/src/modules/tasks/*`、`apps/api-gateway/test/contract.spec.ts`、`apps/user-frontend/src/pages/editor/index.tsx`、`apps/user-frontend/src/services/task.ts`
- 当前状态：`In Progress`
- 下一步：
  - 补充编辑器蒙版交互组件（手动绘制/撤销）
  - 推进 `INT-004` 状态刷新与错误路径联调

## 18. 本次执行回填（任务中心 + 结果页联调闭环）

- 任务编号：`DEV-20260221-FEBE-04`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/frontend-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
- 负责人：前后端联调
- 截止时间：`2026-02-22`
- 当前状态：`In Progress`
- 阻塞项：`BLK-004`（云端 shared 域名待切换）
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/contract.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend/src/services/task.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend/src/pages/tasks/index.tsx`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend/src/pages/result/index.tsx`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend/src/pages/editor/index.tsx`
- 实施摘要：
  - 后端任务列表查询改为单次读取，修复同次请求重复推进状态问题。
  - 后端新增任务状态模拟推进（基于蒙版提交触发）并补充结果 URL 产出，打通 `result` 查询链路。
  - 新增契约测试：`GET /v1/tasks/{taskId}/result` 成功路径。
  - 前端任务中心切换为 `react-query` 轮询，落地 `3s` 轮询与失败退避至 `15s`，并在成功态自动跳转结果页。
  - 前端结果页接入任务详情与结果查询、过期时间展示、预览与复制下载地址。
  - 修复编辑页跳转任务中心在 tabBar 页面上的跨端行为：`navigateTo` 改为 `switchTab`。
- 测试证据：
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`7/7`）
  - `pnpm --filter @apps/user-frontend typecheck`：通过
  - `pnpm --filter @apps/user-frontend build:h5`：通过（2 条包体告警）
  - `pnpm -r typecheck`：通过（`15/15`）
- 联调结果：
  - 本地 fallback（`http://127.0.0.1:3000`）下，任务状态刷新、取消/重试、结果页查询与过期提示链路可执行。
  - `INT-004`、`INT-005` 已进入 `In Progress`，待 shared/staging 继续验收。
- 遗留问题：
  - 云端 shared 域名未切换，尚未完成云端 smoke 证据回填。
  - 当前结果 URL 为联调占位地址，待 MinIO 实际部署后补充真实下载验证。
- 风险与回滚：
  - 风险：状态推进仍为内存态模拟逻辑，重启后任务状态不保留。
  - 回滚：回退本节“改动范围”中的代码与文档变更。
- 下一步：
  - shared 地址可用后执行 `pnpm --filter @apps/api-gateway test:shared-smoke` 并补齐 `INT-004/INT-005` 云端证据。
  - 推进 `FE-003` 编辑器真实绘制交互与 `INT-004/INT-005` shared/staging 验收。

## 19. 本次执行回填（BE-006 动作幂等与冲突互斥）

- 任务编号：`DEV-20260221-BE-06`
- 需求映射：`FR-005/FR-006`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/testing-workflow.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/contract.spec.ts`
- 实施摘要：
  - 为 `POST /v1/tasks/{taskId}/cancel|retry` 增加动作级幂等记录，支持“同 key 同请求”稳定重放。
  - 对“同 key 不同动作或不同 taskId”返回 `40901`，避免重试与取消冲突请求误执行。
  - 对非法状态迁移结果进行幂等固化，确保重复请求返回一致语义。
  - 保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验链路不变。
- 测试证据：
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`10/10`）
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm -r typecheck`：通过（`15/15`）
- 联调结果：
  - 本地 fallback 环境下，`cancel/retry` 重复提交可稳定返回同结果。
  - 复用同一 `Idempotency-Key` 发起跨动作请求可稳定返回 `40901`。
- 遗留问题：
  - 当前并发互斥仍为内存态实现，待持久化后迁移为数据库级约束。
- 风险与回滚：
  - 风险：内存幂等记录在服务重启后丢失，仅满足当前联调阶段。
  - 回滚：回退本节“改动范围”中的代码与文档更新。
- 下一步：
  - shared 域名就绪后执行 smoke，补齐 `INT-004/INT-005` 云端验收。
  - 推进 `BE-003/BE-004` 持久化到 PostgreSQL + Prisma（替换当前文件态存储）。

## 20. 本次执行回填（BE-003 + BE-004 持久化编排基座）

- 任务编号：`DEV-20260221-BE-0304`
- 需求映射：`FR-005/FR-006/FR-008`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/database-design.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/tasks.service.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/contract.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/AGENTS.md`
- 实施摘要：
  - `TasksService` 新增文件态持久化存储（默认 `.runtime/api-gateway/tasks-state.json`），覆盖 `tasks/idempotency/action-idempotency/masks/usage-ledger/outbox-events`。
  - 新增“事务化创建”实现：`POST /v1/tasks` 在单事务中完成 `tasks + usage_ledger(HELD) + outbox_events(task.created)` 写入。
  - 新增状态机迁移中心与乐观锁版本字段（`version`），并提供 `advanceTaskStatus` 内部能力用于 Worker 场景扩展。
  - 状态推进与动作执行统一采用版本校验，避免并发写入导致的状态覆盖。
  - 新增单元测试：覆盖事务创建与乐观锁冲突路径。
  - 新增优化台账文档并在 AGENTS 固化“发现即记录”流程。
- 测试证据：
  - `pnpm --filter @apps/api-gateway test:unit`：通过（`2/2`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`10/10`）
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm -r typecheck`：通过（`15/15`）
- 联调结果：
  - 本地 fallback 环境下，任务创建、状态推进、取消/重试、结果查询链路继续可用。
  - `BE-003/BE-004` 已从 `Backlog` 进入 `In Review`，可支撑下一步 FE 编辑器交互联调。
- 遗留问题：
  - 当前持久化为文件态实现，尚未切换到 PostgreSQL + Prisma。
  - Worker 异步推进仍为 API 模拟路径，待队列化迁移。
- 风险与回滚：
  - 风险：文件态持久化适合本地联调，不适合多实例生产部署。
  - 回滚：回退本节“改动范围”中代码与文档变更。
- 下一步：
  - 基于 `FE-003` 已落地能力推进 `INT-004/INT-005` shared/staging 验收。
  - 推进 `OPT-ARCH-001/OPT-ARCH-002`（PostgreSQL + Worker 编排）进入 `Ready`。

## 21. 本次执行回填（FE-003 真实绘制交互）

- 任务编号：`DEV-20260221-FE-0302`
- 需求映射：`FR-003/FR-004`、`NFR-006`
- 优化项关联：`OPT-FE-001`（已提前执行，`In Review`）、`OPT-FE-002`（Backlog）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/frontend-framework.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/testing-workflow.md`
- 负责人：前端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend/src/pages/editor/index.tsx`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend/src/pages/editor/index.scss`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/AGENTS.md`
- 实施摘要：
  - 编辑页新增真实蒙版交互：`POLYGON/BRUSH` 双模式绘制、闭合多边形、撤销/重做、清空。
  - 绘制点位按画板坐标归一化到 `1920x1080`，并统一提交到 `/v1/tasks/{taskId}/mask`。
  - 新增 `40901` 版本冲突处理：解析服务端版本并提示用户重提。
  - 增加画板区域样式与跨端适配样式；页面重新展示和窗口尺寸变化时重算画板坐标，降低多端坐标偏移风险。
- 测试证据：
  - `pnpm --filter @apps/user-frontend typecheck`：通过
  - `pnpm --filter @apps/user-frontend build:h5`：通过（`2 warnings`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`10/10`）
  - `pnpm -r typecheck`：通过（`15/15`）
- 联调结果：
  - 本地 fallback（`http://127.0.0.1:3000`）下，“创建任务 -> 绘制蒙版 -> 提交蒙版 -> 跳转任务中心”链路可执行。
  - 与 `BE-004` 版本号能力联动生效，冲突提示路径可触发并可恢复提交。
- 遗留问题：
  - 当前点阵绘制采用 DOM 点渲染，长画笔路径下可能产生较多节点，后续可切换 Canvas 渲染优化性能。
  - 云端 shared 地址待切换，尚未补齐该链路云端 smoke 证据。
- 风险与回滚：
  - 风险：当前为 MVP 阶段最小可用绘制能力，精细化选区（平滑笔刷/橡皮擦）未覆盖。
  - 回滚：回退本节“改动范围”中的代码与台账更新。
- 下一步：
  - 推进 `INT-004/INT-005` shared/staging 验收并补齐云端证据。
  - 将 `OPT-FE-002`（Canvas 渲染性能优化）排入 MVP 后优化队列。

## 22. 本次执行回填（INT-004/INT-005 本地 smoke 扩展）

- 任务编号：`DEV-20260221-INT-0405`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006`
- 优化项关联：`OPT-REL-001`（进行中）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/testing-workflow.md`
- 负责人：前后端联调
- 截止时间：`2026-02-22`
- 当前状态：`In Progress`
- 阻塞项：`BLK-004`（云端 shared 域名待切换）
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/scripts/shared-smoke.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 扩展 `test:shared-smoke` 覆盖范围，从 `INT-002/INT-003` 扩大至 `INT-004/INT-005` 本地 fallback 验证。
  - 新增任务链路校验：`创建任务 -> result 未完成前 422 -> 提交蒙版 -> detail 轮询至 SUCCEEDED -> result 返回 resultUrl/expireAt`。
  - 新增错误路径校验：成功态 `cancel` 返回 `42201`，确保状态机非法迁移语义一致。
  - 新增状态机轨迹与进度单调性校验，防止联调期间状态倒退。
- 测试证据：
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`10/10`）
  - 启动本地网关后执行 `pnpm --filter @apps/api-gateway test:shared-smoke`：通过（本地地址 `http://127.0.0.1:3000`）
- 联调结果：
  - 本地 fallback 下 `INT-002~INT-005` 关键路径可复现且通过。
  - 结果链路已验证 `expireAt` 为未来时间，错误码与状态机语义与契约一致。
- 遗留问题：
  - 当前仅完成本地 fallback 证据；shared/staging 云端验收待域名切换后补齐。
  - 结果 URL 仍为联调占位地址，待 MinIO 实际部署后补充真实下载验证。
- 风险与回滚：
  - 风险：当前 smoke 仍为单环境脚本，尚未形成 `dev/shared/staging` 一键矩阵。
  - 回滚：回退 `apps/api-gateway/scripts/shared-smoke.ts` 与本节文档回填。
- 下一步：
  - 待阿里云地址提供后，执行同脚本进行 shared/staging 验收并更新 `INT-004/INT-005` 状态。
  - 基于矩阵脚本接入 shared/staging 地址并沉淀跨环境 smoke 报告对比。

## 23. 本次执行回填（OPT-REL-001 多环境 smoke 矩阵脚本）

- 任务编号：`DEV-20260221-REL-01`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006`
- 优化项关联：`OPT-REL-001`（已进入 `In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/testing-workflow.md`
- 负责人：后端 + 运维协作
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：`BLK-004`（shared/staging 云端地址待提供）
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/scripts/shared-smoke-matrix.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/.gitignore`
  - `/Users/codelei/Documents/ai-project/remove-watermark/AGENTS.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 新增 `shared-smoke-matrix` 脚本，默认按 `dev -> shared -> staging` 目标执行；支持 `SMOKE_MATRIX_TARGETS` 自定义目标列表。
  - 脚本新增环境预检（`/v1/system/capabilities`）与逐目标执行耗时统计。
  - 每次执行自动输出 Markdown 报告到 `apps/api-gateway/.runtime/reports/`。
  - 新增命令：`pnpm --filter @apps/api-gateway test:shared-smoke:matrix`。
  - 为运行产物补充忽略规则：`.gitignore` 增加 `apps/api-gateway/.runtime/`。
- 测试证据：
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`10/10`）
  - 启动本地网关后执行 `pnpm --filter @apps/api-gateway test:shared-smoke:matrix`：通过（`dev=passed`）
  - `pnpm -r typecheck`：通过（`15/15`）
- 联调结果：
  - 本地 fallback 已可一键输出 smoke 矩阵结果与报告文件。
  - 现阶段矩阵验证覆盖 `dev` 目标，shared/staging 将在云端地址可达后补齐。
- 遗留问题：
  - shared/staging 地址尚未提供，无法完成跨环境对比报告。
  - 目前矩阵为串行执行，后续可按环境独立性评估并发执行能力。
- 风险与回滚：
  - 风险：若 shared/staging 地址不可达，矩阵命令会按失败退出，需在 CI 中配置目标环境变量。
  - 回滚：回退 `shared-smoke-matrix.ts`、`package.json` 命令与台账更新。
- 下一步：
  - 等待你提供阿里云 shared/staging 地址后，执行完整矩阵并回填环境对比结果。
  - 根据结果评估是否把矩阵脚本接入 CI 发布前 smoke 门禁。

## 24. 本次执行回填（INT-004/INT-005 验收口径调整）

- 任务编号：`DEV-20260221-INT-0405-EXCEPTION`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/testing-workflow.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
- 负责人：前后端联调
- 截止时间：`2026-02-21`
- 当前状态：`In Review`
- 阻塞项：`BLK-004`（已转发布前门禁，不阻塞当前阶段联调推进）
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 根据项目阶段决策，`INT-004/INT-005` 当前阶段采用本地 smoke 证据作为验收依据。
  - 将云端 shared/staging 验证调整为发布前最终门禁执行，不作为当前迭代阻塞项。
  - 更新任务状态：`INT-004/INT-005` 从 `In Progress` 调整为 `In Review`。
- 测试证据：
  - `pnpm --filter @apps/api-gateway test:shared-smoke`：通过（本地 fallback）
  - `pnpm --filter @apps/api-gateway test:shared-smoke:matrix`：通过（`dev=passed`）
- 联调结果：
  - 本地联调覆盖 `INT-002~INT-005` 关键链路，当前阶段验收条件满足。
- 遗留问题：
  - 云端域名与认证链路尚未执行；需在发布前最后一步补齐并留存证据。
- 风险与回滚：
  - 风险：若发布前云端认证与本地行为存在差异，可能引入临发布修正成本。
  - 回滚：恢复 `INT-004/INT-005` 为 `In Progress` 并恢复 `BLK-004` 为当前阻塞项。
- 下一步：
  - 发布前最后一步执行 shared/staging 云端 smoke 与认证验收并回填结果。

## 25. 本次执行回填（OPT-ARCH-001 Prisma 持久化基座）

- 任务编号：`DEV-20260221-BE-0304-PRISMA`
- 需求映射：`FR-005/FR-006/FR-008`、`NFR-006`
- 优化项关联：`OPT-ARCH-001`（`In Progress`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-db-standards.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Progress`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/schema.prisma`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/migrations/20260221211500_init_tasks_store/migration.sql`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/common/prisma.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/app.module.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/.env.example`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/tasks.service.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/contract.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/pnpm-lock.yaml`
  - `/Users/codelei/Documents/ai-project/remove-watermark/AGENTS.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 新增 Prisma schema 与初始化 DDL，覆盖 `tasks/task_masks/idempotency_keys/task_action_idempotency/usage_ledger/outbox_events`。
  - `TasksService` 新增 Prisma 持久化分支（`TASKS_STORE=prisma` 或 `DATABASE_URL`）并保留文件态回退路径。
  - 任务创建、动作幂等、状态机迁移与乐观锁能力已接入数据库事务语义。
  - 新增 `PrismaService` 与模块注入；新增 `prisma:generate/migrate:dev/push` 命令。
  - 修复 `seedFailedTask` 在 Prisma 分支的异步等待问题，避免测试与调用提前返回。
- 测试证据：
  - `pnpm --filter @apps/api-gateway prisma:generate`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma`：通过（`No pending migrations`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark TASKS_STORE=prisma pnpm --filter @apps/api-gateway test:shared-smoke`：通过
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:unit`：通过（`2/2`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`10/10`）
- 联调结果：
  - 在 `NODE_ENV=test` 路径下，现有契约与幂等行为保持兼容，无回归。
  - Prisma 持久化分支在本地 PostgreSQL + 本地 smoke 路径可稳定通过（含 `INT-002~INT-005`）。
  - 服务重启后通过接口仍可读取已创建任务（`GET /v1/tasks total=2`），验证持久化生效。
- 遗留问题：
  - shared/staging 云端 PostgreSQL 尚未执行 smoke，对应环境证据待发布前门禁补齐。
  - Worker 队列化推进（`OPT-ARCH-002`）尚未接入，状态推进仍有 API 模拟路径。
- 风险与回滚：
  - 风险：若直接切换 `TASKS_STORE=prisma` 且 DB 连接不可用，会导致 API 启动后首次持久化访问失败。
  - 回滚：将 `TASKS_STORE` 切回默认文件态，并回退本节改动文件。
- 下一步：
  - 在本地 PostgreSQL 执行 `prisma migrate dev` 后跑 `test:shared-smoke`，补齐 `integration/smoke` 证据。
  - 推进 `OPT-ARCH-002`，将状态推进从 API 模拟路径迁移到 Worker 编排。

## 26. 本次执行回填（OPT-ARCH-002 Worker 编排去副作用）

- 任务编号：`DEV-20260221-ARCH-02`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Progress`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Progress`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/main.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/scripts/shared-smoke.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/pnpm-lock.yaml`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - `worker-orchestrator` 新增轮询编排循环：扫描可推进任务，按状态机逐步推进 `QUEUED -> ... -> SUCCEEDED`。
  - Worker 在 `SUCCEEDED` 时写入 `usage_ledger(COMMITTED)` 与 `outbox_events(task.succeeded)`，与事务语义保持一致。
  - `api-gateway` Prisma 查询路径移除状态推进副作用：`GET /v1/tasks` 与 `GET /v1/tasks/{taskId}` 仅查询，不再驱动状态迁移。
  - `shared-smoke` 增加轮询间隔，兼容“状态由 Worker 异步推进”的真实时序。
- 测试证据：
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:unit`：通过（`2/2`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`10/10`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma`：通过（`No pending migrations`）
  - 启动 `api-gateway(TASKS_STORE=prisma)` + `worker-orchestrator` 后执行 `pnpm --filter @apps/api-gateway test:shared-smoke`：通过
- 联调结果：
  - 本地双进程下 `INT-002~INT-005` 主链路可通过，状态推进由 Worker 异步完成。
  - API 查询链路不再承担推进职责，读路径副作用风险已收敛。
- 遗留问题：
  - 当前编排为 DB 轮询模式，尚未接入 Redis/BullMQ 队列消费（队列化能力待下一阶段）。
  - shared/staging 云端仍需按同样双进程模式补齐验收证据。
- 风险与回滚：
  - 风险：若 Worker 未运行，任务将停留在 `PREPROCESSING/QUEUED` 等中间态。
  - 回滚：回退 `worker-orchestrator` 本轮改动，并恢复 `TasksService` 查询路径推进逻辑。
- 下一步：
  - 接入 Redis/BullMQ，替换当前 DB 轮询为消息驱动编排。
  - 在你提供云端地址后执行 shared/staging 双进程 smoke，并更新 `INT-004/INT-005` 与 `OPT-ARCH-002` 状态。

## 27. 本次执行回填（OPT-ARCH-002 Redis/BullMQ 消息驱动）

- 任务编号：`DEV-20260221-ARCH-02-QUEUE`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/main.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/scripts/shared-smoke.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/pnpm-lock.yaml`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - `worker-orchestrator` 升级为 Redis/BullMQ 驱动：新增 outbox 轮询分发（`task.created/task.retried` -> queue）。
  - 新增 BullMQ consumer 任务推进逻辑：按状态机逐步推进，并在成功时写入 `usage_ledger(COMMITTED)` 与 `outbox(task.succeeded)`。
  - 支持 `REDIS_URL/QUEUE_NAME` 环境变量，默认本地 `redis://127.0.0.1:6379`。
  - 为异步队列时序调整 `shared-smoke`：新增 `SHARED_SMOKE_MAX_POLL_ATTEMPTS`，提高状态轮询稳定性。
- 测试证据：
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:unit`：通过（`2/2`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`10/10`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma`：通过
  - 启动 `api-gateway(TASKS_STORE=prisma)` + `worker-orchestrator(REDIS_URL=redis://127.0.0.1:6379)` 后执行 `pnpm --filter @apps/api-gateway test:shared-smoke`：通过
- 联调结果：
  - 本地双进程模式下 `INT-002~INT-005` 可通过，状态推进来源稳定为 Worker 队列消费。
  - outbox 触发事件可发布为 queue job 并消费，任务可从 `QUEUED` 推进至 `SUCCEEDED`。
- 遗留问题：
  - 当前仅完成本地 Redis 验证，shared/staging 云端 Redis 与双进程部署证据待补齐。
  - 尚未接入 deadletter 与运维回放能力，队列失败治理能力待下一轮完善。
- 风险与回滚：
  - 风险：若 Redis 不可用，outbox 事件会持续留在 `PENDING` 并触发重试日志。
  - 回滚：回退 `worker-orchestrator` 的 BullMQ 分发/消费改动，恢复上一版编排实现。
- 下一步：
  - 补充 shared/staging 双进程 smoke 与云端 Redis 连通验证。
  - 推进 deadletter/重试上限与告警指标（`queue_depth`、`dispatch_fail_rate`）。

## 28. 本次执行回填（OPT-ARCH-002 deadletter/retry 策略落地）

- 任务编号：`DEV-20260221-ARCH-02-DLQ`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/main.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 新增 Worker 重试策略配置并落地默认值：`ORCHESTRATOR_MAX_RETRIES=2`（总尝试 3 次）、指数退避、`ORCHESTRATOR_RETRY_JITTER_RATIO=0.2`。
  - 将不可重试场景（如 `NOT_FOUND`、`NO_PLAN`）改为抛出 `UnrecoverableError`，直接进入死信队列，不再走重试链路。
  - 新增 deadletter 队列（默认 `QUEUE_NAME.deadletter`）与死信持久化负载，覆盖 Worker 最终失败与 outbox 超重试上限场景。
  - outbox 分发新增 `ORCHESTRATOR_OUTBOX_MAX_RETRIES=2`，超过阈值时将事件状态更新为 `DEAD` 并写入 deadletter。
  - 新增死信告警窗口基线：`600s` 窗口、`1%` 比例阈值、最小样本数门槛，超过阈值输出告警日志。
- 测试证据：
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:unit`：通过（`2/2`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`10/10`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma`：通过
  - 启动 `api-gateway(TASKS_STORE=prisma)` + `worker-orchestrator(REDIS_URL=redis://127.0.0.1:6379)` 后执行 `pnpm --filter @apps/api-gateway test:shared-smoke`：通过
- 联调结果：
  - 本地双进程 smoke 继续通过，`INT-002~INT-005` 主链路无回归。
  - 队列失败治理路径从“仅日志”升级为“可重试 + 可死信 + 可告警”。
- 遗留问题：
  - 当前仅落地 deadletter 持久化与告警，尚未提供运维侧“手动重放”命令封装。
  - shared/staging 云端 Redis 双进程证据仍需在发布前门禁补齐。
- 风险与回滚：
  - 风险：重试与死信阈值配置不当会影响失败恢复速度与队列噪声。
  - 回滚：回退 `apps/worker-orchestrator/src/main.ts` 本轮策略改动，恢复上一版 queue consumer 行为。
- 下一步：
  - 增加 deadletter 手动重放脚本（按 `taskId/eventId` 重投）并补充运维 SOP。
  - 在 shared/staging 按同策略执行双进程 smoke，补齐云端验收证据。

## 29. 本次执行回填（OPT-ARCH-002 deadletter 手动重放能力）

- 任务编号：`DEV-20260221-ARCH-02-REPLAY`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/ops/deadletter-replay.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 新增运维命令：`pnpm --filter @apps/worker-orchestrator ops:deadletter:replay`。
  - 新增 deadletter 重放脚本：支持按 `DLQ_JOB_ID`、`DLQ_TASK_ID`、`DLQ_EVENT_ID` 精准筛选。
  - 支持双路径重放：
    - `task.progress` 死信重投回主队列；
    - `outbox.dispatch` 死信将 outbox 事件从 `DEAD`/异常态复位为 `PENDING`（并清零 `retryCount`）。
  - 默认 `DLQ_DRY_RUN=true`，先演练再执行；支持 `DLQ_DELETE_AFTER_REPLAY` 控制重放后是否删除死信记录。
- 测试证据：
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
  - `DLQ_DRY_RUN=true DLQ_REPLAY_MAX_SCAN=20 DLQ_REPLAY_MAX_COUNT=5 REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @apps/worker-orchestrator ops:deadletter:replay`：通过
- 联调结果：
  - 本地环境下脚本可成功连接 Redis 并执行 dry-run 扫描流程，返回结构化执行结果。
- 遗留问题：
  - 目前仅提供命令行脚本，尚未接入管理端可视化重放入口。
  - shared/staging 云端环境仍待补充真实 deadletter 样本回放证据。
- 风险与回滚：
  - 风险：误操作可能重复重放同一死信记录，造成额外队列负载。
  - 回滚：回退 `src/ops/deadletter-replay.ts` 与 `package.json` 新增命令及相关台账更新。
- 下一步：
  - 增加“按时间窗口批量重放 + 最大重放并发”参数，降低人工筛选成本。
  - shared/staging 拿到云端地址后，补齐 deadletter 实样回放证据并更新 `OPT-ARCH-002` 状态。

## 30. 本次执行回填（OPT-ARCH-002 deadletter 批量重放增强）

- 任务编号：`DEV-20260221-ARCH-02-REPLAY-BATCH`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/ops/deadletter-replay.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 重放脚本新增来源过滤：`DLQ_SOURCE=all|task.progress|outbox.dispatch`。
  - 新增时间窗口筛选：`DLQ_LOOKBACK_MINUTES`，并支持 `DLQ_CREATED_AFTER` / `DLQ_CREATED_BEFORE` 绝对时间边界。
  - 新增并发重放参数：`DLQ_REPLAY_CONCURRENCY`，按批次并发执行重放以缩短恢复时间。
  - 保持默认安全策略：`DLQ_DRY_RUN=true`，并保留 `DLQ_DELETE_AFTER_REPLAY` 开关。
- 测试证据：
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
  - `DLQ_DRY_RUN=true DLQ_SOURCE=all DLQ_LOOKBACK_MINUTES=1440 DLQ_REPLAY_CONCURRENCY=4 DLQ_REPLAY_MAX_SCAN=100 DLQ_REPLAY_MAX_COUNT=20 REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @apps/worker-orchestrator ops:deadletter:replay`：通过
- 联调结果：
  - 本地 Redis 环境下脚本可按新增参数完成筛选与执行，日志输出包含过滤边界和并发配置。
- 遗留问题：
  - 仍缺 shared/staging 云端 deadletter 样本验证（当前仅 dry-run 证据）。
  - 尚未实现“执行前二次确认”机制（当前依赖 dry-run 与参数约束）。
- 风险与回滚：
  - 风险：并发值设置过高可能放大瞬时队列写入压力。
  - 回滚：回退 `deadletter-replay.ts` 本轮增强与台账更新，恢复单线程重放模式。
- 下一步：
  - 增加并发上限保护与执行前阈值告警（如超过 `N` 条需显式确认参数）。
  - shared/staging 环境切换后补齐真实样本回放证据，并推动 `OPT-ARCH-002` 进入 `Done` 评审。

## 31. 本次执行回填（OPT-ARCH-002 deadletter 并发上限保护）

- 任务编号：`DEV-20260221-ARCH-02-REPLAY-GUARD`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/ops/deadletter-replay.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 新增并发保护策略：`DLQ_REPLAY_CONCURRENCY` 默认受硬上限 `10` 约束。
  - 新增显式提权开关：`DLQ_ALLOW_HIGH_CONCURRENCY=true` 时并发上限可临时提升到 `20`。
  - 当请求并发超过当前上限时，脚本自动钳制并输出警告日志，避免误操作放大恢复风险。
- 测试证据：
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
  - `DLQ_DRY_RUN=true DLQ_REPLAY_CONCURRENCY=20 DLQ_ALLOW_HIGH_CONCURRENCY=false ... ops:deadletter:replay`：通过（日志显示 `replayConcurrency=10`）
  - `DLQ_DRY_RUN=true DLQ_REPLAY_CONCURRENCY=20 DLQ_ALLOW_HIGH_CONCURRENCY=true ... ops:deadletter:replay`：通过（日志显示 `replayConcurrency=20`）
- 联调结果：
  - 本地 Redis dry-run 下，默认与提权两种并发策略均按预期生效。
- 遗留问题：
  - 仍缺 shared/staging 云端 deadletter 实样本回放证据。
  - 目前“提权到 20”仅靠环境变量控制，尚未接入审批流。
- 风险与回滚：
  - 风险：若运维误开高并发开关，仍可能在高负载时造成瞬时压力抬升。
  - 回滚：回退 `deadletter-replay.ts` 并发上限相关改动与台账更新，恢复上一版并发配置策略。
- 下一步：
  - 增加“高并发开关+批量数量”联动阈值告警（超过阈值直接拒绝执行）。
  - shared/staging 环境补齐真实样本回放并观察 Redis/DB 指标后，决定是否调整默认上限。

## 32. 本次执行回填（OPT-ARCH-002 高并发批量阻断保护）

- 任务编号：`DEV-20260221-ARCH-02-REPLAY-BLOCK`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/ops/deadletter-replay.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 新增联动阻断策略：在 `DLQ_ALLOW_HIGH_CONCURRENCY=true` 且并发超过默认上限场景下，若匹配重放数量达到阈值（`DLQ_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD`，默认 `50`）且未显式确认（`DLQ_ALLOW_HIGH_CONCURRENCY_BULK_REPLAY=true`），脚本直接拒绝执行。
  - 阻断日志会输出匹配数量、并发值、阈值与确认开关状态，便于审计。
  - 保持默认安全策略不变：`DLQ_DRY_RUN=true`。
- 测试证据：
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
  - 构造 1 条测试 deadletter 后执行：
    - `DLQ_DRY_RUN=false DLQ_JOB_ID=<test-job> DLQ_ALLOW_HIGH_CONCURRENCY=true DLQ_REPLAY_CONCURRENCY=20 DLQ_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD=1 DLQ_ALLOW_HIGH_CONCURRENCY_BULK_REPLAY=false pnpm --filter @apps/worker-orchestrator ops:deadletter:replay`
    - 结果：`Exit 1`，报错 `high-concurrency bulk replay is blocked...`（符合预期）
  - 测试后已清理临时 deadletter 记录。
- 联调结果：
  - 本地 Redis 环境下，阻断机制可稳定触发，避免高并发批量误操作直接执行。
- 遗留问题：
  - shared/staging 云端 deadletter 样本阻断证据待补齐。
  - 阻断确认仍基于环境变量，后续可考虑审批流或签名令牌。
- 风险与回滚：
  - 风险：阈值设置过低可能阻碍紧急恢复，需配合运维 SOP 使用显式确认开关。
  - 回滚：回退 `deadletter-replay.ts` 联动阻断逻辑与文档更新。
- 下一步：
  - 在 shared/staging 补齐真实样本阻断与放行演练证据。
  - 基于云端观测结果，评估 `DLQ_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD` 的默认值是否需要调整。

## 33. 本次执行回填（OPT-ARCH-002 阻断/放行一键演练脚本）

- 任务编号：`DEV-20260221-ARCH-02-REPLAY-DRILL`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/ops/deadletter-guard-drill.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 新增一键演练命令：`pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill`。
  - 脚本流程：自动创建 drill outbox + deadletter 样本，执行“阻断校验（预期失败）”与“放行校验（预期成功）”，最后自动清理样本数据。
  - 放行成功后自动校验 outbox 是否恢复为 `PENDING` 且 `retryCount=0`，并校验 deadletter 样本已删除。
- 测试证据：
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill`：通过（阻断 `status=1`、放行 `status=0`）
- 联调结果：
  - 本地环境已具备可重复执行的“阻断 + 放行 + 清理”演练脚本，后续 shared/staging 仅需切换环境变量即可复用。
- 遗留问题：
  - shared/staging 云端数据库与 Redis 尚未切换，云端验收证据待补齐。
  - 当前演练仍为命令行入口，尚未接入管理端可视化操作。
- 风险与回滚：
  - 风险：若在云端误用生产级连接执行演练，可能产生额外审计噪声。
  - 回滚：回退 `deadletter-guard-drill.ts` 与 `package.json` 新增命令及台账更新。
- 下一步：
  - 切换 shared/staging 后执行同一命令生成云端演练证据并回填。
  - 基于云端数据决定 `DLQ_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD` 默认值是否调整。

## 34. 本次执行回填（OPT-ARCH-002 演练矩阵与报告能力）

- 任务编号：`DEV-20260221-ARCH-02-REPLAY-MATRIX`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无（当前阶段使用本地地址映射 shared/staging）
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/ops/deadletter-guard-drill-matrix.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/.gitignore`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 新增矩阵命令：`pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill:matrix`。
  - 支持默认目标解析：
    - `dev`：`DEV_DATABASE_URL/DEV_REDIS_URL`（或回退 `DATABASE_URL/REDIS_URL`）
    - `shared`：`SHARED_DATABASE_URL/SHARED_REDIS_URL`
    - `staging`：`STAGING_DATABASE_URL/STAGING_REDIS_URL`
  - 支持自定义目标：`DRILL_MATRIX_TARGETS=name=databaseUrl|redisUrl,...`。
  - 支持报告输出：默认写入 `apps/worker-orchestrator/.runtime/reports/`（可用 `DRILL_MATRIX_WRITE_REPORT=0` 关闭写文件）。
  - `.gitignore` 新增 `apps/worker-orchestrator/.runtime/`，避免运行产物污染仓库。
- 测试证据：
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
  - `DEV_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark DEV_REDIS_URL=redis://127.0.0.1:6379 DRILL_MATRIX_WRITE_REPORT=0 pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill:matrix`：通过（`dev=passed`）
- 联调结果：
  - 本地已可一键输出矩阵执行结果；同命令可迁移至 shared/staging 补齐云端证据。
- 遗留问题：
  - shared/staging 云端地址尚未切换，当前为本地地址映射证据。
- 风险与回滚：
  - 风险：若目标配置错误，矩阵命令会按失败退出并阻断流程。
  - 回滚：回退 `deadletter-guard-drill-matrix.ts`、`package.json` 命令和 `.gitignore` 调整。
- 下一步：
  - 云端 shared/staging 地址可用后，复用同矩阵命令补齐云端证据。
  - 若云端稳定，推进 `OPT-ARCH-002` 进入 `Done` 评审。

## 35. 本次执行回填（OPT-ARCH-002 矩阵演练三目标验收-本地映射）

- 任务编号：`DEV-20260221-ARCH-02-REPLAY-MATRIX-LOCAL`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`In Review`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 按阶段策略将 `shared/staging` 的 PostgreSQL 与 Redis 映射到本地地址执行矩阵演练。
  - 使用同一命令覆盖 `dev/shared/staging` 三目标并生成报告文件。
  - 确认“阻断+放行+清理”闭环在三目标均可复用执行。
- 测试证据：
  - `DEV_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark DEV_REDIS_URL=redis://127.0.0.1:6379 SHARED_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark SHARED_REDIS_URL=redis://127.0.0.1:6379 STAGING_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark STAGING_REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill:matrix`：通过（`dev/shared/staging` 全绿）
  - 报告文件：`apps/worker-orchestrator/.runtime/reports/deadletter-guard-drill-matrix-2026-02-21T14-25-47-376Z.md`
- 联调结果：
  - 当前阶段可用本地映射方式完成 shared/staging 口径演练验收，不阻塞后续迭代。
- 遗留问题：
  - 云端 shared/staging 尚未切换，最终发布前仍需云端同命令复验并留证。
- 风险与回滚：
  - 风险：本地映射无法覆盖云端网络与权限边界差异。
  - 回滚：回退本次文档回填记录，恢复到仅 dev 目标证据状态。
- 下一步：
  - 获取云端地址后复跑同矩阵命令，补齐发布前门禁证据。
  - 若云端同样通过，将 `OPT-ARCH-002` 状态推进到 `Done`。

## 36. 本次执行回填（OPT-ARCH-002 收尾发布前检查清单-可 Done 版）

- 任务编号：`DEV-20260221-ARCH-02-DOD-CHECKLIST`
- 需求映射：`FR-005/FR-006/FR-007`、`NFR-006/NFR-007`
- 优化项关联：`OPT-ARCH-002`（`Done`）
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/project-constraints.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-02-22`
- 当前状态：`Done`
- 阻塞项：无（云端部署认证保留在 `BLK-004` 发布前门禁执行）
- 风险等级：低
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/mvp-optimization-backlog.md`
- 实施摘要：
  - 基于既有 `deadletter` 治理能力、重放能力、一键演练脚本、矩阵脚本与本地映射三目标结果，形成 `OPT-ARCH-002` 收尾版发布前检查清单。
  - 按 `DoD` 与发布门禁模板逐项核验，明确“可 Done”与“云端最终认证”边界。
  - 将优化台账状态更新为 `Done`，并保持发布前云端复验任务在门禁清单中独立追踪。
- 测试证据：
  - `pnpm -r typecheck`：通过
  - `pnpm -r lint`：通过
  - `DEV_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark DEV_REDIS_URL=redis://127.0.0.1:6379 SHARED_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark SHARED_REDIS_URL=redis://127.0.0.1:6379 STAGING_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark STAGING_REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill:matrix`：通过（`dev/shared/staging-local` 全绿）
  - 报告文件：`apps/worker-orchestrator/.runtime/reports/deadletter-guard-drill-matrix-2026-02-21T14-40-27-957Z.md`
- 联调结果：
  - 当前迭代范围内，`worker-orchestrator` 已满足状态机推进与失败治理闭环，联调口径可进入发布前门禁阶段。
- 发布前检查清单（可 Done 版本）：
  - [x] 真源一致性检查通过
  - [x] 关键链路测试通过
  - [x] P0/P1 清零（当前范围：`OPT-ARCH-002`）
  - [x] 联调阻塞项已清零或有审批例外（`BLK-004` 已转发布前门禁）
  - [x] 回填记录完整
  - [x] 回滚方案可执行
- 遗留问题：
  - 发布前最后一步需在云端地址执行同矩阵命令，补齐部署与认证边界证据。
- 风险与回滚：
  - 风险：若云端网络或鉴权策略与本地映射不一致，可能出现发布前门禁失败。
  - 回滚：回退 `OPT-ARCH-002` 状态至 `In Review`，并按 `BLK-004` 流程补齐修复后再评审。
- 下一步：
  - 等待你提供阿里云地址后，执行云端矩阵复验并追加证据。
  - 保持 `OPT-ARCH-002` 为 `Done`，云端证据归并到发布前总验收记录。

## 37. 本次执行回填（DATA-002 套餐种子数据初始化）

- 任务编号：`DEV-20260221-DATA-002-SEED`
- 需求映射：`FR-008`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/database-design.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-db-standards.md`
- 负责人：后端
- 截止时间：`2026-03-01`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：低
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/schema.prisma`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/migrations/20260221233000_add_plans_seed/migration.sql`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/seed-plans.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/plans/plans.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/plans/plans.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/app.module.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/.env.example`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/contract.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 新增 `plans` Prisma 模型与迁移脚本，初始化 `free/pro_month/pro_year` 三档套餐种子。
  - 新增 `prisma:seed:plans` 命令，支持幂等重放套餐种子初始化。
  - 新增 `PlansService`：优先读取 PostgreSQL `plans`，不可用时回退内置默认套餐，保证联调稳定性。
  - `GET /v1/plans` 控制器改为服务化读取，补齐契约测试覆盖。
- 测试证据：
  - `pnpm --filter @apps/api-gateway prisma:generate`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway prisma:seed:plans`：通过（`seeded plans=3`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`11/11`）
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm -r typecheck`：通过
  - `pnpm -r lint`：通过
- 联调结果：
  - 当前本地口径下，`/v1/plans` 已满足“DB 种子驱动 + 默认回退”双路径，可支撑 FE-006 前置联调。
- 遗留问题：
  - `subscriptions/usage` 相关接口仍在后续 `BE-007/INT-006` 任务范围内。
- 风险与回滚：
  - 风险：若后续套餐字段扩展与 `api-spec.md` 不同步，可能出现字段语义漂移。
  - 回滚：回退 `add_plans_seed` 迁移、`PlansService` 与控制器改造，恢复静态套餐返回。
- 下一步：
  - 按计划推进 `DATA-003`（幂等与账务去重索引校验）并补齐集成证据。
  - 准备 `BE-007` 最小接口骨架（`/v1/subscriptions/*`、`/v1/usage/me`）。

## 38. 本次执行回填（DATA-003 去重索引校验）

- 任务编号：`DEV-20260221-DATA-003-DEDUPE`
- 需求映射：`FR-005/FR-008`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/database-design.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-db-standards.md`
- 负责人：后端
- 截止时间：`2026-03-02`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：低
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/schema.prisma`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/migrations/20260221235500_add_usage_ledger_dedupe_index/migration.sql`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/scripts/data-dedupe-index-check.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator/src/main.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 为 `usage_ledger` 新增唯一去重索引：`(user_id, task_id, status, source)`。
  - 新增 `test:data-dedupe-index` 校验脚本，覆盖 `idempotency_keys/outbox_events/usage_ledger` 三表去重约束存在性与冲突行为（第二次写入返回 0）。
  - 将 `tasks.service` 与 `worker-orchestrator` 的 `usage_ledger` 写入改为 `createMany + skipDuplicates`，确保重放/并发下写入幂等。
- 测试证据：
  - `pnpm --filter @apps/api-gateway prisma:generate`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma`：通过（应用 `20260221235500_add_usage_ledger_dedupe_index`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway test:data-dedupe-index`：通过（`idempotency/usage/outbox` 去重结果 `1,0`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`11/11`）
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/worker-orchestrator typecheck`：通过
- 联调结果：
  - 本地 PostgreSQL 下，账务流水与幂等/事件表均可稳定防重，满足当前阶段 `DATA-003` 口径。
- 遗留问题：
  - 云端 shared/staging 仍需在发布前门禁补齐同口径校验证据。
- 风险与回滚：
  - 风险：若后续业务需要同一 `task/status/source` 多条账务记录，需先调整唯一键设计再发布。
  - 回滚：回退 `add_usage_ledger_dedupe_index` 迁移与 `createMany+skipDuplicates` 写入路径，恢复原 `create` 写入逻辑。
- 下一步：
  - 推进 `BE-007` 商业化接口最小骨架（`/v1/subscriptions/*`、`/v1/usage/me`）。
  - 将 `DATA-003` 校验命令接入后续 shared/staging smoke 门禁。

## 39. 本次执行回填（BE-007 商业化接口最小骨架）

- 任务编号：`DEV-20260221-BE-007-SKELETON`
- 需求映射：`FR-008`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-04-05`
- 当前状态：`In Progress`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/schema.prisma`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/migrations/20260222002000_add_subscriptions_table/migration.sql`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/subscriptions/subscriptions.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/subscriptions/subscriptions.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/usage/usage.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/app.module.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/.env.example`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/contract.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 新增 `subscriptions` 表与 Prisma 模型，补齐订阅最小持久化结构（订单号唯一约束、状态/渠道约束、用户维度索引）。
  - 新增 `SubscriptionsService`，实现 `checkout`、`getMySubscription`、`getMyUsage`（支持 Prisma 优先与回退路径）。
  - 新增控制器接口：`POST /v1/subscriptions/checkout`、`GET /v1/subscriptions/me`、`GET /v1/usage/me`。
  - 修复 `SubscriptionsService` 依赖注入（显式 `@Inject`），消除 contract 运行时注入不稳定问题。
  - 补充契约测试覆盖上述三条接口。
- 测试证据：
  - `pnpm --filter @apps/api-gateway prisma:generate`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate status --schema prisma/schema.prisma`：通过（数据库 schema up to date，包含 `20260222002000_add_subscriptions_table`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`14/14`）
  - `pnpm --filter @apps/api-gateway typecheck`：通过
- 联调结果：
  - 本地地址口径下，订阅创建、当前订阅查询与配额查询已可联调，支持 FE-006 前置对接。
- 遗留问题：
  - `BE-007` 中“账务对账任务”尚未实现，`INT-006` 仍未进入验收。
- 风险与回滚：
  - 风险：当前 `checkout` 为本地模拟支付载荷，尚未接入真实支付回调与订阅状态确认链路。
  - 回滚：回退 `add_subscriptions_table` 迁移、订阅/配额服务与控制器、契约测试新增用例，恢复到仅 `plans` 能力。
- 下一步：
  - 继续推进 `BE-007` 第二阶段：账务对账任务与订阅状态确认闭环。
  - 准备 `INT-006` 的最小联调脚本与验收标准（本地优先、云端发布前复验）。

## 40. 本次执行回填（BE-007 第二阶段：按月聚合 + 小时增量 + 日终全量框架）

- 任务编号：`DEV-20260221-BE-007-RECON`
- 需求映射：`FR-008`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/database-design.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 负责人：后端
- 截止时间：`2026-04-05`
- 当前状态：`In Review`
- 阻塞项：无
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/schema.prisma`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/migrations/20260222013500_add_billing_reconciliation_tables/migration.sql`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/billing-service/src/reconciliation/job.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/billing-service/src/main.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/billing-service/test/reconciliation.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/billing-service/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 新增对账基础数据表：
    - `billing_reconcile_monthly`（用户-月份聚合）
    - `billing_reconcile_checkpoints`（小时增量水位）
    - `billing_reconcile_runs`（运行审计）
  - 在 `billing-service` 落地对账任务核心：
    - `hourly-incremental`：按 checkpoint 增量扫描 `usage_ledger`，回写月聚合并校验一致性
    - `daily-full`：全量重建月聚合（框架）并做结果一致性比对
  - 新增作业命令：
    - `pnpm --filter @apps/billing-service job:reconcile:hourly`
    - `pnpm --filter @apps/billing-service job:reconcile:daily`
  - 新增 integration 测试覆盖两种模式的最小闭环。
- 测试证据：
  - `pnpm --filter @apps/api-gateway prisma:generate`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma`：通过（应用 `20260222013500_add_billing_reconciliation_tables`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/billing-service test:integration`：通过（`1/1`）
  - `pnpm --filter @apps/billing-service typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`14/14`）
  - `pnpm -r typecheck`：通过
- 联调结果：
  - 本地地址口径下，`plans/subscriptions/usage` 与对账任务可形成可验证链路，满足 `INT-006` 前置联调准备。
- 遗留问题：
  - 订阅支付回调与状态确认闭环尚未接入（影响真实扣费状态核验）。
  - shared/staging 云端地址仍需在发布前门禁补齐同口径对账作业证据。
- 风险与回滚：
  - 风险：当前增量水位基于 `consume_at + ledger_id`，若后续写入语义变化需同步调整 checkpoint 规则。
  - 回滚：回退 `add_billing_reconciliation_tables` 迁移与 `billing-service` 对账作业代码，恢复到无对账任务状态。
- 下一步：
  - 进入 `INT-006`：补齐订阅状态确认与配额扣减联调脚本。
  - 预留发布前动作：在 shared/staging（云端地址）执行 `hourly + daily` 作业并归档验收证据。

## 41. 本次执行回填（INT-006 本地闭环：订阅确认 + 配额门禁）

- 任务编号：`DEV-20260221-INT-006-LOCAL`
- 需求映射：`FR-008`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
- 负责人：后端
- 截止时间：`2026-04-07`
- 当前状态：`In Progress`
- 阻塞项：`BLK-002`（真实支付回调沙箱未开通）
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/tasks/tasks.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/subscriptions/subscriptions.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/subscriptions/subscriptions.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/scripts/shared-smoke.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/contract.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 新增 `POST /v1/subscriptions/mock-confirm`（本地联调用），用于将 `PENDING` 订阅确认到 `ACTIVE`。
  - 任务创建增加配额门禁，超限返回 `40302`；配额计算改为任务维度净额口径：`COMMITTED` 优先，否则 `max(HELD-RELEASED, 0)`。
  - `usage` 统计切换为“有效订阅 + 净额扣减”口径，避免把 `PENDING` 订阅当作已生效配额。
  - `shared-smoke` 增补 INT-006 步骤：订阅确认、配额下降校验、取消后配额回升校验。
  - 新增契约测试：`mock-confirm` 激活链路、免费额度超限 `40302`。
- 测试证据：
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:unit`：通过（`2/2`）
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`16/16`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark TASKS_STORE=prisma SUBSCRIPTIONS_STORE=prisma pnpm --filter @apps/api-gateway test:shared-smoke`（本地双进程）：通过
- 联调结果：
  - 本地口径下，`checkout -> mock-confirm -> usage -> create task -> cancel task -> usage` 已形成可执行闭环。
- 遗留问题：
  - 真实支付回调验签、退款回滚尚未接入（影响 `INT-006` 最终验收）。
  - shared/staging 云端证据按阶段策略后置到发布前门禁执行。
- 风险与回滚：
  - 风险：若后续真实回调状态语义与 mock 流程不一致，需要统一回调状态机映射。
  - 回滚：回退 `mock-confirm` 接口与配额门禁改动，恢复 `checkout + usage` 最小骨架形态。
- 下一步：
  - 推进真实支付回调适配（`INT-006` 后半程），并补齐退款回滚路径验证。
  - 按计划进入 `BE-008/INT-007` webhook 验签与重试联调。

## 42. 本次执行回填（BE-008/INT-007 第一阶段：Webhook 管理与重试最小闭环）

- 任务编号：`DEV-20260221-BE008-INT007-S1`
- 需求映射：`FR-009`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
- 负责人：后端
- 截止时间：`2026-04-12`
- 当前状态：`In Progress`
- 阻塞项：外部系统签名验签联调资源待接入
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/webhooks/webhooks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/webhooks/webhooks.controller.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/app.module.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/contract.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/scripts/shared-smoke.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 新增 `webhooks` 模块，落地 API：
    - `POST/GET/PATCH/DELETE /v1/webhooks/endpoints`
    - `POST /v1/webhooks/endpoints/{endpointId}/test`
    - `GET /v1/webhooks/deliveries`
    - `POST /v1/webhooks/deliveries/{deliveryId}/retry`
  - 新增最小投递模拟策略：本地联调下 URL 包含 `fail` 触发失败，便于演练 `retry` 路径。
  - `shared-smoke` 新增 INT-007 预联调步骤：创建端点、发送测试投递、查询失败记录、修复端点后重试并校验成功投递。
  - 契约测试新增 webhook 两组用例，覆盖 endpoint CRUD 与 delivery test/retry 闭环。
- 测试证据：
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`18/18`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark TASKS_STORE=prisma SUBSCRIPTIONS_STORE=prisma pnpm --filter @apps/api-gateway test:shared-smoke`（本地双进程）：通过（含 `INT-007 prep checks passed`）
- 联调结果：
  - 本地口径已形成 `endpoint create -> test delivery(failed) -> deliveries query -> retry(success)` 可执行闭环。
- 遗留问题：
  - 当前为内存态 endpoint/delivery 存储，尚未接入持久化与 `webhook-dispatcher` 统一派发链路。
  - 外部系统签名验签与重试幂等对齐仍待联调（`INT-007` 后半程）。
- 风险与回滚：
  - 风险：若后续签名规范字段与当前最小模拟模型不一致，需要在 dispatcher 接入阶段统一调整 payload 与签名串。
  - 回滚：回退 `webhooks` 模块与 contract/smoke 增量用例，恢复到 `INT-006` 完成态。
- 下一步：
  - 推进 `BE-008` 第二阶段：接入 `webhook-dispatcher`、签名生成/验签、失败重试与死信对齐。
  - 推进 `INT-007`：与外部系统完成签名校验与幂等重试联调，并补齐 shared/staging 云端证据。

## 43. 本次执行回填（BE-008 签名协议落地：HMAC-SHA256 + Id/Timestamp/Key-Id）

- 任务编号：`DEV-20260221-BE008-SIGNATURE`
- 需求映射：`FR-009`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/webhook.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
- 负责人：后端
- 截止时间：`2026-04-12`
- 当前状态：`In Progress`
- 阻塞项：外部系统验签联调资源待接入
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/webhooks/webhooks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/test/contract.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/scripts/shared-smoke.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/webhook.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - Webhook 投递新增标准签名头：`X-Webhook-Id`、`X-Webhook-Timestamp`、`X-Webhook-Key-Id`、`X-Webhook-Signature`。
  - 签名算法落地：`HMAC-SHA256`，签名串 `timestamp.rawBody`，输出格式 `v1=<hex>`。
  - 在投递侧新增本地验签自检：常量时间比较（timing-safe compare）+ 300 秒窗口 + `webhookId` 去重缓存（24h）。
  - 投递查询新增签名观测字段：`requestHeaders`、`payloadSha256`、`signatureValidated`、`failureCode`。
  - contract/smoke 新增签名格式与关键头断言，保证联调证据可复现。
- 测试证据：
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`18/18`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark TASKS_STORE=prisma SUBSCRIPTIONS_STORE=prisma pnpm --filter @apps/api-gateway test:shared-smoke`（本地双进程）：通过（含签名头校验）
- 联调结果：
  - 本地地址口径下，webhook test/retry 路径已可输出并验证签名头，重试投递可观测。
- 遗留问题：
  - 目前签名校验为本地自检口径，外部系统真实验签回执尚未接入。
  - endpoint/delivery 仍为内存态，待接入持久化与 dispatcher 统一派发链路。
- 风险与回滚：
  - 风险：外部系统若采用不同签名串拼接规则，需要在联调阶段统一并升级版本标识。
  - 回滚：回退签名观测字段与本地验签自检逻辑，恢复到仅 test/retry 最小闭环。
- 下一步：
  - 衔接 `webhook-dispatcher`，将同一签名协议下沉到实际出站派发路径。
  - 与外部系统完成 `INT-007` 验签回执联调并补齐 shared/staging 云端证据。

## 44. 本次执行回填（BE-008 第二阶段：dispatcher 持久化派发接入）

- 任务编号：`DEV-20260222-BE008-DISPATCHER`
- 需求映射：`FR-009`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/webhook.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/database-design.md`
- 负责人：后端
- 截止时间：`2026-04-12`
- 当前状态：`In Progress`
- 阻塞项：外部系统验签联调资源待接入
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/schema.prisma`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/migrations/20260222030000_add_webhook_tables/migration.sql`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/src/modules/webhooks/webhooks.service.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/.env.example`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/dispatcher.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/main.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/smoke.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/.env.example`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 新增 webhook 持久化模型与迁移：`webhook_endpoints`、`webhook_deliveries`。
  - `webhooks.service` 切换为 Prisma 优先存储（保留内存兜底），并扩展 dispatcher 失败码兼容展示。
  - 新增 `webhook-dispatcher` 出站链路：
    - 轮询 `outbox_events(PENDING)` 的 integration 事件；
    - 按 endpoint 事件订阅过滤并生成标准签名头；
    - 出站 HTTP POST 后写入 `webhook_deliveries`；
    - 按重试窗口（默认 `1m,2m,5m,15m,30m,60m`）延迟重试，并收敛 outbox 状态到 `PUBLISHED/PENDING/DEAD`。
  - 新增本地 smoke 脚本：验证 `outbox -> dispatcher -> delivery` 闭环。
- 测试证据：
  - `pnpm --filter @apps/api-gateway prisma:generate`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/api-gateway exec prisma migrate deploy --schema prisma/schema.prisma`：通过（应用 `20260222030000_add_webhook_tables`）
  - `pnpm --filter @apps/api-gateway typecheck`：通过
  - `pnpm --filter @apps/api-gateway test:contract`：通过（`18/18`）
  - `pnpm --filter @apps/webhook-dispatcher typecheck`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/webhook-dispatcher test:smoke`：通过
- 联调结果：
  - 本地已形成 dispatcher 持久化派发闭环，`task.succeeded` 事件可驱动出站成功投递并写入 delivery 记录。
- 遗留问题：
  - 外部系统真实验签回执尚未接入（`INT-007` 后半程）。
  - shared/staging 云端地址下的 dispatcher 验收证据仍待补齐。
- 风险与回滚：
  - 风险：外部系统若对 payload 字段有额外强约束，需在联调阶段补充字段映射并保持签名串不变。
  - 回滚：回退 webhook Prisma 模型/迁移与 `webhook-dispatcher` 新增模块，恢复到 API 内本地 test/retry 最小闭环。
- 下一步：
  - 推进 `INT-007` 外部系统验签联调，补齐 shared/staging 证据。
  - 在 shared/staging 环境复用同口径指标阈值，补齐告警触发与恢复证据。

## 45. 本次执行回填（INT-007 本地外部验签联调：重试与幂等）

- 任务编号：`DEV-20260222-INT007-LOCAL-VERIFY`
- 需求映射：`FR-009`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/webhook.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
- 负责人：后端
- 截止时间：`2026-04-12`
- 当前状态：`In Progress`
- 阻塞项：shared/staging 云端地址与外部系统真实回执待接入
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/int007-local.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 新增 `test:int007-local` 本地联调脚本，启动本地外部接收方并执行真实验签。
  - 脚本覆盖场景：
    - 首次投递：验签通过，业务副作用已执行但返回 `503`；
    - 重试投递：同 `eventId` 进入幂等去重并返回 `200`；
    - 校验 `delivery` 两次记录（`attempt=1 FAILED`、`attempt=2 SUCCESS`）与 `outbox` 最终 `PUBLISHED`。
- 测试证据：
  - `pnpm --filter @apps/webhook-dispatcher typecheck`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/webhook-dispatcher test:int007-local`：通过
- 联调结果：
  - 本地外部验签与重试幂等闭环已形成，可复现“验签成功 + 幂等一次性副作用”行为。
- 遗留问题：
  - 仍缺 shared/staging 云端联调证据与真实外部系统回执日志。
- 风险与回滚：
  - 风险：外部系统若采用不同去重主键（非 `eventId`）需在联调阶段统一语义。
  - 回滚：移除 `test:int007-local` 脚本与相关台账更新，恢复到 dispatcher smoke 验证口径。
- 下一步：
  - 将同一脚本能力映射到 shared/staging 地址，补齐云端证据。
  - 与外部系统确认去重键固定为 `eventId` 并补充对接说明。

## 46. 本次执行回填（BE-008 稳定性增强：dispatcher 指标与阈值告警）

- 任务编号：`DEV-20260222-BE008-METRICS-ALERT`
- 需求映射：`FR-009`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/webhook.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
- 负责人：后端
- 截止时间：`2026-04-12`
- 当前状态：`In Progress`
- 阻塞项：shared/staging 云端阈值演练资源待接入
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/dispatcher.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/main.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/metrics.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/metrics.spec.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/smoke.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/int007-local.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/.env.example`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 为 dispatcher 批次结果新增 `retryDeliveries` 统计字段，补齐重试量观测。
  - 新增指标模块 `metrics.ts`，落地窗口化统计：
    - `webhook_success_rate`
    - `webhook_retry_total`
    - `webhook_retry_rate`
  - 在 `main.ts` 接入阈值告警逻辑：
    - 成功率阈值：`WEBHOOK_DISPATCHER_ALERT_MIN_SUCCESS_RATE`
    - 重试率阈值：`WEBHOOK_DISPATCHER_ALERT_MAX_RETRY_RATE`
    - 告警窗口与最小样本：`WEBHOOK_DISPATCHER_METRICS_WINDOW_SEC`、`WEBHOOK_DISPATCHER_ALERT_MIN_SAMPLES`
  - 增加 `test:unit` 单元测试，覆盖“成功率告警、重试率告警、窗口重置”。
  - 调整本地 smoke/int007 脚本隔离策略（随机 `userId`），避免受历史 outbox 数据干扰。
- 测试证据：
  - `pnpm --filter @apps/webhook-dispatcher typecheck`：通过
  - `pnpm --filter @apps/webhook-dispatcher test:unit`：通过（`3/3`）
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/webhook-dispatcher test:smoke`：通过
  - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/webhook-dispatcher test:int007-local`：通过
- 联调结果：
  - 本地 dispatcher 已具备指标输出与阈值告警能力，可在批次日志中观测成功率与重试率并触发告警。
- 遗留问题：
  - shared/staging 云端阈值告警触发与恢复证据尚未补齐。
- 风险与回滚：
  - 风险：阈值设置不当可能导致告警噪音，需要按环境分层配置。
  - 回滚：回退 `metrics.ts` 与 `main.ts` 告警接入，恢复到仅基础派发日志。
- 下一步：
  - 在 shared/staging 复用 `test:smoke` 与 `test:int007-local` 口径，补齐云端指标/告警证据。
  - 按环境沉淀阈值基线（dev/shared/staging/prod）并纳入发布前检查清单。

## 47. 本次执行回填（INT-007 本地映射矩阵：dev/shared/staging 一键验签）

- 任务编号：`DEV-20260222-INT007-MATRIX-LOCAL`
- 需求映射：`FR-009`、`NFR-006`
- 真源引用：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/webhook.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
- 负责人：后端
- 截止时间：`2026-04-12`
- 当前状态：`In Progress`
- 阻塞项：shared/staging 云端地址待接入
- 风险等级：中
- 改动范围：
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/src/int007-local-matrix.ts`
  - `/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/package.json`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- 实施摘要：
  - 新增矩阵脚本 `test:int007-local:matrix`，支持按 `dev/shared/staging` 目标批量执行：
    - `smoke.ts`
    - `int007-local.ts`
  - 默认读取 `DEV/SHARED/STAGING_DATABASE_URL`；支持 `INT007_MATRIX_TARGETS` 自定义目标集。
  - 执行后自动输出 Markdown 报告到 `.runtime/reports`，便于归档联调证据。
- 测试证据：
  - `pnpm --filter @apps/webhook-dispatcher typecheck`：通过
  - `DEV_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark SHARED_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark STAGING_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/remove_watermark pnpm --filter @apps/webhook-dispatcher test:int007-local:matrix`：通过（`dev/shared/staging-local`）
  - 报告文件：`/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher/.runtime/reports/int007-local-matrix-2026-02-21T19-05-05-958Z.md`
- 联调结果：
  - 本地地址映射下，`INT-007` 已形成三目标一键复验能力，可直接替换数据库地址进行云端复跑。
- 遗留问题：
  - 真实 shared/staging 云端地址的结果证据尚未补齐。
- 风险与回滚：
  - 风险：若云端环境网络策略与本地不同，可能出现额外超时/连接失败场景。
  - 回滚：回退 `int007-local-matrix.ts` 与 `package.json` 命令及台账更新，恢复单环境脚本执行方式。
- 下一步：
  - 你提供 shared/staging 云端地址后，复用同命令补齐最终云端验收证据。
  - 将矩阵报告纳入发布前 `INT-007` 准入检查项。
