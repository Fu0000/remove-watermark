# 变更日志规范（v1.18）

## 1. 目标
- 建立统一变更记录机制，保证发布可追溯。
- 让文档变更、提交记录、里程碑状态一致。

## 2. 范围
- 适用于所有真源文档与工程规范文档。
- 版本策略：`Keep a Changelog + SemVer`（文档阶段可先 `0.x`）。

## 3. 规则
- 每次合并到主干且影响真源文档，必须更新变更日志。
- 记录分类固定：`Added/Changed/Fixed/Deprecated/Removed/Security`。
- 日期必须使用绝对日期（如 `2026-02-19`）。
- 每条记录必须附：影响范围、关联 PR、回滚说明。

## 4. 模板/示例

### 4.1 变更日志模板
```markdown
## [0.4.0] - 2026-03-01
### Added
- 新增前后端联调流程规范文档。

### Changed
- 更新 API 错误码映射责任边界。

### Fixed
- 修复状态机字面量不一致问题。

### Security
- 补充签名 URL 时效策略。

### Rollback
- 若联调流程引发发布阻塞，回滚到 0.1.5 规则集。

### References
- PR: #45
- Commit: abcdef1
```

### 4.2 版本号建议
- `0.x`：文档规范快速迭代期。
- `1.0.0`：规范冻结并进入稳定执行期。

## 5. 验收
- 任一条变更可追溯到具体 commit 与 PR。
- 文档版本记录与仓库变更日志不冲突。
- 发布评审时可按版本对比影响面。

## 6. 版本记录
| 版本 | 日期 | 说明 |
|---|---|---|
| v1.18 | 2026-02-21 | 新增 OPT-ARCH-002 Redis/BullMQ 消息驱动编排执行记录 |
| v1.17 | 2026-02-21 | 新增 OPT-ARCH-002（Worker 编排去副作用）执行记录与双进程 smoke 证据 |
| v1.16 | 2026-02-21 | 新增 OPT-ARCH-001 本地 PostgreSQL integration/smoke 证据与重启持久化验证记录 |
| v1.15 | 2026-02-21 | 新增 OPT-ARCH-001（Prisma 持久化基座）执行记录与流程门禁补充 |
| v1.14 | 2026-02-21 | 调整 INT-004/INT-005 验收口径为“本地证据先行、云端认证发布前执行” |
| v1.13 | 2026-02-21 | 新增 shared-smoke 多环境矩阵脚本与报告输出能力 |
| v1.12 | 2026-02-21 | 新增 shared-smoke 对 INT-004/INT-005 的本地联调覆盖记录 |
| v1.11 | 2026-02-21 | 新增 FE-003 真实绘制交互与多端坐标适配执行日志 |
| v1.10 | 2026-02-21 | 新增 BE-003/BE-004（事务化创建、乐观锁、文件态持久化）与优化台账机制 |
| v1.9 | 2026-02-21 | 新增 BE-006（cancel/retry 动作幂等与冲突互斥）执行日志 |
| v1.8 | 2026-02-21 | 新增任务中心轮询退避 + 结果页联调闭环执行日志 |
| v1.7 | 2026-02-21 | 新增编辑页蒙版链路（`/v1/tasks/{taskId}/mask`）联调执行日志 |
| v1.6 | 2026-02-21 | 切换 shared smoke 默认本地地址并完成本地联调验收 |
| v1.5 | 2026-02-21 | 新增 shared 联调 smoke 脚本与环境接入准备回填 |
| v1.4 | 2026-02-20 | 新增 FE 联调主链路与 H5 构建阻塞修复执行日志 |
| v1.3 | 2026-02-20 | 新增 api-gateway 契约闭环执行日志与测试证据回填 |
| v1.2 | 2026-02-19 | 新增框架初始化阶段执行日志（Monorepo、前后端骨架、测试与阻塞回填） |
| v1.1 | 2026-02-19 | 新增项目执行变更日志示例（含研发任务清单、联调、测试、KR 回填） |
| v1.0 | 2026-02-19 | 首版变更日志标准（Keep a Changelog + SemVer） |

## 7. 项目执行变更日志（当前）

