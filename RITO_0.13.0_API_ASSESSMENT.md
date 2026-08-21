# Rito 0.13.0 API 评估

> 评估日期：2026-08-21  
> 项目依据：[Lunar React Native EPUB 产品技术设计](RN_EPUB_PRODUCT_TECHNICAL_DESIGN.md)  
> 目标版本：`@ritojs/core@0.13.0`

## 1. 资料范围

本文以 npm 发布包 `@ritojs/core@0.13.0` 的 `package.json`、JavaScript 文件和 TypeScript 声明为接口依据，并使用 Rito 的 `0.13.0` 版本提交与更新记录核对行为变化。主分支文档仅用于补充概念，避免将后续版本接口计入本次评估。

发布包提供十个入口：主入口、`advanced`、`web`、`integration`、`selection`、`search`、`annotations`、`position`、`a11y` 和 `dom`。Lunar 的 React Native 阅读内核主要需要主入口、`integration`、`position` 与少量 `advanced` 接口。

## 2. 评估摘要

Rito `0.13.0` 提供了 Lunar 首版原生 Skia 阅读方案所需的主要能力：`ArrayBuffer` EPUB 解析、ZIP 资源限制、版面配置、平台文字测量接口、字体与图片适配接口、章节增量分页、书页组合、平台中立 DisplayList、目录定位、阅读位置、点击命中和页面语义数据。

首版最值得采用的接口分为八组：

1. `loadEpub`、`LoadOptions`、`ZipLimits` 与 `EpubDocument.close`。
2. `createLayoutConfig`、`LayoutConfigInput` 与 `PaginationPolicy`。
3. `TextMeasurer`、`FontRegistry` 与 `loadFontsWithRegistry`。
4. `ImageDecoder`、`loadImagesWithDecoder`、`createLazyImageLoaderWithDecoder` 和图片来源收集函数。
5. `PaginationSession` 与 `PaginationResult`。
6. `buildSpreads`、`buildPageDisplayList`、`buildSpreadDisplayList`、`DisplayList` 与 `DrawCommand`。
7. `@ritojs/core/integration` 提供的 HitMap 与链接命中接口。
8. `ReadingPosition`、`ReadingLocator`、`createPositionTracker` 与 `buildSemanticTree`。

仍需由 Lunar 补充的能力包括分页任务取消、字节预算图片缓存、版本化版面快照、Skia 绘制后端、字体选择规则以及排版修订编号管理。`0.13.0` 没有公开这些能力。

## 3. 0.13.0 相对 0.12.1 的公开接口变化

| 变化 | 公开位置 | 对 Lunar 的价值 | 建议 |
| --- | --- | --- | --- |
| 新增 `ZipLimits` | `@ritojs/core` | 对压缩包大小、条目数量、单项解压大小、总解压大小和压缩比设置限制 | 首版采用，并以 Lunar 自有常量提供比默认值更严格的预算 |
| 新增 `EpubAssetSource` | `@ritojs/core` | 用统一类型描述 `stylesheets`、`fonts` 与 `images` | 用于 Skia 字体和图片适配器的输入类型 |
| 新增 `ImageLoadOptions` | `@ritojs/core` | 通过 `maxConcurrency` 限制批量图片解码并发数，默认值为 `4` | 真机测试后设置较小并发数，减少内存峰值 |
| 新增 `@ritojs/core/integration` | 专用子入口 | 公开 `buildHitMap`、`buildLinkMap`、`getSelectionRects`、`hitTestLink` 及相关类型 | 首版 HitMap 和链接处理采用该入口，减少对 `advanced` 的依赖 |

更新记录还包含数项没有形成新函数名、却与移动端阅读密切相关的改进：主入口采用无 DOM 的严格 XML 解析器；ZIP、图片并发和 Web 资源缓存增加边界；命中、链接、选区、搜索与语义树统一使用变换和裁剪后的视觉几何；超大平坦文本与大量强制换行的分行计算避免平方级耗时；解析器接受 EPUB 中常见的 HTML 风格 `br` 和 `img` 空元素。

## 4. 首版必需接口

### 4.1 EPUB 载入与输入限制

```ts
loadEpub(data: ArrayBuffer, options?: LoadOptions): EpubDocument
```

