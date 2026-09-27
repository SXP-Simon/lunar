# 发布指南

## 构建与发布

项目使用 GitHub Actions 执行 Android arm64 APK 编译和 GitHub Release 发布。发布自动化包含 `Release` 与 `Nightly` 两个入口，`CI` 继续负责代码检查。原有独立 production 编译入口和 CNB 同步入口合并到这两个任务中。

EAS 使用 `--local`，实际编译在 GitHub Linux 执行器中完成。Expo 账号负责项目访问、签名凭证和 Android 构建编号管理。[EAS 本地构建文档](https://docs.expo.dev/build-reference/local-builds/)

GitHub 方案将构建日志、任务状态、附件和重试入口保存在同一平台，发布使用自动生成的 `GITHUB_TOKEN`。构建任务仅授予 `contents: read`，发布任务单独授予 `contents: write`。[GitHub Actions 权限](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)

CNB 同样能通过 GitHub Release API 创建发布并上传 APK；此方案需要在 CNB 保存 GitHub 发布令牌，并维护任务触发、提交核对和跨平台状态确认。CNB 的内置 `git:release` 发布到 CNB 本身，GitHub 发布需要调用 GitHub API。现有 CNB 配置申请 16 核，可能有利于 Rust 与 C++ 编译；实际速度应通过相同提交的构建记录比较。[CNB Release 任务](https://docs.cnb.cool/zh/build/internal-steps/git/release.html) · [GitHub Release 附件 API](https://docs.github.com/en/rest/releases/assets)

当前选择 GitHub 以简化发布维护。标准执行器的容量有限，共享构建步骤清理闲置预装工具并限制 Cargo 为两个编译任务。首次完整构建仍须确认磁盘、内存及耗时。公开仓库与私有仓库的执行器规格及计费规则以官方文档为准。[GitHub 执行器规格](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

共享构建步骤沿用 `5041c563af1ca6e83c20310010c97068da094d81` 之前的 CNB 编译顺序：准备 Node.js 22 与 Java 17，由 `scripts/build-android.sh` 初始化 Android SDK、安装依赖、执行检查，再通过 EAS CLI 21.8.0 本地编译并校验 APK 签名。SDK 包清单为 `platform-tools`、`platforms;android-36`、`build-tools;36.0.0`、`ndk;27.1.12297006` 和 `cmake;3.30.5`。Rust 工具仍由原有 EAS 安装钩子准备。

Android SDK 安装统一由构建脚本负责。SDK 目录优先使用执行器的 `ANDROID_HOME`，其次使用 `ANDROID_SDK_ROOT`，缺少配置时使用 `/opt/android-sdk`。共享步骤将选定目录传给后续 APK 校验任务。原先的 `setup-android@v3` 默认列表包含无法获取的 `tools` 包，该步骤移除后，构建脚本仅安装项目所需 SDK 包。

`.cnb.yml` 保留 CNB 分支开发构建，移除版本标签发布。GitHub 发布自动化停止同步 CNB，`CNB_SECRET` 与 CNB 的 GitHub 发布令牌退出本方案的凭证要求。

## 应用版本

| 用途     | EAS 配置      | APK 包名                     | 使用方式             |
| -------- | ------------- | ---------------------------- | -------------------- |
| 正式发布 | `release`     | `com.lunarain_079.lunar`     | 安装后独立运行       |
| 每日测试 | `nightly`     | `com.lunarain_079.lunar`     | 覆盖正式版后独立运行 |
| Develop  | `development` | `com.lunarain_079.lunar.dev` | 连接 Expo 开发服务器 |

Nightly 与正式版共用包名，覆盖安装后沿用书库、阅读进度和设置。Develop 使用独立包名和存储，可以与正式版或 Nightly 同时安装。`nightly` 继承 `release` 的 APK 编译和签名配置，使用 `APP_VARIANT=nightly` 与 Expo `preview` 环境。`development` 保留 Expo 开发客户端。`production` 继续用于 AAB 构建。[Expo 应用变体](https://docs.expo.dev/build-reference/variants/) · [Expo SDK 57 开发客户端](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/)

应用显示名称分别为 `lunar`、`lunar Nightly` 与 `lunar Dev`。链接协议分别为 `lunar`、`lunar-nightly` 与 `lunar-dev`，开发客户端自动协议仅由 Develop 注册。

## 首次配置

在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 添加 `EXPO_TOKEN`。对应 Expo 账号应具有项目 `523fd44d-54f4-4bde-9561-e75955b19f4d` 的访问权限。Release 上传使用任务生成的 `GITHUB_TOKEN`。

首次运行前确认 `release` 和 `nightly` 两个配置对共用包名使用相同的 EAS 托管 Android 签名凭证。交互式凭证初始化在本地完成，Actions 构建使用非交互模式。

```sh
pnpm dlx eas-cli@21.8.0 credentials --platform android
```

分别选择对应配置并检查凭证。此前分发的正式 APK 应继续使用同一 keystore，以支持覆盖安装。签名文件、密码及 `credentials.json` 保存在私密存储中。

发布配置首先提交到默认分支，再创建正式标签。Nightly 手动任务读取所选分支，执行时优先选择默认分支。GitHub 对包含相对默认分支的工作流修改的目标提交，可能要求额外的 Workflows 写入权限，任务自带令牌无法授予该权限。[GitHub Release API 权限](https://docs.github.com/en/rest/releases/releases#create-a-release)

## Changelog 组织

每个完整标签对应一个目录，目录内提供中文和英文文件：

```text
changelog/
  README.md
  v0.1.1/
    zh-CN.md
    en-US.md
  v0.2.0-rc.1/
    zh-CN.md
    en-US.md
```

单个 `CHANGELOG.md` 适合较短的单语言记录。项目采用版本目录，便于分别维护翻译、精确读取标签对应记录，后续也能增加其他语言。

两份文件随发布代码提交。脚本读取标签所指提交中的内容，按中文、英文顺序生成 Release 正文。中文放在默认折叠的 `<details>` 区域内，英文保持展开。缺少文件、内容为空或包含占位文字时，检查终止。候选版本也使用完整标签目录，正式版目录可根据最终功能重新整理。

`changelog/v0.1.1/` 提供当前版本的首版发布说明，应在创建标签前核对内容。

## Release

`.github/workflows/release.yml` 响应 `v*` 标签推送，也提供输入现有标签的手动入口。

`package.json` 的 `version` 与 `app.json` 的 `expo.version` 使用相同的 `X.Y.Z`。正式标签为 `vX.Y.Z`，预发布标签支持 `vX.Y.Z-alpha.N`、`vX.Y.Z-beta.N` 和 `vX.Y.Z-rc.N`，N 为正整数。候选版本的两个版本字段仍使用 `X.Y.Z`。

以当前版本为例，提交版本更新、发布配置和双语 changelog 后执行：

```sh
pnpm run check
pnpm run test:release
node scripts/release.mjs validate v0.1.1
git tag -a v0.1.1 -m "Lunar v0.1.1"
git push origin v0.1.1
```

任务先核对 GitHub 标签、代码版本与 changelog，再执行类型检查、测试、Lint 和 Expo 依赖检查。编译后校验 APK 包名、版本、arm64 架构、调试标记及签名。发布任务从该次运行下载附件，检查提交与摘要，再上传到 Release 草稿。所有附件上传成功并再次确认标签提交后，公开 Release。

公开附件为 `lunar-v0.1.1-android-arm64-v8a.apk`、`SHA256SUMS.txt` 与 `release.json`。正式版本按照版本号规则参与 Latest 选择；候选版本标记为 Prerelease。

发布正文末尾提供 `Full changelog` 比较链接，展示上一正式版本至当前标签的所有提交。脚本分页读取 GitHub Release，以版本号选择低于当前版本的最高正式版本，跳过草稿、Nightly 和候选版本。首次正式发布时省略比较链接；候选版本也与上一正式版本比较。

Android `versionCode` 由 EAS 远程管理，release 与 nightly 构建自动递增，重试可能消耗新的编号。实际编号记录在发布元数据中。[EAS 版本管理](https://docs.expo.dev/build-reference/app-versions/)

## Nightly 与 Develop

`.github/workflows/nightly.yml` 仅通过 `workflow_dispatch` 手动触发。在 GitHub 的 `Actions → Nightly → Run workflow` 中选择分支并启动构建。

两个构建任务使用同一提交，分别编译 Nightly 与 Develop。双方成功后，发布 `nightly-YYYYMMDD-运行编号` 标签对应的 GitHub Prerelease，提供 `lunar-nightly.apk`、`lunar-develop.apk`、`SHA256SUMS.txt` 和 `nightly.json`。Nightly 构建保留版本历史，正式版的 Latest 标记继续由 release 管理。每次手动触发执行完整构建。

Nightly 内置 JavaScript，可用于日常测试。Develop 需要检出对应提交后启动 Metro。在 PowerShell 中执行：

```powershell
$env:APP_VARIANT = 'development'
pnpm start --dev-client
```

Nightly 发布说明的中文默认折叠，英文保持展开，均包含预发布注意事项及两个 APK 的用途。Nightly 用于提前体验最新功能，安装前请备份重要书籍和数据。覆盖安装要求签名一致且 `versionCode` 满足更新条件；恢复使用正式版时，需要构建编号更高且数据格式兼容的正式版本。此前使用 `.nightly` 独立包名的安装保留原有独立数据，切换前需另行备份和迁移。

本地切换应用变体时，先重新生成原生工程：

```powershell
$env:APP_VARIANT = 'development'
pnpm exec expo prebuild --clean --platform android
pnpm android
```

`prebuild --clean` 会替换生成的 Android 目录，原生定制应保存在配置插件中。

## 失败处理与验证

上传中断时，Release 保持草稿。在附件保留期内重新执行失败的发布任务，会使用同一次运行的构建附件。重新执行全部任务会重新编译并替换该运行的 Actions 附件。Actions 附件保留七天，公开 Release 附件继续保存。

同一提交、同一标签的自动草稿支持恢复。公开 Release 和人工草稿受到保护，后续修改使用新标签发布。Nightly 重试沿用该次运行的标签，标签提交发生变化时发布检查终止。

`pnpm run test:release` 验证版本、双语 changelog、比较链接、APK 元数据、双 APK 提交和摘要一致性、草稿恢复及上传失败处理。完整 APK 编译需要 Linux 或 macOS 环境与 Expo 凭证。首次 GitHub 构建后还需验证 Nightly 与正式版的覆盖安装、数据保留，以及 Develop 的共存和启动。
