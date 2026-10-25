# 自动折行后的连续正文无法完整搜索

原创 CC0 样本 `search-wrap-probe.epub`，SHA-256 `3217b1cb335c9b10d84e7816b88d70a05ab767b28411f287b9fbca78884faabb`，EPUBCheck 0 错误、0 警告。完整中英文句子各位于同一个 `<p>` 内，源码没有软换行；另设 `<br/>` 与不同段落的对照，避免修复时把结构边界全部抹掉。

应用与内核身份同目录状态报告。实测字号 22、左右边距 40、411×914 CSS px，全部内容在同一页。通过真实安装包的 Lunar 公开运行时 `search({query})` 调用；当前没有验收搜索界面。

- 连续中文整句：0 个结果。
- 连续英文整句：0 个结果。
- 同行短查询“清晨的微风”“visual lines.”：各 1 个结果。
- 删除视觉换行后，整个中文句子确实存在于这一页的索引文本中；英文恢复软换行处的空格后也完整存在。因此不能归因为跨页搜索范围或内容未加载。
- 硬换行两侧、独立段落的无分隔拼接查询：0 个结果，这是保留结构边界的负例，并非要求将它们也拼接匹配。

原始响应、版面参数和页文本见 `reports/search-wrap-device-runtime.json`，截图为 `device/search-wrap-probe-ready.png`。源码与实际页面文本比较说明：页面索引插入的视觉换行参与了字面匹配。

## 复现脚本

导入本样本并打开；在本地开发构建临时给 `LunarReaderRuntime.open` 增加 `globalThis.__lunarAuditRuntime = this`（TypeScript 需要对应类型断言），冷启动后重新打开书，再从 Lunar 仓库根目录执行：

```sh
node /path/to/evidence/scripts/metro-evaluate.mjs /path/to/evidence/scripts/search-wrap-device-audit.js --async
```

Metro 使用 8081 端口，ADB reverse 对应端口，已安装开发 APK；脚本校验书名后才读取数据。`metro-evaluate.mjs` 通过当前工作区锁定的 ws 包连接 Hermes，脚本只临时诊断，不进入应用产品代码。读取结束移除句柄并冷启动。

## 修复边界

应在 Rito 索引/搜索层区分视觉折行与源结构换行，并保持 UTF-16 偏移、源节点范围和高亮几何可映射。中日韩软换行通常应接回连续文字，英文可能需恢复空格。不能统一删除所有空白、硬换行与段落边界，也不能只改 Lunar 查询字符串。本报告没有声称修复已进入安装包。
