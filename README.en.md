<div align="center">

# OpenCode OPS Dashboard

[简体中文](./README.md) · **English**

Wire your **OpenCode** instance into a canvas-driven ops dashboard: live sessions, tool calls, steps, tokens and cost.

A read-only local bridge reads the running OpenCode server, aggregates its activity into a snapshot, and pushes it to a single-file page that needs **no build step and makes no external requests**.

[![Stars](https://img.shields.io/github/stars/Yiyazadxr/opencode-OPS-dash?style=flat-square)](https://github.com/Yiyazadxr/opencode-OPS-dash/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-3fb950?style=flat-square)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-5FA04E?style=flat-square)](https://nodejs.org)
[![Offline 100%](https://img.shields.io/badge/runtime-offline%20100%25-3fb950?style=flat-square)](#stack)
[![Zero runtime deps](https://img.shields.io/badge/runtime_deps-0-brightgreen?style=flat-square)](#stack)
[![Read-only](https://img.shields.io/badge/OpenCode-access%20read--only-3fb950?style=flat-square)](#security-model)

[Open an issue](https://github.com/Yiyazadxr/opencode-OPS-dash/issues) · [Contributing](./CONTRIBUTING.md) · [Code of Conduct](./CODE_OF_CONDUCT.md) · [Security](./SECURITY.md) · [License](#license)

</div>

---

## Features

- **Real metrics** — tool calls, agents, projects, steps, successes and failures over a rolling 24-hour window, sourced from the same statistics endpoint as `opencode stats`.

- **Task feed** — every real tool call (`shell`, `edit`, `read`, `grep`, `write`, `webfetch`, …) plus assistant steps, streamed in as they happen.

- **Dispatch flywheel** — the three most active real projects sit on the convergence nodes, labelled with their actual call counts and success rates. Connection density scales with real volume, and each ring block corresponds to a real tool call, interleaved with decorative blocks.

- **Agent dispatch panel** — configured agents with their current session, project and tool state. Slots beyond the real agent count are filled with matching virtual roles.

- **Session panel** — title, project, state, tool count and last activity; click any row for details.

- **Workspace** — types out the real content of your most recent writes and edits, then rolls on to the next one.

- **Detail drawer** — click a feed item, a session or the workspace to inspect the underlying tool input, output, file content and session prompts.

- **Never blank** — when OpenCode is unreachable the dashboard keeps the last snapshot and marks it stale; when it was never reachable it falls back to simulated data.

- **No external requests** — fonts are embedded as base64 in the page, so it runs fully offline.

---

## Running

### Windows

```bat
start-dashboard.cmd
```

The launcher stops any previous instance, starts the bridge, opens your browser and stays at `http://127.0.0.1:8773`. Close that window to stop.

### Any platform

```bash
node server.mjs            # add --open to launch the browser automatically
```

Then visit <http://127.0.0.1:8773>.

### Requirements

| Item | Requirement |
| --- | --- |
| OpenCode | v2.x with the background service running (`opencode service status` returns a URL) |
| Node.js | 20 or newer (developed and tested on 24) |
| Browser | Modern Chrome / Edge / Safari / Firefox with Shadow DOM and Canvas 2D |
| Display | 1920×1080 or larger recommended |

---

## Interaction

| Action | Result |
| --- | --- |
| "Paper / Particle" button | Switch between the paper-engineering look and the night-time fluorescent theme (follows the system theme by default) |
| "Full screen" button | Enter / leave full screen |
| Click a feed item | Opens the drawer with that tool call's details |
| Click an agent row / session row | Opens the drawer with that session's details |
| Click the workspace code area | Opens the drawer with the current file content |
| Hover a flywheel node | Shows the project's directory, call count and success rate |

---

## Stack

- **Page**: vanilla JavaScript + CSS + Canvas 2D. No framework, no build step, no modules; the theme runs inside its own Shadow DOM.

- **Bridge**: Node.js (`node:http` + the built-in `fetch`), **zero npm dependencies**. Credentials never leave the server process.

- **Transport**: same-origin HTTP (`/snapshot`, `/detail`) plus SSE (`/events`). Events are only a "something changed" trigger — the page always renders from a snapshot.

- **Fonts**: Archivo (display) and JetBrains Mono (data), embedded as woff2 base64. CJK glyphs come from the operating system and are not embedded.

---

## Layout

```
opencode-OPS-dash/
├── opencode-dash.html         single-file dashboard (markup + styles + script, fonts embedded)
├── server.mjs                 local read-only bridge (config, collection, aggregation, HTTP + SSE)
├── start-dashboard.cmd        Windows launcher (ASCII-only, code-page safe)
├── scripts/                   docs-link and page/launcher checks (zero-dependency, used by CI)
├── .github/ISSUE_TEMPLATE/    issue forms (bug report / feature request)
├── .github/workflows/         CI (bridge syntax, page hygiene, documentation links)
└── AGENTS.md · CODE_OF_CONDUCT.md · CONTRIBUTING.md · LICENSE · NOTICE · README.md · README.en.md · SECURITY.md
```

See [AGENTS.md](./AGENTS.md) for file responsibilities, change constraints and verification steps.

---

## Data sources

| Dashboard element | Source |
| --- | --- |
| `TASKS` | `stats.tools.totals.calls` |
| `AGENTS` | `GET /api/agent` (visible agents) |
| `PROJECTS` | projects with activity in the window, **aggregated by directory** |
| `STEPS` | `stats.steps` |
| `SUCCEEDED` | `stats.tools.totals.succeeded` |
| `FAILED` | `stats.tools.totals.failed` + `unfinished` |
| Task feed | tool calls + assistant steps, newest first |
| Flywheel nodes | three most active projects with real call counts and success rates |
| Ring blocks | one per real tool call, interleaved with decorative blocks |
| Agent panel | configured agents with their current session and project |
| Session panel | title, project, state, tool count, last activity |
| Workspace | the eight most recent writes / edits, played in rotation |
| HUD | live tool success rate |
| Footer | token usage, cache reads and cost estimate |

The bridge only requests these read-only upstream routes:

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

> A single directory can map to several OpenCode project IDs (worktrees, sandbox
> instances), so the bridge aggregates by `location.directory` to avoid counting
> one project twice.

---

## Security model

- **Read-only**: the bridge never writes to OpenCode. It cannot send prompts, run commands or modify files; every upstream call is restricted to the GET allow-list above.

- **Localhost only**: binds to `127.0.0.1` and is never exposed to the network. Nothing is written to disk; caches live in memory.

- **Credentials stay in-process**: the OpenCode service password is read from `~/.local/state/opencode/service.json` and used only for upstream requests. It is never sent to the browser and never logged.

- **No filesystem access**: `/detail` returns content that already exists in OpenCode's message history; it cannot read arbitrary files.

- **Page hardening**: a strict CSP is sent with the page (`default-src 'self'`, nonce-based inline scripts/styles), plus `Origin` validation, `nosniff` and `no-referrer`.

- **Nothing leaves the machine**: the page loads no external resources and issues no third-party requests.

---

## Configuration

Everything lives in the `CONFIG` object at the top of `server.mjs`:

```js
const CONFIG = {
  port: 8773,              // bridge port
  host: '127.0.0.1',       // bind address
  windowHours: 24,         // statistics window (rolling hours)
  fillDays: 7,             // lookback used to backfill flywheel nodes
  refreshMs: 5000,         // dashboard refresh interval
  excludedProjects: [],    // path fragments to hide
  showCost: true,          // show money next to tokens
  limits: { prompt: 4096, command: 2048, output: 8192, code: 16384, title: 40 },
};
```

Restart the bridge after editing.

---

## License

Source code and third-party components are licensed separately; see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

- **Source**: [MIT](./LICENSE) © 2026-present Yiyazadxr

- **Adapted from**: [agent-display](https://github.com/cyberdaddyleo/agent-display) (MIT, © cyberdaddyleo) — the OPS theme visuals

- **Embedded fonts**: Archivo, JetBrains Mono (SIL OFL 1.1)

- **Runtime dependencies**: OpenCode (MIT), Node.js (MIT) — neither is included in this repository

- **Names and logos** are outside the open-source license and may not be used to imply endorsement

## Contributing

Issues and pull requests are welcome. Change constraints, the review checklist and the submission flow are documented in [CONTRIBUTING.md](./CONTRIBUTING.md); community behaviour is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md); report security problems privately as described in [SECURITY.md](./SECURITY.md).

## Credits

- [agent-display](https://github.com/cyberdaddyleo/agent-display) — OPS theme visuals and interaction design

- [OpenCode](https://opencode.ai) — the data source

## Contact

For licensing questions or anything else: [412110785@qq.com](mailto:412110785@qq.com) · [GitHub](https://github.com/Yiyazadxr)
