# Language Made Easy — Immersive Obsidian English Learning Workspace

> 中文文档：见 [README.md](./README.md)

**Language Made Easy (LME)** turns your Obsidian vault into a complete immersive English-learning workspace: instant dictionary lookup while reading, FSRS spaced-repetition flashcards, video shadowing with synced subtitles, and AI-powered analysis — all in one place, all stored as plain notes in your vault.

<p align="center"><img src="./assets/screenshots/navigation.png" width="640" alt="LME navigation panel"></p>

> ### 💡 Freemium notice
> The basic features of this plugin are free to install and use; advanced features are fully unlocked with the Full Edition — a one-time purchase, with lifetime access to all future updates. The in-plugin upgrade dialog shows the purchase links. See the [feature comparison](#-free-basic-vs-full-edition) below for the differences.
>
> The Basic Edition is for trying out and light learning; for heavy long-term use, batch processing, or multiple languages, upgrade to the Full Edition.

---

## ✨ All Feature Modules

### 🎬 One-Click Video Notes — from link to shadowing-ready note in one step
Paste a YouTube / Bilibili link and the plugin fetches the title, channel, and cover, creates a structured subtitle note, and downloads the subtitles — ready for shadowing anytime. Three entry points:
- **Navigation panel**: the "Generate video note" button next to the search box
- **Shadowing workshop**: click the workshop icon in the left ribbon and parse a link in the input box
- **YouTube subscriptions page**: generate notes for any video while browsing your feed, **with multi-select batch download** (Full Edition)

**Unified note management**: all video notes live in the workshop catalog page with sorting, filtering, and grouping; click a card to start shadowing, Shift+click to preview the note.

### 📖 Dictionary Assistant — read anything, look up instantly
- **Instant lookup**: `Ctrl/Cmd + double-click` any word (or select text) — definitions appear in the sidebar instantly
- **Context capture**: the full sentence containing the word is automatically saved as its example sentence
- **Offline MDX dictionaries**: load up to 5 local `.mdx`/`.mdd` dictionaries per language (desktop path-based, or import on mobile)
- **Online fallback chain**: Youdao → Google Translate → MyMemory, all free public APIs, no key needed
- **Pronunciation**: audio playback with smart preloading
- **One-click add** to your vocabulary notebook (IndexedDB + auto-maintained markdown file)

<p align="center"><img src="./assets/screenshots/dictionary-lookup.png" width="640" alt="Double-click lookup with sidebar definitions"></p>

### 🧠 FSRS Flashcards — remember what you learn
- State-of-the-art **FSRS scheduler** (`ts-fsrs`) computes optimal review intervals for every card
- **Flip study mode** with smooth card animations and page-turn sound
- **Growth dashboard**: year heatmap, review statistics, daily review reminder
- **Flashcard manager**: search, filter by language/mastery, sort, inline edit, bulk delete
- **Learning companion pet** 🐣: a small companion that hatches, levels up, and grows with your streaks

<p align="center"><img src="./assets/screenshots/batch-flashcards.png" width="640" alt="AI batch flashcard generation (Full Edition)"></p>

### 🎬 Video Shadowing Workshop — learn from real videos
- **YouTube, Bilibili, and local video/audio** files in one workspace
- **Generate a video note from a URL**, download subtitles into it, and practice offline anytime
- **Real-time subtitle sync** with auto-scroll during playback
- **Shadowing mode & dictation mode** — one-click switch between repeat-after and write-what-you-hear
- **Precise playback control**: 0.8x / 1.0x / 1.25x speed, quick -5s / -10s jumps
- **Workshop catalog page**: all your subtitle notes organized with sorting, filtering, and grouping

<p align="center"><img src="./assets/screenshots/dictation-mode.png" width="640" alt="Video shadowing and dictation mode"></p>

### ✨ AI-Powered Analysis — bring your own API key
- **6 built-in analysis templates**: comprehensive analysis, vocabulary difficulty, cultural background, bilingual close-reading, reading quiz, and blind-fill challenge
- **Clickable timestamps** in every report — jump straight back to the moment in the video
- **Report history & catalog**: browse, search, group, and re-open past reports
- **AI pronunciation scoring** on shadowing recordings
- **One-click flashcard auto-fill**: let AI complete missing fields on your cards
- Works with **OpenAI, DeepSeek, Google Gemini, Kimi, GLM, Qwen, OpenRouter, or any OpenAI-compatible endpoint** — your key, your choice, your data

<p align="center"><img src="./assets/screenshots/ai-analysis.png" width="640" alt="AI-powered analysis report"></p>

### 📺 YouTube Channel Subscriptions
- Subscribe to channels with **categories, RSS polling, and new-video notifications**
- Browse your feed in card/list views and **preview videos in-app** without leaving Obsidian
- **One-click video-note generation with subtitles**, including multi-select batch download

<p align="center"><img src="./assets/screenshots/youtube-subscriptions.png" width="640" alt="YouTube channel subscriptions"></p>

### 📝 And more
- **SRT to note** conversion (single & batch) for your own subtitle files
- **Vocabulary size test** — estimate your vocabulary with sampling tests
- Bundled **HTML newcomer guide**
- **10 themes**: Paper & Ink, Mint Atelier, Rose Blush, Lavender Dream, Candy Pop, Mindful Oasis, Coral Warmth, Ocean Glass, Aurora Prism, and Dark Lemon
- Full **desktop and mobile** support

---

## 🆓 Free (Basic) vs Full Edition

The Basic Edition is free forever. The **Full Edition** unlocks every advanced module below — **one-time purchase, lifetime use, free updates**:

| Feature module | Basic (free) | Full Edition |
|---|:---:|:---:|
| Dictionary lookup (double-click / context capture / pronunciation / notebook) | ✅ | ✅ |
| Local MDX dictionaries | **1** | **5** |
| FSRS flashcards (flip mode / stats / sync / pet companion) | **250-card cap** | **Unlimited** |
| AI analysis (6 templates / scoring / flashcard auto-fill) | **Partial** | **Full** |
| Shadowing workshop (shadowing / dictation / speed control) | ✅ | ✅ |
| Video-note subtitle download | **5 per day** | **Unlimited** |
| SRT to note, vocabulary test, YouTube subscriptions & preview | ✅ | ✅ |
| **More languages**: German / French / Spanish / Korean / Russian / Japanese | — | ✅ |
| **9 extra UI themes** (beyond Classic Paper & Ink) | — | ✅ |
| **One-click / batch subtitle download** from the subscriptions page | — | ✅ |
| **Video bookmark notes** (screenshot + jump back to the exact moment) | — | ✅ |
| **AI batch flashcard generation** from any note | — | ✅ |
| **One-click graded vocabulary annotation** (Oxford CEFR 3000/5000 + CN exam wordlists) | — | ✅ |
| **Flashcard data import / export** (JSON / TXT / MD / CSV) | — | ✅ |
| **Save AI reports locally** (note / HTML / long image) | — | ✅ |
| **Video teaching cards** (quiz popups during playback) | — | ✅ |
| **Listening / typing flashcard review modes** | — | ✅ |
| **Custom AI prompt templates** (add / edit your own) | — | ✅ |

## 🛒 Unlock the Full Edition

The Full Edition is a **one-time purchase** (no subscription) with **lifetime free updates**. Get it from the author's official stores:

- **小红书 (Xiaohongshu)**: https://xhslink.com/m/4ke3sdw1uXp
- **B站 (Bilibili)**: https://b23.tv/QYtaP7T
- **视频号小店 (WeChat Channels store)**: https://store.weixin.qq.com/shop/a/T9WX95cCebFqe4F

Questions about usage or the Full Edition? Scan the QR code to add the author on WeChat:

<p align="center"><img src="./assets/wechat-qr.jpg" width="200" alt="Add the author on WeChat" /></p>

---

## 🚀 Installation

**From the Obsidian Community directory (recommended)**: Settings → Community plugins → Browse → search "Language Made Easy" → Install → Enable.

**Manual**: download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/PandoraReads/language-made-easy-lite/releases) into `.obsidian/plugins/language-made-easy/`, then enable the plugin in Settings → Community plugins.

