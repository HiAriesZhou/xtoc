<h1 align="center">
  <img src="public/wordmark.svg" width="280" alt="XTOC"><br>
  Landing Page
</h1>

<p align="center">
  XTOC 的公开网站。XTOC 是一个面向 X/Twitter 长文的阅读目录与轻量摘录浏览器扩展。
</p>

<p align="center">
  <a href="README.md">English</a> · 中文
</p>

## 仓库定位

本仓库用于维护 XTOC 的公开 landing page 和公开文档。

- 扩展源码：<https://github.com/HiAriesZhou/x-toc>
- 网站源码：<https://github.com/HiAriesZhou/x-toc-landing-page>
- Chrome Web Store：<https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb>

## 公开产品文案

XTOC 为 X/Twitter 长文提供文章目录、可移动阅读面板和轻量本地摘录能力。

公开文案应与已发布扩展能力保持一致：

- 识别 X/Twitter 长文中的标题结构。
- 在 Popup 中显示当前文章目录。
- 阅读时固定并拖动浮动目录。
- 选中文章文本后点击 `save to xtoc` 保存摘录。
- 在 Options 页面查看已保存 clips。
- 将全部或选中的 clips 导出为 Markdown 或 JSON。
- 使用 `chrome.storage.local` 在本地保存 clips。
- 不会把已保存 clips 发送到外部服务器。

- 隐私政策: [x-toc.vercel.app/privacy](https://x-toc.vercel.app/privacy)

## 开发

```bash
npm run dev
npm run lint
npm run build
```

## 内容规范

- README 保持为入口页。
- 公开网站文案应与已发布的 XTOC 扩展能力一致。
- 未发布规划保留在私有文档中。
- 不把未发布集成描述为已上线产品功能。
