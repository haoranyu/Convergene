# Convergene 24 小时实施计划（v0.1）

> 本计划面向 coding agent。目标不是机械完成文件清单，而是在每个时间点保持一条可运行、可回退的垂直路径。

## 1. 实施原则

1. 先验证高风险外部依赖，再铺页面。
2. 先写领域函数和 schema，再让组件计算状态。
3. 每个 AI 任务先用 fixture 跑通，再接真实 Provider。
4. 每完成一个页面同时补三语 key，不把国际化留到最后。
5. 浏览器业务数据和服务端模型配置从第一天就分开，禁止临时混存。
6. 主路径始终可演示；stretch 不能破坏 P0。
7. 所有危险替换操作先保留旧数据，成功后提交。

## 2. 开工前检查

- [x] 阅读 `docs/README.md` 指定的核心文档；
- [x] 使用 `.nvmrc` 指定的 Node 24.x 与 `packageManager` 指定的 pnpm 10；
- [x] 初始化 Git 仓库并提交文档基线；
- [x] 创建 Vercel 项目但不要填公共模型 Key；Hobby production 已 Ready，且当前无环境变量；
- [x] 创建并认领 Upstash Redis 免费实例；
- [x] 通过已登录控制台准备 StepFun 与硅基流动测试 Key，仅临时注入测试子进程；
- [x] 生成 `APP_ENCRYPTION_SECRET`，不提交仓库或本地环境文件；
- [ ] 明确目标浏览器：最新版 Chrome 为主演示，Safari/Edge 为次要冒烟。

## 3. 风险优先 Spike（0–1.5 小时）

状态（2026-08-30）：R1–R3 已完成。历史 StepFun `step-3.7-flash`、硅基流动
`deepseek-ai/DeepSeek-V4-Flash` 的真实 streaming/schema/timeout/invalid-model suite 共六个 case
已通过；两轮产品节点展开验证没有通过成功率/延迟门禁，因此当前只把 fast role 校准为 StepFun
`step-3.7-flash` 与 SiliconFlow `Qwen/Qwen3.5-4B`，复杂 role 保留原模型，并增加不读取模型正文的
安全输出失败分型。新 fast preset 仍保留独立的 credential-gated 回归门禁。免费 Upstash 上的加密
set/get/续期/delete lifecycle 已通过且清理隔离 key；Dagre/React Flow/Mermaid 与真实 Chromium
browser probe 也有可重复证据。映射、延迟样本、测试入口和降级决策见
[高风险集成验证记录](./integration-validation.md)。

### R1：Provider 合约

- 用两个 sponsor Provider 各发送一次最小结构化输出请求；
- 记录可用 Base URL、模型 ID、平均延迟和 JSON/schema 稳定性；
- 选择默认 `fast`、`grill`、`report` 映射；
- 如果硅基流动某模型不支持结构化输出，将其从默认下拉排除，不改通用接口。

完成门槛：两个 Provider 至少各有一个可通过 Zod 的测试结果；否则明确一个 Provider P0、另一个降级为设置预告。

### R2：Redis 与加密

- 验证 set/get/delete/expire；
- 验证 AES-256-GCM encrypt/decrypt；
- 错误 secret 和被修改 ciphertext 必须失败；
- 验证 Vercel/本地环境变量名。

完成门槛：一条测试可以写入加密配置、读取解密、续期并删除，日志无明文 Key。

### R3：画布与报告

- 用 12 个长英文节点运行 Dagre LR；
- 验证 React Flow 对指定子树 `fitView`；
- 验证 Mermaid flowchart、timeline、pie；
- timeline 不稳定时立即决定用 flowchart 表达时间线。

完成门槛：形成可复制的最小实现片段或测试 fixture，不能把风险推迟到第 20 小时。

## 4. 工程骨架（1.5–3 小时）

### P0-01 初始化

状态：已完成。

