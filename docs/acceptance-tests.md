# Convergene 验收测试（v0.1）

> 本文定义 P0 是否完成。测试可以由单元、组件、集成或 E2E 覆盖，但不能只凭视觉印象勾选。

## 1. 测试层次

- **Unit**：领域状态、时间、人时、图不变量、schema、加密。
- **Component**：表单、准备度、节点出招、散会检查、错误态。
- **Integration**：Dexie transaction、Redis Provider config、AI route contract、报告组装。
- **E2E**：三语主路径、导览、真实 Provider 冒烟、部署环境。

测试 fixture 使用虚构公司和会议内容，不放真实工作资料或 sponsor Key。

## 2. 导览与首次使用

### AT-001 无 Key 导览

Given 新浏览器没有模型配置和会议数据  
When 用户打开首页并进入 90 秒导览  
Then 可以切换三个主剧本、看到预置节点展开和报告，且没有请求 `/api/ai/*`。

### AT-002 导览不污染数据

Given 用户正在导览  
When 用户完成或退出导览  
Then IndexedDB 中不新增 Meeting、Node、Edge 或 Outcome。

### AT-003 复制示例

Given 用户在某个导览场景  
When 点击“以这个示例开始”并确认  
Then 创建一份独立本地 Meeting；修改它不影响 fixture，真实 AI 操作要求配置 Key。

## 3. 模型配置

### AT-010 首次 AI 配置

Given 用户没有 Provider config  
When 创建真实会议或触发 AI  
Then 打开配置引导，而不是显示通用 500 错误。

### AT-011 配置成功

Given 用户为当前 live Provider SiliconFlow 输入有效 Key \
When 测试连接并保存 \
Then 返回成功、设置匿名 HttpOnly Cookie、Redis 存在加密记录，响应和页面不回显原始 Key。

### AT-012 配置失败不保存

Given SiliconFlow Key 无效、模型不存在或 Provider 限流 \
When 测试连接 \
Then 显示可区分错误，且不创建/覆盖有效 Redis 配置。

### AT-013 清除配置

Given 已保存模型配置且本地有会议  
When 用户确认清除模型配置  
Then Redis 记录和 session Cookie 被删除，本地会议保持不变。

### AT-014 Provider 白名单

Given 请求中尝试提交自定义 Base URL、换行 model id 或未知 Provider  
When 调用配置接口  
Then 服务端以 4xx 拒绝，不发出外部请求。

### AT-015 TTL

Given 配置即将过期  
When 一次 AI 调用成功读取配置  
Then Redis 和 Cookie 的空闲 TTL 续期到 30 天；未使用记录最终自动清理。

### AT-016 高级模型覆盖（Stretch）

Given 用户展开高级设置  
When 输入符合白名单格式的模型 ID 并测试  
Then 只覆盖对应任务的模型映射，不允许修改 Base URL；隐藏高级设置时默认 preset 仍可直接使用。

### AT-017 历史 StepFun 保留与 SiliconFlow 切换

Given 升级前的匿名会话已有 StepFun 密文，随后保存 SiliconFlow \
When 刷新、重新配置 SiliconFlow 并显式把它设为当前 Provider \
Then 两个凭证槽与各自 capability 都恢复；StepFun 密文和 `createdAt` 保持不变，但界面不提供新的
StepFun 测试、保存、重配或激活入口。

### AT-018 单供应商更新隔离

Given 历史 StepFun 与 SiliconFlow 均有凭证槽 \
When SiliconFlow 连接测试失败或用户成功重新配置它 \
Then 失败不覆盖任何凭证；成功只替换 SiliconFlow，StepFun 的密文与 `createdAt` 不变。

### AT-019 加密记录迁移与轮换

Given 有效 v1 记录或使用已知旧 keyId 的 v2 记录
When status 在当前 keyring 下读取
Then v1 无需用户输入即迁移；已知旧 key 在服务端重加密为当前 key；未知 keyId 在 AI 调用前只把对应供应商标为 `NEEDS_RECONFIGURATION`。

### AT-01A 供应商失败隔离

