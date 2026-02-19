# remove-watermark

去水印项目主仓库（文档 + 工程骨架），面向微信小程序 + Web 首发，后续扩展 App。

## 项目定位

- 产品定位：C 端效率工具（个人创作者/中小团队）
- 商业模式：免费额度 + 订阅制
- 合规边界：仅处理用户自有/有权素材，不支持外链抓取

## 版本范围

- `v1.0`（MVP）：图片去水印、视频去水印、任务中心、结果下载、基础配额与订阅
- `v1.1`：PDF/PPT 图片页链路（渲染 -> 修复 -> 重封装）
- `v1.2`：批量模板与企业能力

## 已锁定技术决策

- 对象存储：MinIO
- 架构：Node 控制面 + Triton 推理面
- 算法：混合方案（规则 + CV + 深度模型）
- 状态机：`UPLOADED -> QUEUED -> PREPROCESSING -> DETECTING -> INPAINTING -> PACKAGING -> SUCCEEDED|FAILED|CANCELED`
- 风险策略：技术/许可风险记录台账，不阻断当前发布

## 文档真源与导航

### 核心真源

- 产品真源：`/Users/codelei/Documents/ai-project/remove-watermark/doc/prd.md`
- 接口真源：`/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`
- 架构真源：`/Users/codelei/Documents/ai-project/remove-watermark/doc/tad.md`

### 规范与设计文档

- 总体路线图：`/Users/codelei/Documents/ai-project/remove-watermark/doc/plan.md`
- IA：`/Users/codelei/Documents/ai-project/remove-watermark/doc/ia.md`
- 用户故事地图：`/Users/codelei/Documents/ai-project/remove-watermark/doc/user-story-map.md`
- 数据库设计（DDL级）：`/Users/codelei/Documents/ai-project/remove-watermark/doc/database-design.md`
- 时序图/流程图：`/Users/codelei/Documents/ai-project/remove-watermark/doc/diagrams.md`
- 事件契约：`/Users/codelei/Documents/ai-project/remove-watermark/doc/event-contracts.md`
- Webhook（出站）：`/Users/codelei/Documents/ai-project/remove-watermark/doc/webhook.md`
- 调研对齐矩阵：`/Users/codelei/Documents/ai-project/remove-watermark/doc/research-alignment.md`
- 统一约束规范：`/Users/codelei/Documents/ai-project/remove-watermark/doc/project-constraints.md`

### 工程执行规范文档

- 工程规范总览：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/README.md`
- 前台页面框架：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/frontend-framework.md`
- 后台页面框架：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/admin-framework.md`
- 后端服务框架：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-service-framework.md`
- 研发进度管理：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/rd-progress-management.md`
- 变更日志规范：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/change-log-standard.md`
- Git 提交规范：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/git-commit-standard.md`
- 测试流程规范：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/testing-workflow.md`
- 前后端联调流程：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/fe-be-integration-workflow.md`
- 后端数据表规范：`/Users/codelei/Documents/ai-project/remove-watermark/doc/engineering/backend-db-standards.md`

## 推荐阅读顺序

1. `doc/project-constraints.md`（先统一边界与术语）
2. `doc/prd.md`（明确范围、需求、指标与验收）
3. `doc/api-spec.md` + `doc/tad.md`（接口与架构实现基线）
4. `doc/database-design.md` + `doc/event-contracts.md` + `doc/webhook.md`（数据与集成契约）
5. `doc/diagrams.md` + `doc/research-alignment.md`（流程复核与调研追踪闭环）

## 研发推进方式

- 先对齐约束，再按 PRD 切片推进
- 先实现图片链路，再实现视频链路
- 通过能力协商接口 `GET /v1/system/capabilities` 做策略降级与路由
- 所有变更遵循：先更新文档真源，再变更代码实现

## 工程骨架（已初始化）

- 工作区：`pnpm workspace`
- 用户前端（多端）：`/Users/codelei/Documents/ai-project/remove-watermark/apps/user-frontend`（Taro + React）
- 管理端：`/Users/codelei/Documents/ai-project/remove-watermark/apps/admin-console`（Next.js + Ant Design）
- 后端服务：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway` + `worker-*` + `billing-service` + `webhook-dispatcher`
- 共享包：`/Users/codelei/Documents/ai-project/remove-watermark/packages/{contracts,shared,observability,eslint-config,tsconfig}`

### 常用命令

- 安装依赖：`pnpm install`
- 全量类型检查：`pnpm -r typecheck`
- 用户前端 H5 开发：`pnpm dev:user:h5`
- 用户前端小程序开发：`pnpm dev:user:weapp`
- 管理端开发：`pnpm dev:admin`
- API 网关开发：`pnpm dev:api`

## 里程碑（12周）

- 第1-2周：需求与指标冻结
- 第3-5周：图片链路灰度
- 第6-8周：视频链路 + 订阅配额上线
- 第9-10周：稳定性与漏斗优化
- 第11-12周：正式发布与 V1.1 冻结

## 版本记录

- `2026-02-19`：完成文档体系重构与规范化，对齐深度调研结论并形成可实施文档闭环。
- `2026-02-19`：新增 `doc/engineering/*` 工程规范文档集（前台/后台/后端框架与研发流程标准）。
