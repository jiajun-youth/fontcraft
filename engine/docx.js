import {
  parseXml,
  serializeXml,
  el,
  text as textNode,
  getAttr,
  setAttr,
  child,
  childrenOf,
  ensureChild,
  cloneNode,
  textContent,
} from './xml.js';
import { fontFor, splitByScript } from './scheme.js';

const RPR_ORDER = [
  'w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps', 'w:strike', 'w:dstrike',
  'w:outline', 'w:shadow', 'w:emboss', 'w:imprint', 'w:noProof', 'w:snapToGrid', 'w:vanish', 'w:webHidden',
  'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position', 'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect',
  'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout',
  'w:specVanish', 'w:oMath',
];

const PPR_ORDER = [
  'w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl', 'w:numPr',
  'w:suppressLineNumbers', 'w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap',
  'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd',
  'w:snapToGrid', 'w:spacing', 'w:ind', 'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap', 'w:jc',
  'w:textDirection', 'w:textAlignment', 'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr',
  'w:sectPr', 'w:pPrChange',
];

/** 按 OOXML schema 顺序放置子元素，替换已存在的同名单例元素。 */
export function setOrdered(parent, name, order, attrs) {
  parent.children = parent.children.filter((c) => !(c.type === 'element' && c.name === name));
  const node = el(name, attrs);
  const rank = order.indexOf(name);
  let insertAt = parent.children.length;
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i];
    if (c.type !== 'element') continue;
    const otherRank = order.indexOf(c.name);
    if (otherRank === -1) continue;
    if (rank !== -1 && otherRank > rank) {
      insertAt = i;
      break;
    }
  }
  parent.children.splice(insertAt, 0, node);
  parent.selfClosing = false;
  return node;
}

const STYLE_ROLE_MAP = [
  [/^(title|封面标题|文档标题)$/, 'coverTitle'],
  [/^subtitle$/, 'title2'],
  [/^caption$|^题注$/, 'caption'],
  [/^header$|^页眉$/, 'header'],
  [/^footer$|^页脚$/, 'footer'],
  [/^(code|sourcecode|htmlpreformatted|macrotext)$/, 'code'],
];

export function roleForStyleId(styleId) {
  const raw = String(styleId || '').trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
  const heading = /^heading([1-9])$/.exec(key) || /^标题([1-9])$/.exec(key) || /^([1-9])级标题$/.exec(key);
  if (heading) {
    const level = Number(heading[1]);
    return level === 1 ? 'title1' : level === 2 ? 'title2' : 'title3';
  }
  for (const [pattern, role] of STYLE_ROLE_MAP) {
    if (pattern.test(raw.toLowerCase()) || pattern.test(raw)) return role;
  }
  return null;
}

function detectRole(paragraph, inTable) {
  const pPr = child(paragraph, 'w:pPr');
  const styleEl = pPr && child(pPr, 'w:pStyle');
  const styleId = styleEl && getAttr(styleEl, 'w:val');
  const byStyle = roleForStyleId(styleId);
  if (byStyle && !inTable) return byStyle;
  const outline = pPr && child(pPr, 'w:outlineLvl');
  if (outline) {
    const level = Number(getAttr(outline, 'w:val'));
    if (Number.isFinite(level)) return level === 0 ? 'title1' : level === 1 ? 'title2' : 'title3';
  }
  if (inTable) return 'table';
  return byStyle || 'body';
}

function isRun(node) {
  return node.type === 'element' && node.name === 'w:r';
}

/** 找到某个段落内所有 w:r，包括超链接、修订插入等容器里的。 */
function collectRuns(node, out = []) {
  for (const c of node.children) {
    if (c.type !== 'element') continue;
    if (isRun(c)) out.push(c);
    else collectRuns(c, out);
  }
  return out;
}