### Getting started
1. **AI features (optional)** — add an LLM provider with your own API key in plugin settings (OpenAI / DeepSeek / Gemini / Kimi / GLM / Qwen / OpenRouter / custom OpenAI-compatible)
2. **Dictionaries (optional)** — register local MDX dictionaries, or rely on the free online chain
3. **Vocabulary notebook** — pick the folder for the auto-maintained vocabulary file
4. Click the graduation-cap ribbon icon to open the **navigation panel** and explore

## 🌐 Network usage

The plugin works fully offline except for the following optional, user-initiated requests:

- **Dictionary / translation / pronunciation**: `dict.youdao.com`, `translate.googleapis.com` / `translate.google.com`, `dict.iciba.com`, `api.mymemory.translated.net`
- **Video & subtitles** (when you open/download a video or refresh subscriptions): `www.youtube.com`, `i.ytimg.com` / `img.youtube.com`, `api.bilibili.com`, `www.bilibili.com`, `b23.tv`; on mobile, YouTube embedding falls back to Obsidian's official proxy `releases.obsidian.md`
- **AI features** (only if you configure a provider): the endpoint of your chosen provider, called with **your own API key**
- MDX dictionaries are local files — nothing is downloaded

## 🔒 Privacy

- **No telemetry, no analytics, no accounts**
- Flashcard sync travels through **your own** vault-sync mechanism, never our servers
- The only data leaving your device is the lookups/translations you initiate and the AI providers **you** configure

**Files outside the vault**: dictionary settings may point at MDX files stored elsewhere on your device; the plugin only reads files you explicitly select.

## 🛠 Development

- Requirements: Node.js 18+
- `npm install` · `npm run dev` (watch) · `npm run build:release` (readable, non-minified bundle as required by the community directory) · `npm test`

## 📄 License

[GPL-3.0](./LICENSE)

## ❤️ Support

Found a bug or have an idea? Open an issue in this repository. You can also find the author as **PandoraReads** (潘多拉的数字花园) on Weibo / Xiaohongshu / WeChat Channels.

---

*"Making language learning as natural as breathing." — Language Made Easy*