`LoadOptions` 包含 `maxChapters`、`zipLimits` 和 `logger`。其中 `ZipLimits` 包含以下字段：

| 字段 | Rito 默认值 | Lunar 用途 |
| --- | ---: | --- |
| `maxArchiveBytes` | 512 MiB | 限制 EPUB 压缩文件大小 |
| `maxEntries` | 10,000 | 限制 ZIP 条目数量 |
| `maxEntryUncompressedBytes` | 128 MiB | 限制单个解压条目大小 |
| `maxTotalUncompressedBytes` | 512 MiB | 限制总解压大小 |
| `maxCompressionRatio` | 200 | 限制单个条目的压缩比 |

该组接口与技术设计第 16 节的外部输入防护要求相符。`ReaderRuntime` 关闭书籍时需要调用 `EpubDocument.close()`。`EpubDocument` 的章节正文按需读取，同时字体和图片以 `ReadonlyMap<string, Uint8Array>` 公开；大书籍的二进制驻留量仍需真机测量。

### 4.2 版面配置

```ts
createLayoutConfig(input: LayoutConfigInput): LayoutConfig
```

`LayoutConfigInput` 支持视口宽高、四向页边距、单双页、首页独立、跨页间距、根字号、行高替换、字体族替换和孤行控制。它可以覆盖 Lunar 首版的视口、方向、页边距、行高、字体与单双页配置。

需要特别验证字号设置。`0.13.0` 的核心配置仅提供 `rootFontSize`，没有 `fontSizeOverride` 或对应的强制字段。`rootFontSize` 会成为初始字号和 `rem` 基准，EPUB 自身针对 `html`、`body` 或子元素声明的字号仍可能取得更高优先级。阶段零应加入显式 `px`、`em`、百分比和继承字号样本；如果产品要求统一放大所有正文，需要向 Rito 增加公开的字号替换能力，或者在 Adapter 内采用经过测试的低层样式处理。

`lineHeightOverride` 与 `fontFamilyOverride` 均有对应的 `Force` 字段，可以选择仅修改正文继承值，或者覆盖每个元素。Lunar 应把两种语义明确映射为“尊重书籍样式”和“统一排版”两类设置。

### 4.3 字体测量与注册

```ts
interface TextMeasurer {
  measureText(text: string, paint: MeasurePaint): TextMetrics;
}

interface FontRegistry {
  loadFont(resource: FontResource): Promise<void>;
  dispose?(): void;
}
```

`TextMeasurer` 是分页所需的平台接口。`MeasurePaint` 包含字体族、字重、斜体、字号、字距和词距；`TextMetrics.height` 表示名义内容高度，等于字体大小，行盒高度由 Rito 的版面几何决定。这与技术设计第 5.3 节的测量规则相符。

`loadFontsWithRegistry(doc, registry)` 会解析 `@font-face` 并把字体字节交给平台注册器。Lunar 的 `SkiaFontRegistry` 应实现 `loadFont` 与 `dispose`，分页测量和 Skia 绘制共用同一套字体解析结果。

### 4.4 图片尺寸、解码与缓存

```ts
interface ImageDecoder<TImage extends ImageDimensions> {
  decode(resource: ImageResource): Promise<TImage>;
  dispose(image: TImage): void;
}
```

`loadImagesWithDecoder` 会解码全部书内图片，并通过 `ImageLoadOptions.maxConcurrency` 控制并发。分页函数接收 `ReadonlyMap<string, ImageDimensions>`，因此分页前必须取得图片尺寸。

`createLazyImageLoaderWithDecoder` 提供按需解码、相同资源请求合并、预载、LRU 淘汰和统一释放。其第三个参数 `maxSize` 表示缓存图片数量，默认值为 `50`，并非字节数。技术设计中的 64 MiB 预算需要由 Lunar 的 Skia 图片缓存记录每张图的估算字节数并执行淘汰。

建议把图片处理分成两个阶段：分页前生成轻量尺寸表，绘制前使用 `collectPageImageSources` 或 `collectSpreadImageSources` 预载目标页图片。图片尺寸表可以通过受控解码后释放对象取得，也可以由 Lunar 增加图片头尺寸读取器。后者能避免分页前长期持有所有 `SkImage`。

### 4.5 章节增量分页

