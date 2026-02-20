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
| DATA-001 | 数据基线 | Prisma schema 与 DDL 基线同步（含回滚脚本） | 后端 | 2026-02-24 | 2026-02-28 | Ready | shared 部署 | integration | DDL 可一次执行成功 |
| DATA-002 | 数据基线 | 初始化套餐/权益种子数据（Free/Pro 月付/年付） | 后端 | 2026-02-26 | 2026-03-01 | Backlog | 订阅联调 | integration | 套餐查询接口可用 |
| DATA-003 | 数据基线 | `idempotency_keys/outbox_events/usage_ledger` 去重索引校验 | 后端 | 2026-02-26 | 2026-03-02 | Backlog | 任务/账务一致性 | contract/integration | 幂等冲突可稳定复现与防重 |
| DATA-004 | 数据基线 | 测试样本库（图片/视频，含失败样本）与标注策略 | 测试+算法 | 2026-02-25 | 2026-03-03 | Ready | E2E 与回归 | e2e/regression | FR 场景样本覆盖 >= 90% |

### 7.3 服务准备（Service Readiness）

| Task ID | Epic | Task | Owner | Start | End | 状态 | 联调依赖 | 测试层级 | 关键结果 |
|---|---|---|---|---|---|---|---|---|---|
| SVC-001 | 服务基线 | Monorepo 初始化（apps/packages 结构、eslint/tsconfig） | 后端 | 2026-02-23 | 2026-02-25 | Done | FE/BE 契约共享 | unit | 项目骨架可编译 |
| SVC-002 | 服务基线 | `api-gateway` 基础模块（auth/assets/tasks/plans） | 后端 | 2026-02-24 | 2026-03-03 | In Review | FE 调用 | contract | OpenAPI 可导出联调 |
| SVC-003 | 服务基线 | `worker-orchestrator/media/detect/inpaint/result` 队列骨架 | 后端 | 2026-02-25 | 2026-03-05 | Backlog | 任务状态推进 | integration | 状态机全路径可推进 |
| SVC-004 | 服务基线 | `webhook-dispatcher`（签名、重试、死信） | 后端 | 2026-03-10 | 2026-03-20 | Backlog | 外部回调联调 | contract/integration | Webhook 成功率可观测 |
| SVC-005 | 服务基线 | `billing-service`（订阅、权益生效、账务流水） | 后端 | 2026-03-17 | 2026-03-30 | Backlog | 套餐支付联调 | integration/contract | `HELD/COMMITTED/RELEASED` 闭环 |

### 7.4 前端研发任务（Mini/Web + Admin）

| Task ID | Epic | Task | Owner | Start | End | 状态 | 需求映射 | 联调接口 | 测试层级 | 完成状态 |
|---|---|---|---|---|---|---|---|---|---|---|
| FE-001 | 用户端主链路 | 登录态与会话续期 | 前端 | 2026-03-02 | 2026-03-06 | In Review | FR-001 | `/v1/auth/*` | unit/e2e | 登录会话与鉴权头链路已联调 |
| FE-002 | 用户端主链路 | 上传页（格式校验、分片上传、失败恢复） | 前端 | 2026-03-02 | 2026-03-10 | In Review | FR-002 | `/v1/assets/upload-policy` | e2e | 上传策略+任务创建链路已联调 |
| FE-003 | 用户端主链路 | 编辑页（自动检测+手动蒙版） | 前端 | 2026-03-05 | 2026-03-14 | Backlog | FR-003/FR-004 | `/v1/tasks`, `/v1/tasks/{taskId}/mask` | e2e/regression | 未开始 |
| FE-004 | 用户端主链路 | 任务中心（轮询/SSE 回退、重试/取消） | 前端 | 2026-03-09 | 2026-03-18 | In Review | FR-005/FR-006 | `/v1/tasks*` | contract/e2e | 刷新/取消/重试联调动作与 H5 构建验证已通过 |
| FE-005 | 用户端主链路 | 结果页（预览、下载、过期提示） | 前端 | 2026-03-12 | 2026-03-18 | Backlog | FR-007 | `/v1/tasks/{taskId}/result` | e2e | 未开始 |
| FE-006 | 商业化 | 套餐页/账单页/订阅入口 | 前端 | 2026-03-23 | 2026-04-03 | Backlog | FR-008 | `/v1/plans`, `/v1/subscriptions/*`, `/v1/usage/me` | contract/e2e | 未开始 |
| FE-007 | 数据治理 | 账户/隐私与删除申请页 | 前端 | 2026-03-30 | 2026-04-06 | Backlog | FR-010 | 删除相关接口 | e2e | 未开始 |
| FE-008 | 管理后台 | 任务检索/异常重放/套餐管理最小集 | 前端（后台） | 2026-03-23 | 2026-04-10 | In Progress | FR-012 | `/admin/*` | e2e/smoke | 页面与 RBAC 骨架已完成 |

