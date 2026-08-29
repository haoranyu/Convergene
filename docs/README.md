# Convergene 文档入口

> 状态：P0 主路径已集成，进入发布收口与部署验证
> 目标交付：2026-08-29 Vibe Hacks #05 的 24 小时可演示版本  
> 产品定位：帮助会议新手的个人会议作弊器，而不是企业会议管理系统

## Coding agent 从这里开始

开始实现前，按以下顺序阅读：

1. [产品规格](./product-spec.md)：要解决的问题、P0/P1 边界、完整用户流程和成功标准。
2. [领域模型](./domain-model.md)：术语、状态机、数据不变量和成本算法。
3. [技术设计](./technical-design.md)：工程架构、存储边界、安全、API 与目录结构。
4. [第三方依赖选型](./dependency-selection.md)：依赖职责、Airbnb 取舍、新增门槛与升级规则。
5. [AI 任务契约](./ai-contracts.md)：每个模型任务的输入、输出、约束、重试和模式差异。
6. [UI 设计](./ui-design.md)：页面结构、画布交互、状态与响应式边界。
7. [国际化规范](./i18n.md)：三种 locale、词典、格式化和 AI 输出语言。
8. [验收测试](./acceptance-tests.md)：功能完成的可执行判断。
9. [需求追踪矩阵](./traceability.md)：把 P0 需求映射到实施任务和验收证据。
10. [24 小时实施计划](./implementation-plan.md)：依赖顺序、时间切片、降级线和 Definition of Done。
11. [设计系统](./design-system/MASTER.md)：视觉 token、组件约束和交付检查表。
12. [ADR](./adr/)：已经决定且不应在实现时被随意推翻的架构选择。

补充资料：[品牌资产使用指南](./brand-usage.md) 记录获批标志、应用图标和静态锁定组合的使用边界；[P0 发布检查记录](./release-readiness.md) 记录部署证据、冒烟矩阵和已知限制。

## 文档事实源

| 问题                                 | 事实源                    |
| ------------------------------------ | ------------------------- |
| 产品为什么做、用户能做什么、P0 边界  | `product-spec.md`         |
| 状态、字段语义、成本、允许的状态转移 | `domain-model.md`         |
| 框架、模块、API、存储、安全和部署    | `technical-design.md`     |
| 依赖为什么引入、何时引入或不引入     | `dependency-selection.md` |
| Prompt、schema、上下文与模型失败行为 | `ai-contracts.md`         |
| 页面布局、交互细节、文案与响应式     | `ui-design.md`            |
| locale、翻译与格式化                 | `i18n.md`                 |
| 是否完成                             | `acceptance-tests.md`     |
| 需求、任务和测试如何互相追踪         | `traceability.md`         |
| 实现先后和可后移项                   | `implementation-plan.md`  |

如果文档冲突：先遵守已接受的 ADR 和领域不变量，再遵守产品行为；技术与 UI 文档必须被修改到与其一致。不要在代码里默默创造新的产品规则。

## 当前仓库基线

P0 真实会议闭环已经落地：

- Node.js 24.x、pnpm 10、Next.js 16 App Router、React 19 与 TypeScript strict；
- Arco Design 应用外壳和 `zh-CN`、`zh-TW`、`en-US` locale 路由；
- Dashboard、无 Key 导览、BYOK、创建、Grill、Brief、受控初始图和 LR Canvas；
- 节点出招、主持人小抄、随手记、唯一 LIVE、产出、散会检查和 Markdown/Mermaid 报告；
- 会议内容只进 IndexedDB，模型凭证只以匿名会话关联的加密记录进入 Upstash；
- Vitest、React Testing Library 与 Playwright 测试入口；
- ESLint 10 flat config、Prettier、EditorConfig、Husky、lint-staged 与 Commitlint；
- 根目录 `AGENTS.md`／`CLAUDE.md` 作为 coding agent 的特殊入口，产品文档仍统一保存在 `docs/`；
- 当前不配置 GitHub Actions，交付检查全部在本地执行。

开始开发：

```bash
nvm use
pnpm install
pnpm dev
```

提交前或交付前使用：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

其中 `pre-commit` 自动执行 lint-staged、类型检查和单测，`commit-msg` 强制 Conventional Commits。Playwright 固定使用 `127.0.0.1:3100`，避免与常用的 3000 端口冲突。

## 当前已经确认的产品骨架

1. 支持决策对齐、脑暴共创、复盘改进三种主会议剧本，并以低调的通用讨论模式兜底。
2. AI 根据老板原话推荐剧本，用户确认后进入模式化 Grill；Grill 开始后锁定模式。
3. Grill 默认 5 轮，允许一次模型发起的“临门一问”；用户可主动续问，总上限 10 轮。
4. 准备度使用分段进度与“信息不足／勉强能开／可以开了”，不展示虚假精确分数。
5. Brief 点击确认即锁定，再生成受控脑图；初始最多 12 个节点、两层。
6. 画布使用从左到右的单向树；切换议题时显式聚焦并居中相应分支。
7. 会中 AI 操作随剧本变化，并以轻度卡牌形态显示在选中节点旁；没有牌组、能量或胜负系统。
8. 支持主持人小抄和基础随手记；AI 异步归类建议与确认移动属于 Stretch。
9. “会议产出”包含决策、候选创意、洞察和行动项；行动项可选负责人和截止时间。
10. 同一浏览器可保存多个会议，但同时只允许一场 `LIVE`。
11. 结束前有可绕过的散会检查；报告按会议剧本生成 Markdown 和确定性 Mermaid。
12. 会议数据只存 IndexedDB；服务端只保存匿名设备对应的加密模型配置。
13. 每位用户自行配置 StepFun 或硅基流动 Key；不提供系统统一 Key。
14. 完整支持 `zh-CN`、`zh-TW`、`en-US`。
15. Vercel Hobby＋Upstash Redis 免费层作为黑客松部署目标。
16. 首页提供无需 Key、不会写入真实数据的导览沙盒。
17. 明显展示“本机保存”，P0 提供完整 JSON 导出；注册登录和云同步进入 P1。

## P0 与 stretch 的解释

文档中的 P0 是产品完整闭环。若 24 小时不足，以下能力按顺序后移，但仍应尽量完成：

1. 高级模型 ID 覆盖；
2. 手机端树状会议操作；
3. 随手记 AI 归类建议；
4. 会后补记与时间修正界面；
5. 忘记结束会议的恢复向导。

任何新增范围都必须同时指出替代掉的工作，或明确延长时间；不能默认为新的 P0。

## 仍需工程验证、无需产品再决策

- StepFun 与硅基流动的供应商延迟和账户额度仍是运行时外部变量；失败会保留本机状态并提供重试或更换配置入口；
- Vercel/Upstash 的免费层配额与区域延迟需要在每次正式演示前确认；
- Mermaid 渲染器升级后仍需保留 Markdown 源码与表格降级，不能把图表作为唯一事实载体。

验证结果若改变用户行为或 P0 范围，必须回到文档更新；若只是替换等价实现，可在技术文档记录后继续。

## ADR 索引

- [ADR 0001：底层保存图，P0 呈现树](./adr/0001-store-a-graph-present-a-tree.md)
- [ADR 0002：会议数据本地优先，模型凭证服务端加密保存](./adr/0002-local-data-and-server-credentials.md)
- [ADR 0003：会议剧本与通用会议产出](./adr/0003-meeting-scripts-and-outcomes.md)