主入口的 `paginate` 会同步处理全书并且只返回 `Page[]`。Lunar 需要章节映射、锚点、原文索引和脚注信息，因此首版更适合在 `rito-adapter.ts` 内使用：

```ts
new PaginationSession(
  doc,
  config,
  measurer,
  imageDimensions,
  'greedy',
  logger,
)
```

`PaginationSession` 位于 `@ritojs/core/advanced`，关键方法为 `paginateNextChapter()`、`getCurrentPages()`、`getChapterMap()` 和 `getResult()`。`getResult()` 返回 `PaginationResult`，其中包含页面、章节页码区间、全局锚点、章节内锚点、章节原文索引和脚注映射。

`paginateNextChapter()` 本身是同步调用。Lunar 的 `PaginationScheduler` 应在每章完成后把执行机会交还给事件循环，并通过 `revisionId` 忽略旧版面结果。Rito 没有取消令牌，取消语义由 Lunar 会话层承担。

增量分页仅提取同章脚注；`paginateAll()` 会预扫描全书并支持跨章脚注。首版产品范围没有脚注弹层，因此可以先采用增量模式，并把跨章脚注列为兼容测试项目。

### 4.6 书页组合与 DisplayList

```ts
buildSpreads(pages, config, chapterStartPages?)
buildPageDisplayList(page, config, options?)
buildSpreadDisplayList(spread, config, options?)
```

`DisplayListOptions` 支持 `backgroundColor`、`foregroundColor` 与 `spreadBodyBg`，可以承载浅色、深色和纸张色主题。`DrawCommand` 在 `0.13.0` 中共有十二种：

| 类别 | `kind` |
| --- | --- |
| 状态 | `pushState`、`popState` |
| 坐标与合成 | `translate`、`transform`、`opacity`、`clipRect` |
| 绘制 | `paintPage`、`paintBlock`、`paintText`、`paintRuby`、`paintImage`、`paintHorizontalRule` |

这些命令覆盖技术设计第 5.2 节列出的 Skia 操作。`SkiaDisplayListRenderer` 应采用穷尽 `switch`，并对圆角裁剪、块阴影、背景图片、文字装饰、字距、词距和变换增加基准图测试。

### 4.7 HitMap 与链接

`@ritojs/core/integration` 是 `0.13.0` 新增的原生集成边界，公开以下接口：

```ts
buildHitMap(page): HitMap
buildLinkMap(page): readonly LinkRegion[]
hitTestLink(regions, x, y): LinkRegion | undefined
getSelectionRects(hitMap, range, measurer): readonly Rect[]
```

首版可使用 `buildHitMap` 生成当前页点击数据，使用 `buildLinkMap` 与 `hitTestLink` 处理书内跳转和外部链接。该子入口已经采用变换与裁剪后的视觉几何，并保持页面内容坐标系。

技术设计中“`advanced` 用于 HitMap”的表述可以调整为“`integration` 用于 HitMap，`advanced` 仅用于增量分页、目录定位和页面语义等尚未进入专用原生子入口的能力”。全部导入仍集中在 `src/reader/rito/rito-adapter.ts`。

### 4.8 目录、阅读位置与语义数据

目录导航可使用 `findPageForTocEntry`。传入 `chapterMap`、书脊、清单地址映射与锚点映射后，带片段标识的目录项可以定位到具体页面。该函数位于 `advanced`。

`ReadingPosition` 保存原文定位信息、当前版面投影、全书进度和时间戳。`ReadingLocator` 包含 `spineIdref`、可选 `manifestHref`、章节进度与可选 `sourcePoint`。`@ritojs/core/position` 还提供 `createPositionTracker` 和 `projectReadingPosition`，适合位置保存、重新分页后的投影和书签跳转。

`buildSemanticTree(page)` 返回标题、段落、列表、图片、链接、引用和表格等节点，并包含文字、替代文本、链接地址、边界与子节点。它能支持技术设计中的当前页 React Native 可访问性语义层。`@ritojs/core/a11y` 同时包含基于 `HTMLElement` 的 `createA11yMirror`；React Native 端只应使用 `buildSemanticTree`，并在阶段零检查该子入口的 Hermes 打包结果。另一个选择是在 Adapter 内从 `advanced` 引入 `buildSemanticTree`。

