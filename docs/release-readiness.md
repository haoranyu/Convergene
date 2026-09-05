# Convergene P0 发布检查记录

> 发布目标：<https://convergene.vercel.app>  
> 范围：P0 Issues #1–#12、发布可靠性修复 #26/#39 与 UI 层级修复 #40；Stretch #13–#16 不计入完成门槛

## 已验证路径

- 无 Key 导览覆盖三种主剧本，不调用 `/api/ai/*`，不写 IndexedDB；只有显式确认才复制为真实本机会议。
- Dashboard、创建、Grill、Brief、受控初始图、LR Canvas、节点出招、随手记、生命周期、产出、散会检查和报告已连接为同一浏览器本地闭环。
- 英文桌面闭环覆盖 Canvas → LIVE → 一项产出 → ENDED → Markdown/Mermaid 报告。
- 繁中 375px 闭环覆盖手机议题树 → LIVE → 一项产出 → ENDED → 报告，页面无整体横向溢出。
- 历史简中供应商冒烟曾使用 StepFun 完成一轮 Grill 回答并进入下一轮；这只支持保留既有
  `grill` capability，不表示 StepFun fast 或新配置可用。
- SiliconFlow 是当前 live Provider：`Qwen/Qwen3.5-4B` 在 `hkg1` 通过英文/简中分类，以及每种
  locale 节点展开 3/3、median ≤3 秒；较长结构化请求若超过有界超时，会显示可重试失败态且不
  修改本机会议。
- PR #48 的 StepFun `step-3.7-flash + low + streaming JSON Mode` 最终生产门禁中，双语分类
  失败、英文和简中展开均 0/3；全部 0 写入且骨架归零。产品因此通过 runtime capability gate
  阻止 StepFun fast，而不是继续把它当作可重试 live path。
- Safari Production 冒烟完成英文首页和五步无 Key 导览；在 200% 缩放下最终会议产出、便携报告和主操作仍可访问，期间未创建真实会议或调用供应商。
- Preparation 结构化输出先执行一次带候选值与紧凑错误的 repair；第二次仍无效时，Grill/Brief 和三议题 Initial Map 使用通过生产契约的本地确定性降级。自动化覆盖全部 mode × locale × output branch，以及连续两次无效输出后的创建 → Grill → Brief → Map → Canvas 路径。
- 首页、创建、模型设置、导览与会议工作台统一为单一应用外壳品牌和单一页面级标题；已有会议、模型配置、导览步骤及 ENDED 页面把当前任务放在说明或历史画布之前。三语 × 375/1024/1440px 页面矩阵验证层级和横向宽度，PREPARING/LIVE/ENDED 正交矩阵验证会议状态；首页、模型设置、导览与会议状态另验证首屏主操作和 44px 点击目标。

## 发布与安全边界

- Production 部署由 Vercel 从 `main` 生成，Upstash 只保存匿名会话关联的加密模型配置。
- 会议、节点、回答、随手记、产出和报告只保存在浏览器 IndexedDB。
- Production 响应包含 nonce CSP、HSTS、`frame-ancestors 'none'`、`object-src 'none'` 与同源连接限制。
- Provider 配置 Cookie 与写接口分别由 `HttpOnly`/`Secure`/`SameSite=Strict` 和严格 Origin 校验保护；响应、导出和 UI 不返回原始 Key。
- Provider capability 与 credential health 分离：SiliconFlow `fast/grill` 可用；只有升级前已经
  激活的 StepFun `grill` 可用；两家的 `report` 与 StepFun `fast` 不可用。能力错误在解密、touch
  和上游调用前返回稳定 HTTP 422，不删除历史凭证，也不静默 fallback。
- 结束状态不可逆、唯一 LIVE、图写入原子性、确定性时间/人时/形成成本均由领域代码和 repository 测试约束。

## 自动化门禁

发布分支必须一次通过：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test --workers=1
```

核心证据位置：

- `src/i18n/messages.test.ts`：三语 key、ICU 变量和枚举覆盖。
- `src/features/meeting-room/meeting-canvas-browser.test.ts`：375/1024/1440、键盘、reduced motion 和手机树降级。
- `e2e/dashboard-guide-creation.spec.ts`：首次使用、IndexedDB 失败、导出/清除、响应式与 locale 保持。
- `e2e/provider-config.spec.ts`：SiliconFlow Key 不回显、失败不保存、历史 StepFun 有限状态、清除隔离、CSP 与 375px。
- `e2e/preparation.spec.ts`：三语 Grill、桌面完整生命周期/报告和繁中手机生命周期/报告。
- `e2e/ui-hierarchy.spec.ts`：三语 × 375/1024/1440px 的首页、创建、模型设置、导览单品牌、语义层级与宽度回归，并逐步验证导览主操作首屏可见。
- `src/features/preparation/preparation-fallbacks.test.ts`：全部 mode × locale × branch few-shot 与降级 fixture 的生产契约。
- `src/features/preparation/preparation-reliability.test.ts`：一次 schema-aware repair、无第三次请求、两次无效后的确定性降级和供应商传输错误边界。
- `src/features/preparation/orchestrator.test.ts`：无效中间输出零部分写入，以及两次无效输出后的创建 → Grill → Brief → Map → Canvas 闭环。

## 主流程可靠性回归（Issue #51，待合并部署）

- 创建期间修改输入会使旧分类失效，包括日期控件尚未确认的手输、日历和时间选择；新推荐与本机保存保留最新要求、标题、人数和已确认的时间。
- Brief 未保存修改保留原版本，跨标签页保存冲突不会覆盖草稿或发起生成图；其他标签页推进或回退阶段时，先保留可复制的只读草稿，再由用户确认进入已保存阶段。
- 同页开始会议后首次散会仍使用确认的实际人数，取消重开时放弃临时人数修正。
- 配置面板的测试、保存、切换和清除互斥；已卸载面板的旧保存或状态刷新不会关闭新弹窗。
- 回归证据见 `docs/traceability.md` 的 Issue #51 补充；真实双标签页在 375px 验证草稿保留与确认恢复。此处记录本地验证范围，不代表已经发布至 Production。

## 已知限制与降级

- `< 768px` 不承诺完整可拖动画布或结构编辑；手机提供本地化议题树、计时、产出和报告，页面明确建议复杂画布使用电脑。
- SiliconFlow 的可用性、速率、模型权限和生成延迟不受 Convergene 控制；传输、权限和限流失败
  保持既有本机状态，并允许重试或更换配置；结构化输出无效按有界 repair/fallback 策略处理。
  StepFun 只保留历史 `grill` 兼容，不开放新配置或 live fast；capability 422 不提供无效重试。
- 报告 AI 润饰和 Mermaid 渲染都可以失败；确定性事实稿、Markdown 源码和表格仍可用。
- P0 不提供登录、云同步、手机树结构编辑、会后时间修正或 stale-LIVE 恢复向导。
- 不配置 GitHub Actions；发布证据来自仓库脚本、PR Checks、Vercel Deployment 和人工供应商冒烟。
