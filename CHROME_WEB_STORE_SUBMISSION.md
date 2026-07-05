# Chrome Web Store 上架资料

> 适用于当前版本 `0.1.4`。上架前先在 `chrome://extensions/` 重新加载并自测一次。

## 需要上传的包

- 扩展包：`release/yt-bili-helper-0.1.4.zip`
- 商店图标：`store-assets/icon-128.png`
- 截图：
  - `store-assets/screenshots/01-youtube-sidebar-match.png`
  - `store-assets/screenshots/02-youtube-sidebar-related.png`
  - `store-assets/screenshots/03-settings.png`
- 小宣传图：`store-assets/promotional/small-promo-440x280.png`
- Marquee 宣传图，可选：`store-assets/promotional/marquee-1400x560.png`

## Store Listing

### Product details

**名称 / Name**

```text
B站同源助手 for YouTube™
```

**一句话简介 / Summary**

```text
在 YouTube™ 视频页寻找 B站同源或相近视频，一键跳转观看，节省跨境视频流量。
```

**详细描述 / Description**

```text
B站同源助手 for YouTube™ 会在 YouTube™ 视频页右侧推荐区顶部，自动寻找 B站上可能同源或相近的视频。

它适合经常看中文视频、但希望减少跨境视频流量的用户：继续用 YouTube™ 做内容发现和推荐，找到合适内容后，一键跳到 B站观看。

主要功能：
• 自动读取当前视频标题、频道名和时长
• 自动搜索 B站候选视频
• 区分“很像同一个”和“可能相关”
• 高置信结果支持一键打开、点赞打开
• 打开 B站或 B站搜索前会暂停当前 YouTube 视频，避免后台继续播放
• 低置信结果只提供“打开看看”和“去 B站搜”，避免误点赞
• 搜索接口被风控时，会尝试用 B站搜索页兜底
• 你的确认记录仅保存在本机 Chrome 存储中

注意：
• 本扩展不会伪造 YouTube™ 内部上报请求；点赞使用当前页面已有的 YouTube™ 点赞按钮。
• 如需真正节省流量，请确保你的代理规则让 bilibili.com、hdslb.com、bilivideo.com 走直连或国内线路。

本扩展不是 YouTube、Google、哔哩哔哩或 Bilibili 的官方产品，也不与这些公司存在隶属、赞助或背书关系。
YouTube is a trademark of Google LLC. Bilibili and 哔哩哔哩 are trademarks of their respective owners.
```

**类别 / Category**

```text
Productivity
```

**语言 / Language**

```text
Chinese (Simplified)
```

**官方网站 / Homepage URL，可选**

如果你有 GitHub 仓库或项目页，填项目页；没有可以先留空。

**支持网址 / Support URL，建议**

如果你有 GitHub Issues，填 Issues 地址；没有可以先留空。

### Graphics

Chrome Web Store 当前图像要求建议按以下规格准备：

- Store icon：`128x128` PNG，已生成 `store-assets/icon-128.png`
- Screenshots：`1280x800` 或 `640x400`，PNG/JPEG，至少 1 张，建议 3-5 张
- Small promotional tile：`440x280`，已生成
- Marquee promotional tile：`1400x560`，可选，已生成

本项目已生成的图片都没有直接使用 YouTube 或 B站官方 logo，避免商标审核风险。

## Privacy

### Single purpose

```text
在 YouTube™ 视频页为当前视频寻找 B站同源或相近视频，并提供打开、搜索、点赞当前 YouTube™ 视频、暂停当前视频等明确的用户操作。
```

### Permission justification

**storage**

```text
用于在本机保存用户设置、已确认的视频匹配记录和搜索缓存。数据不会发送到扩展开发者服务器。
```

**tabs**

```text
用于在 B站 API 被风控或没有返回有效结果时，临时打开一个非激活的 B站搜索标签页，读取公开搜索结果后自动关闭。
```

**https://api.bilibili.com/**

```text
用于根据当前 YouTube™ 视频标题搜索 B站公开视频候选结果。
```

**https://search.bilibili.com/**

```text
用于在 API 搜索失败时读取 B站公开搜索结果，作为兜底匹配来源。
```

**https://www.bilibili.com/**

```text
用于打开用户选择的 B站视频页面，并兼容 B站相关公开页面资源。
```

**https://www.youtube.com/**

```text
用于在 YouTube™ 视频页读取当前视频标题、频道名、时长，并在页面右侧推荐区显示助手面板。用户点击“点赞打开”时，会操作当前页面已有点赞按钮；用户打开 B站页面前，会暂停当前播放器。
```

### Data usage

建议采用保守披露：

- 如果后台要求选择数据类型，选择 `Website content`。
- 如果后台单独询问浏览活动、页面 URL 或用户活动，按实际表单选择与“当前页面标题/视频页信息/用户按钮点击”最接近的选项。
- 不要选择个人身份、健康、金融、认证、通信、位置等无关类型。

可填说明：

```text
扩展会读取当前 YouTube™ 视频页的标题、频道名、时长和视频 ID，用于搜索 B站公开候选结果和在本机保存用户确认记录。扩展没有开发者自有服务器，不会出售、转让或将这些信息用于广告画像。
```

### Remote code

```text
No. All extension logic is bundled in the submitted package. The extension requests B站公开搜索接口和公开搜索页结果，但不会下载或执行远程代码。
```

### Privacy policy

Chrome Web Store 需要一个公开可访问、直接打开隐私政策正文的 URL。当前建议填：

```text
https://icoolqin.github.io/yt-bili-helper/privacy/
```

## Distribution

**Visibility**

建议先选：

```text
Unlisted
```

通过审核并自己装一轮后，再切到：

```text
Public
```

**Regions**

```text
All regions
```

**Pricing**

```text
Free
```

**Mature content**

```text
No
```

## 审核测试说明

如果后台有 `Test instructions` 或审核说明，填：

```text
No login is required.

1. Install the extension.
2. Open any public YouTube™ video page.
3. Wait for the right sidebar helper panel to appear.
4. If a B站 result is found, click “打开” or “打开看看”.
5. If no result is found, click “去 B站搜” to verify the fallback search behavior.
6. Optional: open the extension popup to view settings.

The extension does not use a developer-operated server. B站 search availability may vary due to public B站 anti-abuse checks.
```
