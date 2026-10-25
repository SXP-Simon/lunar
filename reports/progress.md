# 验证进度与未完成项

本文件区分已证实结果和后续工作，不能当成全部验收通过报告。

## 已完成：XML 解析

- [Issue #3](https://github.com/Umbrae-Labs/lunar/issues/3)
- [PR #4](https://github.com/Umbrae-Labs/lunar/pull/4)，代码分支 `fix/epub-xml-parser`，提交 `6592b871c2482ec8e76625b085f720dde7221202`。
- [上游 CI](https://github.com/Umbrae-Labs/lunar/actions/runs/40199008609/job/121185961476) 通过。
- 两个 EPUBCheck 合规变体在基线模拟器复现、修复模拟器通过；见 `xml-device-validation.md`。

## 正在验证：固定版式

Haruko 源文件全局声明 `pre-paginated`，p01 视口 600×837，一张 JPG；about spine 项覆盖为流式。Lunar 基线实际可显示第一页完整漫画图（`device/fxl-baseline-haruko-page1-ready.png`）。不能声称所有 FXL 都无法显示；尚未验收缩放、左右页配对、RTL 翻页和最后的流式页。

《The Voyage of Life》默认流式，四个 painting spine 项分别覆盖为 `rendition:layout-pre-paginated`。第一幅画的视口 1024×697，CSS 为 1024px 宽、绝对定位图片。已导入基线；打开时测试环境失去响应，尚未取得可判读页面。

该次环境故障中，`/proc/meminfo` 显示 `MemAvailable=0`、`SwapFree=32 kB`；开发版和基线版同时驻留（各自 RSS/Swap 见 `fxl-proc-memory.txt`），截图超时，而 ADB shell 仍可响应。此证据不足以归因给特定 EPUB 或 Rito。已结束该测试模拟器，重启同一 AVD 的只读实例，使用 4096MiB 内存，后续只运行一个 APK。测试 APK、样书仍使用原先校验值，未更换引擎。

## 尚需完成的目标

4GB 单应用复测已推进：Cole 可打开，固定画页完整显示；Youth 流式页的浮动图文重叠。Waste Land 与草枕被 alternate stylesheet 选择校验阻断；仅移除 Waste Land 的备用引用后可打开，且变体通过 EPUBCheck。源码根因及截图见 [复杂排版设备验证](complex-layout-device-validation.md)。以上新增问题尚未修复。

1. 固定版式／混合版式识别与提示：完成干净环境复测，按证据决定实现，独立分支及 PR。
2. 出版方样式：比较实际嵌入字体与当前全局覆盖，验证后实现原书／自定义模式，独立分支及 PR。
3. 锁定 Rito 的真实能力：逐项验证表格、浮动、Ruby、竖排、定位；补充覆盖样本，不能拿上游 dev 文档代替设备证据。
4. 阅读交互：跨页文本完整性、搜索、选区／划线、改字号和重新打开定位；确认的问题分别开分支。
5. 导入／首次打开／跨章节／重排：采集有构建和设备身份的指标，分析内存及耗时；模拟器指标不得表述为真机性能或引擎横向排名。

验证 EPUB、源文件分析、截图、日志只放本 evidence 分支；每个修复 PR 链接固定提交，不携带这些文件。不因暂时缺少证据就把某项声明为已通过。
