/**
 * 生成一份用于演示的 .docx：封面标题、两级标题、正文（中英数字混排）、表格、图表注。
 * 直接写 OOXML，不依赖 python-docx；字体先用 Calibri，等 fontcraft 套用方案后再变。
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeZip } from '../engine/zip.js';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const W = (name, attrs = {}, children = []) => {
  const attrsText = Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}"`)
    .join('');
  if (children.length === 0) return `<w:${name}${attrsText}/>`;
  return `<w:${name}${attrsText}>${children.join('')}</w:${name}>`;
};

const run = (text) =>
  W('r', {}, [
    W('rPr', {}, [W('rFonts', { 'w:ascii': 'Calibri', 'w:hAnsi': 'Calibri', 'w:eastAsia': 'Calibri' }), W('sz', { 'w:val': '22' }), W('szCs', { 'w:val': '22' })]),
    W('t', { 'xml:space': 'preserve' }, [text.replace(/&/g, '&amp;').replace(/</g, '&lt;')]),
  ]);

const para = (style, runs, extraPPr = []) =>
  W('p', {}, [W('pPr', {}, [W('pStyle', { 'w:val': style }), ...extraPPr]), ...runs.map(run)]);

const cell = (text, bold = false) =>
  W('tc', {}, [
    W('tcPr', {}, [W('tcW', { 'w:w': '3000', 'w:type': 'dxa' })]),
    W('p', {}, [
      W('pPr', {}, [W('pStyle', { 'w:val': 'Normal' })]),
      W('r', {}, [
        W('rPr', {}, [
          W('rFonts', { 'w:ascii': 'Calibri', 'w:hAnsi': 'Calibri', 'w:eastAsia': 'Calibri' }),
          W('sz', { 'w:val': '20' }),
          ...(bold ? [W('b')] : []),
        ]),
        W('t', { 'xml:space': 'preserve' }, [text]),
      ]),
    ]),
  ]);

const table = W('tbl', {}, [
  W('tblPr', {}, [
    W('tblW', { 'w:w': '0', 'w:type': 'auto' }),
    W('tblBorders', {}, [
      W('top', { 'w:val': 'single', 'w:sz': '4', 'w:color': '999999' }),
      W('bottom', { 'w:val': 'single', 'w:sz': '4', 'w:color': '999999' }),
      W('left', { 'w:val': 'single', 'w:sz': '4', 'w:color': '999999' }),
      W('right', { 'w:val': 'single', 'w:sz': '4', 'w:color': '999999' }),
      W('insideH', { 'w:val': 'single', 'w:sz': '4', 'w:color': 'DDDDDD' }),
      W('insideV', { 'w:val': 'single', 'w:sz': '4', 'w:color': 'DDDDDD' }),
    ]),
  ]),
  W('tblGrid', {}, [W('gridCol', { 'w:w': '3000' }), W('gridCol', { 'w:w': '3000' }), W('gridCol', { 'w:w': '3000' })]),
  W('tr', {}, [cell('指标', true), cell('2025 年', true), cell('2026 年', true)]),
  W('tr', {}, [cell('任务完成率'), cell('91.2%'), cell('96.8%')]),
  W('tr', {}, [cell('平均响应时间'), cell('320 ms'), cell('185 ms')]),
  W('tr', {}, [cell('缺陷密度（/KLOC）'), cell('2.4'), cell('0.9')]),
]);

const body = [
  para('Title', ['2026 年度技术工作总结']),
  para('Subtitle', ['智能排版与文档工程团队 · FontCraft 项目组']),
  para('Heading1', ['一、项目概况']),
  para('Normal', ['本年度团队围绕「文档智能排版」方向开展研究，共完成 3 项关键技术攻关，累计投入 12 人月，']),
  para('Normal', ['在 Word、PowerPoint、Excel 三类 OOXML 文档上实现了统一的字体与字号管理能力。']),
  para('Heading2', ['（一）关键指标']),
  para('Normal', ['项目核心指标完成情况如下表所示，其中任务完成率由 91.2% 提升至 96.8%，平均响应时间缩短 42.2%。']),
  table,
  para('Caption', ['表 1  主要指标完成情况（数据来源：Quality Dashboard，2026 年 10 月）']),
  para('Heading1', ['二、下一步计划']),
  para('Normal', ['下一阶段计划完成三项工作：第一，支持 PDF 输出前的排版校验；第二，接入团队现有的 Word 模板库；']),
  para('Normal', ['第三，在 2027 Q1 之前把 fontcraft 推广到 5 个业务线，覆盖约 800 份月均文档。']),
];

const sectPr = W('sectPr', {}, [
  W('pgSz', { 'w:w': '11906', 'w:h': '16838' }),
  W('pgMar', { 'w:top': '1440', 'w:right': '1800', 'w:bottom': '1440', 'w:left': '1800', 'w:header': '851', 'w:footer': '992', 'w:gutter': '0' }),
]);

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body.join('')}${sectPr}</w:body></w:document>`;

const styleXml = (id, name, opts = {}) =>
  W('style', { 'w:type': 'paragraph', 'w:styleId': id }, [
    W('name', { 'w:val': name }),
    W('basedOn', { 'w:val': 'Normal' }),
    W('qFormat'),
    W('pPr', {}, [W('jc', { 'w:val': opts.align || 'left' }), ...(opts.spacing ? [W('spacing', opts.spacing)] : [])]),
    W('rPr', {}, [
      W('rFonts', { 'w:ascii': 'Calibri', 'w:hAnsi': 'Calibri', 'w:eastAsia': 'Calibri' }),
      W('sz', { 'w:val': String(opts.size || 22) }),
      ...(opts.bold ? [W('b')] : []),
    ]),
  ]);

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
${W('style', { 'w:type': 'paragraph', 'w:default': '1', 'w:styleId': 'Normal' }, [W('name', { 'w:val': 'Normal' }), W('qFormat')])}
${styleXml('Title', 'Title', { align: 'center', size: 48, bold: true })}
${styleXml('Subtitle', 'Subtitle', { align: 'center', size: 26 })}
${styleXml('Heading1', 'heading 1', { size: 32, bold: true })}
${styleXml('Heading2', 'heading 2', { size: 28, bold: true })}
${styleXml('Caption', 'caption', { align: 'center', size: 19 })}
</w:styles>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>2026 年度技术工作总结（fontcraft 演示）</dc:title><dc:creator>fontcraft</dc:creator>
</cp:coreProperties>`;

export function buildDemoDocx(target) {
  const files = new Map([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['word/_rels/document.xml.rels', docRels],
    ['word/document.xml', documentXml],
    ['word/styles.xml', stylesXml],
    ['docProps/core.xml', core],
  ]);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, writeZip(files));
  return target;
}

if (process.argv[1] && process.argv[1].endsWith('make-demo-docx.mjs')) {
  const target = process.argv[2] || 'examples/demo-before.docx';
  buildDemoDocx(target);
  console.log(`wrote ${target}`);
}