## 5. 后续阶段可采用的接口

| 产品阶段 | Rito 接口 | 可提供的能力 |
| --- | --- | --- |
| 第二阶段全文搜索 | `@ritojs/core/search` 的 `createSearchEngine` | 页面文本索引、大小写与整词检索、结果切换、当前结果高亮矩形 |
| 第二阶段文本选择 | `@ritojs/core/selection` 的 `createSelectionEngine` | 跨页选择状态、选区文字、选区矩形和指针方向信息 |
| 第二阶段划线与笔记 | `@ritojs/core/annotations` | 原文锚定目标、批注存储适配器、重新分页后的批注解析、孤立批注状态 |
| 第三阶段双页模式 | `createLayoutConfig` 与 `buildSpreads` | 横屏双页、首页独立和跨页间距 |
| 脚注支持 | `PaginationResult.footnoteMap` | 纯文本和经过许可列表清理的 HTML 脚注内容 |

Lunar 的 SQLite 数据模型可以实现 `RecordStorageAdapter`，但业务数据库类型仍应使用 Lunar 自有契约，避免持久层引用 Rito 类型。

## 6. 需要由 Lunar 处理的限制

| 限制 | 影响 | 处理方式 |
| --- | --- | --- |
| 分页调用同步且没有取消令牌 | 大章节仍可能形成 JavaScript 长任务 | 按章调用、章间让出执行机会、记录长任务、使用 `revisionId` 忽略过期结果 |
| 没有版面快照序列化接口 | 技术设计中的 `LayoutSnapshot` 无法依靠公开 API 实现 | 阶段零先测量再次分页成本；避免持久化 Rito 内部 `Page` 对象 |
| 图片 LRU 按数量限制 | 无法保证 64 MiB 上限 | 在 Skia 适配层增加字节计数缓存 |
| 批量图片接口会解码全书图片 | 大型图册可能产生内存峰值 | 并发限制、轻量尺寸表、目标页预载与及时释放 |
| 根字号不是强制字号替换 | 某些 EPUB 的显式字号可能保持原值 | 增加字号样本测试，并准备上游接口请求或 Adapter 内的受测处理 |
| 增量分页只支持同章脚注 | 跨章注释引用可能缺失 | 首版记录兼容提示；需要完整脚注时采用全书预扫描 |
| `advanced` 的兼容承诺较弱 | Rito 升级时 Adapter 修改范围可能增加 | 精确固定 `0.13.0`，保存接口类型测试与基准图测试 |
| 没有 React Native Skia 后端 | DisplayList 需要由 Lunar 执行 | 维护穷尽命令执行器和 Web Canvas 基准图 |

## 7. 推荐的 Adapter 接口范围

`src/reader/rito/rito-adapter.ts` 可以把 Rito 能力压缩为 Lunar 自有方法，业务层仅接触 `src/reader` 的公开契约。

```ts
interface LunarRitoAdapter {
  open(data: ArrayBuffer, limits: LunarZipLimits): LunarBookDocument;
  createLayout(input: LunarLayoutInput): LunarLayoutConfig;
  registerFonts(document: LunarBookDocument): Promise<void>;
  readImageDimensions(document: LunarBookDocument): Promise<LunarImageDimensionMap>;
  createPaginationSession(input: LunarPaginationInput): LunarPaginationSession;
  buildSpreadFrame(input: LunarSpreadFrameInput): LunarDisplayFrame;
  buildPageInteraction(pageIndex: number): LunarPageInteraction;
  createPosition(spreadIndex: number): LunarReadingPosition;
  projectPosition(position: LunarReadingPosition): LunarReadingPosition;
  findTocTarget(href: string): number | undefined;
  dispose(): void;
}
```

建议的 Rito 导入分配如下：

