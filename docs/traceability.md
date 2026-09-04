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
| R-P0-02 | 用户以匿名设备会话配置 SiliconFlow live AI；运行时按 role capability 放行。历史 StepFun 密文保留但只读且仅兼容既有 `grill`，Key 不回显、能力不足不污染凭证也不静默 fallback | 产品 7.2；领域 2；ADR 0002 | P0-07、P0-08 | AT-010～019、AT-01A～01E | `src/modules/provider-config/model.ts`<br>`src/modules/provider-config/service.ts`<br>`src/modules/provider-config/http-runtime.ts`<br>`src/modules/api-security/provider-config-http.ts`<br>`src/modules/meeting-ai/configured-provider-call.ts`<br>`src/modules/meeting-ai/provider-adapter.ts`<br>`src/app/api/provider-config/`<br>`src/features/provider-config/`<br>`src/features/app-shell/model-status-control.tsx`<br>自动化证据：`model.test.ts` 与 `service.test.ts`（capability matrix、历史 StepFun 保留、无 fallback、能力检查早于解密/touch/upstream、stale preload 重读、认证 revision 隔离、v1/keyring 迁移）、`provider-config-http.test.ts` 与 `http-runtime.test.ts`（稳定 422）、`configured-provider-call.test.ts`（role 绑定）、`provider-adapter.test.ts`（获准请求策略）、`e2e/provider-config.spec.ts`（SiliconFlow 配置与历史 StepFun 有限状态）；清会议与清模型配置双向隔离 |
| R-P0-03 | AI 推荐三主一辅剧本，用户确认；Grill 后不能静默改模式 | 产品 5、7.3；ADR 0003 | P0-11 | AT-020～023 | `src/modules/meeting-ai/classify-meeting.ts`<br>`src/modules/meeting-ai/classify-prompt.ts`<br>`src/app/api/ai/classify-meeting/route.ts`<br>`src/features/meeting-creation/`<br>`src/modules/meeting-db/repository.ts`<br>自动化证据：`classify-meeting.test.ts`、`classify-client.test.ts`、`repository.test.ts`、`e2e/dashboard-guide-creation.spec.ts` |
| R-P0-04 | Grill 单问题进行，适合枚举的问题优先使用 2–6 项单选，否则支持文字作答；默认 5 轮，可有一次临门一问，用户续问总上限 10；结构化输出失败不会阻断继续准备 | 产品 7.4；AI 5 | P0-12、P0-13 | AT-030～035 | `src/modules/meeting-domain/grill.ts`<br>`src/features/preparation/ai-contract.ts`<br>`src/features/preparation/preparation-reliability.ts`<br>`src/features/preparation/preparation-fallbacks.ts`<br>`src/features/preparation/orchestrator.ts`<br>`src/features/preparation/preparation-workspace.tsx`<br>自动化证据：`grill.test.ts`、`ai-contract.test.ts`、`preparation-fallbacks.test.ts`、`preparation-reliability.test.ts`、`orchestrator.test.ts`、`preparation-workspace.test.tsx` |
| R-P0-05 | 准备度按维度和三级文案表达，用户可指定下一轮优先维度 | 产品 7.4；UI 8 | P0-12、P0-13 | AT-030、AT-034～035 | `src/modules/meeting-domain/grill.ts`<br>`src/features/preparation/preparation-workspace.tsx`<br>`messages/*.json`<br>自动化证据：`grill.test.ts`、`ai-contract.test.ts`、`preparation-workspace.test.tsx` |
| R-P0-06 | Brief 与完整初始图先在内存中验证，再于同一事务锁定和写入；失败保持可编辑且不产生部分写入；继续补问与重新准备按不同规则回退，LIVE 后均不可用 | 产品 7.5；领域 3 | P0-14、P0-15 | AT-023、AT-036～038 | `src/modules/meeting-domain/preparation.ts`<br>`src/modules/meeting-db/repository.ts`<br>`src/features/preparation/orchestrator.ts`<br>`src/features/preparation/preparation-workspace.tsx`<br>自动化证据：`preparation.test.ts`、`repository.test.ts`、`orchestrator.test.ts`、`preparation-workspace.test.tsx` |
| R-P0-07 | 初始图为一个根、3–5 个一级议题、最多 12 节点和两层；模型只生成语义内容，结构由本地确定生成；一次修复仍失败时生成有效三议题降级图；失败不写半成品 | 产品 7.5；ADR 0001 | P0-15 | AT-040～043 | `src/modules/mind-map-domain/graph.ts`<br>`src/modules/meeting-db/repository.ts`<br>`src/features/preparation/ai-contract.ts`<br>`src/features/preparation/preparation-reliability.ts`<br>`src/features/preparation/preparation-fallbacks.ts`<br>`src/features/preparation/initial-map.ts`<br>自动化证据：`graph.test.ts`、`repository.test.ts`、`ai-contract.test.ts`、`preparation-fallbacks.test.ts`、`preparation-reliability.test.ts`、`initial-map.test.ts`、`orchestrator.test.ts` |
| R-P0-08 | 工作台呈现 LR 单向树，当前议题与选中节点分离，只在显式操作时聚焦 | 产品 7.7；UI 10；ADR 0001 | P0-16、P0-17 | AT-050～053 | `src/modules/mind-map-layout/`<br>`src/modules/mind-map-domain/graph.ts`<br>`src/modules/meeting-db/repository.ts`<br>`src/features/meeting-room/`<br>自动化证据：`layout.test.ts`、`graph.test.ts`、`repository.test.ts`、`canvas-view-model.test.ts`、`meeting-canvas-browser.test.ts`；真实 Chromium 覆盖 1024/1440、选中与当前议题分离、显式 subtree fit、键盘、reduced motion、持久拖动与手机树状降级；`PersistedMeetingCanvas` 作为 P0-15/#7 路由接缝 |
| R-P0-09 | 选中节点显示模式化三张出招卡；领域边界接受 2–4 个直接子节点，交互式 Provider 窄契约固定生成 2 个；不支持 fast role 时 422、零写入且不展示无效重试 | 产品 5、7.7；AI 7、11 | P0-18 | AT-060～062、AT-01E | `src/features/meeting-room/node-assistance.ts`<br>`src/features/meeting-room/meeting-canvas-view.tsx`<br>`src/modules/meeting-ai/error-contract.ts`<br>`src/modules/meeting-ai/expand-node.ts`<br>`src/modules/meeting-ai/expand-node-task.ts`<br>`src/modules/meeting-ai/provider-output-failure.ts`<br>`src/app/api/ai/expand-node/route.ts`<br>自动化证据：`node-assistance.test.ts`（浏览器实际上下文预算）、`error-contract.test.ts`（含 capability 的错误主码与安全分型）、`expand-node.test.ts`、`expand-node-task.test.ts`（384-token live 预算、5 秒边界、双 `{kind,title}` 候选、title 上限）、`provider-adapter.test.ts`（不读取正文的失败分型）、`expand-node-client.test.ts`、`meeting-canvas-browser.test.ts`（固定安全 data attribute、0 写入、capability 错误不重试）、`expand-node-route.integration.test.ts`（SiliconFlow 英文/简中分类与每种 locale 3/3、median ≤3 秒）、`e2e/preparation.spec.ts`（真实 Chromium 骨架、成功持久化与刷新、失败清理、取消及迟到响应） |
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
| R-P0-21 | 首页、创建、模型设置、导览与会议工作台保持单一品牌与语义层级，任务优先于说明；三语在 375/1024/1440px 无整体或容器横向溢出，ENDED 报告优先且历史画布按需展开 | UI 3～6、10、12、14；品牌规范 | P0-30 | AT-118～119 | `src/features/app-shell/`<br>`src/features/dashboard/`<br>`src/features/provider-config/`<br>`src/features/guide/`<br>`src/features/meeting-room/persisted-meeting-canvas.tsx`<br>`src/features/report/`<br>自动化证据：`e2e/ui-hierarchy.spec.ts`（三语 × 375/1024/1440 的首页、创建、模型设置、导览层级与宽度矩阵，逐步首屏操作断言）、`e2e/preparation.spec.ts`（三语、三宽度与 PREPARING/LIVE/ENDED 的正交状态矩阵、ENDED 报告与折叠画布生命周期）、相关组件测试 |

