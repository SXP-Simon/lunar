# Rito React Native 原生桥接设计

## 1. 文档状态

| 字段 | 内容 |
| --- | --- |
| 目标程序包 | `@ritojs/react-native` |
| Lunar 内部目录 | `modules/rito-rn` |
| Rito 主仓库建议目录 | `packages/rito_react_native` |
| 目标 Rito ABI | `rito-ffi` V1 |
| 目标 React Native | `0.86.x` |
| 目标 Expo | SDK 57 |
| 目标平台 | Android `arm64-v8a`（当前）与 iOS（设计） |
| 绘制后端 | React Native Skia |

本文定义 Rito Rust Runtime 在 React Native 中的原生桥接方式。首个实现放在 Lunar 中完成双平台验证，验证完成后整理为独立程序包，提交至 Rito 主仓库。

### 1.1 实施状态

| 范围 | 状态 | 说明 |
| --- | --- | --- |
| `modules/rito-rn` 程序包 | 完成 | 包元数据、Codegen 配置、Turbo Module 规范、TypeScript 入口与本地依赖均已加入。 |
| C++ FFI 基础层 | 完成 | 串行执行器、输出缓冲区复制与释放、64 位标识校验、固定字体 ABI 声明和 V1 C ABI 调用均已加入。 |
| Android 与 iOS 工程文件 | Android arm64 Pure C++ 完成 | Android 已采用 RN Pure C++ 自动链接，Expo 插件负责 arm64 Rust FFI 和 Codegen 任务；应用整体构建仍受现有依赖的 Windows 长路径问题影响，iOS 工具链尚待验证。 |
| TypeScript 二进制基础 | 完成 | little-endian 读写器、64 位标识、`RITOREQ1`、`RITONAV1` 和 `RITODL1` 已实现并具备单元测试。 |
| Rito 页面工件协议 | V1 基础完成 | `RITOART1`、`RITOPUB1`、`RITORES1`、前后台确认、搜索、脚注和文字范围消息已加入严格 TypeScript 解码器及 Turbo Module 调用。 |
| Lunar Skia 适配 | 基础后端完成 | RITODL1 命令转换、图片 `sourceRect` 绘制、命中区域和语义节点已加入 `ReaderRenderFrame`；完整颜色空间、复杂边框、复杂阴影和多页面资源缓存仍待完善。 |
| ReaderRuntime 切换 | Rito 优先并保留回退 | 应用运行时已优先尝试 `RitoNativePaginationBackend`，原有 Worklet 与本地后端作为回退；`with-rito-react-native` 配置插件负责生成 Pure C++ 原生构建参数。 |

本轮验证通过 `pnpm run typecheck`、`pnpm run test`、桥接范围 TypeScript 检查和 React Native Android Codegen。项目测试包含 10 个文件与 38 项断言。根目录 `tsconfig.json` 将 `lib/Rito` 作为外部参考源码排除，避免把独立 Web workspace 的依赖纳入 Lunar 检查。

### 1.2 2026-08-26 环境核验

`lib/Rito` 已固定在提交 `3c938c0b70580da484cadfbfa86dd598fb5eec49`，同时带有 `@ritojs/core@1.0.0`、`@ritojs/react@1.0.0` 与 `@ritojs/kit@1.0.0` 标签。该源码是本桥接程序包的 ABI 和二进制协议依据。

Windows 开发机已安装 Node.js 22.18.0、pnpm 10.32.0、JDK 17、CMake 4.0.0、Rust 1.95.0、`cargo-ndk` 4.1.2，以及 Android `arm64-v8a` Rust 目标。Android SDK 使用 NDK 27.1.12297006，应用的 Gradle 配置也采用该版本；一台 Android 设备已经通过 ADB 连接。

已验证的命令包括：

1. `rustup run 1.95.0-x86_64-pc-windows-gnu cargo check --manifest-path crates/rito-ffi/Cargo.toml`。
2. `cargo +1.95.0 ndk -t arm64-v8a ... build --release -p rito-ffi`。
3. `android/gradlew.bat :app:generateRitoCodegen :app:generateAutolinkingNewArchitectureFiles`。
4. `android/gradlew.bat :app:configureCMakeDebug[arm64-v8a]`（受现有依赖的 Windows 长路径问题影响时，保留配置日志作为检查依据）。

独立 CMake 检查已经使用 NDK 27.1 的 `arm64-v8a` 工具链编译 `rito_react_native` 共享库，包含 `NativeRitoReader.cpp`、Rito FFI 静态库和生成的 Codegen 目标。

Rito FFI 的宿主检查和 Android `arm64-v8a` 发布编译均已通过。Flutter 程序包文档列出的 NDK 28.2 尚未安装；当前 NDK 27.1 已完成 arm64 编译，发布环境仍应安装 28.2 或取得上游对 27.1 的兼容性确认。

当前开发构建尚有三项工程修正事项：

