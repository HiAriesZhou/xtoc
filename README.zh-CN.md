<h1 align="center">
  <img src="apps/extension/assets/brand/wordmark.svg" width="280" alt="XTOC">
</h1>

<p align="center">
  <strong>跳到想读的章节，留下值得记住的原句。</strong><br>
  面向 X/Twitter 长文的轻量、开源阅读伴侣。
</p>

<p align="center">
  <a href="README.md">English</a> · 中文
</p>

<p align="center">
  <a href="https://github.com/HiAriesZhou/xtoc/releases"><img src="https://img.shields.io/badge/version-0.9.0-blue" alt="Version 0.9.0"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><img src="https://img.shields.io/chrome-web-store/size/nbdgpckkcfkomnmdefinikjijgljgjfp" alt="Chrome Web Store"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><img src="https://img.shields.io/badge/Chrome-Install-4285F4?logo=googlechrome&logoColor=white" alt="安装 Chrome 版本"></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/hpgegkkfhicelbjniafajmpicdjjmakf"><img src="https://img.shields.io/badge/Edge-Install-0078D7" alt="安装 Edge 版本"></a>
  <a href="https://addons.mozilla.org/firefox/addon/xtoc-navigate-clip-x-articles/"><img src="https://img.shields.io/badge/Firefox-Install-FF7139?logo=firefoxbrowser&logoColor=white" alt="安装 Firefox 版本"></a>
</p>

**Star 不会修复 Bug，但会让修 Bug 的人开心。**

XTOC 帮你浏览有标题结构的 X 长文，在阅读时连同来源上下文保存有用段落，并在读完后把摘录带到开放格式中。

## 视频演示

https://github.com/user-attachments/assets/b107995f-3b2a-4432-9530-48a93c886aa3

观看约 40 秒演示：目录导航、保存摘录、编辑标签与笔记，以及导出。

