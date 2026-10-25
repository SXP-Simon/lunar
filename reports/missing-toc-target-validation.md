# 失效目录目标：书内错误与 Lunar 状态丢失

代码分支：`fix/reader-missing-toc-targets`，提交 `85a007495bfc10a90dea72b3da44722279bc190f`，基于 Lunar `4641589621f24d0df7d5a0811a3e26b1856c64cf`。

## 可复现样本

`samples/broken-cover-navigation.epub` 和 `samples/valid-cover-navigation.epub` 是原创 CC0 对照书，由 `scripts/cover-navigation-probe.py` 生成。前者故意保留过期封面资源及指向非 spine 封面的目录；真实封面和普通章节都在有效 spine 中。EPUBCheck 前者 5 个错误，后者 0 个错误、0 个警告，完整日志随本报告保存。

用户书籍仅用于本地分析，没有上传其内容、截图或日志。

## 归因

书内无效 href 需要由出版方修正。但 `reports/cover-navigation-runtime.json` 证明，安装包使用的 Rito 已把 Cover 标为 `target.kind = missing`；Lunar 的目录转换却丢弃了状态，只留下 label/href。基线设备点击后才显示无法跳转。因此状态丢失与错误的交互承诺属于 Lunar。

基线截图：`device/cover-navigation-broken-click.png`。基线有效封面和正文：`device/cover-navigation-broken-ready.png`、`device/cover-navigation-chapter-ready.png`。

## 修复与验证

Lunar 保留已知失效状态，目录将该项展示为非交互文本并说明“链接失效 / Link unavailable”。有链接的可用子章节仍可导航；空 href 的分组标题不会被说成坏链接。未改变 EPUB 字节或引擎版本。

设备：API 36 `handwrite-api36`，1080×2400、420 dpi、4 GB，x86_64 系统通过 ARM64 兼容层运行开发 APK；APK SHA-256 `3fff66355689b9dd4d753bbee78452d89d2ea2ac6e19d4bcd3d569001600be2c`。原生依赖 `@umbrae-labs/rito-rn@0.3.0-lunar.1`，内核 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae`；Metro 加载本修复的 JS。重新安装后冷启动，未注入运行时诊断句柄。

- `device/cover-navigation-fixed-toc.png/.xml`：Cover 显示 Link unavailable，无障碍名称为 Cover, link unavailable，`clickable=false`。
- 点击该提示行后目录仍打开、页数仍为 1 / 2，没有跳转失败 Toast；再点击 Chapter One，实际到达第 2 页。见 `device/cover-navigation-fixed-chapter.png/.xml`。
- 正常对照书从目录 Chapter One 到第 2 页，再从目录 Cover 返回第 1 页，见 `device/cover-navigation-valid-cover.png/.xml`。
- 单元测试验证失效父项的可用子项仍可导航，以及普通分组不会误报。
- 类型检查、lint、Android JS export 通过；88 文件、544 项测试通过（`--maxWorkers=2`）。首次默认并发与模拟器冷启动重叠，3 项 worklet 测试触发原有 5 秒超时；没有改变测试超时，降低并发后全量通过。对应日志一并保存。

## 边界

本修复不重建书中不存在的锚点，不修复 page-list，不自动重定向封面，也不声称修复排版。可靠的封面恢复应另行验证有效的显式封面声明；不能仅依据文件名或“封面”标题猜测目标。