1. `crates/rito-ffi/include/rito_ffi.h` 未声明已导出的 `rito_open_with_pinned_fonts_v1` 和 `rito_pinned_font_face_v1`。`modules/rito-rn/cpp/RitoPinnedFontAbi.h` 依据 Rust 的 `#[repr(C)]` 定义提供临时声明，Rito 主仓库应补充公开头文件。
2. `cargo-ndk -o` 主要生成 ABI 共享库，桥接层需要静态库参与 C++ 链接。Gradle 任务现已从 Rust target 目录复制 `librito_ffi.a` 到模块构建目录，CMake 可以完成静态链接。
3. `react-native.config.js` 已使用 `cxxModuleCMakeListsModuleName`、`cxxModuleCMakeListsPath` 和 `cxxModuleHeaderName`。Expo 插件在生成工程时加入 arm64 Rust FFI、Codegen 和 CMake 参数，RN 自动生成的 `autolinking.cpp` 已包含 `NativeRitoReader` provider。

Windows 环境无法验证 CocoaPods、Xcode、iOS Rust 目标和 iOS 真机运行。Android 模块编译已经通过，本机可以继续会话层、后台分页和应用层接入开发。

## 2. 背景

Lunar 目前固定使用 `@ritojs/core@0.13.0`。Rito TypeScript 内核在 Worklet Runtime 中执行 EPUB 解析、CSS 计算与分页，`lunar-pagination-worker` 提供 EPUB 文件访问、系统字体测量和 Worklet Runtime 安装。

Rito 1.0.0 将生产阅读内核迁移到 Rust，并通过 `rito-ffi` 暴露版本化 C ABI。新版阅读模型围绕会话、页面工件、资源所有权、候选提交和后台分页构建。浏览器程序包使用 WASM 与 Worker，Flutter 程序包使用 Dart FFI 与后台 Isolate。

React Native 版本采用 Pure C++ Turbo Module 连接 `rito-ffi`，使用 TypeScript 实现版本化二进制协议编解码与宿主会话封装，使用 Lunar 的 React Native Skia 绘制层重放 `RITODL1`。

### 2.1 方案选择

本实现采用 Pure C++ Turbo Module。Rito 会话逻辑、C ABI 调用、线程执行器和数据转换只维护一份 C++ 代码；Android 仅保留 Expo 配置插件、Cargo 任务和 CMake 文件，iOS 继续使用 CocoaPods 与 Objective-C++ provider 完成宿主注册。两端的差异集中在 Rust 静态库生成和构建系统，阅读协议与模块实现保持共享。

## 3. 设计目标

### 3.1 功能目标

1. 在 Android 与 iOS 中编译并链接 `rito-ffi`。
2. 通过 Turbo Module 提供异步、类型化的 Rust 阅读会话接口。
3. 支持 EPUB 打开、出版物信息读取、定位、相邻翻页、重排和后台分页。
4. 支持页面工件准备、可见候选提交、旧工件释放和会话销毁。
5. 支持图片、字体与样式资源读取。
6. 解码 `RITOART1`、`RITODL1`、`RITOPUB1`、`RITORES1` 及相关请求和确认消息。
7. 将 Rito V1 页面工件转换为 Lunar 自有阅读契约。
8. 使用 React Native Skia 绘制页面，同时保留命中区域、语义节点和原文定位信息。
9. 形成可独立发布的 `@ritojs/react-native` 程序包。

### 3.2 工程目标

1. Rito 版本差异继续由 `src/reader/rito/rito-adapter.ts` 管理。
2. `src/reader` 的公开契约保持界面无关。
3. `@ritojs/react-native` 保持绘制后端无关，不依赖 React Native Skia。
4. Rust FFI 调用在原生执行线程中运行，JavaScript Runtime 只处理请求调度、协议解码和应用状态。
5. 大型二进制数据使用 `ArrayBuffer` 或 `Uint8Array` 传递，避免数字数组与 Base64。
6. 每个原生输出缓冲区具有唯一释放责任。
7. 会话、工件、字体、图片和缓存具有明确的所有者与释放时机。

## 4. 范围界定

### 4.1 rito-rn 负责的内容

| 范围 | 职责 |
| --- | --- |
| Rust 构建 | 为 Android 与 iOS 构建 `rito-ffi` |
| C ABI 封装 | 调用 `rito_open_with_pinned_fonts_v1` 等 V1 函数 |
| 原生调度 | 在专属执行线程上调用阻塞式 FFI |
| 缓冲区管理 | 复制输出并调用 `rito_buffer_free_v1` |
| Turbo Module | 通过 Codegen 向 JavaScript 提供类型接口 |
| 协议实现 | 编码请求并解码 Rito V1 响应 |
| 会话封装 | 提供页面准备、提交、释放和销毁语义 |
| 固定错误 | 将 ABI 状态转换为 TypeScript 错误类型 |

### 4.2 Lunar 负责的内容

| 范围 | 职责 |
| --- | --- |
| 阅读内核适配 | 把 Rito V1 类型转换为 Lunar 契约 |
| 字体选择 | 提供应用许可范围内的固定字体文件与摘要 |
| 图片解码 | 使用 React Native Skia 解码图片资源 |
| 页面绘制 | 使用 Skia 重放 DisplayList |
| 页面交互 | 使用工件中的命中区域与语义数据 |
| 产品状态 | 保存 ReaderLocator、主题、排版和当前页面状态 |
| 缓存策略 | 管理 Skia 图片、字体、Picture 与页面工件缓存 |

### 4.3 rito-rn 排除的内容

`@ritojs/react-native` 不包含产品界面、路由、数据库、书库管理和业务状态。程序包也不绑定 React Native Skia，使其他绘制实现能够复用相同的 Rust 会话和协议类型。

