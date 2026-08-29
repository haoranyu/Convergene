# Convergene P0 需求追踪矩阵（v0.1）

> 用途：让 coding agent 能从用户价值追到实现任务和验收证据。代码实现后，应在“实现位置”列补充实际模块或测试文件；如果需求变化，必须同时更新规格、任务和验收用例。

## 1. 追踪规则

- `R-P0-*` 是稳定需求 ID，代码注释不必重复它，但 PR/提交说明可引用。
- “实施任务”引用 [24 小时实施计划](./implementation-plan.md)；“验收”引用 [验收测试](./acceptance-tests.md)。
- 一项需求只有在对应验收通过后才算完成；只有组件截图不算验收证据。
- Stretch 不得被标成 P0 已完成，除非相应验收和文档也已提升为 P0。

## 2. P0 矩阵

| ID | 可验证需求 | 主要规格 | 实施任务 | 验收 | 实现位置 |
|---|---|---|---|---|---|
| R-P0-01 | 无 Key 可完成三种主剧本的内存导览，只有显式复制才写本地 | 产品 7.1；UI 5 | P0-10 | AT-001～003 | `src/features/guide/`<br>`src/app/[locale]/guide/`<br>`src/features/meeting-creation/local-meeting.ts`<br>自动化证据：`e2e/dashboard-guide-creation.spec.ts`（导览期间零 `/api/ai/*`、零 IndexedDB，确认复制后才创建独立本机 Meeting） |
| R-P0-02 | 用户以匿名设备会话保存自己的 StepFun/硅基流动配置，Key 不回显 | 产品 7.2；ADR 0002 | P0-07、P0-08 | AT-010～015 | `src/modules/provider-config/`<br>`src/modules/api-security/provider-config-http.ts`<br>`src/modules/meeting-ai/provider-adapter.ts`<br>`src/app/api/provider-config/`<br>`src/features/provider-config/`<br>`src/app/[locale]/settings/model/`<br>`src/features/meeting-creation/meeting-creation.tsx`<br>自动化证据：`service.test.ts`、`provider-config-http.test.ts`、`provider-adapter.test.ts`、`e2e/provider-config.spec.ts`、`e2e/dashboard-guide-creation.spec.ts`；首次真实分类返回未配置时打开复用配置 gate；清会议与清模型配置双向隔离 |
| R-P0-03 | AI 推荐三主一辅剧本，用户确认；Grill 后不能静默改模式 | 产品 5、7.3；ADR 0003 | P0-11 | AT-020～023 | `src/modules/meeting-ai/classify-meeting.ts`<br>`src/modules/meeting-ai/classify-prompt.ts`<br>`src/app/api/ai/classify-meeting/route.ts`<br>`src/features/meeting-creation/`<br>`src/modules/meeting-db/repository.ts`<br>自动化证据：`classify-meeting.test.ts`、`classify-client.test.ts`、`repository.test.ts`、`e2e/dashboard-guide-creation.spec.ts` |
| R-P0-04 | Grill 单问题进行，默认 5 轮，可有一次临门一问，用户续问总上限 10 | 产品 7.4；AI 5 | P0-12、P0-13 | AT-030～035 | `src/modules/meeting-domain/grill.ts`<br>`src/features/preparation/ai-contract.ts`<br>`src/features/preparation/orchestrator.ts`<br>`src/features/preparation/preparation-workspace.tsx`<br>自动化证据：`grill.test.ts`、`ai-contract.test.ts`、`preparation-workspace.test.tsx` |
| R-P0-05 | 准备度按维度和三级文案表达，用户可指定下一轮优先维度 | 产品 7.4；UI 8 | P0-12、P0-13 | AT-030、AT-034～035 | `src/modules/meeting-domain/grill.ts`<br>`src/features/preparation/preparation-workspace.tsx`<br>`messages/*.json`<br>自动化证据：`grill.test.ts`、`ai-contract.test.ts`、`preparation-workspace.test.tsx` |
| R-P0-06 | Brief 点击确认即锁定；失败以同一快照重试；继续补问与重新准备按不同规则回退，LIVE 后均不可用 | 产品 7.5；领域 3 | P0-14、P0-15 | AT-023、AT-036～038 | `src/modules/meeting-domain/preparation.ts`<br>`src/modules/meeting-db/repository.ts`<br>`src/features/preparation/orchestrator.ts`<br>`src/features/preparation/preparation-workspace.tsx`<br>自动化证据：`preparation.test.ts`、`repository.test.ts`、`preparation-workspace.test.tsx` |
| R-P0-07 | 初始图为一个根、3–5 个一级议题、最多 12 节点和两层，失败不写半成品 | 产品 7.5；ADR 0001 | P0-15 | AT-040～043 | `src/modules/mind-map-domain/graph.ts`<br>`src/modules/meeting-db/repository.ts`<br>`src/features/preparation/initial-map.ts`<br>`src/fixtures/preparation.ts`<br>自动化证据：`graph.test.ts`、`repository.test.ts`、`initial-map.test.ts` |
| R-P0-08 | 工作台呈现 LR 单向树，当前议题与选中节点分离，只在显式操作时聚焦 | 产品 7.7；UI 10；ADR 0001 | P0-16、P0-17 | AT-050～053 | `src/modules/mind-map-layout/`<br>`src/modules/mind-map-domain/graph.ts`<br>`src/modules/meeting-db/repository.ts`<br>`src/features/meeting-room/`<br>自动化证据：`layout.test.ts`、`graph.test.ts`、`repository.test.ts`、`canvas-view-model.test.ts`、`meeting-canvas-browser.test.ts`；真实 Chromium 覆盖 1024/1440、选中与当前议题分离、显式 subtree fit、键盘、reduced motion、持久拖动与手机树状降级；`PersistedMeetingCanvas` 作为 P0-15/#7 路由接缝 |
| R-P0-09 | 选中节点显示模式化三张出招卡，每次仅新增 2–4 个直接子节点 | 产品 5、7.7；AI 7 | P0-18 | AT-060～062 | `src/features/meeting-room/node-assistance.ts`<br>`src/features/meeting-room/meeting-canvas-view.tsx`<br>`src/modules/meeting-ai/expand-node.ts`<br>`src/app/api/ai/expand-node/route.ts`<br>自动化证据：`node-assistance.test.ts`、`expand-node.test.ts`、`expand-node-client.test.ts`、`meeting-canvas-browser.test.ts` |
| R-P0-10 | 随手记 Enter 即写当前议题，不依赖 AI；手工编辑始终可用 | 产品 7.8；UI 10.4 | P0-20 | AT-063 | `src/features/meeting-room/meeting-canvas-view.tsx`<br>`src/features/meeting-room/persisted-meeting-canvas.tsx`<br>`src/modules/meeting-db/repository.ts`<br>自动化证据：`node-assistance.test.ts`、`repository.test.ts`、`meeting-canvas-browser.test.ts` |
| R-P0-11 | 会中提供开场、议题、转场和散会的轻量主持人小抄 | 产品 7.7；UI 10 | P0-19 | AT-066 | `src/features/meeting-room/meeting-canvas-view.tsx`<br>`src/features/meeting-room/canvas-elements.tsx`<br>`messages/*.json`<br>自动化证据：`meeting-canvas-browser.test.ts`、`src/i18n/messages.test.ts` |
| R-P0-12 | 同一浏览器只允许一场 LIVE，开始时确认人数，时间经过不自动改生命周期 | 产品 7.6、7.7；领域 3、4 | P0-21 | AT-070～072、AT-076 | `src/modules/meeting-domain/lifecycle.ts`<br>`src/modules/meeting-domain/derive-timing-state.ts`<br>`src/modules/meeting-db/repository.ts`<br>`src/features/live-meeting/start-meeting-dialog.tsx`<br>`src/features/live-meeting/live-meeting-toolbar.tsx`<br>`src/features/live-meeting/commands.ts`<br>`src/modules/meeting-domain/lifecycle.test.ts`<br>`src/modules/meeting-domain/derive-timing-state.test.ts`<br>`src/modules/meeting-db/repository.test.ts`<br>`src/features/live-meeting/live-meeting.test.tsx` |
| R-P0-13 | 可标记决策、候选创意、洞察、行动项；行动项元数据可选，同一节点最多一个有效产出 | 产品 6、7.9；ADR 0003 | P0-22 | AT-080～081、AT-085 | `src/modules/meeting-domain/outcomes.ts`<br>`src/modules/meeting-db/repository.ts`<br>`src/features/live-meeting/outcome-panel.tsx`<br>`src/modules/meeting-domain/economics.test.ts`<br>`src/modules/meeting-db/repository.test.ts`<br>`src/features/live-meeting/live-meeting.test.tsx` |
| R-P0-14 | LIVE 累计人时、结束后总人时和产出形成成本由确定性代码计算 | 产品 7.9；领域 6 | P0-04、P0-22 | AT-073、AT-077、AT-082、AT-084 | `src/modules/meeting-domain/economics.ts`<br>`src/modules/meeting-domain/end-check.ts`<br>`src/features/live-meeting/live-meeting-toolbar.tsx`<br>`src/modules/meeting-domain/economics.test.ts`<br>`src/modules/meeting-domain/end-check.test.ts`<br>`src/features/live-meeting/live-meeting.test.tsx` |
| R-P0-15 | 散会前软检查和二次确认；零产出也允许结束；ENDED 不回 LIVE | 产品 7.10；领域 3 | P0-23 | AT-076、AT-090～091 | `src/modules/meeting-domain/lifecycle.ts`<br>`src/modules/meeting-domain/end-check.ts`<br>`src/features/live-meeting/end-meeting-dialog.tsx`<br>`src/modules/meeting-domain/lifecycle.test.ts`<br>`src/modules/meeting-domain/end-check.test.ts`<br>`src/features/live-meeting/live-meeting.test.tsx` |
| R-P0-16 | 结束后生成模式化 Markdown；最多 3 个确定性 Mermaid，失败有文本降级 | 产品 7.11；AI 9；UI 12 | P0-24～026 | AT-092～096 | `src/modules/report-domain/facts.ts`<br>`src/modules/report-domain/generation.ts`<br>`src/modules/report-domain/markdown.ts`<br>`src/modules/report-domain/mermaid.ts`<br>`src/modules/report-domain/mermaid-renderer.ts`<br>`src/modules/report-domain/polish.ts`<br>`src/features/report/commands.ts`<br>`src/features/report/report-client.tsx`<br>`src/features/report/report-workspace.tsx`<br>`src/features/report/report-markdown.tsx`<br>`src/modules/report-domain/facts.test.ts`<br>`src/modules/report-domain/generation.test.ts`<br>`src/modules/report-domain/markdown.test.ts`<br>`src/modules/report-domain/mermaid.test.ts`<br>`src/modules/report-domain/polish.test.ts`<br>`src/features/report/commands.test.ts`<br>`src/features/report/copy-loader.test.ts`<br>`src/features/report/report-workspace.test.tsx`<br>`src/modules/integration-validation/mermaid-renderer.test.ts` |
| R-P0-17 | 会议业务数据仅存 IndexedDB；完整 JSON 导出不含 Key | 产品 7.13；ADR 0002 | P0-05、P0-06 | AT-100～102 | `src/modules/meeting-db/database.ts`<br>`src/modules/meeting-db/repository.ts`<br>`src/modules/meeting-db/observe.ts`<br>`src/modules/meeting-db/export.ts`<br>`src/features/app-shell/local-data-drawer.tsx`<br>自动化证据：`repository.test.ts`、`e2e/dashboard-guide-creation.spec.ts` |
| R-P0-18 | `zh-CN`、`zh-TW`、`en-US` 完成主路径，界面语言不改写会议内容 | 产品 4；i18n 全文 | P0-02、P0-27 | AT-096、AT-110～112 | `messages/zh-CN.json`<br>`messages/zh-TW.json`<br>`messages/en-US.json`<br>`src/i18n/messages.test.ts`<br>自动化证据：`e2e/dashboard-guide-creation.spec.ts`、`e2e/preparation.spec.ts`、`src/features/report/report-workspace.test.tsx` |
| R-P0-19 | 桌面提供完整画布；手机保留轻量主路径并明确画布限制 | UI 14 | P0-28 | AT-113～116 | `src/features/meeting-room/meeting-canvas-view.tsx`<br>`src/features/meeting-room/meeting-canvas.module.css`<br>`src/features/live-meeting/`<br>`src/features/report/`<br>自动化证据：`meeting-canvas-browser.test.ts`（375/1024/1440、键盘、reduced motion）、`e2e/dashboard-guide-creation.spec.ts`（375/640/768/1024/1440）、`e2e/preparation.spec.ts`（繁中 375px 生命周期与报告） |
| R-P0-20 | 首页明确本机保存、导出和云同步预告，不谎称 P0 已支持登录同步 | 产品 7.13；UI 13；ADR 0002 | P0-06、P0-09 | AT-102～105 | `src/features/app-shell/`<br>`src/features/dashboard/dashboard-home.tsx`<br>`src/features/dashboard/meeting-groups.ts`<br>`src/app/[locale]/page.tsx`<br>自动化证据：`meeting-groups.test.ts`、`e2e/dashboard-guide-creation.spec.ts` |

## 3. Stretch 追踪

| ID | 能力 | 实施任务 | 相关验收 | 默认状态 |
|---|---|---|---|---|
| R-ST-01 | 高级用户覆盖白名单内模型 ID | ST-01 | AT-016 | 候选 |
| R-ST-02 | 随手记 AI 建议当前子树中的父节点，用户确认后移动 | ST-02 | AT-064～065 | 候选 |
| R-ST-03 | 会后补记与结束时间修正；补记不计形成成本 | ST-03 | AT-075、AT-083 | 候选 |
| R-ST-04 | 超时 LIVE 会议恢复向导 | ST-04 | AT-074～075 | 候选 |
| R-ST-05 | 手机端树状会议操作 | ST-05 | AT-117 | 候选 |

## 4. 完成时的更新方式

实现者应把“实现位置”从“待实现”替换为最小事实源，例如：

```text
src/features/grill/contract.ts
src/features/grill/__tests__/contract.test.ts
e2e/grill.spec.ts
```

不要记录临时分支名、个人机器路径或一次性调试文件。
