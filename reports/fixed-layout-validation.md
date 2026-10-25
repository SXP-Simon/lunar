# 固定版式识别与阅读前提示

代码分支 `feat/reader-fixed-layout-warning`，提交 `8101f4eed52b2773c9e120fb36b1cd3c080e73eb`，基于 main `4641589621f24d0df7d5a0811a3e26b1856c64cf`。本项提供能力边界提示和主动继续入口，不实现 FXL 排版引擎。

## 样书与实际问题

`samples/fixed-layout-probe.epub` 是本次原创 CC0 1.0 测试页，SHA-256 `588a5aaefd673fcb72900054f73c730daedb419158e18fd4f5ecf32726e77a88`，可用 `python scripts/fixed-layout-probe.py` 重建。没有外部图片、字体或版权不明资源。EPUBCheck 5.4.0 零错误、零警告，原始报告为 `fixed-layout-probe.epubcheck.json`。

OPF 全局声明 `rendition:layout=pre-paginated`；唯一 spine 页声明 600×800 viewport，HTML/body 尺寸也是 600×800。四角分别有绝对定位文字，右侧标签从 x=440 开始，中间为 ONE FIXED PAGE。这验证保留原视口及按比例显示整页，而非只检查某张封面是否出现。

官方 nightly 基线打开后显示 1/1 页，但 TOP RIGHT 与 BOTTOM RIGHT 完全不可见；中间文字换行。隐藏工具栏后，左侧两角可见，右侧仍缺失：见 [基线全屏截图](../device/fxl-probe-baseline-fullscreen.png)。因此确认当前固定视口不能按原页完整显示，不能仅根据能显示 Haruko 漫画图或 Cole 画作认定已完整支持 FXL。

## 实现范围

- 用 DOM 解析 container.xml 和 OPF，不使用正则匹配 XML 结构。只解压这两个小文件，章节、图片及字体在此阶段不解压。
- 按 EPUB 的全局 rendition:layout 及逐 spine itemref 的 layout-pre-paginated/layout-reflowable 覆盖计算有效版式，识别纯固定与混合书。支持 XML 命名空间前缀和 EPUB 词汇别名；忽略注释、异命名空间及 refined 全局声明。
- 业务 loader 在交给 Rito 前拦截，弹出兼容性说明；“尝试阅读”仅放行当前阅读会话，“返回书库”退出。书籍文件与出版方内容不变。
- 这是已知能力限制，不生成通用“加载失败”toast 或开发版错误框；其他运行时错误仍按原有流程报告。
- 独立于 XML 修复 PR #4 和原书样式 PR #6；使用相同 DOM 依赖版本，但不包含那两个分支的行为改动。

对应标准：[EPUB 3.3 固定版式](https://www.w3.org/TR/epub-33/#sec-fixed-layouts)。没有把图片书、日文书或文件扩展名本身作为固定版式判据。

## 复现环境与步骤

Android API 36 / handwrite-api36 / 4096 MiB / 1080×2400 / 420dpi，x86_64 系统通过 ARM64 translation 运行公开 APK。基线与开发版来源为 `nightly-20261024-40115172807`；包 SHA、原生构建提交见 `apk-provenance.json`。Rito RN `0.3.0-lunar.1`、内核 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae` 未变。每次只运行一个测试应用。

开发客户端由 Metro 加载上述代码提交。设置 APP_VARIANT=development、EXPO_PUBLIC_READER_PERF=1、REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1，在 apps/mobile 运行 `expo start --dev-client --lan --port 8081`；执行 `adb reverse tcp:8081 tcp:8081` 并连接开发客户端。Windows 没有进行 Android 原生编译。

1. 从书库导入 fixed-layout-probe.epub，再打开：先显示兼容性对话框，尚无原生页面；见 `device/fxl-final-warning.png`。
2. 点击 Try reading，实际进入 1/1 页；见 `device/fxl-final-continued.png`。原来的右侧裁切仍可见，说明此项是提示而非渲染修复。
3. 返回书库再打开同一本书：再次提示，见 `device/fxl-final-reopened.png`。点击 Back to library 回到有书籍卡片的书库，见 `device/fxl-final-cancelled.png`。
4. 打开 cole-voyage-of-life.epub：虽然全局默认流式，四个固定 spine 项仍会触发提示；见 `device/fxl-final-mixed.png`。
5. 打开既有 wasteland-otf-day-only.epub：无 FXL 提示并显示正文，见 `device/fxl-final-initial.png`。该变体排除 alternate stylesheet 问题，不代表原版 Waste Land 的另一项故障已修复。

截图均同时保存 uiautomator XML；画面内容仍以 PNG 为准，Skia 正文不会完整出现在 UI 节点树中。

## 静态与源文件验证

`node scripts/inspect-layout.cjs /absolute/path/to/lunar` 执行实际应用的版式检查函数，结果见 `layout-inspector.json`（含完整提交与干净工作树状态）。14 个样本中，probe 为 1 固定/0 流式，Cole 为 4 固定/6 流式，Haruko 为 12 固定/1 流式，其余为流式。它只证明解析分类，不冒充设备渲染测试。

全套 88 文件/548 项单元测试通过；最后针对 toast 时序调整又执行相关 33 项测试与 TypeScript 检查，均通过。变更文件 lint 无错误，仅既有 locator 测试中的三条重复 import 警告。测试涵盖布局覆盖、命名空间、词汇别名、误匹配排除、无效 XML、继续与重新拦截，并断言 host 拦截时不调用原生 backend.open、不记录 console.error 或发布通用失败消息。

## 未覆盖与后续

不包含完整 FXL 缩放、单双页配对、RTL 页序或混合书逐章切换实现；不把旧版 Apple 等私有元数据当成标准 FXL 的完整兼容承诺。引擎层仍需处理固定 viewport 与缩放。当前检查仍需读取整本文件，且首次打开有两个 ZIP 目录扫描；不能据此声称解决导入内存或性能问题。模拟器、开发版及翻译层结果不能代表真机性能。