### 主流程可靠性补充（Issue #51）

| 需求 | 验收 | 回归证据 |
|---|---|---|
| R-P0-02 配置操作互斥、卸载后迟到响应失效 | AT-01F | `src/features/provider-config/provider-config-panel.test.tsx`：测试/保存期间禁用清除，真实 Gate 关闭重开后忽略旧保存与旧状态刷新 |
| R-P0-03 创建输入与推荐请求一致 | AT-024 | `src/features/meeting-creation/meeting-creation.test.tsx`：编辑取消请求并忽略迟到结果；`e2e/dashboard-guide-creation.spec.ts`：重新推荐后持久化最新要求、标题和人数 |
| R-P0-06 Brief 草稿的版本保护与恢复 | AT-039 | `src/features/preparation/preparation-workspace.test.tsx`：Dexie 更新不会覆盖未保存输入，保存/生成拒绝旧版本，确认载入后可再次保存，未编辑时跟随更新；外部 DRAFT/GRILLING/MAP_READY 保留可复制草稿；`e2e/preparation.spec.ts`：真实双标签页、375px 冲突提示、触控与确认恢复 |
| R-P0-12/14/15 散会人数保持用户确认值 | AT-072/073/090 | `src/features/live-meeting/live-meeting.test.tsx`：同页 PREPARING → LIVE → 首次散会、正确人时、临时修正与关闭重开；`e2e/preparation.spec.ts`：导航前首次散会检查使用开始时确认的 6 人 |

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
