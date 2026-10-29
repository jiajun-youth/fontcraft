/**
 * fontcraft 主机插件（零外部依赖，可直接用 file:/// 行加载）
 *
 * 提供三件事：
 *  1. 一个 agent 工具 `fontcraft`：列出 / 读取 / 设定 / 套用排版方案，检查文档实际字体；
 *  2. 一组 HTTP 接口 `/fontcraft/api/*`：给聊天框里的「排版方案」面板读写方案与字体清单；
 *  3. 一段系统提示 + 一个技能：提醒模型在生成 Office 文档后必须套用方案。
 *
 * 方案保存在 %DSH_HOME%\fontcraft\fontcraft.json（默认 ~/.dsh/fontcraft/fontcraft.json）。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  BUILTIN_SCHEMES,
  ROLE_ORDER,
  ROLES,
  SCRIPTS,
  SIZE_PRESETS,
  blankScheme,
  describeScheme,
  fontFor,
  normalize,
  sizeName,
} from '../engine/scheme.js';
import { applySchemeToFile, inspectFileFonts, isSupported } from '../engine/index.js';
import { listFonts } from '../engine/fonts.js';

export const name = 'fontcraft';

/** webServer 提供 HTTP 接口，tools 提供 agent 工具。 */
export const inject = ['tools', 'webServer'];

const API_PREFIX = '/fontcraft/api';
const STATE_VERSION = 1;

function storeDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'fontcraft');
}

function storeFile() {
  return path.join(storeDir(), 'fontcraft.json');
}

function loadState() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  } catch {
    raw = null;
  }
  const state = { version: STATE_VERSION, active: 'cn-paper', schemes: {}, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!state.schemes || typeof state.schemes !== 'object') state.schemes = {};
  const schemes = {};
  for (const [id, scheme] of Object.entries(state.schemes)) {
    try {
      schemes[id] = normalize({ ...scheme, id: scheme.id || id });
    } catch {
      /* 忽略坏数据 */
    }
  }
  state.schemes = schemes;
  if (!state.active) state.active = 'cn-paper';
  return state;
}

function saveState(state) {
  fs.mkdirSync(storeDir(), { recursive: true });
  const file = storeFile();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ version: STATE_VERSION, active: state.active, schemes: state.schemes }, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/** 内置方案 + 用户方案，后者可覆盖同名 id。 */
function allSchemes(state) {
  const out = [];
  for (const builtin of BUILTIN_SCHEMES) {
    out.push({ ...normalize(builtin), builtin: true });
  }
  for (const [id, scheme] of Object.entries(state.schemes)) {
    if (BUILTIN_SCHEMES.some((b) => b.id === id)) continue;
    out.push({ ...normalize(scheme), id, builtin: false });
  }
  return out;
}

function findScheme(state, key) {
  const wanted = String(key || '').trim();
  if (!wanted) return undefined;
  const schemes = allSchemes(state);
  return (
    schemes.find((s) => s.id === wanted) ||
    schemes.find((s) => s.name === wanted) ||
    schemes.find((s) => s.name.includes(wanted) || wanted.includes(s.name))
  );
}

function activeScheme(state) {
  return findScheme(state, state.active) || normalize(BUILTIN_SCHEMES[0]);
}

function resolvePath(input, cwd) {
  if (!input) return '';
  return path.isAbsolute(input) ? input : path.resolve(cwd || process.cwd(), input);
}

function renderList(state) {
  const active = activeScheme(state);
  const lines = [`当前排版方案：${active.name}（${active.id}）`, '', '可用方案：'];
  for (const scheme of allSchemes(state)) {
    const mark = scheme.id === active.id ? ' ← 当前' : '';
    lines.push(`- ${scheme.id}｜${scheme.name}${scheme.builtin ? '（内置）' : ''}${mark}`);
    if (scheme.description) lines.push(`  ${scheme.description}`);
  }
  lines.push('');
  lines.push('用 fontcraft action=get 查看当前方案详情；action=apply 把方案套用到 .docx/.pptx/.xlsx。');
  return lines.join('\n');
}

