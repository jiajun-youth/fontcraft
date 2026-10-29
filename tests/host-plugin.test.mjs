import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 用临时 DSH_HOME，避免测试写到真实配置
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fontcraft-test-'));
process.env.DSH_HOME = tmpHome;

const { apply } = await import('../lib/index.js');

const tools = [];
const routes = [];
const sections = [];
const skills = [];
const ctx = {
  logger: { info: (m) => console.log('[log]', m) },
  get(name) {
    if (name === 'systemPrompt') return { section: (s) => sections.push(s) };
    if (name === 'skills') return { register: (s) => skills.push(s) };
    if (name === 'workingDirectory') return { get: () => 'D:\\fontcraft' };
    return undefined;
  },
  tools: { register: (def) => (tools.push(def), () => {}) },
  webServer: { register: (route) => (routes.push(route), () => {}) },
};

apply(ctx);
assert.equal(tools.length, 1, '注册了一个工具');
assert.equal(routes.length, 1, '注册了一个 HTTP 路由');
assert.equal(sections.length, 1, '注册了一段系统提示');
assert.equal(skills.length, 1, '注册了一个技能');

const tool = tools[0];
const listText = await tool.execute({ action: 'list' }, {});
assert.match(listText, /cn-paper/, 'list 含内置方案');
console.log(listText.split('\n').slice(0, 6).join('\n'));

// 面板状态接口
const state = await callRoute(routes[0], 'GET', '/fontcraft/api/state');
assert.equal(state.ok, true);
assert.ok(state.schemes.length >= 4, '至少 4 个内置方案');
assert.ok(state.fonts.cjk.length > 0, '有中文字体清单');
assert.ok(state.catalog.roles.length >= 8, '角色目录完整');
console.log('state: schemes=%d cjk=%d latin=%d', state.schemes.length, state.fonts.cjk.length, state.fonts.latin.length);

// 保存自定义方案并设为活动
const custom = JSON.parse(JSON.stringify(state.schemes[0]));
custom.id = 'custom-test';
custom.name = '测试方案';
custom.scripts.digit.font = 'Arial';
custom.roles.body.size = 14;
const saved = await callRoute(routes[0], 'POST', '/fontcraft/api/scheme', { scheme: custom, apply: true });
assert.equal(saved.ok, true);
assert.equal(saved.scheme.roles.body.size, 14);
assert.equal(saved.active, 'custom-test');

// 工具读到的是同一份方案
const getText = await tool.execute({ action: 'get' }, {});
assert.match(getText, /测试方案/);
assert.match(getText, /数字 Arial/);
console.log('get ok');

// 文件套用：造一个最小 docx
const { writeZip, readZip } = await import('../engine/zip.js');
const fixturePath = path.join(tmpHome, 'sample.docx');
fs.writeFileSync(fixturePath, writeZip(makeDocxParts()));
const applyText = await tool.execute({ action: 'apply', files: [fixturePath] }, {});
console.log(applyText);
assert.match(applyText, /✓ sample\.docx/);

const docXml = readZip(fs.readFileSync(fixturePath)).get('word/document.xml').toString('utf8');
assert.match(docXml, /w:eastAsia="宋体"/, '中文段落写入宋体');
assert.match(docXml, /w:ascii="Arial"/, '数字使用 Arial');
assert.match(docXml, /w:sz w:val="28"/, '正文字号 14pt = 28 半磅');

const auditText = await tool.execute({ action: 'audit', files: [fixturePath] }, {});
console.log(auditText);
assert.match(auditText, /宋体/);

fs.rmSync(tmpHome, { recursive: true, force: true });
console.log('\nALL HOST TESTS PASSED');

function makeDocxParts() {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章 绪论</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">2026 年共完成 12 项任务，准确率 96.8%，见 Appendix A。</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>指标</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:sectPr/></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="SimSun"/><w:sz w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
</w:styles>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return new Map([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['word/_rels/document.xml.rels', docRels],
    ['word/document.xml', document],
    ['word/styles.xml', styles],
  ]);
}

async function callRoute(route, method, url, body) {
  const request = new (await import('node:stream')).PassThrough();
  request.method = method;
  request.url = url;
  let status = 0;
  let payload = '';
  const response = {
    writeHead(code) {
      status = code;
    },
    end(buffer) {
      payload = buffer ? buffer.toString('utf8') : '';
    },
  };
  const pending = route.handler(request, response);
  if (body !== undefined) request.write(JSON.stringify(body));
  request.end();
  await pending;
  assert.equal(status, 200, `HTTP ${status}: ${payload}`);
  return JSON.parse(payload);
}
