# 安全策略 · Security Policy

## 支持的版本

| 版本 | 状态 |
| --- | --- |
| `main` 分支当前版本 | ✅ 接收安全修复 |
| 低于最新发布版 | ❌ 不单独接收修复，请先升级 |

本项目尚未发布正式版本，所有修复都进入 `main`。

## 报告安全漏洞

**请不要用公开 Issue 报告安全问题。** 公开 Issue 会让漏洞细节对所有人可见。

请通过以下方式私下联系维护者：

- 邮件：[412110785@qq.com](mailto:412110785@qq.com)
- GitHub 私密漏洞报告：仓库页面的 **Security** 选项卡 → **Report a vulnerability**

报告内容请包含：

1. 受影响版本（commit 或文件）
2. 复现步骤
3. 影响面与可能造成的后果
4. 你已知的缓解方式（如有）

**期望响应时间**：3 个工作日内确认收到，7 个工作日内给出初步判断与修复计划。修复完成后会在 `main` 打上补丁并公开披露（除非你希望保密更久）。

## 本项目的安全边界

本项目是**本机个人工具**，安全模型相对简单，但以下性质请务必了解。

### 只读

桥接进程只向 OpenCode 发起 **GET** 请求，且路径被 `ALLOWED_UPSTREAM` 白名单严格限制。它**不能**：

- 向 OpenCode 发送 prompt 或命令
- 通过 OpenCode 执行 shell、修改文件
- 读取 OpenCode 未记录过的任意文件

也就是说，即使桥接被完全控制，攻击者能拿到的上限也只是「读取你本机 OpenCode 已经记录下来的会话与工具调用内容」。

### 仅监听本机

桥接只绑定 `127.0.0.1`，不对局域网暴露。仓库内的启动器也只打开 `http://127.0.0.1:8773`。

若你自行修改 `CONFIG.host` 绑定到 `0.0.0.0` 并把端口暴露到网络，**请自行加装访问控制**——本项目不提供鉴权层，任何能访问该端口的人都可以读取你的会话内容。

### 凭据

OpenCode 的服务密码只存在于桥接进程内存中：

- 从 `~/.local/state/opencode/service.json` 读取
- 只用于向上游发起认证请求
- 不下发浏览器、不落盘、不写日志

仓库中不包含任何凭据、令牌或真实运行数据。

### 页面防护

- 严格 CSP：`default-src 'self'`，内联脚本与样式使用一次性 nonce，`connect-src 'self'`
- `Origin` 校验：只接受本机地址发起的请求
- `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`
- 页面不加载任何外部资源，不发任何第三方请求
- 所有来自 OpenCode 的文本在渲染前转义（含引号），高亮函数先分词再逐段转义

### 数据留存

桥接**不写磁盘**：所有聚合结果只存在于内存缓存，进程退出即消失。唯一写入的是浏览器的 `localStorage`（仅主题选择），可用浏览器清除。

### 依赖

- 运行时依赖只有 Node.js 与 OpenCode，**不引入任何 npm 包**，也就不存在供应链依赖风险
- 内嵌字体为 SIL OFL 1.1（Archivo、JetBrains Mono），许可允许随软件分发与再分发

## 使用者自查清单

- [ ] 未把 `CONFIG.host` 改成对外地址
- [ ] 端口 8773 未被转发到公网（路由器 / 隧道 / 端口映射）
- [ ] 未把 `service.json` 复制进仓库或提交到任何远程
- [ ] 分享大屏截图前确认不含本地目录名、命令与会话标题

## 致谢

感谢你负责任地披露问题。发现并报告有效漏洞的贡献者，将在修复记录中致谢（除非你希望匿名）。

---

## English

### Supported versions

| Version | Status |
| --- | --- |
| Current version on `main` | ✅ receives security fixes |
| Anything older than the latest release | ❌ not patched separately; upgrade first |

The project has not published a formal release yet; all fixes land on `main`.

### Reporting a vulnerability

**Do not open a public issue for a security problem.** A public issue exposes the details to everyone.

Report privately to the maintainer:

- Email: [412110785@qq.com](mailto:412110785@qq.com)
- GitHub private advisory: the repository's **Security** tab → **Report a vulnerability**

Please include:

1. The affected version (commit or file)
2. Steps to reproduce
3. Impact and possible consequences
4. Any mitigation you already know of

**Expected response time**: acknowledgement within 3 business days, initial assessment and a fix plan within 7. Once fixed, the patch lands on `main` and the issue is disclosed publicly unless you ask for a longer embargo.

### Security boundary

This is a **local personal tool**, so the security model is deliberately small. The following properties matter:

**Read-only.** The bridge sends only **GET** requests to OpenCode, and the paths are restricted by the `ALLOWED_UPSTREAM` allowlist. It **cannot**:

- send prompts or commands to OpenCode
- execute a shell or modify files through OpenCode
- read arbitrary files that OpenCode has never recorded

In other words, even a fully compromised bridge can at most read the sessions and tool-call content your own OpenCode instance has already stored.

**Loopback only.** The bridge binds to `127.0.0.1` and is not exposed to the LAN; the bundled launcher only opens `http://127.0.0.1:8773`.

If you change `CONFIG.host` to `0.0.0.0` and expose the port, **add access control yourself** — the project ships no authentication layer, and anyone who can reach the port can read your session content.

**Credentials.** The OpenCode service password lives only in the bridge process memory:

- read from `~/.local/state/opencode/service.json`
- used only to authenticate upstream requests
- never sent to the browser, never written to disk, never logged

The repository contains no credentials, tokens or captured runtime data.

**Page hardening.** Strict CSP (`default-src 'self'`, one-time nonces for inline script and style, `connect-src 'self'`); `Origin` validation limited to loopback; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`; no external resources and no third-party requests; every string coming from OpenCode is escaped before rendering (quotes included), and the highlighter tokenises first and escapes each token.

**Data retention.** The bridge writes nothing to disk: aggregates live in an in-memory cache and vanish when the process exits. The only client-side write is `localStorage` (theme choice only), which you can clear from the browser.

**Dependencies.** The only runtime dependencies are Node.js and OpenCode — no npm package is introduced, so there is no supply-chain surface from packages. The embedded fonts are SIL OFL 1.1 (Archivo, JetBrains Mono), which permits redistribution.

### Self-check list

- [ ] `CONFIG.host` was not changed to a public address
- [ ] Port 8773 is not forwarded to the internet (router / tunnel / port mapping)
- [ ] `service.json` was never copied into the repository or pushed anywhere
- [ ] Screenshots are checked for local paths, commands and session titles before sharing

### Acknowledgements

Thank you for reporting responsibly. Contributors who report a valid vulnerability are credited in the fix notes unless they prefer to stay anonymous.
