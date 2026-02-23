# 后端链路优化清单（back-opt）

## 1. 扫描范围
- API 网关：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway`
- 编排执行：`/Users/codelei/Documents/ai-project/remove-watermark/apps/worker-orchestrator`
- 推理网关：`/Users/codelei/Documents/ai-project/remove-watermark/apps/inference-gateway`
- Webhook 分发：`/Users/codelei/Documents/ai-project/remove-watermark/apps/webhook-dispatcher`
- 数据模型：`/Users/codelei/Documents/ai-project/remove-watermark/apps/api-gateway/prisma/schema.prisma`

## 2. 当前链路（代码实态）
1. 前端请求 `/v1/assets/upload-policy` 拿到预签名上传策略。
2. 前端上传原始文件到 MinIO（source）。
3. 前端创建任务 `/v1/tasks`，并上报 `/v1/tasks/{taskId}/regions`（或 image 的 `/mask`）。
4. `outbox_events` 产生 `task.created/task.masked/task.retried`，worker 轮询并入队。
5. worker 按状态推进：`QUEUED -> PREPROCESSING -> DETECTING -> INPAINTING -> PACKAGING -> SUCCEEDED/FAILED`。
6. worker 调 inference-gateway 执行 LaMa/ProPainter/文档链路。
7. worker 写回 `tasks.resultUrl/resultJson`，并发出 `task.succeeded/task.failed`。
8. webhook-dispatcher 消费 outbox，向端点投递回调。

## 3. P0（上线阻断级）

### P0-1 结果 URL 已返回，但推理产物未真正上传 MinIO
- 位置：
  - `apps/inference-gateway/app.py:473`
  - `apps/inference-gateway/app.py:628`
  - `apps/inference-gateway/app.py:776`
  - `apps/inference-gateway/app.py:850`
  - `apps/inference-gateway/app.py:952`
- 现状：文件只写入 `INFERENCE_RESULT_DIR` 本地磁盘，同时返回 MinIO 风格 URL。
- 风险：多机/容器重启后 URL 指向对象不存在，无法形成“资产闭环”。
- 建议：
  - 在 inference-gateway 增加统一 `upload_result_to_minio(local_path, object_key)`。
  - IMAGE/VIDEO/PDF/ZIP 全量上传后再返回 URL。
  - worker 对 `outputPath/pdfPath/zipPath` 做兜底上传（双保险）。
- 验收：MinIO 中存在 `result/YYYY/MM/DD/{taskId}.*`，前端结果链接 100% 可下载。

### P0-2 重试耗尽后任务不会自动 FAIL 终态
- 位置：
  - `apps/worker-orchestrator/src/main.ts:801`
  - `apps/worker-orchestrator/src/main.ts:1051`
  - `apps/worker-orchestrator/src/main.ts:454`
- 现状：仅 `UnrecoverableError` 会 `markTaskFailed`；普通错误耗尽后仅入 deadletter，不落库 FAILED。
- 风险：任务卡在 `INPAINTING/PACKAGING`，用户端长期“处理中”。
- 建议：在 `worker.on("failed")` 的 `finalFailure` 分支补 `markTaskFailed(taskId, ...)`。
- 验收：所有最终失败任务都进入 `FAILED` 且带 `errorCode/errorMessage`。

### P0-3 鉴权与用户隔离未落地（硬编码用户）
- 位置：
  - `apps/api-gateway/src/common/auth.ts:3`
  - `apps/api-gateway/src/modules/tasks/tasks.controller.ts:57`
  - `apps/api-gateway/src/modules/tasks/tasks.controller.ts:96`
  - `apps/api-gateway/src/modules/assets/assets.controller.ts:37`
- 现状：只校验 `Bearer ` 前缀；业务侧固定使用 `u_1001`。
- 风险：生产不可用，且存在跨用户数据读写风险。
- 建议：
  - 接入 JWT 校验（签名、过期、issuer、audience）。
  - 从 token 注入 `userId/tenantId`，移除所有硬编码 `u_1001`。
- 验收：多用户压测下任务、资产、回调严格隔离。

### P0-4 创建任务未校验资产存在/归属/媒体匹配
- 位置：`apps/api-gateway/src/modules/tasks/tasks.service.ts:785`
- 现状：`createTaskWithPrisma` 直接写 `assetId/mediaType`，未查 `assets`。
- 风险：可创建“悬空任务”；worker 执行期才报错，造成资源浪费。
- 建议：创建任务事务内先校验：
  - asset 存在、未删除、归属当前用户、mime 与 mediaType 一致。
- 验收：非法 assetId 在 `/v1/tasks` 即返回 4xx（非执行期失败）。

### P0-5 日期路径由“当前时间兜底”，跨天可能漂移
- 位置：
  - `apps/api-gateway/src/modules/tasks/tasks.service.ts:2147`
  - `apps/api-gateway/src/modules/tasks/tasks.service.ts:2152`
  - `apps/inference-gateway/app.py:118`
  - `apps/worker-orchestrator/src/main.ts:183`
- 现状：`taskId` 不含时间戳（UUID），`buildDatePathFromEntityId` 会回落到 `Date.now()`。
- 风险：跨天重试时同一 task 可能计算出不同对象目录。
- 建议：
  - 路径日期统一基于 `tasks.created_at`（强一致）。
  - 或将 taskId 生成规则改为 `tsk_<epoch>_<rand>`。
- 验收：同一 task 任意重试/重放，object key 恒定不变。

### P0-6 worker 调 inference 无超时控制
- 位置：`apps/worker-orchestrator/src/main.ts:398`、`apps/worker-orchestrator/src/main.ts:405`
- 现状：`fetch` 未设置 AbortController 超时。
- 风险：网络抖动时 job 长时间悬挂，占满并发。
- 建议：
  - 新增 `INFERENCE_REQUEST_TIMEOUT_MS`，按媒体类型配置。
  - 超时转标准错误码并进入重试策略。
- 验收：超时任务在阈值内中断并产生可解释失败。

## 4. P1（高价值优化）

### P1-1 任务列表存在 N+1 查询
- 位置：`apps/api-gateway/src/modules/tasks/tasks.controller.ts:96-100`
- 现状：列表逐条调用 `isWaitingForRegions`，每条额外查 task/region/mask。
- 建议：批量查询 `task_regions/task_masks` 后一次性标记 `waitReason`。
- 验收：任务列表 SQL 次数显著下降（大列表场景）。

### P1-2 推理网关缺少 GPU 并发闸门与队列
- 位置：`apps/inference-gateway/app.py`（所有 `/internal/*` 同步执行）
- 现状：请求直入模型执行，未做并发限流。
- 风险：GPU OOM、进程抖动。
- 建议：增加异步队列/信号量（按 IMAGE/VIDEO/DOC 分池），并暴露排队指标。
- 验收：高并发下无 OOM，P95 可控。

### P1-3 文档逐页拉起 LaMa，开销大
- 位置：`apps/inference-gateway/app.py:728-747`
- 现状：每页单独 `run_lama_once`，进程启动成本高。
- 建议：
  - 支持批量页推理（一次模型进程处理多页）。
  - 或常驻推理 worker（避免重复冷启动）。
- 验收：10 页 PDF/PPT 处理时长显著下降。

### P1-4 webhook-dispatcher 无优雅停机
- 位置：`apps/webhook-dispatcher/src/main.ts:92-140`
- 现状：`while(true)` 轮询，无 SIGTERM 处理。
- 风险：容器滚动发布中断批次，可能重复投递或状态不一致。
- 建议：增加 `running` 标志 + `SIGINT/SIGTERM` 处理 + `prisma.$disconnect()`。
- 验收：K8s/compose 停机时可在超时内平滑退出。

### P1-5 webhook 成功事件载荷信息不足
- 位置：`apps/webhook-dispatcher/src/dispatcher.ts:299-324`
- 现状：`task.succeeded` 只带 `resultUrl`，不带 `artifacts/resultJson`。
- 风险：PDF/PPT 多产物场景下下游无法消费 ZIP/PDF 双链接。
- 建议：扩展事件 `data`，包含 `artifacts` 与 `mediaType`。
- 验收：下游仅依赖 webhook 即可完整拿到可用结果清单。

### P1-6 部署启动流程偏重（每次容器内 pnpm install）
- 位置：`docker-compose.local-stack.yml:101-108`
- 现状：服务启动时现场安装依赖、生成 Prisma。
- 风险：启动慢、宿主机/容器二进制不一致（@swc/esbuild）概率高。
- 建议：改为多阶段镜像预构建，启动只运行应用。
- 验收：冷启动时长降低，环境一致性问题明显减少。

## 5. P2（工程化与可维护性）

### P2-1 DTO 校验体系不统一
- 位置：controllers 普遍手写 `if (!body.xxx)`
- 建议：接入 `class-validator` / `zod`，统一参数校验与错误映射。

### P2-2 MIME 白名单重复维护
- 位置：
  - `apps/api-gateway/src/modules/assets/assets.controller.ts`
  - `apps/api-gateway/src/modules/compliance/compliance.service.ts`
- 建议：抽离单一常量源，避免接口层与服务层漂移。

### P2-3 任务服务职责过重
- 位置：`apps/api-gateway/src/modules/tasks/tasks.service.ts`
- 现状：状态机、配额、幂等、持久化、模拟逻辑高度耦合。
- 建议：拆分为 `TaskLifecycleService / QuotaService / IdempotencyService / SimulationAdapter`。

### P2-4 缺少端到端可观测性基线
- 建议：
  - 统一 traceId 透传（API -> worker -> inference -> webhook）。
  - 增加 Prometheus 指标：状态迁移耗时、失败码分布、队列积压。

### P2-5 推理工作目录与中间文件缺少回收策略
- 位置：`apps/inference-gateway/app.py`（`task_work_dir`, `result_dir`）
- 建议：按 TTL 清理 + 每任务大小上限 + 容量水位保护。

## 6. 推荐实施顺序
1. 先做 P0-1/P0-2/P0-4/P0-6（稳定性闭环）。
2. 再做 P0-3/P0-5（安全与一致性）。
3. 最后推进 P1（性能、运维）与 P2（工程治理）。

## 7. 建议新增验收用例
- 任务重试耗尽后状态必须 `FAILED`。
- `task.succeeded` webhook 必须包含 artifacts（PDF+ZIP）。
- 跨日重试同一任务，结果 object key 不变。
- 结果 URL 对应对象在 MinIO 中真实存在（HEAD 200）。
- 多用户并发下资产与任务隔离校验。

## 8. 执行进度（2026-02-23）

### 已完成
- P0-1：推理网关结果产物（IMAGE/VIDEO/PDF/ZIP）上传 MinIO 后返回 URL。
- P0-2：worker 最终失败（重试耗尽/不可恢复）统一落库 `FAILED`。
- P0-3：鉴权返回 `userId/tenantId`，移除业务控制器硬编码 `u_1001`。
- P0-4：创建任务前校验 asset 存在、归属、媒体与 MIME 匹配。
- P0-5：结果路径日期统一基于 `tasks.created_at`（含 `taskCreatedAt` 透传）。
- P0-6：worker 调 inference 增加分媒体超时控制与标准失败码。
- P1-1：任务列表等待补框判断改批量查询，消除 N+1。
- P1-2：inference-gateway 增加 IMAGE/VIDEO/DOC 并发池与排队保护。
- P1-3：文档页 LaMa 改批量推理（失败回退 OpenCV）。
- P1-4：webhook-dispatcher 支持 SIGINT/SIGTERM 优雅停机。
- P1-5：`task.succeeded` webhook 增加 `mediaType/artifacts` 载荷。
- P1-6：compose 改为预构建镜像启动（不再容器启动时 `pnpm install`）。
- P2-2：上传 MIME 白名单抽取为单一常量源（assets/compliance 共用）。
- P2-5：推理工作目录与结果目录增加 TTL 清理策略。

### 仍待完成
- P2-1：DTO 校验体系统一（class-validator / zod 全面接管）。
- P2-3：`tasks.service` 职责拆分（生命周期/配额/幂等/模拟解耦）。
- P2-4：全链路 traceId + Prometheus 指标体系补齐。