Given 历史 StepFun 与 SiliconFlow 均有凭证槽且 SiliconFlow 为当前 Provider \
When SiliconFlow 返回确认的 401 认证拒绝 \
Then 只标记 SiliconFlow 需要重配；StepFun 凭证健康保持不变，但不能因此成为 live fallback。通用
403、429、timeout 或 5xx 不改变任一凭证状态，也不打开重配门禁。

### AT-01B 来源隔离

Given Production 与 Vercel Preview 使用不同 host
When 浏览器访问两个来源
Then host-only 匿名 Cookie 与模型配置彼此隔离，界面/文档不得把这种隔离描述成同一来源内的凭证丢失。

### AT-01C 并发写入与迟到认证失败

Given 同一匿名会话仍保存历史 StepFun，或旧 SiliconFlow 凭证的 AI 请求仍在进行时用户替换了它 \
When SiliconFlow 写入发生竞争，或旧请求随后返回确认的 401 \
Then StepFun 槽不会丢失；迟到 401 只匹配旧 SiliconFlow credential revision，不把替换后的新
凭证或历史 StepFun 标为需重配。

### AT-01D Provider 请求策略

Given SiliconFlow 通过 capability gate，或升级前已激活 StepFun 且请求 `grill` \
When 发起获准的产品结构化 AI 调用 \
Then SiliconFlow 的 `fast`/`grill` 显式包含 `enable_thinking: false` 并使用流式严格
`json_schema`；历史 StepFun `grill` 使用 `step-3.5-flash-2603 + reasoning_effort: low` 与流式
严格 JSON Schema。两家字段互不泄漏，所有任务仍保留本地 Zod、token、取消、超时和安全错误
归一化策略。

### AT-01E Provider role capability

Given capability matrix 为 SiliconFlow `fast/grill = AVAILABLE`、StepFun
`grill = AVAILABLE`，且两家 `report` 与 StepFun `fast` 为 `UNAVAILABLE` \
When 公共配置接口尝试 test/save/activate StepFun，或当前 StepFun 请求 `fast/report` \
Then 返回稳定 `PROVIDER_CAPABILITY_UNAVAILABLE` 与 HTTP 422，且不调用测试 Provider、不写配置、
不解密或 touch 凭证、不调用任务 Provider，也不自动尝试 SiliconFlow。既有 StepFun 密文保留；
用户显式激活 SiliconFlow 后，新 `fast/grill` 请求才可执行。

### AT-01F 配置面板的异步操作

Given 模型配置面板正在测试、保存或切换供应商
When 用户尝试清除配置，或关闭面板后重新打开
Then 同一面板内的冲突操作不会并发；已卸载面板的迟到响应不触发配置成功回调，不关闭新弹窗。

## 4. 创建与剧本

### AT-020 分类推荐

Given 用户输入清晰的决策、脑暴或复盘需求  
When 分类任务成功  
Then 返回对应模式、短标题和一句理由；只推荐，不直接开始 Grill。

### AT-021 通用兜底

Given 输入不符合三个主剧本或模型 confidence 为 LOW  
When 分类完成  
Then 推荐 `GENERAL`，其入口视觉优先级低于三主剧本。

### AT-022 手动改选

Given AI 推荐任一剧本  
When 用户选择另一个剧本并确认  
Then Grill 使用用户选择，且不要求重新调用分类。

### AT-023 剧本锁定

Given 已进入 Grill  
When 用户尝试直接切换剧本  
Then 不允许静默切换；只有“重新准备”可以保留老板原话、清空剧本与准备内容后返回选择。

### AT-024 推荐期间修改输入

Given 创建表单的剧本推荐请求仍在等待
When 用户修改原始需求、标题、时间、人数或内容语言
Then 旧请求失效，迟到响应不能推进页面；再次推荐和最终保存使用当前表单内容。

Given 用户已开始推荐，并在日期控件内编辑开始/结束时间或选择日历日期、时间
When 尚未按 Enter 或确定，旧推荐响应已返回
Then 日期编辑仍保留在创建页，旧响应不能推进页面；按日期控件原有方式确认后，再次推荐和最终保存使用已确认的新时间。

## 5. Grill、准备度与 Brief

### AT-030 单问题