## 5. 总体结构

```text
ReaderScreen
    │
    ▼
NativeReaderRuntime
    │
    ▼
RitoNativeReaderBackend
    │
    ▼
src/reader/rito/rito-adapter.ts
    │
    ▼
@ritojs/react-native
    ├── TypeScript session
    ├── request encoders
    ├── response decoders
    └── NativeRitoReader Turbo Module
             │
             ▼
      shared C++ binding
             │
             ▼
          rito-ffi
             │
             ▼
      Rito Rust actor thread

RitoPreparedArtifact
    │
    ▼
Lunar ReaderRenderFrame
    │
    ▼
SkiaDisplayListRenderer
```

Turbo Module 负责原生能力和二进制交换。TypeScript 会话层负责协议语义。Lunar Adapter 负责版本隔离。Skia 只接收 Lunar 自有 DisplayList、字体和图片对象。

## 6. 程序包目录

Lunar 内部实现采用以下结构：

```text
modules/rito-rn/
  package.json
  react-native.config.js
  specs/
    NativeRitoReader.ts
  cpp/
    NativeRitoReader.h
    NativeRitoReader.cpp
    RitoExecutor.h
    RitoExecutor.cpp
    RitoOwnedBuffer.h
    RitoOwnedBuffer.cpp
    RitoInt64.h
  android-pure-cxx/
    CMakeLists.txt
  scripts/
    generate-codegen.mjs
  ios/
    RitoReactNative.podspec
    NativeRitoReaderProvider.h
    NativeRitoReaderProvider.mm
  rust/
    Cargo.lock
    Cargo.toml
    source/
  src/
    index.ts
    errors.ts
    native.ts
    protocol/
      binary-reader.ts
      binary-writer.ts
      wire-message.ts
      request-encoder.ts
      adjacent-encoder.ts
      foreground-encoder.ts
      background-encoder.ts
      artifact-decoder.ts
      display-list-decoder.ts
      publication-decoder.ts
      resource-decoder.ts
    session/
      reader-session.ts
      prepared-artifact.ts
      pending-open.ts
      pending-adjacent.ts
      resource-preparer.ts
```

提交至 Rito 主仓库时，Rust 源码可以使用仓库 Cargo workspace。发布程序包需要包含固定提交对应的 Rust 源码集合，使使用方无需检出 Rito 仓库。

## 7. Turbo Module 接口

> 实施状态：程序包元数据、Codegen 规范、TypeScript 包装器和共享 C++ 实现已经加入。Android `arm64-v8a` Pure C++ 自动链接、Codegen 生成、Rust 静态库生成和 CMake 目标配置已经通过，iOS 构建仍待验证。

### 7.1 Codegen 配置

`package.json` 使用独立 Codegen 配置：

```json
{
  "codegenConfig": {
    "name": "RitoReactNativeSpec",
    "type": "modules",
    "jsSrcsDir": "specs",
    "android": {
      "javaPackageName": "com.ritojs.reactnative"
    },
    "ios": {
      "modulesProvider": {
        "NativeRitoReader": "NativeRitoReaderProvider"
      }
    }
  }
}
```

规范文件必须采用 `Native` 前缀，模块通过 `TurboModuleRegistry.getEnforcing` 获取。

### 7.2 TypeScript 规范

以下接口描述目标形式。二进制类型需要依据 React Native 0.86 Codegen 生成结果确定 Bridging 特化；公开 TypeScript API 始终使用 `Uint8Array`。

```ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface NativePinnedFontFace {
  readonly bytes: ArrayBuffer;
  readonly expectedSha256: string;
  readonly genericRole: number;
  readonly language?: string;
}

export interface NativeBufferResult {
  readonly status: number;
  readonly data: ArrayBuffer;
  readonly error: string;
}

export interface Spec extends TurboModule {
  open(
    publication: ArrayBuffer,
    request: ArrayBuffer,
    fonts: readonly NativePinnedFontFace[],
  ): Promise<NativeBufferResult>;

  readPublication(sessionId: string): Promise<NativeBufferResult>;

  requestArtifact(
    sessionId: string,
    request: ArrayBuffer,
  ): Promise<NativeBufferResult>;

  requestAdjacent(
    sessionId: string,
    request: ArrayBuffer,
  ): Promise<NativeBufferResult>;

  adoptForeground(
    sessionId: string,
    request: ArrayBuffer,
  ): Promise<NativeBufferResult>;

  advanceBackground(
    sessionId: string,
    request: ArrayBuffer,
  ): Promise<NativeBufferResult>;

  adoptBackground(
    sessionId: string,
    request: ArrayBuffer,
  ): Promise<NativeBufferResult>;

  readResource(
    sessionId: string,
    artifactId: string,
    kind: number,
    href: string,
  ): Promise<NativeBufferResult>;

  releaseArtifact(
    sessionId: string,
    artifactId: string,
  ): Promise<NativeBufferResult>;

  dispose(sessionId: string): Promise<NativeBufferResult>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeRitoReader');
```

### 7.3 64 位标识

Rito 的 `sessionId`、`requestId`、`revisionId` 和 `artifactId` 使用 `1..=INT64_MAX`。JavaScript `number` 无法完整表示该范围，因此 Turbo Module 边界使用十进制字符串。C++ 通过自定义 Bridging 将字符串解析为 `uint64_t`，并拒绝负数、零、溢出和非十进制输入。

