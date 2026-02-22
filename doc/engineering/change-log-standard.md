# 变更日志规范（v1.50）

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
| v1.50 | 2026-02-22 | 新增 FE-008 Webhook 运维切换 `/admin/webhooks/*`，补齐 RBAC 与契约回归 |
| v1.49 | 2026-02-22 | 新增 `.env` 注入脚本与忽略规则，落地 shared/staging/prod 本地密钥文件生成流程 |
| v1.48 | 2026-02-22 | 新增 FE-008 admin 服务端代理（浏览器去密钥化）与 `ADMIN_PROXY_*` 配置模板 |
| v1.47 | 2026-02-22 | 新增 `/admin/*` 密钥安全门禁（受保护环境禁用默认口令）与环境模板 |
| v1.46 | 2026-02-22 | 新增 `/admin/*` 最小契约与 FE-008 后台写入能力（任务检索/重放、套餐新增/编辑） |
| v1.45 | 2026-02-22 | 新增 FE-008 管理端真实数据流接入（任务检索/异常重放/套餐查询/Webhook 运维） |
| v1.44 | 2026-02-22 | 新增 FE-007 本地 smoke 证据补齐（shared-smoke 覆盖删除与审计链路） |
| v1.43 | 2026-02-22 | 新增 FE-007 第三阶段（删除二次确认与成功提示）执行记录 |
| v1.42 | 2026-02-22 | 新增 FE-007 第二阶段（编辑/任务页删除入口）执行记录 |
| v1.41 | 2026-02-22 | 新增 FE-007（账户隐私页：删除申请与审计查询）执行记录 |
| v1.40 | 2026-02-22 | 新增 BE-009 第二阶段（删除申请执行态、查询与保留策略）执行记录 |
| v1.39 | 2026-02-22 | 新增 BE-009 第一阶段（删除与审计最小闭环）执行记录 |
| v1.38 | 2026-02-22 | 新增 INT-007 本地映射矩阵脚本（dev/shared/staging 一键验签）执行记录 |
| v1.37 | 2026-02-22 | 新增 BE-008 指标与阈值告警（webhook_success_rate/webhook_retry_total）执行记录 |
| v1.36 | 2026-02-22 | 新增 INT-007 本地外部验签联调（重试+幂等）执行记录 |
| v1.35 | 2026-02-22 | 新增 BE-008 第二阶段（webhook dispatcher 持久化派发）执行记录 |
| v1.34 | 2026-02-21 | 新增 BE-008 Webhook 签名协议落地（HMAC-SHA256 + Id/Timestamp/Key-Id）执行记录 |
| v1.33 | 2026-02-21 | 新增 BE-008/INT-007 第一阶段（Webhook 管理 + test/retry 本地闭环）执行记录 |
| v1.32 | 2026-02-21 | 新增 INT-006 本地闭环（mock-confirm + 配额门禁 40302 + shared-smoke 校验）执行记录 |
| v1.31 | 2026-02-21 | 新增 BE-007 第二阶段对账任务（按月聚合 + 小时增量 + 日终全量框架）执行记录 |
| v1.30 | 2026-02-21 | 新增 BE-007 商业化接口最小骨架（subscriptions/usage）执行记录 |
| v1.29 | 2026-02-21 | 新增 DATA-003 去重索引校验与账务防重写入策略执行记录 |
| v1.28 | 2026-02-21 | 新增 DATA-002 套餐种子数据初始化与 `/v1/plans` 数据化改造执行记录 |
| v1.27 | 2026-02-21 | 新增 OPT-ARCH-002 发布前检查清单（可 Done 版本）收尾记录 |
| v1.26 | 2026-02-21 | 新增 OPT-ARCH-002 shared/staging 本地映射矩阵验收执行记录 |
| v1.25 | 2026-02-21 | 新增 OPT-ARCH-002 guard-drill 矩阵与报告能力执行记录 |
| v1.24 | 2026-02-21 | 新增 OPT-ARCH-002 阻断/放行一键演练脚本执行记录 |
| v1.23 | 2026-02-21 | 新增 OPT-ARCH-002 高并发批量阻断保护执行记录 |
| v1.22 | 2026-02-21 | 新增 OPT-ARCH-002 deadletter 并发上限保护执行记录 |
| v1.21 | 2026-02-21 | 新增 OPT-ARCH-002 deadletter 批量重放增强执行记录 |
| v1.20 | 2026-02-21 | 新增 OPT-ARCH-002 deadletter 手动重放能力执行记录 |
| v1.19 | 2026-02-21 | 新增 OPT-ARCH-002 deadletter/retry 策略落地执行记录 |
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

## [0.5.45] - 2026-02-22

### Added
- `apps/api-gateway/src/modules/admin/admin.controller.ts` 新增：
  - `GET /admin/webhooks/deliveries`
  - `POST /admin/webhooks/deliveries/{deliveryId}/retry`
- `apps/api-gateway/src/common/admin-rbac.ts` 新增管理端权限：
  - `admin:webhook:read`
  - `admin:webhook:retry`
- `apps/api-gateway/test/contract.spec.ts` 新增 `/admin/webhooks/*` RBAC 契约用例（读取与重试）。

### Changed
- `apps/admin-console/src/services/webhooks.ts` 从 `/v1/webhooks/*` 切换为 `/admin/webhooks/*`，统一走 admin 代理链路。
- `doc/api-spec.md` 同步新增管理端 Webhook 契约与权限矩阵。
- `doc/engineering/rd-progress-management.md` 新增第 59 节回填并更新 FE-008 测试看板（contract `27/27`）。

### Fixed
- 修复 FE-008 中 Webhook 运维仍依赖用户侧 `v1` 接口、与管理端 `/admin/*` 鉴权链路不一致的问题。

### Security
- 管理端 Webhook 重试操作纳入 `X-Admin-Role/X-Admin-Secret` RBAC 约束，并写入后台审计动作 `admin.webhook.retry`。

