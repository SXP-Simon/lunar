# 竖排图片使用了错误的物理宽高约束

对应 [Rito #50](https://github.com/Ringyuki/Rito/issues/50)。与 [PR #51](https://github.com/Ringyuki/Rito/pull/51) 的漏绘修复分开：本修复改变图片尺寸计算，不改变绘制遍历、导入、解码、选区或协议。

## 复现与用户影响

原创 CC0 对照书 [vertical-inline-block-probe.epub](../../samples/vertical-inline-block-probe.epub)，SHA-256 `433bd7f6670e435dd4aa5dbda142391a8e44290df9c88f721df94222dfce57bf`，EPUBCheck 0 错误/0 警告，校验和当前 APK 复现沿用[前一报告](../kusamakura-image-pagination/README.md)。用户书籍没有上传。

原 dev 不绘制竖排盒内图，故在生产 ReaderSession API 中以“仅应用 PR #51”作为尺寸基线。声明 48×32 的盒内图片实际为 32×21.328125，直接图片仍为 48×32。尺寸修复后两者都是 48×32，标准及 EPUB 前缀竖排均覆盖；横排绘制列表 SHA、三章页文本和文字绘制内容不变。原始帧见 `paint-only-native.json`、`dev-fixed-native.json`。

Chrome 155 的独立控制页同时核对盒内/直接图片 30×20，以及竖排容器物理宽度 100、80 时 `width:50%` 得到 50、40。见 `browser-control.html`、`browser-dom.html`、`browser-control.json`。控制图为原 CC0 图，48×32，所以百分比宽度对应高度为 33.328125、26.65625；单元测试的尺寸输入是 48×24，不能混淆两种图的宽高比。

这些结果证明原生尺寸缺陷，并不证明所有竖排 CSS 或图片容器都已保真。公开《草枕》的固定容器及百分比高度仍需要独立核对，未在本修复中承诺解决。

## 修复职责

`ConstraintSpace` 和 `BuildSpace` 描述逻辑轴。竖排 inline-size 是物理高度，fragmentainer block-size 是物理宽度。`image_display_size` 则使用物理 CSS 宽高；原实现先按错误的宽度上限缩小图片，再交换结果宽高，交换得太晚。

修复在图片尺寸计算前转换约束，计算后再转换回逻辑片段。同时检查内联块中的页面尺寸上限传递，避免大图绕过约束。百分比高度、内联块自身固定尺寸、装饰及混合书写模式不在本修复的完整支持声明内。

## 版本与检查

基线 `ed0284f3703244da28b3e6efd80cf29267cf6e65`，尺寸修复 `123a1fbebb7ca00c34f1aded03a390eef0309527`。组合的绘制文件、探针 SHA 和逐文件源码核对见 `build.json`。

独立尺寸分支的新增回归直接检查排版片段，不依赖 PR #51 的画面；生产 ReaderSession 画面对照在一次性导出目录加上该 PR 的绘制文件，两者验证范围分开记录。Linux/WSL，Rust 1.95.0，同一 SourceHanSerifCN 字体及匹配 dev primitive decoder。

精确 Git 导出的 1553 个文件逐字节相符；fmt、Clippy（workspace/all-targets，拒绝 warnings）及全量测试通过，1019 通过、8 忽略。最终源码没有根据旧 APK 或别的分支测试结果推断通过。

最终同一份测试在原始 dev 生产代码上 0 通过、3 失败。再次核对基线的 1553 个文件，生产代码保持 dev 原样，两份测试文件与修复提交逐字节相同，见 `baseline-source-audit.json`。

最终负向回归见 `baseline-regressions.log`，全量 fmt/Clippy/测试见 `checks.log`，汇总见 `summary.json`。`nested-gate.log` 保留了仅转换轴、尚未传递外层页面约束时大图仍溢出的真实失败；最终测试同时覆盖横排与竖排、盒内与直接图、横图与纵图、不同页面及缓存重排。Git 导出显式使用 `-c core.autocrlf=false` 保留 LF，否则头文件注释的架构测试会因 CRLF 误报；切换来源前清理 workspace，防止共用 Cargo target 混用产物。

当前 Android APK 仍为旧内核，只用于前一报告的缺陷复现；本报告修复后结果是 Linux 原生 API，不是 Android 更新版验收。没有合并任何 PR、发布适配包或更新 Lunar 依赖与锁文件。

## 复现

在 Linux 为上述基线、尺寸修复提交和 PR #51 提交 `dbef76cdf15dabd48bb83d03f3c2ddf82b263b9e` 分别创建 LF Git 导出目录，然后：

```sh
bash /evidence/scripts/check-vertical-image-constraints.sh /base /fixed /paint /output
node /evidence/scripts/vertical-inline-block-native.mjs /fixed fixed /output/fixed-probe /linux/SourceHanSerifCN-Regular.otf --out=/evidence/reports/vertical-image-constraints
python /evidence/scripts/analyze-vertical-image-constraints.py
```

检查脚本按本次执行过的独立命令整理，只对一次性导出目录写入测试/探针覆盖；不把组合后的绘制文件或探针提交进尺寸 PR。浏览器控制页可通过 `scripts/vertical-image-browser.py` 重新生成，用 Chrome headless `--dump-dom` 导出测量结果。复现实测值应同时核对输入图、字体、内核及解码器身份。
