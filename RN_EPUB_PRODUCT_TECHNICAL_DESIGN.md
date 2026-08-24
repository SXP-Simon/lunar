# Lunar React Native EPUB 产品技术设计

> 文档状态：首版开发依据  
> 修订日期：2026-08-20  
> 产品平台：Android 与 iOS  
> 产品名称：Lunar

## 1. 产品定义

Lunar 的名称来自 **L**ocal-first, **U**ltra-fast, **N**ext-gen **A**rchive & **R**eader。产品以本地书库、快速响应和新一代数字档案阅读体验为核心。

首版围绕 EPUB 导入、书库管理、分页阅读、目录导航、排版设置和阅读位置恢复展开。书籍、元数据与阅读状态保存在设备内部。账号、服务器和网络连接均非核心阅读功能的前置条件。

技术方案采用 React Native 负责产品界面和设备能力，Rito 负责 EPUB 解析、CSS 计算、分页与平台中立的 DisplayList，React Native Skia 负责原生 Canvas 和 GPU 绘制。

## 2. 技术判断

使用 Rito 分页并由 React Native Skia 绘制具备实现基础，前提是采用 Rito `0.13.0` 提供的平台中立接口，并先完成双平台原型验证。

GPU 绘制提升页面合成、缩放、过渡动画和重复帧播放的效率。EPUB 解压、XHTML 解析、CSS 计算、文字测量和分页仍属于 CPU 计算。产品性能依赖分页调度、字体测量缓存、图片解码缓存与相邻页预备，不能仅以 GPU 绘制代替这些工作。

### 2.1 采用条件

| 项目 | 判断 | 工程要求 |
|---|---|---|
| Rito 分页 | 可采用 | 精确固定 `@ritojs/core@0.13.0`，通过兼容测试后进入功能开发 |
| RN Skia 绘制 | 可采用 | 实现完整的 DisplayList 命令执行器，并与 Rito Web Canvas 生成的基准图比较 |
| 嵌入字体 | 可采用 | 字体注册、文字测量和绘制共享同一 `LunarFontResolver` |
| EPUB 图片 | 可采用 | 使用 Skia 解码器按需解码，限制缓存容量 |
| 翻页动画 | 可采用 | 当前页与相邻页预先编译为 `SkPicture`，动画仅改变位移、透明度或裁剪 |
| 生产发布 | 有前置审查 | Rito 明示仍处于开发期，且许可证为 `AGPL-3.0-only` |

### 2.2 Rito 版本依据

截至 2026-08-20，npm 的 `latest` 标签仍指向 `0.7.1`，`next` 标签指向 `0.13.0`。两个版本对原生 Skia 方案的支持程度不同。

| 能力 | `0.7.1` | `0.13.0` |
|---|---|---|
| 平台中立主入口 | 有限 | 完整公开 |
| `DisplayList` 与 `DrawCommand` | 未公开 | 公开 |
| `buildPageDisplayList` 与 `buildSpreadDisplayList` | 未公开 | 公开 |
| `FontRegistry` 与 `ImageDecoder` | 未公开 | 公开 |
| 浏览器类型依赖 | 分页资源类型仍引用 `ImageBitmap` | Web 能力隔离在 `@ritojs/core/web` |
| RN Skia 适配 | 需要维护 Rito 分支 | 可通过公开适配接口实现 |

Lunar 精确固定 `0.13.0`，并把全部 Rito 调用限制在 `src/reader/rito`。应用业务代码仅依赖 Lunar 自有的 `ReaderRuntime` 接口。Rito 升级时先运行 EPUB 基准图、位置恢复、字体、图片和内存测试，再更新版本。

## 3. 技术基线

### 3.1 当前工程

| 类别 | 技术 | 版本基线 | 用途 |
|---|---|---|---|
| 应用框架 | Expo SDK | 57.0.14 | 原生项目、模块管理、开发构建与发布 |
| 移动框架 | React Native | 0.86.2 | Android 与 iOS 应用主体 |
| 界面框架 | React | 19.2.3 | 产品界面与状态组合 |
| 开发语言 | TypeScript | 6.0，Strict 模式 | 应用、阅读内核和数据模型 |
| JavaScript 引擎 | Hermes | Expo SDK 57 默认配置 | Rito 与应用逻辑执行 |
| 导航 | Expo Router | 57.0.14 | 文件式路由和原生 Stack |
| 包管理 | pnpm | 10 | 依赖管理 |