## [0.5.13] - 2026-02-21

### Added
- `apps/worker-orchestrator` 新增 Redis/BullMQ 依赖与消息驱动编排能力：
  - Outbox 事件分发：`task.created/task.retried -> queue`
  - Queue consumer 状态推进：`QUEUED -> ... -> SUCCEEDED`
- 新增环境变量支持：`REDIS_URL`、`QUEUE_NAME`、`ORCHESTRATOR_*` 运行参数。
- `doc/engineering/rd-progress-management.md` 新增第 27 节执行回填（队列化编排与本地双进程 smoke 证据）。

### Changed
- `apps/api-gateway/scripts/shared-smoke.ts` 新增 `SHARED_SMOKE_MAX_POLL_ATTEMPTS`，提高异步队列模式下的轮询稳定性。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 现状为 Redis/BullMQ 消息驱动并调整状态为 `In Review`。
- `SVC-003` 状态更新为 `In Review`，完成从轮询骨架到队列骨架升级。

### Fixed
- 修复双进程 smoke 在异步编排模式下偶发“轮询次数不足导致误判失败”的问题。

### Security
- 队列化后仍保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验链路，不放宽鉴权边界。

### Rollback
- 回退 `apps/worker-orchestrator` BullMQ 相关改动、`apps/api-gateway/scripts/shared-smoke.ts` 调整与台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.12] - 2026-02-21

### Added
- `apps/worker-orchestrator/src/main.ts` 新增可运行编排循环：
  - 按状态机逐步推进任务（`QUEUED -> PREPROCESSING -> DETECTING -> INPAINTING -> PACKAGING -> SUCCEEDED`）
  - 在 `SUCCEEDED` 写入 `usage_ledger(COMMITTED)` 与 `outbox_events(task.succeeded)`
- `apps/worker-orchestrator/package.json` 新增依赖：`@prisma/client`、`@packages/contracts`。

### Changed
- `apps/api-gateway/src/modules/tasks/tasks.service.ts` 调整 Prisma 查询路径：
  - `GET /v1/tasks` 与 `GET /v1/tasks/{taskId}` 不再触发状态推进
  - 状态推进职责转移至 Worker 编排进程
- `apps/api-gateway/scripts/shared-smoke.ts` 增加轮询间隔（`SHARED_SMOKE_POLL_INTERVAL_MS`），适配异步状态推进时序。
- `doc/engineering/rd-progress-management.md` 更新：
  - `SVC-003` 状态进入 `In Progress`
  - 新增第 26 节 `OPT-ARCH-002` 执行回填与双进程 smoke 证据
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 为 `In Progress`，执行时机调整为 MVP 内前置执行。

### Fixed
- 收敛 Prisma 模式下“任务状态由 API 查询驱动推进”的副作用问题，明确推进来源为 Worker。

### Security
- 双进程 smoke 保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验链路，不放宽鉴权约束。

### Rollback
- 回退 `apps/worker-orchestrator/*` 与 `apps/api-gateway/src/modules/tasks/tasks.service.ts`、`apps/api-gateway/scripts/shared-smoke.ts` 相关改动，恢复 API 查询推进模式。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.11] - 2026-02-21

### Changed
- `doc/engineering/rd-progress-management.md` 补充 `OPT-ARCH-001` 本地 PostgreSQL 运行时证据：
  - Prisma 迁移部署验证（`migrate deploy`）
  - Prisma 模式下本地 `shared-smoke` 验证（`INT-002~INT-005`）
  - 网关重启后任务持久化读取与核心表计数核对
- 第 25 节执行回填更新“测试证据/联调结果/遗留问题”，将“缺少 DB 运行时证据”收敛为“缺少 shared/staging 云端证据”。

### Fixed
- 补齐 `OPT-ARCH-001` 在本地 PostgreSQL 场景下缺少 integration/smoke 证据的问题。

### Security
- 本地 integration/smoke 继续保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验链路，无鉴权策略放宽。

### Rollback
- 回退 `doc/engineering/rd-progress-management.md` 的本轮证据回填，恢复到仅“代码就绪”的记录状态。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.10] - 2026-02-21

