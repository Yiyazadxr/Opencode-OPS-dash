# AGENTS.md

面向 AI 助手（以及接手维护的人）的仓库地图：每个文件负责什么、改动时必须守住什么、怎么验证。

## 仓库一览

| 文件 | 职责 | 关键约束 |
| --- | --- | --- |
| `opencode-dash.html` | 大屏页面：结构 + 样式 + 脚本，含内嵌字体 | 单文件、零外部请求、所有文本必须转义 |
| `server.mjs` | 本地只读桥接：配置、采集、聚合、HTTP + SSE | 只读、白名单、凭据不出进程 |
| `start-dashboard.cmd` | Windows 启动器 | 只允许 ASCII 字符 |
| `scripts/check-links.mjs` | 文档链接自检（存在性 + 标签/目标一致性） | 零依赖，CI 会跑 |
| `scripts/check-page.mjs` | 启动器 ASCII、页面零外部请求、无 `package.json` | 零依赖，CI 会跑 |
| `.github/` | Issue 表单（`.yml`）、PR 模板、CI | 表单字段与 README 的「运行 / 交互」保持一致 |
| `README.md` / `README.en.md` | 双语说明 | 与实现保持一致 |
| `NOTICE` | 第三方组件与改编关系 | 引入任何第三方内容都要同步 |
| `CONTRIBUTING.md` | 改动约束、验证清单、提交流程 | 硬性约束，勿删减 |
| `CODE_OF_CONDUCT.md` | 行为准则（Contributor Covenant 2.1） | 勿改写 |
| `SECURITY.md` | 漏洞报告渠道与安全边界（中英双语） | 与实现同步 |

## 架构

```
OpenCode server (127.0.0.1:45278)
        │  Basic auth，密码仅在 server.mjs 进程内
        │  GET 白名单：/api/info /api/agent /api/project /api/session
        │               /api/session/active /api/session/{id}/message
        │               /api/experimental/session/stats /api/event
        ▼
server.mjs  ── /snapshot  聚合快照（指标 / 项目 / 会话 / 任务流 / 工作台队列）
             ── /detail    单条工具调用或步骤（仅消息已有内容）
             ── /events    SSE 代理（只放行 session.tool.* / session.step.* 等）
             ── /health    桥接状态 + 上游版本
        ▼
opencode-dash.html（同源，127.0.0.1:8773）
        │  轮询 5s 拉快照 + SSE 事件触发去抖刷新
        ▼
      Canvas 大屏
```

## server.mjs 分区

| 段落 | 内容 | 改动注意 |
| --- | --- | --- |
| 1 | `CONFIG` | 所有可调参数集中在此；改完重启生效 |
| 2 | 工具函数 | `clip` / `shortPath` / `fmtTokens` / `relTime` 等纯函数 |
| 3 | OpenCode 连接 | `readService` 读凭据、`ocGet` 白名单请求、401 重读凭据重试 |
| 4 | 缓存 | `cached(key, ttl, producer)`，全部只在内存 |
| 5 | 数据采集 | `globalStats` / `projectStats` / `listProjects` / `listAgents` / `listSessions` / `activeSessions` / `sessionMessages` / `extractEvents` |
| 6 | 快照组装 | `buildSnapshot` —— 唯一产出页面数据的函数；`lastGoodSnapshot` 用于断线兜底 |
| 7 | 详情 | `buildDetail(sessionID, partID, metaOnly)` —— 只取消息里已有的内容 |
| 8 | HTTP 服务 | 路由、CSP、SSE 代理、Origin 校验 |
| 9 | 启动 | `ensureUtf8Console`（控制台编码）、EADDRINUSE 重试、`onListening` |

## 页面分区

| 段落 | 内容 | 改动注意 |
| --- | --- | --- |
| 1 | `DATA` 与模拟数据兜底 | 模拟数据只在「完全没有真实数据」时启用 |
| 2 | 工具与主题变量 | `T` 从 CSS 变量读色；`FONT` 是等宽字体栈 |
| 3 | 真实数据接入 | `loadSnapshot` / `updateBadge` / `applyNodes` |
| 4 | 面板渲染 | `renderStats` / `renderFeed` / `renderAgents` / `renderSessions` / `renderWorkspace` / 抽屉 / 打字机 |
| 5 | 主舞台 | Canvas 绘制：飞轮、环带、节点标签、粒子 |
| 6 | 主循环 | `frame()` 走 rAF，另有 33ms 定时器兜底（无头 / 后台标签页） |
| 7 | 外壳 | Shadow DOM 挂载 |

