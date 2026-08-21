# 业务包约束

## 业务边界

[MUST] 每个界面业务域存放于独立的 `src/features/<feature>` 目录。

[MUST] `library` 负责书库、导入与书籍详情界面。

[MUST] `reader` 负责阅读页面、工具栏、目录面板、排版设置与手势组合。

[MUST] `settings` 负责应用设置界面。

[MUST] 每个业务包仅持有本业务相关的组件、Hooks、局部状态与局部类型。

## 层级关系

[MUST] 业务组件通过 `src/components/ui` 使用全局原子组件。

[MUST] 阅读业务通过 `src/reader` 的公开契约访问阅读内核。

[MUST] 业务包之间通过公开契约共享能力，禁止引用其他业务包的内部文件。

[MUST] 跨业务共享且具有业务语义的能力归属明确的公共领域模块，禁止进入 `src/components/ui`。

[MUST] Expo Router 页面保持业务编排职责，业务界面与业务 Hooks 归属对应业务包。