### 7.5 后端研发任务（API + Worker + Billing）

| Task ID | Epic | Task | Owner | Start | End | 状态 | 需求映射 | 测试层级 | 完成状态 | 关键结果 |
|---|---|---|---|---|---|---|---|---|---|---|
| BE-001 | 契约实现 | `GET /v1/system/capabilities` + 默认策略 | 后端 | 2026-02-26 | 2026-03-03 | In Review | FR-005 | contract | 契约测试已通过 | 能力协商可回退 FAST |
| BE-002 | 上传链路 | `POST /v1/assets/upload-policy` + MinIO 签名 | 后端 | 2026-02-26 | 2026-03-04 | In Review | FR-002 | integration/contract | 契约测试已通过 | 上传策略 10 分钟有效 |
| BE-003 | 任务编排 | `POST /v1/tasks` + 幂等 + 预扣事务 | 后端 | 2026-03-01 | 2026-03-08 | Backlog | FR-005/FR-008 | integration/contract | 未开始 | `tasks + usage_ledger + outbox` 同事务 |
| BE-004 | 状态推进 | Orchestrator 状态机推进与乐观锁版本控制 | 后端 | 2026-03-03 | 2026-03-12 | Backlog | FR-005/FR-006 | unit/integration | 未开始 | 非法迁移拦截 100% |
| BE-005 | 结果交付 | `GET /v1/tasks/{taskId}/result` + 结果 TTL | 后端 | 2026-03-09 | 2026-03-15 | Backlog | FR-007 | integration | 未开始 | 结果链接按策略失效 |
| BE-006 | 失败恢复 | retry/cancel 语义与并发互斥 | 后端 | 2026-03-09 | 2026-03-16 | Backlog | FR-005/FR-006 | unit/contract | 未开始 | 重试与取消冲突可控 |
| BE-007 | 商业化 | plans/subscriptions/usage 接口与账务对账任务 | 后端 | 2026-03-20 | 2026-04-05 | Backlog | FR-008 | integration/contract | 未开始 | 账务一致性可追踪 |
| BE-008 | 通知回调 | webhook endpoint 管理/投递/重试/手动重放 | 后端 | 2026-03-24 | 2026-04-10 | Backlog | FR-009 | integration/contract | 未开始 | DEAD 信队列可运维回放 |
| BE-009 | 合规治理 | 素材/任务/账户删除与审计日志链路 | 后端 | 2026-03-30 | 2026-04-12 | Backlog | FR-010/FR-011 | integration/e2e | 未开始 | 删除 SLA <= 24h |

### 7.6 联调对接任务（FE/BE/QA/OPS）

