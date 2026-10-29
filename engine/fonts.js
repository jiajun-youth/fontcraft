import { execFileSync } from 'node:child_process';

/**
 * 列出本机可用字体。Windows 走注册表（PowerShell 以 UTF-8 输出），
 * 其他平台返回内置的中文字体清单 + 常见西文字体，避免面板空着。
 */

const FALLBACK_FONTS = [
  '宋体', '新宋体', '黑体', '微软雅黑', '微软雅黑 Light', '楷体', '仿宋', '等线', '等线 Light',
  '方正小标宋简体', '方正仿宋简体', '方正黑体简体', '方正楷体简体', '思源宋体', '思源黑体',
  '华文中宋', '华文细黑', '幼圆', '隶书', 'Times New Roman', 'Arial', 'Calibri', 'Cambria',
  'Georgia', 'Garamond', 'Consolas', 'Courier New', 'Segoe UI', 'Verdana', 'Tahoma',
];

const CJK_RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;

let cache = null;

export function listFonts({ refresh = false } = {}) {
  if (cache && !refresh) return cache;
  let names = [];
  if (process.platform === 'win32') {
    names = readWindowsFonts();
  }
  if (names.length === 0) names = FALLBACK_FONTS;
  const unique = [...new Set(names)].filter((n) => n && n.length <= 60);
  const cjk = unique.filter((n) => CJK_RE.test(n)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const latin = unique.filter((n) => !CJK_RE.test(n)).sort((a, b) => a.localeCompare(b, 'en'));
  cache = { all: [...cjk, ...latin], cjk, latin };
  return cache;
}

function readWindowsFonts() {
  const script = [
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
    "$p = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts' -ErrorAction Stop;",
    '$p.PSObject.Properties | Where-Object { $_.Name -notlike "PS*" } | ForEach-Object { $_.Name }',
  ].join(' ');
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
    });
    const names = [];
    for (const rawLine of out.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      // "宋体 & 新宋体 (TrueType)" -> 宋体、新宋体；"Arial Bold (TrueType)" -> Arial Bold
      const base = line.replace(/\s*\((TrueType|OpenType|Type 1|TrueType Collection)\)\s*$/i, '').trim();
      if (!base) continue;
      for (const alias of base.split(/\s*&\s*/)) {
        const name = alias.trim();
        if (!name || name.length > 60) continue;
        if (/^\d/.test(name)) continue;
        names.push(name);
      }
    }
    return names;
  } catch {
    return [];
  }
}

export function resolveFont(requested, { prefer = 'latin' } = {}) {
  const fonts = listFonts();
  const pool = prefer === 'cjk' ? fonts.cjk : fonts.all;
  if (!requested) return pool[0];
  const exact = pool.find((f) => f.toLowerCase() === String(requested).toLowerCase());
  if (exact) return exact;
  const partial = pool.find((f) => f.toLowerCase().includes(String(requested).toLowerCase()));
  return partial || requested;
}