Expo SDK 57 对应 React Native 0.86、React 19.2.3、React Native Web 0.21 和 Node.js 22.13 以上版本。系统基线为 Android 7 以上与 iOS 16.4 以上。

### 3.2 阅读能力

| 程序包 | 版本策略 | 用途 |
|---|---|---|
| `@ritojs/core` | 精确固定 `0.13.0` | EPUB 解析、样式计算、分页、DisplayList、位置模型 |
| `@shopify/react-native-skia` | Expo SDK 57 推荐版本 `2.6.2` | Canvas、字体、图片、`SkPicture` 和 GPU 绘制 |
| `react-native-gesture-handler` | Expo 配套版本 | 点击分区、滑动翻页和长按 |
| `react-native-reanimated` | Expo 配套版本 | 工具栏与翻页动画 |
| `react-native-worklets` | Expo 配套版本 | UI Runtime 承载动画；独立 Worker Runtime 承载 Rito 全书分页 |

Rito 主入口 `@ritojs/core` 用于平台中立功能。`@ritojs/core/web` 依赖 Canvas、`FontFace`、`createImageBitmap` 等浏览器接口，移动端代码禁止导入该入口。`@ritojs/core/advanced` 仅允许出现在 Rito Adapter 内，用于增量分页和命中信息生成。

### 3.3 本地能力

| 程序包 | 用途 |
|---|---|
| `expo-document-picker` | 从系统文件、iCloud Drive 和 Android 文档提供器选择 EPUB |
| `expo-file-system` | 采用 SDK 57 的 `File`、`Directory` 和 `Paths` API 管理书籍 |
| `expo-sqlite` | 保存书库、阅读位置、书签、设置和缓存索引 |
| `expo-crypto` | 生成书籍标识和 SHA-256 摘要 |
| `expo-keep-awake` | 阅读期间按用户设置保持屏幕唤醒 |
| `zustand` | 保存应用会话和当前阅读状态 |
| `zod` | 校验数据库 JSON、导入元数据和缓存元数据 |

Expo 原生程序包均通过 `pnpm exec expo install` 安装，由 Expo 选择与 SDK 57 匹配的版本。

### 3.4 产品界面

| 程序包 | 版本 | 用途 |
|---|---|---|
| `heroui-native` | `1.0.8` | Android 与 iOS 产品界面组件 |
| `uniwind` | `1.11.0` | React Native Tailwind CSS 运行环境 |
| `tailwindcss` | `4.3.3` | 主题变量和原子样式 |
| `tailwind-variants` | `3.2.2` | 组件变体组合 |
| `tailwind-merge` | `3.4.0` | 样式类合并 |
| `@gorhom/bottom-sheet` | `5.2.9` | 目录、阅读设置和菜单面板 |

应用根布局使用 `GestureHandlerRootView` 包裹 `HeroUINativeProvider`。Provider 开启系统字体缩放，并把正文与输入框的最大缩放倍数设为 `1.6`。`src/global.css` 依次载入 Tailwind CSS、Uniwind 和 HeroUI Native 样式，Metro 通过 `withUniwindConfig` 处理 CSS 和类型生成。

业务代码统一采用 `heroui-native/<component-name>` 细分入口。ESLint 限制 `heroui-native` 根入口导入，保持按组件加载。HeroUI Native 负责书架、目录、设置、弹层和反馈组件；阅读正文继续由 RN Skia Canvas 绘制。首版平台为 Android 与 iOS，Web 仅服务开发预览。

## 4. 总体架构

```text
系统文件选择器
      │
      ▼
受管 EPUB 文件 ───────► SQLite 书库与阅读位置
      │
      ▼
ReaderRuntime
      │
      ├── Rito Adapter
      │     ├── loadEpub
      │     ├── PaginationSession
      │     ├── buildSpreads
      │     ├── buildSpreadDisplayList
      │     └── locator、HitMap、语义数据
      │
      ├── SkiaFontRegistry 与 SkiaTextMeasurer
      ├── SkiaImageDecoder 与资源缓存
      └── SkiaDisplayListRenderer
              │
              ▼
         SkPicture 缓存
              │
              ▼
       RN Skia Canvas 与 GPU
```