[体验交互演示](https://xtoc.arieszhou.com/)

## 使用方式

1. **浏览文章。** 打开长文后，目录直接出现在 X 右侧栏的推荐模块上方，阅读时始终可见；Focus mode 下显示在正文旁边。可在目录或 Popup 中跳到任意章节。
2. **保存原句。** 选中文字并点击 `save to xtoc`。XTOC 会在本地保存原文、所属文章、可识别到的作者、时间和前后文。
3. **整理并导出。** 在 Library 中搜索摘录、添加标签或笔记、删除内容，并将全部或选中摘录导出为 Markdown 或 JSON。

## 功能

- **文章导航**：识别 X.com 和 Twitter.com 长文的标题。有两个及以上章节的长文会显示一个低调的目录模块，跟随 X 的 Default 或 Lights out 主题和强调色，高亮当前章节，可折叠为一行。通过它的菜单可以弹出为可拖动、会记住位置的浮动目录，或在长文中隐藏（可在 Popup 或 **Settings** 中重新开启）。窗口较窄、X 不显示右侧栏时不显示目录模块，可改用 Popup 或浮动目录。
- **摘录**：选中文字一键保存到本地，同时记录所属文章、可识别到的作者、时间和前后文。
- **书签**：在 Popup 点击 **Save to Bookmarks** 保存当前文章或帖子，或从 X 书签页导入。导入只读取已加载的预览，不会修改你的 X 书签。
  再次导入时，可在同一账号、同一列表的上次导入位置停止；在导入菜单中选择 **Scan all bookmarks** 可检查更早的书签。首次导入、无法识别列表或导入记录失效时会完整扫描；页面加载失败时仍可能需要重试。在书签页打开 XTOC 弹窗，也能使用同样的导入按钮并查看进度，关闭导入条后仍可从这里重新开始。导入时请保持该标签页可见；标签页在后台时导入会暂停等待。
- **数据分析**：面向 X Premium 账号，把你自己的 X Analytics 整理得更易读：本期概要、曝光与互动趋势、新增关注与取关、从曝光到主页访问再到关注的转化、每条帖子与你平时水平的对比、你的帖子和受众最活跃的时段、哪些形式效果更好、回复哪些账号最有回报、谁回复或提及了你以及你是否回应、受众构成和每周节奏。
  点击 **Sync from X** 后，XTOC 会在同一浏览器（你已登录 X）的后台标签页打开 X Analytics，由 X 自己加载数据，再以同样方式读取你的 Mentions 时间线；XTOC 保留这些响应的副本并关闭标签页。它不会自己发送请求，也不需要 API Key。打开 X 时每日自动同步为可选项，默认关闭。多次同步会积累比 X 显示更长的历史，并记录每条帖子的增长过程。可以下载 Markdown 周报；配置 AI 后，也可以请 AI 简要解读，AI 只会收到汇总数字。
- **更新后无需刷新**：安装或更新 XTOC 后，已打开的 X 标签页可以直接继续使用。

从 Popup 或目录菜单打开 **Library**，包含四个页面：

- **Clips**：搜索、标注、删除和导出已保存的摘录。
- **Bookmarks**：搜索、标注、删除和导出已保存的文章和帖子。
- **Analytics**：从 X Analytics 同步的账号表现。
- **Settings**：文章目录显示、可选的 AI 设置、每日数据同步和本地数据管理。

Clips 和书签可导出为 Obsidian 风格的 Markdown：ZIP 中每篇文章或帖子一个笔记，带 YAML 属性和标签，摘录以引用 callout 呈现。Clips 也可导出为 JSON v1。可以导出全部，也可以只导出选中的内容。

可选 AI 每次为一条书签建议最多三个标签和一段简短摘要。在 **Settings** 中选择服务商（OpenAI、Anthropic Claude、Google Gemini、DeepSeek、OpenRouter、通义千问、Moonshot Kimi、xAI Grok，或任意 OpenAI 兼容地址），粘贴 API Key 并连接；XTOC 会读取该服务商的模型列表并预选一个轻量模型。只发送该书签已保存的正文和已有标签名，不发送笔记；点击 **Apply** 前不会修改任何内容。Key 默认只保存在本次浏览器会话中；开启 **Remember on this device** 后，会加密保存在本设备的扩展存储里，不会同步、导出，X 页面也无法读取。费用由服务商收取。

数据都保存在浏览器本地，无需单独注册 XTOC 账号；分析数据不会随摘录导出，可在 Settings 中删除。XTOC 会保存摘录供之后查看；它不会在原文中恢复高亮，也不会把摘录同步到云端。

## 安装

可从 [Chrome 应用商店](https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb)、[Microsoft Edge 附加组件商店](https://microsoftedge.microsoft.com/addons/detail/hpgegkkfhicelbjniafajmpicdjjmakf)或 [Firefox 附加组件商店](https://addons.mozilla.org/firefox/addon/xtoc-navigate-clip-x-articles/)安装 XTOC。

<details>
<summary>从源码安装</summary>

```bash
git clone https://github.com/HiAriesZhou/xtoc.git
cd xtoc/apps/extension
npm install
npm run build
```

然后打开 `chrome://extensions/`，启用开发者模式，点击**加载已解压的扩展程序**，选择 `dist/chromium`。

</details>

## 开发

扩展命令和 DashBye 均在 `apps/extension/` 下运行，以下路径相对于该目录。网站位于 [`apps/web/`](apps/web/README.zh-CN.md)；两个应用各自保留 npm lockfile，不使用根 workspace。

```bash
npm run dev
npm test
npm run build
npm run build:firefox
npm run build:edge
```

Chrome、Edge 和 Firefox 版本已在各自商店发布。Chromium、Firefox 和 Edge 有各自的构建目标，分发前仍需在对应浏览器中验证。

日常调试可运行 `npm run build:dev`，会额外在仓库根目录生成 `dist/chromium-dev`（其他构建仍在 `apps/extension/dist/`）：内容与正式构建相同，但名称为 **XTOC (Development)**，工具栏图标为带斜纹的橙色版本，便于与商店正式版区分。加载该目录代替 `dist/chromium`；它拥有独立的扩展 ID 和本地存储，二者跟随该目录路径，之后再运行 `build:dev` 会原地更新。发布 ZIP 始终使用未改标识的正式构建。

`npm run build:zip` 会构建三个平台，并把商店安装包写入 `release/`：`xtoc-chrome-v<版本>.zip`、`xtoc-edge-v<版本>.zip`、`xtoc-firefox-v<版本>.zip`，以及供 Firefox 附加组件审核使用的源码包 `xtoc-source-v<版本>.zip`（来自已提交的代码）。请先提交；扩展目录存在未提交改动时会跳过源码包。

## 隐私

正文、摘录、标签、笔记、设置和书签导入进度（你的 X 账号名和最近的书签 ID，用于再次导入时提前停止）保存在 `chrome.storage.local` 中；`unlimitedStorage` 权限仅用于避免保存的正文触及默认本地配额，不授予任何网站访问。`scripting` 权限用于在安装或更新后，让已打开的 X 标签页无需刷新即可继续使用 XTOC，不增加 X/Twitter 以外的网站访问。导出由用户主动触发。可选 AI 仅在你主动请求时，将一条书签的已保存正文和标签名直接发给配置的服务商；只按需申请该服务商的域名权限，页面脚本仍限于 X/Twitter。API Key 保存在扩展会话存储中；若选择 **Remember on this device**，则以 AES-GCM 加密（密钥为浏览器生成的不可导出密钥）保存在扩展自己的 IndexedDB 中，可避免明文落盘，但无法防范能控制该设备的人。Key 不会同步、导出或随资料库保存。“Remove key” 会在所有位置删除 Key 并撤销该服务商权限。不添加遥测、X 登录凭据收集、云端资料库或自动上传。

## 项目链接

[产品网站](https://xtoc.arieszhou.com) · [项目案例](https://www.arieszhou.com/zh/building#x-toc) · [参与贡献](apps/extension/CONTRIBUTING.md)

## 许可证

MIT。见 [LICENSE](LICENSE)。
