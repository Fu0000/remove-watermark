# 变更日志规范（v1.1）

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
## [0.2.0] - 2026-03-01
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
| v1.1 | 2026-02-19 | 新增项目执行变更日志示例（含研发任务清单、联调、测试、KR 回填） |
| v1.0 | 2026-02-19 | 首版变更日志标准（Keep a Changelog + SemVer） |

## 7. 项目执行变更日志（当前）

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
