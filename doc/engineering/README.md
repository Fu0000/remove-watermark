# 工程规范文档集（v1.1）

## 1. 目标
- 建立可直接执行的工程规范，降低跨团队协作歧义。
- 将产品真源、接口真源、架构真源映射为研发执行标准。

## 2. 范围
- 前台页面框架、后台页面框架、后端服务框架。
- 研发进度、变更日志、Git 提交标准、测试流程、前后端联调流程、数据库表规范。

## 3. 规则
- 强制对齐：
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/prd.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`
  - `/Users/codelei/Documents/ai-project/remove-watermark/doc/project-constraints.md`
- 固定边界：`v1.0=图片+视频`、存储 `MinIO`、架构 `Node 控制面 + Triton 推理面`。
- 固定状态机：`UPLOADED -> QUEUED -> PREPROCESSING -> DETECTING -> INPAINTING -> PACKAGING -> SUCCEEDED|FAILED|CANCELED`。

## 4. 模板/示例

### 4.1 文档目录
- `frontend-framework.md`：前台（Taro + React）
- `admin-framework.md`：后台（Next.js + Ant Design Pro）
- `backend-service-framework.md`：后端（Node Monorepo）
- `rd-progress-management.md`：研发进度管理
- `change-log-standard.md`：变更日志规范
- `mvp-optimization-backlog.md`：MVP 后优化台账
- `git-commit-standard.md`：提交与 PR 规范
- `testing-workflow.md`：测试流程与门禁
- `fe-be-integration-workflow.md`：前后端联调流程
- `backend-db-standards.md`：数据库设计与迁移规范

### 4.2 阅读顺序
1. `backend-service-framework.md`
2. `frontend-framework.md`
3. `admin-framework.md`
4. `fe-be-integration-workflow.md`
5. `testing-workflow.md`
6. `backend-db-standards.md`
7. `git-commit-standard.md`
8. `rd-progress-management.md`
9. `change-log-standard.md`

### 4.3 环境注入（admin 密钥）
- 推荐使用仓库脚本一键生成本地 `.env`：
  - `scripts/setup-admin-env.sh --dry-run`
  - `scripts/setup-admin-env.sh`
- 生成文件（默认本地地址）：
  - `apps/api-gateway/.env.shared|.env.staging|.env.prod`
  - `apps/admin-console/.env.shared|.env.staging|.env.prod`
- `.env*` 默认被 `.gitignore` 忽略，避免密钥误提交。

## 5. 验收
- 文档集可直接用于迭代计划拆分与代码评审。
- 各文档术语、接口路径、状态机字面量完全一致。

## 6. 版本记录
| 版本 | 日期 | 说明 |
|---|---|---|
| v1.1 | 2026-02-21 | 新增 `mvp-optimization-backlog.md`，用于沉淀 MVP 后优化项 |
| v1.0 | 2026-02-19 | 首版工程规范文档集目录与总则 |
