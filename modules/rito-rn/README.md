# @ritojs/react-native

`@ritojs/react-native` 为 React Native 提供 Rito 2.0.0 阅读内核的 Turbo Module 绑定。模块把 React Native 的 TypeScript 会话封装连接到 Rito 的 `rito-ffi`，并将二进制协议、原生内存管理和异步执行集中在一个可复用的程序包中。

## 模块作用

模块内部的职责分为三层：

| 层次 | 作用 |
| --- | --- |
| TypeScript | 编码和解码 Rito 2.0.0 阅读协议第 5 版与 `RITODL1` 绘制格式第 2 版，校验会话、请求和工件身份，提供 `RitoReaderSession`。 |
| 共享 C++ | 实现 `NativeRitoReader` Turbo Module、串行执行器、返回缓冲区复制与释放，以及 `bigint` 到十进制字符串的转换。 |
| Rito FFI | 调用模块内 `native/rito` 的 Rust `rito-ffi`，完成 EPUB 打开、排版、资源读取、搜索和交互计算。 |

调用关系可以概括为：

```text
ReaderRuntime
    -> RitoReaderSession
    -> NativeRitoReader Turbo Module
    -> shared C++
    -> rito-ffi
    -> Rito 2.0.0 Rust 内核
```

模块本身只负责阅读内核和原生桥接，未引入 Skia。Lunar 的转换位于 `src/reader/rito/rito-display-list.ts`，Skia 绘制位于 `src/reader/skia/rendering/primitive-renderer.ts`。绘制格式第 2 版提供设备像素图元和文字簇位置。

## 当前接口

后台推进使用 `session.advanceBackground({ sessionId, expectedVisibleArtifactId })`。Rito 2.0.0 在脚注索引完成后，通过单次调用完成全书排版，因此宿主接口省略工作量参数。原生 `RITOBGQ1` 仍要求 40 字节消息，编码器为其中遗留的 `u32` 字段提供固定正值 `1`，仅用于满足原生校验。搜索响应遵循第 5 版协议，通过 `searchedPageCount` 表达当前工件所属修订的搜索页数。

`src/index.ts` 导出以下内容：

| 分类 | 能力 |
| --- | --- |
| 会话 | 打开出版物、读取出版物信息、销毁会话。 |
| 工件 | 精确请求、相邻页面请求、邻页预览、预览提交、翻页快捷方法、前台提交、后台推进、后台提交、工件释放。 |
| 资源 | 图片、字体和其他出版物资源读取。 |
| 交互 | 搜索、文字范围几何、脚注读取。 |
| 协议 | `RITOREQ1`、`RITONAV1`、`RITOFGH1`、`RITOBGQ1`、`RITOHOF1`、`RITODL1`、`RITOART1`、`RITORES1`、`RITOPUB1`、`RITOFGA1`、`RITOBGA1`、`RITOSRQ1`、`RITOSRS1`、`RITOTRQ1`、`RITOTRG1`、`RITOFTN1`。 |

## 目录结构

| 目录或文件 | 内容 |
| --- | --- |
| `src/protocol` | Rito 2.0.0 的二进制协议、模型和编解码器。 |
| `src/session.ts` | TypeScript 会话生命周期和请求封装。 |
| `specs/NativeRitoReader.ts` | React Native Codegen 模块规范。 |
| `cpp` | Android 与 iOS 共用的 Turbo Module、执行器和缓冲区代码。 |
| `android-pure-cxx` | Android Pure C++ 自动链接使用的 CMake 目标。 |
| `ios` | CocoaPods 配置和 Objective-C++ Module Provider。 |
| `native/rito` | Rito 2.0.0 `rito-ffi` 所需的最小 Rust 工作区，包含 `rito-core` 及其依赖 crate。 |
| `scripts` | Codegen 生成脚本。 |

Android 采用 Pure C++ 自动链接，因此模块没有传统 Android Gradle 子工程，也没有 `android/` 目录。React Native 生成的 `autolinking.cpp` 负责注册 `NativeRitoReader`，CMake 目标负责加入共享 C++ 源码和 Rito 静态库。

## 平台范围

| 平台 | 当前范围 | 状态 |
| --- | --- | --- |
| Android | `arm64-v8a`，React Native 新架构，Pure C++ Turbo Module。 | 构建链验证通过。 |
| iOS | CocoaPods、Objective-C++ Provider、Rust 静态库。 | 代码框架存在，构建和设备运行待验证。 |

## 构建要求

| 工具 | 版本或要求 |
| --- | --- |
| Node.js | 22.18.0 |
| pnpm | 10.32.0 |
| JDK | 17 |
| Rust | 1.95.0 |
| `cargo-ndk` | 4.1.2 |
| CMake | 4.0.0 |
| Android NDK | 27.1.12297006 |
| Rito 源码 | 模块内 `native/rito`，来源为 `@ritojs/core@2.0.0` 标签提交 `fb6453b16a51665913464b0413e7d9a08d73fdc4`。 |

Android 构建默认使用模块内 Rust 工作区。源码更新时，设置 `RITO_SOURCE_DIR` 为相应标签的检出目录，然后同步：

```powershell
pnpm run sync:rito-native
pnpm exec expo prebuild --platform android --no-install
cd android
.\gradlew.bat :app:buildRitoFfiArm64
.\gradlew.bat :app:generateRitoCodegen :app:generateAutolinkingNewArchitectureFiles
```

`native/rito/target` 被忽略但保留在本机。Gradle 检测源码变化后由 Cargo 重新编译；设置 `RITO_FFI_REBUILD=1` 可以强制重新编译。需要使用其他 Rito 副本时，设置 `RITO_FFI_SOURCE_DIR` 覆盖默认目录。

当前应用通过根目录的 `plugins/with-rito-react-native.js` 把 Cargo 任务、Codegen 输出目录、NDK ABI 和 CMake 参数加入 Expo 生成的工程。使用发布到 npm 的程序包时，建议将这部分构建集成随程序包发布，或由宿主项目提供同等的 Expo 配置插件。

模块发布内容包含 `native/rito` 的 Rust 源码、Cargo 清单和锁定文件，安装 npm 程序包后可以在宿主工程中编译。EAS 构建通过 `scripts/eas-install-rito-toolchain.sh` 安装 Rust 1.95.0 和 `cargo-ndk`；本机的 `native/rito/target` 仍由 `.gitignore` 和 `.easignore` 排除，远程构建会在构建机上生成新的目标文件。

`rito_ffi.h` 当前缺少固定字体导出声明，模块暂时使用 `cpp/RitoPinnedFontAbi.h` 保持 ABI 对接；上游头文件补充后需要移除临时声明。
