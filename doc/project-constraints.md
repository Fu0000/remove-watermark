# 项目统一约束规范（v1.0）

## 1. 文档信息

| 字段 | 内容 |
|---|---|
| 文档名称 | Project Constraints |
| 版本 | v1.0 |
| 状态 | Enforced |
| 适用范围 | 全部需求、设计、接口、测试、运维文档 |
| 更新时间 | 2026-02-19 |

## 2. 目标、范围、规则、示例、验收

### 2.1 目标
- 作为全项目“单一约束源”，避免跨文档执行偏差。
- 固化推进不变项，减少重复决策成本。

### 2.2 范围
- 覆盖：MVP 边界、术语、状态机、架构边界、模型分层、渲染链路、风险策略。

### 2.3 规则
- 当文档冲突时，优先级：`project-constraints.md > prd.md > api-spec.md > tad.md > 其他`。
- 未在本规范允许的变更，必须经过评审并更新本文件。

### 2.4 示例
- 示例：若新文档声明“v1.0 支持 PDF”，视为冲突，必须回退到 V1.1。

### 2.5 验收
- 任意文档抽检 10 项关键字段，全部与本规范一致。

## 3. 产品与范围约束

1. `v1.0`：仅图片+视频。
2. `V1.1`：PDF/PPT 图片页链路。
3. `V1.2`：批量模板、团队能力与企业扩展。
4. 首发终端：微信小程序 + Web。
5. App 为后续扩展，不进入 v1.0 阻塞项。

## 4. 技术路线约束

1. 控制面：Node.js 20 + NestJS + Fastify。
2. 推理面：Triton 推理服务（Node 调用）。
3. 数据库：PostgreSQL。
4. 队列：BullMQ + Redis。
5. 对象存储：MinIO（S3 兼容）。
6. 可观测：OpenTelemetry + Prometheus + 结构化日志。

## 5. 模型与策略约束

1. 任务策略枚举：`FAST`、`QUALITY`、`LOW_COST`。
2. 默认策略：
- 图片：`FAST`。
- 视频：`FAST`（可选 `QUALITY`）。
3. 高风险模型允许研发验证，但必须标记 `riskFlags`。
4. 风险策略：记录不阻断，但必须入台账。

## 6. 状态机与错误码约束

### 6.1 任务状态机（唯一）
- `UPLOADED -> QUEUED -> PREPROCESSING -> DETECTING -> INPAINTING -> PACKAGING -> SUCCEEDED|FAILED|CANCELED`

### 6.2 错误码规则
- 错误码一经发布不得改语义。
- 新增错误码必须更新 `api-spec.md` 与 `prd.md`。

## 7. 渲染链路约束（V1.1）

1. PPT/PPTX 统一先转 PDF。
2. 再执行 PDF 页图渲染与图像修复。
3. PDF 页图渲染默认路由：`PDFium -> Poppler -> PyMuPDF`。
4. LibreOffice 仅承担 `PPT/PPTX -> PDF` 转换，不直接承担最终页图渲染。
5. 同一任务内渲染器与版本固定，不允许跨页切换。
6. 渲染失败需返回可执行回退建议（上传 PDF 版本）。
7. 文档输出默认：去水印 PDF + 页图 ZIP。

## 8. 合规与风险约束

1. 仅处理自有/有权素材。
2. 禁止外链抓取能力。
3. 上传前授权勾选为必需流程。
4. 风险台账必须包含：风险级别、触发条件、替代方案、负责人。
5. 风险不阻断发布，但必须在发布说明显式披露。

## 9. 数据与生命周期约束

1. 原始素材默认保留 7 天。
2. 结果素材默认保留 30 天。
3. 审计日志默认保留 180 天。
4. 中间产物（帧、临时 mask）必须具备自动清理策略。
5. 容量估算统一口径：`目标GPU并发 = (GPU秒/任务 * 每分钟任务数) / 60`。
6. 运维阈值：`queue_depth > 1000` 持续 10 分钟触发扩容或降级。
7. 运维阈值：`INPAINTING` 阶段 `P95 > 90s` 触发 FAST 降级提示。

## 10. 接口与事件约束

1. API 版本前缀统一 `/v1`。
2. 创建任务必须带 `Idempotency-Key`。
3. 必须提供系统能力接口：`GET /v1/system/capabilities`。
4. 能力接口必须暴露 `models/renderers/videoPipelines/riskFlags/defaults`，含默认渲染回退顺序。
5. 事件 envelope 必含：`eventId,eventType,version,occurredAt,traceId,producer,idempotencyKey,payload`。
6. 允许可选字段：`riskFlags`（事件）、`executionProfile`（Webhook payload）。

## 11. 变更控制约束

1. 任何范围变更必须先更新 `prd.md` 与本规范。
2. 任何接口变更必须先更新 `api-spec.md`。
3. 任何架构变更必须先更新 `tad.md` + ADR。
4. 任何状态机/事件变更必须同步 `diagrams.md`、`event-contracts.md`、`webhook.md`。

## 12. 验收清单

1. `v1.0` 口径统一为图片+视频。
2. MinIO、状态机、事件名、错误码全仓一致。
3. 能力协商、降级、风险透传全部有文档落点。
4. 文档间交叉引用存在且可定位。

## 13. 版本记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.1 | 2026-02-19 | 补充渲染器默认回退顺序、能力接口必需字段、GPU容量口径与运维阈值 |
| v1.0 | 2026-02-19 | 首版统一约束规范，固化范围、架构、状态机、风险与变更控制 |
