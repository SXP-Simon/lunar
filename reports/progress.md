# 验证进度与未完成项

本文件区分已证实结果和后续工作，不能当成全部验收通过报告。

## 已完成：XML 解析

- [Issue #3](https://github.com/Umbrae-Labs/lunar/issues/3)
- [PR #4](https://github.com/Umbrae-Labs/lunar/pull/4)，代码分支 `fix/epub-xml-parser`，提交 `6592b871c2482ec8e76625b085f720dde7221202`。
- [上游 CI](https://github.com/Umbrae-Labs/lunar/actions/runs/40199008609/job/121185961476) 通过。
- 两个 EPUBCheck 合规变体在基线模拟器复现、修复模拟器通过；见 `xml-device-validation.md`。

## 已完成：固定版式识别与提示

代码分支 `feat/reader-fixed-layout-warning`，提交 `8101f4eed52b2773c9e120fb36b1cd3c080e73eb`。原创合规测试页实际复现右侧内容裁切；识别全局与逐 spine 覆盖，原生分页前提示并允许本次尝试阅读。纯固定、混合、普通流式对照及继续／返回／重开已验证，见 [验证报告](fixed-layout-validation.md)。本项未实现完整 FXL 渲染。

[PR #7](https://github.com/Umbrae-Labs/lunar/pull/7) 已创建，[CI check](https://github.com/Umbrae-Labs/lunar/actions/runs/40202533519/job/121196547057) 通过（1m53s），未合并。PR 中样书、截图和验证报告固定到 evidence 提交 `cc239128a39088fb4ca364662f1735c581445e25`。

以下保留早期测试环境记录，后续干净环境复测见本报告下方及复杂排版报告。

Haruko 源文件全局声明 `pre-paginated`，p01 视口 600×837，一张 JPG；about spine 项覆盖为流式。Lunar 基线实际可显示第一页完整漫画图（`device/fxl-baseline-haruko-page1-ready.png`）。不能声称所有 FXL 都无法显示；尚未验收缩放、左右页配对、RTL 翻页和最后的流式页。

《The Voyage of Life》默认流式，四个 painting spine 项分别覆盖为 `rendition:layout-pre-paginated`。第一幅画的视口 1024×697，CSS 为 1024px 宽、绝对定位图片。已导入基线；打开时测试环境失去响应，尚未取得可判读页面。

该次环境故障中，`/proc/meminfo` 显示 `MemAvailable=0`、`SwapFree=32 kB`；开发版和基线版同时驻留（各自 RSS/Swap 见 `fxl-proc-memory.txt`），截图超时，而 ADB shell 仍可响应。此证据不足以归因给特定 EPUB 或 Rito。已结束该测试模拟器，重启同一 AVD 的只读实例，使用 4096MiB 内存，后续只运行一个 APK。测试 APK、样书仍使用原先校验值，未更换引擎。

## 已完成：原书字体与行距模式

- [PR #6](https://github.com/Umbrae-Labs/lunar/pull/6)，代码分支 `feat/reader-publisher-style`，提交 `7f82e2907a35c68e7389bf91e73f50183a86dfa4`，基于 main 独立分出。
- 同一 APK 的开发客户端实测 OTF regular/bold 注册、Custom/Publisher 往返及重启恢复；87 文件／540 测试、类型检查通过。
- 见 [设备验证报告](publisher-style-validation.md)。此项恢复字体和行距覆盖策略，不代表完整出版版式还原。

## 新确认的问题

- [Lunar #5](https://github.com/Umbrae-Labs/lunar/issues/5)：Cole 流式 Youth 的右浮动图片与正文重叠；现已定位到 Rito 全宽浮动避让，修复与证据见下文。
- [Rito #40](https://github.com/Ringyuki/Rito/issues/40)：未激活的备用 stylesheet 使整章拒绝加载。Waste Land 控制变体已隔离该原因，草枕也首先被它阻断。

## 尚需完成的目标

4GB 单应用复测已推进：Cole 可打开，固定画页完整显示；Youth 流式页的浮动图文重叠。Waste Land 与草枕被 alternate stylesheet 选择校验阻断；仅移除 Waste Land 的备用引用后可打开，且变体通过 EPUBCheck。源码根因及截图见 [复杂排版设备验证](complex-layout-device-validation.md)。

备用 stylesheet 已在独立 Rito 分支 `fix/css-default-stylesheet-set` 修复（`61aeef9ca1ef3e41340eae0b1cf5cb27500bb160`）。Linux 原生探针完成同一上游 dev 基线前后对照，8 项断言全通过；完整 Rust 检查 1022 通过、8 忽略。见 [修复报告](alternate-stylesheet-fix.md)。Lunar 尚未升级内核，因此不代表当前安装包已修复，也不代表日文竖排或 Ruby 已验收。浮动重叠的后续修复见下文。

[Rito PR #41](https://github.com/Ringyuki/Rito/pull/41) 已创建，目标 `dev`，未合并。PR 证据固定到 `abb7ff92fad1ee42fe36a87dbbbff28a1332397b`。创建后 `statusCheckRollup` 为空；上游当前 CI 的 pull_request 触发分支仅为 master，不能把本地检查成功表述为远程 CI 已通过。

浮动重叠也已定位：Android 绘制前指令本身重叠，上游原生探针脱离 RN／Skia 同样复现。原因是浮动 margin box 占满行宽时被当成“没有避让”。独立修复 `fix/float-full-width-exclusion` / `b88b6553c51b0228cb0caefb859df2190db5e9bf` 已通过连续与分页原版 Cole 对照（9 行重叠→0，正文保留），完整 Rust 检查 1020 通过、8 忽略。详见 [定位与修复报告](float-overlap-investigation.md)。Lunar 当前 APK 尚未采用此内核修复，设备修复后验证仍未完成。

1. 固定版式／混合版式识别与提示已实现；固定视口缩放、配页及阅读方向仍未实现。
2. 出版方样式：基础模式已在 PR #6 实现；继续验证其他字体格式和复杂样式，不能将该 PR 当作全部样式保真通过。
3. 锁定 Rito 的真实能力：逐项验证表格、浮动、Ruby、竖排、定位；补充覆盖样本，不能拿上游 dev 文档代替设备证据。
4. 阅读交互：跨页文本完整性、搜索、选区／划线、改字号和重新打开定位；确认的问题分别开分支。
5. 导入／首次打开／跨章节／重排：采集有构建和设备身份的指标，分析内存及耗时；模拟器指标不得表述为真机性能或引擎横向排名。

验证 EPUB、源文件分析、截图、日志只放本 evidence 分支；每个修复 PR 链接固定提交，不携带这些文件。不因暂时缺少证据就把某项声明为已通过。

[Rito PR #42](https://github.com/Ringyuki/Rito/pull/42) 已创建，目标 `dev`，最终代码 `b88b6553c51b0228cb0caefb859df2190db5e9bf`，未合并。证据固定到 `748d27edb0c0e34e785c3932582e2011285d6a5c`。GitHub 确认 MERGEABLE，远程检查列表为空；本地 fmt、Clippy、1020 项测试及原版样书 6 项比较断言通过。Lunar #5 已补充定位与修复链接，保持打开等待版本接入和设备复验。

## 2026-10-26 新增设备验证

- [Lunar PR #8](https://github.com/Umbrae-Labs/lunar/pull/8)：保留 Rito 已知失效目录状态，失效行明确说明且不再可点，可用子章节保留。544 项测试、类型检查、lint、Android JS export、模拟器正反对照通过；远程 CI 通过。未合并，见 [目录报告](missing-toc-target-validation.md)。这处理 Lunar 的信息丢失，不自动修复 EPUB 源文件。
- [表格实测](table-device-validation.md)：普通三列表格及跨页续文可读；五列表头 rowspan 降级导致列含义错误，且窄屏宽表溢出。已登记 [Lunar #9](https://github.com/Umbrae-Labs/lunar/issues/9)，尚未修复。
- [Ruby 与竖排实测](ruby-vertical-validation.md)：简单横排 Ruby、标准及 EPUB 前缀竖排能显示；原生交互工件仍保留横排坐标，选字、标注及重排高亮错位。已提交 [Rito #43](https://github.com/Ringyuki/Rito/issues/43)，尚未修复。
- [《草枕》重排与重启](kusamakura-reflow-validation.md)：原始字体为14pt，改根字号没有真正改变文字；边距24→40使401页变439页，原段落保留，强制结束应用后源位置和页文本恢复一致。仅对移除备用样式引用的控制变体成立，不算原版通过。
- [同页搜索漏匹配](search-wrap-device-validation.md)：原创合规中英文连续句经过视觉折行后搜索0结果，同行短查询可找到；排除跨页和未加载。已提交 [Rito #44](https://github.com/Ringyuki/Rito/issues/44)，尚未修复。

上面的交互问题证明画面出现文字并不等于范围几何正确。新问题均附公开样本和原生数据，用户提供的 EPUB、截图和日志仅本地保留。性能、更多图片逐位置覆盖和内核新版接入复测仍在后续范围内。
