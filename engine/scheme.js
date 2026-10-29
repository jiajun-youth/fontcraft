/**
 * fontcraft 排版方案模型。
 *
 * 两层结构：
 *  - scripts：文字类别（中文 / 英文 / 数字）各自的字体；
 *  - roles：文字角色（封面标题、各级标题、正文、图表注、表格、页眉页脚、代码）
 *    的字号、加粗、对齐、行距、缩进，可选地覆盖某一类文字的字体。
 */

export const SCRIPT_KEYS = ['cjk', 'latin', 'digit'];

export const SCRIPTS = [
  { key: 'cjk', label: '中文', hint: '汉字与中文标点' },
  { key: 'latin', label: '英文', hint: '拉丁字母单词' },
  { key: 'digit', label: '数字', hint: '0-9 与百分号等数字符号' },
];

/** 字号对照（磅 pt）。 */
export const SIZE_PRESETS = [
  { pt: 22, name: '二号' },
  { pt: 18, name: '小二' },
  { pt: 16, name: '三号' },
  { pt: 15, name: '小三' },
  { pt: 14, name: '四号' },
  { pt: 12, name: '小四' },
  { pt: 10.5, name: '五号' },
  { pt: 9, name: '小五' },
  { pt: 8, name: '六号' },
  { pt: 28, name: '28pt' },
  { pt: 26, name: '26pt' },
  { pt: 24, name: '24pt' },
  { pt: 20, name: '20pt' },
  { pt: 13, name: '13pt' },
  { pt: 11, name: '11pt' },
];

export function sizeName(pt) {
  const found = SIZE_PRESETS.find((s) => Math.abs(s.pt - Number(pt)) < 0.001);
  return found ? found.name : `${pt}pt`;
}

export const ROLE_ORDER = [
  'coverTitle',
  'title1',
  'title2',
  'title3',
  'body',
  'caption',
  'table',
  'header',
  'footer',
  'code',
];

export const ROLES = {
  coverTitle: { label: '封面标题', sample: '项目结题报告', formats: ['docx'] },
  title1: { label: '一级标题', sample: '一、研究背景与目标', formats: ['docx', 'pptx', 'xlsx'] },
  title2: { label: '二级标题', sample: '（一）国内外研究现状', formats: ['docx', 'pptx'] },
  title3: { label: '三级标题', sample: '1. 关键技术路线', formats: ['docx', 'pptx'] },
  body: { label: '正文', sample: '本年度共完成 3 项实验，准确率达到 96.8%，详见 Appendix A。', formats: ['docx', 'pptx', 'xlsx'] },
  caption: { label: '图表注', sample: '图 1  系统总体架构（2026 年 10 月）', formats: ['docx', 'pptx', 'xlsx'] },
  table: { label: '表格文字', sample: '指标名称 / Accuracy / 96.8%', formats: ['docx', 'pptx', 'xlsx'] },
  header: { label: '页眉', sample: 'fontcraft 用户手册', formats: ['docx'] },
  footer: { label: '页脚', sample: '第 1 页 共 8 页', formats: ['docx'] },
  code: { label: '代码 / 等宽', sample: 'npm install fontcraft --save', formats: ['docx'] },
};

const CJK_FALLBACK = '宋体';
const LATIN_FALLBACK = 'Times New Roman';

export function baseRole(patch = {}) {
  return {
    size: 12,
    bold: false,
    align: null,
    lineSpacing: null, // null=保持原样；{mode:'multiple'|'exact', value}
    spaceBefore: null,
    spaceAfter: null,
    firstLineIndent: null, // 字符数
    font: {},
    ...patch,
  };
}

