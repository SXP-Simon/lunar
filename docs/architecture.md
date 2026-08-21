# 代码分层约束

## 目录职责

[MUST] `src/app` 仅承载 Expo Router 路由入口、页面装配与应用级 Provider 装配。

[MUST] `src/components/ui` 仅承载全局共享且与业务无关的自定义原子组件。

[MUST] `src/components/providers` 仅承载应用级 Provider。

[MUST] `src/features/<feature>` 承载单一业务域的界面、业务组件、Hooks 与局部类型。

[MUST] `src/reader` 仅承载 EPUB 阅读内核及其公开契约。

[MUST] `src/services` 承载设备能力、文件访问及跨业务服务。

[MUST] `src/db` 承载数据库结构、迁移与持久化访问。

[MUST] `src/stores` 仅承载跨页面共享的应用状态。

## 依赖方向

[MUST] `src/app` 通过 `src/features` 组合业务界面。

[MUST] `src/features` 可以依赖 `src/components/ui`、`src/services`、`src/stores` 与 `src/reader` 的公开入口。

[MUST] `src/components/ui` 保持业务无关，且隔离 `src/features`、`src/stores`、`src/services` 与 `src/reader`。

[MUST] `src/reader` 保持界面无关，且隔离 `src/app`、`src/features` 与 `src/components/ui`。

[MUST] 跨层引用使用各层公开入口，内部文件仅供所属层使用。
