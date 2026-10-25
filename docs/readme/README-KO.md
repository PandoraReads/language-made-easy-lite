# Language Made Easy — 몰입형 Obsidian 영어 학습 워크스페이스

> 🌐 다른 언어: [English](./README-EN.md) · [简体中文](../../README.md) · [繁體中文](./README-ZH-TW.md) · [Deutsch](./README-DE.md) · [Français](./README-FR.md) · [Español](./README-ES.md) · [日本語](./README-JA.md) · 한국어 · [Русский](./README-RU.md) · [ไทย](./README-TH.md)

**Language Made Easy (LME)**는 Obsidian 볼트를 완전한 몰입형 영어 학습 워크스페이스로 바꿔줍니다. 읽으면서 즉시 사전 검색, FSRS 간격 반복 플래시카드, 자막 동기화 쉐도잉, AI 분석까지 — 모든 기능을 한곳에서, 모든 데이터는 볼트의 일반 노트로 저장합니다.

<p align="center"><img src="../../assets/screenshots/hero-overview.png" width="640" alt="원스톱 언어 학습 솔루션"></p>


> ### 💡 프리미엄 안내
> 이 플러그인의 기본 기능은 무료로 설치하고 사용할 수 있습니다. 고급 기능은 Full Edition으로 완전히 잠금 해제할 수 있으며, 일회성 구매로 향후 모든 업데이트를 평생 이용할 수 있습니다. 업그레이드 구매 링크는 플러그인 내 업그레이드 대화상자에서 확인할 수 있습니다. 차이점은 아래의 [기능 비교](#-free-basic-vs-full-edition)를 참고하세요.
>
> **기본 에디션은 하루의 전체 학습 루프 — 사전 검색, 플래시카드 복습, 쉐도잉, 비디오 노트 — 를 모두 지원합니다. 더 많은 언어, 기기 간 동기화, 일괄 처리 같은 고급 기능은 Full Edition에 포함되어 있습니다.**

---

## ✨ 전체 기능 모듈

### 🎬 원클릭 비디오 노트 — 링크 하나로 쉐도잉 준비 완료된 노트까지 한 번에
YouTube / Bilibili 링크를 붙여넣으면 플러그인이 제목, 채널, 썸네일을 가져와 구조화된 자막 노트를 만들고 자막을 다운로드합니다 — 언제든 쉐도잉할 준비 완료. 세 가지 진입 경로:
- **내비게이션 패널**: 검색창 옆의 "비디오 노트 생성" 버튼
- **쉐도잉 워크숍**: 왼쪽 리본에서 워크숍 아이콘을 클릭하고 입력창에 링크를 넣어 파싱
- **YouTube 구독 페이지**: 피드를 둘러보는 동안 어떤 비디오든 노트를 생성, **다중 선택 일괄 다운로드 지원** (Full Edition)

<p align="center"><img src="../../assets/screenshots/video-note.png" width="640" alt="생성된 비디오 노트"></p>

<p align="center"><img src="../../assets/screenshots/nav-video-note.gif" width="640" alt="내비게이션 패널에 비디오 링크를 입력해 원클릭으로 비디오 노트 생성"></p>

**통합 노트 관리**: 모든 비디오 노트는 워크숍 카탈로그 페이지에서 정렬, 필터링, 그룹화와 함께 관리됩니다. 카드를 클릭하면 쉐도잉을 시작하고, Shift+클릭으로 노트를 미리 볼 수 있습니다.

<p align="center"><img src="../../assets/screenshots/workshop-catalog.png" width="640" alt="워크숍 카탈로그 페이지"></p>

### 📖 사전 도우미 — 무엇이든 읽고, 즉시 찾아보기
- **즉시 검색**: 아무 단어나 `Ctrl/Cmd + 더블클릭` (또는 텍스트 선택) — 정의가 사이드바에 즉시 표시됩니다
- **문맥 저장**: 해당 단어가 포함된 전체 문장이 자동으로 예문으로 저장됩니다
- **오프라인 MDX 사전**: 데스크톱에서 로컬 `.mdx`/`.mdd` 사전을 개수 제한 없이 불러올 수 있습니다 (모바일 가져오기는 Full Edition)
- **온라인 폴백 체인**: Youdao → Google Translate → MyMemory, 모두 무료 공개 API이며 키가 필요 없습니다
- **발음**: 스마트 사전 로딩이 적용된 음성 재생
- **원클릭 추가**로 어휘 노트북에 저장 (IndexedDB + 자동 관리되는 마크다운 파일)

<p align="center"><img src="../../assets/screenshots/dictionary-lookup.png" width="640" alt="더블클릭 검색과 사이드바 정의 표시"></p>

### 🧠 FSRS 플래시카드 — 배운 것을 기억하세요
- 최신 기술의 **FSRS 스케줄러** (`ts-fsrs`)가 카드마다 최적의 복습 간격을 계산합니다
- 부드러운 카드 애니메이션과 페이지 넘기기 사운드가 있는 **플립 학습 모드**
- **성장 대시보드**: 연간 히트맵, 복습 통계, 매일의 복습 알림
- **플래시카드 관리자**: 검색, 언어/숙련도별 필터링, 정렬, 인라인 편집, 일괄 삭제
- **학습 동반 펫** 🐣: 학습 연속 기록과 함께 부화하고, 레벨업하고, 성장하는 작은 동반자

<p align="center"><img src="../../assets/screenshots/flashcard-review.png" width="300" alt="플래시카드 복습"> <img src="../../assets/screenshots/flashcard-review-2.png" width="300" alt="플래시카드 복습 통계"></p>

<p align="center"><img src="../../assets/screenshots/one-click-cards.png" width="640" alt="원클릭 카드 생성 과정"></p>
<p align="center"><img src="../../assets/screenshots/batch-generate.png" width="640" alt="AI 일괄 플래시카드 생성 (Full Edition)"></p>

### 🎬 비디오 쉐도잉 워크숍 — 실제 비디오로 배우기
- **YouTube, Bilibili, 로컬 비디오/오디오** 파일을 하나의 워크스페이스에서
- **URL로 비디오 노트 생성**, 자막을 노트에 다운로드하여 언제든 오프라인 연습
- **실시간 자막 동기화**, 재생 중 자동 스크롤
- **쉐도잉 모드 & 받아쓰기 모드** — 따라 말하기와 듣고 쓰기를 원클릭으로 전환
- **정밀한 재생 제어**: 0.8x / 1.0x / 1.25x 배속, 빠른 -5초 / -10초 이동
- **워크숍 카탈로그 페이지**: 모든 자막 노트를 정렬, 필터링, 그룹화로 체계적으로 관리

<p align="center"><img src="../../assets/screenshots/shadowing-mode.png" width="315" alt="쉐도잉 모드"> <img src="../../assets/screenshots/dictation-mode.png" width="315" alt="받아쓰기 모드"></p>
<p align="center"><em>왼쪽은 쉐도잉 모드, 오른쪽은 받아쓰기 모드</em></p>

<p align="center"><img src="../../assets/screenshots/listening-mode-2.png" width="640" alt="듣기 모드"></p>
<p align="center"><img src="../../assets/screenshots/record-pronunciation.png" width="640" alt="녹음 후 AI 발음 채점 받기"></p>
<p align="center"><img src="../../assets/screenshots/focus-mode.png" width="640" alt="집중 모드"></p>
<p align="center"><em>집중 모드</em></p>

### ✨ AI 기반 분석 — 내 API 키를 직접 사용
- **6가지 내장 분석 템플릿**: 종합 분석, 어휘 난이도, 문화적 배경, 이중 언어 정독, 독해 퀴즈, 빈칸 채우기 챌린지
- 모든 리포트에서 **클릭 가능한 타임스탬프** — 영상 속 해당 순간으로 바로 이동
- **리포트 기록 & 카탈로그**: 지난 리포트 열람, 검색, 그룹화, 다시 열기
- 쉐도잉 녹음에 대한 **AI 발음 채점**
- **원클릭 플래시카드 자동 완성**: AI가 카드의 누락된 필드를 채워줍니다
- **OpenAI, DeepSeek, Google Gemini, Kimi, GLM, Qwen, OpenRouter 또는 OpenAI 호환 엔드포인트**와 연동 — 내 키, 내 선택, 내 데이터

<p align="center"><img src="../../assets/screenshots/ai-analysis-2.png" width="640" alt="AI 기반 분석 리포트"></p>

### 📺 YouTube 채널 구독
- **카테고리, RSS 폴링, 새 비디오 알림**과 함께 채널 구독
- 카드/목록 보기로 피드를 탐색하고 Obsidian을 벗어나지 않고 **앱 내에서 비디오 미리보기**
- **자막 포함 원클릭 비디오 노트 생성**, 다중 선택 일괄 다운로드 포함

<p align="center"><img src="../../assets/screenshots/youtube-subscriptions.png" width="640" alt="YouTube 채널 구독"></p>

### 📝 그 외 기능
- 직접 만든 자막 파일용 **SRT를 노트로 변환** (단건 & 일괄)
- **어휘량 테스트** — 표본 테스트로 어휘량 추정
- 내장 **HTML 신규 사용자 가이드**
- **10가지 테마**: Paper & Ink, Mint Atelier, Rose Blush, Lavender Dream, Candy Pop, Mindful Oasis, Coral Warmth, Ocean Glass, Aurora Prism, Dark Lemon
- **데스크톱과 모바일** 완전 지원

---

## 🆓 무료 (기본) vs Full Edition

기본 에디션은 영원히 무료입니다. **Full Edition**은 아래의 모든 고급 모듈을 잠금 해제합니다 — **일회성 구매, 평생 사용, 무료 업데이트**:

| 기능 모듈 | 기본 (무료) | Full Edition |
|---|:---:|:---:|
| 사전 검색 (더블클릭 / 문맥 저장 / 발음 / 노트북) | ✅ | ✅ |
| 로컬 MDX 사전 (데스크톱) | ✅ | ✅ |
| 모바일 사전 (가져와서 오프라인 검색) | — | ✅ |
| 기기 간 플래시카드 동기화 | — | ✅ |
| FSRS 플래시카드 (플립 모드 / 통계 / 펫 동반자) | ✅ | ✅ |
| AI 분석 (6가지 템플릿 / 채점 / 플래시카드 자동 완성) | **부분** | **전체** |
| 쉐도잉 워크숍 (쉐도잉 / 받아쓰기 / 배속 제어) | ✅ | ✅ |
| 비디오 노트 생성 (자막 다운로드 포함) | ✅ | ✅ |
| SRT 변환, 어휘 테스트, YouTube 구독 & 미리보기 | ✅ | ✅ |
| **더 많은 언어**: 독일어 / 프랑스어 / 스페인어 / 한국어 / 러시아어 / 일본어 | — | ✅ |
| **9가지 추가 UI 테마** (Classic Paper & Ink 제외) | — | ✅ |
| 구독 페이지에서 **원클릭 / 일괄 자막 다운로드** | — | ✅ |
| **비디오 북마크 노트** (스크린샷 + 해당 순간으로 바로 이동) | — | ✅ |
| 어떤 노트에서든 **AI 일괄 플래시카드 생성** | — | ✅ |
| **원클릭 수준별 어휘 주석** (Oxford CEFR 3000/5000 + 중국 시험 단어장) | — | ✅ |
| **플래시카드 데이터 가져오기 / 내보내기** (JSON / TXT / MD / CSV) | — | ✅ |
| **AI 리포트 로컬 저장** (노트 / HTML / 긴 이미지) | — | ✅ |
| **비디오 학습 카드** (재생 중 퀴즈 팝업) | — | ✅ |
| **듣기 / 타이핑 플래시카드 복습 모드** | — | ✅ |
| **사용자 지정 AI 프롬프트 템플릿** (추가 / 편집) | — | ✅ |

## 🛒 Full Edition 잠금 해제

Full Edition은 **일회성 구매**(구독 아님)로 **평생 무료 업데이트**를 제공합니다. 작가의 공식 스토어에서 구매하세요:

- **小红书 (샤오홍슈)**: https://xhslink.com/m/4ke3sdw1uXp
- **B站 (비리비리)**: https://b23.tv/QYtaP7T
- **视频号小店 (위챗 채널 스토어)**: https://store.weixin.qq.com/shop/a/T9WX95cCebFqe4F

사용법이나 Full Edition에 대해 궁금한 점이 있나요? QR 코드를 스캔해 위챗으로 작가를 추가하세요:

<p align="center"><img src="../../assets/wechat-qr.jpg" width="200" alt="위챗으로 작가 추가하기" /></p>

---

## 🚀 설치

**Obsidian 커뮤니티 디렉터리에서 (권장)**: 설정 → 커뮤니티 플러그인 → 찾아보기 → "Language Made Easy" 검색 → 설치 → 활성화.

**수동 설치**: 최신 [릴리스](https://github.com/PandoraReads/language-made-easy-lite/releases)에서 `main.js`, `manifest.json`, `styles.css`를 다운로드해 `.obsidian/plugins/language-made-easy/` 폴더에 넣고, 설정 → 커뮤니티 플러그인에서 플러그인을 활성화하세요.

### 시작하기
1. **AI 기능 (선택)** — 플러그인 설정에서 자신의 API 키로 LLM 제공사를 추가하세요 (OpenAI / DeepSeek / Gemini / Kimi / GLM / Qwen / OpenRouter / OpenAI 호환 커스텀 엔드포인트)
2. **사전 (선택)** — 로컬 MDX 사전을 등록하거나, 무료 온라인 체인을 이용하세요
3. **어휘 노트북** — 자동 관리되는 어휘 파일의 폴더를 지정하세요
4. 졸업모 리본 아이콘을 클릭해 **내비게이션 패널**을 열고 둘러보세요

## 🌐 네트워크 사용

플러그인은 다음과 같은 선택적, 사용자가 직접 시작하는 요청을 제외하고 완전히 오프라인에서 작동합니다:

- **사전 / 번역 / 발음**: `dict.youdao.com`, `translate.googleapis.com` / `translate.google.com`, `dict.iciba.com`, `api.mymemory.translated.net`
- **비디오 & 자막** (비디오를 열거나 다운로드하거나 구독을 새로고침할 때): `www.youtube.com`, `i.ytimg.com` / `img.youtube.com`, `api.bilibili.com`, `www.bilibili.com`, `b23.tv`; 모바일에서는 YouTube 임베딩이 Obsidian 공식 프록시 `releases.obsidian.md`로 대체됩니다
- **AI 기능** (제공사를 설정한 경우에만): 선택한 제공사의 엔드포인트, **자신의 API 키**로 호출
- MDX 사전은 로컬 파일입니다 — 아무것도 다운로드되지 않습니다

## 🔒 개인정보

- **텔레메트리 없음, 분석 도구 없음, 계정 없음**
- 기기를 떠나는 데이터는 사용자가 시작한 검색/번역과 **사용자가 직접** 설정한 AI 제공사뿐입니다

**볼트 외부 파일**: 사전 설정은 기기의 다른 곳에 저장된 MDX 파일을 가리킬 수 있습니다. 플러그인은 사용자가 명시적으로 선택한 파일만 읽습니다.

## 📋 변경 로그

### 4.2.0

- **10개 언어 인터페이스** — 영어, 간체/번체 중국어, 독일어, 프랑스어, 스페인어, 일본어, 한국어, 러시아어, 태국어. 인터페이스는 기본적으로 Obsidian 언어를 따르며 설정에서 변경할 수 있습니다. 전환 후 열려 있는 뷰는 즉시 다시 렌더링됩니다.
- **현지화된 AI 리포트** — 영어 프롬프트 변형이 추가되었으며, 비중국어 UI에서는 인터페이스 언어로 리포트가 작성됩니다.
- **더 똑똑한 번역 체인** — 번역 대상 언어가 인터페이스 언어를 따르며, 영어가 아닌 학습 언어는 기본적으로 Google Translate를 사용합니다.
- **현지화된 구매 흐름** — 비중국어 인터페이스에서는 업그레이드 대화상자가 공식 웹사이트를 엽니다.
- **다국어 내장 가이드** — HTML 가이드가 10개 인터페이스 언어 모두로 제공됩니다.
- **내비게이션 패널 개선** — 통계 및 빠른 실행 버튼이 긴 단어 언어에 맞춰 조정됩니다: 숫자는 한 줄에 정렬되고, 레이블은 줄바꿈이나 겹침이 없으며, 버튼 캡션은 최대 두 줄로 제한됩니다.
- 내비게이션 패널과 플래시카드 복습 뷰에서 **스크롤바 완전 숨김**.
- 매니페스트에 이중 언어 플러그인 설명 (영어 + 중국어), 중국어 README에 이중 언어 소개.

## 🛠 개발

- 요구 사항: Node.js 18+
- `npm install` · `npm run dev` (워치) · `npm run build:release` (커뮤니티 디렉터리 요구 사항에 따라 읽기 쉬운 비압축 번들) · `npm test`

## 📄 라이선스

[GPL-3.0](../../LICENSE)

## ❤️ 지원

버그를 발견했거나 아이디어가 있나요? 이 저장소에서 이슈를 열어주세요. Weibo / Xiaohongshu / WeChat Channels에서 **PandoraReads** (潘多拉的数字花园)로 작가를 찾을 수도 있습니다.

---

*"언어 학습을 숨쉬는 것처럼 자연스럽게." — Language Made Easy*
