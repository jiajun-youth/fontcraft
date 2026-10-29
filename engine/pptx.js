import {
  parseXml,
  serializeXml,
  el,
  text as textNode,
  getAttr,
  child,
  childrenOf,
  cloneNode,
  descendants,
  textContent,
} from './xml.js';
import { fontFor, splitByScript } from './scheme.js';

// CT_TextCharacterProperties 子元素顺序（ecma-376）
const RPR_ORDER = [
  'a:ln', 'a:noFill', 'a:solidFill', 'a:gradFill', 'a:blipFill', 'a:pattFill', 'a:grpFill', 'a:effectLst',
  'a:effectDag', 'a:highlight', 'a:uLnTx', 'a:uLn', 'a:uFillTx', 'a:uFill', 'a:latin', 'a:ea', 'a:cs', 'a:sym',
  'a:hlinkClick', 'a:hlinkMouseOver', 'a:rtl', 'a:extLst',
];

const ALIGN_MAP = { left: 'l', center: 'ctr', right: 'r', justify: 'just' };

function setOrdered(parent, name, order, attrs) {
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

function placeholderType(shape) {
  const nvSpPr = child(shape, 'p:nvSpPr') || child(shape, 'p:nvGraphicFramePr') || child(shape, 'p:nvPicPr');
  const nvPr = nvSpPr && child(nvSpPr, 'p:nvPr');
  const ph = nvPr && child(nvPr, 'p:ph');
  return ph ? getAttr(ph, 'type') || 'body' : null;
}

function roleForPlaceholder(type) {
  if (!type) return 'body';
  if (type === 'title' || type === 'ctrTitle') return 'title1';
  if (type === 'subTitle' || type === 'body' || type === 'obj') return 'body';
  if (type === 'ftr' || type === 'sldNum' || type === 'dt') return 'footer';
  return 'body';
}

function applyRun(run, role, scheme) {
  const baseRPr = child(run, 'a:rPr');
  const proto = baseRPr ? cloneNode(baseRPr) : el('a:rPr');
  const tNode = child(run, 'a:t');
  const value = tNode ? textContent(tNode) : '';
  const segments = splitByScript(value);
  if (segments.length === 0) {
    applyRPr(proto, role, scheme, 'latin');
    if (baseRPr) run.children[run.children.indexOf(baseRPr)] = proto;
    else run.children.unshift(proto);
    return 0;
  }
  const parts = segments.map((seg) => {
    const rPr = cloneNode(proto);
    applyRPr(rPr, role, scheme, seg.kind);
    return el('a:r', {}, [rPr, el('a:t', {}, [textNode(seg.text)])]);
  });
  return parts;
}

function applyRPr(rPr, role, scheme, kind) {
  const latinKind = kind === 'digit' ? 'digit' : 'latin';
  const latinFont = fontFor(scheme, role.id, latinKind);
  const cjkFont = fontFor(scheme, role.id, 'cjk');
  setOrdered(rPr, 'a:latin', RPR_ORDER, { typeface: latinFont });
  setOrdered(rPr, 'a:ea', RPR_ORDER, { typeface: cjkFont });
  setOrdered(rPr, 'a:cs', RPR_ORDER, { typeface: latinFont });
  rPr.attrs = rPr.attrs.filter((a) => a.name !== 'sz' && a.name !== 'b');
  rPr.attrs.push({ name: 'sz', value: String(Math.round(role.size * 100)) });
  rPr.attrs.push({ name: 'b', value: role.bold ? '1' : '0' });
  rPr.selfClosing = rPr.children.length === 0;
}

function applyParagraph(p, role, scheme) {
  let pPr = child(p, 'a:pPr');
  if (!pPr) {
    pPr = el('a:pPr');
    p.children.unshift(pPr);
    p.selfClosing = false;
  }
  if (role.align) {
    const existing = getAttr(pPr, 'algn');
    pPr.attrs = pPr.attrs.filter((a) => a.name !== 'algn');
    pPr.attrs.push({ name: 'algn', value: ALIGN_MAP[role.align] || existing || 'l' });
  }
  if (role.lineSpacing) {
    let lnSpc = child(pPr, 'a:lnSpc');
    if (!lnSpc) {
      lnSpc = el('a:lnSpc');
      pPr.children.unshift(lnSpc);
      pPr.selfClosing = false;
    }
    lnSpc.children = [
      role.lineSpacing.mode === 'exact'
        ? el('a:spcPts', { val: String(Math.round(role.lineSpacing.value * 100)) })
        : el('a:spcPct', { val: String(Math.round(role.lineSpacing.value * 100000)) }),
    ];
    lnSpc.selfClosing = false;
  }

  const runs = childrenOf(p, 'a:r');
  const newChildren = [];
  for (const node of p.children) {
    if (node.type === 'element' && node.name === 'a:r' && runs.includes(node)) {
      const parts = applyRun(node, role, scheme);
      if (Array.isArray(parts)) newChildren.push(...parts);
      else newChildren.push(parts);
      continue;
    }
    newChildren.push(node);
  }
  p.children = newChildren;

  const endPara = child(p, 'a:endParaRPr');
  if (endPara) {
    applyRPr(endPara, role, scheme, 'latin');
  }
  return runs.length;
}

function walkShapes(node, visit) {
  for (const c of node.children) {
    if (c.type !== 'element') continue;
    if (c.name === 'p:sp' || c.name === 'p:graphicFrame') {
      visit(c);
      continue;
    }
    walkShapes(c, visit);
  }
}

function applySlide(entries, name, scheme, isMasterLike) {
  const dom = parseXml(entries.get(name).toString('utf8'));
  const root = dom.children.find((c) => c.type === 'element');
  let runs = 0;
  let paragraphs = 0;
  const roles = {};
  walkShapes(root, (shape) => {
    const type = placeholderType(shape);
    let roleId = roleForPlaceholder(type);
    if (shape.name === 'p:graphicFrame') roleId = 'table';
    const role = { id: roleId, ...scheme.roles[roleId] };
    for (const txBody of childrenOf(shape, 'p:txBody')) {
      for (const p of childrenOf(txBody, 'a:p')) {
        runs += applyParagraph(p, role, scheme);
        paragraphs++;
        roles[roleId] = (roles[roleId] || 0) + 1;
      }
    }
    for (const tbl of descendants(shape, 'a:tbl')) {
      for (const tc of descendants(tbl, 'a:tc')) {
        for (const txBody of childrenOf(tc, 'a:txBody')) {
          for (const p of childrenOf(txBody, 'a:p')) {
            runs += applyParagraph(p, { id: 'table', ...scheme.roles.table }, scheme);
            paragraphs++;
            roles.table = (roles.table || 0) + 1;
          }
        }
      }
    }
  });
  entries.set(name, Buffer.from(serializeXml(dom), 'utf8'));
  return { runs, paragraphs, roles };
}

export function applyPptxEntries(entries, scheme) {
  const stats = { paragraphs: 0, runs: 0, parts: [], roles: {} };
  for (const [name] of [...entries]) {
    if (/^ppt\/(slides\/slide|slideLayouts\/slideLayout|slideMasters\/slideMaster)\d*\.xml$/.test(name)) {
      const { runs, paragraphs, roles } = applySlide(entries, name, scheme, name.includes('slideMaster'));
      stats.runs += runs;
      stats.paragraphs += paragraphs;
      for (const [roleId, count] of Object.entries(roles)) stats.roles[roleId] = (stats.roles[roleId] || 0) + count;
      stats.parts.push(name);
    }
  }
  return stats;
}

export function inspectPptxFonts(entries) {
  const found = new Map();
  for (const [name, buffer] of entries) {
    if (!/^ppt\/(slides|slideLayouts|slideMasters)\/.*\.xml$/.test(name)) continue;
    const dom = parseXml(buffer.toString('utf8'));
    const visit = (node) => {
      for (const c of node.children || []) {
        if (c.type !== 'element') continue;
        if (c.name === 'a:latin' || c.name === 'a:ea') {
          const face = getAttr(c, 'typeface');
          if (face) found.set(face, (found.get(face) || 0) + 1);
        }
        if (c.name === 'a:rPr') {
          const sz = Number(getAttr(c, 'sz'));
          if (Number.isFinite(sz)) found.set(`${sz / 100}pt`, (found.get(`${sz / 100}pt`) || 0) + 1);
        }
        visit(c);
      }
    };
    visit(dom);
  }
  return found;
}