function fontElements(rPr, role, scheme, scriptKind) {
  const latinFont = fontFor(scheme, role.id, scriptKind === 'digit' ? 'digit' : 'latin');
  const cjkFont = fontFor(scheme, role.id, 'cjk');
  setOrdered(rPr, 'w:rFonts', RPR_ORDER, {
    'w:ascii': latinFont,
    'w:hAnsi': latinFont,
    'w:eastAsia': cjkFont,
    'w:cs': latinFont,
  });
  const half = String(Math.round(role.size * 2));
  setOrdered(rPr, 'w:sz', RPR_ORDER, { 'w:val': half });
  setOrdered(rPr, 'w:szCs', RPR_ORDER, { 'w:val': half });
}

function makeRun(baseRPr, attrs) {
  const rPr = cloneNode(baseRPr);
  return { rPr, attrs, children: [] };
}

/**
 * 把段落中的 run 按字符类别切段并写入字体/字号。
 * 返回实际改写的 run 数。
 */
function applyParagraphRuns(paragraph, role, scheme) {
  const runs = collectRuns(paragraph);
  let changed = 0;
  for (const run of runs) {
    const originalRPr = child(run, 'w:rPr');
    const baseRPr = originalRPr ? cloneNode(originalRPr) : el('w:rPr');
    const replacements = [];
    let pending = null; // { kind, text }

    const flush = () => {
      if (!pending) return;
      const rPr = cloneNode(baseRPr);
      if (role.bold) {
        setOrdered(rPr, 'w:b', RPR_ORDER, {});
        setOrdered(rPr, 'w:bCs', RPR_ORDER, {});
      }
      fontElements(rPr, role, scheme, pending.kind === 'digit' ? 'digit' : pending.kind === 'cjk' ? 'cjk' : 'latin');
      const t = el('w:t', { 'xml:space': 'preserve' }, [textNode(pending.text)]);
      replacements.push({ kind: 'run', node: el('w:r', {}, [rPr, t]) });
      pending = null;
    };

    for (const node of run.children) {
      if (node.type !== 'element' || node.name !== 'w:rPr') {
        if (node.type === 'element' && node.name === 'w:t') {
          for (const seg of splitByScript(textContent(node))) {
            if (pending && pending.kind === seg.kind) pending.text += seg.text;
            else {
              flush();
              pending = { kind: seg.kind, text: seg.text };
            }
          }
          continue;
        }
        // tab / break / drawing / field char 等：原样保留在一个独立 run 里
        flush();
        const rPr = cloneNode(baseRPr);
        fontElements(rPr, role, scheme, 'latin');
        if (role.bold) setOrdered(rPr, 'w:b', RPR_ORDER, {});
        replacements.push({ kind: 'other', node: el('w:r', {}, [rPr, cloneNode(node)]) });
      }
    }
    flush();

    if (replacements.length === 0) {
      // 没有 w:t 的 run（例如只有图片）：至少统一字体，供段落标记与后续输入继承
      const rPr = child(run, 'w:rPr') || el('w:rPr');
      if (!child(run, 'w:rPr')) {
        run.children.unshift(rPr);
        run.selfClosing = false;
      }
      fontElements(rPr, role, scheme, 'latin');
      if (role.bold) setOrdered(rPr, 'w:b', RPR_ORDER, {});
      changed++;
      continue;
    }

    const parent = findParentOf(paragraph, run) || paragraph;
    const idx = parent.children.indexOf(run);
    parent.children.splice(idx, 1, ...replacements.map((r) => r.node));
    changed++;
  }
  return changed;
}

function findParentOf(root, target) {
  for (const c of root.children) {
    if (c === target) return root;
    if (c.type === 'element') {
      const found = findParentOf(c, target);
      if (found) return found;
    }
  }
  return null;
}

