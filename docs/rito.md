# Rito 协作约束

> 本文件约束 Rito 内核、`rito-rn` 适配包与 Lunar 之间的职责和依赖。捕获、导出、更新与发布的操作流程以 `rito-rn` 仓库的 `CONTRIBUTING.md` 为准。

## 仓库职责

[MUST] Rito 协作涉及四个仓库，依赖方向固定为单向：`Ringyuki/Rito` → `Saramanda9988/Rito` → `Umbrae-Labs/rito-rn` → Lunar。下游仓库不得成为上游仓库的构建输入。

[MUST] `Ringyuki/Rito` 是内核的唯一上游。fork `Saramanda9988/Rito` 的 `master` 与 `dev` 仅承接上游同步，不直接提交 Lunar 专属改动。

[MUST] fork 与上游同步采用快进或合并，`master` 与 `dev` 禁止强制推送。

[MUST] fork 的 topic 分支承载全部内核修改，每个分支保持单一主题，可以独立提交上游 PR。

[MUST] `rito-rn` 负责 TypeScript 会话 API、wire 协议适配、Nitro C++ 桥接、平台构建配置、引擎锁定与预编译库，并以 `@umbrae-labs/rito-rn` 发布到 npm。

[MUST] Lunar 仅通过 npm 消费 `@umbrae-labs/rito-rn`。仓库根目录的 `rito-rn/` 是可选的开发检出，被 Git 忽略且不加入 pnpm workspace；Lunar 的安装、检查、测试与构建不得依赖该目录。

## 修改位置

[MUST] Rust 内核修改仅在 `rito-rn` 的 `upstream/rito` 子模块中进行，并基于锁定 base 的 topic 分支。

[MUST] TypeScript、Nitro、C++ 与平台集成修改在 `rito-rn` 仓库进行。

[MUST] `rito-rn` 的 `native/rito`、`prebuilt` 与 `.engine` 均为生成产物，禁止手工修改；同步导出会覆盖其中的全部改动。

[MUST] `rito-rn` 的 `patches/` 由 topic 分支捕获生成，禁止手工编辑。被捕获的分支保持锁定 base 之后的线性历史；为上游 PR 同步上游所产生的合并提交不得进入捕获范围。

[MUST] Lunar 不得通过 pnpm 补丁或本地覆盖修改 `@umbrae-labs/rito-rn`。内核与适配器缺陷在其所属仓库修复，并通过新版本进入 Lunar。

## 引擎锁定

[MUST] `rito-rn` 的 `engine.lock.json` 是引擎来源的唯一记录：每个 profile 使用完整提交哈希锁定 base，按顺序记录补丁及其 SHA-256。

[MUST] 安装、导出与构建不得跟随移动分支；分支名仅用于显式的引擎更新。

[MUST] `rito-rn` 提交中记录的 `upstream/rito` 子模块指针始终等于默认 profile `lunar` 的 base。topic 分支只改变本地检出，新 base 通过引擎更新同时写入锁文件与子模块指针。

[MUST] profile 的用途保持分离：`lunar` 为 fork `dev` 加 Lunar 补丁序列，供 Lunar 正式使用；`canary` 为 fork `dev` 的无补丁预览；`upstream-release` 为上游 `master` 的无补丁发布。

[MUST] 补丁被新 base 吸收后从序列中移除。补丁冲突或已被应用时，引擎更新必须终止并交由人工评审。

[SHOULD] Lunar 补丁序列视为待上游化的差异。修复优先以 topic 分支向上游提交 PR，并在对应补丁记录中登记 PR 地址。

## 发布

[MUST] 每个发生变化的 npm 产物使用新版本号。适配器版本独立于引擎版本，引擎来源以包内的来源清单为准。

[MUST] 公开发布包含 Android ARM64 与 Apple 设备、模拟器的预编译库，全部二进制来自同一次发布运行。仅含源码的归档只用于本地开发。

[MUST] `lunar` profile 发布到 `latest`；其他 profile 使用预发布版本号及同名 dist-tag。

[SHOULD] 发布完成后，`rito-rn` 仓库中 `package.json` 的版本与已发布版本保持一致。

## Lunar 接入与升级

[MUST] `apps/mobile/package.json` 以精确版本声明 `@umbrae-labs/rito-rn`，禁止使用版本范围或 dist-tag。

[MUST] 升级版本时同步更新 `pnpm-workspace.yaml` 中 `minimumReleaseAgeExclude` 的放行条目，放行仅限该精确版本。

[MUST] Lunar 仅使用包公开入口导出的契约，禁止引用包的内部路径。应用内的接入范围遵守 [阅读内核约束](reader.md) 中的 Rito 适配边界。

[MUST] 跨仓库变更依次完成 fork 修改、`rito-rn` 发布、Lunar 升级。Lunar 不得依赖尚未发布到 npm 的接口。

[MUST] 引擎更新不等同于 Lunar 依赖升级。采用新版本前，需在具备 Android 原生编译条件的环境中完成真机阅读行为验证。

[SHOULD] Lunar 文档不重复记录 `@umbrae-labs/rito-rn` 的具体版本号，以依赖声明为准。

## 取舍

[SHOULD] 内核差异以“锁定 base + 补丁序列”承载，而不是维护长期分叉分支：构建可复现，补丁保持可上游化，CI 也不依赖尚未推送的 fork 分支。代价是每次修改内核都要经过捕获与导出。

[SHOULD] Lunar 消费带预编译库的 npm 包，而不是从源码编译内核：Lunar 构建环境无需 Rust 工具链，产物身份由版本号确定。代价是每次内核或适配器修改都要发布新版本，才能进入 Lunar。
