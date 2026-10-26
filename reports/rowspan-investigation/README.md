# Rito #47：跨行表格与独立分页续排

关联 [Rito #47](https://github.com/Ringyuki/Rito/issues/47)、[Lunar #9](https://github.com/Umbrae-Labs/lunar/issues/9)。独立分支 `feat/table-rowspan-grid`，基于上游 dev `ed0284f3703244da28b3e6efd80cf29267cf6e65`，代码提交 `f6c498a68e24d0fe0d9336c0e12a348ed75c33e5`。

本次是 Linux x86_64 / Ubuntu 22.04 WSL 的 Rust 原生章节排版与运行时 API 验证，Rust 1.95.0。Lunar 当前安装包的错误表头已有[源文件与模拟器对照](../table-device-validation.md)；这里没有把主机修复结果表述为新版 APK 验收。

## 源文件与结果

原版 IDPF `internallinks.epub` 未改动，SHA-256 `deaf03a1843f52cc5e4cedb226ca8659610efe1be5e810fccf615bcb549238aa`，来源和 CC BY-SA 3.0 许可见[总说明](../../README.md)。文件已有 EPUBCheck 0 错误、0 警告。[源码与安装包报告](../table-device-validation.md)确认：五列表头的第1、2、3、5列跨2行，第二行的“MS明朝”应在第4列 Readium 下方。

两本额外长表是原创 CC0 样书：[单词表头跨30行](../../samples/rowspan-pagination-probe.epub)、[跨行单元格内含30段正文，与另一列30行并排](../../samples/rowspan-parallel-probe.epub)。两本均经 EPUBCheck 5.4.0 验证为0错误、0警告；[SHA与校验结果](samples.json)、[生成器](../../scripts/rowspan-pagination-probe.py)。第二本在20px字号下两列的行位置不同，可检出只寻找共同分页点的不足。

| 检查 | 上游 dev 基线 | 修复 |
|---|---|---|
| 原版五列表头 | 第二行进入第1列，文字x=10.328125 | 进入第4列，文字x=240.78125；内联语义框测试确认列边界 |
| 原版章节 id0001，连续／592px分页 | 68条文字行 | 仍为68条，逐源节点排除视觉空白后正文一致，没有页外文字 |
| 原版普通表格章节 id0005，同上 | 99条文字行 | 行、文字、位置、页序与基线逐值一致 |
| 30行表头，50px页高 | 能分页，但跨行占位被丢弃 | 15页、31条文字行，行内容各一次、无页外文字 |
| 双列长正文，80px页高 | 60条文字中27条越出所属页 | 15页、60条文字，Row/Span 00–29各一次，越界0条 |

前后使用同一363px内容宽度、同一输入文件、Tinos及SourceHanSerifCN字体。字体不同于此前模拟器的WenKai，因此不直接比较两环境的像素坐标。[基线原始结果](baseline-final.json)、[修复原始结果](fixed-final.json)、[比较断言](comparison.json)与[断言脚本](../../scripts/compare-rowspan.py)。文本完整性按源节点分别比较（排除视觉空白），不能靠全书字数相等替代。

## 交互、图片和续页状态

内核回归覆盖跨行／跨列组合、rowspan=0行组边界、短表头整体换页、超长组、与普通单元格的分页共存，以及格式树指纹。规范依据为 [HTML 表格模型](https://html.spec.whatwg.org/multipage/tables.html#processing-model-1)；不声称实现完整浏览器表格模型。

- 真实指针在续页选择“Row 23”，生成源标注并做JSON往返；重新打开书籍后以20px重新分页（原16px），源标注仍定位到同一原文和新页。高亮与绘制的相对位置对照相同字号的普通段落，区分字体高亮框与PaintText行框。
- 跨行表格放入普通单单元格外层表格，再经过容器嵌套；内联图片实际续排到下一页，仅绘制一次，保留2:3比例，页底无裁切，前后文字与外层尾文保留。此项使用现有2×3 PNG头夹具验证原生PaintImage工件；不证明完整PNG解码或Skia像素显示通过。
- 将续页结果序列化并在全新排版上下文恢复，结果与复用上下文逐值相同；两列各30行均完整，分页间隙被原有空白吸收时没有额外空白尾页。
- 续页数据参与缓存身份和预算；缓存命中时复用同一份状态向量，最后一页即使没有输出续页令牌，输入状态仍被计费。

同一组运行时回归注入基线、生产代码不变，6项运行时测试在基线为4失败、2通过，修复后6项全部通过；结果见[基线回归](baseline-runtime-tests.json)和[日志](baseline-runtime-tests.log)。修复版17项新增回归及全量1033通过／8忽略，fmt与Clippy通过；完整检查见 [workspace测试](workspace-tests.log)、[Clippy](clippy.log)和[构建身份](build.json)。源码字节与Git提交逐文件核对，见[source-export.json](source-export.json)。

## 实现与边界

桥接层保留rowspan及行组边界；网格跳过此前跨行单元格覆盖的列，高度跨覆盖行分配。长组的每列独立将跨页整行推到下一页，纯值续页状态记录间隙和必要的行增长，不依赖旧会话的内存对象。

Rust `FormattingNodeContent::TableCell`增加row_span，`BreakToken`增加可选的跨行表格状态。fragment continuation编码仅在含该状态时使用新stage tag=2，普通令牌字节保持原样；旧decoder会拒绝新tag。ReaderSession协议和primitive绘制格式没有变更，后续接入仍应使用同一引擎版本的完整产物。

窄屏宽表的横向阅读操作仍需Lunar应用策略；本项不改变其最小宽度算法。尚有限制：超长正数span只到行组最后显式行，不生成隐式行；不重复表头／表尾，不完整执行段落widows/orphans；高于整页的不可拆分图片／文字行会明确失败；无rowspan的超高多单元格行仍走原有处理。见内核limitations文档。

没有发布适配器、修改锁文件或合并PR。当前APK未接入此修复，设备回归仍待版本接入。

## 复现

在Linux将基线和代码提交分别按 `git -c core.autocrlf=false archive COMMIT` 导出。每切换源码前执行 `cargo +1.95.0 clean --workspace`，再运行 `cargo fmt --all -- --check`、`cargo clippy --locked --workspace --all-targets -- -D warnings`、`cargo test --locked --workspace` 和 `cargo build --locked -p rito-core --example chapter-fragment-probe`；保存两个不同的可执行文件。

运行 [probe-rowspan.py](../../scripts/probe-rowspan.py)，分别提供 `--probe`、`--source`、`--label baseline-final|fixed-final` 和 `--commit`，再运行 `python scripts/compare-rowspan.py`。源码字节核对使用 [verify-rito-export.py](../../scripts/verify-rito-export.py)；基线测试注入及恢复使用 [revalidate-rowspan-baseline.py](../../scripts/revalidate-rowspan-baseline.py)。源书、探针及日志只存证据分支，内核PR只包含实现与内联回归。