- Next.js App Router + TypeScript；
- ESLint/Prettier；
- Vitest + RTL + Playwright；
- Arco、React Flow、Dagre、Dexie、next-intl、AI SDK、Zod、react-markdown、Mermaid、Upstash SDK。

### P0-02 Locale 外壳

状态：基础外壳已完成；真实产品词典随功能垂直切片继续补齐。

- `[locale]` 路由；
- `zh-CN`、`zh-TW`、`en-US` 空词典与 parity 测试；
- Arco `ConfigProvider`；
- 顶部语言切换与 `<html lang>`。

### P0-03 模块骨架

状态：基础接缝已建立；`fixtures/` 和其余 feature/module 目录按首个使用场景创建，不提交无意义空目录。

- 建立 `features/`、`modules/`、`ui/`、`fixtures/`；
- 只导出深模块公共入口，避免跨目录引用内部文件；
- 建立统一 error code 和 Result 类型。

完成门槛：已满足。三种 locale 首页可打开；format、lint、typecheck、unit test、build 与基础 Playwright E2E 均已通过。

## 5. 领域与持久化（3–5 小时）

### P0-04 领域纯函数

- 生命周期与时间状态；
- 准备阶段转移；
- 唯一 `LIVE`；
- 总人时和产出形成成本；
- 初始图/一般树验证；
- 产出标记，以及会后补记所需的领域类型与成本排除规则；会后补记 UI 仍属于 ST-03。

### P0-05 Dexie

- v1 schema；
- meeting 聚合 CRUD；
- 事务化开始/结束；
- 级联删除；
- live query / BroadcastChannel；
- fixture seed 工具只用于测试和导览复制。

### P0-06 JSON 导出

- 版本化 schema；
- 一致快照；
- 排除配置和临时 UI 状态；
- 单元测试引用完整性。

完成门槛：不接 AI 也能创建 fixture 会议、开始、标记产出、结束、刷新恢复并导出。

## 6. 用户模型配置（5–6.5 小时）

### P0-07 匿名会话

- HttpOnly Cookie；
- Redis key hash；
- 一个 v2 record 分别保存两家凭证槽和独立 `activeProvider`；
- v1 记录与旧加密 keyring 的无明文迁移；
- 30 天滑动 TTL；
- 清除配置；
- 同源 Origin 检查。

### P0-08 Provider 配置 UI/API

- status/test/save/delete；
- 已配置供应商之间显式切换，保存/重配一家不覆盖另一家；
- StepFun / 硅基流动预设；
- 硅基流动结构化请求固定使用 `enable_thinking: false`，StepFun 固定使用最低受支持的 `reasoning_effort: low`，且两家字段互不发送；
- Key password input；
- 保存后不回显；
- 认证、权限限制、限流、未知模型和 Redis 错误；只有确认的认证拒绝标记目标供应商需重配。

### ST-01 高级模型覆盖

基础设置稳定后再实现折叠的三个 model id；时间不足时切掉，不影响 preset。

完成门槛：新浏览器可配置自己的 Key、刷新后继续使用、清除后 AI route 返回 `PROVIDER_NOT_CONFIGURED`；Redis 没有会议内容。

## 7. 首页、导览和创建（6.5–8 小时）

### P0-09 首页

- 空态；
- 多会议分组和卡片；
- 本机保存与模型状态；
- 删除与数据说明。

### P0-10 导览沙盒

- 三种主剧本 fixtures；
- 内存数据源；
- 5 步导览；
- 预置节点展开；
- 复制为本机会议。

### P0-11 创建与分类

- 创建表单；
- `classify-meeting` route/schema/prompt；
- 推荐理由；
- 三主一辅剧本选择；
- 失败后手动选择。

完成门槛：无 Key 可以完成导览；有 Key 可以创建并确认剧本；导览不写 IndexedDB，复制才写。

## 8. Grill、准备度和 Brief（8–11 小时）

### P0-12 Grill contract

- 模式化维度；
- 适合枚举的问题优先使用单选，开放问题支持文字作答；
- 下一问和结构化已知状态；
- 默认 5 轮、临门一问、用户续问到 10；
- 指定维度优先追问；
- 每轮持久化。