### Added
- 新增 Prisma 持久化基座文件：
  - `apps/api-gateway/prisma/schema.prisma`
  - `apps/api-gateway/prisma/migrations/20260221211500_init_tasks_store/migration.sql`
  - `apps/api-gateway/src/modules/common/prisma.service.ts`
  - `apps/api-gateway/.env.example`
- `apps/api-gateway/package.json` 新增 Prisma 命令：`prisma:generate`、`prisma:migrate:dev`、`prisma:push`。

### Changed
- `apps/api-gateway/src/modules/tasks/tasks.service.ts` 新增 Prisma 持久化分支，覆盖：
  - 任务创建事务化写入（`tasks + idempotency_keys + usage_ledger + outbox_events`）
  - 动作幂等持久化（`task_action_idempotency`）
  - 状态机迁移与乐观锁版本控制（数据库事务语义）
- `apps/api-gateway/src/modules/tasks/tasks.controller.ts` 适配异步服务调用，保持既有契约语义不变。
- `apps/api-gateway/src/modules/app.module.ts` 注入 `PrismaService` 并以工厂模式初始化 `TasksService`。
- `apps/api-gateway/test/tasks.service.spec.ts`、`apps/api-gateway/test/contract.spec.ts` 适配异步 API。
- `doc/engineering/rd-progress-management.md` 新增第 25 节执行回填并更新 `DATA-001/BE-003/BE-004` 当前状态描述。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-001` 为 `In Progress`，执行时机调整为 “MVP 内（稳定性前置执行）”。

### Fixed
- 修复 Prisma 分支 `seedFailedTask` 未等待异步写入即返回的问题，避免调用时序不一致。

### Security
- 持续保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验路径，不引入绕过鉴权的持久化捷径。

### Rollback
- 回退 `apps/api-gateway` Prisma 相关改动与台账文件更新，服务切回默认文件态持久化路径。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`、`/Users/codelei/Documents/ai-project/remove-watermark/AGENTS.md`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.9] - 2026-02-21

### Changed
- `doc/engineering/rd-progress-management.md` 调整 `INT-004/INT-005` 当前阶段验收口径：
  - 本地 smoke 证据作为当前迭代验收依据
  - 云端 shared/staging 认证与验收后置到发布前最终门禁
- `INT-004`、`INT-005` 状态由 `In Progress` 更新为 `In Review`。
- `BLK-004` 影响范围由“当前联调阻塞”调整为“发布前云端部署认证门禁”。

### Security
- 保持发布前必须执行云端认证与 smoke 验收的门禁要求，不取消最终环境验证。

### Rollback
- 回退 `doc/engineering/rd-progress-management.md` 与本次验收口径调整记录。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.8] - 2026-02-21

### Added
- 新增矩阵脚本：`apps/api-gateway/scripts/shared-smoke-matrix.ts`，支持按环境批量执行 shared smoke。
- 新增命令：`pnpm --filter @apps/api-gateway test:shared-smoke:matrix`。
- 新增矩阵报告输出：执行后自动生成 Markdown 报告到 `apps/api-gateway/.runtime/reports/`。

### Changed
- `doc/engineering/rd-progress-management.md` 新增 `OPT-REL-001` 执行回填（第 23 节），并补充矩阵命令测试证据。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-REL-001` 状态为 `In Review`。
- `.gitignore` 增加 `apps/api-gateway/.runtime/`，避免运行态报告污染工作区。
- `AGENTS.md` 更新联调任务命令基线，新增 `test:shared-smoke:matrix` 推荐执行项。

### Fixed
- 解决 shared smoke 需要人工逐环境切换执行的问题，形成“一次命令、分环境汇总”执行方式。

### Security
- 矩阵脚本沿用现有 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验路径，不绕开鉴权。

### Rollback
- 回退 `apps/api-gateway/scripts/shared-smoke-matrix.ts`、`apps/api-gateway/package.json`、`.gitignore`、`AGENTS.md` 及相关台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`、`/Users/codelei/Documents/ai-project/remove-watermark/AGENTS.md`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.7] - 2026-02-21