TypeScript 协议模型内部可以使用 `bigint`。React Native Codegen 规范中继续使用字符串，避免依赖尚未通用支持的原生 64 位数值映射。

### 7.4 二进制传输

React Native 0.86 的 JSI 支持 ArrayBuffer、TypedArray 与 Uint8Array。C++ 模块应把 `rito_owned_buffer_v1` 复制到 JSI 管理的缓冲区，然后立即释放 Rito 缓冲区。

每次输出遵守以下规则：

1. 输出描述符在调用前清零。
2. 状态码为成功时复制数据缓冲区。
3. 状态码为失败时复制 UTF-8 错误缓冲区。
4. 两个缓冲区都通过 `rito_buffer_free_v1` 释放。
5. Promise 只持有 JSI 缓冲区或宿主管理的 C++ 字节数组。
6. 原生任务完成后通过 `CallInvoker` 返回 JavaScript Runtime。

## 8. 原生线程模型

> 实施状态：`RitoExecutor` 已实现为串行原生执行器，`RitoOwnedBuffer` 已实现输出复制和 `rito_buffer_free_v1` 释放；Android `arm64-v8a` 已完成编译验证，设备线程行为和销毁时序测试仍待补充。

`rito-ffi` 为每个阅读会话创建专属 Rust actor thread。C ABI 函数会等待 actor 返回对应结果，因此 Turbo Module 还需要一个宿主执行器，防止等待过程占用 JavaScript 线程。

### 8.1 RitoExecutor

`RitoExecutor` 使用单一串行线程和有界任务队列。任务包含操作类型、会话标识、输入字节和 Promise 回调。串行执行保持调用顺序，并简化候选提交、释放与销毁的先后关系。

任务状态包括：

| 状态 | 含义 |
| --- | --- |
| queued | 等待原生执行 |
| running | 正在调用 FFI |
| completed | 已复制输出并释放 Rito 缓冲区 |
| superseded | 被更新的前台请求替代 |
| disposed | 会话销毁后取消返回 |

Rito 已经限制每个会话的在途操作数量。宿主队列需要在进入 FFI 前进行额外限制，避免短时间内创建大量等待任务。

### 8.2 Promise 返回

所有可能执行分页、资源读取和会话销毁的操作返回 Promise。参数校验可以同步完成，FFI 调用始终进入原生执行器。Promise 的完成回调只在 JavaScript Runtime 有效且模块仍存活时执行。

### 8.3 模块销毁

模块销毁时依次执行：

1. 停止接受新任务。
2. 标记等待任务为 disposed。
3. 对已知会话调用 `rito_dispose_v1`。
4. 等待原生执行器退出。
5. 清理 C++ 会话表和回调引用。

## 9. Rust 构建与打包

> 实施状态：Android `arm64-v8a` 的 Rito FFI 发布编译、Codegen、Pure C++ CMake 目标和 RN 自动 provider 生成已经通过。Expo 配置插件已加入构建参数；应用整体构建仍受现有依赖的 Windows 长路径问题影响，iOS 构建等待后续验证。

### 9.1 Rust 依赖

Rust 工具链、Cargo.lock、NDK 和平台目标必须固定。首个实现应采用 Rito 仓库声明的 Rust 版本，并在 CI 中验证 Android 与 iOS 构建。

### 9.2 Android

Android 应用使用 Gradle 与 CMake，`rito-rn` 作为 Pure C++ 自动链接依赖参与应用的原生目标：

1. Expo 插件注册 arm64 Cargo 任务和 Codegen 生成任务。
2. Cargo 构建 `rito-ffi` 静态库，输出复制到应用构建目录。
3. Pure C++ CMake 目标导入静态库、React Native JSI 和 fbjni。
4. RN 自动生成 `Android-autolinking.cmake` 与 `autolinking.cpp`，注册 `NativeRitoReader`。

当前 Android 原生配置检查命令为：

```powershell
$env:RITO_FFI_SOURCE_DIR = 'D:\front_projects\lunar\lib\Rito'
cd android
.\gradlew.bat :app:generateRitoCodegen :app:generateAutolinkingNewArchitectureFiles
.\gradlew.bat :app:configureCMakeDebug[arm64-v8a]
```

当前 Android 范围限定为 `arm64-v8a`。增加其他 ABI 时，需要同时加入 Rust target、Cargo 任务、静态库输出和 CMake 校验。

### 9.3 iOS

iOS 使用 CocoaPods 与 Cargo：

1. Pod 构建脚本按目标平台和架构调用 Cargo。
2. 生成设备和模拟器静态库。
3. Podspec 引入 `rito_ffi.h`、共享 C++ 代码和生成库。
4. Objective-C++ Module Provider 注册 Pure C++ Turbo Module。
5. Xcode 构建阶段执行 React Native Codegen。

需要覆盖 iOS arm64 设备、arm64 模拟器和 x86_64 模拟器。构建缓存键包含 Rust 提交、Cargo.lock、目标三元组、配置和工具链版本。

### 9.4 Expo

Lunar 当前启用 React Native New Architecture，Turbo Module 可以随 Expo Development Build 使用。该模块包含原生二进制，因此 Expo Go 无法加载。修改原生代码、Rust 代码或 Codegen 规范后需要重新生成原生工程并构建开发客户端。

