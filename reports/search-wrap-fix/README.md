# 软换行搜索修复：主机原生对照

关联 [Rito #44](https://github.com/Ringyuki/Rito/issues/44)。这修复阅读器搜索索引的问题，不修改书籍，也不重建失效目录锚点。

## 构建与范围

- 上游 `dev` 基线：`ed0284f3703244da28b3e6efd80cf29267cf6e65`。
- 独立分支：`fix/search-soft-line-wraps`，代码提交 `376e939fa70f03f218ae7d19cdd3490aacd170ca`。
- Ubuntu 22.04 / WSL，Rust 1.95.0，Linux x86_64 主机程序；不是 Android 原生编译或新版 APK 验收。
- 原创 CC0 的 [search-wrap-probe.epub](../../samples/search-wrap-probe.epub)，SHA-256 `3217b1cb335c9b10d84e7816b88d70a05ab767b28411f287b9fbca78884faabb`，已有 EPUBCheck 0 错误、0 警告。
- 两版本使用相同 411×914、22px 字号、左右40px边距，Tinos 与 SourceHanSerifCN 固定字体输入；字体不等于此前模拟器的 WenKai。前后对照输入相同，全部内容在一页。

基线与修复源码分别放在独立目录；共用依赖构建缓存，但每次切换源码前执行 `cargo clean -p rito-core`，强制重建核心与探针，避免同名包复用错误产物。未经该清理的中间运行已丢弃，不作为结果。JSON 的运行时调用均为公开 `ReaderSession` API。

## 结果

| 查询 | 基线 | 修复 |
|---|---:|---:|
| 跨软换行的完整中文句 | 0 | 1 |
| 跨软换行的完整英文句 | 0 | 1 |
| 同行短中文 | 1 | 1 |
| 同行短英文 | 1 | 1 |
| `<br>` 两侧无分隔拼接 | 0 | 0 |
| 两个段落无分隔拼接 | 0 | 0 |

完整中文与英文命中都具有覆盖整句的源节点范围，重新投影得到完整原句，并有多行高亮几何；没有退回仅定位最长一行。页面文字、UTF-16 长度、绘制列表 SHA-256 前后完全一致。见 [基线](base.json)、[修复](fixed.json)及 [比较断言](comparison.json)。这不等同于所有 EPUB 的视觉或分页均已验收。

## 实现边界

页面索引记录相邻文本行是否来自同一个 flow，并保留换行处被裁掉的空格或制表符。搜索时还原这些有来源依据的视觉换行，结果继续映射到原页 UTF-16 坐标；源范围验证也使用还原后的文本。不同 flow、真实硬换行和段落边界保留。带显式换行的旧查询仍走原始页面文本，避免破坏使用页面文本的调用方。

新增4项索引测试与4项运行时集成测试，覆盖 CJK、英文空格、内联元素、真实结构边界、非 BMP 字符、大小写展开、完整源范围和高亮投影。相同4项集成测试在基线为3失败、1通过，修复版全部通过。原始记录：[基线回归](base-tests.log)、[最终全量检查](checks.log)。

最终检查：`cargo fmt --all -- --check`、`cargo clippy --locked --workspace --all-targets -- -D warnings`、`cargo test --locked --workspace`；1028项通过、8项忽略。未修改 wire 协议、适配器锁文件、预编译库或 Lunar 依赖。不同页面间的拼接搜索、竖排交互坐标和复杂表格均不在此修复范围。

## 复现

将 [探针](../../scripts/search-wrap-native.rs) 临时放入各 Linux 检出目录的 `crates/rito-core/examples/search_wrap_native.rs`。每个版本顺序执行：

```sh
export CARGO_TARGET_DIR=/your/shared-target CARGO_BUILD_JOBS=2
cargo clean -p rito-core
cargo run --locked -p rito-core --example search_wrap_native -- \
  /evidence/samples/search-wrap-probe.epub \
  apps/reader/src/assets/fonts/Tinos-Regular.ttf \
  apps/reader/src/assets/fonts/SourceHanSerifCN-Regular.otf > result.json
```

分别保存为本目录 `base.json`、`fixed.json`，运行 `python scripts/compare-search-wrap.py`。探针与结果仅放 evidence 分支，不进入内核修复 PR。用户提供的 EPUB 及其内容未包含在此证据中。

当前安装包仍使用原锁定内核，故模拟器上的漏匹配现状尚未消失。需要以后通过适配器发布与 Lunar 版本升级接入，再做设备复验。
