# 界面组件约束

[MUST] 如用户没有要求，不要使用Playwright进行截图查看，而是让用户先进行验收

## 组件来源

[MUST] 产品界面的基础交互组件采用 HeroUI Native。

[MUST] HeroUI Native 组件遵循其 React Native API、组合组件结构与语义变体。

[MUST] 项目界面样式采用 Uniwind 与 HeroUI Native 语义变量。

[MUST] 新增第三方界面组件库须经过项目级审查。

## 全局原子组件

[MUST] 全局自定义原子组件存放于 `src/components/ui`。

[MUST] `src/components/ui` 中的组件保持业务命名、业务状态、业务文案与业务数据类型隔离。

[MUST] 同类交互在多个业务包共享时，由 `src/components/ui` 提供统一组件契约。

[MUST] 仅由单一业务使用的组件归属对应 `src/features/<feature>/components`。

## 可访问性

[MUST] 交互组件具备与用途一致的可访问性角色、名称、状态与触控区域。

[MUST] 文本组件保留系统字体缩放能力。
