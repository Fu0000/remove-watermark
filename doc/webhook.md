# 去水印项目 Webhook 文档（出站，v1.0）

## 1. 文档信息

| 字段 | 内容 |
|---|---|
| 文档名称 | Webhook Specification |
| 版本 | v1.0 |
| 状态 | Ready for Integration |
| 模式 | 仅出站Webhook |
| 对应API | `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md` |
| 对应事件契约 | `/Users/codelei/Documents/ai-project/remove-watermark/doc/event-contracts.md` |
| 对应DB | `/Users/codelei/Documents/ai-project/remove-watermark/doc/database-design.md` |
| 更新时间 | 2026-02-19 |

## 2. 文档目标、范围、规则、示例、验收

### 2.1 目标
- 定义平台向客户系统回调的统一规范。
- 保证回调可靠性、安全性、可重放和可审计。

### 2.2 范围
- 端点配置、事件列表、HTTP协议、签名算法、重试策略、幂等消费、错误处理。
- 不包含入站Webhook（当前阶段不支持外部系统主动触发任务）。

### 2.3 规则
- 所有 Webhook 请求使用 `POST` + `application/json`。
- 每次投递都必须携带签名头，且签名基于原始请求体。
- 客户端必须按 `eventId` 实现幂等消费。

### 2.4 示例
- 示例事件：`task.succeeded` 回调包含任务ID、结果URL、过期时间。

### 2.5 验收
- 客户可按文档完成签名验签、重试处理、幂等去重。
- 平台可通过日志追溯单次投递全过程。

## 3. Webhook 使用场景

1. 任务完成后通知外部业务系统进行后续处理。
2. 任务失败后触发外部告警或工单系统。
3. 订阅生效/即将到期后同步客户CRM。
4. 账户删除完成后同步下游数据治理系统。

## 4. 事件列表（出站）

| 事件名 | 触发时机 | 关键字段 |
|---|---|---|
| `task.succeeded` | 任务状态变为 `SUCCEEDED` | `taskId,userId,resultUrl,expireAt` |
| `task.failed` | 任务状态变为 `FAILED` | `taskId,userId,errorCode,errorMessage` |
| `subscription.activated` | 订阅支付成功并生效 | `subscriptionId,userId,planId,effectiveAt` |
| `subscription.expiring` | 订阅将到期（如 T-3 天） | `subscriptionId,userId,expireAt` |
| `account.delete.completed` | 账户删除异步任务完成 | `requestId,userId,completedAt` |

## 5. 端点管理 API（平台侧）

| Method | Path | 说明 |
|---|---|---|
| POST | `/v1/webhooks/endpoints` | 创建回调端点 |
| GET | `/v1/webhooks/endpoints` | 查询回调端点列表 |
| PATCH | `/v1/webhooks/endpoints/{endpointId}` | 更新端点配置 |
| DELETE | `/v1/webhooks/endpoints/{endpointId}` | 删除/禁用端点 |
| POST | `/v1/webhooks/endpoints/{endpointId}/test` | 发送测试回调 |
| GET | `/v1/webhooks/deliveries` | 查询投递记录 |
| POST | `/v1/webhooks/deliveries/{deliveryId}/retry` | 手动重试投递 |

## 6. HTTP 协议规范

### 6.1 Request
- Method: `POST`
- URL: 客户配置的 endpoint URL
- Content-Type: `application/json`
- Body: EventEnvelope（见第 9 节）

### 6.2 Response
- 平台认定成功：HTTP `2xx`。
- 平台认定失败：非 `2xx` 或超时。

### 6.3 超时
- 默认超时：`5000ms`。
- 可配置区间：`1000~30000ms`。

## 7. Header 规范

| Header | 必填 | 说明 |
|---|---|---|
| `X-Webhook-Id` | 是 | 本次投递唯一 ID（`delivery_id`） |
| `X-Webhook-Event` | 是 | 事件名，如 `task.succeeded` |
| `X-Webhook-Version` | 是 | 事件版本号 |
| `X-Webhook-Timestamp` | 是 | Unix 秒级时间戳 |
| `X-Webhook-Key-Id` | 是 | 当前签名密钥标识（`kid`，用于轮换） |
| `X-Webhook-Signature` | 是 | HMAC-SHA256 签名值 |
| `X-Webhook-Trace-Id` | 是 | 链路追踪ID |

## 8. 签名算法与防重放

### 8.1 签名算法
- 算法：`HMAC-SHA256`
- 签名串：`timestamp + "." + rawBody`
- 输出格式：`v1=<hex_digest>`
- 验签：必须使用常量时间比较（timing-safe compare）

### 8.2 验签伪代码

```text
payload = x_webhook_timestamp + "." + raw_body
expected = "v1=" + HMAC_SHA256_HEX(secret, payload)
secure_compare(expected, x_webhook_signature)
```

