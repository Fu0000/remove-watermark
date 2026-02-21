# MVP 后优化台账（v1.13）

## 1. 目标
- 将研发过程中发现的优化点统一沉淀为可追踪台账，避免仅口头记录。
- 区分 "MVP 必做" 与 "MVP 后优化"，保证当前交付节奏稳定。

## 2. 适用范围
- 适用于前端、后端、测试、运维、工程流程优化项。
- 与以下文档联动：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/AGENTS.md`

## 3. 标注规则（MUST）
- 每条优化项必须包含以下字段：
  - `OPT-ID`
  - `类别`（Architecture/Performance/Reliability/Security/Process）
  - `触发背景`
  - `当前现状`
  - `优化建议`
  - `影响范围`
  - `收益评估`
  - `实施成本`
  - `优先级`
  - `执行时机`（MVP 内/MVP 后）
  - `依赖`
  - `验收标准`
  - `状态`（Backlog/Ready/In Progress/In Review/Done）
  - `Owner`
  - `最近更新`

## 4. 优化台账

| OPT-ID | 类别 | 触发背景 | 当前现状 | 优化建议 | 影响范围 | 收益评估 | 实施成本 | 优先级 | 执行时机 | 依赖 | 验收标准 | 状态 | Owner | 最近更新 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OPT-ARCH-001 | Architecture | 任务与幂等当前为进程内实现 | Prisma schema 与事务化持久化分支已落地，仍缺 shared PostgreSQL 运行时验收 | 将 `tasks/idempotency_keys/usage_ledger/outbox_events` 迁移到 PostgreSQL + Prisma，替换文件态持久化 | `apps/api-gateway`、DB | 消除状态丢失，提升联调稳定性与可审计性 | 高 | P0 | MVP 内（稳定性前置执行） | PostgreSQL、Prisma schema、迁移脚本、shared 环境 DB 连通 | 服务重启后任务与幂等不丢失；创建任务事务可回放；shared smoke 通过 | In Progress | 后端 | 2026-02-21 |
| OPT-ARCH-002 | Reliability | 状态推进目前由 API 读取触发模拟推进 | `worker-orchestrator` 已接入 Redis/BullMQ，并新增 deadletter/retry 治理（`maxRetries=2`、指数退避+jitter、不可重试直入死信、outbox 超限转 `DEAD`、死信告警阈值）；已补充手动重放脚本（按 `jobId/taskId/eventId`）与批量能力（来源过滤、时间窗口、并发重放），并落地并发保护（默认上限 `10`，显式开关可临时提升到 `20`）及“高并发+大批量”联动阻断（阈值达标时默认拒绝）；新增一键演练脚本覆盖“阻断+放行+清理”闭环，并提供矩阵报告能力（dev/shared/staging），已完成本地地址映射三目标验收并形成发布前检查清单（可 Done 版本） | 将状态推进迁移至 `worker-orchestrator`，API 仅查询与动作投递 | `apps/api-gateway`、`apps/worker-orchestrator`、Redis | 还原真实链路，降低 API 副作用并提升失败可治理性 | 高 | P0 | MVP 内（稳定性前置执行） | Redis/BullMQ、Outbox 消费、shared/staging 双进程部署 | 状态只由 Worker 推进；API 无推进副作用；双进程 smoke 通过；失败任务可进入死信并触发阈值告警；支持手动/批量重放；默认并发上限受控；高并发批量默认阻断；演练脚本可一键复现阻断与放行；支持矩阵报告；shared/staging 本地映射矩阵已通过；发布前检查清单可执行 | Done | 后端 | 2026-02-21 |
| OPT-PERF-001 | Performance | H5 构建持续存在包体告警 | `build:h5` 仍有 `AssetsOverSizeLimitWarning` | 页面维度拆包 + 依赖裁剪（react-query/taro 体积控制） | `apps/user-frontend` | 改善首屏性能与加载稳定性 | 中 | P1 | MVP 后第 2 优先级 | 前端构建配置、埋点监控 | 首包体积低于告警阈值；关键页面 TTI 下降 | Backlog | 前端 | 2026-02-21 |
| OPT-FE-001 | Process | 编辑页联调阶段仅示例蒙版提交 | 已补齐真实绘制首版能力，需进入评审 | 实现真实画笔+多边形编辑器组件，补充冲突回滚交互 | `apps/user-frontend/src/pages/editor` | 提升可用性，降低误操作 | 中 | P1 | MVP 内（已提前执行） | UI 组件设计、e2e 用例 | 支持绘制/撤销/重做；冲突提示与恢复流程可用 | In Review | 前端 | 2026-02-21 |
| OPT-FE-002 | Performance | 真实绘制采用 DOM 点渲染 | 长路径画笔会产生较多节点，可能影响低端机流畅度 | 将蒙版渲染从 DOM 点阵迁移到 Canvas 分层渲染（保留数据结构不变） | `apps/user-frontend/src/pages/editor` | 降低渲染开销，提升长路径交互帧率 | 中 | P1 | MVP 后第 2 优先级 | Taro Canvas 封装、回归用例 | 500+ 点连续绘制时页面交互无明显卡顿；提交数据结构兼容现有接口 | Backlog | 前端 | 2026-02-21 |
| OPT-REL-001 | Reliability | shared/staging 联调依赖人工切换地址 | 已完成多环境矩阵脚本与报告输出能力，当前待 shared/staging 云端地址接入验证 | 增加环境探测与一键 smoke 矩阵脚本（dev/shared/staging） | `apps/api-gateway/scripts`、CI | 降低环境切换成本与误判 | 中 | P1 | MVP 后第 2 优先级 | 云端 shared/staging 可达 | 一次命令完成多环境 smoke 并输出报告 | In Review | 后端+运维 | 2026-02-21 |
| OPT-PROC-001 | Process | 优化项分散在对话和提交说明中 | 难以追踪优先级与落地情况 | 固化“发现即回填”流程：每次任务结束更新本台账 + AGENTS 执行规则 | `doc/engineering/*`、`AGENTS.md` | 提升跨迭代可追踪性 | 低 | P0 | 立即执行 | 无 | 每轮任务均可在台账定位新增/更新记录 | In Progress | 技术负责人 | 2026-02-21 |

## 5. 使用说明
- 新增优化项：在表格末尾追加，`OPT-ID` 不可复用。
- 状态流转：`Backlog -> Ready -> In Progress -> In Review -> Done`。
- 与研发任务联动：
  - 若优化影响当前迭代，需在 `rd-progress-management.md` 对应任务的“风险/遗留问题/下一步”同步引用。
  - 若为 MVP 后事项，必须在本台账写清“执行时机”和“依赖”。

## 6. 版本记录
| 版本 | 日期 | 说明 |
|---|---|---|
| v1.13 | 2026-02-21 | OPT-ARCH-002 收尾为发布前检查清单可 Done 版本，状态更新为 Done |
| v1.12 | 2026-02-21 | OPT-ARCH-002 补充 shared/staging 本地映射矩阵验收证据 |
| v1.11 | 2026-02-21 | OPT-ARCH-002 增加 guard-drill 矩阵执行与报告输出能力 |
| v1.10 | 2026-02-21 | OPT-ARCH-002 增加阻断/放行一键演练脚本（可复用到 shared/staging） |
| v1.9 | 2026-02-21 | OPT-ARCH-002 增加高并发+大批量联动阻断保护（阈值达标默认拒绝） |
| v1.8 | 2026-02-21 | OPT-ARCH-002 增加 deadletter 重放并发上限保护（默认 10，提权 20） |
| v1.7 | 2026-02-21 | OPT-ARCH-002 增加 deadletter 批量重放能力（来源/时间窗口/并发） |
| v1.6 | 2026-02-21 | OPT-ARCH-002 增加 deadletter 手动重放脚本与验收口径 |
| v1.5 | 2026-02-21 | OPT-ARCH-002 补充 deadletter/retry 治理策略（重试上限、回退抖动、死信与告警） |
| v1.4 | 2026-02-21 | OPT-ARCH-002 升级为 Redis/BullMQ 消息驱动编排，状态更新为 In Review |
| v1.3 | 2026-02-21 | OPT-ARCH-002 前置到 MVP 内执行，状态更新为 In Progress 并补充 Worker 编排现状 |
| v1.2 | 2026-02-21 | OPT-ARCH-001 前置到 MVP 内执行，状态更新为 In Progress 并补充 Prisma 基座现状 |
| v1.1 | 2026-02-21 | FE-003 真实绘制优化项提前执行并新增 Canvas 性能优化条目 |
| v1.0 | 2026-02-21 | 首版 MVP 后优化台账，沉淀架构、性能、流程优化项与执行字段 |