### Added
- `apps/api-gateway/scripts/shared-smoke.ts` 新增 `INT-004/INT-005` 校验路径：
  - 任务详情轮询状态推进至 `SUCCEEDED`
  - `GET /v1/tasks/{taskId}/result` 成功路径与 `expireAt` 有效性校验
  - 未完成结果查询与成功态取消的错误路径（`42201`）校验

### Changed
- `pnpm --filter @apps/api-gateway test:shared-smoke` 覆盖范围由 `INT-002/INT-003` 扩展至 `INT-002~INT-005`（本地 fallback）。
- `doc/engineering/rd-progress-management.md` 更新 `INT-004/INT-005` 备注、阻塞影响范围与本轮执行回填。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-REL-001` 状态为 `In Progress`。

### Fixed
- 补齐任务中心状态刷新与结果下载链路在本地联调阶段缺少脚本化证据的问题。
- 修复 smoke 请求头默认 `Content-Type: application/json` 导致空 body 动作请求（`cancel/retry`）返回 400 的误判问题。

### Security
- 保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验路径，新增错误路径校验不放宽鉴权语义。

### Rollback
- 回退 `apps/api-gateway/scripts/shared-smoke.ts` 与相关台账文档变更。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.6] - 2026-02-21

### Added
- 编辑页新增真实蒙版交互能力：
  - `POLYGON/BRUSH` 双模式绘制
  - 多边形闭合、撤销/重做、清空
  - 画板交互样式文件 `apps/user-frontend/src/pages/editor/index.scss`
- 新增画板区域坐标重算机制：页面重新展示和窗口尺寸变化时刷新画板坐标，提升多端适配稳定性。

### Changed
- `apps/user-frontend/src/pages/editor/index.tsx` 从“示例蒙版提交”升级为“真实绘制后提交”流程，并补齐 `40901` 版本冲突恢复提示。
- `doc/engineering/rd-progress-management.md` 更新 `FE-003` 状态为 `In Review`，新增执行回填（含测试证据、联调结果、遗留问题）。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-FE-001` 状态与执行时机，新增 `OPT-FE-002`（Canvas 渲染性能优化）记录。
- `AGENTS.md` 增加“优化项提前执行”回填规则，要求同步更新优化台账执行时机与状态。

### Fixed
- 修复编辑页在多端尺寸变化后可能出现的画板坐标偏移问题。
- 修复 `FE-003` 仅支持示例蒙版提交导致的联调不稳定问题。

### Security
- 编辑页蒙版提交继续保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验链路，不放宽鉴权约束。

