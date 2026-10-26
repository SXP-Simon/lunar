# 阅读关闭必须等待原生会话释放

基线 `Umbrae-Labs/lunar@4641589621f24d0df7d5a0811a3e26b1856c64cf`；独立修复分支 `SXP-Simon/lunar:fix/reader-close-pending`，代码提交 `f6f336f0f621a35750d83465cd713d30110cf0de`。本报告和验证脚本仅存放于 evidence 分支，不进入代码 PR。

## 具体问题与用户影响

`LunarReaderRuntime.close()` 先开始新操作：`beginOperation()` 异步调用 `backend.cancel()`，后者已经开始关闭旧 publication，并先清空后端持有的字段。接下来的 `releaseResources()` 再次调用 `backend.close()`，旧实现看到 publication 为空便返回，导致 runtime 已报告 `idle`，真正的 `RitoReaderSession.dispose()` 却尚未完成，正式基线三次甚至都尚未开始。

这使调用方不能把 `await runtime.close()` 当作原生资源释放完成的界限。随后打开或重排可能与旧会话清理重叠；这是已证明的时序风险，**没有在本实验中证明必然引起崩溃、内存泄漏或丢失阅读进度**。

修复由后端保留正在关闭的 Promise，后续 close 加入同一释放过程；`allSettled` 保证多个释放过程均结束才传播错误。图片缓存及其所有权在清空字段前捕获，避免旧清理通过已更新字段操作缓存。运行时的异步取消增加拒绝处理，保留既有 teardown 的尽力清理语义。

本次只修关闭时序与取消拒绝处理。完整打开、字号重排仍会重新读取源 EPUB 并建立原生会话；没有实现会话复用，也没有改变加载链路以获得提速。Skia 原有延后两帧释放策略不变；`close` 返回不等于所有 GPU 对象已同步销毁。

## Android 实际验证

