# 竖排绘制、图片尺寸与交互的组合验收

本次在临时 Linux 导出目录组合四项独立修复，没有合并代码分支、修改适配器或发布 npm 包：

| 范围 | 精确提交 |
|---|---|
| #46 竖排交互投影 | `5fa3f60e4b702eb7aa89c025ee890d0c4fb62053` |
| #51 内联块图文漏绘 | `dbef76cdf15dabd48bb83d03f3c2ddf82b263b9e` |
| #52 图片物理尺寸约束 | `123a1fbebb7ca00c34f1aded03a390eef0309527` |
| 独立的内联块文字地址修复 | `1b3031defde326d83e2c8e80269791e339f1fc19` |

基线均为 `dev@ed0284f3703244da28b3e6efd80cf29267cf6e65`。`export.json` 记录全部覆盖文件 SHA 与唯一冲突处理：合并并按字母序排列两条新增测试模块声明。生产文件通过三路合并组成，没有手写替代坐标或读取下游适配器生成产物。

## 先发现的新问题

仅组合前三项时，原创长正文书的横排“盒内文字”已经绘制、命中矩形也正确，但指针选区返回 `Unavailable(InvalidCaret)`。`interaction-failure.json` 是当时真实返回值，`export-before-address-fix.json` 与 `source-before-address-fix.json` 固定这三个提交的来源，1556 个文件逐字节相符；旧探针 SHA 见 `build.json`。

原因是宿主文字与盒内文字复用了相同地址，原始 dev 也复现，已在[独立地址修复报告](../inline-block-addresses/README.md)中记录当前 Lunar 安装包和负向回归。没有跳过横排条件来取得竖排通过结果。

## 四项组合后的结果

原创 CC0 [长正文控制书](../../samples/vertical-composition-probe.epub)，SHA-256 `2d90c4ea4fef02a0930aa16f1784928007d7c44fef0e67fe7a433459e809bebd`，3248 字节，EPUBCheck 5.4.0 为 0 错误、0 警告。三章分别为横排、标准竖排和 EPUB 前缀竖排。正文前有 270 字，用来确保 18→24px 时标注所在内容移出章节第一页，避免只验证同页字形变大。

每章从真实绘制命令产生指针坐标，选择“盒内文字”、三段多层嵌套文字和盒内 Ruby 基字“山道”，从真实选区创建并序列化标注：

- 共 15 个标注，源节点路径和 UTF-16 偏移逐项与源 XHTML 的实际文字节点核对。
- 18→24px 后，章节第一页不再包含“盒内文字”；按真实选区保存的源范围重新请求工件，再解析标注，15 次恢复全部对应原文。
- 关闭原生进程，以新 `ReaderSession` 只携带序列化标注和源范围重新打开，24px 下 15 次恢复通过。
- 再回到 18px，15 次恢复通过。两种竖排的范围矩形与对应实际绘制字形逐坐标相同，阈值 1e-6 CSS px；重新打开及恢复原字号的几何也相同。横排检查原文、源范围和恢复成功，不将字体框选择高度等同于文字绘制框。
- 原内联块图片控制书三章仍各绘制两张 48×32 图片，三章完整绘制列表 SHA 及页文本与仅组合 #51/#52 时相同。交互修复没有靠改变画面来匹配坐标。

原始结果见 `interaction.json`、`images/dev-fixed-native.json`，独立比较断言见 `scripts/analyze-vertical-composition.py`，汇总见 `summary.json`。

## 构建与验证范围

Ubuntu 22.04 / WSL、Linux x86_64、Rust 1.95.0、SourceHanSerifCN。采用同一上游 dev 的 primitive format 4 decoder；不能拿当前 Lunar 旧适配器的 format 2 decoder 解码这些帧。

1557 个最终源码文件与导出内容逐字节一致，见 `source-audit.json`。fmt、Clippy（workspace/all-targets，拒绝 warnings）及组合后的全量测试通过：1032 通过、8 忽略，日志为 `checks.log`。`targeted.log` 保存原各修复及新增地址修复的针对性检查。切换源码前清理完整 workspace，探针单独保存，具体身份见 `build.json`。

**修复后是生产 ReaderSession 的 Linux API 验收，不是新 Android APK 验收。** 新进程恢复证明原生序列化标注能继续定位，尚未证明 Lunar 的数据库、设置和应用重启链路已接入新内核。当前旧 APK 只用于[运行时错误复现](../inline-block-addresses/device.json)。没有合并 PR、更新锁文件、发布适配器或升级 Lunar 依赖，也未上传用户书籍。

## 复现

准备有上述四个精确提交的内核检出和单独证据检出。可从 `SXP-Simon/Rito` 获取四条修复分支以取得对象；导出脚本始终按上表 SHA 读取，不跟随移动分支。Linux 中执行：

```sh
python /evidence/scripts/export-vertical-composition.py /kernel /tmp/composition.tar
mkdir -p /tmp/composition
tar -xf /tmp/composition.tar -C /tmp/composition
python /evidence/scripts/audit-source-export.py /tmp/composition.tar /tmp/composition /evidence/reports/vertical-composition/source-audit.json
cp /evidence/scripts/vertical-composition-native.rs /tmp/composition/crates/rito-core/examples/vertical_interaction_native.rs
cd /tmp/composition
export CARGO_TARGET_DIR=/tmp/composition-target CARGO_BUILD_JOBS=2
cargo +1.95.0 clean --workspace
set -e
{
  cargo +1.95.0 fmt --all -- --check
  cargo +1.95.0 clippy --locked --workspace --all-targets -- -D warnings
  cargo +1.95.0 test --locked --workspace
} > /evidence/reports/vertical-composition/checks.log 2>&1
cargo +1.95.0 build --locked -p rito-core --example vertical_interaction_native
node /evidence/scripts/vertical-composition-audit.mjs /tmp/composition /tmp/composition-target/debug/examples/vertical_interaction_native /tmp/composition/apps/reader/src/assets/fonts/SourceHanSerifCN-Regular.otf
node /evidence/scripts/vertical-inline-block-native.mjs /tmp/composition fixed /tmp/composition-target/debug/examples/vertical_interaction_native /tmp/composition/apps/reader/src/assets/fonts/SourceHanSerifCN-Regular.otf --out=/evidence/reports/vertical-composition/images
python /evidence/scripts/analyze-vertical-composition.py
```

生成控制书用 `vertical-composition-probe.py`，它仅从已有 CC0 控制书派生长正文与 Ruby。要重放最初失败，向导出脚本添加 `--without-address-fix`，在另一临时目录构建；控制器用 `--out=/your/negative-output` 保留负向结果。预期首个横排选区检查失败为 `InvalidCaret`，不要覆盖最终正向报告。原始失败及源身份已固定在本目录，无须修改 EPUB 来复现。