Given Grill 正在进行  
When 模型返回下一轮  
Then 页面只显示一个主问题、理由、已知摘要和准备度。

### AT-030a 低成本回答

Given 模型判断当前问题适合由清晰选项回答
When Grill 返回一个 `SINGLE_CHOICE` 问题
Then 页面默认显示 2–6 个单选项，未选择时不能提交；用户可以切换到自由作答并把答案保存到同一轮。

Given 模型返回 `FREE_TEXT` 问题
When 用户查看当前轮
Then 页面显示原有自由文本输入，不显示单选控件。

### AT-031 回答处置

Given 当前问题  
When 用户回答、不知道或跳过  
Then disposition 正确持久化，刷新后历史和轮次不丢失。

### AT-032 默认上限和临门一问

Given 已完成 5 轮  
When 存在致命缺口且模型请求 `CRITICAL_EXTRA`  
Then 最多显示一个第 6 轮“临门一问”和其必要理由；一般润色不得触发。

### AT-033 用户续问

Given 默认流程结束且轮次少于 10  
When 用户点击“继续拷问我”  
Then 每次增加一轮；达到 10 后客户端与 API 均拒绝第 11 轮。

### AT-034 指定准备维度

Given 有未完成准备分段  
When 用户点击该分段并继续 Grill  
Then 下一请求带 `requestedDimension`，问题优先覆盖它。

### AT-035 准备度不作门禁

Given 准备度为 `INSUFFICIENT`  
When 用户选择结束 Grill  
Then 仍能生成 Brief，未知信息明确保留。

### AT-036 Brief 锁定

Given 用户点击“确认并生成脑图”
When 初始图仍在生成、生成失败或已经成功
Then 生成期间当前 Brief 只在内存中作为不可变候选；失败时数据库不写 `confirmedAt` 且恢复可编辑；完整图成功后 Brief 与图在同一事务中锁定和保存。

### AT-037 Brief 失败重试

Given Brief 的初始图生成失败
When 用户修改或保留草稿后再次确认生成
Then 新请求使用当次点击时的不可变候选快照，数据库中没有旧 `confirmedAt` 或部分 Node/Edge；界面另提供“继续补问”和“重新准备”。

### AT-038 准备回退

Given Meeting 处于 `BRIEF_READY` 或 `MAP_READY`
When 选择“继续补问”
Then 保留原始需求、剧本和既有 Grill 问答，清空 Brief 与脑图后回到 `GRILLING`；选择“重新准备”则只保留原始需求并回到 `DRAFT`。

### AT-039 Brief 草稿与跨标签页冲突

Given 当前页有未保存 Brief 修改，另一标签页更新了会议
When live query 推送新版本，或用户保存/确认生成图
Then 本地草稿保持原样，旧版本操作被拒绝且不发起生成图请求，不覆盖已保存内容；载入已保存版本需要明确确认，取消确认继续保留草稿，确认后可继续保存。

Given 当前页没有本地 Brief 修改
When 另一标签页更新 Brief
Then 表单跟随已保存版本刷新，不产生不必要的冲突。

Given 当前页有未保存 Brief，另一标签页已经生成图或退回选择/Grill
When 当前页收到阶段变化
Then 显示仍可复制的只读草稿，不自动开始新一轮 AI；只有用户确认丢弃草稿后才进入已保存阶段。

## 6. 初始图与树约束

### AT-040 合法初始图

Given 一个已确认 Brief  
When 初始图通过模型和校验  
Then 生成一个根、3–5 个一级议题、最多 12 节点、两层和稳定 order；每个一级议题保存启动问题与转场提示。

### AT-041 非法图拒绝

Given 模型返回多根、孤点、环、缺失 parent、超深、超量或超长标题  
When 应用输出  
Then 第一次最多发起一次修复；第二次仍失败则不写任何 Node/Edge。

### AT-042 模式软模板

Given 三个主剧本的 fixture  
When 生成初始图  
Then `templateCoverage` 覆盖对应模式重点，同时不要求固定栏目名称。

### AT-043 LR 布局

Given 合法会议树  
When 首次布局  
Then 根在左、子节点向右，一级议题 order 稳定，布局不改变边关系。

## 7. 当前议题与画布

