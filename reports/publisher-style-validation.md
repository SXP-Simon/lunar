# 原书字体与行距模式：实现与设备验证

代码分支：`feat/reader-publisher-style`，提交 `7f82e2907a35c68e7389bf91e73f50183a86dfa4`。从 main `4641589621f24d0df7d5a0811a3e26b1856c64cf` 独立分出，不包含 XML 修复 PR。

## 触发原因与范围

`createArtifactRequest` 原来始终传入 `fontFamilyOverride` 与 `lineHeightOverride`；即使 EPUB 内嵌字体，也会被应用选择的正文字体覆盖。新模式仅在 Publisher 下省略这两项，让 Rito 使用书内的字体与行距。Custom 保留旧行为，旧设置默认为 Custom。

原书模式下仍可调字号、页边距和阅读主题；选定正文字体作为缺失字体时的备用。此功能不宣称完整还原所有出版 CSS、固定版式或全部字体格式。

模式纳入版面 key，通过现有 `updateLayout` 重排并携带源位置；配置仍由 reader store 的 MMKV 持久化及 normalize 恢复，不增加第二套存储。原书模式隐藏无效的自定义行距滑块，并把正文字体标注为备用字体；切回 Custom 保留原自定义值。

## 验证文件与环境

使用 `samples/wasteland-otf-day-only.epub`，SHA-256 `bb4ed8cd19394af89e3aa11019a38fb81e030f26873c266d54009fdb083f4786`。它只移除官方原书的备用夜间 stylesheet 引用，其余 CSS、字体、正文未变；可由 `scripts/wasteland-day-only.py` 重建，EPUBCheck 无错误和警告。

采用变体是为了隔离另一个已报告的问题 [Rito #40](https://github.com/Ringyuki/Rito/issues/40)，不能把变体可打开说成已修复原版加载错误。

API 36 / 4GB / 1080×2400 / 420dpi x86_64 模拟器，通过 ARM64 translation 运行官方 `nightly-20261024-40115172807` 开发 APK（SHA 见 `apk-provenance.json`），Metro 加载本提交。原生 Rito 锁定版本未变。仅运行开发版，nightly 已停止。

启动：在 `apps/mobile` 设置 `APP_VARIANT=development`、`EXPO_PUBLIC_READER_PERF=1`、`REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1`，执行 `expo start --dev-client --lan --port 8081`；`adb reverse tcp:8081 tcp:8081` 后让开发客户端连接。均为 JavaScript 更新，无 Windows Android 原生编译。

## 实际结果

1. 导入变体，以默认 18 号字打开，进入 Reading settings。Custom 为默认选项；见 `device/publisher-settings-custom.png`。
2. 选择 Publisher，待重排完成。正文从文楷变为书内 Old Standard，第一页标题的粗体也改变；总页数从 43 变为 36。见 `device/publisher-fonts-first-page.png` 和 `device/publisher-settings-enabled.png`。
3. `publisher-font-registration.json` 记录实际 native resource → Skia 字体注册成功事件。443980 和 471892 字节分别对应 ZIP 中 `OldStandard-Regular.otf` 和 `OldStandard-Bold.otf`；这支持字体确实加载，而不只是按钮状态变化。日志耗时仅作诊断，不作性能基准。
4. 切回 Custom，恢复文楷和 43 页，见 `device/publisher-restored-custom.png`。
5. 再切 Publisher，翻到第 2/36 页，首句 `Memory and desire, stirring`；见 `device/publisher-before-restart.png`。强制结束本测试应用，再启动开发客户端，自动恢复相同第 2/36 页及字体，见 `device/publisher-after-restart.png`；再次打开设置，Publisher 仍选中，见 `device/publisher-persisted-settings.png`。

静态验证：87 个测试文件、540 项测试通过；`tsc --noEmit` 通过；变更文件 ESLint 0 errors、3 条原有重复 import warnings（位于既有 locator 测试）。新增回归涵盖旧设置默认、自定义／原书版面 key、无效行距不重排，以及模式切换时 native request 省略／恢复覆盖值并携带原 source locator。

## 边界

- 实际测到普通 OTF regular/bold 采用，未据此宣布 WOFF、字体混淆、所有字重或竖排都通过。
- 此次重启保留的是该样书的实际第 2 页；跨字号的逐字定位、搜索与高亮恢复还需独立回归。
- 原书 CSS 下标题较紧的行距、诗歌行号等仍由引擎排版决定；不将字体开关当成布局引擎修复。
- 开发版、ARM64 translation 和模拟器数据不能代表真机性能。