| Task ID | 对接项 | Owner | Start | End | 状态 | 验收标准 | 备注 |
|---|---|---|---|---|---|---|---|
| INT-001 | 契约冻结（字段/错误码/状态机） | 产品+前后端 | 2026-02-24 | 2026-02-28 | In Progress | OpenAPI 冻结并发布 | shared 联调前置 |
| INT-002 | Header 校验（Authorization/Idempotency-Key/X-Request-Id） | 前后端 | 2026-03-01 | 2026-03-04 | In Review | 三个 Header 行为一致 | 请求层统一已落地，待 shared 验收 |
| INT-003 | 上传 -> 创建任务主链路联调 | 前后端+测试 | 2026-03-05 | 2026-03-12 | Backlog | 端到端成功率 >= 95% | 图片优先 |
| INT-004 | 任务中心状态刷新与错误路径联调 | 前后端+测试 | 2026-03-10 | 2026-03-18 | Backlog | 状态渲染与错误码一致 | 含 retry/cancel |
| INT-005 | 结果下载与过期策略联调 | 前后端+测试 | 2026-03-14 | 2026-03-20 | Backlog | 过期前提醒与失效行为一致 |  |
| INT-006 | 订阅/配额扣减联调 | 前后端+测试+支付 | 2026-03-24 | 2026-04-07 | Backlog | 扣减一致率 100% | 含退款回滚 |
| INT-007 | Webhook 对接联调（验签/重试/幂等） | 后端+外部系统 | 2026-03-28 | 2026-04-12 | Backlog | 签名校验通过，重试可观测 |  |
| INT-008 | staging 全链路回归与发布演练 | 全体 | 2026-04-28 | 2026-05-10 | Backlog | 发布准入清单全绿 | 不允许跳过 staging |

### 7.7 项目治理任务（PM/QA/ALG/OPS）

| Task ID | Task | Owner | 状态 | 截止时间 | 风险等级 | 下一步 |
|---|---|---|---|---|---|---|
| PM-001 | FR/NFR/MET 映射到 Story 与测试用例 | 产品+测试 | In Progress | 2026-02-28 | 中 | 完成 FR-001~FR-012 映射表 |
| PM-002 | 风险台账维护（许可/成本/性能） | 产品+技术负责人 | In Progress | 2026-03-03 | 高 | 补齐触发条件与替代方案 |
| QA-001 | 测试计划与回归集建立（unit/integration/contract/e2e/smoke） | 测试 | Ready | 2026-03-05 | 中 | 完成主链路 case 编排 |
| ALG-001 | FAST/QUALITY 模型路由及风险标记 | 算法 | Backlog | 2026-03-22 | 高 | 输出质量/成本基线报告 |
| OPS-001 | 扩缩容与降级阈值告警（queue_depth、INPAINTING P95） | 运维 | Ready | 2026-03-15 | 中 | 完成告警模板与演练 |

## 8. 测试情况与证据（截至 2026-02-20）

### 8.1 已执行检查（文档与约束一致性）

