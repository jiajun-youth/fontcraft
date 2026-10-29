import {
  parseXml,
  serializeXml,
  el,
  getAttr,
  child,
  childrenOf,
  cloneNode,
  textContent,
  descendants,
} from './xml.js';
import { fontFor, isCjk } from './scheme.js';

/**
 * xlsx 的字体是「样式 → 字体」的间接引用：单元格只带 cellXfs 索引。
 * 因此做法是：为每个「角色 × 文字类别」组合准备一个 font，再为「原 xf + 新字体」
 * 组合生成新的 xf，把单元格的 s 指向它，从而保留原有的边框、填充、数字格式。
 */

function fontKey(name, sizePt, bold) {
  return `${name}|${sizePt}|${bold ? 'b' : 'r'}`;
}

function buildFontNode(name, sizePt, bold) {
  const children = [el('sz', { val: String(sizePt) }), el('name', { val: name })];
  if (bold) children.push(el('b'));
  children.push(el('family', { val: isCjkFont(name) ? '3' : '2' }));
  if (isCjkFont(name)) children.push(el('charset', { val: '134' }));
  return el('font', {}, children);
}

function isCjkFont(name) {
  return /宋|黑|楷|仿|雅黑|等线|圆|隶|魏|思源|微软|苹方|方正|华文/.test(name);
}

export function applyXlsxEntries(entries, scheme) {
  const stylesEntry = entries.get('xl/styles.xml');
  if (!stylesEntry) throw new Error('不是有效的 xlsx：缺少 xl/styles.xml');
  const styleDom = parseXml(stylesEntry.toString('utf8'));
  const styleRoot = styleDom.children.find((c) => c.type === 'element');
  const fontsContainer = child(styleRoot, 'fonts');
  const xfsContainer = child(styleRoot, 'cellXfs');
  if (!fontsContainer || !xfsContainer) throw new Error('xlsx styles.xml 结构异常：缺少 fonts/cellXfs');

  const fonts = childrenOf(fontsContainer, 'font');
  const xfs = childrenOf(xfsContainer, 'xf');
  const fontIndex = new Map();
  fonts.forEach((node, index) => fontIndex.set(serializeXml(node), index));

  const usedFonts = new Set();
  const usedXfs = new Map();
  const ensureFont = (name, sizePt, bold) => {
    const node = buildFontNode(name, sizePt, bold);
    const key = serializeXml(node);
    const found = fontIndex.get(key);
    if (found !== undefined) return found;
    const index = fontsContainer.children.length;
    fontsContainer.children.push(node);
    fontsContainer.selfClosing = false;
    fontIndex.set(key, index);
    usedFonts.add(index);
    return index;
  };

  const sst = readSharedStrings(entries);
  const stats = { paragraphs: 0, runs: 0, parts: [], roles: {} };

  for (const [name, buffer] of [...entries]) {
    if (!/^xl\/worksheets\/sheet\d*\.xml$/.test(name)) continue;
    const dom = parseXml(buffer.toString('utf8'));
    const root = dom.children.find((c) => c.type === 'element');
    const sheetData = child(root, 'sheetData');
    if (!sheetData) continue;
    const rows = childrenOf(sheetData, 'row');

    const headerRowIndex = detectHeaderRow(rows, sst);
    let touched = 0;

    rows.forEach((row, rowIndex) => {
      const isHeader = rowIndex < headerRowIndex;
      for (const cell of childrenOf(row, 'c')) {
        const info = cellInfo(cell, sst);
        if (!info) continue;
        const roleId = isHeader ? 'table' : 'body';
        const base = scheme.roles[roleId];
        const role = { id: roleId, ...base, bold: isHeader ? true : base.bold };
        const script = info.script;
        const fontName = fontFor(scheme, roleId, script);
        const fontId = ensureFont(fontName, role.size, role.bold);

        const originalXf = Number(getAttr(cell, 's') || 0);
        const xfNode = xfs[originalXf] || xfs[0];
        const xfKey = `${originalXf}|${fontId}`;
        let xfIndex = usedXfs.get(xfKey);
        if (xfIndex === undefined) {
          const copy = cloneNode(xfNode);
          copy.attrs = copy.attrs.filter((a) => a.name !== 'fontId');
          copy.attrs.push({ name: 'fontId', value: String(fontId) });
          copy.attrs = copy.attrs.filter((a) => a.name !== 'applyFont');
          copy.attrs.push({ name: 'applyFont', value: '1' });
          xfIndex = xfsContainer.children.length;
          xfsContainer.children.push(copy);
          xfsContainer.selfClosing = false;
          usedXfs.set(xfKey, xfIndex);
        }
        cell.attrs = cell.attrs.filter((a) => a.name !== 's');
        cell.attrs.push({ name: 's', value: String(xfIndex) });
        touched++;
        stats.roles[roleId] = (stats.roles[roleId] || 0) + 1;
      }
    });

    entries.set(name, Buffer.from(serializeXml(dom), 'utf8'));
    stats.parts.push(name);
    stats.runs += touched;
    stats.paragraphs += touched;
  }

  fontsContainer.attrs = fontsContainer.attrs.filter((a) => a.name !== 'count');
  fontsContainer.attrs.push({ name: 'count', value: String(fontsContainer.children.length) });
  xfsContainer.attrs = xfsContainer.attrs.filter((a) => a.name !== 'count');
  xfsContainer.attrs.push({ name: 'count', value: String(xfsContainer.children.length) });
  entries.set('xl/styles.xml', Buffer.from(serializeXml(styleDom), 'utf8'));
  stats.parts.push('xl/styles.xml');
  return stats;
}