## 10. TypeScript 协议层

> 实施状态：二进制读写器、`RITOREQ1`、`RITONAV1`、`RITODL1`、`RITOART1`、`RITOPUB1`、`RITORES1`、前后台确认、搜索、脚注和文字范围消息已经实现。

协议层参考 `rito_flutter/lib/src/protocol`，同时以 Rito Rust 编解码测试为依据。TypeScript 实现只处理明确列出的 V1 消息，不提供通用键值树解析。

### 10.1 请求消息

| 消息 | 用途 |
| --- | --- |
| `RITOREQ1` | 打开、定位和重排 |
| `RITONAV1` | 相邻页面请求 |
| `RITOFGH1` | 前台候选提交 |
| `RITOBGQ1` | 后台分页量子 |
| `RITOHOF1` | 后台候选提交 |
| `RITOSRQ1` | 搜索请求 |
| `RITOTRQ1` | 文字范围几何请求 |

编码器采用 little-endian 固定宽度字段、长度前缀 UTF-8 字符串和严格范围校验。请求编码测试需要覆盖空字符串、超长数据、错误枚举值、64 位标识和可选字段。

### 10.2 响应消息

| 消息 | 用途 |
| --- | --- |
| `RITOART1` | 页面工件 |
| `RITODL1` | DisplayList |
| `RITOPUB1` | 出版物元数据、书脊和目录 |
| `RITORES1` | 图片、字体或样式资源 |
| `RITOFGA1` | 前台提交确认 |
| `RITOBGA1` | 后台分页结果 |
| `RITOHOA1` | 后台提交确认 |
| `RITOSRS1` | 搜索响应 |
| `RITOTRG1` | 文字范围几何响应 |
| `RITOFTN1` | 脚注响应 |

解码器必须验证消息标识、协议版本、声明长度、命令数量、字段范围和缓冲区尾部。未知 opcode、未知枚举、长度越界和多余数据统一产生固定协议错误。

### 10.3 共享测试数据

从 Rito 主仓库引用或复制固定版本的协议测试数据。React Native 解码结果需要与 Rust 和 Flutter 解码结果一致。升级 Rito ABI 时先更新测试数据，再更新 TypeScript 模型和 Lunar Adapter。

## 11. 会话封装

> 实施状态：`RitoReaderSession` 已实现低层会话封装、严格身份检查、候选工件保留、继续请求、前后台确认、资源读取、工件释放和销毁。`RitoNativePaginationBackend` 已接入固定字体、图片资源、命中区域、语义节点和后台分页量子。

低层 Turbo Module 只映射 C ABI。应用使用 `RitoReaderSession`，其职责与 Flutter 的 `RitoReaderSession` 保持一致。

```ts
export interface RitoReaderSession {
  readonly sessionId: bigint;
  readonly firstArtifact: RitoPreparedArtifact;
  readonly visibleArtifactId: bigint;
  readonly nextRequestId: bigint;

  readPublication(): Promise<RitoPublication>;
  peekAdjacent(request: RitoAdjacentRequest): Promise<RitoPreparedArtifact | undefined>;
  turn(request: RitoAdjacentRequest): Promise<RitoPreparedArtifact | undefined>;
  requestArtifact(request: RitoArtifactRequest): Promise<RitoPreparedArtifact>;
  advanceBackground(request: RitoBackgroundRequest): Promise<RitoBackgroundAdvance>;
  readResource(
    artifact: RitoPreparedArtifact,
    resource: RitoResourceRef,
  ): Promise<RitoResource>;
  releaseArtifact(artifact: RitoPreparedArtifact): Promise<void>;
  dispose(): Promise<void>;
}
```

### 11.1 Prepared Artifact

FFI 返回的是候选工件。会话层只有在以下步骤完成后才创建 `RitoPreparedArtifact`：

1. 解码并验证 `RITOART1`。
2. 读取并注册工件声明的字体。
3. 读取并解码当前页面所需图片。
4. 验证请求仍是当前前台请求。
5. 调用前台候选提交函数。
6. 验证返回的可见工件标识。

绘制接口只接受 `RitoPreparedArtifact`。候选准备失败时释放候选工件，并保留原可见工件。

### 11.2 页面切换

页面切换期间同时保留当前工件和目标工件。动画结束后释放被替换工件。预取工件需要独立持有，在取消翻页时释放。当前可见工件不能由宿主主动释放，只能在成功提交替代工件或销毁会话后结束所有权。

### 11.3 定位与重排

定位和版面变化使用 `requestArtifact`。新的前台请求替代较早的等待请求。`RITO_STATUS_EXACT_SEEK_PENDING_V1` 表示精确定位需要继续执行分页量子；会话层使用更新的 requestId 继续同一意图，直到取得工件、目标终止或请求被替代。

### 11.4 后台分页

后台分页由宿主按量调用 `advanceBackground`。每次调用只执行一个 Rito 量子。后台候选不会自动替换可见页面；宿主检查候选是否保持当前阅读内容，再决定提交或释放。

## 12. 字体与图片

### 12.1 固定字体策略

Rito Rust Runtime 使用真实字体字节完成文字塑形。Lunar 需要提供固定字体策略，至少包含适合主要内容语言的 serif 字体。

每个字体项包含：

