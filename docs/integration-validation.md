# 高风险集成验证记录

> Issue：[GitHub #3](https://github.com/haoranyu/Convergene/issues/3)
>
> 验证日期：2026-08-29
>
> 运行时：Node.js 24.20.0、pnpm 10.10.0，依赖版本以 `pnpm-lock.yaml` 为准

本文只记录风险 Spike 的可重复证据。`passed` 表示本仓库测试真实执行成功；
`blocked` 不得解释为通过，也不能据此启用 Provider preset。

#39 的生产凭据按安全边界只存在于加密存储，不能为了预合并测试读取或复制到本地。现有 fast
preset 已有明确失败证据时，候选可按 [AI 任务契约](./ai-contracts.md) 的有界 production canary
例外部署：Issue 保持开放、先过完整本地门禁并确认账号模型目录可见、部署后立即执行真实 Route
与浏览器采样；模型不可用时立即回滚，门禁未过时继续修正，不能将 canary 标为 `passed`。

## 1. 结果摘要

| 验证项 | 状态 | 可重复证据 | 结论 |
|---|---|---|---|
| AES-256-GCM | passed | `aes-gcm.test.ts` | 32-byte base64 secret、每次新 96-bit IV、round-trip、错误密钥、被修改 ciphertext/auth tag 均已覆盖 |
| Redis 编排 | live passed | `redis-lifecycle*.test.ts` | 免费 Upstash 实例上的加密 set/get/decrypt/expire/renew/delete 全生命周期通过，测试后目标 key 已删除 |
| StepFun structured output | production canary pending | `provider-structured-output*.test.ts` | `step-3.7-flash` 已通过生产 JSON Mode 分类验证；fast 恢复流式 `json_object`、完整 system schema 与本地 Zod，且不发送官方只对 3.5-2603 声明支持的 `reasoning_effort`；复杂 role 保留严格 schema，必须重跑 live suite |
| StepFun preparation contracts | credential-gated after preset correction | `provider-preparation-contracts.integration.test.ts` | 使用当前 preset 直接运行正式 Grill 与 initial-map Prompt、复杂 Provider schema 及领域 parse；无凭据时明确 skipped，不能以最小 schema 代替 |
| SiliconFlow structured output | production canary pending | `provider-structured-output*.test.ts` | `Qwen/Qwen3.5-4B` 是唯一已有产品展开 3/3 证据的候选；fast 恢复流式严格 schema 并关闭 thinking，仍须在 `hkg1` 部署后复核延迟 |
| Fast-role 产品 Route | production canary pending | `expand-node-route.integration.test.ts` | 每家 Provider 直接运行正式 fast role：英文/简中分类 Route，以及每种 locale 三个节点展开 Route；每种 locale 的展开都要求 3/3 成功且 median ≤3,000ms，缺少对应 Key/model 时明确 skipped |
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

共享能力 probe 与产品调用都使用仓库已经选择的 `@ai-sdk/openai-compatible`、AI SDK
`streamText + Output.object` 和 Zod；产品 fast path 不消费 partial output，只在完整对象校验通过后
返回。`createOpenAICompatible` 必须显式设置
`supportsStructuredOutputs: true`；否则当前 adapter 会把 schema 请求降为
`response_format: {type: 'json_object'}`，不会把 JSON schema 发给 Provider。

probe 默认在 15 秒取消，调用方即使传入更长值也封顶 30 秒，并关闭 AI SDK 自动重试以避免
Spike 延迟失真。成功结果只返回 Provider、model id、first-chunk/total latency、text delta 数和
`outputValidated: true`，表示返回对象通过本地 schema，不把 JSON Mode 冒充为 Provider 接受了
严格 schema；结果不返回 API Key 或 response。超时与其他 non-2xx/stream/schema 错误分别
收口为 `TIMEOUT` 和 `PROVIDER_ERROR`，同时只保留安全 elapsed time；二者都使用稳定
`PROVIDER_PROBE_FAILED`，不透传 Provider response、请求头、错误 body 或凭据。probe 显式
覆盖 AI SDK 默认 `onError`，避免它把完整 `APICallError` 写入 stderr；fixture test 监听
`console.error` 和 `process.stderr.write`，确认 non-2xx 路径没有输出原始 detail 或 Key。

### 当前 preset 映射与历史证据

| Provider | 固定 Base URL | fast | grill | report | 状态 |
|---|---|---|---|---|---|
| StepFun | `https://api.stepfun.com/step_plan/v1` | `step-3.7-flash` | `step-3.5-flash-2603` | `step-3.5-flash-2603` | fast 已通过该 Step Plan 账号的生产调用；使用流式 `json_object` 且不发送 `reasoning_effort`，复杂 role 使用严格 schema 与已公布的 `low`，live gate 待重跑 |
| SiliconFlow | `https://api.siliconflow.cn/v1` | `Qwen/Qwen3.5-4B` | `deepseek-ai/DeepSeek-V4-Flash` | `deepseek-ai/DeepSeek-V4-Flash` | 已有 3/3 产品成功证据；fast 使用流式严格 schema 与 `enable_thinking: false`，并随 Route 部署到 `hkg1` 后重跑延迟门禁 |

P0 配置仍是固定白名单，但 `fast` 与复杂 `grill/report` 允许使用不同的受控模型，避免把报告质量
和实时交互延迟绑在同一个模型上；ST-01 才允许用户在白名单内覆盖。历史 `step-3.7-flash` 最小
probe 的三个成功样本 first chunk 平均 1,390ms、total 平均 1,478ms，只证明当时简单 schema 的
实际响应，不能作为当前产品 expansion 的通过证据。历史 SiliconFlow V4 Flash 三个样本中有一个
total latency 为 21,702ms；实时 fast role 因而换成小模型候选，并把产品超时收紧到 5 秒，超时后
保持重试/显式切换 Provider 路径。report route 的平台 duration 仍需随 P0-26 部署验证。
StepFun 历史样本在 128/256 token 时可能在 JSON 发出前耗尽，probe 使用 512 token 后稳定通过；
fast 即使不发送推理档位也保留这个已验证的安全下限。后续产品任务应按各任务 schema 另行设置
足够但有界的预算。

上表的延迟样本不能冒充当前组合的性能结果。自 #37 起，
产品共享 adapter 与独立 structured-output probe 都通过各自配置的 provider name 发送供应商专属
参数：SiliconFlow 所有 role 使用 `enable_thinking: false`；StepFun fast 不发送
`reasoning_effort`，只有使用 `step-3.5-flash-2603` 的复杂 role 发送 `low`。StepFun fast 使用
官方 `json_object` 并附完整 system schema，SiliconFlow fast 与两家的复杂 role 保留
`json_schema`。fixture test 直接检查最终 HTTP JSON body，并确认两家字段互不泄漏。后续具备
临时凭据时应重跑 credential-gated suite 并另记延迟样本。

官方资料（2026-08-30 复核）：

- [Step Plan 快速开始](https://platform.stepfun.com/docs/zh/step-plan/quick-start)：OpenAI-compatible Base URL；其当前示例模型是 3.5，不作为 3.7 能力依据。
- [StepFun Chat Completions API](https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create)：当前通用 `json_object`、3.5 系列严格 schema 与请求字段约束。
- [Step Plan 推理模型接入](https://platform.stepfun.com/docs/zh/step-plan/integrations/reasoning-api)：`/step_plan/v1` 当前明确支持的模型清单；不能把标准 API 模型能力外推到 sponsor plan。
- [Step 3.7 Flash](https://platform.stepfun.com/docs/zh/guides/models/step-3.7-flash)：低延迟、高吞吐与实时/高频定位。
- [Step 3.7 Flash 快速上手](https://platform.stepfun.com/docs/zh/guides/models/step-3.7-flash-quickstart)：模型专页的基础调用示例；请求字段仍以 Chat Completions API 的模型约束为准。
- [StepFun JSON Mode](https://platform.stepfun.com/docs/zh/guides/developer/json-mode)：Prompt 明确 JSON 结构、`response_format=json_object` 与应用端再次校验的官方流程。
- [SiliconFlow Chat Completions API](https://api-docs.siliconflow.cn/docs/api/chat-completions-post)：固定 chat endpoint、`response_format=json_schema` 与 `enable_thinking`。
- [SiliconFlow 模型广场](https://www.siliconflow.cn/models)：当前 fast 候选的官方模型信息；内容会随 Provider 更新。
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

同一 API Key 配合独立的 preparation model 变量，还可直接验证准备阶段实际使用的两个复杂契约；该测试不返回或记录生成正文：

```bash
STEPFUN_API_KEY=... \
STEPFUN_PREPARATION_VALIDATION_MODEL=step-3.5-flash-2603 \
pnpm exec vitest run src/modules/integration-validation/provider-preparation-contracts.integration.test.ts
```

SiliconFlow 使用 `SILICONFLOW_API_KEY` 和 `SILICONFLOW_VALIDATION_MODEL`。测试不会把这些值
写入文件或输出；测试结果可记录 schema、stream delta 数、first-chunk/total latency 或安全的
failure kind/elapsed time，不记录 response body。

fast role 需要单独运行产品级 route probe；它不使用最小替代 schema，而是直接调用英文/简中
`POST /api/ai/classify-meeting`，以及 `POST /api/ai/expand-node` 的正式 Route Handler、Prompt、
共享 adapter、locale 校验和窄 Provider schema。展开返回恰好 2 个候选，再由领域
`ExpandNodeOutput` schema 验证；领域边界仍接受 2–4 个候选。测试只用虚构会议数据，展开断言
安全的 `Server-Timing` 存在，既不输出返回正文，也不写 Redis 或 IndexedDB。Provider 的 Key 与
model 变量命名沿用上面的 credential-gated suite：

```bash
STEPFUN_API_KEY=... \
STEPFUN_VALIDATION_MODEL=step-3.7-flash \
pnpm exec vitest run src/modules/integration-validation/expand-node-route.integration.test.ts
```

SiliconFlow 对应使用 `SILICONFLOW_API_KEY` 与
`SILICONFLOW_VALIDATION_MODEL=Qwen/Qwen3.5-4B`。没有临时凭据时，两家 Provider 各自的
fast-role gate 必须显示为 skipped；浏览器拦截测试只能证明客户端生命周期，不能替代真实调用。
同一 case 会先对英文、简中分类各运行一次，再为每个凭据齐全的 Provider 按 locale 顺序收齐
英文 3 个、简中 3 个展开 request id；失败样本只保留 locale/sample、status、稳定 code、allowlist
output failure 与安全 `Server-Timing`，不输出模型正文。分类必须 2/2 通过 schema 与 locale；每种
locale 的展开都必须 3/3 成功且中位数不超过 3,000ms，不能在第一个失败后停止或只计算成功样本。

2026-08-30 的 PR #41 生产门禁确认浏览器、Route、Provider、IndexedDB 与重载链路可以完成，
同时捕获到原 2–4 候选 / 1,024-token 契约仍不满足 P0：SiliconFlow 两次成功分别为 6,101ms
和 4,211ms，第三次在 15 秒边界失败；StepFun 一次在 13,357ms 返回无效结构。所有失败均为
0 写入并保留重试。后续窄契约不能沿用这些结果宣称通过，必须部署后重新完成三次真实采样。

PR #42 把交互 schema 收窄为固定两个 `{kind,title}` 并将 StepFun 暂改为
`step-3.5-flash-2603` 后，第二轮生产门禁仍未通过：SiliconFlow 三次为 5,289ms / 成功、
16,157ms / 失败、4,396ms / 成功（2/3，中位成功耗时 5,289ms）；StepFun 三次分别在
12,894ms、13,332ms、11,521ms 失败（0/3）。全部失败仍为原子 0 写入，测试后恢复原
SiliconFlow 激活状态。由于当时所有格式失败都被压成 `OUTPUT_INVALID`，当前 adapter 新增固定
`outputFailure` allowlist，并在不读取原始输出的前提下区分上游拒绝、截断、内容过滤、JSON
解析和 schema 不匹配；画布只把主码与 allowlist 枚举放入 data attribute，用户文案不显示内部
细节。新 fast preset 和 5 秒边界仍须部署后完成同等生产采样，本文不能预先记为通过。

PR #43 把 StepFun fast 切回 `step-3.7-flash + low`，并以 `Qwen/Qwen3.5-4B` 作为 SiliconFlow
fast 候选。生产结果仍未通过：SiliconFlow 三次均成功并各写入两个节点，但浏览器耗时为
4,676ms / 4,604ms / 3,656ms，中位数 4,604ms；StepFun 三次分别为 6,077ms / 6,147ms /
6,310ms，全部在 5 秒 Provider 边界失败且 0 写入。StepFun 英文分类也返回安全
`OUTPUT_INVALID`，SiliconFlow 英文/简中分类通过。测试结束后恢复 SiliconFlow 激活状态，#39
继续开放。当前 follow-up 改用 StepFun 官方 JSON Mode 和 SiliconFlow `Ling-mini-2.0`，并把
`Server-Timing` 拆为固定的 `rate/config/provider/expand` 阶段；在新生产采样完成前仍不得标为通过。

PR #44 修复了 StepFun fast 的 JSON Mode 协议：英文/简中分类都通过，展开两次成功并各写入
两个节点，浏览器耗时 4,516ms / 5,355ms；第三次在 6,092ms 返回安全
`PROVIDER_UNAVAILABLE`，因此为 2/3，仍未达到门禁。SiliconFlow `Ling-mini-2.0` 分类通过，但
三次展开均在 5 秒 Provider 边界失败，浏览器耗时 7,045ms / 6,080ms / 6,181ms，且全部 0 写入。
失败样本减去 Provider 硬超时后仍有约 1.1 秒固定开销；代码审计定位到 Provider 调用前的
`EXISTS`、限流 Lua、配置 `GET`、配置 touch Lua 四次串行 Upstash 往返。

PR #45 当时的 correction 保留已通过产品调用的 `step-3.7-flash`，把 SiliconFlow fast 改为
`Pro/Qwen/Qwen2.5-7B-Instruct`；两家 fast 都使用非流式 JSON Mode，产品展开声明 384-token
预算（StepFun 因 reasoning 安全下限提升至 512），并把重复的 Prompt 结构描述交给完整 system
schema。Redis 正常路径同时合并“限流 + 配置预读”，目标是把 Provider 前四次串行往返降为
两次；生产门禁完成前，这些修正仍不能标为 `passed`。

PR #45 合并并部署后证明该非流式候选不可用：SiliconFlow 简中分类连续 2 次返回安全
`OUTPUT_INVALID`，节点展开 0/3，追加诊断样本也 0/3 且均为 `PROVIDER_UNAVAILABLE`；StepFun
分类英文/简中通过，但节点展开只有 1/3 成功，唯一成功为 4,800ms。Redis 原子预读保留；Provider
执行策略回退到最后一组已有可靠证据的组合：SiliconFlow `Qwen/Qwen3.5-4B + streaming + strict
json_schema + enable_thinking:false`，StepFun `step-3.7-flash + streaming + json_object`；后者移除
官方仅对 `step-3.5-flash-2603` 声明支持的 `reasoning_effort`。
Vercel Node Functions 同时从默认 `iad1` 改到 `hkg1`，以缩短用户、Route 与中国 Provider 之间的
跨洲路径；部署产物必须显示香港 region，且真实 canary 仍是唯一性能通过证据。

2026-08-29 的历史 credential-gated suite 为每个 Provider 各运行三个 case，Vitest timeout 都是
35 秒，大于 probe 的 30 秒硬上限：当时的候选模型成功 streaming/schema、同一模型 1ms 强制
取消，以及明确不存在的 model id 返回脱敏 `PROVIDER_ERROR`。历史六个 live case 均已通过：
StepFun `step-3.7-flash` 的一次最终回归约为 2,008ms / 4ms / 50ms，SiliconFlow 的一次回归约为
2,605ms / 2ms / 39ms；这里记录的是 Vitest case elapsed，三样本 first-chunk/total 平均值以
历史映射记录为准。这些结果不代表当前 StepFun preset、准备阶段复杂契约或窄 expansion Route
门禁已经通过。

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

- 2026-08-29 的基础外部集成 Spike 已证明两个 Provider endpoint 与真实 Redis 可用；但当前
  `step-3.7-flash` 与 `Qwen/Qwen3.5-4B` 的 fast minimal / classification / 中英文 expansion、StepFun
  `step-3.5-flash-2603` 的 preparation 复测仍未运行，继续作为 #39 关闭 blocker；只允许按本文
  记录的 production canary 例外部署，不能沿用历史结果或单元 fixture 宣称通过。
- Vercel 当前只有 scaffold 且没有报告 route；最慢报告请求的 Hobby Function duration 必须随
  P0-26 的真实 route 和部署环境验证，不能由本 Spike 伪造。
- P0-07/P0-08 已实现匿名会话、配置 API、同源检查、原子限流和共享 Provider adapter，并通过
  上述真实 Route 生命周期；部署环境已注入，预览验证与 UI 主入口验收在对应 PR 合并前完成。
  本 Spike 的临时凭据只用于验证依赖能力，不是公共 Key。
