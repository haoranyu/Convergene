# Convergene 第三方依赖选型

> 状态：v0.1，适用于 24 小时黑客松版本  
> 调研日期：2026-08-29  
> 目的：说明依赖为什么存在、何时才应新增依赖，以及明确不采用的方案。精确版本始终以根目录的 `package.json` 和 `pnpm-lock.yaml` 为准。

## 1. 结论摘要

当前脚手架的依赖方向成立，但代码规范不再采用 Airbnb：

- **提交信息**采用 [Conventional Commits](https://www.conventionalcommits.org/)，由 Commitlint 与 Husky 校验；它不属于 Airbnb 规范。
- **代码检查**采用 ESLint 10 flat config，组合 ESLint、TypeScript ESLint、Next.js Core Web Vitals、React Hooks 的官方推荐规则，再由 Prettier 处理格式。
- **产品能力**每类只保留一个主实现：Arco Design、React Flow＋Dagre、Dexie、AI SDK、Zod、react-markdown＋Mermaid。
- **不为未来功能提前装包**。表单、限流、环境变量校验、IndexedDB mock、请求 mock、无障碍审计等依赖，到对应功能或测试真正开始时再加入。
- 状态机、会议成本、图约束、报告事实组装等产品核心规则仍由项目代码实现，不能交给通用依赖或模型决定。

## 2. 为什么取消 Airbnb

这里有两个不同概念：

1. `eslint-config-airbnb` 是 JavaScript/React 的 ESLint 共享配置；
2. Conventional Commits 是提交信息格式，例如 `feat(meeting): add grill progress`。

项目早期把“Airbnb”与提交信息规范连在一起并不准确。与此同时，[`eslint-config-airbnb` 当前 npm 包](https://www.npmjs.com/package/eslint-config-airbnb)仍围绕旧式 ESLint 配置与 ESLint 7/8 peer dependency，而 ESLint 9 起 flat config 已成为默认配置格式，[ESLint 10 文档](https://eslint.org/docs/latest/use/configure/configuration-files)也以 `eslint.config.*` 为标准入口。Next.js 16 已移除 `next lint`，要求直接使用 ESLint CLI；其[官方 ESLint 指南](https://nextjs.org/docs/app/api-reference/config/eslint)提供 flat config 与 Core Web Vitals 规则。

因此决定如下：

| 关注点              | 当前选择                                                | 不再使用                               |
| ------------------- | ------------------------------------------------------- | -------------------------------------- |
| JavaScript 基础规则 | `@eslint/js` recommended                                | Airbnb base preset                     |
| TypeScript          | `typescript-eslint` recommended＋TypeScript strict      | Airbnb 的 JavaScript 假设              |
| Next.js             | `@next/eslint-plugin-next` recommended＋Core Web Vitals | `next lint`、旧式 `.eslintrc`          |
| React Hooks         | `eslint-plugin-react-hooks` flat recommended            | 额外的 React 风格 preset               |
| 格式化              | Prettier＋`eslint-config-prettier`                      | ESLint 内的格式争论与重复规则          |
| 提交信息            | `@commitlint/config-conventional`                       | “Airbnb commit convention”这一错误称呼 |

这不是降低质量门槛，而是把规则归还给各自的官方事实源，减少 preset 兼容层。只有当真实缺陷、可访问性或安全问题证明有必要时，才新增项目规则；不为了追求规则数量复制大型风格指南。

## 3. 基础运行时

| 层级       | 选择                  | 原因与边界                                                                |
| ---------- | --------------------- | ------------------------------------------------------------------------- |
| Runtime    | Node.js 24 LTS        | Node 20 已结束生命周期；Vercel 支持 Node 24。开发、构建和部署统一主版本。 |
| 包管理     | pnpm 10               | 安装快、锁文件确定；不同时维护 npm/yarn 锁文件。                          |
| Web 框架   | Next.js 16 App Router | 页面、Route Handler 与 Vercel 部署使用同一工程；不另建独立后端。          |
| UI Runtime | React 19              | 与当前 Next.js 版本一致。                                                 |
| 语言       | TypeScript strict     | 用编译器承担静态约束；运行时边界仍必须使用 Zod。                          |

参考：[Node.js release schedule](https://nodejs.org/en/about/previous-releases)、[Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)。

## 4. P0 已选依赖

下表描述职责，不重复锁定版本号。

| 职责          | 依赖                              | 为什么选                                                                 | 使用边界                                                                |
| ------------- | --------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| UI 组件       | `@arco-design/web-react`          | 现成的表单、反馈、导航与三语 locale，适合快速形成完整产品                | 业务布局、会议节点和品牌视觉使用 CSS Modules；不要复制 Arco 基础组件    |
| 国际化        | `next-intl`                       | 支持 App Router、服务端/客户端消息和 locale 路由                         | 产品文案只来自 `messages/*`；AI 输出语言由任务契约单独控制              |
| 会议画布      | `@xyflow/react`                   | 提供节点、边、视口、选择、拖动与自定义节点                               | 它只负责交互与渲染，不作为持久化事实源                                  |
| 树布局        | `@dagrejs/dagre`                  | React Flow 官方将 Dagre 定位为适合简单树布局的轻量方案                   | P0 只做左到右单向树；不提前引入 ELK 的复杂配置                          |
| 本地数据      | `dexie`、`dexie-react-hooks`      | IndexedDB schema、事务、迁移与响应式查询                                 | 所有会议内容留在浏览器；领域操作通过事务保持不变量                      |
| 模型调用      | `ai`、`@ai-sdk/openai-compatible` | StepFun 与硅基流动都提供 OpenAI 兼容接口，可复用流式调用和结构化输出接口 | Provider 差异收口在 adapter；不能把 SDK 对象泄漏到领域层                |
| 运行时校验    | `zod`                             | 校验 API、模型输出、导入 JSON 和环境边界                                 | Zod 通过后还要检查图约束、ID 引用与业务不变量                           |
| Provider 配置 | `@upstash/redis`                  | HTTP 接口适合 Vercel Functions，免费层足够黑客松演示                     | 只保存匿名设备的加密 Provider 配置，不保存会议内容                      |
| 服务端边界    | `server-only`                     | 让 Next 构建在服务端模块误入客户端依赖图时立即失败                       | 只作为 Redis、加密、环境变量和 Provider 模块的标记，不承载业务状态      |
| 报告 Markdown | `react-markdown`、`remark-gfm`    | 安全渲染 Markdown 与表格/任务列表等 GFM 内容                             | 不启用原始 HTML；事实报告先由程序组装再交给渲染器                       |
| 报告图        | `mermaid`                         | 让结构化会议结果形成丰富但可复制的图                                     | 只渲染程序生成的模板，使用 `securityLevel: 'strict'`，失败回退表格/源码 |

布局参考：[React Flow layouting guide](https://reactflow.dev/learn/layouting/layouting)；本地数据参考：[Dexie React tutorial](https://dexie.org/docs/Tutorial/React)；模型层参考：[AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers)；Markdown 安全边界参考：[react-markdown](https://github.com/remarkjs/react-markdown)与 [Mermaid securityLevel](https://mermaid.js.org/config/schema-docs/config-properties-securitylevel.html)。

## 5. 工程质量依赖

| 职责          | 依赖                                                                                                 | 约定                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Lint          | `eslint`、`@eslint/js`、`typescript-eslint`、`@next/eslint-plugin-next`、`eslint-plugin-react-hooks` | 单一 `eslint.config.mjs`；`pnpm lint` 不允许 warning          |
| 格式化        | `prettier`、`eslint-config-prettier`                                                                 | Prettier 管格式，ESLint 管缺陷与代码约束                      |
| 单元/组件测试 | Vitest、jsdom、Testing Library                                                                       | 领域规则优先单测；交互按用户行为测试，不测试组件内部实现      |
| 端到端测试    | Playwright                                                                                           | 只覆盖关键闭环和高风险浏览器行为                              |
| Git 门禁      | Husky、lint-staged、Commitlint                                                                       | pre-commit 跑 staged lint/format、typecheck 和 unit test；commit-msg 校验 Conventional Commits |

提交标题统一使用：

```text
<type>(<optional-scope>): <description>
```

常用 `type` 为 `feat`、`fix`、`docs`、`refactor`、`test`、`build`、`ci`、`chore`、`perf`、`style`、`revert`。标题上限以 `commitlint.config.mjs` 为准。提交钩子不运行 build 与 Playwright，交付前仍需显式运行完整检查。

当前私有仓库不启用 GitHub Actions，以免为单人黑客松消耗 Actions 配额。若未来增加协作者或公开发布，再把本地同名脚本原样接入 CI，不创建另一套质量规则。

## 6. 到功能边界再添加

以下是候选项，不应一次性全部安装：

| 触发条件                                                    | 候选依赖                                 | 带来的价值                                  | 暂缓原因                                   |
| ----------------------------------------------------------- | ---------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| Provider 设置或创建会议表单出现跨步骤校验、脏状态和大量联动 | `react-hook-form`、`@hookform/resolvers` | 减少表单状态样板代码，直接复用 Zod schema   | 简单表单先用 Arco Form；避免两个表单状态源 |
| AI Route Handler 对公网开放                                 | `@upstash/ratelimit`                     | 基于现有 Redis 做匿名设备/IP 的基础限流     | API 未形成前没有实际收益                   |
| 服务端环境变量增多                                          | `@t3-oss/env-nextjs`                     | 集中做构建期环境变量校验                    | 只有少量变量时可先用小型校验函数           |
| Dexie repository 开始集成测试                               | `fake-indexeddb`                         | 在 Vitest 中稳定模拟 IndexedDB              | 纯领域测试不需要它                         |
| AI route/adapter 开始集成测试                               | `msw`                                    | 在网络边界模拟两个 Provider、超时与畸形响应 | 不用于模拟纯函数                           |
| Playwright 基础流程稳定                                     | `@axe-core/playwright`                   | 自动检查一部分 WCAG 问题                    | 不能取代键盘、焦点与读屏人工检查           |
| 单测已有稳定基线                                            | `@vitest/coverage-v8`                    | 发现未覆盖的高风险领域分支                  | 不用覆盖率百分比代替验收测试               |
| P0 功能完成、准备收尾                                       | `knip`                                   | 找出未使用的导出、文件和依赖                | 开发早期大量入口尚未接线，噪声过高         |

## 7. 明确不选

| 类别            | 暂不采用                                               | 原因                                                                   |
| --------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| 全局状态        | Zustand、Redux Toolkit                                 | Dexie 是持久化事实源，React Flow 管画布临时状态；再加 store 会形成双写 |
| 远端查询缓存    | TanStack Query、SWR                                    | P0 没有会议云数据，Provider API 调用是短任务而非可缓存资源             |
| 状态机框架      | XState                                                 | 会议状态少且转移规则已在领域模型中确定，纯 reducer/领域函数更直接      |
| 复杂图布局      | ELK.js                                                 | P0 是受控两层单向树，Dagre 足够；ELK 体积和参数面不划算                |
| AI 编排框架     | LangChain、LlamaIndex                                  | AI 任务固定且已有严格 schema；额外抽象会模糊 prompt、重试和成本边界    |
| 实时协作        | Yjs、Liveblocks                                        | 产品是个人工具，P0 明确不做多人共同编辑                                |
| HTTP 封装       | Axios                                                  | 浏览器和 Node 的 `fetch` 已满足当前请求需求                            |
| 通用工具集      | Lodash                                                 | 当前用原生数组、对象和 `structuredClone` 即可，按真实缺口再评估        |
| ID/日期工具     | uuid、nanoid、date-fns、dayjs                          | P0 可用 `crypto.randomUUID()` 与 `Intl`；不要为少量调用增加包          |
| 富文本编辑器    | Tiptap、Lexical                                        | 报告目标是 Markdown，节点和随手记是结构化短文本                        |
| 组件工作台      | Storybook                                              | 24 小时版本先由真实页面与测试承载组件状态，P1 再评估                   |
| 代码规范 preset | `eslint-config-airbnb`、社区 Airbnb flat-config 适配包 | 与当前官方 flat config 组合职责重叠，并增加 ESLint 版本兼容风险        |

“暂不采用”不是永久禁止。新增前需要能指出已经出现的具体复杂度，而不是以未来可能需要为理由。

## 8. 客户端、服务端与性能边界

- React Flow、Mermaid 等浏览器重依赖只在需要它们的客户端页面动态加载；不要进入首页导览之外的公共首屏 bundle。
- Provider SDK、Redis、加密和环境变量模块必须保持 server-only；客户端只接收脱敏后的 Provider 摘要。
- 高级 Provider 配置不能把任意内网 URL 当作服务端请求目标；默认 Provider 使用固定 base URL，未来开放自定义地址时必须单独做 URL 与网络边界校验。
- AI 结构化输出必须经过 Zod，再经过领域校验；Provider 声称“OpenAI compatible”不等于每个模型都稳定支持相同 schema。
- Markdown 不启用 raw HTML；Mermaid 输入不是模型自由文本，用户文字必须转义并保留文本降级。
- 会议时间、人时、产出形成成本、节点父子关系和状态迁移全部使用确定性代码，不引入模型或依赖的隐式计算。

## 9. 依赖引入与升级规则

新增生产依赖时，PR 或提交说明至少回答：

1. 它只负责哪一个角色？
2. 为什么平台原生能力或现有依赖不足？
3. 它运行在客户端还是服务端，对 bundle、安全和隐私有什么影响？
4. 它的失败降级与测试方式是什么？
5. 是否引入第二个事实源或与现有依赖职责重叠？

升级时遵守：

- `package.json` 与 `pnpm-lock.yaml` 是精确版本事实源，本文只记录选择理由。
- 黑客松期间不做与交付无关的全量 major upgrade；一次只升级一个相关依赖族。
- 升级后至少运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；影响关键流程时再运行 `pnpm test:e2e`。
- 安全修复优先，但先判断漏洞是否进入本项目的运行路径，不盲目使用破坏性自动修复。
- 不同时保留两个包去解决同一个问题；替换必须连同旧依赖、适配层和文档一起移除。

## 10. 开发前高风险 Spike

这些问题需要用最小可运行代码验证，而不是继续做纸面选型：

1. Arco 在 React 19 下的 Modal、Form、DatePicker 与 `zh-CN`、`zh-TW`、`en-US` locale。
2. React Flow 12＋Dagre 对 12 个节点、两层、英文长文本的尺寸测量与 LR 重排，以及聚焦子树 `fitView`。
3. StepFun、硅基流动各一个目标模型的流式响应、JSON schema 遵循、超时和错误格式；验证后才开启对应能力标记。
4. Dexie transaction、多标签页刷新和完整 JSON 导入导出。
5. Mermaid flowchart、timeline、pie 在 strict 模式下的渲染与表格降级。

Spike 失败时优先降级为已有依赖能稳定完成的方案，不马上引入第二套大型框架。

2026-08-29 验证结论及后续产品采样见 [高风险集成验证记录](./integration-validation.md)：现有依赖已通过 AES-256-GCM、真实 Upstash 加密 set/get/续期/delete、12 节点 Dagre LR、真实 Chromium 长英文 DOM 尺寸/换行测量、React Flow subtree bounds/viewport 纯计算和 instance 显式 `fitView`，以及 Mermaid strict flowchart/timeline/pie，不需要替换依赖。Mermaid timeline 的 period 不接受 `10:00` 这类时钟冒号，使用受控 `Minute 15` label 或降级为 flowchart/table。历史 StepFun `step-3.7-flash` 最小 probe 与硅基流动 `deepseek-ai/DeepSeek-V4-Flash` 均通过真实 streaming、JSON Schema、bounded timeout 和 invalid-model 脱敏错误测试；后续产品门禁证明模型映射和部署路径而非 SDK 本身仍需校准。SiliconFlow `Qwen/Qwen3.5-4B` 已在 `hkg1` 通过双语产品门禁；StepFun `step-3.5-flash-2603 + low` 的香港区产品门禁仍失败，当前 fast 改测官方 live Step Plan 文档新明确支持的 `step-3.7-flash + low`。两条 fast 路径都使用 streaming；StepFun fast 使用 JSON Mode、完整 system schema 与本地 Zod，SiliconFlow 使用严格 schema、关闭 thinking 与本地 Zod；复杂 role 继续使用流式严格 schema。StepFun fast 保留 512-token 的已验证安全下限。

## 11. 给 Coding Agent 的决策检查

实现任务前按顺序判断：

1. `package.json` 是否已经有能完成此事的依赖？
2. Web Platform、React、Next.js 或 TypeScript 是否已有足够的原生能力？
3. 这是通用机制，还是应该保留在领域层的产品规则？
4. 候选包是否会制造新的状态源、渲染器、网络层或 schema 层？
5. 若确实要引入，是否已经满足第 9 节并同步更新本文？

不要根据这份文档自动安装“候选依赖”；只有触发条件已经发生，才修改 `package.json`。
