# 阅读性能日志

## 采集方法

性能日志默认关闭。在 PowerShell 中启用计时，关闭详细状态输出，然后重新启动 Metro 并重新打开书籍：

```powershell
$env:EXPO_PUBLIC_READER_PERF = '1'
$env:EXPO_PUBLIC_READER_TRACE = '0'
pnpm start --dev-client
```

调试控制台也支持 `globalThis.LUNAR_READER_PERF = true`，设置后重新进入阅读页面以启动 JS 定时器采样。`LUNAR_READER_TRACE` 和 `LUNAR_READER_TRACE_VERBOSE` 保持关闭。`__LUNAR_READER_PERF__` 兼容旧的性能开关，但只启用计时。

复制 Metro 中的 `[LunarReader][perf]` 日志到 `reader-perf.log`。Android 设备完成 USB 调试授权后，也支持在另一个 PowerShell 窗口采集：

```powershell
adb logcat -v threadtime 'ReactNativeJS:I' '*:S' | Tee-Object -FilePath reader-perf.log
```

先停留在静态页面约 5 秒，执行一次翻页，再停留约 3 秒。分别采集 slide 点击、slide 拖动、curl 点击和 curl 拖动。跨章节与同章节翻页分别记录。采集结束后按 Ctrl+C，并生成报告：

```powershell
node scripts/reader-perf-report.mjs reader-perf.log
```

报告接受 Metro 文本、logcat 文本、JSON 行、JSON 数组，以及历史 `TimeStamp` 跟踪文件。截断的日志行会被忽略。新日志使用 JSON 字段，避免从面向阅读的字符串中提取计时。

## 翻页计时位置

| 文件 | 事件 | 测量范围 |
| --- | --- | --- |
| `use-automatic-page-turn-navigation.ts` | `reader.controller.queue` | 点击请求等待控制器队列与动画空位的时间 |
| `use-automatic-page-turn-navigation.ts` | `reader.controller.prepare` | 自动翻页开始前取消或等待交互预备操作的时间 |
| `native-reader-runtime.ts` | `reader.runtime.queue`、`reader.runtime.operation` | 运行时串行队列等待与单次导航、预备、提交、取消、预热操作 |
| `native-reader-runtime.ts` | `reader.adjacent.resolve`、`reader.adjacent.adopt` | 交互目标页预备与原生工件采用 |
| `native-reader-runtime.ts` | `reader.frame.resolve` | 分页后端提供页面，包括所需原生请求、解码与资源准备 |
| `rito-native-pagination-backend.ts` | `reader.backend.adjacent` | 相邻页请求，包括原生等待、续算与 JS 协议解码 |
| `rito-native-pagination-backend.ts` | `reader.font.read`、`reader.font.register`、`reader.image.read`、`reader.frame.convert` | 字体读取和注册、图片字节读取、页面数据转换 |
| `native-reader-runtime.ts` | `reader.images.acquire`、`reader.picture.compile` | 图片缓存和解码、SkPicture 编译 |
| `paragraph-cache.ts`、`primitive-text-renderer.ts` | 编译记录的 `hits`、`misses`、`evictions`、`shapeMs` | 每次编译的文字缓存统计，以及 Paragraph 创建、布局和基线查询累计时间 |
| `use-native-automatic-page-turns.ts`、`use-native-interactive-page-turn.ts` | `reader.native.record`、`reader.native.enqueue`、`reader.native.stock` | 原生页面录制与 JSI 命令提交 |
| `use-native-page-turn-events.ts` | `reader.native.event` | 原生开始、释放、完成、取消事件；保留原生时间戳与 JS 收取延迟 |
| `page-curl.tsx` | `reader.texture.capture` | 声明式卷页的 UI 任务等待、纹理生成和 RN 回调等待 |
| `use-page-turn-release.ts`、`use-interactive-page-turn.ts` | `reader.animation.release`、`reader.animation.settled`、`reader.handoff.snapshot`、`reader.turn.complete` | 松手动画与目标页面交接 |

`workId` 贯穿控制器、运行时、原生提交和交接事件。后台预热使用 `warm` 编号，与用户触发的 `automatic` 和 `gesture` 编号分开。分页适配器的细分计时保留工件编号，纹理计时保留画面编号；这些记录在报告的阶段汇总中呈现，通过时间戳辅助检查。

报告按阶段最大耗时排序，并按 `workId` 展示单次操作。`reader.picture.compile` 中的 `shapeMs` 单独展示为 `reader.text.shape`。各阶段为包含子阶段的墙钟时间，父子计时具有重叠，禁止将它们相加作为总耗时。

`reader.native.submit-to-present` 使用原生呈现事件的时间戳，包含命令等待、纹理准备与首帧提交。它并非单独的 GPU 执行耗时。`reader.native.animation` 和 `reader.animation.release-to-settle` 表示动画播放时间，需结合设定时长判断。手势库存准备至手势启动的等待还可能包含用户操作时间。

`deliveryDelayMs` 包含事件轮询间隔与 JS 调度等待。纹理的 `rasterMs` 表示 UI Runtime 执行创建、绘制、flush 与 snapshot 的墙钟时间，GPU 异步执行仍需原生分析工具测量。

## 静态页面活动

`reader.activity` 每两秒最多输出一个汇总。计时关闭时，采样定时器保持关闭。启用时，JS 延迟采样每 250 毫秒执行一次；它测量定时器调度延迟，与真实呈现帧数具有不同含义。

| 计数器 | 用途 |
| --- | --- |
| `surface.commit` | React 阅读表面提交次数，附带最新页面身份与动画状态 |
| `runtime.snapshot` | 阅读运行时发布快照次数 |
| `background.quantum`、`backend.background` | 后台分页次数、累计时间与单次最大时间，两者存在包含关系 |
| `background.frame.convert` | 后台元数据更新引发的页面转换 |
| `native.poll` | 原生事件轮询次数；静态页面应停止轮询 |
| `native.ready-probe` | Canvas 原生能力准备检查；持续出现时需检查原生初始化 |
| `texture.capture` | 备用卷页纹理生成次数 |
| `reading-state.queue`、`reading-state.save` | 阅读位置保存的排队次数与数据库保存耗时 |
| `js.timer-lag` | JS 调度延迟的最大值与累计值 |

某个窗口缺少相应计数器，表示该窗口没有记录到这项活动。页面静止后持续出现 `surface.commit` 或 `texture.capture`，值得结合快照发布次数检查。章节索引尚在计算时，后台分页与保存活动仍可能出现。

## 日志调整

原来的性能白名单仅输出开书摘要，过滤了正文编译和后台分页计时。现在保留开书事件，输出翻页阶段计时，并将高频后台活动汇总。删除渲染函数中的 `reader.canvas.render` 与冗长的 `turn.surface.state` 输出。其余状态日志采用延迟格式化，默认只保留错误与身份校验失败，详细内容由独立 TRACE 开关控制。

原生 composer 的现有事件用于呈现计时；本次没有添加逐帧 C++ 日志。原生 Rito 请求内部的 Rust 计算与 JS 解码目前合并在请求耗时中。

## Android 性能浮窗

当前依赖的 `FpsDebugFrameCallback.kt` 将 `DEFAULT_FPS` 设为 60。`FpsView.kt` 每 500 毫秒累计预期帧数与实际帧数之差。约 120 Hz 的设备因此可能每次更新减少约 30，并显示负数，例如 `-8370 dropped so far`。该负值反映固定帧率假设造成的统计偏差，不能作为丢帧总数使用。

实际动画表现应结合上述阶段计时、JS 调度延迟和设备呈现记录评估。
