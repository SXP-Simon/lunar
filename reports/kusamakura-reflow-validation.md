# 《草枕》对照版重排与重启恢复

使用 `kusamakura-vertical-only.epub`，SHA-256 `5eee439293bd53cb2c284a9b988e8e15013aa433a415d10427fbf7bd1bc62a0d`。仅移除原书 16 个未启用的 horizontal.css alternate 引用；生成器、改动清单和 EPUBCheck 在本证据分支已有记录。正文、字体、图片与授权信息保留，沿用原样书许可。不能把此变体的表现算成原版已经通过。

身份与版面设置同本分支 Ruby 报告，仍使用安装包锁定的 `0.3.0-lunar.1`，没有采用上游未发布修复。进入第一章后向后翻 4 页，记录中途位置，再通过实际设置面板触发重排。

1. 初始根字号请求 20 px、左右边距 24 px，全书 401 页。
2. 字号请求改为 22 px：CSS 的 `html { font-size:14pt }` 仍控制正文字号。实际绘制正文为约 18.667 px，Ruby 为约 9.333 px，和更改前相同。因此不将这一操作当作有效重分页证据。
3. 左右边距 24→40 px：全书变为 439 页，页内容发生变化。恢复页在原段落之前多容纳了几行，但原先页首开始的连续 60 字仍在该页内，没有回到章首。源位置随新页边界调整。
4. 强制结束应用、冷启动后实际恢复到第一章相同源位置，页文本与重排后相同，22 px 设置请求和 40 px 边距也保留。

读者定位结果仅证明这个中途位置的重排与恢复，不证明所有章节或选区均正确。Ruby 视觉展示可见，但竖排命中和标注坐标已有独立缺陷，见 `ruby-vertical-validation.md` 和 Rito #43。

数据：`kusamakura-before-reflow.json`、`kusamakura-after-reflow.json`、`kusamakura-after-margin-reflow.json`、`kusamakura-reopened.json`；主要断言见 `kusamakura-reflow-summary.json`。截图 `device/kusamakura-chapter1-before-reflow.png`、`device/kusamakura-reopened.png`。中间设置面板截图只用于核对设置值，不作为正文版面验收截图。

这些数据来自安装包实际运行时与分页工件。临时诊断句柄只读取状态，不修改渲染，不进入代码 PR。没有把后台分页完成耗时当成干净性能基准。
