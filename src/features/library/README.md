# Library feature

该目录负责 EPUB 导入、书架、书籍详情、排序与文件缺失状态。

`domain` 定义书库领域类型，`repositories` 定义书籍仓储及其 SQLite 实现，`services` 负责业务编排和受管书籍文件契约，`infrastructure` 提供 Expo 文件系统与文档选择器适配器。数据库连接和迁移通过 `src/db` 使用。
