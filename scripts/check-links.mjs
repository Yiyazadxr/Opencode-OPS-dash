// 文档链接自检：零依赖，直接 `node scripts/check-links.mjs`
//
// 检查三件事：
//   1. Markdown 里的相对链接指向的文件存在
//   2. `[X.md](...)` 的标签与目标文件名一致（防止链接贴错文件）
//   3. 仓库内没有指向已不存在文件的绝对链接
//
// 外部链接（http/https/mailto）不做网络请求，只跳过。

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build"]);
const errors = [];
let scanned = 0;
let links = 0;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(join(dir, entry.name));
    } else if (entry.name.endsWith(".md")) {
      await checkFile(join(dir, entry.name));
    }
  }
}

async function checkFile(file) {
  scanned += 1;
  const text = await readFile(file, "utf8");
  const shown = relative(root, file).split(sep).join("/");

  for (const match of text.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const label = match[1].trim();
    const target = match[2].trim();
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    links += 1;

    const [rawPath, anchor = ""] = target.split("#");
    if (!rawPath) continue;

    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      errors.push(`${shown}: 链接无法解码 -> ${target}`);
      continue;
    }

    const resolved = resolve(dirname(file), decoded);
    if (!resolved.startsWith(root)) {
      errors.push(`${shown}: 链接指向仓库外 -> ${target}`);
      continue;
    }

    let info = null;
    try {
      info = await stat(resolved);
    } catch {
      errors.push(`${shown}: 目标不存在 -> ${target}`);
      continue;
    }

    if (info.isDirectory()) continue;

    // 标签写了 .md，就必须指向同名文件
    if (/\.md$/i.test(label)) {
      const labelLeaf = label.split("/").pop().toLowerCase();
      const targetLeaf = decoded.split("/").pop().toLowerCase();
      if (labelLeaf !== targetLeaf) {
        errors.push(`${shown}: 标签与目标不一致 -> [${label}](${target})`);
      }
    }

    // 同文件锚点只做存在性提示，不校验 slug（GitHub 的规则随版本变化）
    if (anchor && !decoded) {
      const headings = text.match(/^#{1,6}\s+.+$/gm) ?? [];
      if (headings.length === 0) {
        errors.push(`${shown}: 锚点 #${anchor} 所在文件没有标题`);
      }
    }
  }
}

await walk(root);

if (errors.length) {
  console.error(`check-links: ${errors.length} 个问题（扫描 ${scanned} 个文件，${links} 条相对链接）`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`check-links: OK（${scanned} 个文件，${links} 条相对链接）`);
