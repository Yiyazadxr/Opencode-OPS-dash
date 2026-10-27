#!/usr/bin/env node
/* =============================================================================
 * OpenCode 实时大屏 · 本地桥接
 * -----------------------------------------------------------------------------
 * 作用：把 OpenCode 后台服务的真实运行数据，转换成大屏页面需要的快照格式。
 * 本文件是唯一与 OpenCode 通信的地方：密码只在本进程内使用，不会传给浏览器。
 *
 * 启动：node server.mjs        （或双击 start-dashboard.cmd）
 * 地址：http://127.0.0.1:8773
 *
 * 原则：能用真实数据就用真实数据；真实数据没有的部分用虚拟的补齐。
 * ============================================================================= */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE_FILE = path.join(HERE, 'opencode-dash.html');

/* ============================ 1. 配置（改这里就行） ============================ */
const CONFIG = {
  port: 8773,
  host: '127.0.0.1',              // 只监听本机
  windowHours: 24,               // 顶部指标的统计窗口（滚动小时数）
  fillDays: 7,                   // 飞轮节点不足时，用最近 N 天的项目补齐
  refreshMs: 5000,               // 页面拉快照的间隔
  statsCacheMs: 60_000,          // 全局统计缓存
  projectStatsCacheMs: 60_000,   // 单项目统计缓存
  sessionCacheMs: 5_000,         // 会话列表缓存
  messageCacheMs: 2_000,         // 消息缓存
  snapshotCacheMs: 1_500,        // 快照短缓存：多标签页 / 轮询叠加时不重复采集
  cacheMaxEntries: 400,          // 内存缓存条数上限，超出按最久未用淘汰
  infoCacheMs: 10_000,           // /api/info（版本号）缓存
  maxSessions: 20,               // 最多拉取的会话数
  maxMessagesPerSession: 50,     // 每个会话最多拉取的消息数
  maxFeedItems: 300,             // 任务流最多保留条数
  excludedProjects: [],          // 不展示的项目目录（绝对路径片段，忽略大小写）
  showCost: true,                // 是否显示金额
  limits: {                      // 文本截断上限（字节近似）
    prompt: 4096,
    command: 2048,
    output: 8192,
    code: 16384,
    title: 40,
  },
};

/* ============================ 2. 小工具 ============================ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMs = () => Date.now();

function clip(text, max) {
  if (text == null) return '';
  const s = String(text);
  return s.length > max ? s.slice(0, max) + '\n…[截断]' : s;
}

function firstLine(text, max = 120) {
  if (!text) return '';
  const line = String(text).split(/\r?\n/).find((l) => l.trim()) || '';
  return clip(line.trim(), max);
}

/** 把绝对路径压成短标签：优先取最后两段，避免同名目录混淆 */
function shortPath(p) {
  if (!p) return '—';
  const norm = String(p).replace(/[\\/]+$/, '');
  const parts = norm.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return norm || '—';
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  // 同名段多（Downloads 出现多次）→ 用“父目录/末级”区分
  const seen = new Set();
  let ambiguous = false;
  for (const seg of parts) {
    const k = seg.toLowerCase();
    if (seen.has(k)) { ambiguous = true; break; }
    seen.add(k);
  }
  return ambiguous ? `${prev}/${last}` : last;
}

function fmtTokens(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function fmtNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US');
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  if (v === 0) return '$0.00';
  return '$' + v.toFixed(v < 0.01 ? 4 : 2);
}