该架构取消 WebView、Vite 阅读页面和跨环境 JSON 消息。Rito 的排版结果以进程内 TypeScript 对象交给 Skia 执行器，避免整本书的序列化副本，也避免 WebView 文件权限和浏览器生命周期管理。

### 4.1 模块职责

| 模块 | 职责 |
|---|---|
| `ReaderRuntime` | 管理打开、分页、版面修订、导航、资源释放和错误状态 |
| `RitoAdapter` | 封装 Rito 公开接口和少量 advanced 接口，隔离版本变化 |
| `ReaderTypography` | 定义平台无关的排版参数、默认值、输入规范化与版面标识 |
| `SkiaTextMeasurer` | 使用内置阅读字体的 `SkFont` 执行本地后备测量 |
| `SkiaFontRegistry` | 从内置字体字节创建固定 Typeface，并按书籍生命周期释放 |
| `SkiaParagraphFactory` | 统一创建测量与绘制共用的 Skia Paragraph |
| `LunarFontResolver` | 为分页与 Skia 绘制提供固定的内置 Typeface |
| `SkiaImageDecoder` | 从图片字节创建 `SkImage`，返回尺寸并管理释放 |
| `SkiaDisplayListRenderer` | 将全部 `DrawCommand` 转换为 Skia Canvas 操作 |
| `FrameCache` | 保存当前页和相邻页的 DisplayList 与 `SkPicture` |
| `ReaderInteraction` | 点击命中、链接、目录、阅读位置和后续文本选择 |
| `ReaderSemantics` | 为当前页面生成 React Native 可访问性语义层 |

## 5. 排版与绘制过程

### 5.1 打开书籍

1. 文件服务从 `Paths.document/books/<bookId>/book.epub` 创建 `File`。
2. `File.arrayBuffer()` 读取二进制，保持 `ArrayBuffer` 形式传给 Rito，避免 Base64 字符串。
3. `loadEpub()` 解析容器、清单、书脊、目录、XHTML 和 CSS。
4. 原生模块从应用资源读取内置霞鹜文楷，Skia 从同一份 TTF 字节创建 Typeface。
5. `SkiaTextMeasurer` 与绘制器共享同一字体管理器和字体匹配规则。
6. `PaginationSession` 按书脊顺序逐章分页，每完成一章便向事件循环让出执行机会。
7. Rito 生成 Page、Spread、DisplayList、HitMap 和位置索引。
8. 当前页和相邻页编译为 `SkPicture`，RN Skia Canvas 播放当前帧。

### 5.2 DisplayList 命令映射

`SkiaDisplayListRenderer` 对 Rito 的联合类型使用穷尽 `switch`。新增命令在 TypeScript 编译阶段形成错误，避免静默遗漏。

| Rito 命令 | Skia 操作 |
|---|---|
| `pushState` 与 `popState` | `canvas.save()` 与 `canvas.restore()` |
| `translate` | `canvas.translate()` |
| `transform` | 围绕原点组合旋转、缩放和平移矩阵 |
| `opacity` | 保存当前透明度并乘入 Paint alpha |
| `clipRect` | `clipRect` 或圆角裁剪 |
| `paintPage` | 页面背景矩形 |
| `paintBlock` | 背景、边框、圆角、阴影和背景图片 |
| `paintText` | 共享字体管理器生成的 Paragraph 或 glyph run |
| `paintRuby` | 按 Rito 给出的矩形绘制注音文本 |
| `paintImage` | 从图片缓存取得 `SkImage` 后按目标矩形绘制 |
| `paintHorizontalRule` | 实线、虚线或点线 Paint |

首版采用命令式 `Skia.PictureRecorder` 编译 DisplayList，避免为每条绘制命令创建 React 元素。`SkPicture` 只保存当前 spread 和前后各一个 spread；设备内存充足时可扩充至前后各两个。

### 5.3 文字测量一致性

分页质量取决于测量结果与绘制结果的一致程度。Lunar 采用以下规则：

