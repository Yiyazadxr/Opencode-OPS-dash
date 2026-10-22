# 贡献指南 · Contributing

## 中文

本仓库把 OpenCode 的真实运行数据接到一块 Canvas 大屏上。开始之前请先读 [AGENTS.md](./AGENTS.md)——它记录了文件职责与不可动摇的约束。

### 开始之前

- 需要 Node.js ≥ 20；不需要 `npm install`，仓库零依赖
- 先让 OpenCode 服务跑起来，再双击 `start-dashboard.cmd`（或 `node server.mjs`），打开 `http://127.0.0.1:8773/`
- 没有 OpenCode 也能开发页面：桥接连不上时会切到模拟数据

### 硬约束（改动不得违反）

#### 1. 桥接必须保持只读

- `server.mjs` 只能向上游发 **GET** 请求，且路径必须在 `ALLOWED_UPSTREAM` 白名单内
- 不得新增任何写入型上游接口（prompt、命令执行、文件写入、会话修改）
- 不得引入 `/api/fs` 一类的文件读取能力；`/detail` 只能返回 OpenCode 消息里已有的内容
- 新增上游调用时，先在 `ALLOWED_UPSTREAM` 里加正则，并说明为什么需要它

#### 2. 凭据不得离开服务端进程

- OpenCode 的服务密码只从 `~/.local/state/opencode/service.json` 读取
- 不得把密码、token、完整 Authorization 头写进页面、快照、日志或错误信息
- 任何新增的日志输出都要确认不含凭据

#### 3. 页面不引入外部请求

- 不得引用 CDN、外部字体、外部脚本或图片链接
- 新增字体必须以 woff2 base64 内嵌进 `opencode-dash.html`，并在 `NOTICE` 登记许可
- 页面所有资源必须能在完全离线的环境下加载

#### 4. 渲染必须转义

- 任何来自 OpenCode 的文本（标题、命令、文件内容、错误信息）渲染前必须经过 `esc()`
- **禁止**把未经转义的文本直接拼进 HTML；高亮函数必须「先分词、再逐段转义」
- 引号必须一并转义（`"` → `&quot;`），否则源码里的 `class="str"` 会被浏览器当成属性解析，破坏标签结构

#### 5. 页面不得在无数据时崩溃

- 任何数组、字段缺失都要有兜底，页面不允许白屏
- OpenCode 不可达时：保留最后快照 → 标记过期 → 完全无数据时切模拟数据
- 绘制循环里的异常必须被捕获，不能中断主循环

#### 6. Windows 启动器保持 ASCII

- `start-dashboard.cmd` 内**只允许 ASCII 字符**：`cmd.exe` 按系统代码页（中文系统为 936）解码批处理文件，任何非 ASCII 字符都可能显示为乱码
- 中文输出一律由 Node 打印，且须在 `chcp 65001` 之后

#### 7. 许可与署名

- 改编或引入第三方代码、字体、数据时，同步更新 `NOTICE`
- 第三方字体按 SIL OFL 1.1 登记，注明作者与项目地址

### 提交前检查

```bash
node --check server.mjs        # 桥接语法
node scripts/check-links.mjs   # README / 文档内的本地链接与标签一致性
```

页面侧请逐条走完下面的验证清单（每条都要在**真实浏览器**里验过，不接受只跑脚本）：

