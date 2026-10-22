// 页面与启动器自检：零依赖，直接 `node scripts/check-page.mjs`
//
// 检查三件事：
//   1. `start-dashboard.cmd` 只含 ASCII（cmd.exe 按系统代码页 936 解码，非 ASCII 会乱码）
//   2. `opencode-dash.html` 不引用任何外部资源（src / href / url() / @import）
//   3. 仓库没有误加 `package.json`（保持零 npm 依赖）

import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

// 1) 启动器 ASCII
const launcher = await readFile(join(root, "start-dashboard.cmd"));
for (let i = 0; i < launcher.length; i += 1) {
  if (launcher[i] > 0x7f) {
    const line = launcher.subarray(0, i).toString("latin1").split(/\r?\n/).length;
    errors.push(`start-dashboard.cmd: 第 ${line} 行含非 ASCII 字节 0x${launcher[i].toString(16)}`);
    break;
  }
}

// 2) 页面零外部请求
const page = await readFile(join(root, "opencode-dash.html"), "utf8");
const external = [
  [/<(?:script|link|img|iframe|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*["']https?:\/\//gi, "外部资源引用"],
  [/url\(\s*["']?https?:\/\//gi, "CSS 外部资源"],
  [/@import\s+(?:url\()?["']?https?:\/\//gi, "CSS @import"],
  [/\bfetch\s*\(\s*["'`]https?:\/\//gi, "运行时 fetch"],
  [/\bnew\s+WebSocket\s*\(\s*["'`]wss?:\/\//gi, "运行时 WebSocket"],
];
for (const [pattern, label] of external) {
  const hit = page.match(pattern);
  if (hit) errors.push(`opencode-dash.html: ${label} -> ${hit[0].slice(0, 80)}`);
}
if (!/Content-Security-Policy/i.test(page) && !/Content-Security-Policy/i.test(await readFile(join(root, "server.mjs"), "utf8"))) {
  errors.push("未找到 CSP 配置（页面或 server.mjs 应至少有一处设置内容安全策略）");
}

// 3) 零 npm 依赖
try {
  await stat(join(root, "package.json"));
  errors.push("package.json 存在：本项目应保持零 npm 依赖");
} catch {
  // 不存在才是期望状态
}

if (errors.length) {
  console.error(`check-page: ${errors.length} 个问题`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("check-page: OK（启动器纯 ASCII、页面零外部请求、无 package.json）");
