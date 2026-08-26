# @ritojs/react-native

`@ritojs/react-native` 为 React Native 提供 Rito 1.0.0 阅读内核的 Turbo Module 绑定。模块把 React Native 的 TypeScript 会话封装连接到 Rito 的 `rito-ffi`，并将二进制协议、原生内存管理和异步执行集中在一个可复用的程序包中。

## 模块作用

模块内部的职责分为三层：

| 层次 | 作用 |
| --- | --- |
| TypeScript | 编码和解码 Rito 1.0.0 协议，校验会话、请求和工件身份，提供 `RitoReaderSession`。 |
| 共享 C++ | 实现 `NativeRitoReader` Turbo Module、串行执行器、返回缓冲区复制与释放，以及 `bigint` 到十进制字符串的转换。 |
| Rito FFI | 调用 `lib/Rito` 中的 Rust `rito-ffi`，完成 EPUB 打开、排版、资源读取、搜索和交互计算。 |

调用关系可以概括为：

```text
ReaderRuntime
    -> RitoReaderSession
    -> NativeRitoReader Turbo Module
    -> shared C++
    -> rito-ffi
    -> Rito 1.0.0 Rust 内核
```

模块本身只负责阅读内核和原生桥接，未引入 Skia。Lunar 的渲染适配位于 `src/reader/runtime/rito-native-pagination-backend.ts`，负责把 Rito DisplayList 转换为阅读界面使用的帧数据。

## 当前接口

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
| `src/protocol` | Rito 1.0.0 的二进制协议、模型和编解码器。 |
| `src/session.ts` | TypeScript 会话生命周期和请求封装。 |
| `specs/NativeRitoReader.ts` | React Native Codegen 模块规范。 |
| `cpp` | Android 与 iOS 共用的 Turbo Module、执行器和缓冲区代码。 |
| `android-pure-cxx` | Android Pure C++ 自动链接使用的 CMake 目标。 |
| `ios` | CocoaPods 配置和 Objective-C++ Module Provider。 |
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
| Rito 源码 | `lib/Rito`，提交 `3c938c0b70580da484cadfbfa86dd598fb5eec49`，对应 1.0.0 协议和 ABI。 |

Android 构建需要将 `RITO_FFI_SOURCE_DIR` 指向 Rito 源码目录：

```powershell
$env:RITO_FFI_SOURCE_DIR = 'D:\front_projects\lunar\lib\Rito'
pnpm exec expo prebuild --platform android --no-install
cd android
.\gradlew.bat :app:buildRitoFfiArm64
.\gradlew.bat :app:generateRitoCodegen :app:generateAutolinkingNewArchitectureFiles
```

当前应用通过根目录的 `plugins/with-rito-react-native.js` 把 Cargo 任务、Codegen 输出目录、NDK ABI 和 CMake 参数加入 Expo 生成的工程。使用发布到 npm 的程序包时，建议将这部分构建集成随程序包发布，或由宿主项目提供同等的 Expo 配置插件。

## 构建验证记录

| 检查项 | 平台 | 状态 | 记录 |
| --- | --- | --- | --- |
| `cargo check --manifest-path crates/rito-ffi/Cargo.toml` | Windows 宿主 | 通过 | Rito FFI Rust 源码检查完成。 |
| `cargo +1.95.0 ndk -t arm64-v8a build --release -p rito-ffi` | Android `arm64-v8a` | 通过 | 生成 `librito_ffi.a`。 |
| `pnpm run typecheck` | TypeScript | 通过 | 根项目类型检查完成。 |
| `pnpm run test` | TypeScript | 通过 | 11 个测试文件，40 项断言全部通过。 |
| Expo prebuild | Android | 通过 | Expo 配置插件可以生成原生工程。 |
| React Native Codegen | Android | 通过 | `RitoReactNativeSpec` 生成成功。 |
| Pure C++ 自动链接检查 | Android | 通过 | `isPureCxxDependency` 为 `true`，生成的 `autolinking.cpp` 包含 `NativeRitoReader` provider。 |
| C++ arm64 语法检查 | Android `arm64-v8a` | 通过 | `NativeRitoReader.cpp`、`RitoExecutor.cpp` 和 `RitoOwnedBuffer.cpp` 使用 Android NDK 编译器检查通过。 |
| 独立 CMake 配置与目标编译 | Android `arm64-v8a` | 通过 | `rito_react_native` 目标包含共享 C++ 和 Rito FFI 静态库。 |
| `:app:assembleDebug` | Android | 环境限制 | Rito 原生目标可以编译；应用整体构建受到 Windows 文件名长度限制以及现有第三方模块重复生成的影响。 |
| Android 设备打开测试 EPUB 并绘制首帧 | Android `arm64-v8a` | 待验证 | 需要在设备上完成会话创建、资源读取和页面绘制检查。 |
| CocoaPods、Xcode、iOS Rust 目标 | iOS | 待验证 | 当前开发机未完成 Apple 工具链检查。 |

