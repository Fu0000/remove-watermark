# 前台页面框架规范（Taro + React，v1.0）

## 1. 目标
- 为微信小程序 + Web 首发提供统一前台工程框架。
- 保证页面语义、状态语义、错误处理与接口契约一致。

## 2. 范围
- 用户端核心域：首页、上传/编辑、任务中心、结果、订阅、账户。
- 对齐 `FR-001 ~ FR-010` 和 `MET-001 ~ MET-005`。

## 3. 规则

### 3.1 目录规范
- 目录固定：`apps/user-frontend/src/{pages,components,modules,stores,services,utils}`
- 分层规则：`page -> module -> component -> primitive`

### 3.2 页面域映射（对齐 IA）
| 页面域 | 路由示例 | 关键 FR |
|---|---|---|
| 首页 | `/pages/home/index` | FR-001, FR-008 |
| 上传/编辑 | `/pages/editor/index` | FR-002, FR-003, FR-004 |
| 任务中心 | `/pages/tasks/index` | FR-005, FR-006 |
| 结果详情 | `/pages/result/index` | FR-007 |
| 订阅中心 | `/pages/subscription/index` | FR-008 |
| 账户设置 | `/pages/account/index` | FR-009, FR-010 |

### 3.3 状态管理
- 页面状态：`zustand`。
- 服务端状态：`react-query`。
- 禁止把任务列表、配额、订阅状态写入临时组件状态。

### 3.4 API 约束
- 必须复用 `/Users/codelei/Documents/ai-project/remove-watermark/doc/api-spec.md`。
- 统一响应类型：
```ts
export interface ApiResponse<T> {
  code: number;
  message: string;
  requestId: string;
  data: T;
}
```
- 创建任务必须透传 `Idempotency-Key`。
- 错误码展示必须与 `api-spec.md` 一致，不自定义业务语义。

### 3.5 跨端与交互
- 使用 Taro 条件编译处理平台差异，禁止业务逻辑分叉。
- 小程序与 Web 保持一致信息结构，仅做交互细节适配。
- 状态机展示字面量必须与后端一致。

### 3.6 性能基线
- 首屏可交互（TTI）目标：P75 < 2.5s（Wi-Fi），P75 < 4.0s（4G）。
- 任务轮询间隔：默认 3s，失败退避上限 15s。
- 上传失败重试：最多 2 次，失败后给出明确错误码与引导。

### 3.7 安全规则
- 仅使用签名 URL 上传/下载，不存储永久直链。
- Token 不允许明文持久化（Web 推荐 HttpOnly Cookie；小程序使用安全存储并设置过期）。
- 上传前授权勾选必须前置，不可跳过。

## 4. 模板/示例

### 4.1 页面模块模板
```text
apps/user-frontend/src/pages/editor/
  index.tsx
  index.config.ts
  hooks/useTaskCreate.ts
  modules/mask-toolbar/
  modules/preview-panel/
```

### 4.2 错误码映射模板
| errorCode | 用户提示 | 用户动作 |
|---|---|---|
| 40002 | 文件格式不支持 | 重新选择文件 |
| 40302 | 配额不足 | 前往订阅中心 |
| 42201 | 当前状态不可操作 | 刷新任务状态 |
| 50001 | 处理超时 | 进入任务中心重试 |

## 5. 验收
- 关键页面路由与 IA 文档完全对齐。
- 状态机与错误码展示与 `api-spec.md` 完全一致。
- 上传、任务创建、结果下载链路可在小程序与 Web 双端通过。

## 6. 版本记录
| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0 | 2026-02-19 | 首版前台框架规范（Taro + React） |
