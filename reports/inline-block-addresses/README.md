# 内联块复用了宿主文字地址，选区失败或高亮串入前文

这是独立于竖排投影、漏绘及图片尺寸的交互缺陷，横排也能复现。修复分支 `fix/inline-block-text-addresses`，基于上游 `dev@ed0284f3703244da28b3e6efd80cf29267cf6e65`，提交 `1b3031defde326d83e2c8e80269791e339f1fc19`。只有交互工件遍历与回归测试，没有包含 #46、#51 或 #52 的生产改动。

## 当前 Lunar 安装包也复现

在当前模拟器安装包中，原创 CC0 [内联块对照书](../../samples/vertical-inline-block-probe.epub) 的横排章节画面显示“外前 盒内文字 外后”。“外前”和“盒内文字”的 `textRange.start` 却都为 `(blockIndex:0,lineIndex:0,runIndex:0,charIndex:0)`；请求“盒内文字”四字的几何，返回两个矩形，其中一个覆盖前面的“外前”。多层嵌套的“一级”和“二级”也复用了地址。实际运行时返回值见 [device.json](device.json)，不是根据上游文档推测的用户影响。

验证调用 Lunar 的真实 `resolveTextRangeGeometry`，由该四字命中项携带的范围发起请求，不替换命中、地址、布局或几何。它证明运行时错误多给前文矩形，不声称已经完成用户手势和新 APK 高亮画面的验收。

设备为 API36、1080×2400、420dpi、4GiB、x86_64 经 ARM64 兼容层运行开发 APK；APK SHA-256 为 `3fff66355689b9dd4d753bbee78452d89d2ea2ac6e19d4bcd3d569001600be2c`，Lunar JS `620a00fa531688fdc7277eef6a7afe3f475349b0`，适配包 `0.3.0-lunar.1`、内核 `9c9111ca2fc57f63ce81c65d3c4f80cb513610ae`。本次读取运行时没有更改 APK 或 JS 实现。

两本原创控制 EPUB 都通过 EPUBCheck，旧控制书校验见[原报告](../kusamakura-image-pagination/probe-epubcheck.json)，新增长正文书见[本次校验](../vertical-composition/epubcheck.json)。用户提供的 EPUB 和截图没有上传。

## 根因和修改

`runtime/page_artifact/fragment.rs` 从宿主行进入 inline-block 的内部行时，仍使用当前 `line_index`。内部第一个 run 与宿主第一个 run 都可能是 `(0,0,0)`。两层嵌套可产生三份相同地址；指针找到正确位置后，再按地址查找时却取到了另一段文字，产生 `InvalidCaret` 或错误范围。

进入原子子流程前先结束宿主段，内部行和之后的宿主文字便拥有递增且唯一的地址。只含源起点的收集路径保持同样的遍历推进。页文本、源节点路径、UTF-16 偏移、布局和绘制不变；私有工件地址不作为持久化书内位置。

## 独立分支验证

- 3 项最终回归在未修改的 dev 生产代码上全部失败：唯一且按阅读顺序排列的地址、盒内/嵌套/前后文字的单独选择与改字号后的标注、从盒内拖选到盒外的范围。
- 同一测试源码在修复后全部通过。fmt、Clippy（workspace/all-targets，拒绝 warnings）、全量测试 1019 通过、8 忽略。
- 原始负向记录见 `baseline-tests.log`，最终检查见 `checks.log`，逐字节源码核对见 `source-audit.json` 和 `baseline-source-audit.json`。保留 ICU 日语模型提示，不据此宣称分词能力已改变。

这与[四项修复的组合验证](../vertical-composition/README.md)分开：独立分支证明地址缺陷修复，组合验证检查新绘制路径下的竖排选区、跨页重排和新原生进程中的标注恢复。

## 复现

Linux 中为基线和修复提交分别做 LF Git 导出（`git -c core.autocrlf=false archive`），准备 Rust 1.95.0：

```sh
bash /evidence/scripts/check-inline-block-addresses.sh /base-export /fixed-export /output
```

脚本由本次分别执行的检查命令整理。切换来源前清理整个 workspace，基线仅叠加同一份测试，不修改生产代码。

要复现当前 Lunar 的运行时错误，从相同 Lunar 工作区启动 Metro、连接原开发 APK 并导入 CC0 控制书。在测试句柄 `__lunarImageAudit.runtime` 已指向该控制书的前提下，运行：

```sh
node /evidence/scripts/hermes-eval.mjs /evidence/scripts/inline-block-address-device.js --async
```

测试句柄的捕获方式沿用[前一轮设备步骤](../kusamakura-image-pagination/README.md)，脚本检查书名和章节；设备布局及字体以 `device.json` 为准。主机验证使用 SourceHanSerifCN、设备使用 WenKai，不能逐像素跨设备比较。当前 Android 安装包尚未采用修复，没有合并 PR、发布适配器或升级 Lunar 依赖。