export function apply(ctx) {
  const log = (message) => {
    try {
      ctx.logger?.info?.(message);
    } catch {
      /* 忽略日志失败 */
    }
  };

  // ── 系统提示：告诉模型生成文档后必须套用方案 ──────────────────────────────
  const prompt = ctx.get('systemPrompt');
  if (prompt && typeof prompt.section === 'function') {
    prompt.section({
      name: 'tool:fontcraft',
      order: 2500,
      text: [
        '排版（fontcraft）：本项目启用了 fontcraft 排版插件，用户可以在聊天框左侧的「排版方案」面板里选择标题、正文、数字、英文等各类文字的字体与字号。',
        '生成 .docx / .pptx / .xlsx 文档时：先正常生成内容，再调用 fontcraft 工具 action="apply"，files 传入产物路径，把当前排版方案套用到产物上；不要手工在代码里硬编码字体，交给 fontcraft 统一处理。',
        '如果用户没有指定方案、或想换字体，用 fontcraft action="list" 展示可用方案，让用户在面板里选择（或用 action="use" 按用户要求切换）。',
        '套用后可以用 action="audit" 核对文档里实际出现的字体与字号，并在回复里简要说明套用了哪些字体。',
      ].join('\n'),
    });
  }

  // ── 技能：完整操作流程 ─────────────────────────────────────────────────
  const skills = ctx.get('skills');
  if (skills && typeof skills.register === 'function') {
    try {
      skills.register({
        name: 'fontcraft-typeset',
        description: '用 fontcraft 把选定的中文字体、英文字体、数字字体与各级字号套用到 Word/PPT/Excel 文档。',
        whenToUse: '用户要求生成或调整文档排版、字体、字号、标题层级样式时。',
        content: [
          '# fontcraft 排版流程',
          '',
          '1. 用 `fontcraft` 工具 `action="list"` 查看可用方案与当前方案；用户没选过就请他在「排版方案」面板里选，或用 `action="use"` 直接指定。',
          '2. 正常生成文档内容（python-docx / python-pptx / openpyxl，或直接写 OOXML）。**不要**在生成代码里写字体名，字体由 fontcraft 统一套用。',
          '3. 生成完成后调用 `fontcraft` 工具 `action="apply"`，`files` 传入一个或多个 .docx/.pptx/.xlsx 路径。',
          '4. 用 `action="audit"` 核对字体是否生效，把实际字体与字号简要报告给用户。',
          '',
          '方案包含两层：文字类别（中文 / 英文 / 数字各一种字体）与文字角色（封面标题、一~三级标题、正文、图表注、表格、页眉页脚、代码）的字号、加粗、对齐、行距、首行缩进。数字与英文可以单独设成与正文不同的字体。',
        ].join('\n'),
        invocation: { modelInvocable: true, userInvocable: true },
      });
    } catch (error) {
      log(`fontcraft: 注册技能失败：${error?.message || error}`);
    }
  }

  // ── agent 工具 ────────────────────────────────────────────────────────
  ctx.tools.register({
    name: 'fontcraft',
    description:
      '排版工具：管理并套用「文档排版方案」（中文/英文/数字各自字体 + 标题/正文/图表注/表格/页眉页脚等角色的字号、加粗、对齐、行距、首行缩进）。生成 Word/PPT/Excel 文档后用它套用字体。action 取值：list（列出方案）、get（查看当前方案）、use（切换当前方案）、save（保存方案）、apply（把方案套用到文件）、audit（检查文件实际字体）。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'use', 'save', 'apply', 'audit'],
          description: '要执行的操作',
        },
        scheme: {
          type: 'string',
          description: 'use 时为方案 id 或名称；save 时为方案 JSON 字符串（含 name/scripts/roles）',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'apply/audit 要处理的 .docx/.pptx/.xlsx 路径，可相对当前工作区',
        },
        output: {
          type: 'string',
          description: 'apply 时可选：另存为新文件而不是就地改写',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render(_args, value) {
        return [{ type: 'text', text: String(value) }];
      },
    },
    async execute(args, exec) {
      const action = String(args?.action || 'list').toLowerCase();
      const state = loadState();

      if (action === 'list') return renderList(state);

      if (action === 'get') {
        const scheme = args?.scheme ? findScheme(state, args.scheme) : activeScheme(state);
        if (!scheme) return `找不到方案「${args.scheme}」。可用：${allSchemes(state).map((s) => s.id).join('、')}`;
        return describeScheme(scheme);
      }

      if (action === 'use') {
        const scheme = findScheme(state, args?.scheme);
        if (!scheme) return `找不到方案「${args?.scheme || ''}」。可用：${allSchemes(state).map((s) => s.id).join('、')}`;
        state.active = scheme.id;
        saveState(state);
        return `已把当前排版方案切换为「${scheme.name}」（${scheme.id}）。后续 fontcraft apply 会用这套字体与字号。`;
      }

      if (action === 'save') {
        let incoming = args?.scheme;
        if (typeof incoming === 'string') {
          try {
            incoming = JSON.parse(incoming);
          } catch {
            return 'save 需要 scheme 为方案 JSON 字符串或对象（含 name/scripts/roles）。';
          }
        }
        if (!incoming || typeof incoming !== 'object') return 'save 需要 scheme 为方案 JSON 字符串或对象（含 name/scripts/roles）。';
        const normalized = normalize({ ...incoming, id: incoming.id || `custom-${Date.now().toString(36)}` });
        state.schemes[normalized.id] = normalized;
        state.active = normalized.id;
        saveState(state);
        return `已保存并启用排版方案「${normalized.name}」（${normalized.id}）。`;
      }

      if (action === 'apply') {
        const files = Array.isArray(args?.files) ? args.files.filter(Boolean) : [];
        if (files.length === 0) return 'apply 需要 files：一个或多个 .docx/.pptx/.xlsx 路径。';
        const scheme = args?.scheme ? findScheme(state, args.scheme) : activeScheme(state);
        if (!scheme) return `找不到方案「${args?.scheme || ''}」。`;
        const cwd = ctx.get('workingDirectory')?.get?.(exec?.agent?.session) || process.cwd();
        const lines = [`套用方案：${scheme.name}（${scheme.id}）`, ''];
        for (const file of files) {
          const target = resolvePath(file, cwd);
          if (!fs.existsSync(target)) {
            lines.push(`✗ ${file}：文件不存在（解析为 ${target}）`);
            continue;
          }
          if (!isSupported(target)) {
            lines.push(`✗ ${file}：只支持 .docx / .pptx / .xlsx`);
            continue;
          }
          try {
            const result = applySchemeToFile(target, scheme, {
              outputPath: args?.output && files.length === 1 ? resolvePath(args.output, cwd) : undefined,
            });
            const fonts = result.fonts
              .filter(([key]) => !key.endsWith('pt'))
              .slice(0, 6)
              .map(([font, count]) => `${font}×${count}`)
              .join('、');
            const sizes = result.fonts
              .filter(([key]) => key.endsWith('pt'))
              .map(([key]) => key)
              .slice(0, 8)
              .join('/');
            lines.push(`✓ ${path.basename(result.file)}：${result.paragraphs} 段落 / ${result.runs} run；字体 ${fonts || '—'}；字号 ${sizes || '—'}`);
          } catch (error) {
            lines.push(`✗ ${file}：${error?.message || error}`);
          }
        }
        return lines.join('\n');
      }

      if (action === 'audit') {
        const files = Array.isArray(args?.files) ? args.files.filter(Boolean) : [];
        if (files.length === 0) return 'audit 需要 files：一个或多个文档路径。';
        const cwd = ctx.get('workingDirectory')?.get?.(exec?.agent?.session) || process.cwd();
        const lines = [];
        for (const file of files) {
          const target = resolvePath(file, cwd);
          if (!fs.existsSync(target)) {
            lines.push(`✗ ${file}：文件不存在`);
            continue;
          }
          try {
            const result = inspectFileFonts(target);
            lines.push(`${path.basename(target)}：`);
            for (const [key, count] of result.fonts.slice(0, 20)) lines.push(`  ${key}  ×${count}`);
          } catch (error) {
            lines.push(`✗ ${file}：${error?.message || error}`);
          }
        }
        return lines.join('\n') || '没有可检查的文件。';
      }

      return `未知 action「${action}」，可用：list / get / use / save / apply / audit。`;
    },
  });

  // ── HTTP 接口：面板读写方案与字体清单 ────────────────────────────────────
  ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    async handler(req, res) {
      const send = (status, body) => {
        const payload = Buffer.from(JSON.stringify(body), 'utf8');
        res.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': payload.length,
          'cache-control': 'no-store',
        });
        res.end(payload);
      };
      const url = new URL(req.url || '/', 'http://localhost');
      const route = url.pathname.slice(API_PREFIX.length) || '/';
      try {
        if (route === '/state' && req.method === 'GET') {
          const state = loadState();
          const fonts = listFonts();
          send(200, {
            ok: true,
            active: state.active,
            schemes: allSchemes(state),
            catalog: {
              scripts: SCRIPTS,
              roles: ROLE_ORDER.map((id) => ({ id, ...ROLES[id] })),
              sizes: SIZE_PRESETS,
              roleOrder: ROLE_ORDER,
            },
            fonts,
          });
          return;
        }
        if (route === '/scheme' && req.method === 'POST') {
          const body = await readJson(req);
          const scheme = body?.scheme;
          if (!scheme || typeof scheme !== 'object') {
            send(400, { ok: false, error: '缺少 scheme' });
            return;
          }
          const state = loadState();
          const id = String(scheme.id || '').trim() || `custom-${Date.now().toString(36)}`;
          if (BUILTIN_SCHEMES.some((b) => b.id === id)) {
            send(400, { ok: false, error: '内置方案不能覆盖，请另存为新方案' });
            return;
          }
          const normalized = normalize({ ...scheme, id });
          state.schemes[id] = normalized;
          if (body.apply !== false) state.active = id;
          saveState(state);
          send(200, { ok: true, scheme: normalized, active: state.active });
          return;
        }
        if (route === '/active' && req.method === 'POST') {
          const body = await readJson(req);
          const state = loadState();
          const scheme = findScheme(state, body?.id);
          if (!scheme) {
            send(404, { ok: false, error: '方案不存在' });
            return;
          }
          state.active = scheme.id;
          saveState(state);
          send(200, { ok: true, active: state.active, scheme });
          return;
        }
        if (route === '/scheme' && req.method === 'DELETE') {
          const state = loadState();
          const id = url.searchParams.get('id') || '';
          if (!state.schemes[id]) {
            send(404, { ok: false, error: '只能删除自定义方案' });
            return;
          }
          delete state.schemes[id];
          if (state.active === id) state.active = BUILTIN_SCHEMES[0].id;
          saveState(state);
          send(200, { ok: true, active: state.active });
          return;
        }
        if (route === '/fonts' && req.method === 'GET') {
          send(200, { ok: true, fonts: listFonts() });
          return;
        }
        if (route === '/blank' && req.method === 'GET') {
          send(200, { ok: true, scheme: blankScheme('自定义方案') });
          return;
        }
        send(404, { ok: false, error: `未知接口 ${route}` });
      } catch (error) {
        send(500, { ok: false, error: String(error?.message || error) });
      }
    },
  });

  log('fontcraft: 排版插件已加载');
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// 供单元测试 / 面板复用
export { allSchemes, activeScheme, findScheme, fontFor, normalize, sizeName };
