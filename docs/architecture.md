# 代码分层约束

## 目录职责

[MUST] `src/app` 仅承载 Expo Router 路由入口、页面装配与应用级 Provider 装配。

[MUST] `src/components/ui` 仅承载全局共享且与业务无关的自定义原子组件。

[MUST] `src/components/providers` 仅承载应用级 Provider。

[MUST] `src/features/<feature>` 承载单一业务域的界面、业务组件、Hooks、领域类型、仓储、业务服务与专属设备适配器。

[MUST] `src/reader` 仅承载 EPUB 阅读内核及其公开契约。

[MUST] `src/db` 仅承载数据库连接、初始化、结构迁移与事务基础能力。

[MUST] 具有业务语义的数据库查询与行数据映射归属对应业务包的仓储目录。

[MUST] 单一业务使用的文件访问与设备能力实现归属对应业务包的基础设施目录。

[MUST] `src/stores` 仅承载跨页面共享的应用状态。

[MUST] 层级之间不得形成循环依赖。

## 依赖方向

[MUST] `src/app` 通过 `src/features` 组合业务界面。

[MUST] `src/features` 可以依赖 `src/components/ui`、`src/db`、`src/stores` 与 `src/reader` 的公开入口。

[MUST] 业务包之间仅通过各自公开入口共享领域类型与能力契约。

[MUST] `src/components/ui` 保持业务无关，且隔离 `src/features`、`src/db`、`src/stores` 与 `src/reader`。

[MUST] `src/reader` 保持界面无关，且隔离 `src/app`、`src/features` 与 `src/components/ui`。

[MUST] `src/db` 保持业务无关，且隔离 `src/app`、`src/features`、`src/components/ui` 与 `src/reader`。

[MUST] 跨层引用使用各层公开入口，内部文件仅供所属层使用。

## 取舍约束

[SHOULD] 模块职责清晰优先于减少文件数量。

[SHOULD] 层间隔离优先于复用其他层的内部实现。

[SHOULD] 公开契约稳定性优先于暴露更多内部类型。

[SHOULD] 平台相关能力的边界清晰优先于在业务层共享平台细节。
