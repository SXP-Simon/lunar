# 搜索与竖排修复：构建隔离复核

本报告更正 PR #45、#46 的测试总数，并重新核对生产 ReaderSession 对照结果。没有修改两个 PR 的代码提交，没有把表格修复混入其中。

## 为什么重跑

此前不同 Git 导出目录共用 Cargo target，仅执行 `cargo clean -p rito-core`。Git archive 保留提交时间，同名 workspace 包的其他测试二进制可能被复用。检查发现 `rito-block` 的结果含有另一个浮动修复分支的4项测试。因此此前搜索报告的1028、竖排报告的1026不能作为这两个独立分支的完整测试计数。

历史原始记录仍在固定提交中：[搜索旧报告](https://github.com/SXP-Simon/lunar/blob/080a5d3f48b34fdc16608241cec2c8784f5c958c/reports/search-wrap-fix/README.md)、[竖排旧报告](https://github.com/SXP-Simon/lunar/blob/ffa7006ceca0416ddc50a44005c90f8098fdcf10/reports/vertical-interaction-fix/README.md)。它们的构建隔离说明与全量计数由本次复核取代。

## 本次隔离与结果

三个源码目录分别由 `git -c core.autocrlf=false archive COMMIT` 导出；逐一与 Git 中每个普通文件的原始字节比较。额外加入的两个 example 只是公开探针，未改生产代码。使用新的独立 target，每切换一个源码目录先 `cargo +1.95.0 clean --workspace`，依次完成 fmt、Clippy（所有 target、拒绝 warning）、workspace 测试以及探针编译。每个版本完成后保存不同的可执行文件。

| 构建 | 精确提交 | 通过 | 忽略 |
|---|---|---:|---:|
| 上游 dev 基线 | `ed0284f3703244da28b3e6efd80cf29267cf6e65` | 1016 | 8 |
| 搜索 PR #45 | `376e939fa70f03f218ae7d19cdd3490aacd170ca` | 1024 | 8 |
| 竖排 PR #46 | `5fa3f60e4b702eb7aa89c025ee890d0c4fb62053` | 1022 | 8 |

计数涵盖每个版本39组单元／集成／文档测试摘要。完整日志：[基线](baseline-checks.log)、[搜索](search-checks.log)、[竖排](vertical-checks.log)。[audit.json](audit.json) 记录源码校验摘要和保存的二进制 SHA-256。

用新保存的二进制再次运行同一批公开样书：

- 搜索：跨视觉换行的中英文整句均由0→1，同行短查询仍为1，硬换行与段落拼接负例仍为0；源范围和多行矩形完整。
- 竖排：标准和 EPUB 前缀模式均正确选中“く”和 Ruby 基字“山道”；从真实选区建立并序列化标注，18→20px后仍投影至对应绘制字形。
- 六个竖排／横排对照画面的绘制列表 SHA-256 与页文本前后一致；横排命中、选区和标注响应不变。

原生结果与比较断言位于[搜索报告](../search-wrap-fix/README.md)和[竖排报告](../vertical-interaction-fix/README.md)，已用本次结果更新。日志中的日语 ICU 分词模型提示仍存在；不能由本次坐标测试推导完整日语分词能力。

此外，将 PR #46 的3个测试文件临时放入基线，生产代码不变；清理整个 workspace 后运行6项新增回归，结果全部失败，再恢复原始测试文件。见[负向回归日志](vertical-baseline-regressions.log)与[测试文件身份](vertical-baseline-regressions.json)。

## 复现

依次使用 [revalidate-search-vertical.sh](../../scripts/revalidate-search-vertical.sh)、[verify-rito-audit.py](../../scripts/verify-rito-audit.py) 和 [revalidate-vertical-baseline.py](../../scripts/revalidate-vertical-baseline.py)。前者需要三个 Linux 精确导出路径及独立输出路径；后两个脚本的文件头给出参数。源码字节校验应在临时测试注入之前或恢复之后执行。

不要只清理 rito-core，也不要把 Windows 的 CRLF 工作区导出当成 Git 原始源码。脚本目录的 shell 文件固定为 LF。

环境为 Ubuntu 22.04 / WSL Linux x86_64、Rust 1.95.0。这里没有构建新版 Android APK，没有发布适配包、更新锁文件或合并 PR；产品接入后的设备验收仍待完成。