## 不可动摇的约束

1. **只读**：`server.mjs` 不得引入任何写入型上游接口，也不得引入 `/api/fs`。
2. **凭据不出进程**：密码不得出现在页面、快照、日志、错误信息中。
3. **零外部请求**：页面不得引用任何外部 URL；新字体必须内嵌并登记 `NOTICE`。
4. **渲染前转义**：`esc()` 必须连引号一起转义；高亮必须先分词再逐段转义，不得把源码当 HTML 拼接。
5. **不空屏**：无数据时走「最后快照 → 过期标记 → 模拟数据」三级兜底。
6. **启动器纯 ASCII**：`cmd.exe` 按系统代码页解码批处理文件，非 ASCII 会乱码。
7. **无 npm 依赖**：保持零第三方包。

## 已知实现细节（改动时别踩）

- `stats` 接口的 `from` 参数**只接受毫秒时间戳字符串**，ISO 日期会 500
- 同一目录可能对应多个 project ID，统计须按 `location.directory` 聚合
- `/api/agent` 在服务刚启动的极短时间内可能返回空列表，桥接侧有空结果重试
- 抽屉用 `drawerToken` 令牌让在途请求失效，避免「关闭后又被数据弹开」
- 打字机用 `scrollTop` 钉底实现连续滚动，光标恒为最后一行可见行
- 页面内联脚本受 CSP 约束，**不能写内联 `style` 属性**，宽度等用 CSSOM（`el.style.width = …`）设置
- `start-dashboard.cmd` 只结束占用端口的 **node** 进程，不误伤其他程序
- 端口被 TIME_WAIT 残留占用时，桥接每 2 秒自动重试（最多 60 次）
- `buildSnapshot()` 带 1.5s 单飞缓存，重复请求不会重复采集；改采集逻辑请改 `buildSnapshotUncached()`
- SSE 代理**不能**用超时信号中止上游事件流，只能用可控 `AbortController`；断线后 2 秒退避重连，恢复时发 `bridge.ready`
- 缓存 key 会随时间变化时（例如滚动窗口起点）必须按分钟对齐，否则缓存永不命中、key 还会无限积累

## 验证

```bash
# 仓库自检（CI 跑的就是这三条）
node --check server.mjs
node scripts/check-page.mjs     # 启动器 ASCII + 页面零外部请求 + 无 package.json
node scripts/check-links.mjs    # 文档相对链接 + 标签/目标一致性

# 桥接自检
node server.mjs &
curl http://127.0.0.1:8773/health
curl http://127.0.0.1:8773/snapshot | head -c 400
```

页面内联脚本改动后，抽出脚本单独做语法检查：

```bash
node --check page-script.js
```

浏览器侧请按 [CONTRIBUTING.md](CONTRIBUTING.md) 的**验证清单**逐条走（15 项），并确认控制台无新增 error / warning。

## 排错速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 页面空白、控制台报 `host-ops` 为 null | 页面未加载完 | 刷新；确认走的是桥接地址而非 `file://` |
| 顶部指标为 0、角标显示「模拟数据」 | 桥接未连上 OpenCode | `opencode service status` 确认服务在跑；重启桥接 |
| 指标全 0 但角标 LIVE | 24 小时内确实无活动 | 属正常 |
| 启动器报「端口已被占用」 | 上个实例未退干净 | 桥接会自动重试；持续失败则手动结束占用进程 |
| 启动器中文乱码 | 控制台代码页非 UTF-8 | 桥接启动时会自动 `chcp 65001`；仍异常请用 `chcp 65001` 后再运行 |
| 页面无动画 | 浏览器节流 rAF | 已有定时器兜底；检查是否被扩展或节能模式禁用 |
| 飞轮节点是 `FLOW-0X` | 该目录 7 天内无活动 | 属正常，占位显示 |
