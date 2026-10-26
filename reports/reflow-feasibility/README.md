# 字号重排：同会话请求工件的可行性诊断

**没有实现或验证产品层的会话复用优化。** 这里先回答：Lunar 当前锁定的原生 SDK 是否已经允许同一会话按新字号排版，以及当前完整重排是否有重复加载成本。诊断显示存在值得继续开发的空间，不能把两种不同范围的计时直接当成最终提速比例。

## 源码与环境

测量时 JS 为 `620a00fa531688fdc7277eef6a7afe3f475349b0`（独立导入优化分支）；该提交 `apps/mobile/src/reader/runtime` 相对 `main@4641589` 没有改动。`LunarReaderRuntime.updateLayout()` 仍先取消、释放所有会话资源，再 `loadData` 整包读取和 `loadCurrentRequest`；原生 session、宿主字体注册及页面画面按完整路径重新准备。

同一公开 development APK、API 36 模拟器及原生版本身份见[关闭时序报告](../reader-close-pending/README.md#android-实际验证)：APK SHA `3fff66355689b9dd4d753bbee78452d89d2ea2ac6e19d4bcd3d569001600be2c`，`rito-rn@0.3.0-lunar.1`，内核 `9c9111ca`，4 GiB、1080×2400、420 dpi、x86_64／ARM64 转译。公开原始《白鲸》SHA `81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4`，来源和授权见[根说明](../../README.md)。没有用户私有资源。

正式诊断使用新应用进程，启动续读关闭；开始时原生 ReaderSession 模块尚未初始化。生产 runtime 工厂读取公开样书并定位第 1 章开头，暂停这次会话的后台分页。无可见 Canvas，不包含阅读页 Hook 的邻页预热、React 状态订阅、GPU 呈现或选区交互。视口 411×914、像素比 2.625、文楷、行高 1.65，完整输入见 [reader-close-input.js](../../scripts/reader-close-input.js)，与该诊断保存的 layout 相同。

## 方法与结果

先通过当前 publication 的操作队列调用现有 SDK 的 `requestArtifact`，沿用 session、request 的其余参数与源 locator，仅修改 rootFontSize；记录工件信息后释放候选。验证未采用的候选没有改变当前可见工件。然后调用生产 `runtime.updateLayout()` 完整重排，比较新工件的文字、实际字体大小及 DisplayList 的 semanticDigest。循环字号为 20、22、18px。

| 字号 | 同会话候选请求及信息收集 ms | 完整 runtime 重排 ms | 页文字／绘制语义 SHA |
|---|---:|---:|---|
| 20 | 382.86 | 1174.34 | 均相同 |
| 22 | 79.33 | 630.95 | 均相同 |
| 18 | 66.12 | 739.29 | 均相同 |

原字号 18px 的首次 `runtime.open` 为 6776.09ms，其中读取 88.98ms、backend.open 3212.91ms、画面准备 223.13ms，其余还包括前置字体准备等工作；分项计时不是全部阶段的完整归因。候选使用原会话 1／2／3，完整重排则新建会话 2／3／4。实际字号数组分别为 `[30,20]`、`[33,22]`、`[27,18]`，确认不是复用了未改变字号的旧画面。

原始文件为 [fresh-process-result.json](fresh-process-result.json)，摘取结果和执行脚本 SHA 见 [summary.json](summary.json)。候选计时涵盖 `requestArtifact` 和信息收集，不包含 finally 中释放工件；完整 runtime 计时还包括旧资源清理、整包读取、重新打开、字体与图片／画面准备。因此它们**不是同一完成标准**，不能写成“Lunar 重排已提速 N 倍”。即便文字和绘制语义摘要相同，也没有验证像素、搜索、标注、跨页和重开定位。

单个样本、一个章节、每个字号一次、固定顺序，且完整重排总发生在候选之后，可能存在预热影响。与早期 UI 有后台分页的 6–7 秒数据也不可直接比较。未来优化需要相同完成范围的成组对照，并重新检查内存和阅读交互。

首次准备未清除旧原生会话，报 `reader session already exists: 1`，保存在 [invalid-initial-setup.json](diagnostics/invalid-initial-setup.json)。该次不参与计时，不单凭它认定应用存在 session ID 缺陷。后续按新进程和初始化前置检查重新执行，得到本报告的数据。

## 复现与后续实现要求

与关闭报告相同地安装 APK、复制公开样书到测试包 `files/perf/moby-dick.epub`，用专用检出在上述 JS 提交启动 Metro；先暂时关闭续读，随后 force-stop 并冷启动，保持书库界面，保证没有活动阅读会话。依次从 Lunar 根目录运行：

```sh
node /evidence/scripts/hermes-eval.mjs /evidence/scripts/reader-close-input.js
node /evidence/scripts/hermes-eval.mjs /evidence/scripts/reader-reflow-diagnostic.js --async
```

脚本会通过前置检查拒绝重复性能包装或已初始化的原生会话，结束时调用 runtime.close。若观察超时，先看同一个 `__lunarAuditTask`，不要重跑。测试后恢复原续读设置；本轮已恢复 true，记录在关闭报告。

后续实现应当保留同书、相同字体资源下的原生会话和宿主资源，通过新修订及候选工件完成字号重排。至少需要验证：可见工件提交与失败回滚；后台分页排队；快速连续字号变化；关闭／换书与候选竞态；字体文件变更时回退；图片和字体缓存边界；标注、搜索及重开定位。**只有源字节缓存不够，也不能直接采用这个低层候选就宣称完整路径已优化。** 关闭时序修复 [Lunar #13](https://github.com/Umbrae-Labs/lunar/pull/13) 单独评审，不混入此诊断。