| # | 检查项 | 期望 |
| --- | --- | --- |
| 1 | 启动器双击 | 自动结束旧实例、启动桥接、打开浏览器；控制台中文不乱码 |
| 2 | 端口占用 | 明确报错退出；旧实例因 TIME_WAIT 残留时自动重试并打印提示 |
| 3 | 顶部指标 | 与 `opencode api get /api/experimental/session/stats?tools=detail&from=<24h毫秒>` 逐项一致 |
| 4 | 任务流 | 真实工具调用按时间倒序上屏，状态（完成 / 失败 / 进行中）正确 |
| 5 | 飞轮节点 | 显示真实项目名，副标签的调用数与成功率对得上 |
| 6 | Agent 面板 | 真实 agent 挂当前会话；虚拟角色与真实行同款样式 |
| 7 | 会话面板 | 标题、项目、状态、调用数、最后活动时间正确；点击开抽屉 |
| 8 | 工作台 | 打字机逐字播放真实文件内容；播完自动切下一段 |
| 9 | 抽屉 | 点任务流 / 会话 / 工作台都能打开；内容与 OpenCode 消息一致 |
| 10 | 抽屉竞态 | 加载完成前关闭抽屉，数据回来后**不得**重新弹出 |
| 11 | 动画 | 飞轮在转（连续两帧截图应不同），光标始终是最后一行可见行 |
| 12 | 断线 | 停掉 OpenCode → 保留快照并标记过期；重启 → 自动恢复 |
| 13 | 兜底 | 从未连上 OpenCode → 显示模拟数据且界面有「模拟数据」标注 |
| 14 | 控制台 | 无新增 error / warning |
| 15 | 安全 | 页面源码与快照响应中搜不到密码；`/detail` 读不到未打开过的文件 |

改动 `opencode-dash.html` 里的内联脚本后，额外抽出脚本做一次语法检查：

```bash
node --check page-script.js
```

### 报告问题