### P0-13 Grill UI

- 单问题布局；
- 单选题默认提供 2–6 个选项，并可切换为文字作答；
- 分段准备度；
- 回答/不知道/跳过；
- 当前轮次；
- loading、重试、刷新恢复。

### P0-14 Brief

- 结构化编辑；
- 点击确认后先验证完整初始图，再原子锁定 Brief 与写图；失败时零部分写入并保留可编辑草稿；
- “继续补问”回到 `GRILLING` 与“重新准备”回到 `DRAFT` 的独立边界；
- 主持开场与关闭提示。

完成门槛：三个主剧本各用一组 fixture 走完 Grill；第 11 轮在客户端和 API 均被拒绝；完整图成功后 Brief 锁定且普通编辑入口消失，失败时保持草稿可编辑。

## 9. 初始图和画布（11–14 小时）

### P0-15 Initial map

- 模式软模板；
- 临时 key schema；
- 一次修复重试；
- UUID/边/坐标由程序生成；
- 失败不写部分数据。

### P0-16 React Flow 工作台

- 自定义节点；
- Dagre LR；
- 选择、编辑、拖动、删除；
- 保存位置；
- 一览全图/整理布局。

### P0-17 Active Topic 聚焦

- 当前议题状态；
- 上一/下一议题；
- subtree fitView；
- 非当前分支降权；
- reduced motion。

完成门槛：12 节点中英文图无重叠到不可用；切换议题只在显式操作时移动镜头；刷新后当前议题和位置恢复。

## 10. 会中出招、随手记和主持小抄（14–17 小时）

### P0-18 节点出招

- 12 个 Strategy ID 配置；
- 选中节点旁三卡；
- 最小近邻上下文；
- 与快速任务固定双候选契约一致的 2 个骨架节点；
- request id、取消、失败和重试；
- 绑定安全的浏览器 UUID、固定骨架几何与完整 `try/catch/finally` 清理；
- `fast` role 的 1,024-token / 5-second 有界调用、固定 2 个 `{kind,title}` 候选的窄 Provider schema、Provider 可见 48 字符标题上限、安全 `Server-Timing` 和 allowlist 输出失败分型；
- 成功事务写图。

### P0-19 主持人小抄

- 当前议题启动问题；
- 开场、过渡、散会提示；
- 不自动推进。

### P0-20 随手记

- Enter 立即创建；
- 当前议题/根节点 fallback；
- 后续编辑和产出。

### ST-02 AI 归类

- 候选父节点构造；
- 异步 suggestion chip；
- 接受后 reparent transaction；
- 忽略后不重复。

完成门槛：模型超时或配置丢失时，手工节点和随手记仍可使用；成功展开刷新后仍存在；失败、取消、持久化异常和迟到响应不产生部分写入，也不应用到错误会议。

## 11. 生命周期、产出和散会（17–19 小时）

### P0-21 开始与唯一 LIVE

- 人数确认；
- 原子检查 activeMeetingId；
- 跨标签页冲突提示；
- 真实计时和超时状态。

### P0-22 会议产出

- 四类产出；
- 模式预选；
- 行动项可选 owner/dueDate；
- 取消确认；
- 实时总人时与产出成本。

### P0-23 散会检查

- 产出/停车场/未决/行动缺口；
- 无产出软警告；
- 二次确认结束；
- 修正实际人数。

### ST-03 会后补记与时间修正

- ENDED 后新增 `POST_MEETING` Outcome；
- 时间修正校验与成本重算；
- 明确标记不计入形成成本。

### ST-04 遗忘恢复

- 超时 `LIVE` 恢复向导；
- 按计划结束、填写实际结束、仍在继续；
- 未实现时保留 P0 超时 banner，不自动结束会议。

两项均按 stretch 顺序实现，不改变基础结束路径。

