# XML 解析：Android 复现与回归

日期：2026-10-25。基线发布、APK 校验值见同目录 `apk-provenance.json`、`APK-SHA256SUMS.txt`。修复源码：`6592b87`，分支 `fix/epub-xml-parser`。

环境：Android API 36 Google APIs x86_64 模拟器（支持 ARM64 兼容层），1080×2400、420dpi；设备系统已有减少动态效果设置。基线使用内置 JS 的 `lunar-nightly.apk`；修复使用同一发布的 `lunar-develop.apk` 加载 Metro。原生引擎不变。这里只验证解析与打开，不比较两个构建的耗时。

## 操作

1. 安装公开发布的 APK，将本分支 `samples` 推送到 `/sdcard/Download/lunar-epub-samples`。
2. 打开基线 Lunar → 右上角导入 → Android 文件选择器 → 设备存储 → Download → lunar-epub-samples。
3. 选 `moby-dick-attribute-whitespace.epub`：出现 `The EPUB XML contains a missing attribute.`，书库仍为空。截图 `device/xml-baseline-whitespace-failure.png`。
4. 选 `moby-dick-opf-prefix.epub`：可导入，但卡片只显示首字母，没有封面。打开后出现 `The EPUB package has no HTML document in its spine.`。截图 `device/xml-baseline-prefix-library.png` 和 `device/xml-baseline-prefix-open-failure.png`。
5. 在修复检出执行 `pnpm --filter @lunar/mobile start --dev-client --lan --port 8081`，设置 `REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1`，用 `adb reverse tcp:8081 tcp:8081` 连接开发客户端。不要用 Expo Go。
6. 在开发客户端通过同一文件选择器导入两个变体。两者均显示《白鲸》的封面，空白变体可以打开并显示书名页。截图 `device/xml-fixed-whitespace-library.png`、`device/xml-fixed-whitespace-reader.png`。
7. 打开前缀变体，目录显示 141 项；选择 Chapter 1. Loomings.，正文正常呈现。截图 `device/xml-fixed-prefix-library.png`、`device/xml-fixed-prefix-toc.png`、`device/xml-fixed-prefix-chapter1.png`。

两个版本的同名书用 SHA-256 区分。前缀变体的书籍 ID 为 `ae9ad3b5272184f3640571821d2c39f4e999e05045665b1f724213254eaa0720`，可用 `lunar-dev://reader/<ID>` 进入，避免误点同名书。

## 结论与边界

基线故障在真实 Android 应用内成立，修复后两个变体都能经过导入和原生阅读流程。EPUBCheck 5.4.0 对两个变体均报告零错误、零警告。Node 层对照确认其元数据、封面和首章节与原始《白鲸》一致。

这不是对整本书全部页面、划线、竖排、FXL 或性能的验收。后续各问题需要独立证据与分支，不能引用本报告扩大结论。
