# Language Made Easy — 沉浸式 Obsidian 英語學習工作區

> 🌐 其他語言版本: [English](./README-EN.md) · [简体中文](../../README.md) · 繁體中文 · [Deutsch](./README-DE.md) · [Français](./README-FR.md) · [Español](./README-ES.md) · [日本語](./README-JA.md) · [한국어](./README-KO.md) · [Русский](./README-RU.md) · [ไทย](./README-TH.md)

**Language Made Easy (LME)** 能把你的 Obsidian 筆記庫變成一套完整的沉浸式英語學習工作區：閱讀時即時查詞典、FSRS 間隔重複背單字卡、字幕同步跟讀影片，再加上 AI 智慧分析——全部整合在同一個地方，而且全部以純文字筆記的形式保存在你的筆記庫裡。

<p align="center"><img src="../../assets/screenshots/hero-overview.png" width="640" alt="一站式語言學習方案"></p>


> ### 💡 免費加值說明
> 本插件的基本功能可免費安裝與使用；進階功能可透過完整版一次解鎖——只需一次性買斷，即可終身享有後續所有更新。插件內的升級對話框會顯示購買連結。兩者的差異請見下方的[功能比較](#-free-basic-vs-full-edition)。
>
> **基礎版涵蓋完整的每日學習循環——查詞典、單字卡複習、跟讀與影片筆記；更多語言、跨裝置同步、批次處理等進階能力則包含在完整版中。**

---

## ✨ 全部功能模組

### 🎬 一鍵產生影片筆記——從連結到可跟讀的筆記，一步到位
貼上 YouTube / Bilibili 連結，插件會自動抓取標題、頻道與封面，建立結構化的字幕筆記並下載字幕——隨時可以開始跟讀。共有三個入口：
- **導覽面板**：搜尋框旁的「產生影片筆記」按鈕
- **跟讀工坊**：點擊左側功能區的工坊圖示，在輸入框中解析連結
- **YouTube 訂閱頁面**：瀏覽訂閱動態時即可為任何影片產生筆記，**支援多選批次下載**（完整版）

<p align="center"><img src="../../assets/screenshots/video-note.png" width="640" alt="產生的影片筆記"></p>

<p align="center"><img src="../../assets/screenshots/nav-video-note.gif" width="640" alt="在導覽面板輸入影片連結，一鍵產生影片筆記"></p>

**統一的筆記管理**：所有影片筆記都集中在工坊目錄頁，支援排序、篩選與分組；點擊卡片即可開始跟讀，Shift+點擊可預覽筆記。

<p align="center"><img src="../../assets/screenshots/workshop-catalog.png" width="640" alt="工坊目錄頁面"></p>

### 📖 詞典助理——什麼都能讀，隨手即時查
- **即時查詞**：對任何單字按 `Ctrl/Cmd + 雙擊`（或選取文字）——釋義立即出現在側邊欄
- **上下文擷取**：包含該單字的完整句子會自動存為它的例句
- **離線 MDX 詞典**：在桌面端載入本地 `.mdx`/`.mdd` 詞典，數量無上限（行動裝置匯入為完整版功能）
- **線上查詢後備鏈**：有道 → Google 翻譯 → MyMemory，全部是免費的公開 API，無需金鑰
- **發音**：音訊播放，並具備智慧預載入
- **一鍵加入**你的單字本（IndexedDB + 自動維護的 markdown 檔案）

<p align="center"><img src="../../assets/screenshots/dictionary-lookup.png" width="640" alt="雙擊查詞，側邊欄顯示釋義"></p>

### 🧠 FSRS 單字卡——學過的都記得住
- 最先進的 **FSRS 排程器**（`ts-fsrs`）為每一張卡片計算最佳複習間隔
- **翻面學習模式**，流暢的卡片動畫與翻頁音效
- **成長儀表板**：年度熱力圖、複習統計、每日複習提醒
- **單字卡管理器**：搜尋、依語言/熟練度篩選、排序、行內編輯、批次刪除
- **學習小夥伴** 🐣：一個會孵化、升級、隨你的連續學習天數一起成長的小夥伴

<p align="center"><img src="../../assets/screenshots/flashcard-review.png" width="300" alt="單字卡複習"> <img src="../../assets/screenshots/flashcard-review-2.png" width="300" alt="單字卡複習統計"></p>

<p align="center"><img src="../../assets/screenshots/one-click-cards.png" width="640" alt="一鍵建立單字卡流程"></p>
<p align="center"><img src="../../assets/screenshots/batch-generate.png" width="640" alt="AI 批次產生單字卡（完整版）"></p>

### 🎬 影片跟讀工坊——從真實影片中學習
- **YouTube、Bilibili 與本地影片/音訊**檔案，集中在一個工作區
- **從 URL 產生影片筆記**，將字幕下載進筆記，隨時離線練習
- **即時字幕同步**，播放時自動捲動
- **跟讀模式與聽寫模式**——一鍵在「跟著複述」與「聽寫下來」之間切換
- **精準的播放控制**：0.8x / 1.0x / 1.25x 倍速，快速後退 -5s / -10s
- **工坊目錄頁**：所有字幕筆記井然有序，支援排序、篩選與分組

<p align="center"><img src="../../assets/screenshots/shadowing-mode.png" width="315" alt="跟讀模式"> <img src="../../assets/screenshots/dictation-mode.png" width="315" alt="聽寫模式"></p>
<p align="center"><em>左為跟讀模式，右為聽寫模式</em></p>

<p align="center"><img src="../../assets/screenshots/listening-mode-2.png" width="640" alt="聽力模式"></p>
<p align="center"><img src="../../assets/screenshots/record-pronunciation.png" width="640" alt="錄音並取得 AI 發音評分"></p>
<p align="center"><img src="../../assets/screenshots/focus-mode.png" width="640" alt="專注模式"></p>
<p align="center"><em>專注模式</em></p>

### ✨ AI 智慧分析——使用你自己的 API 金鑰
- **6 種內建分析模板**：綜合分析、單字難度、文化背景、雙語精讀、閱讀測驗與挖空挑戰
- 每份報告中的**時間戳記皆可點擊**——直接跳回影片中的對應時刻
- **報告歷史與目錄**：瀏覽、搜尋、分組並重新開啟過去的報告
- 針對跟讀錄音提供 **AI 發音評分**
- **一鍵 AI 自動補全單字卡**：讓 AI 填補卡片上缺少的欄位
- 相容於 **OpenAI、DeepSeek、Google Gemini、Kimi、GLM、Qwen、OpenRouter 或任何 OpenAI 相容端點**——你的金鑰、你的選擇、你的資料

<p align="center"><img src="../../assets/screenshots/ai-analysis-2.png" width="640" alt="AI 智慧分析報告"></p>

### 📺 YouTube 頻道訂閱
- 訂閱頻道，支援**分類、RSS 輪詢與新影片通知**
- 以卡片/清單檢視瀏覽訂閱動態，並可**在應用程式內預覽影片**，不必離開 Obsidian
- **一鍵產生含字幕的影片筆記**，包括多選批次下載

<p align="center"><img src="../../assets/screenshots/youtube-subscriptions.png" width="640" alt="YouTube 頻道訂閱"></p>

### 📝 還有更多
- **SRT 轉筆記**（單檔與批次），適用你自己的字幕檔
- **字彙量測驗**——透過抽樣測驗估算你的字彙量
- 內建 **HTML 新手指南**
- **10 種主題**：紙墨、薄荷工坊、玫瑰腮紅、薰衣草之夢、糖果流行、靜心綠洲、珊瑚暖陽、海洋琉璃、極光稜鏡與暗夜檸檬
- 完整支援**桌面端與行動裝置**

---

## 🆓 免費（基礎版）vs 完整版

基礎版永久免費。**完整版**解鎖以下所有進階模組——**一次買斷、終身使用、免費更新**：

| 功能模組 | 基礎版（免費） | 完整版 |
|---|:---:|:---:|
| 詞典查詢（雙擊查詞 / 上下文擷取 / 發音 / 單字本） | ✅ | ✅ |
| 本地 MDX 詞典（桌面端） | ✅ | ✅ |
| 行動裝置詞典（匯入後離線查詢） | — | ✅ |
| 跨裝置單字卡同步 | — | ✅ |
| FSRS 單字卡（翻面模式 / 統計 / 小夥伴） | ✅ | ✅ |
| AI 分析（6 種模板 / 評分 / 單字卡自動補全） | **部分** | **完整** |
| 跟讀工坊（跟讀 / 聽寫 / 倍速控制） | ✅ | ✅ |
| 影片筆記產生（含字幕下載） | ✅ | ✅ |
| SRT 轉筆記、字彙量測驗、YouTube 訂閱與預覽 | ✅ | ✅ |
| **更多學習語言**：德語 / 法語 / 西班牙語 / 韓語 / 俄語 / 日語 | — | ✅ |
| **9 款額外 UI 主題**（經典紙墨之外） | — | ✅ |
| 訂閱頁面的**一鍵 / 批次字幕下載** | — | ✅ |
| **影片書籤筆記**（截圖 + 跳回精確時刻） | — | ✅ |
| 從任何筆記 **AI 批次產生單字卡** | — | ✅ |
| **一鍵分級字彙標註**（Oxford CEFR 3000/5000 + 中國大陸考試字表） | — | ✅ |
| **單字卡資料匯入 / 匯出**（JSON / TXT / MD / CSV） | — | ✅ |
| **將 AI 報告存為本地檔案**（筆記 / HTML / 長圖） | — | ✅ |
| **影片教學卡**（播放期間彈出測驗） | — | ✅ |
| **聽力 / 打字單字卡複習模式** | — | ✅ |
| **自訂 AI 提示詞模板**（新增 / 編輯你自己的模板） | — | ✅ |

## 🛒 解鎖完整版

完整版為**一次性買斷**（無訂閱制），並附**終身免費更新**。可前往作者的官方商店購買：

- **小红书 (Xiaohongshu)**: https://xhslink.com/m/4ke3sdw1uXp
- **B站 (Bilibili)**: https://b23.tv/QYtaP7T
- **视频号小店 (WeChat Channels store)**: https://store.weixin.qq.com/shop/a/T9WX95cCebFqe4F

對使用方式或完整版有疑問？掃描 QR Code 加入作者的微信：

<p align="center"><img src="../../assets/wechat-qr.jpg" width="200" alt="加入作者的微信" /></p>

---

## 🚀 安裝

**從 Obsidian 社群外掛目錄安裝（推薦）**：設定 → 社群外掛 → 瀏覽 → 搜尋「Language Made Easy」→ 安裝 → 啟用。

**手動安裝**：從最新的 [release](https://github.com/PandoraReads/language-made-easy-lite/releases) 下載 `main.js`、`manifest.json` 與 `styles.css`，放入 `.obsidian/plugins/language-made-easy/`，然後在設定 → 社群外掛中啟用插件。

### 開始使用
1. **AI 功能（選用）**——在插件設定中使用你自己的 API 金鑰新增 LLM 供應商（OpenAI / DeepSeek / Gemini / Kimi / GLM / Qwen / OpenRouter / 自訂 OpenAI 相容端點）
2. **詞典（選用）**——註冊本地 MDX 詞典，或使用免費的線上查詢鏈
3. **單字本**——選擇自動維護的單字檔案所在的資料夾
4. 點擊畢業帽功能區圖示開啟**導覽面板**，開始探索

## 🌐 網路使用情形

除了以下由使用者主動發起的選用請求外，插件完全離線運作：

- **詞典 / 翻譯 / 發音**：`dict.youdao.com`、`translate.googleapis.com` / `translate.google.com`、`dict.iciba.com`、`api.mymemory.translated.net`
- **影片與字幕**（當你開啟/下載影片或重新整理訂閱時）：`www.youtube.com`、`i.ytimg.com` / `img.youtube.com`、`api.bilibili.com`、`www.bilibili.com`、`b23.tv`；在行動裝置上，YouTube 內嵌會改用 Obsidian 官方代理 `releases.obsidian.md`
- **AI 功能**（僅在你設定了供應商時）：你所選供應商的端點，並使用**你自己的 API 金鑰**呼叫
- MDX 詞典為本地檔案——不會下載任何內容

## 🔒 隱私

- **無遙測、無分析追蹤、無帳號系統**
- 唯一離開你裝置的資料，是你主動發起的查詞/翻譯請求，以及**你自己**設定的 AI 供應商

**筆記庫之外的檔案**：詞典設定可能指向存放在裝置其他位置的 MDX 檔案；插件只會讀取你明確選擇的檔案。

## 📋 更新日誌

### 4.2.0

- **介面支援 10 種語言**——英語、簡體/繁體中文、德語、法語、西班牙語、日語、韓語、俄語與泰語。介面預設跟隨 Obsidian 的語言設定，並可在設定中覆寫；切換後已開啟的檢視會立即重新渲染。
- **AI 報告本地化**——新增英語提示詞變體，且在非中文介面上報告會以你的介面語言撰寫。
- **更聰明的翻譯鏈**——翻譯目標語言跟隨介面語言，非英語的學習語言預設使用 Google 翻譯。
- **購買流程本地化**——非中文介面的升級對話框會開啟官方網站。
- **多語言內建指南**——HTML 指南提供全部 10 種介面語言版本。
- **導覽面板優化**——統計數據與快捷操作按鈕能適應長單詞語言：數字保持在同一行對齊，標籤不會換行或重疊，按鈕文字最多顯示兩行。
- 導覽面板與單字卡複習檢視中的捲軸**完全隱藏**。
- manifest 中的插件描述提供雙語（英文 + 中文），中文 README 亦附雙語簡介。

## 🛠 開發

- 環境需求：Node.js 18+
- `npm install` · `npm run dev`（監看模式）· `npm run build:release`（可讀、未壓縮的打包檔，符合社群目錄要求）· `npm test`

## 📄 授權條款

[GPL-3.0](../../LICENSE)

## ❤️ 支持我們

發現錯誤或有新點子？歡迎在本儲存庫開立 issue。你也可以在微博 / 小红书 / 视频号上找到作者 **PandoraReads**（潘多拉的数字花园）。

---

*「讓語言學習像呼吸一樣自然。」— Language Made Easy*