完成门槛：完整状态转移和成本单测通过；两场会议不能同时 LIVE；没有产出也可确认结束。

## 12. 报告（19–21 小时）

### P0-24 Fact draft

- 公共事实；
- 模式专属 facts；
- 成本、时区、会后补记；
- 无模型 fallback。

### P0-25 报告 AI 与组装

- 结构化润色；
- Markdown assembler；
- 报告 locale；
- 旧报告保留到新报告成功。

### P0-26 Mermaid

- 模式化 flowchart；
- 产出时间线；
- 人时 pie；
- strict、转义、限制和表格降级。

完成门槛：关闭模型或故意返回非法 output 时仍能下载事实 Markdown；Mermaid 失败不影响正文。

## 13. 三语、响应式与演示质量（21–23 小时）

### P0-27 三语闭环

- 补齐所有词典；
- key parity；
- Arco locale；
- 长英文布局；
- 三种 AI outputLocale contract。

### P0-28 响应式

- 1024/1440 完整画布；
- 375 首页、Grill、计时、产出、报告；
- 手机只读分组树与画布降级说明。

### ST-05 手机端树状操作

- 在分组树中新增、移动与重排节点；
- 不依赖 hover 或完整画布；
- 每次写入后复用桌面端相同的树不变量校验。

### P0-29 错误与空态

- Provider 未配置/失效；
- Redis/IndexedDB/模型/Mermaid 失败；
- loading、取消和重试；
- reduced motion、键盘焦点。

完成门槛：三语 E2E 各至少一条，英文 200% 缩放可完成主操作。

## 14. 部署与最终验证（23–24 小时）

- Vercel production deploy；
- Upstash env 注入；
- CSP、Cookie 和 Origin 检查；
- 用全新浏览器跑无 Key 导览；
- 用真实用户 Key 跑主演示；
- 清除 Key，确认会议仍在；
- 导出 JSON 和 Markdown；
- 记录已知问题和 stretch 完成情况；
- 冻结演示 fixture，不在现场临时改真实模型 Prompt。

## 15. 测试命令门槛

项目脚本至少提供：

```text
lint
typecheck
test
test:e2e
build
```

交付前全部通过。若 E2E 时间不足，最低保留：简中真实主路径、英文路由/长布局、繁中词典和报告渲染。

## 16. Definition of Done

一个功能只有同时满足以下条件才算完成：

- 用户行为符合产品规格；
- 领域状态不由组件私自计算；
- happy path、错误态、loading、空态均可见；
- 三份词典有对应 key；
- 持久化或服务端边界正确；
- 相关验收用例通过；
- 刷新和跨标签页不会破坏状态；
- 不记录 Key 或会议内容到服务端日志；
- UI 使用 Arco 组件与设计 token；
- 代码没有以 TODO 代替 P0 关键路径。

## 17. 降级规则

如果进度落后：

1. 先切 ST-01 高级模型覆盖；
2. 再切 ST-05 手机树状操作；
3. 再切 ST-02 随手记 AI 归类，保留基础随手记；
4. 再切 ST-03 会后补记/时间修正 UI；
5. 最后切 ST-04 遗忘恢复，保留超时 banner。

不能切：三主剧本、Grill 准备度、受控图、节点出招、Active Topic、产出、散会检查、报告、三语、BYOK、导览、本地持久化。

## 18. Coding agent 工作方式

- 开始一项任务前引用对应需求 ID 和验收用例；
- 如果实现发现产品矛盾，先更新文档或请求决策，不在代码里选择第三种行为；
- 不为未来云同步提前建立通用 repository 层；当前 Dexie 和 Redis 边界已经明确；
- 不因“更智能”增加自动听会、自动移动、自动标记或静默上传；
- 每次改状态机、字段或 enum 时同步 `domain-model.md`、schema 和测试；
- 每次新增用户文案同时补三语 key；
- 每次新增 AI 字段同步 `ai-contracts.md` 和 fixture；
- 完成一个垂直切片后再进入下一切片，保持可运行主分支。