用 [Issue 表单](https://github.com/Yiyazadxr/opencode-OPS-dash/issues/new/choose) 提交。Bug 请附：OpenCode 版本、Node 版本、系统、启动方式（启动器或 `node server.mjs`）、数据状态（真实 / 过期 / 模拟）、复现步骤、期望与实际表现。**不要粘贴凭据或完整会话内容**。

提交前先搜索是否已有同类 Issue。

### 安全漏洞

发现安全问题请**不要**开公开 Issue——按 [SECURITY.md](./SECURITY.md) 的渠道私下报告。

### 提交 Pull Request

- 开分支：`feat/<简述>` / `fix/<简述>` / `docs/<简述>`
- 小而聚焦：一个 PR 只做一件事，正文说明「为什么」
- 自测：按上面的验证清单走一遍，把结果写进 PR 描述；没验过的环境就写没验过
- 提交信息首行用祈使句描述改动，正文写动机与影响面：

```
<type>(<scope>): <subject>

<正文：为什么改、怎么改、有什么影响>

<footer: Closes #123 / BREAKING CHANGE: ...>
```

`type` 取值：`feat` / `fix` / `docs` / `refactor` / `perf` / `chore` / `test`。大规模重构请先开 Issue 讨论。

### 许可

代码按 [MIT](./LICENSE) 授权。提交即表示你同意自己的贡献以同一许可发布；第三方内容与字体的许可见 [NOTICE](./NOTICE)。参与即表示同意 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## English

This repository wires real OpenCode activity into a Canvas dashboard. Read [AGENTS.md](./AGENTS.md) first — it maps the files and lists the constraints that cannot be broken.

### Before you start

- Node.js ≥ 20 is required; there is no `npm install` because the repository has zero dependencies
- Start the OpenCode service, then run `start-dashboard.cmd` (or `node server.mjs`) and open `http://127.0.0.1:8773/`
- You can work on the page without OpenCode: when the bridge cannot reach it, the page falls back to simulated data

### Hard constraints

#### 1. The bridge stays read-only

- `server.mjs` may only issue **GET** requests upstream, and every path must be allowed by `ALLOWED_UPSTREAM`
- Never add a write-capable upstream endpoint (prompts, command execution, file writes, session mutation)
- Never add file-reading capabilities such as `/api/fs`; `/detail` may only return content already present in an OpenCode message
- When adding an upstream call, add its pattern to `ALLOWED_UPSTREAM` and explain why it is needed

#### 2. Credentials never leave the server process

- The OpenCode service password is read only from `~/.local/state/opencode/service.json`
- Never write the password, tokens or a full Authorization header into the page, snapshots, logs or error messages
- Re-check every new log line for credentials

#### 3. The page makes no external requests

- No CDN, external font, external script or remote image
- A new font must be embedded as woff2 base64 inside `opencode-dash.html` and registered in `NOTICE`
- Every asset must load in a fully offline environment

#### 4. Escape before rendering

- Any text coming from OpenCode (titles, commands, file contents, error messages) must pass through `esc()` before rendering
- **Never** concatenate unescaped text into HTML; the highlighter must tokenise first and escape each token
- Escape quotes as well (`"` → `&quot;`), otherwise `class="str"` inside a code sample is parsed as an attribute and breaks the markup

#### 5. The page never crashes on missing data

- Every array and field needs a fallback; a blank page is a bug
- When OpenCode is unreachable: keep the last snapshot → mark it stale → fall back to simulated data only when nothing was ever received
- Exceptions inside the draw loop must be caught and must not stop the loop

#### 6. The Windows launcher stays ASCII

- `start-dashboard.cmd` may contain **ASCII only**: `cmd.exe` decodes batch files using the system code page (936 on Chinese Windows), so non-ASCII characters can render as mojibake
- All Chinese output is printed by Node, after `chcp 65001`

#### 7. Licensing and attribution

- Update `NOTICE` whenever third-party code, fonts or data are adapted or added
- Third-party fonts are registered under SIL OFL 1.1 with author and project URL

### Checks

```bash
node --check server.mjs        # bridge syntax
node scripts/check-links.mjs   # local links and link/target consistency in docs
```

For the page, walk the checklist below in a **real browser** (running the scripts alone is not enough):

| # | Check | Expected |
| --- | --- | --- |
| 1 | Double-click the launcher | Old instance closed, bridge started, browser opened; Chinese console output is readable |
| 2 | Port already in use | Clear error and exit; automatic retry with a notice when the old instance is stuck in TIME_WAIT |
| 3 | Top metrics | Match `opencode api get /api/experimental/session/stats?tools=detail&from=<24h in ms>` item by item |
| 4 | Task feed | Real tool calls appear newest first with the correct state (done / failed / running) |
| 5 | Flywheel nodes | Real project names; the call count and success rate in the sub-label match |
| 6 | Agent panel | Real agents attached to the current session; virtual rows share the same style |
| 7 | Session panel | Title, project, state, call count and last activity are correct; clicking opens the drawer |
| 8 | Workspace | Typewriter plays real file content and advances to the next entry when done |
| 9 | Drawer | Opens from the task feed, session panel and workspace; content matches the OpenCode message |
| 10 | Drawer race | Closing before load completes must **not** pop the drawer back open |
| 11 | Animation | The flywheel spins (two consecutive frames differ) and the cursor stays on the last visible line |
| 12 | Disconnect | Stop OpenCode → snapshot kept and marked stale; restart → recovers automatically |
| 13 | Fallback | Never connected → simulated data shown, with the "simulated" badge visible |
| 14 | Console | No new errors or warnings |
| 15 | Security | No password in page source or snapshot responses; `/detail` cannot read a file never opened |

After changing the inline script in `opencode-dash.html`, extract it and run a syntax check:

```bash
node --check page-script.js
```

### Reporting issues

Use the [issue forms](https://github.com/Yiyazadxr/opencode-OPS-dash/issues/new/choose). For bugs include: OpenCode version, Node version, OS, how you started it (launcher or `node server.mjs`), data state (live / stale / simulated), steps to reproduce, expected and actual behaviour. **Do not paste credentials or full session content.**

Search existing issues first.

### Security

**Do not** open a public issue for a security problem — report it privately as described in [SECURITY.md](./SECURITY.md).

### Pull requests

- Branch as `feat/<slug>` / `fix/<slug>` / `docs/<slug>`
- Keep it small and single-purpose; explain **why** in the description
- Run the checklist above and paste the result into the PR description; state which environments you actually tested
- Use an imperative subject line, with motivation and impact in the body:

```
<type>(<scope>): <subject>

<why, how, impact>

<footer: Closes #123 / BREAKING CHANGE: ...>
```

`type` is one of `feat` / `fix` / `docs` / `refactor` / `perf` / `chore` / `test`. Discuss large refactors in an issue first.

### License

Code is released under the [MIT](./LICENSE) licence. By submitting a contribution you agree to license it under the same terms; third-party content and fonts are listed in [NOTICE](./NOTICE). Participation implies agreement with [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
