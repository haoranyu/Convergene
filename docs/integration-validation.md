# 高风险集成验证记录

> Issue：[GitHub #3](https://github.com/haoranyu/Convergene/issues/3)
>
> 验证日期：2026-08-29
>
> 运行时：Node.js 24.20.0、pnpm 10.10.0，依赖版本以 `pnpm-lock.yaml` 为准

本文只记录风险 Spike 的可重复证据。`passed` 表示本仓库测试真实执行成功；
`blocked` 不得解释为通过，也不能据此启用 Provider preset。

## 1. 结果摘要

| 验证项 | 状态 | 可重复证据 | 结论 |
|---|---|---|---|
| AES-256-GCM | passed | `aes-gcm.test.ts` | 32-byte base64 secret、每次新 96-bit IV、round-trip、错误密钥、被修改 ciphertext/auth tag 均已覆盖 |
| Redis 编排 | live passed | `redis-lifecycle*.test.ts` | 免费 Upstash 实例上的加密 set/get/decrypt/expire/renew/delete 全生命周期通过，测试后目标 key 已删除 |
| StepFun structured output | live passed | `provider-structured-output*.test.ts` | `step-3.7-flash` 真实 streaming、JSON Schema、1ms 取消和 invalid-model 脱敏错误均通过 |
| SiliconFlow structured output | live passed | `provider-structured-output*.test.ts` | `deepseek-ai/DeepSeek-V4-Flash` 真实 streaming、JSON Schema、1ms 取消和 invalid-model 脱敏错误均通过 |
| Dagre LR | passed | `dagre-layout.test.ts` | 12 个长英文节点无重叠、边不变、所有边从左向右、一级议题顺序和重复布局稳定 |
| Active Topic subtree focus | passed | `subtree-focus.test.ts`、`canvas-browser-probe.test.ts` | Vite test-only page 在真实 Chromium 渲染/测量 12 节点，并通过 React Flow instance 对目标三节点子树显式调用 `fitView` |
| Mermaid flowchart | passed | `mermaid-renderer.test.ts` | `securityLevel: 'strict'` 下生成 SVG |
| Mermaid timeline | conditional pass | `mermaid-renderer.test.ts` | `Minute 0` 形式可渲染；`10:00` 形式在 Mermaid 11.17.2 解析失败并进入表格/源码 fallback |
| Mermaid pie | passed | `mermaid-renderer.test.ts` | `securityLevel: 'strict'` 下生成 SVG |

验证代码位于：

- `src/modules/integration-validation/`
- `src/fixtures/integration-validation/`

运行：

```bash
nvm use
pnpm exec vitest run src/modules/integration-validation
```

无外部凭证时，live test 会明确显示为 skipped，不会伪装成 passed。

## 2. 加密与 Redis

`encryptCredential` / `decryptCredential` 使用 Node `crypto` 的 AES-256-GCM，拒绝非
canonical base64 或解码后不是 32 bytes 的 `APP_ENCRYPTION_SECRET`。返回 envelope 只含
`version`、`ciphertext`、`iv` 和 `authTag`；测试和结果对象都不返回凭证明文。

`validateEncryptedRedisLifecycle` 使用调用方指定的单一 key，顺序验证：

1. 带 TTL 写入加密 envelope；
2. 读取并在内存解密比对；
3. 读取初始 TTL；
4. 续期并验证 TTL 增长；
5. 删除并验证读取为 `null`；
6. `finally` 再次幂等删除同一 key。

真实测试只创建 `convergene:integration-validation:<random UUID>`，不扫描或修改其他 key。
Upstash client 的共享 AbortSignal 在 30 秒取消整个 lifecycle，Vitest timeout 为 35 秒，确保
网络 harness 先于 test runner 结束。
通过已登录控制台创建免费 Upstash Redis 后，把 REST URL、REST token 和新生成的 canonical
32-byte base64 `APP_ENCRYPTION_SECRET` 仅注入测试子进程。最终真实 lifecycle 在约 4.2 秒内通过；
测试使用随机隔离 key，并在正常路径和 `finally` 中各执行一次幂等删除。凭据和 secret 均未写入
仓库、环境文件、测试输出或文档，Redis 中也没有会议数据。Vercel Hobby 项目
`haoran-95db/convergene` 已 Ready，production 为 `https://convergene.vercel.app`。P0-07/P0-08
真实配置 route 通过本地 production build 后，`APP_ENCRYPTION_SECRET` 与两个 Upstash REST
变量已作为不可回显 Secret 注入 Vercel 的 Production 和 Preview；新部署才会读取这些变量。

P0-07/P0-08 产品实现完成后，另以 production build 的本地 server 对真实 Route Handler 做了
私密全生命周期验证：StepFun 与 SiliconFlow 的 `POST /test` 均成功；StepFun 的 `PUT` 创建了
带完整安全属性的匿名 Cookie 和不含 Key 明文的 Redis record；随后 `GET /status` 同时把 Redis
与 Cookie TTL 续至 30 天并只返回恒定掩码；两次 `DELETE` 均成功且 record 最终不存在。探针只
输出状态码和布尔断言，测试 record 已删除，凭据仍只存在于注入它的子进程环境。

审查加固后又对真实 Provider 做了无效模型校准：StepFun 返回 HTTP 404；SiliconFlow 返回
HTTP 400 且安全业务码为 `20012`。产品 adapter 因此只把 StepFun 固定 endpoint 的 404 和
SiliconFlow 的 400/`20012` 归一化为 `PROVIDER_MODEL_NOT_FOUND`；其他 400 保留为结构化输出
无效，避免把任意客户端错误误报成模型不存在。adapter 只解析有界错误体中的安全业务码，不
返回或记录原始 body。

最终安全回归还验证了：production CSP 不允许浏览器直连两个 Provider；无后端 record 的伪造
Cookie 在保存时会被服务端随机 session 替换；真实 Redis Lua touch 对乱序时间戳保持
`lastUsedAt` 单调且仍续期 TTL；两个 Provider 的连接测试继续成功；最终两次删除幂等，真实 record
与伪造 session key 均不存在。production client 静态包不包含两个 Provider base URL。另用本地
production server 的受控 500 探针验证 Next 全局错误响应：响应保留严格 CSP，7 个 framework
script（含 2 个 inline script）全部带有并匹配本次请求 nonce；动态全局 404 和含点未知路径也由
浏览器回归覆盖，不存在因 `agenda.v2` 一类路径跳过 CSP 的分支。

提供三个变量后可运行同一测试；代码不会输出它们：

```bash
pnpm exec vitest run src/modules/integration-validation/redis-lifecycle.integration.test.ts
```

## 3. Provider 合约与候选映射

共享 probe 使用仓库已经选择的 `@ai-sdk/openai-compatible`、AI SDK
`streamText + Output.object` 和 Zod。`createOpenAICompatible` 必须显式设置
`supportsStructuredOutputs: true`；否则当前 adapter 会把 schema 请求降为
`response_format: {type: 'json_object'}`，不会把 JSON schema 发给 Provider。

probe 默认在 15 秒取消，调用方即使传入更长值也封顶 30 秒，并关闭 AI SDK 自动重试以避免
Spike 延迟失真。成功结果只返回 Provider、model id、first-chunk/total latency、text delta 数和
`schemaAccepted: true`，不返回 API Key 或 response。超时与其他 non-2xx/stream/schema 错误分别
收口为 `TIMEOUT` 和 `PROVIDER_ERROR`，同时只保留安全 elapsed time；二者都使用稳定
`PROVIDER_PROBE_FAILED`，不透传 Provider response、请求头、错误 body 或凭据。probe 显式
覆盖 AI SDK 默认 `onError`，避免它把完整 `APICallError` 写入 stderr；fixture test 监听
`console.error` 和 `process.stderr.write`，确认 non-2xx 路径没有输出原始 detail 或 Key。

### 已验证 preset 映射

| Provider | 固定 Base URL | fast | grill | report | 状态 |
|---|---|---|---|---|---|
| StepFun | `https://api.stepfun.com/step_plan/v1` | `step-3.7-flash` | `step-3.7-flash` | `step-3.7-flash` | 3 次成功样本 first chunk 平均 1,390ms、total 平均 1,478ms；schema/stream/timeout/error 通过 |
| SiliconFlow | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V4-Flash` | `deepseek-ai/DeepSeek-V4-Flash` | `deepseek-ai/DeepSeek-V4-Flash` | 3 次成功样本 first chunk 平均 8,886ms、total 平均 9,031ms；schema/stream/timeout/error 通过 |

三个 role 在 P0 先共享每个 Provider 已验证的单一模型，减少配置矩阵和供应商差异；ST-01 才允许
白名单内覆盖。SiliconFlow 三个样本中有一个 total latency 为 21,702ms，因此交互态必须保留
15 秒产品超时与重试/切换 Provider 路径，report route 的平台 duration 仍需随 P0-26 部署验证。
StepFun 会把 reasoning token 计入输出上限；128/256 token 在实测中可能在 JSON 发出前耗尽，
probe 使用 512 token 后稳定通过。后续产品任务应按各任务 schema 另行设置足够但有界的预算。

上表的 SiliconFlow 延迟样本采集于显式 Non-Think 策略落地之前，不把它们冒充优化后的性能结果。
自 #37 起，产品共享 adapter 与独立 structured-output probe 都通过各自配置的 provider name 发送
`enable_thinking: false`；fixture test 直接检查最终 HTTP JSON body，并同时确认 StepFun 请求没有该
字段。后续具备临时凭据时应重跑 credential-gated suite 并另记 Non-Think 延迟样本。

官方资料（访问于 2026-08-29）：

- [Step Plan 快速开始](https://platform.stepfun.com/docs/zh/step-plan/quick-start)：OpenAI-compatible Base URL 和推荐验证模型 `step-3.7-flash`。
- [StepFun Chat Completions API](https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create)：Step Plan endpoint、`response_format` 和当前模型示例。
- [SiliconFlow Chat Completions API](https://docs.siliconflow.cn/docs/api/chat-completions-post)：固定 chat endpoint、`response_format=json_schema` Structured Outputs 说明和 `deepseek-ai/DeepSeek-V4-Flash` 示例。
- [SiliconFlow 模型广场](https://cloud.siliconflow.cn/me/models?types=chat)：当前账号可见的 chat model catalog；内容会随 Provider 更新。

通过两个 Provider 已登录控制台的既有项目 Key 复制/显隐控件把凭据仅注入测试子进程；明文没有
进入终端输出、截图、文件或 Git 历史。SiliconFlow 文本 playground 不暴露 `response_format`，
因此没有用普通聊天输出冒充 schema 验证，而是调用真实 OpenAI-compatible endpoint。

真实 probe 需要调用者在私有 shell 中临时提供对应 Key 与候选 model id：

```bash
STEPFUN_API_KEY=... \
STEPFUN_VALIDATION_MODEL=step-3.7-flash \
pnpm exec vitest run src/modules/integration-validation/provider-structured-output.integration.test.ts
```

SiliconFlow 使用 `SILICONFLOW_API_KEY` 和 `SILICONFLOW_VALIDATION_MODEL`。测试不会把这些值
写入文件或输出；测试结果可记录 schema、stream delta 数、first-chunk/total latency 或安全的
failure kind/elapsed time，不记录 response body。

每个 Provider 的 credential-gated suite 有三个独立 case，Vitest timeout 都是 35 秒，大于
probe 的 30 秒硬上限：真实候选模型成功 streaming/schema、同一模型 1ms 强制取消，以及明确
不存在的 model id 返回脱敏 `PROVIDER_ERROR`。六个 live case 均已通过：StepFun 的一次最终
回归约为 2,008ms / 4ms / 50ms，SiliconFlow 的一次回归约为 2,605ms / 2ms / 39ms；这里记录的是
Vitest case elapsed，三样本 first-chunk/total 平均值以映射表为准。

## 4. Dagre 与 subtree focus

fixture 固定 12 个节点、11 条 `CONTAINS` 等价边、一个根、四个一级议题和两层深度。
节点宽 288px、高 80px，标题覆盖接近 48-grapheme 领域上限的英文长文本。Dagre 使用这些
尺寸完成几何布局；Vite test-only page 再用真实 Chromium 渲染 React Flow custom node，验证
全部 12 个节点的 DOM 宽度为 288px、高度至少 80px、至少一个英文标题换行且无 overflow。
验证参数为：

- `rankdir: LR`
- `ranksep: 96`
- `nodesep: 56`
- `marginx/marginy: 24`

Dagre 对同 rank sibling 使用反向插入堆叠；实现按 domain `MindMapEdge.order` 降序插入
edge，使最终画面从上到下仍为 order 升序。布局结果不修改输入 edge。

subtree focus 不调用全图 `fitView`：先沿有向边收集显式目标议题的后代，再把这组 node 交给
React Flow helpers 计算 bounds 和 viewport。browser probe 等待 React Flow viewport 和所有
DOM node 初始化后，用同一子树的三个真实 instance node 调用
`fitView({nodes, minZoom: 0.5, maxZoom: 1.5, padding: 0.12})`，断言返回成功且 viewport 发生
改变。此 Vite page 只由 Vitest 创建的临时 server 提供，不是 Next production route。未来 UI
仍应只在用户切换议题或点击“重新聚焦”时调用；AI 返回时不得调用。

## 5. Mermaid 与 fallback 决策

flowchart、timeline 和 pie 均使用程序生成 fixture，在 `securityLevel: 'strict'` 下真实调用
Mermaid renderer。测试环境仅补齐 jsdom 缺少、但现代浏览器提供的 SVG 测量 API。

决策：

1. flowchart 可作为所有模式的稳定首选；
2. pie 可用于人时分配；
3. timeline 只使用不含 `:` 的受控 period label（例如 `Minute 15`）；
4. 若需要展示本地化时钟文本，优先改为 flowchart；
5. 任意 parse/render 失败都返回稳定 `MERMAID_RENDER_FAILED`、原始 Mermaid source 和同数据
   Markdown table，不阻塞正文、复制或下载。

## 6. 后续验证边界

- 外部集成 Spike 没有遗留 blocker：两个 Provider 与真实 Redis 的本 Issue 完成标准均已满足。
- Vercel 当前只有 scaffold 且没有报告 route；最慢报告请求的 Hobby Function duration 必须随
  P0-26 的真实 route 和部署环境验证，不能由本 Spike 伪造。
- P0-07/P0-08 已实现匿名会话、配置 API、同源检查、原子限流和共享 Provider adapter，并通过
  上述真实 Route 生命周期；部署环境已注入，预览验证与 UI 主入口验收在对应 PR 合并前完成。
  本 Spike 的临时凭据只用于验证依赖能力，不是公共 Key。