function readSharedStrings(entries) {
  const entry = entries.get('xl/sharedStrings.xml');
  if (!entry) return [];
  const dom = parseXml(entry.toString('utf8'));
  const root = dom.children.find((c) => c.type === 'element');
  return childrenOf(root, 'si').map((si) => textContent(si));
}

function cellInfo(cell, sst) {
  const type = getAttr(cell, 't') || 'n';
  if (type === 'inlineStr') {
    const inline = child(cell, 'is');
    const value = inline ? textContent(inline) : '';
    if (!value.trim()) return null;
    return { script: scriptOf(value), text: value, numeric: false };
  }
  const vNode = child(cell, 'v');
  if (!vNode) return null;
  const raw = textContent(vNode);
  if (raw === '') return null;
  if (type === 's') {
    const value = sst[Number(raw)] ?? '';
    if (!value.trim()) return null;
    return { script: scriptOf(value), text: value, numeric: false };
  }
  if (type === 'str' || type === 'b' || type === 'e') {
    return { script: scriptOf(raw), text: raw, numeric: false };
  }
  return { script: 'digit', text: raw, numeric: true };
}

function scriptOf(text) {
  let hasDigit = false;
  let hasLetter = false;
  let hasCjk = false;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x30 && code <= 0x39) hasDigit = true;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) hasLetter = true;
    else if (isCjk(code)) hasCjk = true;
  }
  if (hasCjk) return 'cjk';
  if (hasLetter) return 'latin';
  if (hasDigit) return 'digit';
  return 'latin';
}

/**
 * 表头识别：首行若全是文本、且下一行出现了数字，就把首行当表头（最多 3 行连续文本）。
 */
function detectHeaderRow(rows, sst) {
  let headerRows = 0;
  for (let i = 0; i < Math.min(rows.length, 3); i++) {
    const cells = childrenOf(rows[i], 'c').map((c) => cellInfo(c, sst)).filter(Boolean);
    if (cells.length === 0) break;
    const textOnly = cells.every((info) => !info.numeric);
    if (!textOnly) break;
    const next = rows[i + 1] ? childrenOf(rows[i + 1], 'c').map((c) => cellInfo(c, sst)).filter(Boolean) : [];
    if (next.some((info) => info.numeric)) return i + 1;
    if (i === 0) headerRows = 1;
  }
  return headerRows;
}

export function inspectXlsxFonts(entries) {
  const found = new Map();
  const entry = entries.get('xl/styles.xml');
  if (!entry) return found;
  const dom = parseXml(entry.toString('utf8'));
  const root = dom.children.find((c) => c.type === 'element');
  const fonts = child(root, 'fonts');
  for (const font of childrenOf(fonts, 'font')) {
    const name = child(font, 'name');
    const size = child(font, 'sz');
    if (name) {
      const face = getAttr(name, 'val');
      if (face) found.set(face, (found.get(face) || 0) + 1);
    }
    if (size) {
      const pt = getAttr(size, 'val');
      if (pt) found.set(`${pt}pt`, (found.get(`${pt}pt`) || 0) + 1);
    }
  }
  return found;
}