1. 正文固定使用内置霞鹜文楷 Regular，EPUB 字体声明和系统字体不参与正文测量。
2. 字体族、字重、斜体、字号、字距和词距共同组成测量缓存键。
3. Worker Runtime 内的原生 SharedObject 使用该 TTF 进行测量；本地后备测量使用同一 Typeface 的 `SkFont.measureText()`。
4. 绘制阶段复用同一 Typeface，禁止改用 React Native `Text` 测量。
5. 中文、英文、标点挤压、ruby 与 emoji 纳入基准图测试。

Rito 的 `TextMetrics.height` 表示字号内容高度，行盒高度由 Rito 版面几何决定。Skia Paragraph 的 `heightMultiplier` 仅在其值来自 Rito 行高时设置，避免 Skia 再次改变分页结果。

### 5.4 图片与字体资源

`SkiaImageDecoder` 实现 Rito 的 `ImageDecoder` 接口。图片字节通过 `Skia.Data.fromBytes()` 和 `Skia.Image.MakeImageFromEncoded()` 创建 `SkImage`。Rito 在分页前取得图片尺寸，Skia 可把像素解码延迟到首次绘制。图片缓存采用字节预算和最近使用顺序，默认上限为 64 MiB，并在系统内存告警、关闭书籍或切换书籍时释放。

`SkiaFontRegistry` 实现 Rito 的 `FontRegistry` 接口。字体字节创建 `SkTypeface` 后注册到书籍专属 provider。系统字体来自 `Skia.FontMgr.System()`，两类字体由 `LunarFontResolver` 统一选择。关闭书籍时释放字体对象、测量缓存、图片对象、DisplayList 和 `SkPicture`。

## 6. 线程与响应性能

### 6.1 首版执行模型

RN Skia 通过 JSI 调用原生 Skia，最终页面由 GPU 绘制。Rito 是 TypeScript 程序包，默认在 React Native 的 Hermes JavaScript 运行环境中执行。首版采用章节增量分页，并在章节之间向事件循环让出执行机会。

`PaginationSession` 的公开接口从书脊开头依次处理章节。首次打开可以较早显示第一页；恢复到书籍中后部时，需要等待分页推进到目标章节。Lunar 首版禁止自行修改页码偏移来跳过前置章节。阶段零同时评估版本化 `LayoutSnapshot` 缓存，只有经过 Rito 版本校验和完整性校验的快照才可用于缩短再次打开时间。

`react-native-worklets` 的 `createWorkletRuntime()` 创建独立 Worker Runtime。Rito 文档、分页会话、字体测量对象和资源索引均在该原生异步线程内创建与执行，主 Runtime 只接收可复制的出版物索引与页面帧数据。归档与文字测量通过 Expo Modules `SharedObject` 原生状态传入 Worker，普通 `requireNativeModule()` 代理只在主 Runtime 使用。Lunar 原生模块在自定义 Worker Runtime 中安装 Expo 类原型，并在对象传输前执行 `SharedObject.__resolveInWorklet` 探测；安装或探测失败时转入本地分页。动画计算继续使用 UI Runtime。

### 6.2 后台执行门槛

阶段零在 Release 或 Profile 构建中记录每章分页耗时和输入延迟。出现以下任一情况时，首版功能开发暂停在阅读内核层，先增加独立后台 JavaScript 运行环境或原生执行模块：

1. 任一普通章节造成超过 50 毫秒的 JavaScript 长任务。
2. 打开 30 MiB 样本时，连续两次触控响应超过 100 毫秒。
3. 修改字号后，当前阅读位置附近的目标帧超过 700 毫秒仍未准备完成。
4. 大章节分页期间工具栏动画出现连续丢帧。

后台执行采用版本化命令协议，二进制资源通过 ArrayBuffer 或原生共享缓冲区传送。响应仅包含目标 frame、资源引用、命中数据和阅读位置，禁止发送全书 JSON。后台实现属于阶段零的条件项目，具体原生承载方式以双平台原型数据确定。

## 7. 版面修订与阅读位置

视口、方向、字号、行高、页边距、字体和单双页模式中的任一变化都会生成新的 `revisionId`。异步任务、DisplayList、HitMap 和缓存条目都携带该编号。

版面更新遵循以下顺序：

