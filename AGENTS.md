# AGENTS 执行入口规范（v1.0）

## 1. 文档定位与适用范围

### 1.1 定位
- 本文件是 Codex 在本仓库执行任务时的入口规范（Execution Contract）。
- 本文件用于约束任务执行流程、交付质量、回填机制与协作边界。
- 本文件不替代产品与技术真源文档，仅负责统一执行口径。

### 1.2 适用范围
- 适用于本仓库所有任务：需求澄清、文档更新、代码实现、测试验证、联调与发布准备。
- 适用于所有协作角色：产品、前端、后端、测试、算法、运维、项目管理。

### 1.3 冲突处理
- 如本文件与其他文档出现冲突，必须回到真源文档进行裁决。
- 禁止以临时口头约定覆盖文档真源。

## 2. 规范优先级与真源映射

### 2.1 规范优先级（从高到低）
- `/Users/codelei/Documents/ai-project/remove-watermark/doc/project-constraints.md`
- `/Users/codelei/Documents/ai-project/remove-watermark/doc/prd.md`
- `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
- `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
- `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/*`
- `/Users/codelei/Documents/ai-project/remove-watermark/README.md`

### 2.2 真源映射
- 产品范围、FR/NFR/MET：`/Users/codelei/Documents/ai-project/remove-watermark/doc/prd.md`
- 接口字段、错误码、状态机、契约：`/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
- 架构边界、事务策略、降级策略：`/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
- 不可变约束与术语统一：`/Users/codelei/Documents/ai-project/remove-watermark/doc/project-constraints.md`
- 执行细则（提交、测试、联调、研发流程等）：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/*`

## 3. 项目不可变约束（MUST）

### 3.1 固定边界（MUST）
- MVP 口径固定：`v1.0 = 图片 + 视频`。
- 对象存储固定：`MinIO`。
- 架构固定：`Node 控制面 + Triton 推理面`。
- 交付模型固定：`Trunk-Based + Feature Flag`。
- 提交规范固定：`Conventional Commits`。
- 环境模型固定：`dev/shared/staging/prod`。

### 3.2 状态机固定（MUST）
- 任务状态机字面量固定为：
- `UPLOADED -> QUEUED -> PREPROCESSING -> DETECTING -> INPAINTING -> PACKAGING -> SUCCEEDED|FAILED|CANCELED`

### 3.3 禁止项（MUST NOT）
- 禁止将 PDF/PPT 写入 `v1.0` 功能范围。
- 禁止修改状态机字面量而不同步真源。
- 禁止自定义错误码语义覆盖 `api-spec.md`。
- 禁止引入外链抓取能力。
- 禁止绕开 `Idempotency-Key` 约束创建任务。

## 4. 任务接入与执行流程（SOP）

### 4.1 标准流程（6步）
1. 读真源：定位需求对应真源章节。
2. 识别影响面：列出接口、页面、数据、测试影响范围。
3. 制定最小改动方案：优先最小改动与兼容性。
4. 实施：按约束执行代码或文档变更。
5. 验证：执行测试/检查并记录证据。
6. 回填：更新进度台账、变更日志、风险与遗留项。

### 4.2 每步输出物（MUST）
- 步骤1：真源引用清单。
- 步骤2：影响面清单（文件/模块/接口/风险）。
- 步骤3：执行清单与回滚点。
- 步骤4：变更结果（提交或文档差异）。
- 步骤5：验证记录（命令、结果、结论）。
- 步骤6：回填记录（状态、阻塞、下一步）。

## 5. 研发流程规范（中约束）

### 5.1 流程强度定义
- MUST：关键链路必须遵守流程门禁（需求、实现、验证、回填四段闭环）。
- SHOULD：非关键文档类改动可简化流程，但必须可追溯。

### 5.2 任务状态流（MUST）
- `Backlog -> Ready -> In Progress -> In Review -> QA -> Done`
- 状态变更必须在仓库台账回填，不允许仅口头同步。

### 5.3 节奏要求（SHOULD）
- 日级更新阻塞项与下一步。
- 周级更新里程碑达成率与风险变化。

## 6. Git 提交与分支规范（MUST）

### 6.1 分支规范
- `feat/<ticket>-<slug>`
- `fix/<ticket>-<slug>`
- `docs/<slug>`
- 分支建议生命周期 < 3 天。

### 6.2 Commit 规范（Conventional Commits）
- 格式：`type(scope): subject`
- type：`feat|fix|docs|refactor|test|chore|perf`

### 6.3 PR 必填项（MUST）
- 目标与背景
- 变更点清单
- 风险与回滚方案
- 测试证据（命令/截图/日志/报告）
- 关联任务号或需求号

### 6.4 合并门禁（MUST）
- 至少 1 名 reviewer 通过。
- CI 通过。
- 冲突已解决并完成复核。
- 影响真源文档时必须同步更新版本记录或变更日志。

### 6.5 例外处理
- 紧急修复可先合并后补审计，但必须在 24 小时内完成补充评审与记录。

## 7. 测试流程规范（MUST + SHOULD）

### 7.1 测试分层
- unit：函数、状态机、边界条件。
- integration：DB/Redis/队列/存储协作。
- contract：接口字段、错误码、状态机契约。
- e2e：核心用户流程。
- smoke：发布前健康检查。

### 7.2 强制要求（MUST）
- 每次变更都需说明测试层级与覆盖范围。
- 关键链路改动必须至少包含契约或集成验证证据。
- 上线门禁：P0/P1 缺陷清零，NFR 不得回退。

### 7.3 建议要求（SHOULD）
- 纯文档改动可采用一致性审计代替自动化测试。
- 复杂改动优先补充回归用例。

## 8. 前后端联调流程规范（MUST）

### 8.1 联调阶段
- `dev -> shared -> staging -> prod`
- 不允许跳过 `shared` 与 `staging` 直接进入发布。

### 8.2 强制校验项（MUST）
- Header：`Authorization`、`Idempotency-Key`、`X-Request-Id`
- 错误码语义一致
- 状态机渲染一致
- 关键链路：上传、任务创建、任务查询、结果下载、订阅与配额

### 8.3 阻塞处理（MUST）
- 联调阻塞需在 24h 内回填 owner、原因、SLA、下一步。

## 9. 代码编写规范（MUST + SHOULD）

### 9.1 强制要求（MUST）
- 不绕开既有契约，不引入与真源冲突字段。
- 关键逻辑具备可观测字段：`traceId/requestId/taskId/eventId`。
- 幂等点与事务边界显式实现。
- 关键业务流程必须可回滚或可重试。

### 9.2 建议要求（SHOULD）
- 优先最小改动。
- 优先复用 Monorepo 共享模块（`packages/contracts/shared` 约定）。
- 注释聚焦复杂逻辑，不写无信息注释。

## 10. 项目进度管理与回填机制（MUST）

### 10.1 回填主位置
- 固定回填到仓库文档台账：
- `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
- `/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`

### 10.2 最小回填字段模板（MUST）
- 任务编号
- 当前状态
- 负责人
- 阻塞项
- 风险等级
- 下一步
- 截止时间
- 改动范围
- 测试证据
- 联调结果
- 遗留问题

## 11. 交付准入与 DoD（Definition of Done）

### 11.1 DoD 条件（MUST）
- 需求映射明确（FR/NFR/MET）。
- 与真源文档不冲突。
- 测试证据与联调证据存在。
- 变更日志可追溯（commit/PR/文档记录）。
- 风险与回滚方案明确。

### 11.2 发布前检查（MUST）
- 关键链路冒烟通过。
- 阻塞项无未处置 P0/P1。
- 回填记录完整。

## 12. 风险升级与阻塞处理机制

### 12.1 升级触发条件
- 契约冲突（字段/错误码/接口语义冲突）。
- 状态机冲突。
- 阻塞超过 SLA。
- 高风险技术或许可项触发。

### 12.2 升级路径
- 任务 owner -> 模块 owner -> 项目 owner。
- 升级后需在回填台账记录触发时间、处置人、处置结果。

## 13. 执行模板（可复制）

### 13.1 任务执行记录模板
```markdown
- 任务编号：
- 需求映射：FR-/NFR-/MET-
- 真源引用：
- 影响面：
- 实施摘要：
- 测试证据：
- 风险与回滚：
- 当前状态：
- 下一步：
```

### 13.2 联调问题单模板
```markdown
- issueId:
- 接口/模块:
- 现象:
- 预期:
- 严重级:
- Owner:
- SLA:
- 处理进展:
```

### 13.3 测试证据模板
```markdown
- 测试层级：unit/integration/contract/e2e/smoke
- 执行命令：
- 执行结果：
- 结论：
- 失败项与处置：
```

### 13.4 发布前检查清单模板
```markdown
- [ ] 真源一致性检查通过
- [ ] 关键链路测试通过
- [ ] P0/P1 清零
- [ ] 联调阻塞项已清零或有审批例外
- [ ] 回填记录完整
- [ ] 回滚方案可执行
```

## 14. 版本记录与维护责任

### 14.1 维护责任
- 默认维护人：项目技术负责人 + 文档 owner。
- 任何结构性变更需同步更新版本记录。

### 14.2 触发更新条件
- `prd.md`、`api-spec.md`、`tad.md`、`project-constraints.md` 发生结构性变化。
- 流程模型、提交流程、测试门禁、联调流程发生变化。

### 14.3 版本记录
| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0 | 2026-02-19 | 首版 AGENTS 执行入口规范，覆盖流程、提交、测试、联调、回填与 DoD |
