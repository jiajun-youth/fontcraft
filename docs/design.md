# fontcraft 设计草案

> 目标：在 DeepSeek Harness（DSH）里加一个「排版方案」插件——生成 Word / PPT / Excel 之前，
> 用户自己点选标题、正文、数字、英文等各类文字的字体与字号，并实时预览，确认后文档按此套用。

## 1. 为什么是"后处理"

DSH 生成 Office 文档的现有路径是 python-docx / python-pptx / openpyxl（office 技能）。
不论文档内容怎么生成，最终都是 OOXML（zip + XML）。因此插件的排版引擎做成
**对已有 .docx / .pptx / .xlsx 的后处理器**：

- 与生成方式解耦：AI 怎么写都不影响排版；
- 对用户已有的文档同样可用；
- 可测试：解压 XML 断言字体、字号。

## 2. 数据模型

中文排版的核心事实：同一段文字里，中文、英文、数字可能需要不同字体；而标题、正文、
图表注、页眉页脚需要不同字号与段落格式。因此方案分两层：

1. **文字类别（scripts）**：`cjk` 中文 / `latin` 英文 / `digit` 数字。每类一个字体。
2. **文字角色（roles）**：`coverTitle` 封面标题、`title1..3` 各级标题、`body` 正文、
   `caption` 图表注、`table` 表格文字、`header` 页眉、`footer` 页脚、`code` 代码。
   每个角色：字号(pt)、加粗、对齐、行距、段前段后、首行缩进(字符)、可选字体覆盖。

角色里的字体覆盖默认继承 scripts，这样"标题黑体 + 正文宋体 + 数字/英文 Times New Roman"
这种典型论文要求只需改一处。

```json
{
  "id": "cn-paper",
  "name": "中文论文（标准）",
  "scripts": {
    "cjk":   { "font": "宋体" },
    "latin": { "font": "Times New Roman" },
    "digit": { "font": "Times New Roman" }
  },
  "roles": {
    "title1": { "size": 16, "bold": true, "align": "center", "font": { "cjk": "黑体", "latin": "Arial", "digit": "Arial" } },
    "body":   { "size": 12, "align": "justify", "lineSpacing": 1.5, "firstLineIndent": 2 }
  }
}
```

## 3. 三层结构

| 层 | 职责 |
|---|---|
| 客户端面板（preact） | 从聊天框旁的「排版方案」按钮打开；逐项选字体/字号/加粗/行距；右侧实时预览样张；保存方案、确认套用 |
| 主机插件（cordis） | 方案存取（工作区 `.fontcraft/`）、字体清单、`fontcraft` 工具（get/apply/list/preview） |
| 排版引擎（纯 Node） | 解包 OOXML → 按角色/类别重写 run 属性 → 重新打包；docx/pptx/xlsx 三套 |

## 4. 引擎要点

### docx（word/document.xml, styles.xml）

- 角色判定：`w:pStyle` 名称（Heading1/2/3、Title、Caption）→ `w:outlineLvl` → 表格内（w:tbl）→ 默认正文。
- run 内按字符类别切段：CJK / 数字 / 拉丁字母 / 其他；每段克隆 `w:rPr`，
  中文段设 `w:eastAsia`，英文段设 `w:ascii`+`w:hAnsi`，数字段设 `w:ascii`+`w:hAnsi`（数字字体），
  并设 `w:sz`/`w:szCs`/`w:b`。保留原有斜体、颜色、下划线等。
- 段落属性：`w:jc`、`w:spacing`（行距倍数 → line=240×倍数；固定值 → lineRule=exact）、
  `w:ind w:firstLineChars`（2 字符 = "200"）、`w:spacing` 段前段后。
- styles.xml：同步 Normal / Heading1-3 / Title / Caption 的 rFonts 与 sz，保证用户后续编辑一致。

### pptx（ppt/slides/*.xml, slideLayouts, slideMasters）

- 角色：占位符类型 `title`/`ctrTitle` → title1；`body`/`subTitle` → body；
  表格 `a:tbl` → table；`a:fld` 页码 → footer。
- run 属性：`a:rPr` 的 `a:latin`/`a:ea`/`a:cs` typeface、`sz`（百分之一磅）、`b`。

### xlsx（xl/styles.xml + sheet XML）

- 单元格粒度无法像 Word 那样按字符切段（混合文本单元格例外），按内容判定：
  表头行 → table 角色（加粗）；文本 → latin/cjk 字体；数值 → digit 字体。
- 做法：向 styles.xml 的 `fonts` 追加角色字体，追加 `cellXfs`，把匹配单元格的 `s` 指向新样式。

## 5. 与 AI 的衔接

- 面板「确认并生成」→ 保存为工作区活动方案 `.fontcraft/active.json`，并向会话发送一条
  简短消息（或在 composer 里插入方案 chip），AI 生成文档后调用 `fontcraft` 工具
  `apply` 把方案套到产物上。
- 插件同时注册一个 `fontcraft` 工具：`list` / `get` / `apply` / `audit`（检查文档实际字体）。
- 通过技能/系统提示告诉模型：**生成任何 Office 文档前，先确认有没有活动方案；
  生成后必须 apply，并向用户报告套用了哪些字体与字号。**

## 6. 验证

- 单元测试：构造最小 OOXML 夹具 → apply → 解压断言 XML。
- 端到端：在本机 `dsh web`（http://127.0.0.1:3080）里点开面板选字体 → 让 AI 生成一份
  Word → 解压产物核对中文字体/西文字体/数字字体/字号 → 再用 LibreOffice 渲染成图目视检查。