1. 从当前页面取得 Rito `ReadingLocator`，其中包含原文位置与 progression。
2. 创建新修订并开始字体确认和分页。
3. 旧页面保持显示，交互状态标记为更新中。
4. 新修订解析 locator，得到目标 spread。
5. 目标 `SkPicture` 准备完成后，在一次状态提交中替换画面和命中数据。
6. 迟到的旧修订结果按 `revisionId` 丢弃。

数据库以原文 locator 为主要阅读位置，以 progression 作为备用信息。页码与 spread 编号只服务当前版面显示，因为它们会随设备尺寸和排版设置变化。

## 8. 翻页、缓存与手势

### 8.1 帧缓存

缓存键采用以下信息：

```text
bookSha256 + ritoVersion + rendererVersion + revisionId + spreadIndex
```

内存中保存当前 spread、前一个 spread 和后一个 spread 的 DisplayList、HitMap 与 `SkPicture`。相邻页在空闲时预备。磁盘首版仅缓存封面与书库元数据，暂缓持久化 `SkPicture`，因为 Skia 序列化格式可能随版本变化。

### 8.2 手势

点击左侧和右侧区域执行前后翻页，点击中央区域切换工具栏。水平滑动以距离和速度共同判断翻页意图。动画使用 Reanimated shared value 驱动 Skia 画布上的位移与裁剪，动画期间禁止触发重新分页。

页面切换开始前确认目标 `SkPicture` 可用。目标帧仍在准备时显示轻量反馈，并保留当前页。动画结束后更新 locator、页码和相邻页预备方向。

## 9. 可访问性与交互信息

Canvas 绘制本身无法提供完整的原生文本语义。Lunar 为当前页面增加独立的 React Native 语义层：

1. Rito 的 semantic tree、HitMap 和原文范围生成当前页语义节点。
2. Skia Canvas 设置为装饰性绘制，语义层提供标题、段落、链接和图片替代文本。
3. 语义节点按段落合并，限制当前页节点数量，保持屏幕阅读器遍历效率。
4. 语义层使用 `pointerEvents="none"`，触控仍由阅读器手势层处理。
5. 目录、工具栏、设置和错误界面使用标准 React Native 可访问组件。

首版支持屏幕阅读器逐段阅读当前页、目录导航和图片替代文本。精细文本选择、复制、划线和批注安排在第二阶段，并复用 Rito 的 HitMap 与 source range。

## 10. 工程组织

Lunar 保持当前单一 Expo 工程，阅读能力位于 `src/reader`，无需为阅读内核增加 Web 子项目。

```text
lunar/
  src/
    app/                              Expo Router 页面
    components/                       通用产品组件
    features/
      library/                        书库、导入、仓储与文件适配器
        domain/                       书籍领域类型
        repositories/                 仓储接口与 SQLite 实现
        services/                     导入与书库业务服务
        infrastructure/               Expo 文件与文档选择适配器
      reader/                         阅读页面、工具栏、设置面板与出版物加载
      settings/                       应用设置
    reader/
      contracts/
        reader.ts                    阅读会话与位置契约
        typography.ts                阅读主题、视口与排版契约
        loading.ts                   资源、DisplayList 与出版物契约
        errors.ts                    固定错误代码
      typography/
        defaults.ts                  阅读排版默认值
        normalize.ts                 排版输入规范化
        typography-key.ts            排版标识生成
      runtime/
        reader-runtime.ts             会话、修订、分页和资源生命周期
        pagination-scheduler.ts       章节增量分页调度
        frame-cache.ts                DisplayList、HitMap 与 SkPicture 缓存
      rito/
        rito-adapter.ts               Rito 唯一导入位置
        layout-config.ts              Lunar 设置到 Rito 配置的转换
        locator.ts                    阅读位置解析与保存
      skia/
        fonts/
          font-registry.ts            系统字体与书内字体资源
        text/
          paragraph-factory.ts        Paragraph 创建与字形塑造
          text-measurer.ts            Skia 文字测量与缓存
        images/
          image-decoder.ts            图片解码与缓存
        rendering/
          display-list-renderer.ts    DrawCommand 穷尽执行器
          picture-compiler.ts         DisplayList 到 SkPicture
          reader-surface.tsx          Canvas 与 Picture 表面
      interaction/
        hit-testing.ts                点击、链接和图片命中
        semantics.ts                  当前页可访问性数据
    db/                               SQLite 连接、初始化与 migration
    stores/                           Zustand stores
  tests/
    fixtures/                         具有测试许可的 EPUB 样本
    golden/                           Web Canvas 与 Skia 基准图
    e2e/
  docs/
```