### Rollback
- 回退 `apps/user-frontend/src/pages/editor/index.tsx`、`apps/user-frontend/src/pages/editor/index.scss` 及相关台账文档变更。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`、`/Users/codelei/Documents/ai-project/remove-watermark/AGENTS.md`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.5] - 2026-02-21

### Added
- `apps/api-gateway/src/modules/tasks/tasks.service.ts` 新增文件态持久化存储，覆盖：
  - `tasks`
  - `idempotency`
  - `action-idempotency`
  - `task-masks`
  - `usage-ledger`
  - `outbox-events`
- 新增单元测试：`apps/api-gateway/test/tasks.service.spec.ts`（事务创建与乐观锁冲突）。
- 新增优化台账文档：`doc/engineering/mvp-optimization-backlog.md`。

### Changed
- `POST /v1/tasks` 改为事务化创建（同次写入 `tasks + usage_ledger(HELD) + outbox_events(task.created)`）。
- 任务记录新增 `version`，状态迁移统一走乐观锁版本校验。
- `apps/api-gateway/package.json` 新增 `test:unit`，并将契约测试切换为 `NODE_ENV=test` 运行以隔离持久化副作用。
- `doc/engineering/rd-progress-management.md` 更新 `BE-003/BE-004` 状态为 `In Review` 并补充本轮执行回填。
- `AGENTS.md` 新增优化项专用台账回填要求与“发现即记录”闭环。

### Fixed
- 修复任务创建在联调阶段仅内存态持有的问题，增强服务重启后的本地状态连续性。
- 修复状态推进缺少统一版本锁校验的问题，避免并发覆盖。

### Security
- 关键链路继续保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验；测试环境通过 `NODE_ENV=test` 隔离运行态持久化。

### Rollback
- 回退 `apps/api-gateway/src/modules/tasks/tasks.service.ts`、`apps/api-gateway/test/tasks.service.spec.ts`、`apps/api-gateway/package.json` 以及相关台账文档变更。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.4] - 2026-02-21

### Added
- 新增动作级幂等控制：`POST /v1/tasks/{taskId}/cancel|retry` 支持同 `Idempotency-Key` 重放稳定返回。
- 新增契约测试场景：
  - `cancel` 同 key 重复请求幂等验证
  - `retry` 对 FAILED 任务同 key 重复请求幂等验证
  - 跨动作复用同 key 的冲突校验（`40901`）

### Changed
- `apps/api-gateway/src/modules/tasks/tasks.service.ts` 引入动作幂等结果缓存，固定 `success/not_found/invalid_transition` 重放语义。
- `apps/api-gateway/src/modules/tasks/tasks.controller.ts` 调整 `cancel/retry` 响应分支，显式处理 `40901` 与 `42201`。
- `doc/engineering/rd-progress-management.md` 更新 `BE-006` 状态与测试证据（`10/10`）。

### Fixed
- 修复 `cancel/retry` 在重复提交和跨动作 key 复用场景下的不确定行为，确保冲突结果可控。

### Security
- 持续执行 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验，不放宽关键动作鉴权约束。

### Rollback
- 回退 `apps/api-gateway/src/modules/tasks/*`、`apps/api-gateway/test/contract.spec.ts` 与台账变更。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.3] - 2026-02-21

### Added
- 新增前端任务服务接口：`getTaskDetail`、`getTaskResult`。
- 新增前端结果页联调能力：任务状态查询、结果预览/复制下载地址、过期时间提示。
- 新增契约测试场景：`GET /v1/tasks/{taskId}/result` 成功路径（含状态推进后查询）。

### Changed
- `apps/user-frontend/src/pages/tasks/index.tsx` 升级为 `react-query` 轮询：
  - 默认 3s 轮询
  - 失败指数退避上限 15s
  - 成功态自动跳转结果页
- `apps/user-frontend/src/pages/editor/index.tsx` 跳转任务中心由 `navigateTo` 改为 `switchTab`，保证 tabBar 多端一致行为。
- `doc/engineering/rd-progress-management.md` 更新 `FE-005`、`BE-005`、`INT-004`、`INT-005` 状态与测试证据。

### Fixed
- 修复后端 `GET /v1/tasks` 因重复调用导致同次请求状态推进两步的问题。
- 修复 `cancel/retry/mask` 内部读取任务时的推进副作用，避免联调期间状态误跳转。

### Security
- 持续保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 约束一致，结果查询路径不绕开鉴权。

### Rollback
- 回退 `apps/api-gateway/src/modules/tasks/*`、`apps/api-gateway/test/contract.spec.ts`、`apps/user-frontend/src/{services,pages}` 与台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.2] - 2026-02-21

### Added
- 新增后端接口：`POST /v1/tasks/{taskId}/mask`（支持蒙版版本递增返回）。
- 新增契约测试场景：`POST /v1/tasks/{taskId}/mask` 版本更新链路。
- 前端任务服务新增 `upsertTaskMask` 调用能力。

### Changed
- `apps/user-frontend/src/pages/editor/index.tsx` 更新为两步联调流程：
  - 步骤 1：上传策略 + 创建任务
  - 步骤 2：提交示例蒙版并跳转任务中心
- `doc/engineering/rd-progress-management.md` 更新 `FE-003` 状态与本轮测试证据。

### Fixed
- 补齐编辑页到后端蒙版接口的契约断点，消除 `FE-003`“仅页面骨架”状态。

### Security
- 蒙版提交流程保持 `Authorization` + `Idempotency-Key` + `X-Request-Id` 约束一致。

### Rollback
- 回退 `apps/api-gateway/src/modules/tasks/*`、`apps/api-gateway/test/contract.spec.ts`、`apps/user-frontend/src/pages/editor/index.tsx`、`apps/user-frontend/src/services/task.ts` 与台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.1] - 2026-02-21

### Changed
- `apps/api-gateway/scripts/shared-smoke.ts` 默认 `SHARED_BASE_URL` 调整为 `http://127.0.0.1:3000`，以便本地联调先行。
- `apps/user-frontend/.env.example` 默认 API 地址调整为本地地址，保持与当前联调策略一致。
- `doc/engineering/rd-progress-management.md` 更新为“本地 fallback smoke 已通过，云端 shared 待切换”。

### Fixed
- 修复 shared smoke 在当前阶段对不可解析云端域名的硬依赖，恢复 `INT-002/INT-003` 的可执行性。

### Security
- 本地 fallback 验证继续覆盖 `Authorization`、`Idempotency-Key`、`X-Request-Id` 三个关键 Header。

### Rollback
- 回退 `apps/api-gateway/scripts/shared-smoke.ts`、`apps/user-frontend/.env.example` 与 `rd-progress-management.md` 本次调整。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.0] - 2026-02-21

### Added
- 新增 shared 联调 smoke 脚本：`apps/api-gateway/scripts/shared-smoke.ts`。
- 新增执行命令：`pnpm --filter @apps/api-gateway test:shared-smoke`（覆盖 `INT-002/INT-003` 最小验收路径）。
- 新增用户前端运行时配置：`apps/user-frontend/src/config/runtime.ts` 与 `apps/user-frontend/.env.example`。

### Changed
- `apps/user-frontend/src/services/auth.ts` 登录请求支持透传 shared 联调参数（`code/username/password`）。
- `apps/user-frontend/src/pages/home/index.tsx` 改为基于运行时配置触发登录并展示当前 API 地址。
- `doc/engineering/rd-progress-management.md` 增加 shared smoke 测试证据与 `BLK-004` 阻塞记录。

### Fixed
- 将 shared 联调验收从“手工触发”升级为“脚本化可复用流程”，减少环境切换时的验证遗漏。

### Security
- 继续保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 关键头验证路径。

### Rollback
- 回退 `apps/api-gateway/scripts/shared-smoke.ts`、`apps/user-frontend/src/config/runtime.ts`、`apps/user-frontend/src/services/auth.ts`、`apps/user-frontend/src/pages/home/index.tsx` 与台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.4.0] - 2026-02-20

### Added
- 新增用户端联调服务与状态管理：
  - `apps/user-frontend/src/services/auth.ts`
  - `apps/user-frontend/src/services/asset.ts`
  - `apps/user-frontend/src/stores/auth.store.ts`
  - `apps/user-frontend/src/utils/request-id.ts`
  - `apps/user-frontend/src/utils/idempotency.ts`
- 新增 `apps/user-frontend/babel.config.js`，恢复 H5 构建 TSX 解析链路。

### Changed
- `apps/user-frontend/src/services/http.ts` 迁移为 `Taro.request` 请求层，统一注入 `Authorization`、`X-Request-Id`、`Idempotency-Key`。
- `apps/user-frontend/src/pages/home/index.tsx`、`apps/user-frontend/src/pages/editor/index.tsx`、`apps/user-frontend/src/pages/tasks/index.tsx` 打通登录、上传策略、任务创建/刷新/取消/重试联调动作。
- `apps/user-frontend/config/index.ts` 增加 `@ -> src` alias。
- `doc/engineering/rd-progress-management.md` 更新 FE/INT 状态、阻塞项与本轮测试证据。

### Fixed
- 修复 `@apps/user-frontend` `build:h5` 的 webpack alias 校验异常（`@tarojs/shared`），`BLK-003` 已解除。
- 修复 H5 构建期 TSX/Babel preset 缺失问题（补齐 `babel-preset-taro` 与 `@babel/preset-react`）。

### Security
- 保持请求头约束一致性：`Authorization`、`Idempotency-Key`、`X-Request-Id`。

### Rollback
- 回退 `apps/user-frontend/{config,src,package.json,babel.config.js}` 与 `pnpm-lock.yaml`、`doc/engineering/rd-progress-management.md` 改动。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.3.0] - 2026-02-20

### Added
- 新增 `api-gateway` 联调最小闭环接口：
  - `POST /v1/auth/wechat-login`
  - `POST /v1/auth/refresh`
  - `GET /v1/tasks`
  - `GET /v1/tasks/{taskId}`
  - `POST /v1/tasks/{taskId}/retry`
  - `POST /v1/tasks/{taskId}/cancel`
  - `GET /v1/tasks/{taskId}/result`
- 新增 `apps/api-gateway/test/contract.spec.ts` 契约测试用例。

### Changed
- `apps/api-gateway/src/modules/tasks/tasks.controller.ts` 增加幂等约束、状态机校验与统一响应。
- `apps/api-gateway/src/modules/assets/assets.controller.ts` 增加鉴权与参数校验。
- `rd-progress-management.md` 更新 `SVC-002`、`BE-001`、`BE-002` 为 `In Review` 并补充最新测试证据。

### Fixed
- 修复 `api-gateway` 测试环境下 DI 注入问题（显式 `@Inject(TasksService)`）。
- 修复动作类接口默认返回码问题（`cancel/retry` 调整为 `200`）。

### Security
- 保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 关键头校验路径。

### Rollback
- 回滚 `apps/api-gateway/src/modules/*` 与 `apps/api-gateway/test/contract.spec.ts` 改动。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.2.0] - 2026-02-19

### Added
- 初始化 Monorepo 工程骨架：`apps/*` 与 `packages/*`。
- 新增用户前端框架：`apps/user-frontend`（Taro + React，多端目录与适配工具）。
- 新增管理端框架：`apps/admin-console`（Next.js + Ant Design，RBAC 与核心页面骨架）。
- 新增后端服务骨架：`apps/api-gateway`、`apps/worker-*`、`apps/webhook-dispatcher`、`apps/billing-service`。
- 新增共享包：`packages/contracts`、`packages/shared`、`packages/observability`、`packages/eslint-config`、`packages/tsconfig`。

### Changed
- `rd-progress-management.md` 中 `SVC-001` 更新为 `Done`，`SVC-002/FE-001/FE-002/FE-008/BE-001/BE-002` 更新为 `In Progress`。
- 回填测试证据增加安装、类型检查、管理端构建、API 网关构建结果。

### Fixed
- 将“仅文档阶段”的项目仓库升级为“文档 + 可运行框架骨架”状态，消除执行起步缺口。

### Security
- 保持任务创建幂等头、状态机字面量、Node+Triton 边界、MinIO 术语一致性。

### Rollback
- 若框架初始化不满足当前迭代节奏，可回滚新增 `apps/`、`packages/` 目录并恢复台账状态。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps`、`/Users/codelei/Documents/ai-project/remove-watermark/packages`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.1.0] - 2026-02-19

### Added
- 在 `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md` 新增 v1.0 执行版研发任务清单：
  - 环境准备（ENV）
  - 数据准备（DATA）
  - 服务准备（SVC）
  - 前端任务（FE）
  - 后端任务（BE）
  - 联调任务（INT）
  - 项目治理任务（PM/QA/ALG/OPS）
- 新增“测试情况与证据”章节，包含状态机、幂等、架构边界、MinIO 术语一致性检查命令与结果。
- 新增“完成状态看板”和“关键结果（KR）跟踪”章节。
- 新增“阻塞项与风险（24h 回填机制）”章节。

### Changed
- 研发进度台账从“规范模板”升级为“规范 + 执行清单”一体化文档。
- 里程碑任务从描述性目标细化为可执行任务（含 owner、时间、状态、测试层级、联调依赖）。

### Fixed
- 补齐“项目任务清单、联调对接、测试情况、完成状态、关键结果”在台账中的可追踪落点，消除仅口头同步风险。

### Security
- 明确保持 `Idempotency-Key`、状态机字面量、MinIO 术语、Node+Triton 架构边界的执行期一致性检查。

### Rollback
- 若执行版台账结构导致协作成本升高，可回滚到 `rd-progress-management.md` 的模板模式，仅保留第 1-6 章节。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
- 关联规范：`/Users/codelei/Documents/ai-project/remove-watermark/AGENTS.md`
- 关联真源：`/Users/codelei/Documents/ai-project/remove-watermark/doc/project-constraints.md`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/prd.md`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