### Rollback
- 回退 `admin.controller` Webhook 管理端接口、`admin-rbac` 权限增量与 `admin-console` webhooks 服务路径切换，恢复到 0.5.44。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/admin-console`、`/Users/codelei/Documents/ai-project/remove-watermark/doc`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.44] - 2026-02-22

### Added
- 新增脚本：`scripts/setup-admin-env.sh`
  - 支持 `--dry-run` / `--force`
  - 一次生成 `shared/staging/prod` 三套 `.env`
  - 同步生成：
    - `apps/api-gateway/.env.{shared,staging,prod}`
    - `apps/admin-console/.env.{shared,staging,prod}`
- `doc/engineering/README.md` 增加脚本化环境注入入口。

### Changed
- `.gitignore` 增加 `.env*` 忽略规则并保留 `.env.example` 白名单，避免密钥误提交。
- `doc/engineering/rd-progress-management.md` 新增第 58 节回填与执行证据。

### Fixed
- 修复“仅口头约定用 `.env`，缺少可复用落地脚本与防误提交流程”的执行断点。

### Security
- 生成的 `.env` 文件默认权限为 `600`，并通过忽略规则防止进入 Git 历史。

### Rollback
- 回退 `scripts/setup-admin-env.sh` 与 `.gitignore` 增量，恢复手工环境配置方式。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/scripts`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`、`/Users/codelei/Documents/ai-project/remove-watermark/.gitignore`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.43] - 2026-02-22

### Added
- `apps/admin-console/src/pages/api/admin/[...path].ts` 新增管理端服务端代理：
  - 代理 `/admin/*` 请求
  - 服务端登录获取 `accessToken`
  - 服务端注入 `X-Admin-Role` 与 `X-Admin-Secret`
- `apps/admin-console/.env.example` 新增 `ADMIN_PROXY_*` 配置模板（服务端密钥不再使用 `NEXT_PUBLIC`）。

### Changed
- `apps/admin-console/src/services/http.ts`：
  - `/admin/*` 路径改为走 `/api/admin/*` 代理
  - 浏览器侧不再注入 `X-Admin-Secret`
- `doc/api-spec.md` 补充管理端密钥规则：必须服务端代理注入，禁止浏览器暴露。
- `doc/engineering/rd-progress-management.md` 新增第 57 节回填与验证证据。

### Fixed
- 修复 FE-008 浏览器侧仍需持有管理端密钥的风险点，完成 admin 密钥去前端化。

### Security
- 将 `X-Admin-Secret` 暴露面从浏览器端收敛到服务端环境变量。

### Rollback
- 回退 `pages/api/admin/[...path]` 与 `services/http.ts` 代理改造，恢复到 0.5.42 的前端直连模式（不建议）。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/admin-console`、`/Users/codelei/Documents/ai-project/remove-watermark/doc`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.42] - 2026-02-22

### Added
- 新增环境模板：
  - `apps/api-gateway/.env.example`
  - `apps/admin-console/.env.example`
- 明确 `/admin/*` 密钥配置要求与本地默认口径边界。

### Changed
- `apps/api-gateway/src/common/admin-rbac.ts` 增加运行时安全门禁：
  - `APP_ENV in {shared,staging,prod}` 或 `NODE_ENV=production` 时，禁止 `ADMIN_RBAC_SECRET` 缺失或为默认值 `admin123`
- `apps/api-gateway/src/main.ts` 启动前执行 `assertAdminRbacConfig()`，不合规配置直接阻断启动。
- `apps/admin-console/src/services/http.ts` 增加非本地 API 目标保护：
  - 非 `localhost/127.0.0.1` 下拒绝默认 `NEXT_PUBLIC_ADMIN_SECRET`
- `doc/api-spec.md` 补充 `/admin/*` 密钥安全门禁说明。
- `doc/engineering/rd-progress-management.md` 新增第 56 节回填与验证证据。

### Fixed
- 修复 `/admin/*` 在 shared/staging/prod 可能沿用 `admin123` 默认口令的高风险配置漏洞。

### Security
- 受保护环境默认口令由“可运行”升级为“启动即拒绝”，降低误配置上线风险。

### Rollback
- 回退 `assertAdminRbacConfig` 启动门禁与前端非本地目标保护逻辑，恢复到 0.5.41 行为（不建议）。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/admin-console`、`/Users/codelei/Documents/ai-project/remove-watermark/doc`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.41] - 2026-02-22

### Added
- `apps/api-gateway/src/common/admin-rbac.ts`：新增管理端角色/权限矩阵与 `X-Admin-Role + X-Admin-Secret` 校验。
- `apps/api-gateway/src/modules/admin/admin.controller.ts`：新增 `/admin/*` 最小契约：
  - `GET /admin/tasks`
  - `POST /admin/tasks/{taskId}/replay`
  - `GET /admin/plans`
  - `POST /admin/plans`
  - `PATCH /admin/plans/{planId}`
- `apps/api-gateway/test/contract.spec.ts` 新增 `/admin/*` 契约与 RBAC 用例（读写权限、错误码、重放路径）。

### Changed
- `apps/api-gateway/src/modules/tasks/tasks.service.ts` 增加管理端检索能力（按 `taskId/userId/status/time window` + 分页）与按 `taskId` 查询能力。
- `apps/api-gateway/src/modules/plans/plans.service.ts` 增加管理端套餐检索/新增/编辑能力（Prisma + 内存回退双路径）。
- `apps/api-gateway/src/modules/compliance/compliance.service.ts` 新增后台操作审计写入入口（`appendAdminAuditLog`）。
- `apps/admin-console/src/services/http.ts` 对 `/admin/*` 请求自动注入 `X-Admin-Role` 与 `X-Admin-Secret`。
- `apps/admin-console/src/services/tasks.ts`、`apps/admin-console/src/services/plans.ts` 切换到 `/admin/*` 契约。
- `apps/admin-console/src/pages/tasks/index.tsx` 改为服务端筛选分页 + 管理端重放（原因必填）。
- `apps/admin-console/src/pages/plans/index.tsx` 改为管理端套餐检索 + 新增/编辑表单。
- `doc/api-spec.md` 同步新增 `/admin/*` 契约与 RBAC 头约束。
- `doc/engineering/rd-progress-management.md` 新增第 55 节回填与测试证据。

### Fixed
- 修复 FE-008 “套餐写操作待开放”的阻塞，补齐后台新增/编辑可执行路径。
- 修复 FR-012 中“后台 RBAC 仅前端骨架层有效、后端无 `/admin/*` 契约”缺口。

### Security
- `/admin/*` 强制要求 `Authorization + X-Admin-Role + X-Admin-Secret`，高危操作写入审计动作。

### Rollback
- 回退 `admin-rbac`、`admin.controller`、`tasks/plans service` 管理端增量与后台页面 `/admin/*` 接入，恢复到 0.5.40 只读联调版本。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/admin-console`、`/Users/codelei/Documents/ai-project/remove-watermark/doc`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.40] - 2026-02-22

### Added
- `apps/admin-console/src/services/tasks.ts`：新增任务列表查询与异常重放接口封装。
- `apps/admin-console/src/services/plans.ts`：新增套餐列表查询接口封装。
- `apps/admin-console/src/services/webhooks.ts`：新增投递查询与重试接口封装。

### Changed
- `apps/admin-console/src/services/http.ts` 升级为统一 API 客户端：
  - 自动注入 `Authorization`、`X-Request-Id`、`Idempotency-Key`
  - 默认对接本地地址 `http://127.0.0.1:3000`
  - 统一 `ApiError` 与请求 ID 透传
- `apps/admin-console/src/pages/tasks/index.tsx` 从静态样例升级为真实数据页：
  - 任务检索（关键字/状态/时间）与异常重放（二次确认 + 必填原因）
- `apps/admin-console/src/pages/plans/index.tsx` 接入真实套餐查询并标注写接口待开放。
- `apps/admin-console/src/pages/webhooks/index.tsx` 接入投递查询、分页筛选与失败重试。
- `apps/admin-console/src/components/layout.tsx` 增加路由高亮与小屏侧栏折叠。
- `doc/engineering/rd-progress-management.md` 新增第 54 节回填并补充 FE-008 本轮验证证据。

### Fixed
- 修复 FE-008 仅有静态占位页面、缺少真实联调数据流的问题。

### Security
- 管理端请求继续沿用 `Authorization` 与关键操作幂等约束；未放宽后端鉴权语义。

### Rollback
- 回退 `admin-console` 服务层与 `tasks/plans/webhooks` 页面改造，恢复到 0.5.39 的静态骨架版本。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/admin-console`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.39] - 2026-02-22

### Changed
- `apps/api-gateway/scripts/shared-smoke.ts` 扩展 FE-007 验证覆盖：
  - `DELETE /v1/assets/{assetId}`（含幂等重放）
  - `DELETE /v1/tasks/{taskId}`（删除后 detail/list 校验）
  - `POST /v1/account/delete-request`（含幂等重放）
  - `GET /v1/account/delete-requests` / `GET /v1/account/delete-requests/{requestId}`
  - `GET /v1/account/audit-logs`（校验 `account.delete.requested`）
- `shared-smoke` 新增日志标记：`[shared-smoke] FE-007 checks passed`。
- `doc/engineering/rd-progress-management.md` 新增第 53 节回填与 FE-007 本地 smoke 证据（含 matrix 报告路径）。

### Fixed
- 修复 FE-007 在自动化 smoke 证据中缺少“删除与审计全链路”覆盖的问题。

### Security
- 扩展 smoke 仅复用既有鉴权与幂等约束，不放宽 `Authorization` / `Idempotency-Key` 语义。

### Rollback
- 回退 `shared-smoke.ts` 的 FE-007 增量断言与文档回填，恢复到 0.5.38 的 smoke 覆盖范围。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.38] - 2026-02-22

### Changed
- `apps/user-frontend/src/pages/editor/index.tsx` 的“删除当前素材”流程新增二次确认弹窗。
- `apps/user-frontend/src/pages/tasks/index.tsx` 的“删除当前任务”流程新增二次确认弹窗。
- 两处删除动作成功后统一增加成功提示（toast），补齐用户反馈闭环。
- `doc/engineering/rd-progress-management.md` 新增第 52 节回填并补充 FE-007 第三阶段测试证据。

### Fixed
- 修复删除动作“单击即执行、缺少确认门槛”的误触风险。
- 修复删除成功后无明确反馈的问题。

### Security
- 仅优化前端交互，不改变 `Authorization` 与 `Idempotency-Key` 的既有约束与语义。

### Rollback
- 回退 `editor/tasks` 页面的 `showModal/showToast` 交互逻辑及文档回填，恢复到 0.5.37 行为。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.37] - 2026-02-22

### Added
- 新增前端删除能力服务入口：
  - `apps/user-frontend/src/services/asset.ts` 增加 `deleteAsset(...)`
  - `apps/user-frontend/src/services/task.ts` 增加 `deleteTask(...)`

### Changed
- `apps/user-frontend/src/pages/editor/index.tsx` 新增“删除当前素材（FR-010）”按钮，并展示当前 `assetId`。
- `apps/user-frontend/src/pages/tasks/index.tsx` 新增“删除当前任务（FR-010）”按钮，删除成功后重置当前任务态。
- `doc/engineering/rd-progress-management.md`：
  - 更新 `FE-007` 联调接口描述，纳入 `DELETE /v1/assets/{assetId}` 与 `DELETE /v1/tasks/{taskId}`
  - 新增第 51 节回填与第二阶段测试证据。

### Fixed
- 修复 FR-010 在用户端“仅账户页可见、编辑/任务页无直接删除入口”的可达性缺口。

### Security
- 删除操作继续强制透传 `Idempotency-Key`，并沿用后端鉴权约束，不放宽安全边界。

### Rollback
- 回退 `editor/tasks` 页面删除入口与 `services/asset.ts`, `services/task.ts` 新增删除方法，恢复到 0.5.36 版本行为。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.36] - 2026-02-22

### Added
- 新增前端合规服务层：
  - `apps/user-frontend/src/services/compliance.ts`
  - 覆盖 `POST /v1/account/delete-request`、`GET /v1/account/delete-requests*`、`GET /v1/account/audit-logs`
- 新增账户页样式文件：
  - `apps/user-frontend/src/pages/account/index.scss`

### Changed
- `apps/user-frontend/src/pages/account/index.tsx` 从占位页升级为可联调页面：
  - 删除申请提交（原因 + 不可恢复确认）
  - 删除申请列表/详情（状态筛选）
  - 审计日志查询（action/resourceType 过滤）
- `doc/engineering/rd-progress-management.md`：
  - `FE-007` 状态由 `Backlog` 更新为 `In Review`
  - 增补 FE-007 测试证据与第 50 节回填记录

### Fixed
- 修复用户端“账户与隐私页仅占位、无法覆盖 BE-009 查询接口”的联调缺口。

### Security
- 账户删除申请创建继续透传 `Idempotency-Key`，避免重复提交导致的业务歧义。
- 页面仅展示审计元信息，不放宽后端鉴权与错误码语义。

### Rollback
- 回退 `apps/user-frontend/src/services/compliance.ts` 与 `apps/user-frontend/src/pages/account/*` 及台账更新，恢复到 0.5.35 占位页版本。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.35] - 2026-02-22

### Added
- 新增账户删除执行与保留策略运维入口：
  - `apps/api-gateway/scripts/account-delete-reconcile.ts`
  - `apps/api-gateway/scripts/audit-retention.ts`
- 新增合规单元测试：
  - `apps/api-gateway/test/compliance.service.spec.ts`
- `doc/api-spec.md` 新增/更新删除申请查询与审计查询契约：
  - `GET /v1/account/delete-requests`
  - `GET /v1/account/delete-requests/{requestId}`
  - `GET /v1/account/audit-logs`

### Changed
- `apps/api-gateway/src/modules/compliance/compliance.service.ts` 扩展删除申请执行态（`PENDING/PROCESSING/DONE/FAILED`）及事务化执行流程。
- `apps/api-gateway/src/modules/compliance/account.controller.ts` 扩展删除申请列表/详情与审计日志查询接口。
- `apps/api-gateway/prisma/schema.prisma` 增加 `account_delete_requests.startedAt/finishedAt/errorMessage/summaryJson` 字段。
- 新增迁移：`apps/api-gateway/prisma/migrations/20260222104000_account_delete_request_lifecycle/migration.sql`。
- `apps/api-gateway/package.json` 增加 `ops:account-delete:reconcile` 与 `ops:audit:retention` 命令。
- `doc/engineering/rd-progress-management.md` 新增第 49 节回填并更新 BE-009 第二阶段证据。

### Fixed
- 修复 `BE-009` 第一阶段仅能“创建删除申请”、缺少“执行态推进与查询可观测”的问题。
- 修复审计日志缺少统一保留清理入口的问题。

### Security
- 删除申请与查询链路继续强制 `Authorization`，创建操作继续强制 `Idempotency-Key`。
- 审计日志保留策略默认 180 天，降低长期保留敏感访问元信息风险。

### Rollback
- 回退 lifecycle 迁移、`compliance` 扩展接口、执行/保留脚本与测试改动，恢复到 0.5.34（BE-009 第一阶段）口径。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.34] - 2026-02-22

### Added
- 新增合规模块：
  - `apps/api-gateway/src/modules/compliance/compliance.service.ts`
  - `apps/api-gateway/src/modules/compliance/account.controller.ts`
- 新增删除与合规 API：
  - `DELETE /v1/assets/{assetId}`
  - `DELETE /v1/tasks/{taskId}`
  - `POST /v1/account/delete-request`
- 新增 Prisma 合规数据模型与迁移：
  - `assets`
  - `task_view_deletions`
  - `account_delete_requests`
  - `audit_logs`
  - `compliance_idempotency`
- `doc/engineering/rd-progress-management.md` 新增第 48 节回填（BE-009 第一阶段）。

### Changed
- `apps/api-gateway/src/modules/assets/assets.controller.ts` 接入 `ComplianceService`，上传策略创建后持久化资产元数据并支持素材删除。
- `apps/api-gateway/src/modules/tasks/tasks.controller.ts` 增加任务删除入口与“已删除任务不可见”过滤逻辑。
- `apps/api-gateway/src/modules/app.module.ts` 注入 `ComplianceService` 与 `AccountController`。
- `apps/api-gateway/test/contract.spec.ts` 增补删除与账户删除申请契约用例，覆盖幂等冲突路径。
- 本地 PostgreSQL 已执行 `20260222100000_add_compliance_tables` 迁移，并在 Prisma 路径完成 contract 与双进程 shared-smoke 验证。

### Fixed
- 修复 `BE-009` 在后端侧“删除链路无实现、审计无落点”的能力缺口，补齐最小可联调闭环。

### Security
- 删除与账户删除申请接口继续强制 `Authorization + Idempotency-Key`，审计日志记录 `userId/requestId/ip/userAgent`。

### Rollback
- 回退 `compliance` 模块、`assets/tasks` 控制器改动、Prisma 模型与迁移、契约测试与台账更新，恢复到 0.5.33。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.33] - 2026-02-22

### Added
- 新增 `INT-007` 本地映射矩阵脚本：
  - `apps/webhook-dispatcher/src/int007-local-matrix.ts`
  - `apps/webhook-dispatcher/package.json` 新增 `test:int007-local:matrix` 命令。
- 新增矩阵报告产物能力：自动输出到 `apps/webhook-dispatcher/.runtime/reports/*.md`。
- `doc/engineering/rd-progress-management.md` 新增第 47 节回填（矩阵执行证据）。

### Changed
- `doc/engineering/rd-progress-management.md` 更新 `INT-007` 备注：补充“dev/shared/staging 本地映射矩阵已完成”。
- 测试看板新增 `INT-007 本地映射矩阵（本轮）` 命令与结果。

### Fixed
- 补齐 `INT-007` 在“多目标环境一键复验”上的执行能力缺口，降低 shared/staging 切换成本。

### Security
- 矩阵执行仍沿用现有签名验签与幂等规则，不改变安全边界。

### Rollback
- 回退 `int007-local-matrix.ts` 与 `package.json` 命令及台账更新，恢复单环境手工执行流程。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.32] - 2026-02-22

### Added
- 新增 dispatcher 指标模块：
  - `apps/webhook-dispatcher/src/metrics.ts`
  - 指标：`webhook_success_rate`、`webhook_retry_total`、`webhook_retry_rate`
- 新增指标单元测试：
  - `apps/webhook-dispatcher/src/metrics.spec.ts`
  - `apps/webhook-dispatcher/package.json` 新增 `test:unit` 命令。
- `doc/engineering/rd-progress-management.md` 新增第 46 节回填（指标+告警执行证据）。

### Changed
- `apps/webhook-dispatcher/src/dispatcher.ts` 增加 `retryDeliveries` 批次统计字段，补齐重试量观测。
- `apps/webhook-dispatcher/src/main.ts` 接入窗口化指标统计与阈值告警日志。
- `apps/webhook-dispatcher/.env.example` 新增告警参数：
  - `WEBHOOK_DISPATCHER_METRICS_WINDOW_SEC`
  - `WEBHOOK_DISPATCHER_ALERT_MIN_SAMPLES`
  - `WEBHOOK_DISPATCHER_ALERT_MIN_SUCCESS_RATE`
  - `WEBHOOK_DISPATCHER_ALERT_MAX_RETRY_RATE`
- `apps/webhook-dispatcher/src/smoke.ts` 与 `apps/webhook-dispatcher/src/int007-local.ts` 使用随机 `userId` 做联调隔离，降低历史 outbox 数据干扰。
- `doc/engineering/rd-progress-management.md` 更新 `SVC-004/BE-008` 关键结果描述与测试看板。

### Fixed
- 修复 dispatcher 缺少可观测成功率/重试率与阈值告警能力的问题。
- 修复本地 smoke/int007 测试受历史 `PENDING` outbox 事件干扰导致不稳定的问题。

### Security
- 指标与告警改造不改变 webhook 签名协议与验签边界，继续保持 `HMAC-SHA256` 规范。

### Rollback
- 回退 `metrics.ts/metrics.spec.ts` 与 `main.ts` 指标告警接入、`.env.example` 新增参数、`dispatcher.ts` 统计字段和相关台账更新，恢复到 0.5.31 版本。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.31] - 2026-02-22

### Added
- 新增 `INT-007` 本地外部验签联调脚本：
  - `apps/webhook-dispatcher/src/int007-local.ts`
  - `apps/webhook-dispatcher/package.json` 新增 `test:int007-local` 命令。
- `doc/engineering/rd-progress-management.md` 新增第 45 节回填（外部验签/重试/幂等本地证据）。

### Changed
- `doc/engineering/rd-progress-management.md` 更新：
  - `BE-008` 备注补充“本地外部验签联调已通过，待 shared/staging 云端验收”；
  - `INT-007` 备注补充“已完成本地外部验签幂等脚本”；
  - 测试看板新增 `test:int007-local` 证据行。

### Fixed
- 补齐 `INT-007` 在“外部接收方真实验签 + 重试幂等语义”上的本地可复现证据缺口。

### Security
- 本地联调脚本使用真实 `HMAC-SHA256` 验签与 300 秒窗口校验，继续保持签名防重放边界不放宽。

### Rollback
- 回退 `int007-local.ts` 与 `package.json` 新增命令及台账更新，恢复到仅 dispatcher smoke 校验口径。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.30] - 2026-02-22

### Added
- 新增 webhook 持久化模型与迁移：
  - `apps/api-gateway/prisma/schema.prisma` 增加 `WebhookEndpoint/WebhookDelivery`
  - `apps/api-gateway/prisma/migrations/20260222030000_add_webhook_tables/migration.sql`
- 新增 `webhook-dispatcher` 实际派发能力：
  - `apps/webhook-dispatcher/src/dispatcher.ts`（outbox 轮询、签名派发、重试窗口、状态收敛）
  - `apps/webhook-dispatcher/src/main.ts`（常驻/单次运行）
  - `apps/webhook-dispatcher/src/smoke.ts`（本地 PostgreSQL smoke）
  - `apps/webhook-dispatcher/.env.example`
- `doc/engineering/rd-progress-management.md` 新增第 44 节回填（BE-008 第二阶段执行证据）。

### Changed
- `apps/api-gateway/src/modules/webhooks/webhooks.service.ts` 切换为 Prisma 优先存储（保留内存兜底），并扩展 dispatcher 失败码兼容显示。
- `apps/api-gateway/.env.example` 增加 `WEBHOOKS_STORE=prisma`。
- `apps/webhook-dispatcher/package.json` 新增 `@prisma/client` 依赖与 `test:smoke` 命令。
- `doc/engineering/rd-progress-management.md` 更新 `SVC-004/BE-008/INT-007` 进度描述与测试看板。

### Fixed
- 修复 `BE-008` “endpoint/delivery 仅内存态、dispatcher 未接入”的关键联调断点。

### Security
- 出站派发沿用 `HMAC-SHA256` + `X-Webhook-Id/Timestamp/Key-Id/Signature` 规范，不放宽签名与鉴权边界。

### Rollback
- 回退 `webhook` Prisma 模型/迁移与 `webhook-dispatcher` 新增逻辑，恢复到 0.5.29 的 API 内 test/retry 最小闭环。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.29] - 2026-02-21

### Added
- Webhook 投递新增标准签名头生成与观测：
  - `X-Webhook-Id`
  - `X-Webhook-Timestamp`
  - `X-Webhook-Key-Id`
  - `X-Webhook-Signature`
- `apps/api-gateway/src/modules/webhooks/webhooks.service.ts` 新增签名自检能力：
  - `HMAC-SHA256` + `timestamp.rawBody`
  - 常量时间比较（timing-safe compare）
  - `300` 秒窗口校验
  - `webhookId` 24h 防重缓存
- `doc/engineering/rd-progress-management.md` 新增第 43 节回填（BE-008 签名协议执行证据）。

### Changed
- `GET /v1/webhooks/deliveries` 返回增强：`requestHeaders`、`payloadSha256`、`signatureValidated`、`failureCode`。
- `apps/api-gateway/test/contract.spec.ts` 增加签名字段断言（`v1=<hex>`、关键签名头存在性）。
- `apps/api-gateway/scripts/shared-smoke.ts` 增加本地签名头校验步骤。
- `doc/api-spec.md` 补充 Webhook 验签协议细节（`Id/Timestamp/Key-Id/Signature`、常量时间比较、5 分钟窗口、24h 去重）。
- `doc/webhook.md` 补充 `X-Webhook-Key-Id`、常量时间比较与 24h 去重建议。

### Fixed
- 修复 `BE-008` 第一阶段中“已有 webhook API 但签名协议细节未在实现层明确固化”的落地缺口。

### Security
- Webhook 签名与防重放规则已在实现层与文档层双重固化，不放宽现有鉴权边界。

### Rollback
- 回退签名头生成、自检与 deliveries 观测字段增强，恢复到 0.5.28 的最小闭环实现。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/webhook.md`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.28] - 2026-02-21

### Added
- 新增 `webhooks` 模块：
  - `apps/api-gateway/src/modules/webhooks/webhooks.service.ts`
  - `apps/api-gateway/src/modules/webhooks/webhooks.controller.ts`
- 新增 API 能力：
  - `POST/GET/PATCH/DELETE /v1/webhooks/endpoints`
  - `POST /v1/webhooks/endpoints/{endpointId}/test`
  - `GET /v1/webhooks/deliveries`
  - `POST /v1/webhooks/deliveries/{deliveryId}/retry`
- 新增契约用例：
  - `webhook endpoints should support create/list/update/delete`
  - `webhook deliveries should support test dispatch and retry`
- `doc/engineering/rd-progress-management.md` 新增第 42 节回填（`BE-008/INT-007` 第一阶段执行证据）。

### Changed
- `apps/api-gateway/src/modules/app.module.ts` 注册 `WebhooksController` 与 `WebhooksService`。
- `apps/api-gateway/scripts/shared-smoke.ts` 新增 INT-007 预联调校验步骤（endpoint create/test/retry/query），并将收尾日志更新为 `INT-002/INT-006`。
- `doc/api-spec.md` 补充 webhook test 本地联调语义（URL 包含 `fail` 可触发失败态用于 retry 演练）。
- `doc/engineering/rd-progress-management.md` 更新：
  - `BE-008` 由 `Backlog` 调整为 `In Progress`
  - `INT-007` 由 `Backlog` 调整为 `In Progress`
  - `API 网关契约测试` 更新为 `18 passed / 0 failed`

### Fixed
- 补齐 `BE-008` 在当前阶段“仅有 deadletter 运维脚本、缺少用户侧 webhook 管理与重试 API”的联调断点。

### Security
- 继续保持 `Authorization` 与 `X-Request-Id` 校验边界；本次本地模拟投递仅用于联调，不替代正式签名验签流程。

### Rollback
- 回退 `webhooks` 模块与 contract/smoke 增量用例，恢复到 `INT-006` 完成态。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.27] - 2026-02-21

### Added
- 新增订阅本地确认接口：`POST /v1/subscriptions/mock-confirm`（用于 dev/shared 本地联调，模拟支付确认并激活订阅）。
- 新增配额超限保护错误：任务创建超限返回 `40302`。
- 新增契约用例：
  - `POST /v1/subscriptions/mock-confirm should activate pending subscription`
  - `POST /v1/tasks should return 40302 when free quota is exceeded`
- `doc/engineering/rd-progress-management.md` 新增第 41 节回填（`INT-006` 本地闭环执行证据）。

### Changed
- `apps/api-gateway/src/modules/tasks/tasks.service.ts`：
  - 任务创建接入配额门禁；
  - 配额统计切换为任务维度净额口径：`COMMITTED` 优先，否则 `max(HELD-RELEASED, 0)`。
- `apps/api-gateway/src/modules/subscriptions/subscriptions.service.ts`：
  - 增加 `confirmCheckout`；
  - `usage` 计算改为“有效 ACTIVE 订阅 + 净额扣减”口径，避免 `PENDING` 误计入。
- `apps/api-gateway/scripts/shared-smoke.ts` 增补 INT-006 校验步骤（订阅确认、配额下降、取消回升）。
- `doc/api-spec.md` 增加 `mock-confirm` 接口说明与用途边界（本地联调用）。
- `doc/engineering/rd-progress-management.md` 更新：
  - `INT-006` 由 `Backlog` 调整为 `In Progress`
  - `API 网关契约测试` 更新为 `16 passed / 0 failed`

### Fixed
- 修复本地联调阶段“订阅已购买但任务创建未做配额门禁”的一致性缺口，补齐 `usage` 与创建门禁口径。

### Security
- 新增 `mock-confirm` 仅用于本地联调，不改变正式支付回调验签与鉴权边界；关键接口继续要求 `Authorization/X-Request-Id`。

### Rollback
- 回退 `mock-confirm` 接口、任务创建配额门禁与净额扣减改造，恢复到 BE-007 第二阶段之前实现。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.26] - 2026-02-21

### Added
- 新增迁移：`apps/api-gateway/prisma/migrations/20260222013500_add_billing_reconciliation_tables/migration.sql`，创建对账三表：
  - `billing_reconcile_monthly`
  - `billing_reconcile_checkpoints`
  - `billing_reconcile_runs`
- 新增 `billing-service` 对账作业核心：
  - `apps/billing-service/src/reconciliation/job.ts`
  - `apps/billing-service/src/main.ts`
- 新增对账作业命令：
  - `pnpm --filter @apps/billing-service job:reconcile:hourly`
  - `pnpm --filter @apps/billing-service job:reconcile:daily`
- 新增集成测试：
  - `apps/billing-service/test/reconciliation.spec.ts`（覆盖小时增量 + 日终全量框架）
- `doc/engineering/rd-progress-management.md` 新增第 40 节回填（`BE-007` 第二阶段执行证据）。

### Changed
- `apps/api-gateway/prisma/schema.prisma` 新增对账相关模型：
  - `BillingReconcileMonthly`
  - `BillingReconcileCheckpoint`
  - `BillingReconcileRun`
- `apps/billing-service/package.json` 增加 `@prisma/client` 依赖与对账作业/集成测试脚本。
- `doc/engineering/rd-progress-management.md` 更新：
  - `BE-007` 状态由 `In Progress` 调整为 `In Review`
  - 新增本轮对账迁移、integration 与 typecheck 证据。

### Fixed
- 修复 `BE-007` 仅有订阅接口、缺少账务对账任务执行基座的问题，补齐“月聚合 + 增量校验 + 全量框架”能力。

### Security
- 对账作业仅消费内部 `usage_ledger` 数据，不新增外部暴露接口或鉴权放宽路径。

### Rollback
- 回退 `add_billing_reconciliation_tables` 迁移、`billing-service` 对账作业与集成测试、台账更新，恢复到 BE-007 第一阶段状态。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/billing-service`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.25] - 2026-02-21

### Added
- 新增迁移：`apps/api-gateway/prisma/migrations/20260222002000_add_subscriptions_table/migration.sql`，创建 `subscriptions` 表（状态/渠道约束、订单号唯一约束、用户维度索引）。
- 新增订阅与配额能力：
  - `apps/api-gateway/src/modules/subscriptions/subscriptions.service.ts`
  - `apps/api-gateway/src/modules/subscriptions/subscriptions.controller.ts`
  - `apps/api-gateway/src/modules/usage/usage.controller.ts`
- 新增契约用例：`/v1/subscriptions/checkout`、`/v1/subscriptions/me`、`/v1/usage/me`。
- `doc/engineering/rd-progress-management.md` 新增第 39 节回填（`BE-007` 最小骨架执行证据）。

### Changed
- `apps/api-gateway/prisma/schema.prisma` 增加 `Subscription` 模型。
- `apps/api-gateway/src/modules/app.module.ts` 注册 `SubscriptionsService` 与相关控制器。
- `apps/api-gateway/.env.example` 增加 `SUBSCRIPTIONS_STORE=prisma`。
- `doc/engineering/rd-progress-management.md` 更新：
  - `BE-007` 状态由 `Backlog` 调整为 `In Progress`
  - `API 网关契约测试` 结果更新为 `14 passed / 0 failed`

### Fixed
- 修复 `SubscriptionsService` 在 contract 运行时的依赖注入不稳定问题（显式 `@Inject`），恢复 `/v1/subscriptions/*` 与 `/v1/usage/me` 契约可执行性。

### Security
- 新增接口继续遵循 `Authorization` 与 `X-Request-Id` 约束；未放宽现有鉴权边界。

### Rollback
- 回退 `add_subscriptions_table` 迁移、订阅/配额服务与控制器、契约测试新增用例与台账回填，恢复到仅 `plans` 能力集。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.24] - 2026-02-21

### Added
- 新增迁移：`apps/api-gateway/prisma/migrations/20260221235500_add_usage_ledger_dedupe_index/migration.sql`。
- 新增校验脚本与命令：
  - `apps/api-gateway/scripts/data-dedupe-index-check.ts`
  - `pnpm --filter @apps/api-gateway test:data-dedupe-index`
- `doc/engineering/rd-progress-management.md` 新增第 38 节回填（`DATA-003` 执行证据）。

### Changed
- `apps/api-gateway/prisma/schema.prisma` 为 `usage_ledger` 补充唯一约束：`(userId, taskId, status, source)`。
- `apps/api-gateway/src/modules/tasks/tasks.service.ts` 将 `usage_ledger` 写入改为 `createMany + skipDuplicates`。
- `apps/worker-orchestrator/src/main.ts` 将成功态账务写入改为 `createMany + skipDuplicates`。
- `DATA-003` 状态由 `Backlog` 更新为 `In Review`。

### Fixed
- 修复账务流水在重试/并发场景下可能重复写入的问题，确保防重行为可复现、可验证。

### Security
- 去重校验仅验证索引与冲突行为，不放宽现有鉴权与环境边界。

### Rollback
- 回退 `add_usage_ledger_dedupe_index`、`data-dedupe-index-check.ts` 与 `usage_ledger` 写入幂等改造，恢复原实现。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.23] - 2026-02-21

### Added
- 新增迁移：`apps/api-gateway/prisma/migrations/20260221233000_add_plans_seed/migration.sql`，创建 `plans` 表并初始化 `free/pro_month/pro_year` 种子。
- 新增种子脚本与命令：
  - `apps/api-gateway/prisma/seed-plans.ts`
  - `pnpm --filter @apps/api-gateway prisma:seed:plans`
- 新增服务：`apps/api-gateway/src/modules/plans/plans.service.ts`，支持“优先 DB + 默认回退”读取套餐。
- `doc/engineering/rd-progress-management.md` 新增第 37 节回填（`DATA-002` 执行证据）。

### Changed
- `GET /v1/plans` 从静态返回升级为服务化读取（控制器改为调用 `PlansService`）。
- `apps/api-gateway/prisma/schema.prisma` 增加 `Plan` 模型。
- `apps/api-gateway/test/contract.spec.ts` 增加 `/v1/plans` 契约用例，契约测试总数更新为 `11`。
- `DATA-002` 状态由 `Backlog` 更新为 `In Review`。

### Fixed
- 修复套餐数据仅存在于控制器静态常量、无法复用数据层初始化流程的问题。

### Security
- 继续保持鉴权头校验路径，`/v1/plans` 仍要求 `Authorization`。

### Rollback
- 回退 `plans` 迁移、种子脚本、`PlansService` 与控制器改造，恢复静态套餐返回模式。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.22] - 2026-02-21

### Added
- `doc/engineering/rd-progress-management.md` 新增第 36 节执行回填，沉淀 `OPT-ARCH-002` 收尾发布前检查清单（可 Done 版本）。
- 新增发布前检查清单逐项结论（真源一致性、关键链路、P0/P1、阻塞例外、回滚能力）。
- 新增本轮矩阵报告引用：
  - `apps/worker-orchestrator/.runtime/reports/deadletter-guard-drill-matrix-2026-02-21T14-40-27-957Z.md`

### Changed
- `doc/engineering/mvp-optimization-backlog.md` 中 `OPT-ARCH-002` 状态由 `In Review` 更新为 `Done`，并补充“发布前检查清单可执行”验收口径。
- 将云端复验动作明确收敛到 `BLK-004` 发布前门禁，不阻塞本次优化项收口。

### Fixed
- 修复 `OPT-ARCH-002` 已具备收尾条件但缺少统一发布前检查清单版本的问题。

### Security
- 保持“本地映射验收 + 发布前云端复验”双门禁，不放宽认证与环境边界要求。

### Rollback
- 回退第 36 节回填与 `OPT-ARCH-002` 状态更新，恢复 `In Review` 并按原路径继续评审。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.21] - 2026-02-21

### Added
- `doc/engineering/rd-progress-management.md` 新增第 35 节执行回填，记录 `dev/shared/staging` 三目标矩阵演练（shared/staging 使用本地地址映射）证据。
- 新增本次矩阵报告引用：
  - `apps/worker-orchestrator/.runtime/reports/deadletter-guard-drill-matrix-2026-02-21T14-25-47-376Z.md`

### Changed
- `Deadletter 演练矩阵校验（本轮）` 更新为三目标通过：`passed（dev/shared/staging-local）`。
- 第 34 节阻塞项由“等待 shared/staging 地址”调整为“当前阶段无阻塞（本地映射）”。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 现状与验收口径，补充 shared/staging 本地映射矩阵通过状态。

### Fixed
- 修复矩阵验收仅有 dev 证据、缺少 shared/staging 阶段性记录的问题。

### Security
- 继续保持“本地映射先验收、云端发布前复验”的门禁策略，不跳过最终云端验证。

### Rollback
- 回退本次文档回填更新，恢复为仅 dev 矩阵证据状态。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.20] - 2026-02-21

### Added
- 新增矩阵脚本：`apps/worker-orchestrator/src/ops/deadletter-guard-drill-matrix.ts`。
- 新增命令：`pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill:matrix`。
- 矩阵脚本支持：
  - 默认目标：`dev/shared/staging`（按环境变量可用性自动解析）
  - 自定义目标：`DRILL_MATRIX_TARGETS=name=databaseUrl|redisUrl,...`
  - Markdown 报告输出（默认 `apps/worker-orchestrator/.runtime/reports/`）
- `.gitignore` 新增 `apps/worker-orchestrator/.runtime/`，避免矩阵报告污染仓库。
- `doc/engineering/rd-progress-management.md` 新增第 34 节执行回填（矩阵命令与 dev 证据）。

### Changed
- deadletter guard drill 从单环境执行扩展为矩阵执行与可归档报告能力。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 验收口径，纳入矩阵报告能力。

### Fixed
- 修复云端演练证据需要手工汇总的问题，改为脚本自动汇总。

### Security
- 矩阵脚本仅透传指定环境变量，不引入新的鉴权绕过路径；报告目录默认忽略提交。

### Rollback
- 回退 `deadletter-guard-drill-matrix.ts`、`package.json` 新增命令、`.gitignore` 与相关台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.19] - 2026-02-21

### Added
- 新增演练脚本：`apps/worker-orchestrator/src/ops/deadletter-guard-drill.ts`。
- 新增命令：`pnpm --filter @apps/worker-orchestrator ops:deadletter:guard-drill`。
- 演练脚本覆盖完整闭环：
  - 自动构造 drill outbox + deadletter 样本
  - 执行“高并发批量阻断”校验（预期失败）
  - 执行“显式确认放行”校验（预期成功）
  - 自动清理演练样本
- `doc/engineering/rd-progress-management.md` 新增第 33 节执行回填（一键演练证据）。

### Changed
- deadletter 容灾验证从“手工多命令组合”升级为“一键脚本化演练”。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 验收口径，纳入一键演练能力。

### Fixed
- 修复阻断/放行演练依赖手工步骤、易漏清理的问题。

### Security
- 演练脚本执行后会自动清理临时样本，降低残留测试数据风险。

### Rollback
- 回退 `apps/worker-orchestrator/src/ops/deadletter-guard-drill.ts`、`apps/worker-orchestrator/package.json` 新增命令与相关台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.18] - 2026-02-21

### Added
- `apps/worker-orchestrator/src/ops/deadletter-replay.ts` 新增“高并发+大批量”联动阻断参数：
  - `DLQ_HIGH_CONCURRENCY_BULK_REJECT_THRESHOLD`（默认 `50`）
  - `DLQ_ALLOW_HIGH_CONCURRENCY_BULK_REPLAY`（默认 `false`，显式确认后才允许放行）
- 新增阻断行为：高并发（> 默认上限）且匹配重放量达到阈值时，脚本直接拒绝执行并返回失败。
- `doc/engineering/rd-progress-management.md` 新增第 32 节执行回填（阻断策略与预期失败验证证据）。

### Changed
- deadletter 重放从“高并发可控提权”进一步升级为“高并发提权 + 大批量默认阻断 + 显式二次确认”。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 现状与验收口径，纳入联动阻断机制。

### Fixed
- 修复高并发批量重放在误操作场景下可能直接执行的问题，新增硬性阻断门槛。

### Security
- 保持默认保守策略：未显式开启二次确认时，高并发批量重放会被拒绝执行。

### Rollback
- 回退 `apps/worker-orchestrator/src/ops/deadletter-replay.ts` 联动阻断逻辑与相关台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.17] - 2026-02-21

### Added
- `apps/worker-orchestrator/src/ops/deadletter-replay.ts` 新增并发保护参数：
  - 默认并发硬上限 `10`
  - 显式开关 `DLQ_ALLOW_HIGH_CONCURRENCY=true` 时，允许临时提升到 `20`
- 并发超限自动钳制并输出告警日志（避免恢复操作误配置导致过载）。
- `doc/engineering/rd-progress-management.md` 新增第 31 节执行回填（并发保护落地与双场景 dry-run 证据）。

### Changed
- `DLQ_REPLAY_CONCURRENCY` 从“直接生效”调整为“受上限约束 + 可控提权”模式。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 验收口径，纳入并发上限保护。

### Fixed
- 修复 deadletter 重放并发配置可被无限放大的风险。

### Security
- 默认继续采用保守并发策略（上限 10），高并发需显式开关，降低误操作概率。

### Rollback
- 回退 `apps/worker-orchestrator/src/ops/deadletter-replay.ts` 并发上限策略与相关台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.16] - 2026-02-21

### Added
- `apps/worker-orchestrator/src/ops/deadletter-replay.ts` 新增批量重放参数：
  - `DLQ_SOURCE=all|task.progress|outbox.dispatch`
  - `DLQ_LOOKBACK_MINUTES`
  - `DLQ_CREATED_AFTER` / `DLQ_CREATED_BEFORE`
  - `DLQ_REPLAY_CONCURRENCY`
- `doc/engineering/rd-progress-management.md` 新增第 30 节执行回填（批量重放增强与 dry-run 证据）。

### Changed
- deadletter 重放从“单条串行”升级为“按批次并发执行”，并支持按来源/时间窗口收敛目标集。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 现状与验收口径，纳入批量重放能力。

### Fixed
- 修复死信重放在大量积压场景下需要逐条筛选、恢复效率低的问题。

### Security
- 继续保持默认 `DLQ_DRY_RUN=true`，批量参数不改变默认安全执行策略。

### Rollback
- 回退 `apps/worker-orchestrator/src/ops/deadletter-replay.ts` 本轮参数增强与台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.15] - 2026-02-21

### Added
- 新增运维脚本：`apps/worker-orchestrator/src/ops/deadletter-replay.ts`。
- 新增命令：`pnpm --filter @apps/worker-orchestrator ops:deadletter:replay`。
- 脚本支持：
  - 按 `DLQ_JOB_ID`、`DLQ_TASK_ID`、`DLQ_EVENT_ID` 筛选 deadletter 重放目标
  - `task.progress` 死信重投主队列
  - `outbox.dispatch` 死信将 outbox 事件复位为 `PENDING` 并清零 `retryCount`
  - `DLQ_DRY_RUN=true` 默认演练模式，`DLQ_DELETE_AFTER_REPLAY` 可选删除已重放死信
- `doc/engineering/rd-progress-management.md` 新增第 29 节执行回填（手动重放能力与测试证据）。

### Changed
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 当前现状与验收标准，纳入“手动重放”能力。

### Fixed
- 修复 deadletter 仅可观测不可操作的问题，补齐运维侧最小重放闭环。

### Security
- 脚本默认 dry-run，不直接执行重放；仅在显式设置参数时执行实际写入，降低误操作风险。

### Rollback
- 回退 `apps/worker-orchestrator/src/ops/deadletter-replay.ts`、`apps/worker-orchestrator/package.json` 新增命令与相关台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

## [0.5.14] - 2026-02-21

### Added
- `apps/worker-orchestrator/src/main.ts` 新增 deadletter/retry 治理能力：
  - 默认重试策略：`ORCHESTRATOR_MAX_RETRIES=2`（总尝试 3 次）
  - 重试退避策略：指数退避 + `ORCHESTRATOR_RETRY_JITTER_RATIO`
  - deadletter 队列：`QUEUE_DEADLETTER_NAME`（默认 `QUEUE_NAME.deadletter`）
- 新增 outbox 超限处理：`ORCHESTRATOR_OUTBOX_MAX_RETRIES=2`，超过阈值将事件置为 `DEAD` 并写入 deadletter。
- 新增死信告警阈值配置：`ORCHESTRATOR_DEADLETTER_ALERT_WINDOW_SEC`、`ORCHESTRATOR_DEADLETTER_ALERT_RATE`、`ORCHESTRATOR_DEADLETTER_ALERT_MIN_SAMPLES`。
- `doc/engineering/rd-progress-management.md` 新增第 28 节执行回填（deadletter/retry 策略 + 本地双进程 smoke 证据）。

### Changed
- `OPT-ARCH-002` 当前现状从“消息驱动”升级为“消息驱动 + 失败治理（重试/死信/告警）”。
- `doc/engineering/mvp-optimization-backlog.md` 更新 `OPT-ARCH-002` 验收口径，新增死信与阈值告警要求。

### Fixed
- 修复队列失败路径仅日志记录、缺少持久化治理的问题。
- 修复 outbox 分发失败无限重试风险，新增上限转 `DEAD` 语义。

### Security
- 保持 `Authorization`、`Idempotency-Key`、`X-Request-Id` 校验链路不变；仅增强失败治理能力，不放宽鉴权边界。

### Rollback
- 回退 `apps/worker-orchestrator/src/main.ts` 本轮 deadletter/retry 策略改动与相关台账更新。

### References
- 影响范围：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`、`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering`
- 回填文件：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`

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
