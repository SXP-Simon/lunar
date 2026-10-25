# Cole 浮动图文重叠：设备指令与原生排版定位

关联 [Lunar #5](https://github.com/Umbrae-Labs/lunar/issues/5)。样书为 IDPF 的 `cole-voyage-of-life.epub`，授权、来源与 EPUBCheck 结果见 [原始报告](complex-layout-device-validation.md)。SHA-256 为 `e38ed606ff604e638f737efaf66e0fd0b2997c3eab7432bcba9a00a81a925cf3`。

## 模拟器再次复现

Android API 36 / emulator-5554，开发客户端 APK 身份与 [原书样式验证](publisher-style-validation.md) 相同；JavaScript 基于 Lunar main `4641589621f24d0df7d5a0811a3e26b1856c64cf`，只临时增加 [绘制入口日志补丁](../scripts/float-device-instrumentation.patch)，未改变分页输入或绘制行为。Rito RN 仍为 `0.3.0-lunar.1`，内核 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae`。采集后已移除日志补丁。

导入原版 Cole → 目录 Youth → 翻一页。在该开发客户端保存的阅读设置下是 13/29，区别于先前 nightly 的 11/26，因此通过正文内容定位，不以页码等同作为依据。截图见 [稳定画面](../device/float-probe-youth-overlap-settled.png)，UI 层次见 [XML](../device/float-probe-youth-overlap-settled.xml)。

捕获 [进入 Skia 前的完整指令](float-device-primitives.json)：逻辑页面 411×914，原生绘制比率 2.625，正文为 19px。图片的设备坐标除以原生比率后为 `(138, 331, 173, 130)`；正文 `To the youth, the` 的第一行从 `(100, 333.75)` 开始，直接穿过图片。图像和文字同处零平移状态。Lunar `toReaderDisplayList` 直接保留适配包的指令，Skia 并未另算浮动位置，因此重叠在实际绘制之前已经存在。

## 不经过 RN／Skia 的上游复现

使用 Rito 上游 dev `ed0284f3703244da28b3e6efd80cf29267cf6e65` 的真实 `chapter-fragment-probe`，二进制哈希记录在 [原始输出](float-upstream-native.json)。脚本为 [probe-float.py](../scripts/probe-float.py)，使用原版 EPUB 的 `s2a`（Youth），Tinos 字体，363px 内容约束，分别测试连续布局与 592px 分页。

两种模式均出现重叠：图片行 `(96, 404.09, 203, 152.25)`，后续正文首行 `(64, 400.91, 213.33, 18)`。这证明上游 block／inline 排版也能产生问题，无需 RN 解码或 Lunar 绘制参与；不把上游 dev 的具体坐标当作旧 APK 的输出。

## 根因与修复范围

`EPUB/css/cole.css` 中 `body.reflow` 两侧 margin 为 4em，`img.detail` 是 `float:right`，左 margin 为 2em。以 16px 字号、363px 约束为例，正文宽 `363−64×2=235px`，缩小后的图片宽 203px 加左 margin 32px，恰好占满整行。`FloatBands::band_at` 原先在左右占用合计大于等于内容宽时返回 None，把“没有剩余行宽”变成了“没有浮动避让”。正文于是以全宽排在图上。

独立修复分支 `SXP-Simon/Rito:fix/float-full-width-exclusion`，提交 `b88b6553c51b0228cb0caefb859df2190db5e9bf`，基于相同上游 dev。先找到段落自身内容区出现正剩余宽度的最早浮动边界，只移动文字行并把这段留白计入当前页；段落背景／边框保留原位置。有空间的部分浮动继续按已有逻辑环绕，不将所有浮动强制改为独占一行。

保留全宽浮动 band，使避让约束可以继续传入嵌套容器。

新增回归覆盖嵌套段落、左右占满／超宽、段落背景不移位、自动高度、分页后不重复留白，以及左右浮动的不同终点、窄段落和负边距。修复前两个集成回归确实失败：首行 y=0 而非 40，且本应两页的内容被叠在一页；嵌套段落也在补充修复前复现首行 y=0 而非 40，见 [嵌套失败日志](float-nested-before.log)。最终修复后 63 项 block 测试通过。

## 修复验证

- [完整工作区日志](float-linux-check.log)：Rust 1.95.0，格式检查、Clippy（全部 target，warnings 为错误）、工作区测试和探针构建全部成功；39 组结果共 1020 通过、8 忽略、0 失败，包含文档测试。未运行 Android 构建或 WASM 目标构建。
- [失败回归日志](float-regression-before.log) 与 [block 测试日志](float-block-tests.log)。两个失败回归使用合法的浮动 inline flow；早期测试夹具曾误用不能单独排版的 SizedLeaf，已修正后重新取得这里的失败证据，没有把夹具错误当作缺陷证明。
- [修复后原生输出](float-fixed-native.json) 与 [自动比较结果](float-native-comparison.json)：6 项断言全通过，基线和修复探针二进制哈希不同，输入样书 SHA 相同。

| 模式 | 基线重叠文本行 | 修复重叠文本行 | 修复后正文首行 |
| --- | --- | --- | --- |
| 连续布局 | 9 | 0 | y=570.73，位于图片及其底部 margin 之后 |
| 592px 分页 | 9 | 0 | 下一页 y=0，不重复上一页避让留白 |

图片位置和尺寸保持不变；两种模式下，按阅读顺序连接并规范空白后的全文与基线相同。这证明没有通过删字、隐藏图片或裁掉相交文字来消除重叠；不等价于所有 EPUB 的分页与文字完整性验收。设备指令还检出 19 个相交文字 run，与截图吻合，原生探针按整行统计，因此两个数量不能直接比较。

复现时分别导出基线和修复提交（Windows 导出使用 `git -c core.autocrlf=false archive <SHA>`）。若共享 Cargo target，切换导出前运行 `cargo +1.95.0 clean -p rito-block -p rito-core`，避免 Git 时间戳导致复用另一检出的产物；每份二进制独立保存。然后：

```sh
cargo +1.95.0 build --locked -p rito-core --example chapter-fragment-probe
python3 /path/to/evidence/scripts/probe-float.py \
  --probe /path/to/saved-probe --source /path/to/rito \
  --commit <完整提交> --label float-upstream-native
# 修复版使用 float-fixed-native 标签。两份输出齐全后：
python3 /path/to/evidence/scripts/compare-float.py
```

本修复未进入 Lunar 的已发布依赖或安装包；仍需要正常的 fork／rito-rn 发布、Lunar 升级和 Android 复验。不宣称完整解决所有 float、嵌套布局、Ruby 或固定版式问题。
