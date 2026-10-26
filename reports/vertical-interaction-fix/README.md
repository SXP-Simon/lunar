# Rito #43：竖排选区与重排后标注的修复验证

问题跟踪：[Rito #43](https://github.com/Ringyuki/Rito/issues/43)。内核独立分支 `fix/vertical-interaction-geometry`，基于上游 `dev` 的 `ed0284f3703244da28b3e6efd80cf29267cf6e65`；修复提交 `5fa3f60e4b702eb7aa89c025ee890d0c4fb62053`。此分支没有包含搜索或浮动修复。

## 结果与环境

使用此前模拟器复现的同一本原创 CC0 [Ruby／writing-mode 对照 EPUB](../../samples/ruby-writing-mode-probe.epub)，文件未改，SHA-256 `3504352a4242bec633742ae496411394ab54ffdfe0df830efb22121f8d3aa3e8`，已有 EPUBCheck 0 错误、0 警告。

本次是 Ubuntu 22.04 / WSL、Rust 1.95.0、Linux x86_64 的生产 `ReaderSession` API 验证，不是新版 Android 安装包或真机验收。三章分别为横排、标准 `writing-mode:vertical-rl`、`-epub-writing-mode:vertical-rl`。视口411×914，左右40px，顶部88.76190567016602px，底部64px；字号18→20、renderRatio=1。字体固定为 SourceHanSerifCN，和旧模拟器的 WenKai 不同；基线与修复输入完全相同。

| 检查 | 基线 | 修复 |
|---|---|---|
| 标准竖排，在绘制的“く”处选择 | 错选第二段“一列目の終わり。二列目の始まり。” | 正确选择“く” |
| 前缀竖排，同上 | 同样错选 | 正确选择“く” |
| 两种竖排，在绘制的 Ruby 基字处选择 | 选到整段“山道を歩く。漢字を読む。” | 正确选择“山道” |
| 从上述选区创建标注，再18→20px投影 | 保留了错选的内容和错误画面位置 | 两种竖排的两个标注均保持原文，矩形覆盖目标字形 |
| 横排对照 | 正常 | 命中、选区和标注响应均与基线一致 |

六个章节／字号组合的页面文本与绘制列表 SHA-256 前后完全一致。竖排命中矩形覆盖实际绘制字形；“く”和“山道”的选区、重排后标注矩形与对应绘制字形区域逐坐标相等（误差阈值1e-6 CSS px）。字号变化确实改变了字形位置／大小。原始记录：[基线](base.json)、[修复](fixed.json)、[比较断言](comparison.json)。

## 修复边界

- 绘制与交互共享列位置、Ruby 留白、字体大小、字距与字形步长计算。行的物理内联轴在竖排时为y，块推进方向为从右向左。
- 文字命中、指针范围、源范围投影、标注矩形，以及图片／链接和语义框应用竖排映射；源节点路径、UTF-16 偏移、页文本与阅读顺序保持原语义。
- 竖排字符边界跟随绘制的码点步长，非 BMP 字符不会产生代理项中间的指针停靠点；按列移动保留内联位置。
- Rust `TextCaretGeometry` 增加宽度以表达横向插入符。横排的零宽度不写入 JSON，反序列化默认0。现有 ReaderSession 协议7只有x/y/height，不能表达横向插入符条，因此返回其源位置与地址并省略 `ReaderCaret.geometry`，不输出错误方向的光标条。选区和标注矩形正常完整返回；本项不扩展 wire 协议。

本次没有实现新的竖排排版算法、纵中横或标点字形设计，也未修复此前可见的拉丁标题排版重叠。它让交互几何与当前实际绘制保持一致，不能据此宣称全部竖排 EPUB 排版合规。

## 回归与构建身份

6项新增回归覆盖标准／前缀模式、指针选字与范围、从真实选区生成 Ruby 标注后重排、拉丁与非BMP字符、图片及链接命中、按列移动，以及现有协议的响应往返。完全相同的6项测试在基线全部失败，修复版全部通过。

- `cargo fmt --all -- --check`
- `cargo clippy --locked --workspace --all-targets -- -D warnings`
- `cargo test --locked --workspace`：1026通过、8忽略。

原始记录：[基线失败](base-tests.log)、[最终检查](checks.log)、[构建身份](build.json)。两个源码目录顺序构建；切换版本前 `cargo clean -p rito-core`，强制重新编译核心，两个探针另存为不同可执行文件。使用上游同一提交自带的 primitive decoder 读取格式4，而非当前 Lunar 适配器的旧格式2 decoder。整个修复没有修改协议版本、适配器、锁文件或预编译库。

## 复现

将 [Rust 探针](../../scripts/vertical-interaction-native.rs) 临时复制到各 Linux 检出的 `crates/rito-core/examples/vertical_interaction_native.rs`，分别构建并保存独立可执行文件：

```sh
export CARGO_TARGET_DIR=/your/shared-target CARGO_BUILD_JOBS=2
cargo clean -p rito-core
cargo build --locked -p rito-core --example vertical_interaction_native
cp /your/shared-target/debug/examples/vertical_interaction_native /your/label-probe
```

在 Windows Lunar 工作目录运行控制器（使用 WSL 的二进制）：

```sh
node /evidence/scripts/vertical-interaction-audit.mjs . base /your/base-probe
node /evidence/scripts/vertical-interaction-audit.mjs . fixed /your/fixed-probe
python /evidence/scripts/compare-vertical-interaction.py
```

控制器由真实绘制命令确定指针点，再调用原生选区 API，从其源范围创建和序列化标注，改字号后重新解析及投影。没有由命中矩形反推“正确”指针点，也没有替换或模拟引擎几何。仓库路径、字体与WSL名称可在脚本中按本地环境调整。

当前 Android 安装包没有采用此修复。后续仍需通过适配包发布、Lunar升级和设备复验完成产品接入；此报告不代表这些步骤已完成。用户提供的 EPUB、截图或正文未包含在公开证据中。