| 字段 | 内容 |
| --- | --- |
| bytes | TTF 或 OTF 字节 |
| expectedSha256 | 构建阶段记录的完整 SHA-256 |
| genericRole | serif、sansSerif 或 monospace |
| language | 可选 BCP 47 标签 |

`@ritojs/react-native` 不附带默认字体。字体许可、选择和分发由宿主应用负责。Lunar 可以继续使用现有的 LXGW WenKai 字体，但需要验证其字体格式、摘要和中英文覆盖范围。

### 12.2 字体注册

工件中的字体引用包含 family、style、weight、shapeFingerprint 和字节长度。字体缓存以 family 和 shapeFingerprint 作为主键，读取资源后注册到 Skia FontMgr 或 TypefaceFontProvider。失败项从缓存中移除，使后续工件可以重新尝试。

Rust 排版和 Skia 绘制必须使用同一字体字节。Skia 找不到工件声明字体时，页面进入明确错误状态，避免使用其他系统字体产生不同分页几何。

### 12.3 图片资源

工件中的图片引用按 artifactId、kind 和 href 读取。href 保留原始大小写和相对形式。Skia 图片缓存按资源内容和工件所有权管理，页面绘制期间不得执行文件读取或图片解码。

工件释放后，只有仍被其他页面租约引用的图片可以继续保留。图片缓存继续遵守 Lunar 的字节预算和最近使用顺序策略。

## 13. Lunar 阅读内核调整

> 实施状态：`src/reader/rito/rito-v1-display-list.ts` 和 `RitoNativePaginationBackend` 已加入。后端可以从 EPUB ZIP 中发现首个 XHTML 条目、准备应用固定字体、读取出版物、准备图片资源、转换首帧并请求相邻候选。

### 13.1 新增原生后端

新增 `RitoNativeReaderBackend`，替代当前 `WorkletPaginationBackend`。该后端通过 `rito-adapter.ts` 使用 `@ritojs/react-native`，并把 Rito 工件转换为 Lunar 的阅读对象。

```text
src/reader/
  rito/
    rito-adapter.ts
    rito-v1-display-list.ts
    rito-v1-locator.ts
    rito-v1-publication.ts
  runtime/
    rito-native-reader-backend.ts
    reader-artifact-session.ts
```

所有 `@ritojs/react-native` 引用都由 `src/reader/rito` 管理。Runtime 只依赖 Lunar 自有的 `ReaderArtifactSession`。

### 13.2 后端契约变化

现有 `ReaderPaginationBackend` 面向全书页码与 spreadIndex。Rito V1 面向局部页面工件和原文定位，因此需要采用工件会话契约：

```ts
export interface ReaderArtifactSession {
  open(request: ReaderOpenRequest): Promise<ReaderPreparedArtifact>;
  peekAdjacent(direction: ReaderDirection): Promise<ReaderPreparedArtifact | undefined>;
  turn(direction: ReaderDirection): Promise<ReaderPreparedArtifact | undefined>;
  seek(locator: ReaderLocator): Promise<ReaderPreparedArtifact>;
  reflow(layout: ReaderLayoutRequest): Promise<ReaderPreparedArtifact>;
  advanceBackground(): Promise<ReaderBackgroundAdvance>;
  readResource(resource: ReaderResourceRef): Promise<Uint8Array>;
  release(artifactId: string): Promise<void>;
  close(): Promise<void>;
}
```

`NativeReaderRuntime` 负责把会话事件转换为产品状态，并保存当前可见工件、待显示工件、阅读定位和后台分页进度。

### 13.3 缓存标识

页面 Picture 和资源缓存使用以下标识：

```text
bookSha256
+ ritoAbiVersion
+ rendererVersion
+ sessionId
+ revisionId
+ revisionVersion
+ artifactId
```

阅读进度持久化使用 `ReaderLocator`。pageIndex 和 spreadIndex 只代表当前 revision 的投影，不作为跨会话持久化位置。

### 13.4 旧模块移除条件

满足以下条件后移除 `modules/lunar-pagination-worker`：

1. Android 与 iOS 都能打开测试 EPUB 并绘制首个页面工件。
2. 相邻翻页、目录定位、字体大小变化和横竖屏变化通过设备测试。
3. 图片、内嵌字体和固定字体均能正确释放。
4. 连续打开关闭测试没有持续内存增长。
5. Rust 与 Skia 页面比较处于允许范围。
6. Rito V1 错误状态和请求替代行为具有自动测试。
7. 产品界面只使用新的工件会话后端。

之后删除 Worklet Runtime 安装、原生文字测量、旧 TypeScript Rito Adapter、旧分页后备实现及 `@ritojs/core@0.13.0`。

## 14. Skia DisplayList 适配

> 实施状态：基础命令转换、`paint-image.sourceRect`、原生后端首帧编译、命中区域和语义节点已经加入。扩展颜色空间、per-corner 半径、复杂背景重复、复杂边框和 inset 阴影进入后续实现。

现有 Skia 执行器可以保留主要绘制能力，但输入需要转换为 Rito V1 命令。