/** 内置方案。只保留与默认值不同的字段，便于用户读懂与手工编辑。 */
export const BUILTIN_SCHEMES = [
  {
    id: 'cn-paper',
    name: '中文论文（标准）',
    description: '标题黑体、正文宋体小四、英文与数字 Times New Roman，行距 1.5 倍。',
    scripts: { cjk: { font: '宋体' }, latin: { font: 'Times New Roman' }, digit: { font: 'Times New Roman' } },
    roles: {
      coverTitle: baseRole({ size: 22, bold: true, align: 'center' }),
      title1: baseRole({ size: 16, bold: true, align: 'center', spaceBefore: 12, spaceAfter: 12, font: { cjk: '黑体', latin: 'Arial', digit: 'Arial' } }),
      title2: baseRole({ size: 14, bold: true, align: 'left', spaceBefore: 6, spaceAfter: 6, font: { cjk: '黑体', latin: 'Arial', digit: 'Arial' } }),
      title3: baseRole({ size: 12, bold: true, align: 'left', spaceBefore: 6, spaceAfter: 3, font: { cjk: '黑体', latin: 'Arial', digit: 'Arial' } }),
      body: baseRole({ size: 12, align: 'justify', lineSpacing: { mode: 'multiple', value: 1.5 }, firstLineIndent: 2 }),
      caption: baseRole({ size: 10.5, align: 'center', spaceBefore: 6, spaceAfter: 6 }),
      table: baseRole({ size: 10.5, align: 'left', lineSpacing: { mode: 'multiple', value: 1.25 }, spaceBefore: 0, spaceAfter: 0 }),
      header: baseRole({ size: 9, align: 'center' }),
      footer: baseRole({ size: 9, align: 'center' }),
      code: baseRole({ size: 10, align: 'left', font: { cjk: '等线', latin: 'Consolas', digit: 'Consolas' } }),
    },
  },
  {
    id: 'cn-gov',
    name: '党政机关公文（GB/T 9704）',
    description: '标题方正小标宋二号、正文仿宋三号、行距固定 28 磅，数字与英文 Times New Roman。',
    scripts: { cjk: { font: '仿宋' }, latin: { font: 'Times New Roman' }, digit: { font: 'Times New Roman' } },
    roles: {
      coverTitle: baseRole({ size: 22, align: 'center', font: { cjk: '方正小标宋简体' } }),
      title1: baseRole({ size: 22, align: 'center', font: { cjk: '方正小标宋简体' } }),
      title2: baseRole({ size: 16, align: 'left', font: { cjk: '楷体' } }),
      title3: baseRole({ size: 16, align: 'left', font: { cjk: '仿宋' }, bold: true }),
      body: baseRole({ size: 16, align: 'justify', lineSpacing: { mode: 'exact', value: 28 }, firstLineIndent: 2 }),
      caption: baseRole({ size: 10.5, align: 'center', spaceBefore: 6, spaceAfter: 6 }),
      table: baseRole({ size: 10.5, align: 'left', lineSpacing: { mode: 'multiple', value: 1.25 }, spaceBefore: 0, spaceAfter: 0 }),
      header: baseRole({ size: 9, align: 'center' }),
      footer: baseRole({ size: 9, align: 'center' }),
      code: baseRole({ size: 10, align: 'left', font: { cjk: '等线', latin: 'Consolas', digit: 'Consolas' } }),
    },
  },
  {
    id: 'modern-sans',
    name: '现代商务（无衬线）',
    description: '微软雅黑 + Calibri，标题深色加粗，适合汇报与方案文档。',
    scripts: { cjk: { font: '微软雅黑' }, latin: { font: 'Calibri' }, digit: { font: 'Calibri' } },
    roles: {
      coverTitle: baseRole({ size: 26, bold: true, align: 'center' }),
      title1: baseRole({ size: 18, bold: true, align: 'left', spaceBefore: 12, spaceAfter: 8 }),
      title2: baseRole({ size: 14, bold: true, align: 'left', spaceBefore: 8, spaceAfter: 4 }),
      title3: baseRole({ size: 12, bold: true, align: 'left', spaceBefore: 6, spaceAfter: 4 }),
      body: baseRole({ size: 11, align: 'justify', lineSpacing: { mode: 'multiple', value: 1.4 }, firstLineIndent: 0 }),
      caption: baseRole({ size: 9, align: 'center', spaceBefore: 6, spaceAfter: 6 }),
      table: baseRole({ size: 9.5, align: 'left', lineSpacing: { mode: 'multiple', value: 1.25 }, spaceBefore: 0, spaceAfter: 0 }),
      header: baseRole({ size: 8.5, align: 'right' }),
      footer: baseRole({ size: 8.5, align: 'center' }),
      code: baseRole({ size: 9.5, align: 'left', font: { cjk: '等线', latin: 'Consolas', digit: 'Consolas' } }),
    },
  },
  {
    id: 'cn-official-report',
    name: '工作总结（宋体正文）',
    description: '标题黑体、正文宋体三号、行距 1.5 倍，数字用 Arial 更醒目。',
    scripts: { cjk: { font: '宋体' }, latin: { font: 'Arial' }, digit: { font: 'Arial' } },
    roles: {
      coverTitle: baseRole({ size: 24, bold: true, align: 'center' }),
      title1: baseRole({ size: 16, bold: true, align: 'center', spaceBefore: 12, spaceAfter: 12, font: { cjk: '黑体' } }),
      title2: baseRole({ size: 14, bold: true, align: 'left', spaceBefore: 6, spaceAfter: 6, font: { cjk: '楷体' } }),
      title3: baseRole({ size: 12, bold: true, align: 'left' }),
      body: baseRole({ size: 16, align: 'justify', lineSpacing: { mode: 'multiple', value: 1.5 }, firstLineIndent: 2 }),
      caption: baseRole({ size: 10.5, align: 'center', spaceBefore: 6, spaceAfter: 6 }),
      table: baseRole({ size: 10.5, align: 'left', lineSpacing: { mode: 'multiple', value: 1.25 }, spaceBefore: 0, spaceAfter: 0 }),
      header: baseRole({ size: 9, align: 'center' }),
      footer: baseRole({ size: 9, align: 'center' }),
      code: baseRole({ size: 10, align: 'left', font: { cjk: '等线', latin: 'Consolas', digit: 'Consolas' } }),
    },
  },
];