### AT-050 唯一当前议题

Given Meeting 为 LIVE  
When 开始会议  
Then 第一个一级议题成为 Active Topic；普通节点选择不改变它。

### AT-051 分支聚焦

Given 用户切换到另一一级议题  
When 聚焦发生  
Then 相应子树居中，其他分支降权；用户自由移动后系统不自动吸回。

### AT-052 不抢镜头

Given 用户已手动移动画布  
When AI 新节点返回  
Then 节点出现但不触发全图 fitView；用户可主动“重新聚焦”。

### AT-053 reduced motion

Given 系统启用 reduced motion  
When 切换议题  
Then 直接更新视口，不执行平滑动画。

## 8. 节点出招与随手记

### AT-060 模式化三卡

Given 选中节点  
When 当前模式分别为三主剧本或通用  
Then 只显示该模式对应的三个 Strategy action，未选中节点不常驻显示。

### AT-061 展开约束

Given 用户打出一张 Strategy  
When 模型成功返回  
Then 立即显示 2 个可见且尺寸稳定的骨架；当前快速任务新增恰好 2 个直接子节点（领域边界仍接受 2–4 个），保存 `source` 和 `strategyId`，不修改已有节点；刷新后新增节点仍存在，默认 Chromium UUID 路径不抛错。

### AT-062 展开失败

Given 模型在 5 秒边界内未完成、请求取消、schema 无效或本机持久化失败
When 请求结束  
Then 移除骨架节点、保留原图且不产生部分写入；可恢复失败提供重试；Provider 输出错误只暴露固定安全分类，不包含模型正文或原始响应；取消后的迟到响应不应用，pending 期间不能重复触发。

若错误为 `PROVIDER_CAPABILITY_UNAVAILABLE`，则不显示会再次得到同一 422 的重试操作，而是提供
进入模型设置的明确路径；其他可恢复错误仍保留重试。

### AT-063 随手记即时性

Given LIVE 且有 Active Topic  
When 用户输入并按 Enter  
Then 无需模型即创建 `kind = NOTE`、`source = QUICK_NOTE` 的节点并清空输入。

### AT-064 AI 归类确认（Stretch）

Given 随手记收到合法父节点建议  
When 用户未确认  
Then 边不改变；接受后事务化 reparent 并重新验证无环。

### AT-065 归类失败降级（Stretch）

Given 未配置 Key或归类请求失败  
When 创建随手记  
Then 节点仍在当前议题下可编辑，不反复弹错。

### AT-066 主持人小抄

Given 会议已有开场、一级议题和结束条件  
When 用户查看小抄并切换当前议题  
Then 显示对应的开场、议题启动问题、转场和散会检查提示，且不会自动切换议题或代替用户发言。

## 9. 生命周期、人数和人时

### AT-070 时间不自动改状态

Given Meeting 为 PREPARING  
When 计划开始或结束时间经过  
Then 只改变显示状态，不自动写 `LIVE` 或 `ENDED`。

### AT-071 唯一 LIVE

Given Meeting A 已 LIVE  
When 同一或另一个标签页尝试开始 Meeting B  
Then IndexedDB transaction 拒绝并显示返回/结束 A 的选择。

### AT-072 人数快照

Given 用户开始会议  
When 确认实际人数  
Then 使用单一数值计算整场人时；结束前修正后全部重算。

Given 同一页面先确认 6 人开始会议，再首次打开散会检查
When 用户未修改散会人数并结束会议
Then 检查、结束写入及报告仍使用 6 人，不恢复为挂载时的默认人数。打开期间保留主动修正，取消并重开时读取当前保存的人数。

### AT-073 总人时

Given 明确 startedAt、endedAt 和人数  
When 结束会议  
Then 总人时等于实际时长乘人数，模型输出不参与。

### AT-074 遗忘恢复（Stretch）

Given Meeting 已超过计划结束仍 LIVE  
When 用户重新打开应用  
Then 显示按计划结束、填写实际结束、仍在继续三个选择，不自动处理。

### AT-075 结束时间范围（Stretch）

Given 遗忘恢复或时间修正  
When 输入早于 startedAt 或晚于当前时间  
Then 拒绝并显示本地化校验错误。

