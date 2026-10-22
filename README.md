<div align="center">

# OpenCode OPS 大屏

**简体中文** · [English](./README.en.md)

把 **OpenCode** 的真实运行数据接进一块 Canvas 大屏：会话、工具调用、步骤、token 与费用，实时滚动。

桥接进程只读本机 OpenCode 服务，把数据聚合成快照推给页面；页面本身是**单文件、零构建、零外部请求**。

[![Stars](https://img.shields.io/github/stars/Yiyazadxr/opencode-OPS-dash?style=flat-square)](https://github.com/Yiyazadxr/opencode-OPS-dash/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-3fb950?style=flat-square)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-5FA04E?style=flat-square)](https://nodejs.org)
[![Offline 100%](https://img.shields.io/badge/runtime-offline%20100%25-3fb950?style=flat-square)](#技术栈)
[![Zero runtime deps](https://img.shields.io/badge/runtime_deps-0-brightgreen?style=flat-square)](#技术栈)
[![Read-only](https://img.shields.io/badge/OpenCode-access%20read--only-3fb950?style=flat-square)](#安全模型)

[提交 Issue](https://github.com/Yiyazadxr/opencode-OPS-dash/issues) · [贡献指南](./CONTRIBUTING.md) · [行为准则](./CODE_OF_CONDUCT.md) · [安全策略](./SECURITY.md) · [许可](#许可)

</div>

---

## 功能特性

- **真实指标** — 滚动 24 小时窗口内的工具调用、智能体、项目、步骤、成功与失败数，全部来自 OpenCode 的统计接口，与命令行 `opencode stats` 同源

- **任务流** — 每一次真实工具调用（`shell` / `edit` / `read` / `grep` / `write` / `webfetch` …）与 assistant 步骤，按发生顺序实时上屏

- **调度飞轮** — 三个最活跃的真实项目落在汇聚节点上，副标签是真实的调用数与成功率；连线密度随实际调用量伸缩，环带数据块与真实工具调用一一对应（与装饰块交错）

- **Agent 调度面板** — 已配置的 agent 及其当前会话、项目与工具状态；不足 12 个位置用同款虚拟角色补齐

- **会话面板** — 会话标题、项目、状态、调用数与最后活动时间，点击展开详情

- **工作台** — 打字机逐字播放最近几次真实写入 / 编辑的文件内容，播完自动切下一段

- **详情抽屉** — 点击任务流、会话或工作台条目，查看该次工具调用的输入、输出、文件内容与会话 prompt

- **断线不空屏** — OpenCode 不可达时保留最后一次快照并标记过期；完全没连上时自动切到模拟数据，大屏永远有画面

- **零外部请求** — 字体 base64 内嵌在页面里，运行时不访问任何 CDN，可完全离线

---

## 运行

### Windows

```bat
start-dashboard.cmd
```

启动器会结束上一个实例、启动桥接、打开浏览器并停在 `http://127.0.0.1:8773`；关掉那个窗口即停止。

### 任意平台

```bash
node server.mjs            # 加 --open 自动打开浏览器
```

随后访问 <http://127.0.0.1:8773>。

### 前置条件

| 项目 | 要求 |
| --- | --- |
| OpenCode | v2.x，后台服务已启动（`opencode service status` 能返回地址） |
| Node.js | 20 或更高（开发与测试基于 24） |
| 浏览器 | 支持 Shadow DOM 与 Canvas 2D 的现代 Chrome / Edge / Safari / Firefox |
| 屏幕 | 建议 1920×1080 及以上 |

---

## 交互

| 操作 | 效果 |
| --- | --- |
| 点右上「纸面 / 粒子」 | 在纸面工程风与夜间荧光绿之间切换（默认跟随系统深浅色） |
| 点右上「全屏」 | 进入 / 退出全屏 |
| 点任务流条目 | 右侧抽屉打开该次工具调用的详情 |
| 点 Agent 行 / 会话行 | 右侧抽屉打开对应会话的详情 |
| 点工作台代码区 | 抽屉打开当前这一段文件内容 |
| 悬停飞轮节点 | 显示该项目的目录、调用数与成功率 |
| 点标题栏 | 切换主题（选择写入 localStorage） |

---

## 技术栈

- **页面**：原生 JavaScript + CSS + Canvas 2D，无框架、无构建、无模块化；主题跑在独立 Shadow DOM 中，与外壳互不干扰

- **桥接**：Node.js（`node:http` + 内置 `fetch`），**零 npm 依赖**；凭据只存在服务端进程内

- **通信**：同源 HTTP（`/snapshot`、`/detail`）+ SSE（`/events`）实时推送；事件只作为「该刷新了」的触发器，页面始终以快照为准

- **字体**：Archivo（标题展示体）+ JetBrains Mono（数据等宽体），均为 woff2 base64 内嵌；中文使用系统字体，不内嵌

---

## 目录结构

```
opencode-OPS-dash/
├── opencode-dash.html         单文件大屏页面（结构 + 样式 + 脚本，含内嵌字体）
├── server.mjs                 本地只读桥接（配置、采集、聚合、HTTP 与 SSE）
├── start-dashboard.cmd        Windows 启动器（ASCII-only，代码页安全）
├── scripts/                   文档链接 / 页面与启动器自检（CI 用，零依赖）
├── .github/ISSUE_TEMPLATE/    Issue 表单（Bug 报告 / 功能建议）
├── .github/workflows/         CI（桥接语法、页面卫生、文档链接）
└── AGENTS.md · CODE_OF_CONDUCT.md · CONTRIBUTING.md · LICENSE · NOTICE · README.md · README.en.md · SECURITY.md
```

各文件职责、改动约束与验证方式见 [AGENTS.md](./AGENTS.md)。

---

## 数据来源

| 大屏位置 | 数据来源 |
| --- | --- |
| `TASKS` 工具调用 | `stats.tools.totals.calls` |
| `AGENTS` 智能体 | `GET /api/agent`（可见 agent） |
| `PROJECTS` 项目 | 窗口内有活动的项目，**按目录聚合** |
| `STEPS` 步骤 | `stats.steps` |
| `SUCCEEDED` 成功 | `stats.tools.totals.succeeded` |
| `FAILED` 失败 | `stats.tools.totals.failed` + `unfinished` |
| 任务流 | 工具调用 + assistant 步骤，最新在前 |
| 飞轮节点 | 最活跃的三个项目，标注真实调用数与成功率 |
| 环带数据块 | 每次真实工具调用一块，与随机装饰块交错 |
| Agent 面板 | 已配置 agent + 其当前会话与项目 |
| 会话面板 | 会话标题、项目、状态、调用数、最后活动 |
| 工作台 | 最近 8 次写入 / 编辑，轮播播放 |
| HUD | 实时工具成功率 |
| 页脚 | token 用量、缓存命中与费用估算 |

桥接只向上游请求以下只读路由，不存在其他出口：

```
/api/info
/api/agent
/api/project
/api/session
/api/session/active
/api/session/{sessionID}/message
/api/experimental/session/stats?tools=detail&from={unixMillis}
/api/event
```

> 同一目录可能对应多个 OpenCode project ID（工作树、沙箱实例），桥接按
> `location.directory` 聚合，避免同一个项目被重复计数。

---

## 安全模型

- **只读**：桥接不会向 OpenCode 写入任何内容，不能代发 prompt、执行命令或改文件；上游调用全部限制在上表的 GET 白名单内

- **仅本机**：只监听 `127.0.0.1`，不对外暴露；不写磁盘，缓存只在内存

- **凭据不出进程**：OpenCode 的服务密码从 `~/.local/state/opencode/service.json` 读取，只在桥接内部用于上游请求，不下发浏览器、不写日志

- **不读文件**：`/detail` 只返回 OpenCode 消息里已有的内容，不提供任意文件读取能力

- **页面防护**：随页面下发严格 CSP（`default-src 'self'`、内联脚本/样式走 nonce）、`Origin` 校验、`nosniff`、`no-referrer`

- **不外传**：页面不加载任何外部资源，不发任何第三方请求

---

## 配置

全部集中在 `server.mjs` 顶部的 `CONFIG`：

```js
const CONFIG = {
  port: 8773,              // 桥接端口
  host: '127.0.0.1',       // 监听地址
  windowHours: 24,         // 统计窗口（滚动小时数）
  fillDays: 7,             // 飞轮节点补齐时的回溯天数
  refreshMs: 5000,         // 页面刷新间隔
  excludedProjects: [],    // 需要隐藏的项目目录片段
  showCost: true,          // 是否显示费用
  limits: { prompt: 4096, command: 2048, output: 8192, code: 16384, title: 40 },
};
```

改完重启桥接即可生效。

---

## 许可

代码与第三方组件分开授权，详见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。

- **源代码**：[MIT](./LICENSE) © 2026-present Yiyazadxr

- **改编自**：[agent-display](https://github.com/cyberdaddyleo/agent-display)（MIT，© cyberdaddyleo）—— OPS 主题视觉

- **内嵌字体**：Archivo、JetBrains Mono（SIL OFL 1.1）

- **运行时依赖**：OpenCode（MIT）、Node.js（MIT），均不包含在本仓库中

- **品牌名称与标识**：不在开源许可范围内，不得暗示背书

## 参与贡献

欢迎提交 Issue 与 Pull Request。改动约束、提交流程与验证清单见 [CONTRIBUTING.md](./CONTRIBUTING.md)，社区行为准则见 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)，安全问题请按 [SECURITY.md](./SECURITY.md) 私下报告。

## 致谢

- [agent-display](https://github.com/cyberdaddyleo/agent-display) —— OPS 主题视觉与交互设计

- [OpenCode](https://opencode.ai) —— 数据来源

## 联系

授权事宜或其他问题请联系：[412110785@qq.com](mailto:412110785@qq.com) · [GitHub](https://github.com/Yiyazadxr)
