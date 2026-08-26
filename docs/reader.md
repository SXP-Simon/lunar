# 阅读内核约束

## 边界

[MUST] EPUB 阅读核心存放于 `src/reader`。

[MUST] `src/reader` 通过自身公开入口向业务层提供阅读能力。

[MUST] 业务页面与业务组件隔离 `@ritojs/react-native`、Skia 绘制对象及阅读内核内部状态。

[MUST] 应用层的 Rito 适配仅存在于 `src/reader/rito`，原生协议实现位于 `modules/rito-rn`。

[MUST] `src/reader/rito` 与 `modules/rito-rn` 是 Rito 版本差异的适配边界。

## 内部分层

[MUST] `contracts` 仅定义阅读内核公开类型与固定错误契约。

[MUST] `typography` 仅负责排版默认值、输入规范化与版面标识生成，保持平台无关。

[MUST] `runtime` 仅负责阅读会话、版面修订、分页调度与资源生命周期。

[MUST] `rito` 仅负责 Rito 适配、版面配置转换与阅读位置处理。

[MUST] `skia` 仅负责文字测量、字体、图片、绘制命令与画面编译。

[MUST] `skia/fonts` 管理字体注册、字体匹配与原生字体资源生命周期。

[MUST] `skia/text` 管理 Paragraph 创建、字形塑造与文字测量。

[MUST] `skia/images` 管理图片解码与图片缓存。

[MUST] `skia/rendering` 管理 DisplayList 执行、Picture 编译与 Canvas 表面。

[MUST] `interaction` 仅负责命中检测与当前页可访问性语义。

[MUST] 阅读内核的工程边界、资源生命周期与缓存语义遵守 [产品技术设计](../RN_EPUB_PRODUCT_TECHNICAL_DESIGN.md)。
