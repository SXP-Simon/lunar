# Ruby 与竖排：安装包实测

使用原创 CC0 `samples/ruby-writing-mode-probe.epub`，生成器为 `scripts/ruby-writing-mode-probe.py`，EPUBCheck 0 错误、0 警告。三章正文相同，分别用 `horizontal-tb`、`vertical-rl`、`-epub-writing-mode: vertical-rl`，不包含备用样式表、嵌入字体或脚本。原始书 SHA-256 `3504352a4242bec633742ae496411394ab54ffdfe0df830efb22121f8d3aa3e8`。

应用代码为 Lunar `85a007495bfc10a90dea72b3da44722279bc190f`，只修目录状态，不改变原生排版。APK 和模拟器身份同 `missing-toc-target-validation.md`。初始字体 WenKai、18 px、行距覆盖 1.65。后续将字号改为 20 px。设备截图须等待画面稳定；初次导航后的 `ruby-probe-prefixed.png` 实际仍显示上一章，不作为该章画面证据，最终采用 `ruby-probe-prefixed-settled.png`。

## 能力与问题

- 横排注音显示在对应汉字上方，见 `device/ruby-probe-horizontal.png`。
- 标准与 EPUB 前缀两种竖排声明都生效，CJK 正文为从右向左的竖列，注音在基字右侧。只说明这些简单样式可显示，不代表完整竖排支持。
- 拉丁标题在相邻 shaping run 边界发生挤压、重叠。当前锁定内核的 `fragment_paint/vertical.rs` 按每字 em 高度绘制，但 run 的起始偏移仍来自横排测量；这是可疑的几何不一致，尚未做独立 host 回归或修复。
- **确认缺陷：绘制为竖排，命中与范围坐标仍为横排。** 长按屏幕 `(872,450)` 的“く”附近，标注列表保存的却是第二段中的“の”。见 `device/ruby-probe-prefixed-selection-settled.png` 和 `device/ruby-probe-prefixed-highlight-text.png/.xml`。
- 将字号 18 改为 20 后，仍能回到第三章，标注记录仍存在；点击该标注后黄色区域落在拉丁标题附近，未落在真正的“の”上。见 `device/ruby-probe-prefixed-reflow-mark-jump.png`。因此“记录尚在”不能作为选区、标注正确性的通过依据。
- 通过 Lunar 公开运行时搜索 API 查询“山道”，3 页均能找到正文，结果见 `reports/ruby-vertical-search-reflow.json`。这是 API 检查，不是搜索界面验收，也不能证明搜索高亮坐标准确。

## 归因证据

`reports/ruby-vertical-runtime.json` 来自当前安装包的已解码原生分页工件，以及 Lunar 实际帧、命中条目。为读取状态临时在 `runtime.open` 暴露本地句柄，未改变布局参数、坐标或绘制逻辑，不进入代码 PR。读取时检查书名，未收集用户书内容。摘要见 `ruby-vertical-coordinate-summary.json`。

18 px 时，“く。”绘制矩形约为 `(323.875,160.762,18,36)`；同一文字的原生命中矩形却为 `(96,124.387,36,33.344)`。38 个命中条目中 11 个超过 411 CSS px 页面的右边界。Lunar 接收到的命中 bounds 与原生条目完全相同，因此不能归因为 Lunar 的坐标转换；需在 Rito 的交互工件生成层修复，并通过新版适配包进入 Lunar。

锁定内核 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae` 的 `fragment_paint/vertical.rs` 对绘制进行了竖排投影，而 `runtime/page_artifact/fragment.rs` 的交互收集仍累加横排 fragment 坐标。修复应统一命中、搜索范围、标注范围、链接和图片的物理页面坐标，不能仅在 Lunar 把矩形机械旋转来绕过。

本报告不宣称已修复此内核缺陷，也不把书内规范错误当作根因：本对照书通过 EPUBCheck。