| RITODL1 命令 | Lunar 命令 | Skia 操作 |
| --- | --- | --- |
| push-state | pushState | `canvas.save()` |
| pop-state | popState | `canvas.restore()` |
| translate | translate | `canvas.translate()` |
| opacity | opacity | 更新当前 alpha |
| transform | transform | 平移、旋转和缩放 |
| clip-rect | clipRect | `clipRect` 或 `clipRRect` |
| paint-page | paintPage | 页面背景 |
| paint-block | paintBlock | 背景、边框和阴影 |
| paint-text | paintText | Skia Paragraph |
| paint-ruby | paintRuby | 注音文字 |
| paint-image | paintImage | 图片或 sourceRect 子区域 |
| paint-horizontal-rule | paintHorizontalRule | 水平线 |

### 14.1 颜色

Rito V1 使用带颜色空间和分量的结构，不再以 CSS 字符串传递颜色。Adapter 负责把支持的颜色空间转换为 Skia 可接受的颜色值。透明度需要与命令状态 alpha 相乘。

首版至少覆盖 sRGB。其他颜色空间需要使用规范转换公式，并通过 Rito Web Canvas 与 React Native Skia 比较测试。

### 14.2 文字

首版使用 `platform-string-runs`。文字绘制需要采用工件声明的 family、weight、style、sizePx、letterSpacingPx 和 wordSpacingPx。工件提供的矩形和行高决定页面几何，Skia Paragraph 只负责字形绘制。

### 14.3 图片

`paint-image` 的 `sourceRect` 存在时，Skia 从源图子区域采样。背景图片的 size、repeat 和 position 需要使用与 Flutter Canvas pen 相同的规则。

### 14.4 不支持能力

遇到当前 Skia 执行器尚未实现的命令、颜色空间、边框或阴影时，页面返回明确渲染错误。执行器在绘制前完成命令能力检查，避免生成部分页面。

## 15. 错误模型

### 15.1 原生状态

| ABI 状态 | TypeScript 错误 |
| --- | --- |
| INVALID_ARGUMENT | `RitoInvalidArgumentError` |
| NOT_FOUND | `RitoSessionNotFoundError` |
| ENGINE_ERROR | `RitoEngineError` |
| STALE_REQUEST | `RitoNavigationSupersededError` |
| TARGET_NOT_PUBLISHED | `RitoTargetNotPublishedError` |
| UNSUPPORTED_PROFILE | `RitoUnsupportedProfileError` |
| BUSY | `RitoBusyError` |
| EXACT_SEEK_PENDING | 内部继续精确定位 |
| ADJACENT_PENDING | 内部继续相邻分页 |
| SESSION_TERMINATED | `RitoSessionTerminatedError` |
| PANIC | `RitoNativePanicError` |

错误对象包含固定 code、status、operation 和会话标识。FFI 的诊断字符串只用于日志，不参与程序分支判断。

### 15.2 请求替代

新的前台定位或翻页请求替代仍在等待的旧请求。旧请求以 `RitoNavigationSupersededError` 完成。旧候选如果已经产生，由会话层释放。后台任务在前台持续定位期间让出执行机会。

### 15.3 销毁

`dispose` 具有幂等语义。会话销毁后，新的操作返回 `RitoSessionDisposedError`。原生 `SESSION_TERMINATED` 表示会话状态可能已经发生变化，宿主结束该会话并创建新会话。

## 16. 测试要求

> 实施状态：TypeScript 协议测试已覆盖 little-endian 字段、64 位标识、RITONAV1、RITOTRQ1、RITODL1、RITOART1、RITOPUB1、RITORES1、前后台确认、搜索、脚注、文字范围和会话基础。C++、原生设备、资源生命周期和图像比较测试仍待实施。

### 16.1 C++ 单元测试

1. 64 位字符串解析和溢出检查。
2. RitoOwnedBuffer 的复制、释放和重复释放防护。
3. 状态码与错误对象映射。
4. 执行器队列上限和销毁行为。
5. Promise 在模块销毁后的安全完成。

### 16.2 TypeScript 协议测试

1. 所有请求编码器的字节比较。
2. 所有响应解码器的固定测试数据。
3. 截断消息、错误长度、错误版本和未知 opcode。
4. bigint 与十进制字符串往返。
5. DisplayList 穷尽检查。
6. Flutter、Web 与 React Native 协议结果一致性。

### 16.3 集成测试

1. 打开 EPUB 并读取出版物信息。
2. 绘制初始 locator 对应页面。
3. 连续相邻翻页和反向翻页。
4. 跨章节翻页。
5. 目录定位和深章节定位。
6. 字号、行高、边距和单双页重排。
7. 图片、Ruby、边框、阴影和变换。
8. 内嵌字体与固定字体。
9. 前台请求替代和后台分页。
10. 工件释放、会话销毁和重复打开。

### 16.4 设备测试

Android 与 iOS 各至少覆盖一台物理设备。记录首个页面延迟、翻页延迟、峰值内存、连续打开关闭后的内存变化和长章节分页响应。

页面比较以相同 EPUB、字体、viewport、DPR、主题和排版输入为基础。React Native Skia 与 Rito Web Canvas 使用各自固定基准图，允许平台光栅器造成的细微抗锯齿差异。

## 17. 实施阶段

### 阶段一：原生构建验证

状态：Rito FFI 宿主检查、Android Rust 目标、`arm64-v8a` 发布编译、Pure C++ Turbo Module Codegen、CMake 目标和 RN 自动 provider 已经通过。应用整体构建受现有依赖的 Windows 长路径问题影响，Apple 工具链验证仍待完成。

