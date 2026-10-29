# Language Made Easy — Immersive Obsidian-Lernumgebung für Englisch

> 🌐 Andere Sprachen: [English](./README-EN.md) · [简体中文](../../README.md) · [繁體中文](./README-ZH-TW.md) · Deutsch · [Français](./README-FR.md) · [Español](./README-ES.md) · [日本語](./README-JA.md) · [한국어](./README-KO.md) · [Русский](./README-RU.md) · [ไทย](./README-TH.md)

**Language Made Easy (LME)** verwandelt deinen Obsidian-Vault in eine komplette immersive Lernumgebung für Englisch: sofortige Wörterbuch-Nachschlagefunktion beim Lesen, FSRS-Lernkarten mit verteiltem Wiederholen, Video-Shadowing mit synchronisierten Untertiteln und KI-gestützte Analyse — alles an einem Ort, alles als einfache Notizen in deinem Vault gespeichert.

<p align="center"><img src="../../assets/screenshots/hero-overview.png" width="640" alt="Alles-in-einem-Lösung für Sprachenlernen"></p>


> ### 💡 Hinweis zum Freemium-Modell
> Die Grundfunktionen dieses Plugins sind kostenlos installier- und nutzbar; die erweiterten Funktionen werden mit der Vollversion vollständig freigeschaltet — ein einmaliger Kauf mit lebenslangem Zugang zu allen künftigen Updates. Die Upgrade-Dialoge im Plugin zeigen die Kauf-Links. Die Unterschiede findest du in der [Funktionsübersicht](#-free-basic-vs-full-edition) unten.
>
> **Die Basisversion deckt den kompletten täglichen Lernzyklus ab — Nachschlagen, Lernkarten-Wiederholung, Shadowing und Videonotizen; erweiterte Funktionen wie mehr Sprachen, geräteübergreifende Synchronisierung und Stapelverarbeitung sind in der Vollversion enthalten.**

---

## ✨ Alle Funktionsmodule

### 🎬 Videonotizen mit einem Klick — vom Link zur shadowing-fertigen Notiz in einem Schritt
Füge einen YouTube-/Bilibili-Link ein, und das Plugin ruft Titel, Kanal und Titelbild ab, erstellt eine strukturierte Untertitel-Notiz und lädt die Untertitel herunter — jederzeit bereit zum Shadowing. Drei Einstiegspunkte:
- **Navigationspanel**: die Schaltfläche „Videonotiz erstellen" neben dem Suchfeld
- **Shadowing-Werkstatt**: auf das Werkstatt-Symbol in der linken Seitenleiste klicken und einen Link im Eingabefeld einfügen
- **YouTube-Abonnementseite**: beim Durchsehen deines Feeds für jedes Video Notizen erstellen, **mit Mehrfachauswahl und Stapeldownload** (Vollversion)

<p align="center"><img src="../../assets/screenshots/video-note.png" width="640" alt="Erstellte Videonotiz"></p>

<p align="center"><img src="../../assets/screenshots/nav-video-note.gif" width="640" alt="Videolink im Navigationspanel eingeben, um mit einem Klick eine Videonotiz zu erstellen"></p>

**Einheitliche Notizverwaltung**: alle Videonotizen befinden sich auf der Katalogseite der Werkstatt mit Sortierung, Filterung und Gruppierung; auf eine Karte klicken, um mit dem Shadowing zu beginnen, Shift+Klick für die Vorschau der Notiz.

<p align="center"><img src="../../assets/screenshots/workshop-catalog.png" width="640" alt="Katalogseite der Werkstatt"></p>

### 📖 Wörterbuch-Assistent — alles lesen, sofort nachschlagen
- **Sofortiges Nachschlagen**: `Strg/Cmd + Doppelklick` auf ein beliebiges Wort (oder Text markieren) — die Definitionen erscheinen sofort in der Seitenleiste
- **Kontexterfassung**: der gesamte Satz, der das Wort enthält, wird automatisch als Beispielsatz gespeichert
- **Offline-MDX-Wörterbücher**: lokale `.mdx`/`.mdd`-Wörterbücher auf dem Desktop ohne Mengenbegrenzung laden (der Import auf Mobilgeräten ist Teil der Vollversion)
- **Online-Fallback-Kette**: Youdao → Google Translate → MyMemory, alles kostenlose öffentliche APIs, kein Schlüssel erforderlich
- **Aussprache**: Audiowiedergabe mit intelligentem Vorladen
- **Hinzufügen mit einem Klick** zu deinem Vokabelheft (IndexedDB + automatisch gepflegte Markdown-Datei)

<p align="center"><img src="../../assets/screenshots/dictionary-lookup.png" width="640" alt="Nachschlagen per Doppelklick mit Definitionen in der Seitenleiste"></p>

### 🧠 FSRS-Lernkarten — behalte, was du lernst
- State-of-the-art **FSRS-Scheduler** (`ts-fsrs`) berechnet optimale Wiederholungsintervalle für jede Karte
- **Umdreh-Studienmodus** mit flüssigen Kartenanimationen und Umblättergeräusch
- **Fortschritts-Dashboard**: Jahres-Heatmap, Wiederholungsstatistiken, tägliche Wiederholungserinnerung
- **Lernkarten-Verwaltung**: Suchen, nach Sprache/Beherrschung filtern, sortieren, direkt bearbeiten, Sammellöschung
- **Lernbegleiter-Haustier** 🐣: ein kleiner Begleiter, der schlüpft, aufsteigt und mit deinen Lernserien mitwächst

<p align="center"><img src="../../assets/screenshots/flashcard-review.png" width="300" alt="Lernkarten-Wiederholung"> <img src="../../assets/screenshots/flashcard-review-2.png" width="300" alt="Statistiken der Lernkarten-Wiederholung"></p>

<p align="center"><img src="../../assets/screenshots/one-click-cards.png" width="640" alt="Kartenerstellung mit einem Klick"></p>
<p align="center"><img src="../../assets/screenshots/batch-generate.png" width="640" alt="KI-gestützte Stapelerstellung von Lernkarten (Vollversion)"></p>

### 🎬 Video-Shadowing-Werkstatt — lerne mit echten Videos
- **YouTube-, Bilibili- und lokale Video-/Audiodateien** in einem Arbeitsbereich
- **Videonotiz aus einer URL erstellen**, Untertitel hineinladen und jederzeit offline üben
- **Echtzeit-Synchronisierung der Untertitel** mit automatischem Bildlauf während der Wiedergabe
- **Shadowing-Modus & Diktiermodus** — mit einem Klick zwischen Nachsprechen und Mitschreiben wechseln
- **Präzise Wiedergabesteuerung**: 0,8x / 1,0x / 1,25x Geschwindigkeit, schnelle Sprünge von -5 s / -10 s
- **Katalogseite der Werkstatt**: alle deine Untertitelnotizen organisiert mit Sortierung, Filterung und Gruppierung

<p align="center"><img src="../../assets/screenshots/shadowing-mode.png" width="315" alt="Shadowing-Modus"> <img src="../../assets/screenshots/dictation-mode.png" width="315" alt="Diktiermodus"></p>
<p align="center"><em>Shadowing-Modus (links) und Diktiermodus (rechts)</em></p>

<p align="center"><img src="../../assets/screenshots/listening-mode-2.png" width="640" alt="Hörmodus"></p>
<p align="center"><img src="../../assets/screenshots/record-pronunciation.png" width="640" alt="Aufnehmen und KI-Aussprachebewertung erhalten"></p>
<p align="center"><img src="../../assets/screenshots/focus-mode.png" width="640" alt="Fokusmodus"></p>
<p align="center"><em>Fokusmodus</em></p>

### ✨ KI-gestützte Analyse — bring deinen eigenen API-Schlüssel mit
- **6 eingebaute Analysevorlagen**: umfassende Analyse, Vokabelschwierigkeit, kultureller Hintergrund, zweisprachige Lektüre, Lesetest und Lückentext-Herausforderung
- **Klickbare Zeitstempel** in jedem Bericht — springe direkt zurück zur passenden Stelle im Video
- **Berichtsverlauf & Katalog**: frühere Berichte durchsehen, durchsuchen, gruppieren und erneut öffnen
- **KI-Aussprachebewertung** für Shadowing-Aufnahmen
- **Lernkarten-Autovervollständigung mit einem Klick**: die KI vervollständigt fehlende Felder auf deinen Karten
- Funktioniert mit **OpenAI, DeepSeek, Google Gemini, Kimi, GLM, Qwen, OpenRouter oder jedem OpenAI-kompatiblen Endpunkt** — dein Schlüssel, deine Wahl, deine Daten

<p align="center"><img src="../../assets/screenshots/ai-analysis-2.png" width="640" alt="KI-gestützter Analysebericht"></p>

### 📺 YouTube-Kanalabonnements
- Kanäle abonnieren mit **Kategorien, RSS-Abruf und Benachrichtigungen über neue Videos**
- Deinen Feed in Karten-/Listenansicht durchsehen und **Videos direkt in der App ansehen**, ohne Obsidian zu verlassen
- **Videonotizen-Erstellung mit einem Klick inklusive Untertiteln**, einschließlich Mehrfachauswahl und Stapeldownload

<p align="center"><img src="../../assets/screenshots/youtube-subscriptions.png" width="640" alt="YouTube-Kanalabonnements"></p>

### 📝 Und mehr
- **SRT-zu-Notiz**-Konvertierung (einzeln & stapelweise) für deine eigenen Untertiteldateien
- **Wortschatz-Test** — schätze deinen Wortschatz mit Stichprobentests
- Mitgelieferter **HTML-Einsteigerleitfaden**
- **10 Themes**: Paper & Ink, Mint Atelier, Rose Blush, Lavender Dream, Candy Pop, Mindful Oasis, Coral Warmth, Ocean Glass, Aurora Prism und Dark Lemon
- Volle **Desktop- und Mobilunterstützung**

---

## 🆓 Kostenlos (Basis) vs. Vollversion

Die Basisversion ist für immer kostenlos. Die **Vollversion** schaltet jedes der folgenden erweiterten Module frei — **Einmalkauf, lebenslange Nutzung, kostenlose Updates**:

| Funktionsmodul | Basis (kostenlos) | Vollversion |
|---|:---:|:---:|
| Wörterbuch-Nachschlagen (Doppelklick / Kontexterfassung / Aussprache / Vokabelheft) | ✅ | ✅ |
| Lokale MDX-Wörterbücher (Desktop) | ✅ | ✅ |
| Wörterbücher auf Mobilgeräten (Import für Offline-Nachschlagen) | — | ✅ |
| Geräteübergreifende Lernkarten-Synchronisierung | — | ✅ |
| FSRS-Lernkarten (Umdreh-Modus / Statistiken / Haustierbegleiter) | ✅ | ✅ |
| KI-Analyse (6 Vorlagen / Bewertung / Autovervollständigung von Lernkarten) | **Teilweise** | **Vollständig** |
| Shadowing-Werkstatt (Shadowing / Diktat / Geschwindigkeitsregelung) | ✅ | ✅ |
| Videonotiz-Erstellung (inkl. Untertiteldownload) | ✅ | ✅ |
| SRT-zu-Notiz, Vokabeltest, YouTube-Abonnements & Vorschau | ✅ | ✅ |
| **Weitere Sprachen**: Deutsch / Französisch / Spanisch / Koreanisch / Russisch / Japanisch | — | ✅ |
| **9 zusätzliche UI-Themes** (zusätzlich zu Classic Paper & Ink) | — | ✅ |
| **Untertiteldownload mit einem Klick / Stapeldownload** auf der Abonnementseite | — | ✅ |
| **Video-Lesezeichen-Notizen** (Screenshot + Sprung zurück zur exakten Stelle) | — | ✅ |
| **KI-Stapelerstellung von Lernkarten** aus beliebigen Notizen | — | ✅ |
| **Einstufung von Vokabeln mit einem Klick** (Oxford CEFR 3000/5000 + CN-Prüfungswortlisten) | — | ✅ |
| **Lernkarten-Datenimport / -export** (JSON / TXT / MD / CSV) | — | ✅ |
| **KI-Berichte lokal speichern** (Notiz / HTML / Langbild) | — | ✅ |
| **Video-Lehrkarten** (Quiz-Einblendungen während der Wiedergabe) | — | ✅ |
| **Hör- / Tippen-Lernkarten-Wiederholungsmodi** | — | ✅ |
| **Eigene KI-Prompt-Vorlagen** (eigene hinzufügen / bearbeiten) | — | ✅ |

## 🛒 Vollversion freischalten

Die Vollversion ist ein **Einmalkauf** (kein Abo) mit **lebenslangen kostenlosen Updates**. Erhältlich in den offiziellen Shops des Autors:

- **小红书 (Xiaohongshu)**: https://xhslink.com/m/4ke3sdw1uXp
- **B站 (Bilibili)**: https://b23.tv/QYtaP7T
- **视频号小店 (WeChat-Channels-Shop)**: https://store.weixin.qq.com/shop/a/T9WX95cCebFqe4F

Fragen zur Nutzung oder zur Vollversion? Scanne den QR-Code, um den Autor auf WeChat hinzuzufügen:

<p align="center"><img src="../../assets/wechat-qr.jpg" width="200" alt="Autor auf WeChat hinzufügen" /></p>

---

## 🚀 Installation

**Aus dem Obsidian-Community-Verzeichnis (empfohlen)**: Einstellungen → Community-Plugins → Durchsuchen → nach „Language Made Easy" suchen → Installieren → Aktivieren.

**Manuell**: `main.js`, `manifest.json` und `styles.css` aus dem neuesten [Release](https://github.com/PandoraReads/language-made-easy-lite/releases) in `.obsidian/plugins/language-made-easy/` herunterladen, dann das Plugin in den Einstellungen unter Community-Plugins aktivieren.

### Erste Schritte
1. **KI-Funktionen (optional)** — in den Plugin-Einstellungen einen LLM-Anbieter mit deinem eigenen API-Schlüssel hinzufügen (OpenAI / DeepSeek / Gemini / Kimi / GLM / Qwen / OpenRouter / eigener OpenAI-kompatibler Endpunkt)
2. **Wörterbücher (optional)** — lokale MDX-Wörterbücher registrieren oder die kostenlose Online-Kette nutzen
3. **Vokabelheft** — den Ordner für die automatisch gepflegte Vokabeldatei auswählen
4. Auf das Doktorhut-Band-Symbol klicken, um das **Navigationspanel** zu öffnen und loszulegen

## 🌐 Netzwerknutzung

Das Plugin funktioniert vollständig offline, mit Ausnahme der folgenden optionalen, vom Nutzer ausgelösten Anfragen:

- **Wörterbuch / Übersetzung / Aussprache**: `dict.youdao.com`, `translate.googleapis.com` / `translate.google.com`, `dict.iciba.com`, `api.mymemory.translated.net`
- **Videos & Untertitel** (wenn du ein Video öffnest/herunterlädst oder Abonnements aktualisierst): `www.youtube.com`, `i.ytimg.com` / `img.youtube.com`, `api.bilibili.com`, `www.bilibili.com`, `b23.tv`; auf Mobilgeräten fällt die YouTube-Einbettung auf Obsidians offiziellen Proxy `releases.obsidian.md` zurück
- **KI-Funktionen** (nur wenn du einen Anbieter konfigurierst): der Endpunkt deines gewählten Anbieters, aufgerufen mit **deinem eigenen API-Schlüssel**
- MDX-Wörterbücher sind lokale Dateien — es wird nichts heruntergeladen

## 🔒 Privatsphäre

- **Keine Telemetrie, keine Analyse, keine Konten**
- Die einzigen Daten, die dein Gerät verlassen, sind die von dir ausgelösten Nachschläge/Übersetzungen und die KI-Anbieter, **die du** konfigurierst

**Dateien außerhalb des Vaults**: Wörterbuch-Einstellungen dürfen auf MDX-Dateien verweisen, die an anderer Stelle auf deinem Gerät gespeichert sind; das Plugin liest nur Dateien, die du ausdrücklich auswählst.

## 📋 Änderungsprotokoll

### 4.2.1

- **Dreistufiger Schutz der Flashcard-Daten** — die Datenbank nutzt jetzt eine stabile Identität, die mit dem Tresor mitzieht: **Umbenennen oder Verschieben des Tresors verliert keine Karten mehr**. Bestandsdaten werden beim Upgrade automatisch übernommen; ein leerer Tresor bietet eine Ein-Klick-Wiederherstellung gefundener Altbestände (auch manuell in den Einstellungen).
- **Automatische Flashcard-Backups** — standardmäßig aktiviert; täglich eine vollständige Sicherung (inkl. FSRS-Fortschritt und Wiederholungsprotokoll) in den Ordner `backups/` des Plugins, die neuesten 7 werden behalten. Sichern, Wiederherstellen und Löschen in den Einstellungen.
- **KI-Wortanalyse beim Nachschlagen** — schwebende „KI-Analyse“-Schaltfläche unten rechts in den Ergebnissen: Bedeutung, Verwendung, kultureller Hintergrund und ähnliche Ausdrücke – gegründet auf dem angeklickten Satz. Abschaltbar; KI-Anbieter pro Funktion wählbar.
- **KI-Einstellungen neu gegliedert** — der KI-Bereich nutzt jetzt beschriftete Abschnittskarten (Analyse / Prompts / hinzugefügte Modelle), wie in der Vollversion.
- Wiederherstellung und Wiederfindung mergen idempotent: Bei doppelten Wörtern gewinnt der Eintrag mit mehr Wiederholungsfortschritt.

### 4.2.0

- **Oberfläche in 10 Sprachen** — Englisch, vereinfachtes/traditionelles Chinesisch, Deutsch, Französisch, Spanisch, Japanisch, Koreanisch, Russisch und Thai. Die Oberfläche folgt standardmäßig der Obsidian-Sprache und kann in den Einstellungen überschrieben werden; geöffnete Ansichten werden unmittelbar nach dem Wechsel neu gerendert.
- **Lokalisierte KI-Berichte** — englische Prompt-Varianten hinzugefügt; Berichte werden auf nicht-chinesischen Oberflächen in deiner Oberflächensprache verfasst.
- **Intelligentere Übersetzungskette** — Übersetzungsziele folgen der Oberflächensprache, und nicht-englische Lernsprachen greifen standardmäßig auf Google Translate zurück.
- **Lokalisierter Kaufablauf** — nicht-chinesische Oberflächen öffnen im Upgrade-Dialog die offizielle Website.
- **Mehrsprachiger eingebauter Leitfaden** — der HTML-Leitfaden wird in allen 10 Oberflächensprachen ausgeliefert.
- **Verfeinertes Navigationspanel** — Statistiken und Schnellaktionsschaltflächen passen sich an Sprachen mit langen Wörtern an: Zahlen bleiben in einer Zeile ausgerichtet, Beschriftungen laufen nie über oder überlappen sich, und Schaltflächentexte sind auf zwei Zeilen begrenzt.
- **Vollständig ausgeblendete Bildlaufleisten** im Navigationspanel und in den Lernkarten-Ansichten.
- Zweisprachige Plugin-Beschreibung (Englisch + Chinesisch) im Manifest und eine zweisprachige Einführung in der chinesischen README.

## 🛠 Entwicklung

- Voraussetzungen: Node.js 18+
- `npm install` · `npm run dev` (Watch-Modus) · `npm run build:release` (lesbares, nicht minifiziertes Bundle, wie vom Community-Verzeichnis gefordert) · `npm test`

## 📄 Lizenz

[GPL-3.0](../../LICENSE)

## ❤️ Unterstützung

Einen Bug gefunden oder eine Idee? Öffne ein Issue in diesem Repository. Du findest den Autor auch als **PandoraReads** (潘多拉的数字花园) auf Weibo / Xiaohongshu / WeChat Channels.

---

*„Sprachenlernen so selbstverständlich wie Atmen machen." — Language Made Easy*