| 入口 | 用途 | 首版状态 |
| --- | --- | --- |
| `@ritojs/core` | 解析、配置、资源适配、书页组合与 DisplayList | 必需 |
| `@ritojs/core/integration` | HitMap、链接区域与选区矩形 | 必需 |
| `@ritojs/core/position` | 阅读位置跟踪与版面投影 | 必需 |
| `@ritojs/core/advanced` | `PaginationSession`、目录定位与语义树 | 限定在 Adapter 内 |
| `@ritojs/core/search` | 全文搜索 | 第二阶段 |
| `@ritojs/core/selection` | 文本选择 | 第二阶段 |
| `@ritojs/core/annotations` | 划线、笔记与原文锚定 | 第二阶段 |
| `@ritojs/core/a11y` | DOM 语义镜像与语义树 | React Native 端谨慎采用 |
| `@ritojs/core/web` | Web Canvas、`FontFace` 与 `createImageBitmap` | React Native 端禁止导入 |
| `@ritojs/core/dom` | 浏览器指针、剪贴板与光标绑定 | React Native 端禁止导入 |

## 8. 对现有技术设计的修订建议

1. 将 HitMap 的来源从 `@ritojs/core/advanced` 改为 `@ritojs/core/integration`。
2. 在 `SkiaImageDecoder` 之外增加图片尺寸读取职责，使分页尺寸表与绘制图片缓存可以分别管理。
3. 将 64 MiB 描述为 Lunar 自有缓存预算，并注明 Rito 的 `maxSize` 按图片数量计算。
4. 在阶段零增加显式字号 EPUB 样本，确认 `rootFontSize` 能否满足产品的字号调节预期。
5. 明确 `PaginationSession.paginateNextChapter()` 为同步调用，章间调度由 `PaginationScheduler` 承担。
6. 将版本化 `LayoutSnapshot` 标记为自研候选能力；`0.13.0` 没有公开序列化格式。
7. 资源释放清单加入 `EpubDocument.close()`、`FontRegistry.dispose()` 与 `LazyImageLoader.dispose()`。
8. 将 `@ritojs/core/a11y` 纳入 Hermes 子入口检查，确认 Metro 打包后没有执行浏览器语义镜像代码。

## 9. 首版采用顺序

| 次序 | 能力 | 验证重点 |
| ---: | --- | --- |
| 1 | `loadEpub` 与 `ZipLimits` | Hermes 导入、异常 EPUB、压缩限制、`close` 后资源释放 |
| 2 | 字体注册与 `TextMeasurer` | 中文、英文、嵌入字体、粗斜体、emoji、缺字替代、字距与词距 |
| 3 | 图片尺寸与解码 | 大图片、损坏图片、并发数、缓存字节数与释放 |
| 4 | `PaginationSession` | 章节耗时、长任务、章节映射、锚点、跨章脚注差异 |
| 5 | DisplayList 到 Skia | 十二种命令、主题、变换、裁剪、ruby 与图片 |
| 6 | `integration` | 页面坐标、链接、图片命中、变换与裁剪后的区域 |
| 7 | 阅读位置 | 字号、方向、边距变化后的原文位置投影 |
| 8 | 页面语义 | 当前页节点数量、标题层级、段落、链接和图片替代文本 |

## 10. 资料来源

1. [Rito 0.13.0 更新记录](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/CHANGELOG.md)
2. [Rito 0.13.0 主入口导出](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/src/index.ts)
3. [Rito 0.13.0 包入口配置](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/package.json)
4. [原生集成入口源码](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/src/integration.ts)
5. [章节增量分页源码](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/src/runtime/pagination-session.ts)
6. [EPUB 运行时类型源码](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/src/runtime/types.ts)
7. [图片解码接口源码](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/src/render/assets/types.ts)
8. [图片 LRU 实现](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/src/render/assets/lazy-image-loader.ts)
9. [阅读位置模型源码](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/src/interaction/position/model.ts)
10. [页面语义树源码](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/packages/rito/src/interaction/core/semantic-tree.ts)
11. [Rito 平台中立基础接口文档](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/docs/api/primitives.md)
12. [Rito 低层接口文档](https://github.com/Ringyuki/Rito/blob/540b78c51935db1d1cd3531672a49c65f47a40f3/docs/api/advanced.md)
13. [npm 上的 @ritojs/core 0.13.0](https://www.npmjs.com/package/@ritojs/core/v/0.13.0)

Rito `0.13.0` 的公开接口足以支撑 Lunar 的阶段零原型和首版阅读内核，其中 `ZipLimits`、无 DOM 主入口、`integration` 子入口与章节增量分页最有价值。字号强制替换、图片字节预算、分页取消和版面快照仍由 Lunar 的 Adapter 与运行时层补充。