export function blankScheme(name = '自定义方案') {
  const template = BUILTIN_SCHEMES[0];
  return normalize({
    id: `custom-${Date.now().toString(36)}`,
    name,
    description: '自定义字体方案',
    scripts: template.scripts,
    roles: template.roles,
  });
}

export function normalize(scheme) {
  const source = scheme && typeof scheme === 'object' ? scheme : {};
  const fallback = BUILTIN_SCHEMES[0];
  const scripts = {};
  for (const key of SCRIPT_KEYS) {
    const given = (source.scripts && source.scripts[key]) || (fallback.scripts && fallback.scripts[key]) || {};
    scripts[key] = { font: cleanFont(given.font) || (key === 'cjk' ? CJK_FALLBACK : LATIN_FALLBACK) };
  }
  const roles = {};
  for (const roleId of ROLE_ORDER) {
    const given = (source.roles && source.roles[roleId]) || (fallback.roles && fallback.roles[roleId]) || {};
    roles[roleId] = normalizeRole(given);
  }
  return {
    id: String(source.id || fallback.id),
    name: String(source.name || fallback.name).slice(0, 60),
    description: String(source.description || ''),
    scripts,
    roles,
  };
}

function cleanFont(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return '';
  return trimmed;
}

function normalizeRole(role) {
  const size = Number(role.size);
  const out = baseRole({
    size: Number.isFinite(size) ? clamp(size, 5, 96) : 12,
    bold: Boolean(role.bold),
    align: ['left', 'center', 'right', 'justify'].includes(role.align) ? role.align : null,
    lineSpacing: normalizeSpacing(role.lineSpacing),
    spaceBefore: finiteOrNull(role.spaceBefore),
    spaceAfter: finiteOrNull(role.spaceAfter),
    firstLineIndent: finiteOrNull(role.firstLineIndent),
    font: {},
  });
  for (const key of SCRIPT_KEYS) {
    const font = cleanFont(role.font && role.font[key]);
    if (font) out.font[key] = font;
  }
  return out;
}