function applyParagraphProps(paragraph, role, scheme) {
  const pPr = ensureChild(paragraph, 'w:pPr');
  if (paragraph.children[0] !== pPr) {
    paragraph.children = paragraph.children.filter((c) => c !== pPr);
    paragraph.children.unshift(pPr);
  }
  paragraph.selfClosing = false;

  if (role.align) {
    const val = role.align === 'justify' ? 'both' : role.align;
    setOrdered(pPr, 'w:jc', PPR_ORDER, { 'w:val': val });
  }

  const spacingAttrs = {};
  if (role.lineSpacing) {
    if (role.lineSpacing.mode === 'exact') {
      spacingAttrs['w:line'] = String(Math.round(role.lineSpacing.value * 20));
      spacingAttrs['w:lineRule'] = 'exact';
    } else {
      spacingAttrs['w:line'] = String(Math.round(role.lineSpacing.value * 240));
      spacingAttrs['w:lineRule'] = 'auto';
    }
  }
  if (role.spaceBefore != null) spacingAttrs['w:before'] = String(Math.round(role.spaceBefore * 20));
  if (role.spaceAfter != null) spacingAttrs['w:after'] = String(Math.round(role.spaceAfter * 20));
  if (Object.keys(spacingAttrs).length) {
    const existing = child(pPr, 'w:spacing');
    const merged = { ...(existing ? Object.fromEntries(existing.attrs.map((a) => [a.name, a.value])) : {}), ...spacingAttrs };
    setOrdered(pPr, 'w:spacing', PPR_ORDER, merged);
  }

  if (role.firstLineIndent != null) {
    const existing = child(pPr, 'w:ind');
    const merged = { ...(existing ? Object.fromEntries(existing.attrs.map((a) => [a.name, a.value])) : {}) };
    delete merged['w:hanging'];
    delete merged['w:hangingChars'];
    merged['w:firstLineChars'] = String(Math.round(role.firstLineIndent * 100));
    merged['w:firstLine'] = String(Math.round(role.firstLineIndent * role.size * 20));
    setOrdered(pPr, 'w:ind', PPR_ORDER, merged);
  }

  // 段落标记自身的字体，决定空行高度与后续输入
  const markRPr = child(pPr, 'w:rPr') || el('w:rPr');
  fontElements(markRPr, role, scheme, 'latin');
  if (role.bold) setOrdered(markRPr, 'w:b', RPR_ORDER, {});
  setOrdered(pPr, 'w:rPr', PPR_ORDER, {});
  const freshMark = child(pPr, 'w:rPr');
  freshMark.children = markRPr.children;
  freshMark.selfClosing = false;
}

function walkParagraphs(node, visit, context) {
  for (const c of node.children) {
    if (c.type !== 'element') continue;
    if (c.name === 'w:p') {
      visit(c, context);
      continue;
    }
    if (c.name === 'w:tbl') {
      walkParagraphs(c, visit, { ...(context || {}), inTable: true });
      continue;
    }
    if (c.name === 'w:sectPr' || c.name === 'w:tblPr' || c.name === 'w:trPr' || c.name === 'w:tcPr') continue;
    walkParagraphs(c, visit, context);
  }
}

/**
 * 对 .docx 的 zip 条目应用排版方案。
 * @param {Map<string, Buffer>} entries
 * @param {object} scheme
 * @returns {{paragraphs:number, runs:number, parts:string[], roles:Record<string,number>}}
 */
export function applyDocxEntries(entries, scheme) {
  const stats = { paragraphs: 0, runs: 0, parts: [], roles: {} };

  const applyPart = (xmlBuffer, partRoleResolver) => {
    const dom = parseXml(xmlBuffer.toString('utf8'));
    const root = dom.children.find((c) => c.type === 'element');
    if (!root) return null;
    walkParagraphs(root, (paragraph, context = {}) => {
      const roleId = partRoleResolver ? partRoleResolver(paragraph) : detectRole(paragraph, context.inTable);
      const role = { id: roleId, ...scheme.roles[roleId] };
      applyParagraphProps(paragraph, role, scheme);
      const runs = applyParagraphRuns(paragraph, role, scheme);
      stats.paragraphs++;
      stats.runs += runs;
      stats.roles[roleId] = (stats.roles[roleId] || 0) + 1;
    });
    return serializeXml(dom);
  };

  for (const [name, buffer] of entries) {
    if (!/^word\/document\d*\.xml$/.test(name)) continue;
    const xml = applyPart(buffer, null);
    if (xml != null) {
      entries.set(name, Buffer.from(xml, 'utf8'));
      stats.parts.push(name);
    }
  }
  for (const [name, buffer] of entries) {
    const header = /^word\/header(\d*)\.xml$/.test(name);
    const footer = /^word\/footer(\d*)\.xml$/.test(name);
    if (!header && !footer) continue;
    const xml = applyPart(buffer, () => (header ? 'header' : 'footer'));
    if (xml != null) {
      entries.set(name, Buffer.from(xml, 'utf8'));
      stats.parts.push(name);
    }
  }
  const styles = entries.get('word/styles.xml');
  if (styles) {
    entries.set('word/styles.xml', Buffer.from(updateDocxStyles(styles.toString('utf8'), scheme), 'utf8'));
    stats.parts.push('word/styles.xml');
  }
  return stats;
}