创建程序包框架、Codegen 配置、Android Cargo 构建、iOS Cargo 构建和最小 Turbo Module。完成 ABI 版本读取、空输入错误和会话销毁测试。

### 阶段二：协议基础

状态：二进制读写器、RITOREQ1、RITONAV1、RITODL1、RITOART1、RITOPUB1、RITORES1 与确认消息完成。协议扩展消息和跨语言完整 fixture 集合仍待补充。

移植二进制读写器、请求模型、工件模型和 DisplayList 解码器。导入 Rito 固定测试数据，建立 Rust、Flutter 和 TypeScript 的一致性检查。

### 阶段三：首个页面

状态：RITODL1 到 Lunar DisplayList 的转换、Skia `sourceRect` 绘制、RITOART1 解码、固定字体参数传入、原生打开和首帧资源准备已经完成。Android 原生模块已通过 Pure C++ 自动链接配置接入应用工程，设备首页绘制仍待完整开发客户端验证。

完成固定字体传入、EPUB 打开、首个工件准备、资源读取和 Skia 页面绘制。Android 与 iOS 分别生成首个页面基准图。

### 阶段四：阅读会话

状态：RitoReaderSession、Lunar 工件视图、资源注册、首帧编译、相邻候选请求、命中区域、语义节点和后台分页量子已经完成。应用运行时已切换为 Rito 优先，完整背景分页进度和交互服务仍待完善。

完成相邻翻页、预取、候选提交、旧工件释放、目录读取、定位和重排。将 `NativeReaderRuntime` 改为工件会话模型。

### 阶段五：后台分页与交互

状态：后台请求和确认消息的编码、解码接口已经加入，阅读后端已在每次首帧和翻页后调度有限数量的后台量子。搜索、脚注和文字范围几何的协议与原生调用已经加入，产品交互服务仍待补充。

完成后台分页、命中区域、语义节点、阅读定位、搜索、脚注和文字范围几何。

### 阶段六：替换旧模块

状态：应用运行时已优先创建 `RitoNativePaginationBackend`，并以 Worklet、本地后端作为回退。Expo 配置插件已加入 Pure C++ 构建任务；用户已允许省略旧模块删除前的双平台回归，旧模块清理仍待单独执行。

应用界面切换到 `RitoNativeReaderBackend`。旧模块删除可以以 Android `arm64-v8a` 验证为依据，双平台回归暂不作为前置条件；随后删除 `lunar-pagination-worker`、Worklet 分页代码和 Rito 0.13 适配代码。

### 阶段七：上游程序包整理

状态：待实施。

清除 Lunar 产品依赖，补充独立示例、安装文档、构建要求、程序包测试和发布配置。程序包名称、目录和 Rust 源码发布方式与 Rito 维护者确认后提交 PR。

## 18. 上游提交内容

提交至 Rito 主仓库的 PR 建议包含：

1. `packages/rito_react_native` 独立程序包。
2. Android 与 iOS 构建脚本。
3. Pure C++ Turbo Module 与 Codegen 规范。
4. TypeScript V1 协议编码器和解码器。
5. React Native 会话封装。
6. 固定协议测试数据与自动测试。
7. 最小 React Native 示例应用。
8. Rust、NDK、Xcode、CocoaPods 和 React Native 版本要求。
9. 字体所有权、工件所有权和资源释放文档。
10. 与 Flutter 会话语义的对应表。

上游程序包不包含 Lunar 的 Skia Renderer。示例可以实现简化绘制器或只展示协议与工件信息，Skia 支持作为独立示例或后续适配程序包维护。

## 19. 需要与 Rito 维护者确认的事项

| 项目 | 建议 |
| --- | --- |
| npm 名称 | `@ritojs/react-native` |
| 仓库目录 | `packages/rito_react_native` |
| Rust 源码发布 | 与 rito_flutter 使用相同的固定源码集合 |
| ABI 版本 | 首版仅支持 V1 |
| React Native 下限 | 以 TypedArray JSI 支持和当前 New Architecture 为依据 |
| Expo 支持 | Development Build 与预构建原生工程 |
| 绘制后端 | 程序包保持无关，Lunar 使用 React Native Skia |
| 字体 | 宿主传入，程序包不内置字体 |
| 协议测试数据 | 由 Rito workspace 统一生成和版本管理 |

## 20. 完成标准

实现达到以下状态后，可以替换 Lunar 现有分页模块：

1. `@ritojs/react-native` 在 Android 与 iOS 中成功编译。
2. Rito 1.0.0 EPUB 会话能够打开、定位、翻页、重排和销毁。
3. Skia 能够绘制 RITODL1 V1 的全部目标命令。
4. 固定字体、内嵌字体和图片资源遵守所有权要求。
5. 页面定位使用 ReaderLocator，缓存标识包含 Rito ABI 与 revision 信息。
6. 请求替代、后台分页、候选提交和工件释放具有自动测试。
7. 双平台设备测试满足产品技术设计中的响应、内存和图像要求。
8. `lunar-pagination-worker` 和 Rito 0.13 生产代码从依赖图中移除。
9. Lunar 的业务页面继续只依赖 `src/reader` 公开入口。

该设计使 React Native 与 Flutter 共享同一 Rust 阅读协议和会话语义，同时保留各平台适合自身图形系统的绘制实现。
