# 备用样式表导致整章加载失败：Rito 修复证据

关联 [Rito #40](https://github.com/Ringyuki/Rito/issues/40)。修复分支 `SXP-Simon/Rito:fix/css-default-stylesheet-set`，提交 `61aeef9ca1ef3e41340eae0b1cf5cb27500bb160`，基于上游 dev `ed0284f3703244da28b3e6efd80cf29267cf6e65`，未合并。

## 已在 Lunar 复现的原始问题

Lunar nightly、Rito RN 0.3.0-lunar.1、内核 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae`，在 Android API 36 模拟器打开原版《荒原》和《草枕》时，报 `stylesheet source selection rejected: SelectionIssue`。设备、APK SHA、截图、原书授权及对照书生成过程见 [先前设备报告](complex-layout-device-validation.md)。

`parser.rs` 把任意 alternate link 记为未实现选择状态，`stylo_sources.rs` 随后拒绝整章。上述两个文件在 Lunar 锁定版本与本次上游 dev 基线之间没有差异；其他引擎文件已有差异，所以本报告不会把上游开发分支能力当作当前 Lunar 安装包能力。

《荒原》正文声明首选 `day` 与备用 `night`；《草枕》声明备用横排与首选竖排。只移除《荒原》的备用 link，保留正文、字体和所有 CSS 后，同一旧 APK 可打开，已经隔离出选择状态是阻断原因。

## 修复行为与边界

按静态 XHTML 选择默认样式集：无标题的常驻样式保留；首个非备用、未禁用的命名样式确定首选集合；`meta http-equiv="default-style"` 可指定默认集合；标题以大小写敏感方式匹配。匹配集合中的 link/style 按原文档顺序参与层叠，包括同名 alternate；禁用的 link 不参与。

未选中的来源仍保留在内部来源记录中，但在资源查找、media 校验和 CSS 检查之前跳过。不能简单删去所有 alternate：原先“没有 external source 则使用所有出版 CSS”的兼容回退，会把本应未启用的 CSS 重新加入。新增回归专门覆盖此情况。

启用来源的缺失文件等错误仍按原规则报告。此 PR 不提供动态切换样式集、脚本 CSSOM 或阅读器主题自动选择夜间样式；不是删除合法 EPUB 内容，也不把无条件吞掉解析错误当成兼容策略。公开 wire 协议与 RN 绑定未改变。

参考 [CSSOM 样式集规则](https://drafts.csswg.org/cssom/#css-style-sheet-collections)、[HTML stylesheet link](https://html.spec.whatwg.org/multipage/links.html#link-type-stylesheet) 和 [default-style pragma](https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-http-equiv-default-style)。本实现仅处理静态载入后的集合选择。

## 原生探针

使用仓库已有 `crates/rito-core/examples/chapter_fragment_probe.rs`。它实际执行 RuntimeDocument、Stylo 投影、fragment tree、Parley 排版和分页，输出文本及坐标，没有 mock 解析或排版函数。运行环境为 WSL Ubuntu 22.04、Rust 1.95.0、Linux x86_64；不是 Android APK 测试，也不是性能基准。

输入为本证据分支的原版 `wasteland-otf.epub`、控制变体 `wasteland-otf-day-only.epub` 和原版 `kusamakura-japanese-vertical-writing.epub`。后者选择正文“一”，不是封面。脚本从 OPF 解析 idref 与 XHTML 链接，记录书籍 SHA、源码提交、probe 二进制 SHA、标准输出和错误。字体固定使用对应检出的 Tinos-Regular 与 SourceHanSerifCN-Regular；没有把这次探针当作书内字体保真测试。

复现步骤：

```sh
# 分别在基线和修复检出中执行，保留各自产物，避免后一次覆盖前一次。
cargo +1.95.0 build --locked -p rito-core --example chapter-fragment-probe
python3 /path/to/evidence/scripts/probe-alternate.py \
  --probe /path/to/chapter-fragment-probe --source /path/to/rito \
  --label alternate-fixed-native --commit 61aeef9ca1ef3e41340eae0b1cf5cb27500bb160
# 基线使用 alternate-baseline-native 标签及 ed0284f... 完整 SHA。
python3 /path/to/evidence/scripts/compare-alternate.py
```

原始输出为 `alternate-fixed-native.json`；《荒原》原版与变体均排出 741 条文本行、35 个探针页，两者输出逐项完全相同，包括坐标。《草枕》正文“一”输出 1016 个文本记录、61 个探针页，无章节错误。这些页数属于上述探针配置，与 Lunar 实际页数不可直接比较。

最终 [前后比较](alternate-native-comparison.json) 的 8 项断言全部通过，构建与执行记录见 [日志](rito-native-comparison.log)。两份探针二进制 SHA 不同，样书 SHA 一致。

| 输入 | 基线 ed0284f | 修复 61aeef9 |
| --- | --- | --- |
| 原版《荒原》正文 t1 | SelectionIssue，探针退出 101 | 741 文本行，35 页 |
| 仅移除备用 link 的《荒原》t1 | 741 文本行，35 页 | 输出含坐标与基线逐项相同 |
| 原版《草枕》正文“一” | SelectionIssue，探针退出 101 | 1016 文本记录，61 页 |

基线原始失败与对照输出见 [alternate-baseline-native.json](alternate-baseline-native.json)，修复原始输出见 [alternate-fixed-native.json](alternate-fixed-native.json)。退出 101 来自该示例探针对错误使用 `expect`，不能当作 Lunar 应用崩溃的证据；Lunar 原始行为见先前设备报告。

《草枕》的标准错误输出包含 `ICU4X data error: No segmentation model for language: ja`。本次只证明样式选择不再阻断排版，不据此认可日文分词、断行、竖排或 Ruby 的正确性；警告原样保留在 JSON 中。

## 测试与集成状态

新增 6 项回归覆盖默认集合、同名 alternate 与顺序、default-style、disabled link、不触发隐式全 CSS 回退，以及启用资源缺失仍报错。最终在提交的 LF 导出源码上执行 [验证脚本](../scripts/validate-rito.sh)：`cargo fmt --all -- --check`、`cargo clippy --locked --workspace --all-targets -- -D warnings`、`cargo test --locked --workspace` 全部成功。39 组测试结果共 1022 通过、8 忽略、0 失败，含文档测试；见 [完整日志](rito-linux-check.log)。这不包含 Android 构建或 WASM 目标构建。

环境复现有两处需要注意：

- Windows 的 `core.autocrlf=true` 也作用于 `git archive` 导出，FFI 架构测试用 LF 字符串匹配头文件注释时失败，见 [失败日志](rito-crlf-check.log)。用 `git -c core.autocrlf=false archive <commit>` 重新导出即可通过，不需要修改头文件或断言。基线与修复提交的头文件字节完全相同。
- 两个 Git 导出保留提交时间，共用 Cargo target 曾复用同一个探针二进制，初次对照因此无效。[对照构建脚本](../scripts/compare-rito-builds.sh) 在每次构建前清理 `rito-core` 包产物，且比较脚本强制检查两份二进制哈希不同。不能只写源码提交就假定执行的是对应二进制。

Lunar 当前安装包和依赖版本尚未升级。需由 Rito fork / rito-rn 的正常版本流程发布并被 Lunar 采用后，再做 Android 复验；本次没有修改 node_modules、生成的 native/rito 或预编译库，没有在 Windows 编译 Android 原生代码。《草枕》能排出数据不代表竖排标点、Ruby、页面方向和选区已通过视觉验收。
