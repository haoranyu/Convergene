# Convergene P0 发布检查记录

> 发布目标：<https://convergene.vercel.app>  
> 范围：P0 Issues #1–#12；Stretch #13–#16 不计入完成门槛

## 已验证路径

- 无 Key 导览覆盖三种主剧本，不调用 `/api/ai/*`，不写 IndexedDB；只有显式确认才复制为真实本机会议。
- Dashboard、创建、Grill、Brief、受控初始图、LR Canvas、节点出招、随手记、生命周期、产出、散会检查和报告已连接为同一浏览器本地闭环。
- 英文桌面闭环覆盖 Canvas → LIVE → 一项产出 → ENDED → Markdown/Mermaid 报告。
- 繁中 375px 闭环覆盖手机议题树 → LIVE → 一项产出 → ENDED → 报告，页面无整体横向溢出。
- 简中真实供应商冒烟使用 StepFun 完成一轮 Grill 回答并进入下一轮；临时验证凭证随后已撤销。
- SiliconFlow 连接测试通过；较长的结构化准备请求若超过有界超时，会显示可重试失败态且不修改本机会议。
- Safari Production 冒烟完成英文首页和五步无 Key 导览；在 200% 缩放下最终会议产出、便携报告和主操作仍可访问，期间未创建真实会议或调用供应商。

## 发布与安全边界

- Production 部署由 Vercel 从 `main` 生成，Upstash 只保存匿名会话关联的加密模型配置。
- 会议、节点、回答、随手记、产出和报告只保存在浏览器 IndexedDB。
- Production 响应包含 nonce CSP、HSTS、`frame-ancestors 'none'`、`object-src 'none'` 与同源连接限制。
- Provider 配置 Cookie 与写接口分别由 `HttpOnly`/`Secure`/`SameSite=Strict` 和严格 Origin 校验保护；响应、导出和 UI 不返回原始 Key。
- 结束状态不可逆、唯一 LIVE、图写入原子性、确定性时间/人时/形成成本均由领域代码和 repository 测试约束。

## 自动化门禁

发布分支必须一次通过：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e -- --workers=1
```

核心证据位置：

- `src/i18n/messages.test.ts`：三语 key、ICU 变量和枚举覆盖。
- `src/features/meeting-room/meeting-canvas-browser.test.ts`：375/1024/1440、键盘、reduced motion 和手机树降级。
- `e2e/dashboard-guide-creation.spec.ts`：首次使用、IndexedDB 失败、导出/清除、响应式与 locale 保持。
- `e2e/provider-config.spec.ts`：Key 不回显、失败不保存、清除隔离、CSP 与 375px。
- `e2e/preparation.spec.ts`：三语 Grill、桌面完整生命周期/报告和繁中手机生命周期/报告。

## 已知限制与降级

- `< 768px` 不承诺完整可拖动画布或结构编辑；手机提供本地化议题树、计时、产出和报告，页面明确建议复杂画布使用电脑。
- 供应商可用性、速率、模型权限和生成延迟不受 Convergene 控制；所有 AI 失败必须保持既有本机状态，并允许重试、手动选择或更换配置。
- 报告 AI 润饰和 Mermaid 渲染都可以失败；确定性事实稿、Markdown 源码和表格仍可用。
- P0 不提供登录、云同步、手机树结构编辑、会后时间修正或 stale-LIVE 恢复向导。
- 不配置 GitHub Actions；发布证据来自仓库脚本、PR Checks、Vercel Deployment 和人工供应商冒烟。