业务页面禁止导入 `@ritojs/core`。`src/reader/rito/rito-adapter.ts` 是 Rito 版本变化的唯一入口。Skia 命令执行器依赖 Lunar 自有类型和 Rito 公开 `DrawCommand` 类型。

## 11. 本地文件与数据库

### 11.1 文件组织

```text
Paths.document/
  books/
    <bookId>/
      book.epub
      cover.webp

Paths.cache/
  imports/
  covers/
```

导入过程采用 `copyToCacheDirectory: true`，随后把文件复制到书籍专属目录。数据库保存受管文件 URI。书籍打开时使用 `new File(uri).arrayBuffer()` 取得二进制内容。Base64 只允许用于小型诊断样本，正式阅读过程禁止采用 Base64 传输整本书。

### 11.2 SQLite 表

```sql
CREATE TABLE books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  language TEXT,
  publisher TEXT,
  description TEXT,
  file_uri TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  cover_uri TEXT,
  added_at INTEGER NOT NULL,
  last_opened_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX books_sha256_unique ON books(sha256);

CREATE TABLE reading_states (
  book_id TEXT PRIMARY KEY,
  locator_json TEXT NOT NULL,
  fallback_progression REAL NOT NULL DEFAULT 0,
  current_page INTEGER,
  total_pages INTEGER,
  typography_json TEXT NOT NULL,
  theme TEXT NOT NULL,
  rito_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  locator_json TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
);
```

数据库打开后启用 WAL 和外键。Zustand 仅保存当前会话所需的书库摘要、当前书籍标识、导入状态、阅读器状态和设置。EPUB 二进制、Rito 文档对象及 Skia 对象保留在 `ReaderRuntime` 内部。

## 12. 产品范围

### 12.1 首版

1. 从系统文件导入单个 EPUB。
2. 书架网格与列表模式。
3. 封面、书名、作者、阅读百分比和最近阅读排序。
4. Skia Canvas 单页分页阅读。
5. 点击与滑动翻页。
6. EPUB 目录与目录跳转。
7. 字号、行高、页边距和字体设置。
8. 浅色、深色和纸张色主题。
9. 沉浸式工具栏与屏幕常亮设置。
10. 应用进入后台、离开页面和切换书籍时保存 locator。
11. 再次打开书籍时恢复至相同原文位置附近。
12. 当前页屏幕阅读器语义。

### 12.2 后续阶段

| 阶段 | 能力 |
|---|---|
| 第二阶段 | 全文搜索、书签管理、文本选择、复制、划线和笔记 |
| 第三阶段 | 双页模式、仿真翻页动画、阅读统计、书库分类和批量导入 |
| 第四阶段 | 账号、端到端加密同步、跨设备阅读位置和批注同步 |

首版暂缓固定版式 EPUB、书内脚本、音视频 EPUB、RTL、BiDi 和竖排文字。Rito 当前 CSS 子集之外的内容显示兼容提示，同时保留原始 EPUB 文件。

## 13. 开发阶段

### 阶段零：原生 Skia 阅读内核验证

阶段零只实现最小阅读页面和必要适配器，验证项目包括：

1. `@ritojs/core@0.13.0` 能在 Hermes 中导入，主入口无 DOM、Canvas 和 `ImageBitmap` 全局依赖。
2. Expo SDK 57 的 `File.arrayBuffer()` 可将 10 MiB、30 MiB 和 80 MiB EPUB 交给 Rito。
3. `SkiaTextMeasurer` 和 `SkiaDisplayListRenderer` 使用内置霞鹜文楷支持中文、英文、图片、目录、ruby 与 emoji。
4. Rito Web Canvas 和 Lunar Skia 对同一页的基准图差异处于允许范围。
5. DisplayList 的全部命令均有测试样例和 Skia 映射。
6. 当前页和相邻页可编译为 `SkPicture`，反复翻页期间帧耗时符合预算。
7. 字号、方向和视口变化后，locator 可恢复到相同原文位置附近。
8. 连续打开与关闭书籍十次后，字体、图片、Picture 和 ArrayBuffer 均能释放。
9. 记录章节分页长任务，并依据第 6 节判断后台运行环境是否成为首版必需项。

