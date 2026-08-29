<p align="center">
  <img src="./public/brand/convergene-logo-horizontal.svg" alt="Convergene" width="360" />
</p>

<p align="center">
  帮助会议新手把模糊需求变成清晰议程，并把讨论推进到可交付结果。
</p>

<p align="center">
  <a href="https://convergene.vercel.app">在线体验</a> ·
  <a href="./docs/README.md">项目文档</a>
</p>

## 关于 Convergene

Convergene 是一款本地优先的 AI 会议辅助工具。它从一句原始会议需求开始，帮助用户判断会议类型、补齐会前信息、生成 Brief 与讨论地图，并在会中提供聚焦提示、思考动作和主持人小抄。会议结束后，Convergene 会将用户确认的结论整理为 Markdown 和 Mermaid 报告。

Convergene 面向临时承担组织或主持职责、但缺少系统会议方法的个人用户。它不监听会议、不替用户宣布结论，也不要求团队迁移到一套新的协作系统；AI 只在用户明确触发时响应，最终产出始终由用户确认。

## 核心能力

- **模式化会议准备**：识别决策对齐、脑暴共创、复盘改进等会议剧本，并以通用讨论模式兜底。
- **Grill 式需求澄清**：围绕目标、参与角色、限制、信息缺口和最低产出逐轮追问，持续显示准备度。
- **Brief 与讨论地图**：把确认后的信息整理成可编辑 Brief，并生成从左到右的受控议题树。
- **会中主持辅助**：提供议题聚焦、节点出招、主持人小抄、随手记、计时和会议产出标记。
- **结构化会后报告**：根据用户确认的决策、候选创意、洞察和行动项生成 Markdown、Mermaid 与人时估算。
- **本地会议管理**：在浏览器中保存多场会议，支持完整 JSON 导出，同时保证同一时间只有一场会议处于进行中。
- **多语言支持**：完整支持简体中文、繁体中文和英文界面、AI 输出与报告。
- **无 Key 导览**：通过内存沙盒体验三种主要会议剧本，不调用模型，也不写入真实会议数据。

## 工作流程

1. 输入原始会议需求和基本信息，由 AI 推荐会议剧本。
2. 通过 Grill 补齐关键信息，确认 Brief 和初始讨论地图。
3. 开始会议，聚焦议题，并按需调用思考动作或记录随手记。
4. 标记正式会议产出，在散会检查中确认遗漏项。
5. 结束会议并导出结构化报告或完整本地数据。

## 数据与隐私

Convergene 将会议内容和模型配置分开处理：

| 数据                                 | 保存位置             | 说明                                                   |
| ------------------------------------ | -------------------- | ------------------------------------------------------ |
| 会议、Grill、Brief、节点、产出和报告 | 浏览器 IndexedDB     | 不上传到 Convergene 服务端，可导出或在本机清除         |
| Provider API Key 与模型配置          | Upstash Redis        | 只按匿名设备会话保存加密记录，不保存明文 Key           |
| AI 请求上下文                        | 用户选择的模型供应商 | 只在用户明确触发 AI 操作时发送完成任务所需的最小上下文 |

用户需要自行提供 StepFun 或硅基流动 API Key。Convergene 不提供公共模型 Key，也不会在供应商失败时自动把内容发送给另一家供应商。

## 技术栈

- Next.js 16 App Router、React 19、TypeScript
- Arco Design、CSS Modules、next-intl
- Dexie / IndexedDB、React Flow、Dagre
- Vercel AI SDK、Zod、StepFun、硅基流动
- Upstash Redis、Web Crypto API
- Vitest、React Testing Library、Playwright

更完整的系统边界和设计取舍见 [技术设计](./docs/technical-design.md) 与 [ADR](./docs/adr/)。

## 本地开发

### 环境要求

- Node.js 24（以 `.nvmrc` 为准）
- pnpm 10（以 `package.json` 中的 `packageManager` 为准）

### 启动项目

```bash
nvm use
pnpm install
cp .env.example .env.local
pnpm dev
```

打开 <http://localhost:3000>。无 Key 导览不需要额外服务；真实 AI 流程需要在 `.env.local` 中配置应用加密密钥和 Upstash Redis，并在应用内添加用户自己的 Provider API Key。

生成本地应用加密密钥：

```bash
openssl rand -base64 32
```

环境变量及其用途记录在 [`.env.example`](./.env.example) 中。请勿提交 `.env.local`、Redis 凭证或 Provider API Key。

### 常用命令

| 命令                | 用途                                   |
| ------------------- | -------------------------------------- |
| `pnpm dev`          | 启动本地开发服务器                     |
| `pnpm format:check` | 检查代码格式                           |
| `pnpm lint`         | 运行 ESLint                            |
| `pnpm typecheck`    | 生成 Next.js 路由类型并检查 TypeScript |
| `pnpm test`         | 运行单元与组件测试                     |
| `pnpm build`        | 创建生产构建                           |
| `pnpm test:e2e`     | 运行 Playwright 端到端测试             |

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)。提交前钩子会运行 staged 格式检查、类型检查和单元测试；完整交付检查见 [发布检查记录](./docs/release-readiness.md)。

## 文档导航

- [文档入口](./docs/README.md)：文档阅读顺序与事实源说明
- [产品规格](./docs/product-spec.md)：目标用户、完整流程与范围
- [领域模型](./docs/domain-model.md)：术语、状态机和数据不变量
- [技术设计](./docs/technical-design.md)：架构、存储、安全与 API 边界
- [AI 任务契约](./docs/ai-contracts.md)：模型输入、输出、约束与失败行为
- [验收测试](./docs/acceptance-tests.md)：功能完成的可执行标准
- [发布检查记录](./docs/release-readiness.md)：验证证据与已知限制

若文档之间存在冲突，以已接受的 ADR 和领域不变量为最高约束。

## 项目起源

Convergene 的首个可演示版本在 24 小时内完全通过 AI 完成，诞生于 [VibeHacks #5](https://vibecafe.ai/hacks/5/projects/cmtds0pkf00000akoxplgbxzr)。项目现已进入持续维护和演进阶段。
