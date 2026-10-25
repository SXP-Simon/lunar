# 表格：源码与安装包对照

样书为公开 IDPF `internallinks.epub`，来源与许可见 `source-analysis.json` 和本分支 README，SHA-256 `deaf03a1843f52cc5e4cedb226ca8659610efe1be5e810fccf615bcb549238aa`。书内比较的是历史阅读器行为；本报告仅把这些文字作为表格单元格内容，不采纳它们对当前阅读器的判断。

EPUBCheck 5.4.0 检查为 0 错误、0 警告，见 `internallinks-epubcheck.log`。

测试 APK、内核和应用身份同 `missing-toc-target-validation.md`。屏幕 1080×2400、420 dpi，排版视口 411×914 CSS px，左右边距 24 px，字号 20 px，行距覆盖 1.65，默认 WenKai。这是自定义样式模式下的实测，不是出版方样式完整保真测试。

## 三列表格

`OEBPS/0005.xhtml` 包含 3 列、6 行的普通 HTML table。第 11 页有表头及 Readium 行，第 12 页续 Adobe、iBooks、Kobo、Kindle 行。两个页面的单元格内容、相对列顺序及边框均可看到，未发现这张表遗漏行或单元格文字。

截图：`device/table-linear-start-ready.png`、`device/table-linear-continuation-ready.png`。运行时文本、命中和版面参数：`reports/table-linear-start-runtime.json`、`reports/table-linear-runtime.json`。显示工具栏会遮盖页面上下缘，因此截图中的遮挡不能直接算作原生排版丢字。

## 五列与跨行表头

`OEBPS/0001.xhtml` 第一张 table 有 5 列、3 行，表头中第 1、2、3、5 列均声明 `rowspan="2"`，第二行仅有“MS明朝”，应出现在第 4 列 Readium 下方。

设备把“MS明朝”放在第 1 列，下方数据行仍按各列分布，产生错误的表头含义。第 5 列还超出 411 px 的页面右缘，屏幕不可完整阅读；原生页文本中仍包含 Kindle 内容，故应描述为横向溢出/不可见，而非解析没有读到文字。见 `device/table-rowspan-ready.png`、`device/table-rowspan-hidden.png` 和 `reports/table-rowspan-runtime.json`。

核对内核 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae` 的 `crates/rito-core/src/fragment_bridge/builder/table.rs`：遇到 rowspan > 1 显式记录 `table rowspan laid out as a single row`，实际 TableCell 仅携带 col_span。因此跨行错位是当前内核的明确降级，不应通过修改这本书或在 Lunar 对特定标题打补丁处理。

窄屏宽表溢出应单独验证：源样式为 table-layout:auto，长拉丁单词、单元格 padding 和字号会影响最小宽度，不能只凭这一个样本判定所有 auto table 的宽度算法有错。但 Lunar 当前也没有为此表提供可用的横向阅读操作；“支持表格”不等于“宽表可读”。

## 验证方法与边界

先检查 XHTML 和附带 CSS，再从 Lunar 搜索得到的源范围定位到表格所在页，并读取安装包实际生成的分页工件、截图。仅做本地诊断句柄导出，不改坐标或排版。表格测试没有升级原生库。

本次未覆盖所有复杂表格、嵌套表格或每一种跨页拆分；也没有用宿主机 Rito 结果代替安装包结果。