function relTime(ts) {
  if (!ts) return '';
  const diff = Math.max(0, nowMs() - ts);
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.round(h / 24)}天前`;
}

/* ============================ 3. OpenCode 连接 ============================ */
const SERVICE_FILE = path.join(os.homedir(), '.local', 'state', 'opencode', 'service.json');

let upstream = null;         // {base, auth}
let lastError = null;
let lastUpstreamCheck = 0;

function readService() {
  if (!fs.existsSync(SERVICE_FILE)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(SERVICE_FILE, 'utf8'));
    if (!raw?.url || !raw?.password) return null;
    return {
      base: String(raw.url).replace(/\/$/, ''),
      auth: 'Basic ' + Buffer.from(`opencode:${raw.password}`).toString('base64'),
    };
  } catch {
    return null;
  }
}

async function ensureUpstream(force = false) {
  if (!force && upstream && nowMs() - lastUpstreamCheck < 2000) return upstream;
  const svc = readService();
  lastUpstreamCheck = nowMs();
  if (!svc) { upstream = null; return null; }
  upstream = svc;
  return upstream;
}

/** 只读白名单：任何不在表里的路径都不会被转发 */
const ALLOWED_UPSTREAM = [
  /^\/api\/info$/,
  /^\/api\/agent$/,
  /^\/api\/project$/,
  /^\/api\/session$/,
  /^\/api\/session\/active$/,
  /^\/api\/session\/[A-Za-z0-9_]+\/message$/,
  /^\/api\/experimental\/session\/stats$/,
  /^\/api\/event$/,
];

async function ocGet(pathAndQuery, { timeout = 20000 } = {}) {
  const svc = await ensureUpstream();
  if (!svc) throw new Error('NO_SERVICE');
  if (!ALLOWED_UPSTREAM.some((re) => re.test(pathAndQuery.split('?')[0]))) {
    throw new Error('NOT_ALLOWED');
  }
  /** 单次请求：每次都给足超时，避免重试时无限挂住 */
  const once = async (auth, ms) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(svc.base + pathAndQuery, {
        headers: { authorization: auth },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };
  let res = await once(svc.auth, timeout);
  if (res.status === 401) {
    // 密码可能已轮换，重读一次再试
    const svc2 = await ensureUpstream(true);
    if (!svc2) throw new Error('UNAUTHORIZED');
    res = await once(svc2.auth, timeout);
  }
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('HTTP_' + res.status);
  return await res.json();
}

/* ============================ 4. 缓存 ============================ */
/* 两层：cache 存结果（带 TTL + 条数上限），inflight 合并同一 key 的并发请求，
   避免页面轮询和 SSE 去抖同时打进来时把上游请求放大数倍 */
const cache = new Map();      // key -> { at, value }，Map 的插入顺序即 LRU 顺序
const inflight = new Map();   // key -> Promise

function cacheStore(key, value) {
  cache.delete(key);
  cache.set(key, { at: nowMs(), value });
  while (cache.size > CONFIG.cacheMaxEntries) {
    cache.delete(cache.keys().next().value);
  }
}

function cached(key, ttl, producer) {
  const hit = cache.get(key);
  if (hit && nowMs() - hit.at < ttl) {
    cache.delete(key);        // 命中后移到末尾，保持 LRU 顺序
    cache.set(key, hit);
    return hit.value;
  }
  const running = inflight.get(key);
  if (running) return running;
  const task = (async () => {
    try {
      const value = await producer();
      cacheStore(key, value);
      return value;
    } finally {
      inflight.delete(key);   // 失败不缓存，下次重新采集
    }
  })();
  inflight.set(key, task);
  return task;
}

/* ============================ 5. 数据采集 ============================ */
function windowStartMs(hours = CONFIG.windowHours) {
  return nowMs() - hours * 3600_000;
}

/** 全局统计（24h 滚动窗口） */
async function globalStats() {
  // 窗口起点按分钟对齐：否则每次 now 都不同，缓存永不命中，key 还会无限增长
  const from = Math.floor(windowStartMs() / 60_000) * 60_000;
  return cached('stats:' + from, CONFIG.statsCacheMs, async () => {
    const q = `/api/experimental/session/stats?tools=detail&from=${from}`;
    const j = await ocGet(q);
    const d = j?.data || {};
    const totals = d?.tools?.totals || {};
    return {
      from,
      to: nowMs(),
      sessions: d.sessions || 0,
      subagents: d.subagents || 0,
      prompts: d.prompts || 0,
      steps: d.steps || 0,
      cost: d.cost || 0,
      tokens: {
        input: d?.tokens?.input || 0,
        output: d?.tokens?.output || 0,
        reasoning: d?.tokens?.reasoning || 0,
        cacheRead: d?.tokens?.cache?.read || 0,
        cacheWrite: d?.tokens?.cache?.write || 0,
      },
      calls: totals.calls || 0,
      succeeded: totals.succeeded || 0,
      failed: totals.failed || 0,
      unfinished: totals.unfinished || 0,
      tools: d?.tools?.usage || [],
      activity: d.activity || [],
      models: (d.models || []).map((m) => ({
        id: m.model?.id, variant: m.model?.variant, provider: m.model?.providerID, steps: m.steps || 0,
      })),
    };
  });
}

/** 单个目录的统计：同一目录可能有多个 project ID，累加 */
async function projectStats(dir) {
  return cached('pstats:' + dir, CONFIG.projectStatsCacheMs, async () => {
    const from = Math.floor(windowStartMs() / 60_000) * 60_000;
    const projects = await listProjects();
    const ids = projects.filter((p) => p.canonical === dir).map((p) => p.id);
    // 多个 project ID 并行取，单个失败不影响整体
    const parts = await Promise.allSettled(
      ids.map((id) => ocGet(`/api/experimental/session/stats?tools=detail&from=${from}&project=${id}`)),
    );
    let calls = 0, succeeded = 0, failed = 0, unfinished = 0, steps = 0, sessions = 0;
    for (const part of parts) {
      if (part.status !== 'fulfilled') continue;
      const d = part.value?.data || {};
      const t = d?.tools?.totals || {};
      calls += t.calls || 0; succeeded += t.succeeded || 0; failed += t.failed || 0;
      unfinished += t.unfinished || 0; steps += d.steps || 0; sessions += d.sessions || 0;
    }
    return { dir, calls, succeeded, failed, unfinished, steps, sessions };
  });
}

/** 上游版本号：短缓存，失败时返回 null 而不是抛错 */
async function serviceInfo() {
  return cached('info', CONFIG.infoCacheMs, async () => {
    try { return await ocGet('/api/info'); } catch { return null; }
  });
}

async function listProjects() {
  return cached('projects', 30_000, async () => {
    const j = await ocGet('/api/project');
    const arr = Array.isArray(j) ? j : (j?.data || []);
    return arr
      .filter((p) => p && p.canonical && p.canonical !== '/' && !p.archived)
      .map((p) => ({ id: p.id, canonical: p.canonical, vcs: p.vcs, active: p.time?.active || 0 }));
  });
}

async function listAgents() {
  return cached('agents', 60_000, async () => {
    const j = await ocGet('/api/agent');
    let arr = Array.isArray(j) ? j : (j?.data || []);
    // 偶发：服务刚启动时可能返回空列表，重试几次
    for (let i = 0; i < 3 && arr.length === 0; i++) {
      await sleep(300);
      try {
        const j2 = await ocGet('/api/agent');
        arr = Array.isArray(j2) ? j2 : (j2?.data || []);
      } catch { /* 忽略 */ }
    }
    if (!arr.length) console.warn('[warn] /api/agent 返回空列表');
    return arr.map((a) => ({
      id: a.id, name: a.name, mode: a.mode, hidden: !!a.hidden,
      description: a.description || '', system: a.system || '',
    }));
  });
}

async function listSessions() {
  return cached('sessions', CONFIG.sessionCacheMs, async () => {
    const j = await ocGet('/api/session?limit=100&order=desc');
    const arr = Array.isArray(j) ? j : (j?.data || []);
    return arr.map((s) => ({
      id: s.id,
      parentID: s.parentID || null,
      title: s.title || '(无标题)',
      projectID: s.projectID,
      dir: s?.location?.directory || '',
      agent: s.agent || 'build',
      model: s.model ? `${s.model.id}` : '',
      variant: s.model?.variant || '',
      provider: s.model?.providerID || '',
      cost: s.cost || 0,
      tokens: s.tokens || {},
      outcome: s.outcome || null,
      created: s.time?.created || 0,
      updated: s.time?.updated || 0,
      idle: s.time?.idle || 0,
      archived: !!s.time?.archived,
    }));
  });
}

async function activeSessions() {
  return cached('active', 2_000, async () => {
    const j = await ocGet('/api/session/active');
    const d = j?.data || {};
    return Object.entries(d).map(([id, v]) => ({ id, type: v?.type || 'running' }));
  });
}

/** 拉取会话消息，抽取工具调用与步骤 */
async function sessionMessages(sessionID) {
  return cached('msgs:' + sessionID, CONFIG.messageCacheMs, async () => {
    const j = await ocGet(`/api/session/${sessionID}/message?limit=${CONFIG.maxMessagesPerSession}&order=desc`);
    const arr = Array.isArray(j) ? j : (j?.data || []);
    return arr;
  });
}

function toolTarget(toolName, input) {
  if (!input || typeof input !== 'object') return '';
  switch (toolName) {
    case 'edit': case 'write': case 'read': case 'patch':
      return input.filePath || input.path || input.file || '';
    case 'shell': case 'bash': case 'execute':
      return input.command || '';
    case 'grep': case 'glob': case 'search':
      return input.pattern || input.query || input.path || '';
    case 'webfetch': return input.url || '';
    case 'websearch': return input.query || '';
    case 'skill': return input.name || input.skill || input.id || '';
    case 'question': return input.question || input.header || '';
    case 'todowrite': case 'todo': return input.todos ? '(todo list)' : '';
    case 'task': case 'agent': return input.description || input.subagent_type || '';
    default: {
      const first = Object.values(input).find((v) => typeof v === 'string' && v.length);
      return first || '';
    }
  }
}

const TOOL_LABEL = {
  edit: '编辑', write: '写入', read: '读取', grep: '检索', glob: '查找',
  shell: '执行', execute: '执行', webfetch: '联网', websearch: '联网',
  skill: '加载', question: '询问', task: '委派', todowrite: '计划',
};

/** 抽取某会话的工具调用与步骤事件（时间正序） */
function extractEvents(messages, session) {
  const tools = [];
  const steps = [];
  for (const msg of messages) {
    const t = msg.time || {};
    if (msg.type === 'assistant') {
      const created = t.created || 0;
      const completed = t.completed || 0;
      for (const part of msg.content || []) {
        if (part.type === 'tool') {
          const st = part.state || {};
          const status = st.status === 'completed' ? 'done'
            : st.status === 'error' ? 'error'
            : st.status === 'running' ? 'running'
            : st.status === 'streaming' ? 'running' : 'pending';
          const target = toolTarget(part.name, st.input);
          tools.push({
            kind: 'tool',
            id: part.id,
            name: part.name,
            label: TOOL_LABEL[part.name] || part.name,
            target,
            targetShort: part.name === 'shell' ? firstLine(target, 120) : clip(target, 120),
            status,
            sessionID: session.id,
            sessionTitle: session.title,
            project: session.dir,
            agent: session.agent,
            time: st.time?.created || created,
            started: st.time?.created || created,
            ended: st.time?.completed || completed || null,
            error: st.error?.message ? clip(st.error.message, 300) : '',
          });
        }
      }
      if (msg.finish) {
        steps.push({
          kind: 'step',
          id: msg.id,
          finish: msg.finish,
          model: msg.model ? `${msg.model.id}${msg.model.variant ? '/' + msg.model.variant : ''}` : '',
          agent: msg.agent || session.agent,
          status: 'done',
          sessionID: session.id,
          sessionTitle: session.title,
          project: session.dir,
          time: completed || created,
          tokens: msg.tokens || {},
          cost: msg.cost || 0,
        });
      }
    }
  }
  tools.sort((a, b) => (a.time || 0) - (b.time || 0));
  steps.sort((a, b) => (a.time || 0) - (b.time || 0));
  return { tools, steps };
}

/* ============================ 6. 快照组装 ============================ */
let lastGoodSnapshot = null;

function isExcluded(dir) {
  const d = String(dir || '').toLowerCase();
  return CONFIG.excludedProjects.some((frag) => d.includes(String(frag).toLowerCase()));
}

/* 单飞 + 短缓存：页面轮询、SSE 去抖与多标签页同时请求时只采集一次 */
let snapshotInflight = null;
let snapshotCached = { at: 0, value: null };

function buildSnapshot() {
  if (snapshotCached.value && nowMs() - snapshotCached.at < CONFIG.snapshotCacheMs) {
    return Promise.resolve(snapshotCached.value);
  }
  if (snapshotInflight) return snapshotInflight;
  snapshotInflight = (async () => {
    try {
      const value = await buildSnapshotUncached();
      // 只有连通的快照才进缓存；等待/过期状态下次重新探一次
      if (value?.status?.code === 'ok') snapshotCached = { at: nowMs(), value };
      return value;
    } finally {
      snapshotInflight = null;
    }
  })();
  return snapshotInflight;
}

async function buildSnapshotUncached() {
  const t0 = nowMs();
  const status = { code: 'ok', since: t0, error: null, upstreamVersion: null };

  let stats, sessions, agents, projects, active;
  try {
    [stats, sessions, agents, projects, active] = await Promise.all([
      globalStats(), listSessions(), listAgents(), listProjects(), activeSessions(),
    ]);
    lastError = null;
  } catch (err) {
    lastError = err.message;
    status.code = err.message === 'NO_SERVICE' ? 'waiting' : 'stale';
    status.error = err.message;
    if (lastGoodSnapshot) {
      // 断线时保留上一份快照，页面继续显示真实数据并标记过期
      return { ...lastGoodSnapshot, t: t0, status: { ...status, upstreamVersion: lastGoodSnapshot.opencode?.version || null } };
    }
    stats = null; sessions = null; agents = []; projects = []; active = [];
  }
  if (!stats || !sessions) {
    return {
      t: t0, status, window: { hours: CONFIG.windowHours, from: windowStartMs() },
      stats: null, agents: [], projects: [], sessions: [], feed: [], workspace: null, note: { main: '—', sub: '' },
    };
  }
  const info = await serviceInfo();
  status.upstreamVersion = info?.version || null;

  const activeIDs = new Set(active.map((a) => a.id));

  /* --- 过滤会话：排除归档、排除配置目录 --- */
  const usable = sessions
    .filter((s) => !s.archived)
    .filter((s) => !isExcluded(s.dir))
    .filter((s) => s.dir)
    .slice(0, CONFIG.maxSessions);

  /* --- 拉取消息，抽工具调用与步骤（并行，单会话失败不影响其他） --- */
  const perSession = await Promise.all(usable.map(async (s) => {
    try {
      const msgs = await sessionMessages(s.id);
      return { session: s, ...extractEvents(msgs, s) };
    } catch {
      return { session: s, tools: [], steps: [] };
    }
  }));

  /* --- 按目录聚合项目 --- */
  const dirMap = new Map();
  for (const p of projects) {
    if (isExcluded(p.canonical)) continue;
    if (!dirMap.has(p.canonical)) {
      dirMap.set(p.canonical, { dir: p.canonical, name: shortPath(p.canonical), projectIDs: [], calls: 0, succeeded: 0, failed: 0, sessions: 0, active: 0, lastActivity: 0, calls24h: 0, rate: 0 });
    }
    const agg = dirMap.get(p.canonical);
    agg.projectIDs.push(p.id);
    agg.active = Math.max(agg.active, p.active || 0);
  }
  for (const ps of perSession) {
    const agg = dirMap.get(ps.session.dir);
    if (!agg) continue;
    agg.calls += ps.tools.length;
    agg.succeeded += ps.tools.filter((t) => t.status === 'done').length;
    agg.failed += ps.tools.filter((t) => t.status === 'error').length;
    agg.sessions += 1;
    agg.lastActivity = Math.max(agg.lastActivity, ps.session.updated || 0);
  }
  // 24h 内调用数（用 per-project stats 补齐活跃项目的准确值）
  const topDirs = [...dirMap.values()]
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 8)
    .map((d) => d.dir);
  await Promise.all(topDirs.map(async (dir) => {
    try {
      const ps = await projectStats(dir);
      const agg = dirMap.get(dir);
      if (agg) { agg.calls24h = ps.calls; agg.succeeded24h = ps.succeeded; agg.failed24h = ps.failed; agg.rate = ps.calls ? ps.succeeded / ps.calls : 0; }
    } catch { /* 忽略 */ }
  }));

  const projectList = [...dirMap.values()]
    .map((d) => ({
      key: d.dir, dir: d.dir, name: d.name,
      sessions: d.sessions, calls: d.calls, calls24h: d.calls24h || d.calls,
      succeeded: d.succeeded24h ?? d.succeeded, failed: d.failed24h ?? d.failed,
      rate: d.rate || (d.calls ? d.succeeded / d.calls : 0),
      active: d.active, lastActivity: d.lastActivity,
    }))
    .sort((a, b) => b.calls24h - a.calls24h || b.lastActivity - a.lastActivity);

  /* --- 飞轮节点：24h 活跃项目优先，不足用 7 天内有活动的项目补 --- */
  const nodePool = [...projectList].sort((a, b) => {
    const aActive = a.calls24h > 0 ? 1 : 0, bActive = b.calls24h > 0 ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return b.calls24h - a.calls24h || b.lastActivity - a.lastActivity;
  });
  const fillCut = nowMs() - CONFIG.fillDays * 86400_000;
  const nodes = [];
  for (const p of nodePool) {
    if (nodes.length >= 3) break;
    if (p.calls24h > 0 || p.lastActivity >= fillCut) nodes.push(p);
  }
  for (const p of nodePool) {
    if (nodes.length >= 3) break;
    if (!nodes.includes(p)) nodes.push(p);
  }

  /* --- 任务流：工具调用 + 步骤，混合 --- */
  const allTools = perSession.flatMap((p) => p.tools);
  const allSteps = perSession.flatMap((p) => p.steps);
  const feedRaw = [...allTools.map((t) => ({ ...t, sortTime: t.time || 0 })),
                   ...allSteps.map((s) => ({ ...s, sortTime: s.time || 0 }))]
    .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
    .slice(0, CONFIG.maxFeedItems)
    .map((e, i) => ({
      seq: CONFIG.maxFeedItems - i,
      id: e.id || '',
      time: e.sortTime,
      kind: e.kind,
      verb: e.kind === 'step' ? 'STEP' : (e.label || e.name || 'call'),
      text: e.kind === 'step'
        ? `${e.finish} · ${e.model}`
        : `${e.name}${e.targetShort ? ' · ' + e.targetShort : ''}`,
      status: e.status,
      tool: e.kind === 'tool' ? e.name : null,
      target: e.kind === 'tool' ? e.targetShort : null,
      error: e.error || '',
      sessionID: e.sessionID,
      sessionTitle: e.sessionTitle,
      project: e.project,
    }));

  /* --- Agent 面板：真实 agent + 当前会话 --- */
  const sessionByAgent = new Map();
  for (const ps of perSession) {
    const s = ps.session;
    if (!activeIDs.has(s.id)) continue;
    if (!sessionByAgent.has(s.agent)) sessionByAgent.set(s.agent, s);
  }
  const agentRows = agents.map((a) => {
    const s = sessionByAgent.get(a.id);
    const tools = s ? perSession.find((p) => p.session.id === s.id)?.tools || [] : [];
    const running = tools.some((t) => t.status === 'running');
    const failed = tools.some((t) => t.status === 'error');
    const done = tools.length > 0 && !running && !failed;
    let state = 'idle';
    if (running) state = 'running';
    else if (failed) state = 'error';
    else if (done) state = 'done';
    return {
      id: a.id, code: String(a.id).slice(0, 2).toUpperCase(), name: a.name || a.id,
      mode: a.mode, hidden: a.hidden, state,
      session: s ? {
        id: s.id, title: clip(s.title, CONFIG.limits.title),
        titleFull: s.title, project: shortPath(s.dir), dir: s.dir,
        model: s.model, toolCount: tools.length,
      } : null,
    };
  });

  /* --- 工作台：最近一次 write/edit 的真实文件（优先 24h 内） --- */
  let workspace = null;
  const windowFrom = stats.from || windowStartMs();
  const writeLike = allTools.filter((t) => ['write', 'edit', 'patch', 'multiedit'].includes(t.name));
  const recentWrite = writeLike.filter((t) => (t.time || 0) >= windowFrom);
  const pool = recentWrite.length ? recentWrite : writeLike;
  const langOf = (fp) => {
    const ext = (String(fp || '').split('.').pop() || '').toLowerCase();
    return { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml', sh: 'shell', ps1: 'powershell' }[ext] || 'text';
  };
  // 队列：最近 8 次写入/编辑（新的在前），供大屏轮播播放
  const workspaceQueue = pool.slice(-8).reverse().map((t) => ({
    sessionID: t.sessionID, partID: t.id, tool: t.name, file: t.target,
    language: langOf(t.target), status: t.status, time: t.time,
  }));
  const lastWrite = pool[pool.length - 1];
  if (lastWrite) {
    const filePath = lastWrite.target || '';
    const lang = langOf(filePath);
    workspace = {
      sessionID: lastWrite.sessionID, partID: lastWrite.id, tool: lastWrite.name, file: filePath,
      language: lang, status: lastWrite.status, time: lastWrite.time,
      lines: 0, available: true,
    };
  }

  /* --- 会话列表（面板用） --- */
  const sessionRows = perSession.map((ps) => {
    const s = ps.session;
    const isActive = activeIDs.has(s.id);
    return {
      id: s.id,
      title: clip(s.title, CONFIG.limits.title),
      titleFull: s.title,
      project: shortPath(s.dir),
      dir: s.dir,
      agent: s.agent,
      model: s.model,
      status: isActive ? 'running' : (s.outcome || 'idle'),
      outcome: s.outcome,
      calls: ps.tools.length,
      steps: ps.steps.length,
      tokens: s.tokens || {},
      cost: s.cost || 0,
      created: s.created,
      updated: s.updated,
      relTime: relTime(s.updated),
      parentID: s.parentID || null,
    };
  }).sort((a, b) => (b.updated || 0) - (a.updated || 0));

  /* --- note 区 --- */
  const failedTotal = stats.failed + stats.unfinished;
  const main = stats.calls === 0
    ? `${CONFIG.windowHours}H 内无活动`
    : `${fmtNum(stats.succeeded)} / ${fmtNum(stats.calls)} 工具成功 · ${stats.failed} 失败 · ${stats.unfinished} 进行中`;
  const sub = CONFIG.showCost
    ? `TOKENS ${fmtTokens(stats.tokens.input)} in / ${fmtTokens(stats.tokens.output)} out · CACHE ${fmtTokens(stats.tokens.cacheRead)} · COST ${fmtMoney(stats.cost)}`
    : `TOKENS ${fmtTokens(stats.tokens.input)} in / ${fmtTokens(stats.tokens.output)} out · CACHE ${fmtTokens(stats.tokens.cacheRead)}`;

  const snapshot = {
    t: t0,
    status,
    window: { hours: CONFIG.windowHours, from: stats.from, to: stats.to },
    opencode: { version: status.upstreamVersion },
    stats: {
      tasks: stats.calls,
      agents: agents.filter((a) => !a.hidden).length,
      projects: projectList.filter((p) => p.calls24h > 0 || p.sessions > 0).length,
      steps: stats.steps,
      succeeded: stats.succeeded,
      failed: failedTotal,
      failedOnly: stats.failed,
      running: stats.unfinished,
      sessions: stats.sessions,
      prompts: stats.prompts,
      subagents: stats.subagents,
      tokens: stats.tokens,
      cost: stats.cost,
      tools: stats.tools,
      models: stats.models,
    },
    agents: agentRows,
    projects: projectList,
    nodes,
    sessions: sessionRows,
    feed: feedRaw,
    workspace,
    workspaceQueue,
    note: { main, sub },
  };
  lastGoodSnapshot = snapshot;
  return snapshot;
}

/* ============================ 7. 详情（仅消息内容，不读磁盘） ============================ */
async function buildDetail(sessionID, partID, metaOnly = false) {
  const sessions = await listSessions();
  const s = sessions.find((x) => x.id === sessionID);
  if (!s) throw new Error('NO_SESSION');
  const msgs = await sessionMessages(sessionID);
  const { tools, steps } = extractEvents(msgs, s);

  const tool = partID ? tools.find((t) => t.id === partID) : null;
  const step = partID ? steps.find((x) => x.id === partID) : null;

  // 找原始 part 以取得完整输入与输出
  let raw = null;
  for (const m of msgs) {
    for (const p of m.content || []) {
      if (p.type === 'tool' && p.id === partID) raw = p;
    }
  }
  const state = raw?.state || {};
  const input = state.input || {};
  const outputText = (state.content || [])
    .map((c) => (typeof c.text === 'string' ? c.text : ''))
    .join('\n');

  const isWrite = raw && ['write', 'edit', 'patch', 'multiedit'].includes(raw.name);
  const code = (isWrite && !metaOnly)
    ? clip(typeof input.content === 'string' ? input.content : (input.newString || input.edits?.map?.(e => e.newString).join('\n') || ''), CONFIG.limits.code)
    : '';

  // 会话级摘要：用户 prompt（截断）；共享模式下不返回
  const prompts = metaOnly ? [] : msgs
    .filter((m) => m.type === 'user')
    .slice(-6)
    .map((m) => clip(typeof m.text === 'string' ? m.text : '', CONFIG.limits.prompt))
    .filter(Boolean);

  return {
    session: {
      id: s.id, title: s.title, titleFull: s.title, project: shortPath(s.dir), dir: s.dir,
      agent: s.agent, model: s.model, outcome: s.outcome, created: s.created, updated: s.updated,
      tokens: s.tokens, cost: s.cost,
    },
    item: tool ? {
      id: tool.id, kind: 'tool', name: tool.name, label: tool.label,
      target: tool.target, targetShort: tool.targetShort, status: tool.status,
      time: tool.time, ended: tool.ended, error: tool.error,
      input: metaOnly ? '' : clip(JSON.stringify(input, null, 2), CONFIG.limits.command),
      output: metaOnly ? '' : clip(outputText, CONFIG.limits.output),
      code,
    } : step ? {
      id: step.id, kind: 'step', finish: step.finish, model: step.model, status: step.status,
      time: step.time, tokens: step.tokens, cost: step.cost,
    } : null,
    prompts,
    siblings: tools.slice(-24).map((t) => ({ id: t.id, name: t.name, target: t.targetShort, status: t.status, time: t.time })),
  };
}

/* ============================ 8. HTTP 服务 ============================ */
import http from 'node:http';

/* 页面文件只在磁盘上真的变了才重读；CSP nonce 每次响应重新生成 */
const PAGE_CACHE = { html: null, mtimeMs: 0, size: -1 };
function loadPage() {
  const st = fs.statSync(PAGE_FILE);
  if (PAGE_CACHE.html !== null && st.mtimeMs === PAGE_CACHE.mtimeMs && st.size === PAGE_CACHE.size) {
    return PAGE_CACHE.html;
  }
  PAGE_CACHE.html = fs.readFileSync(PAGE_FILE, 'utf8');
  PAGE_CACHE.mtimeMs = st.mtimeMs;
  PAGE_CACHE.size = st.size;
  return PAGE_CACHE.html;
}
function cspNonce() {
  return crypto.randomBytes(12).toString('base64url');
}

const ORIGIN_OK = new Set([`http://127.0.0.1:${CONFIG.port}`, `http://localhost:${CONFIG.port}`]);

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}
function sendJSON(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'content-type': 'application/json; charset=utf-8' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const origin = req.headers.origin;
  if (origin && !ORIGIN_OK.has(origin)) {
    return send(res, 403, 'Origin not allowed');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Read-only');
  }

  try {
    if (url.pathname === '/') {
      let page;
      try {
        page = loadPage();
      } catch (e) {
        return send(res, 500, `缺少页面文件：${PAGE_FILE}\n请确认 opencode-dash.html 与 server.mjs 在同一目录。`);
      }
      const nonce = cspNonce();
      const html = page.replace(/__CSP_NONCE__/g, nonce);
      const csp = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        `style-src 'self' 'nonce-${nonce}'`,
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
      return send(res, 200, html, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': csp,
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
    }

    if (url.pathname === '/snapshot') {
      const snap = await buildSnapshot();
      return sendJSON(res, 200, snap);
    }

    if (url.pathname === '/detail') {
      const sid = url.searchParams.get('sessionID');
      const pid = url.searchParams.get('partID');
      const meta = url.searchParams.get('meta') === '1';
      if (!sid) return sendJSON(res, 400, { error: 'sessionID required' });
      const d = await buildDetail(sid, pid, meta);
      return sendJSON(res, 200, d);
    }

    if (url.pathname === '/health') {
      const info = await serviceInfo();
      const version = info?.version || null;
      return sendJSON(res, 200, { ok: !!version, opencode: { version }, lastError, port: CONFIG.port });
    }

    if (url.pathname === '/events') {
      // SSE：代理上游事件，过滤出我们关心的类型；上游断开后退避重连
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write('retry: 3000\n\n');

      let closed = false;
      let upstreamAbort = new AbortController();
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': ping\n\n');
      }, 15000);
      const emit = (obj) => {
        if (!res.writableEnded && !closed) res.write(`data: ${JSON.stringify(obj)}\n\n`);
      };
      req.on('close', () => {
        closed = true;
        upstreamAbort.abort();
        clearInterval(heartbeat);
      });

      const WANT = /^(session\.(tool|step|usage|active)\.|project\.updated$|server\.connected$)/;

      (async () => {
        let warned = false;
        while (!closed) {
          try {
            const svc = await ensureUpstream(true);
            if (!svc) throw new Error('NO_SERVICE');
            upstreamAbort = new AbortController();
            const up = await fetch(svc.base + '/api/event', {
              headers: { authorization: svc.auth },
              signal: upstreamAbort.signal,
            });
            if (!up.ok || !up.body) throw new Error('EVENT_FAIL');
            if (warned) { warned = false; emit({ type: 'bridge.ready', at: nowMs() }); }
            const reader = up.body.getReader();
            const dec = new TextDecoder();
            let buf = '';
            while (!closed) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let i;
              while ((i = buf.indexOf('\n\n')) >= 0) {
                const chunk = buf.slice(0, i);
                buf = buf.slice(i + 2);
                const dl = chunk.split('\n').find((l) => l.startsWith('data:'));
                if (!dl) continue;
                let evt;
                try { evt = JSON.parse(dl.slice(5).trim()); } catch { continue; }
                if (!WANT.test(evt.type || '')) continue;
                emit({ type: evt.type, sessionID: evt.data?.sessionID || null, at: nowMs() });
              }
            }
          } catch { /* 上游不可用或连接中断，统一走下面的退避重试 */ }
          if (closed) return;
          if (!warned) { warned = true; emit({ type: 'bridge.error', at: nowMs() }); }
          await sleep(2000);
        }
      })();
      return;
    }

    return send(res, 404, 'Not found');
  } catch (err) {
    if (url.pathname === '/snapshot') {
      return sendJSON(res, 200, {
        t: nowMs(),
        status: { code: err.message === 'NO_SERVICE' ? 'waiting' : 'stale', error: err.message, since: nowMs() },
        window: { hours: CONFIG.windowHours, from: windowStartMs() },
        stats: null, agents: [], projects: [], nodes: [], sessions: [], feed: [], workspace: null,
        note: { main: err.message === 'NO_SERVICE' ? '等待 OpenCode 启动…' : '数据暂不可用', sub: '' },
      });
    }
    if (url.pathname === '/detail') {
      return sendJSON(res, 404, { error: err.message });
    }
    return send(res, 500, String(err.message || err));
  }
});