- 使用同一[公开 development APK](https://github.com/Umbrae-Labs/lunar/releases/download/nightly-20261024-40115172807/lunar-develop.apk)，SHA-256 `3fff66355689b9dd4d753bbee78452d89d2ea2ac6e19d4bcd3d569001600be2c`，原生源码 `8ecf3336ad73b4b73d93d1ade2d3b3847c5e9170`；只切换 Metro 的 JS 源码。未在 Windows 编译 Android。
- Expo SDK 57、RN 0.86.3、`@umbrae-labs/rito-rn@0.3.0-lunar.1`，内核 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae`。这些不是竖排修复后的新内核。
- Android API 36、`handwrite-api36`，4 GiB、1080×2400、420 dpi，x86_64 系统通过 ARM64 兼容层运行 APK。结果不外推为真机性能。
- 输入为证据分支的原始公开样书 [moby-dick.epub](../../samples/moby-dick.epub)，1,628,868 字节，SHA-256 `81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4`。设备文件再次核对相同 SHA。来源、CC BY-SA 3.0 及附属资源授权见[根说明](../../README.md)。没有修改或公开用户的 EPUB。
- 使用生产 `LunarReaderRuntime`、`RitoNativePaginationBackend` 和 `readReaderBook`，从精确源码模块导出构建，与应用的会话工厂一致。后台分页在该测试会话内暂停；无可见 Canvas，不计量屏幕退出动画、画面、选区或首次打开性能。
- 仅包装这个会话的 `dispose` 记录开始、结束及原函数结果，没有添加延迟或替换原生实现。记录关闭返回时的 snapshot，并等待实际原生释放后才结束每次测试。
- 三组基线／修复交替运行。每次都 force-stop 并冷启动应用，切到精确提交；记录 `pendingClose` Promise 是否存在，辅助核对实际运行实现，而非只凭主机 Git HEAD。

| 版本 | 次数 | `close` 返回时原生已释放 | 原生释放结果 | 返回时 phase |
|---|---:|---|---|---|
| 基线 | 3 | 全部否 | 全部 ok | idle |
| 修复 | 3 | 全部是 | 全部 ok | idle |

见 [formal-trials.json](formal-trials.json) 和六份 `baseline-*.json`／`fixed-*.json`。基线事件顺序均为 `close.start → close.resolved → dispose.start → dispose.end`；修复均为 `close.start → dispose.start → dispose.end → close.resolved`。**这些数据验证完成顺序，不是关闭耗时或节省内存的基准。**

早期热更新测试中曾出现一次“主机切到修复提交，结果仍提前返回”，保留在 [hotreload-excluded.json](diagnostics/hotreload-excluded.json)。当时通过已初始化模块的首个同名导出寻找构造器，未证明实际用到哪份实现；不将其计入正式结果，也不武断归因于热更新。随后改为精确源码模块导出、每次新进程和记录实现标记，得到上述六次正式结果。初次性能准备因旧原生会话残留失败的记录也保留，不能独立当作本问题的证明。

## 静态与回归验证

- 将最终测试文件放到独立基线检出，生产源码保持基线：26 项中 **2 失败、24 通过，另有 1 项未处理拒绝**。两项失败直接检测关闭提前返回；错误路径测试本身通过，但运行器捕获 `native disposal failed` 未处理拒绝，见 [基线完整日志](checks/baseline-final-tests.log)。不能表述为“三个断言都失败”。测试后已恢复基线测试文件，保留该检出原有的 Uniwind 生成声明差异。
- 修复版相关测试 **26/26**，移动端完整测试 **87 文件、541 项通过**，见 [相关日志](checks/fixed-targeted-tests.log)、[全量日志](checks/fixed-mobile-tests.log)。测试覆盖 delayed dispose、cancel 后再次 close、dispose reject；未修改超时。
- `tsc --noEmit`、两份修改实现的 ESLint 与 Prettier 通过；前两者无输出日志保存在 `checks/`。代码提交时相同源文件也通过仓库 hook 检查。证据清单记录三个修改文件和实际执行的 observer／input／controller 的 SHA-256。
- 原启动续读设置为 true，实验期间为 false，结束恢复为 true，见[原值记录](diagnostics/original-settings-and-invalid-setup.json)和[恢复记录](settings-restored.json)。

## 复现

准备干净的专用 Lunar 检出，具有上述两个提交和 `fix/reader-close-pending` 分支，并按锁文件安装依赖；将本证据检出放在其同级，名字为 `lunar-epub-evidence`。控制器会切换该 Lunar 检出并 force-stop 测试包，不能用于存有未提交工作的检出。

安装上述 APK，准备 API 36 模拟器。仅启动一个 Metro，从这个专用 Lunar 检出的 `apps/mobile` 运行，环境为 `APP_VARIANT=development`、`EXPO_NO_METRO_LAZY=1`，启动 `expo start --dev-client --offline --port 8081`；不要启用 CI 模式。先连接 development client，使设置 store 初始化。

以下从 Lunar 根目录运行；`/evidence` 代指同级 evidence 的绝对路径，Windows 调整成对应 PowerShell 路径：

```sh
adb reverse tcp:8081 tcp:8081
adb push /evidence/samples/moby-dick.epub /data/local/tmp/moby.epub
adb shell run-as com.lunarain_079.lunar.dev mkdir -p files/perf
adb shell run-as com.lunarain_079.lunar.dev cp /data/local/tmp/moby.epub files/perf/moby-dick.epub
adb shell run-as com.lunarain_079.lunar.dev sha256sum files/perf/moby-dick.epub
node /evidence/scripts/hermes-eval.mjs /evidence/scripts/performance-import-prepare.js --async
```

保存准备脚本返回的 `previousResumeReadingOnLaunch`，它会暂时关闭启动续读；正式控制器随后冷启动清理旧会话。将 `scripts/reader-close-input.js` 复制到 Lunar 的 `.tmp/epub-validation/reader-perf-input.js`，`scripts/reader-close-observer.js` 复制到 `.tmp/epub-validation/reader-close-observer.js`。这些是本次实际执行脚本的逐字节副本，控制器保留了执行时使用的文件名。

```sh
node /evidence/scripts/compare-reader-close.mjs
```

控制器输出六次正式结果及聚合文件到 Lunar 的 `.tmp/epub-validation`，最后切回修复分支。每次预期 `disposeStatus=ok`；基线两个布尔标记均 false，修复均 true。若观察超时，先查询 Hermes 的 `globalThis.__lunarAuditTask`，pending 时等待原任务，不要重启同一次操作。

结束时通过 Hermes 读取已初始化模块中的 `useApplicationSettingsStore`，调用 `getState().setResumeReadingOnLaunch(之前保存的原值)`，确认读回一致。删除 `__lunarReaderBenchInput`／已完成的诊断全局对象，不能覆盖他人的原设置。本次已恢复 true。

静态负对照可在独立基线检出只复制最终测试文件，运行 `node node_modules/vitest/vitest.mjs run tests/unit/reader-locator-navigation.test.ts --maxWorkers=2 --reporter=verbose`（工作目录 `apps/mobile`）；它应非零退出。修复检出相同命令应通过。全量命令省略测试路径。验证保存材料的一致性：

```sh
python /evidence/scripts/verify-reader-close-evidence.py
```

验证器检查原始六份结果与聚合一致、完成顺序、实际实现标记、测试摘要、样书和已执行脚本的指纹；它不替代重新运行 Android 实验。
