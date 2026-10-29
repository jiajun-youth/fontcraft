/**
 * 用 DSH 自带的 LibreOfficeKit 把 docx 渲染成 PNG，方便肉眼核对排版。
 *
 * 用法：
 *   node scripts/render-docx.mjs examples/demo-after.docx [输出目录]
 *
 * 需要 DeepSeek Harness 安装目录里的 @deepseek-ai/libreoffice-kit。
 * 找不到时可用环境变量 DSH_KIT_CLI 指定 ...\libreoffice-kit\lib\cli.js 的绝对路径。
 * 这个脚本是可选的：插件本身不依赖它，只有做视觉验收时才用。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const input = process.argv[2];
if (!input || !fs.existsSync(input)) {
  console.error('用法：node scripts/render-docx.mjs <file.docx> [outDir]');
  process.exit(1);
}

function findKitCli() {
  if (process.env.DSH_KIT_CLI && fs.existsSync(process.env.DSH_KIT_CLI)) return process.env.DSH_KIT_CLI;
  const roots = [
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache', '_npx'),
    path.join(os.homedir(), '.npm', '_npx'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const candidate = path.join(root, dir, 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'cli.js');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const cli = findKitCli();
if (!cli) {
  console.error('没有找到 libreoffice-kit 的 cli.js，请设置 DSH_KIT_CLI 环境变量指向它。');
  process.exit(2);
}

const outDir = process.argv[3] || path.join('render', `page-${Date.now()}`);
fs.mkdirSync(path.dirname(outDir), { recursive: true });
const result = spawnSync(process.execPath, [cli, 'render', '--input', path.resolve(input), '--output-dir', path.resolve(outDir), '--pages', 'all', '--dpi', '120'], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