/* ============================ 9. 启动 ============================ */
/* Windows 控制台默认是 GBK(936)，中文输出会乱码：先把控制台切到 UTF-8 */
async function ensureUtf8Console() {
  if (process.platform !== 'win32') return;
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync('chcp', { encoding: 'utf8' });
    const m = /(\d{3,5})/.exec(out);
    if (m && m[1] !== '65001') execSync('chcp 65001', { stdio: 'ignore', shell: 'cmd.exe' });
  } catch { /* 忽略 */ }
}

let listenAttempts = 0;

server.on('error', (err) => {
  // Windows 上旧连接处于 TIME_WAIT 时会短暂占住端口：自动重试
  if (err.code === 'EADDRINUSE' && listenAttempts < 60) {
    listenAttempts++;
    console.log(`  端口 ${CONFIG.port} 仍被占用（可能是上一个实例正在退出，Windows TIME_WAIT 残留），2 秒后重试 [${listenAttempts}/60]`);
    setTimeout(() => { server.listen(CONFIG.port, CONFIG.host, onListening); }, 2000);
    return;
  }
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[错误] 端口 ${CONFIG.port} 已被占用。`);
    console.error(`        请关闭占用该端口的程序，或修改 server.mjs 顶部的 CONFIG.port。\n`);
    process.exit(1);
  }
  console.error('[错误]', err.message);
  process.exit(1);
});

async function onListening() {
  await ensureUtf8Console();
  const url = `http://${CONFIG.host}:${CONFIG.port}/`;
  console.log('');
  console.log('  OpenCode 实时大屏 · 桥接已启动');
  console.log('  ---------------------------------------------');
  console.log(`  地址   : ${url}`);
  console.log(`  窗口   : 最近 ${CONFIG.windowHours} 小时`);
  console.log(`  模式   : 只读（不向 OpenCode 写入任何内容）`);
  console.log('  按 Ctrl+C 停止');
  console.log('');
  try {
    const info = await ocGet('/api/info');
    console.log(`  已连接 OpenCode v${info?.version || '?'}  →  ${info?.urls?.[0] || ''}`);
  } catch (e) {
    console.log(`  [等待] 尚未连接 OpenCode：${e.message}`);
    console.log('         OpenCode 启动后会自动接上，无需重启本程序。');
  }
  console.log('');
  if (process.argv.includes('--open')) {
    const { spawn } = await import('node:child_process');
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
}

server.listen(CONFIG.port, CONFIG.host, onListening);

process.on('SIGINT', () => { console.log('\n已停止。'); process.exit(0); });
