import fs from 'node:fs';
import path from 'node:path';
import { readZip, writeZip } from './zip.js';
import { applyDocxEntries, inspectDocxFonts } from './docx.js';
import { applyPptxEntries, inspectPptxFonts } from './pptx.js';
import { applyXlsxEntries, inspectXlsxFonts } from './xlsx.js';

export const SUPPORTED_EXTENSIONS = ['.docx', '.pptx', '.xlsx'];

export function formatOf(filePath) {
  const ext = path.extname(String(filePath)).toLowerCase();
  return ext.replace('.', '');
}

export function isSupported(filePath) {
  return SUPPORTED_EXTENSIONS.includes(path.extname(String(filePath)).toLowerCase());
}

/**
 * 把一个排版方案套用到 OOXML 文件上。
 * @param {string} filePath 目标文件；默认就地改写，可用 outputPath 另存。
 * @param {object} scheme normalize() 之后的方案
 * @returns {{file:string, format:string, paragraphs:number, runs:number, parts:string[], roles:object, fonts:Array<[string,number]>}}
 */
export function applySchemeToFile(filePath, scheme, options = {}) {
  const format = formatOf(filePath);
  if (!['docx', 'pptx', 'xlsx'].includes(format)) {
    throw new Error(`不支持的文件类型 .${format}，目前支持 .docx / .pptx / .xlsx`);
  }
  const source = fs.readFileSync(filePath);
  const entries = readZip(source);

  let stats;
  if (format === 'docx') stats = applyDocxEntries(entries, scheme);
  else if (format === 'pptx') stats = applyPptxEntries(entries, scheme);
  else stats = applyXlsxEntries(entries, scheme);

  const outputPath = options.outputPath || filePath;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, writeZip(entries));

  let fonts = new Map();
  if (format === 'docx') fonts = inspectDocxFonts(entries);
  else if (format === 'pptx') fonts = inspectPptxFonts(entries);
  else fonts = inspectXlsxFonts(entries);

  return {
    file: outputPath,
    format,
    paragraphs: stats.paragraphs,
    runs: stats.runs,
    parts: stats.parts,
    roles: stats.roles,
    fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/** 只读检查：文档里实际出现的字体与字号（用于核对套用结果）。 */
export function inspectFileFonts(filePath) {
  const format = formatOf(filePath);
  const entries = readZip(fs.readFileSync(filePath));
  let fonts = new Map();
  if (format === 'docx') fonts = inspectDocxFonts(entries);
  else if (format === 'pptx') fonts = inspectPptxFonts(entries);
  else if (format === 'xlsx') fonts = inspectXlsxFonts(entries);
  else throw new Error(`不支持的文件类型 .${format}`);
  return { file: filePath, format, fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]) };
}

export { readZip, writeZip };
