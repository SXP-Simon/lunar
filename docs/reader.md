# 阅读内核约束

## 边界

[MUST] EPUB 阅读核心存放于 `src/reader`。

[MUST] `src/reader` 通过自身公开入口向业务层提供阅读能力。

[MUST] 业务页面与业务组件隔离 `@ritojs/react-native`、Skia 绘制对象及阅读内核内部状态。

[MUST] 应用层的 Rito 适配限定于 `src/reader/rito` 与 `src/reader/runtime/pagination`，原生协议实现位于 `modules/rito-rn`。

[MUST] `src/reader/rito`、`src/reader/runtime/pagination` 与 `modules/rito-rn` 共同构成 Rito 版本差异的适配边界。

## 内部分层

[MUST] `contracts` 仅定义阅读内核公开类型与固定错误契约。

[MUST] `typography` 仅负责排版默认值、输入规范化与版面标识生成，保持平台无关。

[MUST] `runtime` 仅负责阅读会话、版面修订、分页调度与资源生命周期。

[MUST] `runtime/core` 仅负责阅读运行时、阅读会话接口与运行时诊断。

[MUST] `runtime/pagination` 仅负责分页后端、分页调度、Rito 分页适配与分页相关资源解析。

[MUST] `runtime/cache` 仅负责帧缓存、渲染资源缓存与阅读操作串行化。

[MUST] `rito` 仅负责 Rito 适配、版面配置转换与阅读位置处理。

[MUST] `skia` 仅负责文字测量、字体、图片、绘制命令与画面编译。

[MUST] `skia/fonts` 管理字体注册、字体匹配与原生字体资源生命周期。

[MUST] `skia/text` 管理 Paragraph 创建、字形塑造与文字测量。

[MUST] `skia/images` 管理图片解码与图片缓存。

[MUST] `skia/rendering` 管理 DisplayList 执行、Picture 编译与 Canvas 表面。

[MUST] `interaction` 仅负责命中检测与当前页可访问性语义。

## 会话与版面约束

[MUST] 阅读业务只能通过 `src/reader` 的公开入口访问运行时能力。

[MUST] 阅读会话中的分页工件视为不可变值，版面变化通过新的修订标识表达。

[MUST] 工件身份与画面身份保持独立，工件身份不得替代画面身份参与渲染资源复用。

[MUST] 帧的修订标识、页序位置与画面身份必须共同满足渲染一致性要求。

[MUST] 空帧、页序位置不匹配的帧与已失效修订的帧不得进入渲染表面。

[MUST] 前台导航与后台分页对同一阅读会话的状态变更必须保持确定的先后顺序。

[MUST] 阅读会话结束后，属于该会话的分页工件、图片资源、字体资源与画面资源必须进入终止状态。

## 取舍约束

[SHOULD] 已完成工件的不可变性优先于因元数据变化重复生成相同画面。

[SHOULD] 前台导航响应优先于后台分页吞吐量。

[SHOULD] 缓存容量边界优先于无限期保留分页工件或渲染资源。

[SHOULD] 画面缓存依据画面身份复用，分页工件缓存依据工件身份管理。

[SHOULD] 章节边界的有限工件保留优先于全书工件常驻，允许再次访问时产生分页开销。

[SHOULD] 诊断信息默认保持关闭，并且不改变阅读状态语义。