### AT-076 ENDED 不可逆

Given Meeting 已经结束  
When 用户尝试再次开始该 Meeting  
Then 领域层和界面都拒绝 `ENDED -> LIVE`；用户只能查看、导出或使用允许的会后补记能力。

### AT-077 进行中累计人时

Given Meeting 为 `LIVE` 且有 `startedAt` 和实际人数
When 时钟推进但会议尚未结束
Then 累计人时使用 `(now - startedAt) × actualAttendeeCount` 实时推导，不写入伪造的 `endedAt`。

## 10. 会议产出

### AT-080 用户事实源

Given 任意节点  
When 模型生成或展开  
Then 不自动成为产出；只有用户确认“收进会议产出”才创建 Outcome。

### AT-081 类型与行动项

Given 用户标记产出  
When 选择 ACTION  
Then owner 和 dueDate 可选；为空也可保存，系统不能代填。

### AT-082 形成成本

Given 多个 `LIVE` outcome 具有标记时间  
When 计算成本  
Then 首项从 startedAt 算，后续从前项算，结束后剩余为未归属人时。

### AT-083 会后补记（Stretch）

Given Meeting 已 ENDED  
When 新增 Outcome  
Then origin 为 `POST_MEETING`，报告标注会后补记且不显示形成成本。

### AT-084 取消重算

Given 多个会中 Outcome  
When 用户确认取消其中一个  
Then 其余成本按标记顺序重算，取消前提示影响。

### AT-085 单节点单产出

Given 同一 Meeting 的某 Node 已有 Outcome
When 再次尝试为该 Node 创建另一个 Outcome
Then 领域层和 IndexedDB transaction 拒绝重复记录；用户必须编辑现有标记或先取消它。

## 11. 散会与报告

### AT-090 散会检查

Given LIVE Meeting  
When 点击结束  
Then 显示产出数、停车场、未决、行动缺口、实际时长、超时和总人时；未确认前不写 endedAt。

### AT-091 无产出结束

Given 没有 Outcome  
When 用户二次确认结束  
Then 允许 ENDED，报告明确没有正式产出，总人时全部未归属。

### AT-092 模式化报告

Given 三个主剧本各自有结构化数据  
When 生成报告  
Then 都有公共底座，并分别有产品规格定义的模式章节。

### AT-093 报告不造事实

Given ReportFacts 没有负责人、日期或某项决策  
When 模型润色  
Then 输出不能新增；contract 测试发现新增时拒绝结果并使用事实草稿。

### AT-094 Mermaid 确定性

Given 有有效结构化数据  
When 生成图表  
Then Mermaid 由程序生成、strict 渲染、用户文字转义，最多三张。

### AT-095 报告降级

Given 报告模型或 Mermaid 失败  
When 打开报告  
Then 事实正文、数据表、复制和下载仍可用。

### AT-096 报告语言

Given Meeting contentLocale 为中文  
When 用户选择英文重新生成  
Then 新报告 locale 为 `en-US`，Meeting contentLocale 和既有节点不改变，旧报告保留到成功。

## 12. 本机数据与长期转化

### AT-100 本地刷新

Given 有多个不同状态 Meeting  
When 刷新或重新打开浏览器  
Then IndexedDB 恢复会议、节点、产出、报告和 Active Topic。

### AT-101 服务端无会议内容

Given 完成完整主路径  
When 检查 Redis key 与服务端日志  
Then 不包含 Meeting id、标题、Brief、节点、Outcome、报告或完整 Prompt。

### AT-102 JSON 导出

Given 本地有会议  
When 导出全部数据  
Then 文件符合 v1 schema、引用完整、没有 Key、Cookie、Provider ciphertext 或临时选择状态。

### AT-103 本机保存可见

Given 任一主页面  
When 用户查看顶部  
Then 能看到“本机保存”；打开后能理解本地会议、服务端模型配置和未上线云同步的区别。

### AT-104 清除隔离

Given 同时有本地会议和模型配置  
When 分别执行“清除会议数据”或“清除模型配置”  
Then 两者互不误删。

### AT-105 云同步预告真实

