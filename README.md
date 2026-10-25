# Lunar EPUB 兼容性验证材料

本分支只存放验证用书、源文件分析、执行脚本和展示证据，不合并进应用代码分支。

## 身份与范围

- 应用基线：`Umbrae-Labs/lunar@4641589621f24d0df7d5a0811a3e26b1856c64cf`。
- APK：`nightly-20261024-40115172807`，源码 `8ecf3336ad73b4b73d93d1ade2d3b3847c5e9170`；与基线只差 README。
- Rito RN：`0.3.0-lunar.1`，引擎 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae`。
- 测试设备：Android API 36 `handwrite-api36` 模拟器，x86_64 系统通过 ARM64 兼容层运行公开 APK。模拟器数据不代表 ARM 真机性能。
- `inspect-lunar.cjs` 直接执行应用源码中的导入检查和首章节查找函数；没有模拟这些函数，也没有调用原生排版。因此该报告只能证明 JS 解析行为。

## 来源和许可

原始书籍来自 [W3C/IDPF EPUB 3 Samples](https://github.com/IDPF/epub3-samples)，固定使用 [20230704 Release](https://github.com/IDPF/epub3-samples/releases/tag/20230704)。[样书许可表](https://idpf.github.io/epub3-samples/30/samples.html)规定，未单独说明的样书为 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。本次所选样书没有该表中的其他许可例外；书中字体及其他附带许可继续保留，具体作者、权利文本、下载 URL 和 SHA-256 见 `reports/source-analysis.json`。不将“公益”当成无版权。

`moby-dick-attribute-whitespace.epub` 和 `moby-dick-opf-prefix.epub` 是本次制作的《白鲸》对照变体，沿用 CC BY-SA 3.0，作者和原始内容归属不变。修改仅为 container.xml 属性赋值空白或 OPF 元素命名空间前缀；正文、字体、图片和阅读顺序不变。生成逻辑在 `scripts/analyze.py`，不是声称上游原文件存在这些写法。

## 样本用途

| 文件 | 要验证的特性 |
|---|---|
| moby-dick | 长篇多章节、嵌入字体、重开定位 |
| moby-dick-attribute-whitespace / moby-dick-opf-prefix | XML 等价序列化的解析兼容性 |
| kusamakura-japanese-vertical-writing | 竖排、Ruby、日文资源路径、字体、媒体叠加 |
| haruko-html-jpeg | 全局固定版式、末尾 about 项覆盖为流式、右向左页序 |
| cole-voyage-of-life | 混合版式、spine 单项 layout 覆盖 |
| wasteland-otf / wasteland-woff / wasteland-otf-obf | 出版方字体、字体格式和字体混淆 |
| internallinks | 书内交叉链接与返回 |
| trees | CSS 多栏和分页边界 |
| childrens-literature | 目录、隐藏内容及普通流式对照 |

## 解析复现

准备一个已安装依赖的 Lunar 检出和本材料分支的独立检出；需要 Node.js、Python 3、Java 17。

```sh
python scripts/analyze.py
# 设置 LUNAR_SOURCE_REF=4641589621f24d0df7d5a0811a3e26b1856c64cf 可调用基线 inspector
node scripts/inspect-lunar.cjs /absolute/path/to/lunar baseline-inspector.json
# 清除 LUNAR_SOURCE_REF，切换 Lunar 到待验证修复提交后运行
node scripts/inspect-lunar.cjs /absolute/path/to/lunar xml-fixed-inspector.json
```

报告写入 `reports/`。检查 `sourceRef` 字段：必须是期望的基线 SHA 或 `working-tree`，不要将修复后的工作树结果误作基线。

使用 [EPUBCheck 5.4.0](https://github.com/w3c/epubcheck/releases/tag/v5.4.0) 对每个 `samples/*.epub` 执行：

```sh
java -jar epubcheck.jar samples/moby-dick-opf-prefix.epub --json reports/moby-dick-opf-prefix.epubcheck.json
```

12 个样本均无 ERROR/FATAL；草枕保留上游的保留前缀弃用警告，混淆字体样本报告字体内容不检查。两份 XML 对照变体均无警告。EPUBCheck 通过不是页面正确的证明。

## 当前解析结论

基线：10 本原始样书的元数据和首章节查找通过；空白变体导入失败；前缀变体导入时封面丢失、打开时找不到首章节。修复后的解析报告：12 本均通过，两个变体的元数据、封面和首章节与原书一致。

设备画面、交互和耗时的验证结果另行记录；没有对应结果的项目不得视为通过。
