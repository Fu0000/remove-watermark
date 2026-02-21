# MVP 后优化台账（v1.0）

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
| OPT-ARCH-001 | Architecture | 任务与幂等当前为进程内实现 | 重启会丢失任务态与幂等记录 | 将 `tasks/idempotency_keys/usage_ledger/outbox_events` 迁移到 PostgreSQL + Prisma，替换文件态持久化 | `apps/api-gateway`、DB | 消除状态丢失，提升联调稳定性与可审计性 | 高 | P0 | MVP 后第 1 优先级 | PostgreSQL、Prisma schema、迁移脚本 | 服务重启后任务与幂等不丢失；创建任务事务可回放 | Backlog | 后端 | 2026-02-21 |
| OPT-ARCH-002 | Reliability | 状态推进目前由 API 读取触发模拟推进 | 不符合真实 Worker 编排模式 | 将状态推进迁移至 `worker-orchestrator`，API 仅查询与动作投递 | `apps/api-gateway`、`apps/worker-orchestrator` | 还原真实链路，降低 API 副作用 | 高 | P0 | MVP 后第 1 优先级 | 队列基础设施、Outbox 消费 | 状态只由 Worker 推进；API 无推进副作用 | Backlog | 后端 | 2026-02-21 |
| OPT-PERF-001 | Performance | H5 构建持续存在包体告警 | `build:h5` 仍有 `AssetsOverSizeLimitWarning` | 页面维度拆包 + 依赖裁剪（react-query/taro 体积控制） | `apps/user-frontend` | 改善首屏性能与加载稳定性 | 中 | P1 | MVP 后第 2 优先级 | 前端构建配置、埋点监控 | 首包体积低于告警阈值；关键页面 TTI 下降 | Backlog | 前端 | 2026-02-21 |
| OPT-FE-001 | Process | 编辑页当前仅示例蒙版提交 | 缺少真实绘制/撤销/版本冲突可视化 | 实现真实画笔+多边形编辑器组件，补充冲突回滚交互 | `apps/user-frontend/src/pages/editor` | 提升可用性，降低误操作 | 中 | P1 | MVP 后第 2 优先级 | UI 组件设计、e2e 用例 | 支持绘制/撤销/重做；冲突提示与恢复流程可用 | Backlog | 前端 | 2026-02-21 |
| OPT-REL-001 | Reliability | shared/staging 联调依赖人工切换地址 | 云端地址未就绪时联调证据断档 | 增加环境探测与一键 smoke 矩阵脚本（dev/shared/staging） | `apps/api-gateway/scripts`、CI | 降低环境切换成本与误判 | 中 | P1 | MVP 后第 2 优先级 | 云端 shared/staging 可达 | 一次命令完成多环境 smoke 并输出报告 | Backlog | 后端+运维 | 2026-02-21 |
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
| v1.0 | 2026-02-21 | 首版 MVP 后优化台账，沉淀架构、性能、流程优化项与执行字段 |