Given P0 尚未实现账号和云同步  
When 用户查看首页的数据状态和长期保存入口  
Then 明确显示会议仅保存在本机，并把登录同步标为后续能力；不得出现已经同步成功的状态或误导性按钮结果。

## 13. 国际化、响应式和无障碍

### AT-110 三语 key parity

Given 三份 messages  
When 运行 parity test  
Then key、变量名和 ICU 参数完全一致。

### AT-111 UI locale 切换

Given 正在某会议某节点  
When 切换语言  
Then URL locale 和 UI 更新，meeting id、阶段、选中节点与用户内容保持。

### AT-112 Arco locale

Given 三个 uiLocale  
When 打开 DatePicker、Modal 和空态  
Then Arco 内置文案匹配当前语言。

### AT-113 桌面画布

Given 1024px 与 1440px viewport  
When 使用工作台  
Then 画布、浮动出招、右栏和随手记无关键遮挡。

### AT-114 手机降级

Given 375px viewport  
When 查看会议  
Then 能完成列表、Grill、计时、产出和报告；复杂画布有明确电脑建议，不出现页面级横向滚动。

### AT-115 键盘与焦点

Given 只使用键盘  
When 走过创建、Grill、选择节点、关闭浮动出招和散会检查  
Then 焦点可见、顺序合理、Esc 后返回触发元素。

### AT-116 200% 缩放

Given 浏览器缩放 200%  
When 完成主操作  
Then 开始、结束、提交、保存等操作不被截断或只能 hover 访问。

### AT-117 手机树状操作（Stretch）

Given 375px viewport 且已实现 ST-05
When 用户在分组树中新增、移动或重排节点
Then 操作不依赖完整画布或 hover，写入后仍通过树不变量校验，并可在桌面画布正确恢复。

### AT-118 页面层级与品牌唯一性

Given `zh-CN`、`zh-TW`、`en-US` 与 375、1024、1440px 的关键页面和会议状态
When 打开首页、创建、模型设置、导览，以及 PREPARING、LIVE、ENDED 工作台
Then 每页只有一个 `main`、一个页面级 `h1`、一个应用外壳 Logo/品牌链接；页面无横向滚动，手机顶栏不超过 72px；首页、模型设置、导览与会议状态的当前主操作位于首屏且点击目标至少 44px。

### AT-119 任务优先级

Given 已有会议、模型未配置、导览最终一步或已结束会议
When 用户进入对应页面
Then 首页首张会议卡优先于营销 Hero，模型表单优先于解释内容，导览只保留可执行的最终主操作，ENDED 先显示报告且历史画布默认不挂载、可显式展开并再次折叠。

## 14. 发布冒烟矩阵

| 场景 | Chrome 桌面 | Safari/Edge 桌面 | Chrome 手机模拟 |
|---|---:|---:|---:|
| 无 Key 导览 | 必须 | 至少一项 | 必须 |
| 配置 SiliconFlow | 必须 | 冒烟 | 不要求完整 |
| 历史 StepFun 有限能力与 422 降级 | 必须 | 不要求 | 不要求 |
| 简中完整主路径 | 必须 | 冒烟 | 轻量路径 |
| 繁中路由/Grill/报告 | 必须 | 不要求 | 不要求 |
| 英文长布局/完整报告 | 必须 | 冒烟 | 报告阅读 |
| 页面层级、单品牌与任务首屏 | 必须 | 冒烟 | 必须 |
| 刷新与跨标签唯一 LIVE | 必须 | 冒烟 | 不要求 |
| JSON/Markdown 下载 | 必须 | 冒烟 | 至少复制 |

## 15. 发布阻断条件

以下任一项存在时不能称为 P0 完成：

- Key 出现在客户端持久化、响应体或日志；
- 服务端保存会议内容；
- 模型可以自动标记会议产出；
- 两场会议可以同时 LIVE；
- 非法图被部分写入；
- 报告在模型失败时完全不可用；
- 任何一种 locale 无法完成核心路径；
- 导览消耗真实模型 Key或污染真实会议；
- 未通过 role capability 的 Provider 仍可被新建、激活或收到产品请求，或能力错误触发静默
  fallback；
- 时间或成本由模型计算；
- 结束会议无需用户确认。
