# MVP 后优化台账（v1.15）

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
| OPT-ARCH-001 | Architecture | 任务与幂等当前为进程内实现 | Prisma schema 与事务化持久化分支已落地，并补齐 `idempotency_keys/outbox_events/usage_ledger` 去重索引校验脚本与 `usage_ledger` 防重写入策略；仍缺 shared PostgreSQL 运行时验收 | 将 `tasks/idempotency_keys/usage_ledger/outbox_events` 迁移到 PostgreSQL + Prisma，替换文件态持久化 | `apps/api-gateway`、DB | 消除状态丢失，提升联调稳定性与可审计性 | 高 | P0 | MVP 内（稳定性前置执行） | PostgreSQL、Prisma schema、迁移脚本、shared 环境 DB 连通 | 服务重启后任务与幂等不丢失；创建任务事务可回放；去重索引校验脚本通过；shared smoke 通过 | In Progress | 后端 | 2026-02-21 |
| OPT-ARCH-002 | Reliability | 状态推进目前由 API 读取触发模拟推进 | `worker-orchestrator` 已接入 Redis/BullMQ，并新增 deadletter/retry 治理（`maxRetries=2`、指数退避+jitter、不可重试直入死信、outbox 超限转 `DEAD`、死信告警阈值）；已补充手动重放脚本（按 `jobId/taskId/eventId`）与批量能力（来源过滤、时间窗口、并发重放），并落地并发保护（默认上限 `10`，显式开关可临时提升到 `20`）及“高并发+大批量”联动阻断（阈值达标时默认拒绝）；新增一键演练脚本覆盖“阻断+放行+清理”闭环，并提供矩阵报告能力（dev/shared/staging），已完成本地地址映射三目标验收并形成发布前检查清单（可 Done 版本） | 将状态推进迁移至 `worker-orchestrator`，API 仅查询与动作投递 | `apps/api-gateway`、`apps/worker-orchestrator`、Redis | 还原真实链路，降低 API 副作用并提升失败可治理性 | 高 | P0 | MVP 内（稳定性前置执行） | Redis/BullMQ、Outbox 消费、shared/staging 双进程部署 | 状态只由 Worker 推进；API 无推进副作用；双进程 smoke 通过；失败任务可进入死信并触发阈值告警；支持手动/批量重放；默认并发上限受控；高并发批量默认阻断；演练脚本可一键复现阻断与放行；支持矩阵报告；shared/staging 本地映射矩阵已通过；发布前检查清单可执行 | Done | 后端 | 2026-02-21 |
| OPT-PERF-001 | Performance | H5 构建持续存在包体告警 | `build:h5` 仍有 `AssetsOverSizeLimitWarning` | 页面维度拆包 + 依赖裁剪（react-query/taro 体积控制） | `apps/user-frontend` | 改善首屏性能与加载稳定性 | 中 | P1 | MVP 后第 2 优先级 | 前端构建配置、埋点监控 | 首包体积低于告警阈值；关键页面 TTI 下降 | Backlog | 前端 | 2026-02-21 |
| OPT-FE-001 | Process | 编辑页联调阶段仅示例蒙版提交 | 已补齐真实绘制首版能力，需进入评审 | 实现真实画笔+多边形编辑器组件，补充冲突回滚交互 | `apps/user-frontend/src/pages/editor` | 提升可用性，降低误操作 | 中 | P1 | MVP 内（已提前执行） | UI 组件设计、e2e 用例 | 支持绘制/撤销/重做；冲突提示与恢复流程可用 | In Review | 前端 | 2026-02-21 |
| OPT-FE-002 | Performance | 真实绘制采用 DOM 点渲染 | 长路径画笔会产生较多节点，可能影响低端机流畅度 | 将蒙版渲染从 DOM 点阵迁移到 Canvas 分层渲染（保留数据结构不变） | `apps/user-frontend/src/pages/editor` | 降低渲染开销，提升长路径交互帧率 | 中 | P1 | MVP 后第 2 优先级 | Taro Canvas 封装、回归用例 | 500+ 点连续绘制时页面交互无明显卡顿；提交数据结构兼容现有接口 | Backlog | 前端 | 2026-02-21 |
| OPT-FE-003 | Reliability | 2026-02-22 自动化全流程体验中，编辑页“提交蒙版后进入任务中心”未自动完成，核心链路停留在编辑页 | H5 桌面鼠标点击蒙版画布未稳定产生日志点位；步骤 2 失败时缺少明显分步引导与就地修复入口 | 统一蒙版输入事件（mouse/touch/pointer）并补齐“步骤 1 -> 步骤 2 -> 任务中心”状态提示；步骤 2 成功后强制 `switchTab(/tasks)` 并显示成功反馈 | `apps/user-frontend/src/pages/editor`、`apps/user-frontend/src/pages/tasks` | 提升上传编辑主链路成功率，降低用户在编辑页卡死与误判失败 | 中 | P0 | MVP 内（联调阻塞优先） | FE-003 编辑器事件适配、联调回归脚本 | 桌面 H5 点击可稳定新增多边形点；步骤 2 成功后 2 秒内进入任务中心；失败提示包含可执行下一步 | Ready | 前端 | 2026-02-22 |
| OPT-FE-004 | Process | 自动化体验显示任务页与结果页信息可达但操作反馈弱（排队中时缺少进度预期，结果动作可点击但无有效产物） | 任务页仅展示单条摘要；结果页 `QUEUED` 状态下“预览/复制”动作对用户价值低，缺少阶段进度与下一步建议 | 新增状态机可视化进度条（`UPLOADED -> ... -> SUCCEEDED`）与阶段 ETA；`SUCCEEDED` 前禁用结果动作并给出引导（返回任务中心/继续轮询） | `apps/user-frontend/src/pages/tasks`、`apps/user-frontend/src/pages/result` | 降低“系统是否卡住”的认知成本，提高等待阶段留存与自助排障效率 | 中 | P1 | MVP 内（体验补强） | BE 状态字段一致性、UI 组件复用 | 任务页可见阶段进度；结果页在非成功态禁用无效动作并展示明确引导文案 | Backlog | 前端 | 2026-02-22 |
| OPT-FE-005 | Process | 订阅页自动化步骤显示 `checkout` 后仍需人工复制订单号再执行确认，操作步骤冗余 | 当前流程为“发起订阅 -> 复制提示中的 orderId -> 粘贴输入框 -> mock-confirm” | `checkout` 成功后自动回填 `orderId` 输入框并展示“一键确认支付（mock）”；保留手动输入作为兜底 | `apps/user-frontend/src/pages/subscription` | 减少联调动作步骤，降低测试与演示误操作概率 | 低 | P2 | MVP 后第 2 优先级 | FE-006 订阅页动作区重构 | `checkout` 成功后输入框自动填充；用户可单击一次完成 mock-confirm | Backlog | 前端 | 2026-02-22 |
| OPT-ARCH-003 | Architecture | 推理链路当前已引入 Python inference-gateway 作为 ProPainter/LaMa 接入层，后续需统一治理 | 现阶段已具备 gateway 接口与 worker 调用，但尚未完成 Triton 统一封装与模型路由治理 | 设计并落地 inference-gateway -> Triton 统一适配层，沉淀模型路由、超时、降级、错误码标准化 | `apps/worker-orchestrator`、`apps/inference-gateway`、`doc/tad.md` | 降低双栈维护成本，提升推理链路一致性与可观测性 | 中 | P1 | MVP 后第 2 优先级 | GPU 资源、Triton 模型仓、运维监控模板 | 至少 1 条图片与 1 条视频链路可由 Triton 托管并复用统一契约；错误码与告警口径一致 | Backlog | 后端 | 2026-02-22 |
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
| v1.16 | 2026-02-22 | 新增 `OPT-ARCH-003`（inference-gateway 向 Triton 统一化治理） |
| v1.15 | 2026-02-22 | 新增自动化全流程体验优化项 `OPT-FE-003/004/005`（编辑链路、任务/结果反馈、订阅动作降噪） |
| v1.14 | 2026-02-21 | OPT-ARCH-001 补充 DATA-003 去重索引校验与 usage_ledger 防重策略进展 |
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