### 8.3 防重放
- 要求 `|now - X-Webhook-Timestamp| <= 300 秒`。
- 若超出窗口，返回 `401`。
- 客户端应缓存最近 `eventId` 或 `deliveryId` 防重复处理（建议去重 TTL >= 24h）。

## 9. Payload 契约

约束：
- 必填：`eventId,eventType,version,occurredAt,traceId,data`
- 可选：`executionProfile,riskFlags`
- `executionProfile` 为实际执行档位（可能与用户请求档位不同）。
- `riskFlags` 用于透传能力协商、模型许可、渲染回退等风险上下文（仅记录，不阻断回调）。

### 9.1 通用结构

```json
{
  "eventId": "evt_01HXX",
  "eventType": "task.succeeded",
  "version": 1,
  "occurredAt": "2026-02-19T10:12:00Z",
  "traceId": "req_abcd",
  "executionProfile": "FAST",
  "riskFlags": [],
  "data": {}
}
```

### 9.2 `task.succeeded` 示例

```json
{
  "eventId": "evt_01HXX_TASK_OK",
  "eventType": "task.succeeded",
  "version": 1,
  "occurredAt": "2026-02-19T10:12:00Z",
  "traceId": "req_abcd",
  "executionProfile": "QUALITY",
  "riskFlags": ["MODEL_LICENSE_REVIEW_PENDING"],
  "data": {
    "taskId": "tsk_3001",
    "userId": "u_1001",
    "status": "SUCCEEDED",
    "resultUrl": "https://minio.../result.mp4?sig=...",
    "expireAt": "2026-03-21T12:00:00Z"
  }
}
```

### 9.3 `task.failed` 示例

```json
{
  "eventId": "evt_01HXX_TASK_FAIL",
  "eventType": "task.failed",
  "version": 1,
  "occurredAt": "2026-02-19T10:12:30Z",
  "traceId": "req_abcd",
  "executionProfile": "FAST",
  "riskFlags": [],
  "data": {
    "taskId": "tsk_3001",
    "userId": "u_1001",
    "status": "FAILED",
    "errorCode": "50001",
    "errorMessage": "model timeout"
  }
}
```

## 10. 重试策略与状态码处理矩阵

### 10.1 重试退避策略
- 最大重试：`6` 次。
- 退避序列：`1m -> 2m -> 5m -> 15m -> 30m -> 60m`。
- 最终状态：超过重试后标记 `DEAD`，触发告警。

### 10.2 状态码处理

| 客户响应 | 平台行为 | 备注 |
|---|---|---|
| 2xx | 标记 `SUCCESS`，停止重试 | 成功投递 |
| 408/429/5xx | 标记 `RETRYING`，按退避重试 | 视为瞬态错误 |
| 400/401/403/404 | 默认 `FAILED` 并重试至上限 | 常见配置或验签错误 |
| 超时/连接失败 | 标记 `RETRYING` | 网络异常 |

## 11. 幂等消费建议（接收方）

1. 使用 `eventId` 作为幂等键存储处理记录。
2. 对同一 `eventId` 重复请求，直接返回 `200`。
3. 业务处理应拆分为：
   - 验签
   - 幂等检查
   - 业务处理
   - 结果记录
4. 处理失败时返回 5xx，触发平台重试。

## 12. 安全建议

1. 回调地址必须是 HTTPS。
2. 建议接入 IP 白名单（平台可配置 `allow_ips`）。
3. 建议按 endpoint 使用独立 secret 并定期轮换。
4. 禁止在日志中记录完整 secret 与敏感个人信息。

## 13. 运营与排障

### 13.1 可观测字段
- `delivery_id`, `event_id`, `endpoint_id`, `attempt`, `response_status`, `duration_ms`, `trace_id`。

### 13.2 排障流程
1. 在投递记录中按 `delivery_id` 检索失败请求。
2. 对照响应状态与响应体定位错误。
3. 修正端点后手动触发重试 API。
4. 观察重试结果并关闭告警。

## 14. SLA

| 指标 | 目标 |
|---|---|
| 首次投递延迟 | P95 < 30 秒（事件产生后） |
| 投递成功率 | >= 99%（剔除客户端持续错误） |
| 回调日志可追溯率 | 100% |

## 15. 验收清单

1. 已覆盖 5 类出站事件。
2. 端点管理 API 可支撑配置、测试、查询、重试。
3. 签名、防重放、幂等消费规则完整明确。
4. 重试退避与状态码处理矩阵可直接实施。
5. 与事件契约和数据库表（webhook_*）一致。

## 16. 版本记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.2 | 2026-02-21 | 增加 `X-Webhook-Key-Id` 头、常量时间比较与 24h 去重建议 |
| v1.1 | 2026-02-19 | 补充 executionProfile/riskFlags 字段语义，明确与能力协商/回退链路的对齐关系 |
| v1.0 | 2026-02-19 | 首版出站Webhook文档，含签名、安全、重试与运维规范 |