## 与 `rito_flutter` 的差异

`rito_flutter` 包含较完整的 Flutter 阅读会话层、字体注册、图片缓存、工件资源准备、邻页预览与提交、后台候选管理以及 Flutter Canvas 绘制辅助。React Native 模块目前覆盖协议和原生桥接的主要部分，差异集中在宿主层能力：

| 能力 | React Native 模块 | `rito_flutter` 对应能力 |
| --- | --- | --- |
| 协议编解码 | 覆盖 Rito 1.0.0 的核心请求、响应和 DisplayList。 | 同等协议覆盖，并提供 Flutter 模型。 |
| 精确定位与相邻请求 | `requestArtifact`、`requestAdjacent`、`peekAdjacent`、`commitPeekedArtifact`、`turn` 可用。 | 具有 `peek`、`turn`，支持预览后零排版提交。 |
| 前台与后台 | 提供原生调用、候选提交和 Lunar 后台分页适配。 | `advanceBackground` 与 `adoptBackground` 具有完整候选生命周期管理。 |
| 字体 | 支持固定字体参数传入；Lunar 读取内置字体。 | 进程级字体缓存、字体声明校验、并发准备和 Flutter 注册已经存在。 |
| 图片 | Rito 资源读取和 DisplayList `sourceRect` 转换已经存在。 | 图片缓存、引用计数、租约和预算管理已经存在。 |
| 搜索、文字几何、脚注 | 提供协议和会话方法。 | Flutter 层提供相同调用，并连接阅读 UI。 |
| 绘制适配 | 输出转换为 Lunar `ReaderRenderFrame`，由应用渲染层处理。 | Flutter 侧包含 Canvas 绘制、背景平铺和资源准备辅助。 |
| 资源生命周期 | 提供基础工件释放和会话销毁。 | 对候选工件、图片租约和字体资源有更完整的生命周期约束。 |

## 本次补充

| 能力 | 状态 | 内容 |
| --- | --- | --- |
| 邻页预览和翻页快捷方法 | 完成 | TypeScript 会话提供 `peekAdjacent`、`commitPeekedArtifact` 和 `turn`，原生层加入对应 Rito FFI 调用。 |
| 预览工件释放 | 完成 | 新的前台请求会清理旧预览，提交前台或后台工件时会释放其余预览。 |
| 资源读取去重 | 完成 | 同一工件、类型和资源地址的并发读取共享一个 Promise，工件释放时清理缓存。 |
| 字体声明检查 | 部分完成 | 读取登记工件的字体资源时校验字节长度；字体注册缓存仍由阅读层负责。 |
| 前台请求最新优先 | 部分完成 | 会话识别较旧的返回工件并释放，原生队列仍负责请求替换和执行顺序。 |

## 未完成部分

以下事项仍需补充，按优先级排列：

1. 完善前台导航与后台分页的并发控制，包括候选工件淘汰、释放时序和会话失效后的统一处理。
2. 增加 React Native 侧字体注册缓存，覆盖字体族、字重、字节长度和指纹校验。
3. 增加图片缓存、租约和内存预算管理，保证页面切换期间的资源仍由可见工件持有。
4. 补足 DisplayList 的扩展绘制类型，例如更多颜色空间、边框样式、重复贴图方式和四角半径。
5. 完善出版物适配层，包括目录解析、章节定位、总页数和排版进度数据的应用接口。
6. 补充搜索结果到阅读界面的高亮、脚注展示和文字选择交互。
7. 增加协议夹具、原生内存释放、会话销毁、并发请求和设备首帧绘制测试。

## 后续事项

8. 完成 iOS CocoaPods、Rust 静态库、模拟器与真机验证；Android 其他 ABI 仍按后续平台范围另行安排。
9. 将 `RITO_FFI_SOURCE_DIR` 所需的 Rust 构建任务整理为程序包自带的发布方案，并为 npm 使用场景提供无需修改宿主工程源码的配置方式。
10. `rito_ffi.h` 当前缺少固定字体导出声明，模块暂时使用 `cpp/RitoPinnedFontAbi.h` 保持 ABI 对接；上游头文件补充后需要移除临时声明。

完成上述事项后，React Native 侧的会话能力、资源管理和页面交互可以达到 `rito_flutter` 的主要功能范围，Lunar 的 Skia 绘制仍保持在应用层。