阶段零须在 iOS 与 Android 各两台真机完成。Rito 导入、字体测量一致性、DisplayList 完整性或许可证审查中的任一项目未通过时，产品功能开发保持暂停。

### 阶段一：书库与数据

完成 Expo Router 页面、SQLite migration、文件服务、导入、书架、最近阅读和错误状态。

### 阶段二：基础阅读

完成 `ReaderRuntime`、分页调度、Skia Canvas、目录、主题、排版设置、手势和相邻页缓存。

### 阶段三：位置与生命周期

完成 locator 保存、progression 备用信息、后台保存、重新打开恢复、版面修订和文件缺失处理。

### 阶段四：发布准备

完成可访问性、隐私清单、开源许可证清单、崩溃记录脱敏、性能测试、商店素材和内测分发。

## 14. 测试与验收

### 14.1 测试层级

| 层级 | 工具 | 覆盖内容 |
|---|---|---|
| TypeScript | `tsc --noEmit` | Rito Adapter、命令穷尽检查、领域类型 |
| 单元测试 | Vitest 或 Jest | 设置、locator、缓存、调度和命令映射 |
| 组件测试 | React Native Testing Library | 书库、工具栏、设置和语义层 |
| 基准图测试 | Rito Web Canvas、RN Skia、像素比较 | 字体、图片、边框、阴影、变换和 ruby |
| 数据库测试 | SQLite 集成测试 | migration、书库查询和阅读状态保存 |
| 移动端自动测试 | Maestro | 导入、打开、翻页、设置和重新打开 |
| 真机性能测试 | Release 或 Profile 构建 | 打开、分页、帧耗时、内存和后台恢复 |

测试 EPUB 集合至少包含纯中文小说、英文长篇、混合图片、嵌入字体、复杂目录、表格、列表、ruby、损坏 ZIP、压缩比异常文件和超大资源。样本须具备仓库或测试环境使用许可。

### 14.2 功能验收

| 场景 | 通过条件 |
|---|---|
| 导入 | 有效 EPUB 出现在书架，取消选择时书库保持原状 |
| 离线 | 飞行模式下可以导入、打开、翻页和恢复位置 |
| 阅读 | 正文、图片、目录和嵌入字体可以显示 |
| 恢复 | 应用重启后回到相同原文位置附近 |
| 排版 | 字号、行高和页边距变化后重新分页，原文位置保持合理 |
| 生命周期 | 连续打开关闭十次后内存没有持续增长 |
| 资源释放 | 关闭书籍后 SkImage、SkTypeface、SkPicture 和大 ArrayBuffer 释放 |
| 输入安全 | 外部资源请求和书内脚本保持关闭 |
| 数据保护 | 日志省略正文、批注正文、文件内容和完整用户目录 URI |
| 平台 | Android 7 以上与 iOS 16.4 以上完成首版核心场景 |

## 15. 性能预算

所有指标在中档真机的 Release 或 Profile 构建中测量，Expo Go 数据仅供开发观察。

| 指标 | 首版目标 |
|---|---|
| 冷启动到书架可交互 | 2 秒内 |
| 10 MiB 普通 EPUB 首次打开 | 4 秒内 |
| 同一进程内书籍再次进入 | 2 秒内 |
| 点击翻页视觉反馈 | 50 毫秒内 |
| 准备完成页面的 `SkPicture` 播放 | 8 毫秒内完成 CPU 提交 |
| 60 Hz 翻页动画 | 每帧 16.7 毫秒以内，P95 达标 |
| 当前页相邻页命中率 | 连续阅读场景达到 95% |
| 排版设置变化后的目标页显示 | 700 毫秒内；其余章节继续准备 |
| 连续打开关闭十次 | 回到接近初始内存区间，无持续增长 |
| 内测会话无崩溃比例 | 99.5% 以上 |

性能报告分开记录 EPUB 读取、解压解析、字体注册、分页、DisplayList 构建、Picture 编译和 GPU 帧时间。这样可以准确判断优化对象。

## 16. 安全、兼容性与许可

