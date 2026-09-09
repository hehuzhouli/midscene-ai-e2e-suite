# midscene-ai-e2e-suite

> 基于 [@midscene/web](https://midscenejs.com/) 官方 SDK 的 AI 视觉 E2E 自动化验证 Demo（上层业务封装）。

本项目是一个**上层业务 Demo**，用于演示如何借助 Midscene 提供的多模态视觉模型能力，完成“自然语言驱动”的 Web 端到端自动化验证。**本项目绝不修改 Midscene 的任何底层源码**，全部通过 npm 发布的 `@midscene/web` 对外公开 API 进行上层封装与调用。

---

## 项目简介

传统 UI 自动化严重依赖 DOM 选择器，界面一旦变更脚本即失效。Midscene 采用纯视觉识别架构，由多模态视觉模型（VLM）直接“看”屏幕截图来理解界面、规划操作并定位元素，让自动化脚本以自然语言描述意图即可完成执行。

本 Demo 在此基础上做了一层轻量封装：

- 统一的 `runAiActionWithRetry` 工具函数，处理网络与 AI 识别异常、自动重试与失败截图归档。
- 顺序执行若干演示用例，统计成功 / 失败计数并打印汇总。
- 复用 Midscene 内置的报告生成能力，输出可视化 HTML 报告。

---

## 实现能力

| 能力 | 说明 |
| --- | --- |
| AI 视觉自动化 | 通过 `PlaywrightAgent` + 自然语言指令完成页面操作，无需编写选择器 |
| 异常重试 | `runAiActionWithRetry` 最大重试 2 次，捕获网络与 AI 识别异常 |
| 失败截图 | 异常时自动保存页面截图到 `./output/snap`，便于排查 |
| 用例隔离 | 单个用例失败不会终止整体程序，继续执行后续用例 |
| 执行 dump 收集 | 通过 `agent.addDumpUpdateListener` 钩子实时收集执行 dump |
| HTML 报告 | 复用 Midscene 内置报告生成逻辑，输出到 `./output/report`，**不自行渲染** |
| 结果汇总 | 控制台打印成功 / 失败计数与明细 |

---

## 技术栈

- **自动化引擎**：[Playwright](https://playwright.dev/)（Chromium）
- **AI 视觉 Agent**：[`@midscene/web`](https://www.npmjs.com/package/@midscene/web) 官方 SDK（仅调用公开 API，不修改源码）
- **运行时**：Node.js + [tsx](https://github.com/privatenumber/tsx)（直接运行 TypeScript）
- **语言**：TypeScript（`strict` 严格模式，`ESNext` 模块）
- **环境变量**：[dotenv](https://github.com/motdotla/dotenv)

---

## 运行步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 安装浏览器内核

```bash
npx playwright install chromium
```

### 3. 配置多模态视觉模型

复制环境变量模板并填入你的模型配置：

```bash
cp .env.example .env
```

编辑 `.env`，填入 `MIDSCENE_MODEL_BASE_URL`、`MIDSCENE_MODEL_API_KEY`、`MIDSCENE_MODEL_NAME`、`MIDSCENE_MODEL_FAMILY` 四个必填项。模板中已附带豆包 Seed / 通义千问 VL / DeepSeek VL / Gemini / GPT-5 等家族的示例。

### 4. 启动

```bash
npm run start
```

执行结束后：

- 控制台打印用例成功 / 失败汇总。
- `./output/report` 下生成 Midscene 内置 HTML 报告，浏览器打开即可查看截图、操作过程与断言结果。
- 失败用例的截图归档在 `./output/snap`。

---

## 注意事项

1. **不修改 Midscene 源码**：本 Demo 仅为上层封装，所有能力均通过 `@midscene/web` 对外公开 API（`PlaywrightAgent`、`aiAct`、`aiAssert`、`aiWaitFor`、`addDumpUpdateListener` 等）实现，HTML 报告也复用 Midscene 内置生成逻辑，不自行渲染。
2. **`.env` 切勿提交 Git**：`.env` 中包含模型 API Key，已被 `.gitignore` 忽略；仓库只提供 `.env.example` 模板，不含任何真实密钥。
3. **必须使用多模态 VL 视觉模型**：Midscene 依赖视觉模型“看”截图来理解界面并定位元素，**纯文本大模型无法运行**。请确保 `MIDSCENE_MODEL_FAMILY` 与所选模型一致（如 `doubao-seed`、`qwen3`、`deepseek` 等）。
4. **云端环境限制**：Trae 等云端沙箱可能缺少系统浏览器依赖，导致 Chromium 启动报错。这属于环境限制，代码逻辑保证完整即可，无需强行在云端跑通浏览器；在具备完整桌面/浏览器依赖的本地环境运行即可。
5. **演示用例**：内置两个演示用例——① 打开百度搜索「测试自动化」；② 访问公开表单演示页面并填写表单。可按需在 `src/main.ts` 中扩展。

---

## 目录结构

```
midscene-ai-e2e-suite
├── src/
│   └── main.ts          # 入口：加载环境变量、重试封装、用例编排、报告输出
├── .env.example         # 多模态 VL 视觉模型环境变量模板
├── .gitignore
├── package.json
├── tsconfig.json        # ESNext 模块 + strict 严格模式
└── README.md
```

运行后生成：

```
output/
├── report/              # Midscene 内置 HTML 报告（自动生成）
├── snap/                # 失败用例截图归档
└── cache/               # 运行缓存（Midscene 内置）
```
