# 变更日志规范（v1.8）

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
