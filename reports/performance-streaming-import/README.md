# EPUB 导入：减少同步阻塞与常规重打包

对应 [Lunar #10](https://github.com/Umbrae-Labs/lunar/issues/10)。修复分支 `perf/library-streaming-epub`，基于 `main@4641589621f24d0df7d5a0811a3e26b1856c64cf`，最终代码 `620a00fa531688fdc7277eef6a7afe3f475349b0`。没有混入 XML、出版方样式、FXL 或 Rito 内核修复。

**确认的收益是减少长时间阻塞和常规重打包，不是导入总耗时全面下降。** 同条件下，《草枕》的总耗时中位数反而增加约10%；这是一项需要评审的响应性取舍。

## 实现与契约

- 先通过中央目录检查原有的100 MiB压缩包、250 MiB总展开量、64 MiB单条目及5000记录限制，不为预检解压正文、字体和图片。
- 使用 fflate 的同步流按64 KiB输入解压，在输入/解压CPU预算到达后让出事件循环。等待原生资产写入与哈希的时间不计为解压CPU。预算只在输入块之间检查，**不是16 ms的阻塞上限**。
- 仍写出所有资源文件，并保存原有URI、长度和SHA-256索引，供插件等现有契约使用。完成回调按路径更新；中央目录兼容重试可以重复发出同一路径。
- 常规压缩包保存已哈希、已提取的原始字节快照，避免外部文件在异步处理期间改变导致身份与内容不一致。元数据/封面只读取所需条目，小条目直接索引读取，较大的条目使用流。
- 非规范路径、重复/过期本地记录、流式数据描述符歧义等走中央目录兼容路径；该路径仍可能同步全包解压、规范化并重打包STORE，不能将常规路径的性能结论推广至这些文件。
- 待保存文件使用独立临时文件，出错清理。没有修改数据库结构、书籍ID、源范围语义、Rito包、锁文件或预编译产物。Expo SDK57的覆盖移动会先处理已存在目标，不宣称这个API具有跨崩溃事务保证。

## 版本、输入与测量

- 同一公开[开发APK](https://github.com/Umbrae-Labs/lunar/releases/download/nightly-20261024-40115172807/lunar-develop.apk)，原生源码 `8ecf3336ad73b4b73d93d1ade2d3b3847c5e9170`，安装后设备文件SHA-256再次确认为 `3fff66355689b9dd4d753bbee78452d89d2ea2ac6e19d4bcd3d569001600be2c`。只切换Metro的JS来源。
- `@umbrae-labs/rito-rn@0.3.0-lunar.1`，内核 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae`；Expo SDK57、RN0.86.3、fflate0.8.3。Windows、Node26.7.0；Android API36，1080×2400、420dpi、4GiB，x86_64通过ARM64兼容层运行。不是正式ARM真机性能。
- 两个独立源码检出，基线只共享相同已安装依赖，业务源码仍来自自己的检出；正式计时两组均启用非懒加载、常规开发模式。基线没有运行时代码差异；生成的Uniwind声明不影响JS行为。最终修复运行的bundle SHA-256为 `93585917c944c0bdb60d95133d3875efa1390269f77733176dea0cc7c49b7480`，基线正式运行未保存bundle字节指纹，以独立检出、源码提交及实际ZIP服务记录标识。
- 使用本证据分支的 `samples/moby-dick.epub`（1,628,868字节，154条目）和 `samples/kusamakura-vertical-only.epub`（17,940,208字节，30条目），来源和授权见[证据分支说明](../../README.md)。输入SHA分别为 `81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4`、`5eee439293bd53cb2c284a9b988e8e15013aa433a415d10427fbf7bd1bc62a0d`。
- 正式运行前关闭阅读会话，暂时关闭启动续读，确认书库前台、AppState=active、原生ReaderSession尚未加载。每版本新进程，两个样本均已在数据库内，每书依次重导入3次，间隔2秒；先基线、后修复。**不是新书首次导入，不是交错随机实验。** 开发菜单覆盖及自动续读影响的早期数据不参与正式比较。
- 实际调用生产 `importEpubFile`、文件服务、SQLite与fflate；包装函数只计时，不替换实现。不包含文件选择器或内容提供者传输。计时期间没有并行测试/编译。20 ms计时器延迟反映事件循环响应，不能换算成掉帧数或FPS。

## 正式结果

单位秒，三列依次为该版本进程内三次重导入。

| 样本／版本 | 导入总耗时 | 每次最大计时器延迟 |
|---|---|---|
| 白鲸／基线 | 3.630 / 3.461 / 3.602 | 2.891 / 2.894 / 2.745 |
| 白鲸／修复 | 3.940 / 3.534 / 3.576 | 0.267 / 0.167 / 0.154 |
| 草枕／基线 | 16.048 / 15.346 / 14.915 | 14.688 / 15.078 / 14.622 |
| 草枕／修复 | 15.101 / 16.922 / 17.977 | 0.208 / 0.286 / 0.216 |

常规路径的 `zipSync` 次数从6→0。白鲸中位总时长3.602→3.576秒，草枕15.346→16.922秒。样本数量小且环境为开发模拟器，不作统计显著性或生产环境提速判断。分块让出主线程会增加调度成本，不能拿旧同步调用墙钟时间直接当作优化后的全部节省。

约1秒一次的进程RSS，在正式导入粗略窗口内：基线约1028–1131 MiB，修复约1024–1122 MiB，分别65、69个样本。主机/设备时钟校核存在约1秒偏差，窗口首尾各扩展2秒，见 `clock-alignment.json`。差异小，**没有证明显著降低峰值内存或解决泄漏**；短尖峰可能漏采，RSS也不是JS堆。

受管包字节：白鲸2,816,280→1,628,868，草枕18,694,557→17,940,208。修复后的受管书目录实际分配5684、36092 KiB，仍包含全部entries、包和封面；没有删资产来制造提速。旧目录分配量见[原基线报告](../performance-20261026/README.md)。

## 内容与阅读回归

1. 设备上读取184个实际提取文件，逐个核对索引SHA与长度，再由Python对照源ZIP原始资源；全部一致，包含图片、字体与日文路径。两个受管包的SHA分别等于输入SHA，封面SHA也匹配源资源。见 `fixed-assets.json` 和 `summary.json`。
2. 使用同一安装包的实际ReaderRuntime，交替读取旧STORE备份与原压缩包。白鲸每种容器8个检查帧：恢复页、封面、书名页、第1–3章、20px重排、重新打开；草枕每种5个：恢复页、封面、第1/2章、重开。对应页文本、完整绘制命令SHA、恢复/重开定位相同。白鲸两处检查帧含实际图片，图片字节SHA相同。见 `moby-reader-comparison.json`、`kusa-reader-comparison.json`。
3. 从实际搜索结果的源范围创建并通过SQLite保存“Ishmael”标注。两种容器下原字号和20px的选文均正确、非空矩形完全相同；重排确实改变矩形。另在关闭阅读页后，将受管文件恢复为旧STORE包，再通过实际导入服务替换为原压缩包，持久化阅读状态与标注记录逐字段不变，见 `migration-state-comparison.json`。

这些证明了本次容器/导入改动在检查点上没有引入差异，**不是整本精排正确性认证**。草枕当前可见封面页没有图片绘制命令，本文未穷举该封面的后续分页，因此不把“两个容器相同”写成“其封面图文排版正确”。也未验证所有字体格式、DRM、全部页面或系统内容提供者。

![使用原压缩包的书库封面](library-original-archives.png)

## 静态与ZIP回归

工作区89文件、566测试通过（`vitest run --maxWorkers=2`）；TypeScript通过；ESLint无错误，现有16条警告保留在日志，修改文件无新增警告；Prettier通过。原默认并发运行曾有3个既有Babel/worklet测试超过5秒，降低运行器并发后全量通过，没有扩大超时或修改这些测试。完整记录在 `checks/`。

新回归覆盖STORE/DEFLATE、数据描述符、Unicode、重复及过期本地记录、描述符特征字节出现在有效负载、损坏的未请求资源、路径/尺寸边界、写入失败、原始快照、兼容重打包、临时文件清理、封面定位与同步/异步元数据一致性。没有新增运行依赖。XML解析规则仍是该独立main基线的规则，[XML修复PR #4](https://github.com/Umbrae-Labs/lunar/pull/4)另行评审，不能把其能力算入本分支。

## 协作组复现

准备两个精确检出（上述基线、修复提交）、本证据分支和同一开发APK。依赖按仓库锁文件安装；Android原生构建仅在Linux CNB进行，也可以直接使用上述可下载APK。不要用Expo Go。

```sh
adb install -r /path/to/lunar-develop.apk
adb reverse tcp:8081 tcp:8081
adb push /evidence/samples/moby-dick.epub /data/local/tmp/moby.epub
adb push /evidence/samples/kusamakura-vertical-only.epub /data/local/tmp/kusa.epub
adb shell run-as com.lunarain_079.lunar.dev mkdir -p files/perf
adb shell run-as com.lunarain_079.lunar.dev cp /data/local/tmp/moby.epub files/perf/moby-dick.epub
adb shell run-as com.lunarain_079.lunar.dev cp /data/local/tmp/kusa.epub files/perf/kusamakura-vertical-only.epub
adb shell run-as com.lunarain_079.lunar.dev sha256sum files/perf/moby-dick.epub files/perf/kusamakura-vertical-only.epub
```

每次仅运行一个Metro，设置 `APP_VARIANT=development`、`EXPO_NO_METRO_LAZY=1`，从相应检出的 `apps/mobile` 启动 `expo start --dev-client --offline --port 8081`；不要开启CI模式。用 `lunar-dev://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081` 连接。Windows的环境变量使用PowerShell语法。两个样本先各导入一次，确保正式运行均为重导入。

从该Lunar检出根目录执行（`metro-evaluate.mjs` 使用已安装的ws依赖）：

```sh
node /evidence/scripts/metro-evaluate.mjs /evidence/scripts/performance-import-prepare.js --async
# 上条会暂时关闭启动续读。记录其原值；退出并重开应用，使正式进程没有先打开阅读器。
node /evidence/scripts/metro-evaluate.mjs /evidence/scripts/performance-import-compare-harness.js
# 另一个终端启动RSS采样，选择未使用的输出目录；正式计时后创建该目录的memory-stop文件。
python /evidence/scripts/performance-sample-memory.py --out /new/memory-directory --seconds 150
node /evidence/scripts/metro-evaluate.mjs /evidence/scripts/performance-import-compare-batch.js --async
```

检查返回的 `environment` 三个字段及6条 `import.total`，保存JSON。按版本分别重新启动应用与Metro。若控制器观察超时，检查 `globalThis.__lunarAuditTask`；pending时继续观察原任务，**不要重复发起导入**。新进程会清掉包装，或者调用 `__lunarPerf.finish()` 后删除全局对象。

阅读对照前，将基线生成的两个受管 `book.epub` 分别复制到应用的 `files/perf/baseline-moby-store.epub`、`baseline-kusa-store.epub`。换修复JS重新导入，两书的bookId为上述输入SHA。打开白鲸，第1章调用 `performance-import-save-state.js` 创建对照标注；页面稳定后再捕获持久化状态。阅读器已ready且harness捕获到runtime时，分别在两本书中运行 `performance-import-reader-compare.js`。它只接受这两本公开样书；对照从实际绘制工件与图片缓存读取，不替换引擎。资产检查运行 `performance-import-verify-assets.js`，数值/原文件断言执行 `python /evidence/scripts/analyze-streaming-import.py`。

正式结果为 `baseline-formal-*`、`fixed-formal-*`；早期 `*-diagnostic*`、`baseline-imports-raw.json`、`baseline-paired-*` 仅留作诊断历史，不进入汇总。最初8KiB版本发生明显变慢，不能作为最终源码结果；错误地把fileUri放入layout请求的初次阅读探针也已由只传布局字段的最终探针取代。

测试结束恢复启动续读的原值。测试只使用公开样书；用户提供的三本EPUB、截图和正文没有上传。没有发布适配包、升级Lunar的原生依赖、合并PR或开展新版竖排内核的Android验收。