| 检查项 | 执行命令 | 结果 | 结论 |
|---|---|---|---|
| Monorepo 依赖安装 | `pnpm install` | `Done in 4m 23s` | 工作区依赖已完整安装，可执行后续联调与构建 |
| 框架静态类型检查 | `pnpm -r typecheck` | `15/15 workspace passed` | 三端与共享包初始化代码可通过 TypeScript 校验 |
| 工作区 lint 占位检查 | `pnpm -r lint` | `15/15 workspace passed` | lint 脚本已统一挂载，后续可替换为 ESLint 实检 |
| 用户前端目录规范检查 | `for dir in pages components modules stores services utils; do find apps/user-frontend/src/$dir -type f \\| wc -l; done` | `目录均存在且有文件` | 已对齐 `frontend-framework.md` 目录约束 |
| 管理端构建验证 | `pnpm --filter @apps/admin-console build` | `Next build passed` | 管理端框架可完成生产构建 |
| API 网关构建验证 | `pnpm --filter @apps/api-gateway build` | `tsc passed` | 后端网关骨架可完成编译 |
| API 网关契约测试 | `pnpm --filter @apps/api-gateway test:contract` | `5 passed / 0 failed` | 关键契约（capabilities/upload-policy/tasks）可联调 |
| 用户前端类型检查（本轮） | `pnpm --filter @apps/user-frontend typecheck` | `passed` | FE 联调代码可通过静态校验 |
| 工作区类型检查（本轮） | `pnpm -r typecheck` | `15/15 workspace passed` | 前后端联动改动无类型回归 |
| 用户端 H5 构建验证（本轮修复） | `pnpm --filter @apps/user-frontend build:h5` | `passed（2 warnings）` | H5 构建链路已恢复，`BLK-003` 已解除（保留包体告警待优化） |
| 状态机字面量一致性抽检 | `rg -n "UPLOADED -> QUEUED -> PREPROCESSING -> DETECTING -> INPAINTING -> PACKAGING -> SUCCEEDED\\|FAILED\\|CANCELED" doc \| wc -l` | `6` | 关键文档存在统一字面量 |
| 幂等约束覆盖抽检 | `rg -n "Idempotency-Key" doc \| wc -l` | `11` | 创建任务幂等约束已在多文档显式出现 |
| Node+Triton 架构边界抽检 | `rg -n "Node 控制面 \\+ Triton 推理面|Node.*Triton" doc/project-constraints.md doc/prd.md doc/tad.md doc/plan.md` | 命中 `plan.md`、`tad.md` | 架构口径一致，需在实施阶段继续守护 |
| MinIO 术语一致性抽检 | `rg -n "MinIO" doc/project-constraints.md doc/prd.md doc/api-spec.md doc/tad.md doc/plan.md` | 多文档命中 | 对象存储术语一致 |

### 8.2 后续测试计划（按门禁）
- PR 阶段：`unit + lint + contract`。
- shared/staging：`integration + e2e + regression + performance smoke`。
- 发布前：`NFR-001~NFR-007` 验证与 `P0/P1=0`。

## 9. 完成状态看板（截至 2026-02-20）

统计口径：本节任务清单（ENV/DATA/SVC/FE/BE/INT/治理）共 `43` 项。

| 状态 | 数量 | 占比 |
|---|---:|---:|
| Done | 1 | 2.3% |
| In Progress | 4 | 9.3% |
| Ready | 8 | 18.6% |
| Backlog | 23 | 53.5% |
| In Review | 7 | 16.3% |
| QA | 0 | 0.0% |

## 10. 关键结果（KR）跟踪（v1.0）

| KR ID | 指标映射 | 目标值 | 当前基线（2026-02-19） | 当前状态 |
|---|---|---|---|---|
| KR-001 | MET-002 上传到任务创建转化率 | `>= 60%` | 待联调后建立 | 未开始 |
| KR-002 | MET-003 任务成功率（剔除取消） | `>= 95%` | 待联调后建立 | 未开始 |
| KR-003 | MET-004 图片 TTFR P95 | `< 8s` | 待压测与灰度 | 未开始 |
| KR-004 | NFR-002 API 月可用性 | `>= 99.9%` | 待监控看板上线 | 未开始 |
| KR-005 | 账务一致性（配额扣减一致率） | `= 100%` | 待订阅链路联调 | 未开始 |

## 11. 阻塞项与风险（24h 回填机制）

| Blocker ID | 描述 | Owner | 影响范围 | SLA | 下一步 |
|---|---|---|---|---|---|
| BLK-001 | shared 环境 Triton/GPU 资源未完成分配 | 运维 | 视频链路、性能基线 | 24h 回填 | 完成资源配额与可用性验证 |
| BLK-002 | 支付联调测试账号与回调沙箱待开通 | 支付对接人 | 订阅链路、账务验证 | 24h 回填 | 明确开通时间与替代测试方案 |
| BLK-003 | [已解除 2026-02-20] `@apps/user-frontend` `build:h5` webpack alias 校验异常（`@tarojs/shared`）已修复 | 前端 | H5 端构建与联调节奏 | 24h 回填 | 跟踪包体告警并推进体积优化 |

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
