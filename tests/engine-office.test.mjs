import assert from 'node:assert';
import { applyPptxEntries, inspectPptxFonts } from '../engine/pptx.js';
import { applyXlsxEntries } from '../engine/xlsx.js';
import { BUILTIN_SCHEMES, normalize } from '../engine/scheme.js';

const scheme = normalize(BUILTIN_SCHEMES[0]); // 中文论文：宋体 / Times New Roman / 黑体标题

// ── PPTX ────────────────────────────────────────────────────────────────
const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" dirty="0"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t>2026 年度总结 Report</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>准确率达到 96.8%，详见 Appendix A。</a:t></a:r></a:p></p:txBody></p:sp>
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
<a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>指标 / Accuracy</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
</p:spTree></p:cSld></p:sld>`;

const pptxEntries = new Map([['ppt/slides/slide1.xml', Buffer.from(slide, 'utf8')]]);
const pptxStats = applyPptxEntries(pptxEntries, scheme);
const slideOut = pptxEntries.get('ppt/slides/slide1.xml').toString('utf8');

assert.ok(pptxStats.paragraphs >= 3, `处理了 3 个段落（实际 ${pptxStats.paragraphs}）`);
assert.match(slideOut, /typeface="黑体"/, '标题中文用黑体');
assert.match(slideOut, /typeface="Arial"/, '标题西文用 Arial');
assert.match(slideOut, /sz="1600"/, '标题 16pt → sz=1600');
assert.match(slideOut, /sz="1200"/, '正文 12pt → sz=1200');
assert.match(slideOut, /typeface="宋体"/, '正文中文用宋体');
assert.match(slideOut, /typeface="Times New Roman"/, '数字/英文用 Times New Roman');
assert.match(slideOut, /sz="1050"/, '表格 10.5pt → sz=1050');
assert.match(slideOut, /<a:t>96\.8%<\/a:t>/, '数字被拆成独立 run');
// 原有填充色必须保留
assert.match(slideOut, /srgbClr val="000000"/, '原有颜色属性保留');
const pptxFonts = inspectPptxFonts(pptxEntries);
assert.ok(pptxFonts.has('宋体') && pptxFonts.has('黑体'), '字体清单包含宋体与黑体');

console.log('pptx ok:', pptxStats, [...pptxFonts.keys()].slice(0, 6));

// ── XLSX ────────────────────────────────────────────────────────────────
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
<si><t>指标</t></si><si><t>2025 年</t></si><si><t>任务完成率</t></si></sst>`;

const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s" s="0"><v>0</v></c><c r="B1" t="s" s="0"><v>1</v></c></row>
<row r="2"><c r="A2" t="s" s="0"><v>2</v></c><c r="B2" s="1"><v>0.968</v></c></row>
</sheetData></worksheet>`;

const xlsxEntries = new Map([
  ['xl/styles.xml', Buffer.from(styles, 'utf8')],
  ['xl/sharedStrings.xml', Buffer.from(sharedStrings, 'utf8')],
  ['xl/worksheets/sheet1.xml', Buffer.from(sheet, 'utf8')],
]);
const xlsxStats = applyXlsxEntries(xlsxEntries, scheme);
const stylesOut = xlsxEntries.get('xl/styles.xml').toString('utf8');
const sheetOut = xlsxEntries.get('xl/worksheets/sheet1.xml').toString('utf8');

assert.ok(xlsxStats.runs === 4, '处理 4 个单元格');
assert.match(stylesOut, /<name val="宋体"\/>/, '新增宋体字体');
assert.match(stylesOut, /<name val="Times New Roman"\/>/, '新增 Times New Roman 字体');
assert.match(stylesOut, /<sz val="10.5"\/>/, '表头字号 10.5');
assert.match(stylesOut, /<b\/>/, '表头加粗');
// 数字格式（numFmtId=4）必须随原 xf 克隆保留
assert.match(stylesOut, /numFmtId="4"/, '克隆的 xf 保留数字格式');
// 单元格 s 指向新 xf
const sValues = [...sheetOut.matchAll(/<c r="[A-Z]\d+"(?: t="s")? s="(\d+)"/g)].map((m) => Number(m[1]));
assert.equal(sValues.length, 4, '4 个单元格都写了样式索引');
assert.ok(sValues.every((value) => value >= 2), '指向新增的 cellXfs');

console.log('xlsx ok:', xlsxStats);
console.log('ALL PPTX/XLSX TESTS PASSED');
