# Rito 协作约束

> 本文件约束 Rito 内核、`rito-rn` 适配包与 Lunar 之间的职责和依赖。分支合并、引擎导出、更新与发布的操作流程以 `rito-rn` 仓库的 `CONTRIBUTING.md` 为准。

## 仓库职责

[MUST] Rito 协作涉及四个仓库，依赖方向固定为单向：`Ringyuki/Rito` → `Saramanda9988/Rito` → `Umbrae-Labs/rito-rn` → Lunar。下游仓库不得成为上游仓库的构建输入。

[MUST] `Ringyuki/Rito` 是内核的唯一上游。fork `Saramanda9988/Rito` 的 `dev` 与 `master` 是上游同名分支的镜像，只以快进方式同步，不承载任何 fork 提交。

[MUST] fork 的 `lunar` 分支是 Lunar 使用的内核，由上游 `dev` 与 Lunar 所需的提交组成。

[MUST] `lunar` 只能通过合并 `dev` 和追加提交前进，禁止 rebase 与强制推送；已发布的 `rito-rn` 版本按提交哈希引用它的历史。

[MUST] 提交给上游的修复使用独立分支，基于 `dev` 创建并以上游 `dev` 为 PR 目标，每个分支只包含一项修复。

[MUST] `rito-rn` 负责 TypeScript 会话 API、wire 协议适配、Nitro C++ 桥接、平台构建配置、引擎锁定与预编译库，并以 `@umbrae-labs/rito-rn` 发布到 npm。

[MUST] `rito-rn` 与 fork 使用同名的三条线：`master`、`dev` 分别支持上游正式版与开发版，`lunar` 在 `dev` 之上承载 Lunar 内核修改及其绑定。`rito-rn` 的每个分支只构建 fork 中同名分支的内核。

[MUST] 两个仓库的合并方向一致：`dev` 合并进 `lunar`，上游发布后 `dev` 合并进 `master`，任何分支不得反向合并。为 Lunar 内核修改新增的绑定只提交到 `rito-rn` 的 `lunar`，适配上游协议变化先在 `rito-rn` 的 `dev` 完成。

[MUST] 三条线的历史均禁止 rebase 与强制推送。

[MUST] Lunar 仅通过 npm 消费 `@umbrae-labs/rito-rn`。仓库根目录的 `rito-rn/` 是可选的开发检出，被 Git 忽略且不加入 pnpm workspace；Lunar 的安装、检查、测试与构建不得依赖该目录。

## 修改位置

[MUST] Rust 内核修改仅在 `rito-rn` 的 `upstream/rito` 子模块中进行：Lunar 专属修改提交到 fork 的 `lunar`，上游修复提交到对应的修复分支。

[MUST] Lunar 在上游合并之前需要的修复，由修复分支合并进 `lunar`；上游合并后，经由下一次 `dev` 合并回到 `lunar`。

[MUST] TypeScript、Nitro、C++ 与平台集成修改在 `rito-rn` 仓库进行。

[MUST] `rito-rn` 的 `native/rito`、`prebuilt` 与 `.engine` 均为生成产物，禁止手工修改；同步导出会覆盖其中的全部改动。

[MUST] Lunar 不得通过 pnpm 补丁或本地覆盖修改 `@umbrae-labs/rito-rn`。内核与适配器缺陷在其所属仓库修复，并通过新版本进入 Lunar。

## 引擎锁定

[MUST] `rito-rn` 的 `engine.lock.json` 是引擎来源的唯一记录：每个分支只记录一个 profile、它跟踪的 fork 分支和构建所用的完整提交哈希。

[MUST] 引擎构建只使用已推送到 fork 的提交，内核差异不以补丁文件的形式存放在 `rito-rn` 中。

[MUST] 安装、导出与构建不得跟随移动分支；分支名仅用于显式的引擎更新。

[MUST] `rito-rn` 提交中记录的 `upstream/rito` 子模块指针始终等于该分支锁文件锁定的提交。工作分支只改变本地检出，新提交通过引擎更新同时写入锁文件与子模块指针。

[MUST] profile 与分支一一对应：`rito-rn` 的 `lunar` 使用 profile `lunar`，供 Lunar 正式使用；`dev` 使用 `canary`；`master` 使用 `upstream-release`。

[MUST] 引擎提交变化后，`rito-rn` 必须核对其间的 wire 协议、协议版本与展示列表格式变化，并同步更新协议适配与解码器的固定数据。

[SHOULD] `lunar` 相对 `dev` 的差异视为待上游化的修改，修复优先向上游提交 PR。

## 发布

[MUST] 每个发生变化的 npm 产物使用新版本号。适配器版本独立于引擎版本，引擎来源以包内的来源清单为准。

[MUST] 公开发布包含 Android ARM64 与 Apple 设备、模拟器的预编译库，全部二进制来自同一次发布运行。仅含源码的归档只用于本地开发。

[MUST] 每条线只从自己的分支发布：`master` 以 `X.Y.Z` 发布到 `latest`，`dev` 以 `X.Y.Z-canary.N` 发布到 `canary`，`lunar` 以 `X.Y.Z-lunar.N` 发布到 `lunar`。只有上游正式版一条线使用不带预发布后缀的版本号，版本范围不得解析到带 Lunar 绑定的构建。

[SHOULD] 发布完成后，发布分支中 `package.json` 的版本与该分支最近发布的版本保持一致。

## Lunar 接入与升级

[MUST] `apps/mobile/package.json` 以精确版本声明 `@umbrae-labs/rito-rn` 的 `lunar` 线版本，禁止使用版本范围或 dist-tag。

[MUST] 升级版本时同步更新 `pnpm-workspace.yaml` 中 `minimumReleaseAgeExclude` 的放行条目，放行仅限该精确版本。

[MUST] Lunar 仅使用包公开入口导出的契约，禁止引用包的内部路径。应用内的接入范围遵守 [阅读内核约束](reader.md) 中的 Rito 适配边界。

[MUST] 跨仓库变更依次完成 fork 修改、`rito-rn` 发布、Lunar 升级。Lunar 不得依赖尚未发布到 npm 的接口。

[MUST] 引擎更新不等同于 Lunar 依赖升级。采用新版本前，需在具备 Android 原生编译条件的环境中完成真机阅读行为验证。

[SHOULD] Lunar 文档不重复记录 `@umbrae-labs/rito-rn` 的具体版本号，以依赖声明为准。

## 取舍

[SHOULD] 内核差异以 fork 的 `lunar` 分支承载，而不是补丁序列：Lunar 的内核版本就是一个可检出的提交，上游 PR 分支的历史不受构建约束。代价是构建前必须推送内核提交，且 `lunar` 的历史不能改写。

[SHOULD] 适配器按引擎线分支，而不是一个分支用多个 profile 构建：适配器代码与它绑定的引擎一同演进，Lunar 新增的绑定不会破坏上游线的构建与发布。代价是上游协议变化需先在 `dev` 适配再合并到 `lunar`，且每次合并都要重新记录引擎提交。

[SHOULD] Lunar 消费带预编译库的 npm 包，而不是从源码编译内核：Lunar 构建环境无需 Rust 工具链，产物身份由版本号确定。代价是每次内核或适配器修改都要发布新版本，才能进入 Lunar。
