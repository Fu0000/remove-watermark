# Git 提交与 PR 规范（v1.0）

## 1. 目标
- 提高提交历史可读性与自动化能力。
- 降低协作冲突并提升回滚效率。

## 2. 范围
- 适用于所有分支、提交、PR、合并策略。
- 交付模型：`Trunk-Based + Feature Flag`。

## 3. 规则

### 3.1 分支策略
- 主干：`main`。
- 短分支命名：
  - `feat/<ticket>-<slug>`
  - `fix/<ticket>-<slug>`
  - `docs/<slug>`
- 分支生命周期建议 < 3 天。

### 3.2 Commit 规范（Conventional Commits）
- 格式：`type(scope): subject`
- type：`feat|fix|docs|refactor|test|chore|perf`

示例：
- `feat(api): add system capabilities endpoint docs`
- `fix(worker): correct retry status transition`
- `docs(engineering): add fe-be integration workflow`

### 3.3 PR 规范
- PR 描述必须包含：
  - 目标与背景
  - 变更点清单
  - 风险与回滚方案
  - 测试证据（截图/日志/报告）
  - 关联需求/任务 ID

### 3.4 合并规则
- 至少 1 名 reviewer 通过。
- CI 全绿。
- 冲突已解决并重新验证。
- 若影响真源文档，必须同步更新版本记录。

### 3.5 禁止项
- 直接向生产分支推送未评审变更。
- 无需求号的大范围功能改动。
- 修改真源文档但不更新变更日志。

## 4. 模板/示例

### 4.1 PR 模板
```markdown
## 背景
- 对齐 PRD v1.0 的联调规则。

## 变更点
- 新增 doc/engineering/fe-be-integration-workflow.md

## 风险
- 低；仅文档变更。

## 测试
- 文档一致性检查通过。

## 回滚
- 回退本 PR 即可。
```

## 5. 验收
- 抽样 20 条提交，规范符合率 >= 95%。
- 任一发布可由提交历史快速生成变更摘要。

## 6. 版本记录
| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0 | 2026-02-19 | 首版 Git 提交与 PR 规范 |
