# 复杂 EPUB：模拟器实测与源文件对照

日期：2026-10-25。不是全部 EPUB 功能验收。

## 环境

- API 36，AVD `handwrite-api36`，1080×2400 / 420dpi，4096 MiB。
- x86_64 模拟器通过 ARM64 translation 运行官方 nightly APK；不代表真机性能。
- APK：`nightly-20261024-40115172807`，源码 `8ecf3336ad73b4b73d93d1ade2d3b3847c5e9170`。
- APK SHA-256：`ff2c7bfbd12d3775fbbefd7a66f311364e803e2807c8b84e2175f4963b4c0a0e`。
- `@umbrae-labs/rito-rn@0.3.0-lunar.1`，Rito `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae`。
- 默认阅读设置，单独运行 nightly；未运行开发版或 Metro。
- 样书原版来自 IDPF 20230704，来源、授权、SHA 在 `source-analysis.json`；全部文件位于独立证据分支。

## 1. Cole：固定图片页可显示，流式浮动图片与正文重叠

样书：`samples/cole-voyage-of-life.epub`。EPUBCheck 无错误和警告。

复现步骤：导入 → 打开 → 目录 Childhood → 点右侧翻一页（8/26）→ 再翻一页（9/26）为完整画页 → 再翻一页（10/26）进入 Youth → 再翻一页（11/26）。点屏幕中央隐藏工具栏；首次进入全屏时关闭 Android 的 Got it 提示。

- `device/fxl-4gb-cole-childhood-next2.png`：9/26 的 Childhood 画作完整显示。对应 `EPUB/xhtml/1b-childhood-painting.xhtml`，视口 1024×697，spine 项 s1b 明确声明 `rendition:layout-pre-paginated`。不能由此宣称完整支持 FXL 的缩放、方向、双页等功能，也不能断言所有 FXL 都会损坏。
- `device/flow-cole-youth-overlap.png`：11/26 的图像与后续正文重叠，关闭工具栏后依然存在。对应 **流式** 文档 `EPUB/xhtml/2a-youth-text.xhtml`，`img.detail` 位于两段正文之间；`EPUB/css/cole.css` 指定 `float:right; margin:0.2em 0em 0.9em 2em`。这一处没有绝对定位；`position:absolute` 只属于另一个选择器 `img.full`。
- 这是锁定版本的实际排版异常。尚未把根因定位到 Rito 的 float、分页片段恢复或 Lunar 绘制中的具体模块；不能简单宣称整个引擎不支持 float。
- 干净 4GB 环境能正常打开和翻页；先前双进程占满 2GB 模拟器的故障不能用作该书兼容性结论。

## 2. Waste Land：备用样式表导致整章拒绝加载

原版：`samples/wasteland-otf.epub`，EPUBCheck 无错误和警告。

复现：导入 → 打开。出现 `chapter style resolution ... stylesheet source selection rejected: SelectionIssue { source_index: 1, issue_index: 0 }`，见 `device/fonts-wasteland-baseline.png`。

源文件 `EPUB/wasteland-content.xhtml` 包含：

```html
<link rel="stylesheet" type="text/css" href="wasteland.css" class="day" title="day"/>
<link rel="alternate stylesheet" type="text/css" href="wasteland-night.css" class="night" title="night"/>
```

对照：运行 `python scripts/wasteland-day-only.py` 生成 `samples/wasteland-otf-day-only.epub`。只删正文和目录各一条有效的 `rel="alternate stylesheet"` link；字体、所有 CSS、文本、资源和授权信息保留。SHA-256：`bb4ed8cd19394af89e3aa11019a38fb81e030f26873c266d54009fdb083f4786`。EPUBCheck 5.4.0 无错误和警告，见 `wasteland-otf-day-only.epubcheck.json`。

该变体在同一 APK 可打开并生成 43 页，见 `device/fonts-wasteland-day-only-baseline.png`。这项控制实验支持备用样式表选择是阻断原因；不证明原书 OTF 字体得到了采用。截图中仍呈现 Lunar 默认字体，应用端 `createArtifactRequest` 明确传入 `fontFamilyOverride` 和 `lineHeightOverride`。

锁定引擎源码根因：

- `crates/rito-core/src/xhtml/parser.rs:630`：遇到 alternate token 添加 `alternate stylesheet activation is not modeled`。
- `crates/rito-core/src/style/stylo_sources.rs:227`：任何 selection issue 返回错误，整章停止。
- 上游 dev `ed0284f3703244da28b3e6efd80cf29267cf6e65` 仍存在相同的 alternate 拒绝逻辑；未将上游 dev 当作 Lunar 已发布能力。

## 3. 草枕：首先被相同的备用样式表问题阻断

原版：`samples/kusamakura-japanese-vertical-writing.epub`。EPUBCheck 无错误，有 7 条旧 xsd prefix 警告。

可导入，但打开封面 `xhtml/表紙.xhtml` 时出现 `SelectionIssue { source_index: 0, issue_index: 0 }`，见 `device/vertical-kusamakura-open.png`。它把横排 CSS 作为 alternate link、竖排 CSS 作为普通 stylesheet。必须先排除这个加载阻断，再判断 Ruby、竖排字形和分页能力。当前证据不能声称已经测出竖排排版的好坏。

## 尚未完成

字体原样式模式、FXL 识别提示、Ruby/竖排/表格各项排版、选区及高亮恢复、系统性性能采样仍待继续验证。此次不是这些功能的通过报告。