/** 更新 styles.xml 的默认字体与命名样式，使后续手工编辑保持一致。 */
export function updateDocxStyles(xml, scheme) {
  const dom = parseXml(xml);
  const root = dom.children.find((c) => c.type === 'element');
  if (!root) return xml;

  const bodyRole = { id: 'body', ...scheme.roles.body };
  const defaults = child(root, 'w:docDefaults');
  if (defaults) {
    const rPrDefault = ensureChild(defaults, 'w:rPrDefault');
    const rPr = ensureChild(rPrDefault, 'w:rPr');
    fontElements(rPr, bodyRole, scheme, 'latin');
  }

  for (const style of childrenOf(root, 'w:style')) {
    if (getAttr(style, 'w:type') !== 'paragraph') continue;
    const styleId = getAttr(style, 'w:styleId') || '';
    const nameEl = child(style, 'w:name');
    const name = (nameEl && getAttr(nameEl, 'w:val')) || styleId;
    const roleId = roleForStyleId(styleId) || roleForStyleId(name) || 'body';
    const role = { id: roleId, ...scheme.roles[roleId] };
    const rPr = ensureChild(style, 'w:rPr');
    fontElements(rPr, role, scheme, 'latin');
    if (role.bold) {
      setOrdered(rPr, 'w:b', RPR_ORDER, {});
      setOrdered(rPr, 'w:bCs', RPR_ORDER, {});
    }
    const pPr = ensureChild(style, 'w:pPr');
    if (role.align) setOrdered(pPr, 'w:jc', PPR_ORDER, { 'w:val': role.align === 'justify' ? 'both' : role.align });
    if (role.lineSpacing) {
      const attrs = {};
      if (role.lineSpacing.mode === 'exact') {
        attrs['w:line'] = String(Math.round(role.lineSpacing.value * 20));
        attrs['w:lineRule'] = 'exact';
      } else {
        attrs['w:line'] = String(Math.round(role.lineSpacing.value * 240));
        attrs['w:lineRule'] = 'auto';
      }
      if (role.spaceBefore != null) attrs['w:before'] = String(Math.round(role.spaceBefore * 20));
      if (role.spaceAfter != null) attrs['w:after'] = String(Math.round(role.spaceAfter * 20));
      setOrdered(pPr, 'w:spacing', PPR_ORDER, attrs);
    }
  }
  return serializeXml(dom);
}

/** 读取文档中实际使用的字体，用于"套用后核对"。 */
export function inspectDocxFonts(entries) {
  const found = new Map();
  const dom = parseXml(entries.get('word/document.xml').toString('utf8'));
  const root = dom.children.find((c) => c.type === 'element');
  const visit = (node) => {
    for (const c of node.children || []) {
      if (c.type !== 'element') continue;
      if (c.name === 'w:rFonts') {
        for (const attr of c.attrs) {
          if (attr.name === 'w:ascii' || attr.name === 'w:eastAsia') {
            found.set(attr.value, (found.get(attr.value) || 0) + 1);
          }
        }
      } else if (c.name === 'w:sz') {
        const val = Number(getAttr(c, 'w:val')) / 2;
        const key = `${val}pt`;
        found.set(key, (found.get(key) || 0) + 1);
      }
      visit(c);
    }
  };
  visit(root);
  return found;
}