1. EPUB 一律按外部输入处理。Rito `loadEpub` 配置压缩包大小、解压总量、单项大小、项目数量和压缩比限制。
2. 书内脚本、外部资源自动请求、弹窗和任意页面跳转保持关闭。
3. 外部链接仅允许 `https`，交给系统浏览器前展示域名确认界面。
4. 日志只记录书籍标识、文件大小、阶段耗时、设备类别和固定错误代码。
5. 书籍、书签和批注默认保存在设备内部，首版没有上传行为。
6. 删除书籍时先显示确认界面，再清理数据库记录、受管 EPUB、封面和内存资源。
7. Rito 使用 `AGPL-3.0-only`。开发投入前须确认应用源代码提供方式、商店分发义务、修改源码义务和第三方商用授权。计划采用闭源分发时，应先获得适用的商业许可或版权方书面许可。
8. Rito 仓库当前提示该项目仍处于开发期。Lunar 通过精确版本、适配层、基准图和回归测试管理升级影响。

## 17. 依赖安装与检查

当前仓库采用 Expo SDK 57。新增依赖使用以下命令：

```bash
pnpm exec expo install @shopify/react-native-skia
pnpm exec expo install expo-document-picker expo-file-system expo-sqlite expo-crypto expo-keep-awake
pnpm exec expo install react-native-svg expo-blur
pnpm add @ritojs/core@0.13.0 --save-exact
pnpm add heroui-native@1.0.8 uniwind@1.11.0 tailwindcss@4.3.3 --save-exact
pnpm add tailwind-variants@3.2.2 tailwind-merge@3.4.0 @gorhom/bottom-sheet@5.2.9 --save-exact
pnpm add zustand zod
pnpm exec expo install --check
```

阶段零可在 Expo Go 中检查基础 Skia 绘制。真机性能、内存、原生模块和后续后台运行环境使用 Development Build、Profile 或 Release 构建验证。

CI 增加以下检查：

```bash
pnpm exec tsc --noEmit
pnpm exec expo install --check
pnpm test
```

Rito 的锁定版本、完整性摘要和许可证进入开源组件清单。依赖更新工具禁止自动升级 `@ritojs/core` 和 `@shopify/react-native-skia`，这两个程序包须经过人工基准图与真机性能测试。

## 18. 资料来源

1. [Expo SDK 57 版本文档](https://docs.expo.dev/versions/v57.0.0/)
2. [Expo SDK 57 React Native Skia 文档](https://docs.expo.dev/versions/v57.0.0/sdk/skia/)
3. [Expo SDK 57 FileSystem 文档](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/)
4. [Expo SDK 57 DocumentPicker 文档](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/)
5. [Expo SDK 57 SQLite 文档](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
6. [Rito 仓库](https://github.com/Ringyuki/Rito)
7. [Rito 架构](https://github.com/Ringyuki/Rito/blob/master/docs/architecture.md)
8. [Rito 平台中立基础接口](https://github.com/Ringyuki/Rito/blob/master/docs/api/primitives.md)
9. [Rito 低层接口](https://github.com/Ringyuki/Rito/blob/master/docs/api/advanced.md)
10. [Rito 限制](https://github.com/Ringyuki/Rito/blob/master/docs/limitations.md)
11. [React Native Skia 安装文档](https://shopify.github.io/react-native-skia/docs/getting-started/installation/)
12. [React Native Skia Paragraph 文档](https://shopify.github.io/react-native-skia/docs/text/paragraph/)
13. [React Native Skia Text 文档](https://shopify.github.io/react-native-skia/docs/text/text/)
14. [React Native Skia Images 文档](https://shopify.github.io/react-native-skia/docs/images/)
15. [HeroUI Native 入门文档](https://heroui.com/en/docs/native/getting-started)
16. [HeroUI Native Quick Start](https://heroui.com/en/docs/native/getting-started/quick-start)
17. [HeroUI Native Provider](https://heroui.com/en/docs/native/getting-started/provider)
18. [Uniwind Quickstart](https://docs.uniwind.dev/quickstart)

Lunar 首版以 Rito `0.13.0` 负责平台中立分页，以 React Native Skia `2.6.2` 负责原生 Canvas 和 GPU 绘制。阶段零负责验证字体测量一致性、DisplayList 命令完整性、章节分页响应、内存释放和许可条件，验证通过后再扩展书库与完整阅读功能。