function normalizeSpacing(spacing) {
  if (!spacing || typeof spacing !== 'object') return null;
  const value = Number(spacing.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const mode = spacing.mode === 'exact' ? 'exact' : 'multiple';
  return { mode, value: clamp(value, mode === 'exact' ? 6 : 0.8, mode === 'exact' ? 120 : 3) };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? clamp(num, 0, 500) : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** 取某角色、某类文字最终使用的字体（角色覆盖优先，其次类别默认）。 */
export function fontFor(scheme, roleId, scriptKey) {
  const role = scheme.roles[roleId] || {};
  const override = role.font && role.font[scriptKey];
  if (override) return override;
  const script = scheme.scripts[scriptKey];
  return (script && script.font) || (scriptKey === 'cjk' ? CJK_FALLBACK : LATIN_FALLBACK);
}

/** 按字符类别切分文本，保持顺序；空白与标点跟随前一段的类别。 */
export function splitByScript(input) {
  const segments = [];
  let current = null;
  for (const ch of String(input)) {
    const kind = charKind(ch);
    if (kind === 'space' || kind === 'other') {
      if (current) {
        current.text += ch;
      } else {
        current = { kind: 'other', text: ch };
        segments.push(current);
      }
      continue;
    }
    if (!current || (current.kind !== kind && current.kind !== 'other')) {
      current = { kind, text: ch };
      segments.push(current);
    } else if (current.kind === 'other') {
      current.kind = kind;
      current.text += ch;
    } else {
      current.text += ch;
    }
  }
  return segments;
}

export function charKind(ch) {
  const code = ch.codePointAt(0);
  if (code <= 0x20) return 'space';
  if ((code >= 0x30 && code <= 0x39) || (code >= 0xff10 && code <= 0xff19)) return 'digit';
  if (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0xff21 && code <= 0xff3a) ||
    (code >= 0xff41 && code <= 0xff5a)
  )
    return 'latin';
  if (isCjk(code)) return 'cjk';
  if (code >= 0x00c0 && code <= 0x024f) return 'latin'; // 带音标拉丁
  if (code >= 0x0370 && code <= 0x03ff) return 'latin'; // 希腊字母
  if (code >= 0x0400 && code <= 0x04ff) return 'latin'; // 西里尔字母
  return 'other';
}

export function isCjk(code) {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // 基本汉字
    (code >= 0x3400 && code <= 0x4dbf) || // 扩展 A
    (code >= 0xf900 && code <= 0xfaff) || // 兼容汉字
    (code >= 0x3000 && code <= 0x303f) || // 中文标点
    (code >= 0xff00 && code <= 0xffef) || // 全角字符
    (code >= 0x20000 && code <= 0x2fa1f) // 扩展 B 起
  );
}

/** 方案摘要，用于工具返回值和提示词。 */
export function describeScheme(scheme) {
  const lines = [`方案：${scheme.name}${scheme.description ? `（${scheme.description}）` : ''}`];
  lines.push(
    `文字类别字体：中文 ${scheme.scripts.cjk.font} / 英文 ${scheme.scripts.latin.font} / 数字 ${scheme.scripts.digit.font}`,
  );
  lines.push('角色设置：');
  for (const roleId of ROLE_ORDER) {
    const role = scheme.roles[roleId];
    const fonts = SCRIPT_KEYS.map((key) => `${SCRIPTS.find((s) => s.key === key).label} ${fontFor(scheme, roleId, key)}`).join('，');
    const extras = [];
    extras.push(`${role.size}pt(${sizeName(role.size)})`);
    if (role.bold) extras.push('加粗');
    if (role.align) extras.push(`对齐 ${role.align}`);
    if (role.lineSpacing) extras.push(role.lineSpacing.mode === 'exact' ? `固定行距 ${role.lineSpacing.value}pt` : `${role.lineSpacing.value} 倍行距`);
    if (role.firstLineIndent != null) extras.push(`首行缩进 ${role.firstLineIndent} 字符`);
    lines.push(`- ${ROLES[roleId].label}：${extras.join('，')}；${fonts}`);
  }
  return lines.join('\n');
}
