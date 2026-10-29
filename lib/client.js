window.__ModuleLoader__.load({
	id: "fontcraft",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const h = React.createElement;

		// 面板渲染到 body，避免被输入框的 overflow/transform 裁掉；取不到 react-dom 时退化为原位渲染
		let ReactDOM = null;
		try {
			ReactDOM = require("react-dom");
		} catch {
			ReactDOM = null;
		}
		function portal(node) {
			try {
				if (ReactDOM && typeof ReactDOM.createPortal === "function") return ReactDOM.createPortal(node, document.body);
			} catch {
				/* 退化为原位渲染 */
			}
			return node;
		}

		// 出错时只让按钮消失，不影响整个输入框
		class Boundary extends React.Component {
			constructor(props) {
				super(props);
				this.state = { failed: false };
			}
			static getDerivedStateFromError() {
				return { failed: true };
			}
			render() {
				if (this.state.failed) return null;
				return this.props.children;
			}
		}

		// ── 常量 ────────────────────────────────────────────────────────────
		const SIZE_PRESETS = [
			{ pt: 26, name: "26pt" }, { pt: 24, name: "24pt" }, { pt: 22, name: "二号" },
			{ pt: 20, name: "20pt" }, { pt: 18, name: "小二" }, { pt: 16, name: "三号" },
			{ pt: 15, name: "小三" }, { pt: 14, name: "四号" }, { pt: 13, name: "13pt" },
			{ pt: 12, name: "小四" }, { pt: 11, name: "11pt" }, { pt: 10.5, name: "五号" },
			{ pt: 9, name: "小五" }, { pt: 8, name: "六号" },
		];

		const ROLE_FALLBACK = [
			{ id: "coverTitle", label: "封面标题", sample: "项目结题报告" },
			{ id: "title1", label: "一级标题", sample: "一、研究背景与目标" },
			{ id: "title2", label: "二级标题", sample: "（一）国内外研究现状" },
			{ id: "title3", label: "三级标题", sample: "1. 关键技术路线" },
			{ id: "body", label: "正文", sample: "本年度共完成 3 项实验，准确率达到 96.8%，详见 Appendix A。" },
			{ id: "caption", label: "图表注", sample: "图 1  系统总体架构（2026 年 10 月）" },
			{ id: "table", label: "表格文字", sample: "指标名称 / Accuracy / 96.8%" },
			{ id: "header", label: "页眉", sample: "fontcraft 用户手册" },
			{ id: "footer", label: "页脚", sample: "第 1 页 共 8 页" },
			{ id: "code", label: "代码 / 等宽", sample: "npm install fontcraft --save" },
		];

		const SCRIPT_FALLBACK = [
			{ key: "cjk", label: "中文", hint: "汉字与中文标点" },
			{ key: "latin", label: "英文", hint: "拉丁字母单词" },
			{ key: "digit", label: "数字", hint: "0-9 等数字" },
		];

		const ALIGNS = [
			{ value: "", label: "保持原样" },
			{ value: "left", label: "左对齐" },
			{ value: "center", label: "居中" },
			{ value: "right", label: "右对齐" },
			{ value: "justify", label: "两端对齐" },
		];

		const PREVIEW_ROLES = ["coverTitle", "title1", "title2", "title3", "body", "caption", "table"];

		// ── 工具函数 ────────────────────────────────────────────────────────
		function sizeName(pt) {
			const found = SIZE_PRESETS.find((s) => Math.abs(s.pt - Number(pt)) < 0.001);
			return found ? found.name : `${pt}pt`;
		}

		function isCjk(code) {
			return (
				(code >= 0x4e00 && code <= 0x9fff) ||
				(code >= 0x3400 && code <= 0x4dbf) ||
				(code >= 0xf900 && code <= 0xfaff) ||
				(code >= 0x3000 && code <= 0x303f) ||
				(code >= 0xff00 && code <= 0xffef)
			);
		}

		function charKind(ch) {
			const code = ch.codePointAt(0);
			if (code <= 0x20) return "space";
			if ((code >= 0x30 && code <= 0x39) || (code >= 0xff10 && code <= 0xff19)) return "digit";
			if (
				(code >= 0x41 && code <= 0x5a) ||
				(code >= 0x61 && code <= 0x7a) ||
				(code >= 0xff21 && code <= 0xff3a) ||
				(code >= 0xff41 && code <= 0xff5a) ||
				(code >= 0xc0 && code <= 0x24f)
			)
				return "latin";
			if (isCjk(code)) return "cjk";
			return "other";
		}

		function splitSegments(text) {
			const out = [];
			let current = null;
			for (const ch of String(text)) {
				const kind = charKind(ch);
				if (kind === "space" || kind === "other") {
					if (current) current.text += ch;
					else {
						current = { kind: "other", text: ch };
						out.push(current);
					}
					continue;
				}
				if (!current || (current.kind !== kind && current.kind !== "other")) {
					current = { kind, text: ch };
					out.push(current);
				} else if (current.kind === "other") {
					current.kind = kind;
					current.text += ch;
				} else {
					current.text += ch;
				}
			}
			return out;
		}

		function fontFor(scheme, roleId, kind) {
			const role = scheme.roles[roleId] || {};
			const override = role.font && role.font[kind];
			if (override) return override;
			const script = scheme.scripts && scheme.scripts[kind];
			return (script && script.font) || (kind === "cjk" ? "宋体" : "Times New Roman");
		}

		function roleCss(scheme, roleId) {
			const role = scheme.roles[roleId] || { size: 12 };
			const style = {
				fontSize: `${role.size}pt`,
				fontWeight: role.bold ? 700 : 400,
				textAlign: role.align === "justify" ? "justify" : role.align || "left",
				marginTop: `${role.spaceBefore != null ? role.spaceBefore : 0}px`,
				marginBottom: `${role.spaceAfter != null ? role.spaceAfter : 6}px`,
				color: "var(--dsw-alias-label-primary, #1b1b1b)",
			};
			if (role.lineSpacing) {
				style.lineHeight =
					role.lineSpacing.mode === "exact"
						? Math.max(1, Number(role.lineSpacing.value) / (Number(role.size) * 1.18))
						: Number(role.lineSpacing.value);
			} else {
				style.lineHeight = 1.5;
			}
			if (role.firstLineIndent) {
				style.textIndent = `${role.firstLineIndent}em`;
			}
			return style;
		}

		function clone(scheme) {
			return JSON.parse(JSON.stringify(scheme));
		}

		async function api(method, route, body) {
			const response = await fetch(`/fontcraft/api${route}`, {
				method,
				headers: body ? { "content-type": "application/json" } : undefined,
				body: body ? JSON.stringify(body) : undefined,
			});
			const data = await response.json().catch(() => ({ ok: false, error: "响应不是 JSON" }));
			if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
			return data;
		}

		function ensureStyle() {
			if (document.getElementById("fontcraft-style")) return;
			const style = document.createElement("style");
			style.id = "fontcraft-style";
			style.textContent = `
.fc-trigger{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:138px;background:transparent;color:var(--dsw-alias-label-secondary,#5b5b5b);font-size:12px;line-height:1;cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s,color .15s}
.fc-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#111)}
.fc-trigger[data-open="true"]{border-color:var(--dsw-alias-brand-primary,#4d6bfe);color:var(--dsw-alias-brand-primary,#4d6bfe)}
.fc-trigger-a{font-weight:700;font-size:12px;font-family:"Times New Roman",serif;letter-spacing:-.5px}
.fc-backdrop{position:fixed;inset:0;background:rgba(15,18,24,.28);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px}
.fc-panel{width:min(1040px,94vw);height:min(720px,86vh);display:flex;flex-direction:column;background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary,#1b1b1b);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.12);overflow:hidden;font-size:13px;font-family:inherit}
.fc-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08))}
.fc-title{font-size:15px;font-weight:600;margin:0;flex:none}
.fc-sub{color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fc-icon-btn{border:0;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}
.fc-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.fc-toolbar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.06));flex-wrap:wrap}
.fc-body{flex:1;display:flex;min-height:0}
.fc-edit{flex:1;min-width:0;overflow:auto;padding:12px 16px 20px}
.fc-side{width:330px;flex:none;border-left:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));overflow:auto;padding:14px 16px 20px;background:var(--dsw-alias-bg-sunken,#f7f8fa)}
.fc-section{margin-bottom:18px}
.fc-section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#5b5b5b);letter-spacing:.02em;margin:0 0 8px;display:flex;align-items:center;gap:6px}
.fc-hint{font-weight:400;color:var(--dsw-alias-label-tertiary,#999);font-size:11px}
.fc-field{display:grid;grid-template-columns:64px 1fr;align-items:center;gap:10px;margin-bottom:8px}
.fc-label{color:var(--dsw-alias-label-secondary,#5b5b5b);font-size:12px}
.fc-input,.fc-select{font:inherit;font-size:12px;color:inherit;background:var(--dsw-alias-bg-elevated,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.16));border-radius:7px;padding:5px 7px;min-width:0;width:100%;box-sizing:border-box}
.fc-select{cursor:pointer}
.fc-input:focus,.fc-select:focus{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:-1px}
.fc-btn{font:inherit;font-size:12px;border-radius:8px;padding:6px 12px;cursor:pointer;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.16));background:var(--dsw-alias-bg-elevated,#fff);color:inherit}
.fc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}
.fc-btn-primary{background:var(--dsw-alias-brand-primary,#4d6bfe);border-color:transparent;color:#fff;font-weight:500}
.fc-btn-primary:hover{filter:brightness(1.06);background:var(--dsw-alias-brand-primary,#4d6bfe)}
.fc-btn-danger{color:#c0392b;border-color:rgba(192,57,43,.35)}
.fc-role{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));border-radius:10px;margin-bottom:8px;overflow:hidden;background:var(--dsw-alias-bg-elevated,#fff)}
.fc-role-head{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;user-select:none}
.fc-role-head:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.03))}
.fc-role-name{font-weight:600;font-size:12px;flex:none;width:74px}
.fc-role-sum{flex:1;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fc-role-chev{color:var(--dsw-alias-label-tertiary,#aaa);font-size:10px}
.fc-role-body{padding:4px 12px 12px;border-top:1px dashed var(--dsw-alias-border-l2,rgba(0,0,0,.08))}
.fc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;margin-top:10px}
.fc-grid .fc-field{grid-template-columns:56px 1fr;margin:0}
.fc-preview-paper{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.06);padding:22px 20px;min-height:320px}
.fc-preview-title{font-size:11px;color:var(--dsw-alias-label-tertiary,#999);margin:0 0 8px;letter-spacing:.04em}
.fc-sample{margin:0;white-space:pre-wrap;word-break:break-word}
.fc-toast{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-secondary,#5b5b5b)}
.fc-toast[data-error="true"]{color:#c0392b}
.fc-foot{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));background:var(--dsw-alias-bg-elevated,#fff)}
.fc-spacer{flex:1}
.fc-empty{padding:24px;text-align:center;color:var(--dsw-alias-label-tertiary,#999);font-size:12px}
@media (max-width: 760px){ .fc-side{width:240px} }
`;
			document.head.appendChild(style);
		}

		// ── 子组件 ──────────────────────────────────────────────────────────
		function Segmented({ text, scheme, roleId }) {
			const parts = splitSegments(text);
			return h(
				"span",
				null,
				parts.map((part, index) =>
					h(
						"span",
						{
							key: index,
							style: { fontFamily: `"${fontFor(scheme, roleId, part.kind)}", serif` },
						},
						part.text,
					),
				),
			);
		}

		function Preview({ scheme, roles }) {
			return h(
				"div",
				null,
				h("p", { className: "fc-preview-title" }, "实时预览"),
				h(
					"div",
					{ className: "fc-preview-paper" },
					PREVIEW_ROLES.map((roleId) => {
						const meta = roles.find((r) => r.id === roleId) || ROLE_FALLBACK.find((r) => r.id === roleId);
						if (!meta) return null;
						return h(
							"p",
							{ key: roleId, className: "fc-sample", style: roleCss(scheme, roleId) },
							h(Segmented, { text: meta.sample, scheme, roleId }),
						);
					}),
				),
			);
		}

		function FontSelect({ value, onChange, fonts, allowInherit }) {
			const options = [];
			if (allowInherit) options.push(h("option", { value: "", key: "__inherit" }, "继承类别字体"));
			const groups = [];
			const splitFonts = fonts || { cjk: [], latin: [] };
			if (splitFonts.cjk && splitFonts.cjk.length) {
				groups.push(
					h(
						"optgroup",
						{ label: "中文字体", key: "cjk" },
						splitFonts.cjk.map((font) => h("option", { value: font, key: `cjk-${font}` }, font)),
					),
				);
			}
			if (splitFonts.latin && splitFonts.latin.length) {
				groups.push(
					h(
						"optgroup",
						{ label: "西文字体", key: "latin" },
						splitFonts.latin.map((font) => h("option", { value: font, key: `latin-${font}` }, font)),
					),
				);
			}
			const known = [...(splitFonts.cjk || []), ...(splitFonts.latin || [])];
			if (value && !known.includes(value)) {
				options.push(h("option", { value, key: `cur-${value}` }, `${value}（本机未安装）`));
			}
			return h(
				"select",
				{ className: "fc-select", value: value || "", onChange: (event) => onChange(event.target.value) },
				[...options, ...groups],
			);
		}

		function RoleRow({ role, scheme, fonts, expanded, onToggle, onChange }) {
			const current = scheme.roles[role.id] || {};
			const summary = [
				`${current.size}pt（${sizeName(current.size)}）`,
				current.bold ? "加粗" : null,
				current.align ? { left: "左对齐", center: "居中", right: "右对齐", justify: "两端对齐" }[current.align] : null,
				current.lineSpacing
					? current.lineSpacing.mode === "exact"
						? `固定 ${current.lineSpacing.value}pt`
						: `${current.lineSpacing.value} 倍行距`
					: null,
				current.firstLineIndent ? `首行缩进 ${current.firstLineIndent} 字` : null,
			]
				.filter(Boolean)
				.join(" · ");

			const body = expanded
				? h(
						"div",
						{ className: "fc-role-body" },
						h(
							"div",
							{ className: "fc-grid" },
							h(
								"label",
								{ className: "fc-field" },
								h("span", { className: "fc-label" }, "字号"),
								h(
									"select",
									{
										className: "fc-select",
										value: String(current.size),
										onChange: (event) => onChange({ size: Number(event.target.value) }),
									},
									SIZE_PRESETS.map((size) =>
										h("option", { value: String(size.pt), key: size.pt }, `${size.pt}pt · ${size.name}`),
									),
								),
							),
							h(
								"label",
								{ className: "fc-field" },
								h("span", { className: "fc-label" }, "对齐"),
								h(
									"select",
									{
										className: "fc-select",
										value: current.align || "",
										onChange: (event) => onChange({ align: event.target.value || null }),
									},
									ALIGNS.map((align) => h("option", { value: align.value, key: align.label }, align.label)),
								),
							),
							h(
								"label",
								{ className: "fc-field" },
								h("span", { className: "fc-label" }, "行距"),
								h(
									"select",
									{
										className: "fc-select",
										value: current.lineSpacing ? current.lineSpacing.mode : "",
										onChange: (event) => {
											const mode = event.target.value;
											if (!mode) return onChange({ lineSpacing: null });
											onChange({
												lineSpacing: { mode, value: current.lineSpacing?.value || (mode === "exact" ? 28 : 1.5) },
											});
										},
									},
									[
										h("option", { value: "", key: "none" }, "保持原样"),
										h("option", { value: "multiple", key: "multiple" }, "倍数"),
										h("option", { value: "exact", key: "exact" }, "固定值 (pt)"),
									],
								),
							),
							h(
								"label",
								{ className: "fc-field" },
								h("span", { className: "fc-label" }, "行距值"),
								h("input", {
									className: "fc-input",
									type: "number",
									min: "0.8",
									max: current.lineSpacing && current.lineSpacing.mode === "exact" ? 120 : 3,
									step: current.lineSpacing && current.lineSpacing.mode === "exact" ? 1 : 0.05,
									disabled: !current.lineSpacing,
									value: current.lineSpacing ? current.lineSpacing.value : "",
									onChange: (event) => {
										if (!current.lineSpacing) return;
										const value = Number(event.target.value);
										if (!Number.isFinite(value) || value <= 0) return;
										onChange({ lineSpacing: { ...current.lineSpacing, value } });
									},
								}),
							),
							h(
								"label",
								{ className: "fc-field" },
								h("span", { className: "fc-label" }, "首行缩进"),
								h(
									"select",
									{
										className: "fc-select",
										value: current.firstLineIndent == null ? "" : String(current.firstLineIndent),
										onChange: (event) =>
											onChange({ firstLineIndent: event.target.value === "" ? null : Number(event.target.value) }),
									},
									[
										h("option", { value: "", key: "0" }, "无"),
										h("option", { value: "1", key: "1" }, "1 字符"),
										h("option", { value: "2", key: "2" }, "2 字符"),
										h("option", { value: "0.5", key: "05" }, "0.5 字符"),
									],
								),
							),
							h(
								"label",
								{ className: "fc-field" },
								h("span", { className: "fc-label" }, "加粗"),
								h("input", {
									type: "checkbox",
									checked: Boolean(current.bold),
									onChange: (event) => onChange({ bold: event.target.checked }),
								}),
							),
							h(
								"label",
								{ className: "fc-field" },
								h("span", { className: "fc-label" }, "段前(pt)"),
								h("input", {
									className: "fc-input",
									type: "number",
									min: "0",
									step: "1",
									value: current.spaceBefore == null ? "" : current.spaceBefore,
									onChange: (event) => {
										const value = event.target.value;
										onChange({ spaceBefore: value === "" ? null : Number(value) });
									},
								}),
							),
							h(
								"label",
								{ className: "fc-field" },
								h("span", { className: "fc-label" }, "段后(pt)"),
								h("input", {
									className: "fc-input",
									type: "number",
									min: "0",
									step: "1",
									value: current.spaceAfter == null ? "" : current.spaceAfter,
									onChange: (event) => {
										const value = event.target.value;
										onChange({ spaceAfter: value === "" ? null : Number(value) });
									},
								}),
							),
						),
						h(
							"div",
							{ className: "fc-grid" },
							SCRIPT_FALLBACK.map((script) =>
								h(
									"label",
									{ className: "fc-field", key: script.key },
									h("span", { className: "fc-label" }, script.label),
									h(FontSelect, {
										value: (current.font && current.font[script.key]) || "",
										allowInherit: true,
										fonts,
										onChange: (font) =>
											onChange({
												font: { ...(current.font || {}), [script.key]: font || undefined },
											}),
									}),
								),
							),
						),
					)
				: null;

			return h(
				"div",
				{ className: "fc-role" },
				h(
					"div",
					{ className: "fc-role-head", onClick: onToggle, role: "button", tabIndex: 0 },
					h("span", { className: "fc-role-name" }, role.label),
					h("span", { className: "fc-role-sum" }, summary),
					h("span", { className: "fc-role-chev" }, expanded ? "▾" : "▸"),
				),
				body,
			);
		}

		function Panel({ onClose }) {
			const [state, setState] = React.useState(null);
			const [draft, setDraft] = React.useState(null);
			const [expanded, setExpanded] = React.useState("body");
			const [toast, setToast] = React.useState({ text: "", error: false });
			const [busy, setBusy] = React.useState(false);

			const notify = (text, error) => {
				setToast({ text, error: Boolean(error) });
				if (!error)
					setTimeout(() => {
						setToast((prev) => (prev.text === text ? { text: "", error: false } : prev));
					}, 2400);
			};

			const load = React.useCallback(async () => {
				try {
					const data = await api("GET", "/state");
					setState(data);
					const active = data.schemes.find((s) => s.id === data.active) || data.schemes[0];
					setDraft(active ? clone(active) : null);
				} catch (error) {
					notify(`读取方案失败：${error.message}`, true);
				}
			}, []);

			React.useEffect(() => {
				load();
			}, [load]);

			const pickScheme = (id) => {
				const found = state.schemes.find((s) => s.id === id);
				if (found) setDraft(clone(found));
			};

			const newScheme = async () => {
				try {
					const data = await api("GET", "/blank");
					setDraft(clone(data.scheme));
				} catch (error) {
					notify(`新建失败：${error.message}`, true);
				}
			};

			const save = async () => {
				if (!draft) return;
				setBusy(true);
				try {
					const payload = clone(draft);
					if (payload.builtin) {
						delete payload.builtin;
						payload.id = `custom-${Date.now().toString(36)}`;
						if (!/（自定义）$/.test(payload.name)) payload.name = `${payload.name}（自定义）`;
					}
					await api("POST", "/scheme", { scheme: payload, apply: true });
					await load();
					notify("已保存并启用，生成文档时会自动套用");
				} catch (error) {
					notify(`保存失败：${error.message}`, true);
				} finally {
					setBusy(false);
				}
			};

			const remove = async () => {
				if (!state || !draft || draft.builtin) return;
				setBusy(true);
				try {
					await api("DELETE", `/scheme?id=${encodeURIComponent(draft.id)}`);
					await load();
					notify("已删除");
				} catch (error) {
					notify(`删除失败：${error.message}`, true);
				} finally {
					setBusy(false);
				}
			};

			if (!state || !draft) {
				return h(
					"div",
					{ className: "fc-backdrop", onClick: onClose },
					h(
						"div",
						{ className: "fc-panel", style: { width: 420, height: 160 }, onClick: (event) => event.stopPropagation() },
						h("div", { className: "fc-empty" }, "正在读取排版方案…"),
					),
				);
			}

			const roles = [...state.catalog.roles].sort(
				(a, b) => state.catalog.roleOrder.indexOf(a.id) - state.catalog.roleOrder.indexOf(b.id),
			);

			const updateRole = (roleId, patch) => {
				setDraft((prev) => {
					const next = clone(prev);
					next.roles[roleId] = { ...next.roles[roleId], ...patch };
					return next;
				});
			};

			const updateScript = (key, font) => {
				setDraft((prev) => {
					const next = clone(prev);
					next.scripts[key] = { ...(next.scripts[key] || {}), font };
					return next;
				});
			};

			return h(
				"div",
				{ className: "fc-backdrop", onClick: onClose },
				h(
					"div",
					{ className: "fc-panel", onClick: (event) => event.stopPropagation() },
					h(
						"div",
						{ className: "fc-head" },
						h("h2", { className: "fc-title" }, "排版方案"),
						h("div", { className: "fc-sub" }, "生成 Word / PPT / Excel 前，先定好各类文字的字体与字号"),
						h("button", { className: "fc-icon-btn", onClick: onClose, title: "关闭" }, "✕"),
					),
					h(
						"div",
						{ className: "fc-toolbar" },
						h(
							"select",
							{
								className: "fc-select",
								style: { width: 240 },
								value: draft.id,
								onChange: (event) => pickScheme(event.target.value),
							},
							state.schemes.map((scheme) =>
								h("option", { value: scheme.id, key: scheme.id }, `${scheme.name}${scheme.builtin ? "（内置）" : ""}`),
							),
						),
						h("button", { className: "fc-btn", onClick: newScheme }, "新建"),
						h("button", { className: "fc-btn fc-btn-danger", onClick: remove, disabled: draft.builtin }, "删除"),
						h("span", { className: "fc-toast", "data-error": toast.error }, toast.text),
					),
					h(
						"div",
						{ className: "fc-body" },
						h(
							"div",
							{ className: "fc-edit" },
							h(
								"div",
								{ className: "fc-section" },
								h("p", { className: "fc-section-title" }, "方案名称"),
								h("input", {
									className: "fc-input",
									value: draft.name,
									onChange: (event) =>
										setDraft((prev) => ({ ...prev, name: event.target.value })),
								}),
							),
							h(
								"div",
								{ className: "fc-section" },
								h(
									"p",
									{ className: "fc-section-title" },
									"文字类别字体 ",
									h("span", { className: "fc-hint" }, "中文 / 英文 / 数字可以各用不同字体"),
								),
								SCRIPT_FALLBACK.map((script) =>
									h(
										"label",
										{ className: "fc-field", key: script.key },
										h("span", { className: "fc-label" }, script.label),
										h(FontSelect, {
											value: draft.scripts[script.key] ? draft.scripts[script.key].font : "",
											fonts: state.fonts,
											onChange: (font) => updateScript(script.key, font),
										}),
									),
								),
							),
							h(
								"div",
								{ className: "fc-section" },
								h(
									"p",
									{ className: "fc-section-title" },
									"文字角色样式 ",
									h("span", { className: "fc-hint" }, "点击展开，可单独覆盖字体"),
								),
								roles.map((role) =>
									h(RoleRow, {
										key: role.id,
										role,
										scheme: draft,
										fonts: state.fonts,
										expanded: expanded === role.id,
										onToggle: () => setExpanded((prev) => (prev === role.id ? "" : role.id)),
										onChange: (patch) => updateRole(role.id, patch),
									}),
								),
							),
						),
						h("div", { className: "fc-side" }, h(Preview, { scheme: draft, roles })),
					),
					h(
						"div",
						{ className: "fc-foot" },
						state.active === draft.id
							? h("span", { className: "fc-toast" }, "当前方案")
							: h("span", { className: "fc-toast" }, "修改后点右侧按钮保存"),
						h("div", { className: "fc-spacer" }),
						h("button", { className: "fc-btn", onClick: onClose }, "关闭"),
						h(
							"button",
							{ className: "fc-btn fc-btn-primary", onClick: save, disabled: busy },
							busy ? "保存中…" : "保存并应用",
						),
					),
				),
			);
		}

		function FontcraftButton() {
			const [open, setOpen] = React.useState(false);
			React.useEffect(() => {
				ensureStyle();
			}, []);
			return h(
				Boundary,
				null,
				h(
					React.Fragment,
					null,
					h(
						"button",
						{
							type: "button",
							className: "fc-trigger",
							"data-open": open ? "true" : "false",
							title: "排版方案：选择标题、正文、数字、英文的字体与字号",
							onClick: () => setOpen((prev) => !prev),
						},
						h("span", { className: "fc-trigger-a" }, "Aa"),
						h("span", null, "排版"),
					),
					open ? portal(h(Panel, { onClose: () => setOpen(false) })) : null,
				),
			);
		}

		// ── 插件入口 ────────────────────────────────────────────────────────
		const inject = ["slots"];

		function apply(ctx) {
			ensureStyle();
			ctx.slots.inject("conversation.input.left", () =>
				ctx.slots.register(
					{
						name: "conversation.input.left",
						id: "fontcraft",
						order: 20,
					},
					FontcraftButton,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.FontcraftButton = FontcraftButton;
		return module.exports;
	},
});
