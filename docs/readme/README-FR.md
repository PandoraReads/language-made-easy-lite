# Language Made Easy — Un espace de travail d'apprentissage immersif de l'anglais pour Obsidian

> 🌐 Autres langues : [English](./README-EN.md) · [简体中文](../../README.md) · [繁體中文](./README-ZH-TW.md) · [Deutsch](./README-DE.md) · Français · [Español](./README-ES.md) · [日本語](./README-JA.md) · [한국어](./README-KO.md) · [Русский](./README-RU.md) · [ไทย](./README-TH.md)

**Language Made Easy (LME)** transforme votre coffre Obsidian en un espace de travail complet et immersif pour apprendre l'anglais : recherche instantanée dans le dictionnaire pendant la lecture, cartes mémo avec répétition espacée FSRS, shadowing vidéo avec sous-titres synchronisés et analyse assistée par IA — le tout au même endroit, sauvegardé sous forme de simples notes dans votre coffre.

<p align="center"><img src="../../assets/screenshots/hero-overview.png" width="640" alt="Une solution tout-en-un pour l'apprentissage des langues"></p>


> ### 💡 Note sur le modèle freemium
> Les fonctionnalités de base de ce plugin sont gratuites à installer et à utiliser ; les fonctionnalités avancées sont entièrement débloquées avec l'Édition Complète — un achat unique, avec accès à vie à toutes les mises à jour futures. La fenêtre de mise à niveau dans le plugin affiche les liens d'achat. Consultez le [comparatif des fonctionnalités](#-free-basic-vs-full-edition) ci-dessous pour les différences.
>
> **L'Édition de Base couvre l'intégralité de la boucle d'apprentissage quotidienne — recherche, révision des cartes mémo, shadowing et notes vidéo ; les capacités avancées telles que les langues supplémentaires, la synchronisation multi-appareils et le traitement par lots sont réservées à l'Édition Complète.**

---

## ✨ Tous les modules de fonctionnalités

### 🎬 Notes vidéo en un clic — du lien à la note prête pour le shadowing en une seule étape
Collez un lien YouTube / Bilibili et le plugin récupère le titre, la chaîne et la miniature, crée une note de sous-titres structurée et télécharge les sous-titres — prêts pour le shadowing à tout moment. Trois points d'entrée :
- **Panneau de navigation** : le bouton « Générer une note vidéo » à côté de la barre de recherche
- **Atelier de shadowing** : cliquez sur l'icône de l'atelier dans le ruban à gauche et collez un lien dans le champ de saisie
- **Page d'abonnements YouTube** : générez des notes pour n'importe quelle vidéo tout en parcourant votre fil, **avec téléchargement par lots multi-sélection** (Édition Complète)

<p align="center"><img src="../../assets/screenshots/video-note.png" width="640" alt="Note vidéo générée"></p>

<p align="center"><img src="../../assets/screenshots/nav-video-note.gif" width="640" alt="Saisir un lien vidéo dans le panneau de navigation pour générer une note vidéo en un clic"></p>

**Gestion unifiée des notes** : toutes les notes vidéo sont regroupées dans la page catalogue de l'atelier, avec tri, filtrage et regroupement ; cliquez sur une carte pour commencer le shadowing, Shift+clic pour prévisualiser la note.

<p align="center"><img src="../../assets/screenshots/workshop-catalog.png" width="640" alt="Page catalogue de l'atelier"></p>

### 📖 Assistant de dictionnaire — lisez tout, cherchez instantanément
- **Recherche instantanée** : `Ctrl/Cmd + double-clic` sur n'importe quel mot (ou sélection de texte) — les définitions apparaissent instantanément dans le panneau latéral
- **Capture du contexte** : la phrase complète contenant le mot est automatiquement enregistrée comme exemple
- **Dictionnaires MDX hors ligne** : chargez des dictionnaires locaux `.mdx`/`.mdd` sur ordinateur sans limite de nombre (l'import sur mobile est réservé à l'Édition Complète)
- **Chaîne de repli en ligne** : Youdao → Google Translate → MyMemory, toutes des API publiques gratuites, sans clé requise
- **Prononciation** : lecture audio avec préchargement intelligent
- **Ajout en un clic** à votre carnet de vocabulaire (IndexedDB + fichier markdown tenu à jour automatiquement)

<p align="center"><img src="../../assets/screenshots/dictionary-lookup.png" width="640" alt="Recherche par double-clic avec définitions dans le panneau latéral"></p>

### 🧠 Cartes mémo FSRS — retenez ce que vous apprenez
- Un planificateur **FSRS** à la pointe de la technologie (`ts-fsrs`) calcule les intervalles de révision optimaux pour chaque carte
- **Mode d'étude à retournement** avec animations fluides des cartes et son de tournage de page
- **Tableau de bord de progression** : carte de chaleur annuelle, statistiques de révision, rappel quotidien de révision
- **Gestionnaire de cartes mémo** : recherche, filtrage par langue/niveau de maîtrise, tri, édition en ligne, suppression groupée
- **Animal de compagnie d'apprentissage** 🐣 : un petit compagnon qui éclot, monte en niveau et grandit avec vos séries d'apprentissage

<p align="center"><img src="../../assets/screenshots/flashcard-review.png" width="300" alt="Révision des cartes mémo"> <img src="../../assets/screenshots/flashcard-review-2.png" width="300" alt="Statistiques de révision des cartes mémo"></p>

<p align="center"><img src="../../assets/screenshots/one-click-cards.png" width="640" alt="Processus de création de cartes en un clic"></p>
<p align="center"><img src="../../assets/screenshots/batch-generate.png" width="640" alt="Génération de cartes mémo par lots avec l'IA (Édition Complète)"></p>

### 🎬 Atelier de shadowing vidéo — apprenez avec de vraies vidéos
- Fichiers **YouTube, Bilibili et vidéos/audios locaux** dans un seul espace de travail
- **Générez une note vidéo à partir d'une URL**, téléchargez-y les sous-titres et entraînez-vous hors ligne à tout moment
- **Synchronisation des sous-titres en temps réel** avec défilement automatique pendant la lecture
- **Mode shadowing et mode dictée** — bascule en un clic entre répéter après la vidéo et écrire ce que vous entendez
- **Contrôle de lecture précis** : vitesses 0,8x / 1,0x / 1,25x, retours rapides de -5 s / -10 s
- **Page catalogue de l'atelier** : toutes vos notes de sous-titres organisées avec tri, filtrage et regroupement

<p align="center"><img src="../../assets/screenshots/shadowing-mode.png" width="315" alt="Mode shadowing"> <img src="../../assets/screenshots/dictation-mode.png" width="315" alt="Mode dictée"></p>
<p align="center"><em>Mode shadowing (à gauche) et mode dictée (à droite)</em></p>

<p align="center"><img src="../../assets/screenshots/listening-mode-2.png" width="640" alt="Mode écoute"></p>
<p align="center"><img src="../../assets/screenshots/record-pronunciation.png" width="640" alt="Enregistrer et obtenir une évaluation de prononciation par IA"></p>
<p align="center"><img src="../../assets/screenshots/focus-mode.png" width="640" alt="Mode concentration"></p>
<p align="center"><em>Mode concentration</em></p>

### ✨ Analyse assistée par IA — apportez votre propre clé API
- **6 modèles d'analyse intégrés** : analyse complète, difficulté du vocabulaire, contexte culturel, lecture bilingue approfondie, quiz de lecture et défi à trous
- **Horodatages cliquables** dans chaque rapport — retournez directement au moment correspondant de la vidéo
- **Historique et catalogue des rapports** : parcourez, recherchez, regroupez et rouvrez vos rapports passés
- **Évaluation de prononciation par IA** sur vos enregistrements de shadowing
- **Remplissage automatique des cartes mémo en un clic** : laissez l'IA compléter les champs manquants de vos cartes
- Compatible avec **OpenAI, DeepSeek, Google Gemini, Kimi, GLM, Qwen, OpenRouter ou tout point de terminaison compatible OpenAI** — votre clé, votre choix, vos données

<p align="center"><img src="../../assets/screenshots/ai-analysis-2.png" width="640" alt="Rapport d'analyse assisté par IA"></p>

### 📺 Abonnements aux chaînes YouTube
- Abonnez-vous à des chaînes avec **catégories, interrogation RSS et notifications de nouvelles vidéos**
- Parcourez votre fil en vue carte/liste et **prévisualisez les vidéos dans l'application** sans quitter Obsidian
- **Génération de notes vidéo avec sous-titres en un clic**, y compris le téléchargement par lots multi-sélection

<p align="center"><img src="../../assets/screenshots/youtube-subscriptions.png" width="640" alt="Abonnements aux chaînes YouTube"></p>

### 📝 Et bien plus
- Conversion **SRT vers note** (unitaire et par lots) pour vos propres fichiers de sous-titres
- **Test de taille de vocabulaire** — estimez votre vocabulaire grâce à des tests par échantillonnage
- **Guide HTML du débutant** inclus
- **10 thèmes** : Paper & Ink, Mint Atelier, Rose Blush, Lavender Dream, Candy Pop, Mindful Oasis, Coral Warmth, Ocean Glass, Aurora Prism et Dark Lemon
- Prise en charge complète sur **ordinateur et mobile**

---

## 🆓 Édition Gratuite (De base) vs Édition Complète

L'Édition de Base est gratuite pour toujours. L'**Édition Complète** débloque tous les modules avancés ci-dessous — **achat unique, utilisation à vie, mises à jour gratuites** :

| Module de fonctionnalités | De base (gratuit) | Édition Complète |
|---|:---:|:---:|
| Recherche dans le dictionnaire (double-clic / capture du contexte / prononciation / carnet) | ✅ | ✅ |
| Dictionnaires MDX locaux (ordinateur) | ✅ | ✅ |
| Dictionnaires sur mobile (import pour recherche hors ligne) | — | ✅ |
| Synchronisation des cartes mémo entre appareils | — | ✅ |
| Cartes mémo FSRS (mode retournement / statistiques / animal de compagnie) | ✅ | ✅ |
| Analyse IA (6 modèles / évaluation / remplissage automatique des cartes) | **Partielle** | **Complète** |
| Atelier de shadowing (shadowing / dictée / contrôle de vitesse) | ✅ | ✅ |
| Génération de notes vidéo (téléchargement des sous-titres inclus) | ✅ | ✅ |
| SRT vers note, test de vocabulaire, abonnements et prévisualisation YouTube | ✅ | ✅ |
| **Langues supplémentaires** : allemand / français / espagnol / coréen / russe / japonais | — | ✅ |
| **9 thèmes d'interface supplémentaires** (en plus du thème Classique Paper & Ink) | — | ✅ |
| **Téléchargement de sous-titres en un clic / par lots** depuis la page d'abonnements | — | ✅ |
| **Notes de signets vidéo** (capture d'écran + retour au moment exact) | — | ✅ |
| **Génération de cartes mémo par lots avec l'IA** à partir de n'importe quelle note | — | ✅ |
| **Annotation du vocabulaire par niveaux en un clic** (Oxford CEFR 3000/5000 + listes d'examen chinoises) | — | ✅ |
| **Import / export des données des cartes mémo** (JSON / TXT / MD / CSV) | — | ✅ |
| **Enregistrement local des rapports IA** (note / HTML / image longue) | — | ✅ |
| **Cartes pédagogiques vidéo** (quiz contextuels pendant la lecture) | — | ✅ |
| **Modes de révision des cartes par écoute / frappe** | — | ✅ |
| **Modèles de prompts IA personnalisés** (ajoutez / modifiez les vôtres) | — | ✅ |

## 🛒 Débloquer l'Édition Complète

L'Édition Complète est un **achat unique** (sans abonnement) avec **mises à jour gratuites à vie**. Obtenez-la sur les boutiques officielles de l'auteur :

- **小红书 (Xiaohongshu)** : https://xhslink.com/m/4ke3sdw1uXp
- **B站 (Bilibili)** : https://b23.tv/QYtaP7T
- **视频号小店 (boutique WeChat Channels)** : https://store.weixin.qq.com/shop/a/T9WX95cCebFqe4F

Des questions sur l'utilisation ou l'Édition Complète ? Scannez le code QR pour ajouter l'auteur sur WeChat :

<p align="center"><img src="../../assets/wechat-qr.jpg" width="200" alt="Ajouter l'auteur sur WeChat" /></p>

---

## 🚀 Installation

**Depuis le répertoire communautaire d'Obsidian (recommandé)** : Paramètres → Plugins communautaires → Parcourir → recherchez « Language Made Easy » → Installer → Activer.

**Manuellement** : téléchargez `main.js`, `manifest.json` et `styles.css` depuis la dernière [version](https://github.com/PandoraReads/language-made-easy-lite/releases) dans `.obsidian/plugins/language-made-easy/`, puis activez le plugin dans Paramètres → Plugins communautaires.

### Premiers pas
1. **Fonctionnalités IA (facultatif)** — ajoutez un fournisseur LLM avec votre propre clé API dans les paramètres du plugin (OpenAI / DeepSeek / Gemini / Kimi / GLM / Qwen / OpenRouter / compatible OpenAI personnalisé)
2. **Dictionnaires (facultatif)** — enregistrez des dictionnaires MDX locaux, ou utilisez la chaîne en ligne gratuite
3. **Carnet de vocabulaire** — choisissez le dossier du fichier de vocabulaire tenu à jour automatiquement
4. Cliquez sur l'icône en forme de toque de diplômé dans le ruban pour ouvrir le **panneau de navigation** et explorer

## 🌐 Utilisation du réseau

Le plugin fonctionne entièrement hors ligne, à l'exception des requêtes facultatives suivantes, initiées par l'utilisateur :

- **Dictionnaire / traduction / prononciation** : `dict.youdao.com`, `translate.googleapis.com` / `translate.google.com`, `dict.iciba.com`, `api.mymemory.translated.net`
- **Vidéos et sous-titres** (lorsque vous ouvrez/téléchargez une vidéo ou actualisez vos abonnements) : `www.youtube.com`, `i.ytimg.com` / `img.youtube.com`, `api.bilibili.com`, `www.bilibili.com`, `b23.tv` ; sur mobile, l'intégration YouTube passe par le proxy officiel d'Obsidian `releases.obsidian.md`
- **Fonctionnalités IA** (uniquement si vous configurez un fournisseur) : le point de terminaison du fournisseur choisi, appelé avec **votre propre clé API**
- Les dictionnaires MDX sont des fichiers locaux — rien n'est téléchargé

## 🔒 Confidentialité

- **Aucune télémétrie, aucun outil d'analyse, aucun compte**
- Les seules données quittant votre appareil sont les recherches/traductions que vous initiez et les fournisseurs d'IA que **vous** configurez

**Fichiers en dehors du coffre** : les paramètres du dictionnaire peuvent pointer vers des fichiers MDX stockés ailleurs sur votre appareil ; le plugin ne lit que les fichiers que vous sélectionnez explicitement.

## 📋 Journal des modifications

### 4.2.0

- **Interface en 10 langues** — anglais, chinois simplifié/traditionnel, allemand, français, espagnol, japonais, coréen, russe et thaï. L'interface suit par défaut la langue d'Obsidian et peut être modifiée dans les paramètres ; les vues ouvertes se re-rendent immédiatement après le changement.
- **Rapports IA localisés** — variantes de prompts en anglais ajoutées, et les rapports sont rédigés dans la langue de votre interface sur les interfaces non chinoises.
- **Chaîne de traduction plus intelligente** — les cibles de traduction suivent la langue de l'interface, et les langues d'apprentissage autres que l'anglais utilisent par défaut Google Translate.
- **Parcours d'achat localisé** — les interfaces non chinoises ouvrent le site web officiel dans la fenêtre de mise à niveau.
- **Guide intégré multilingue** — le guide HTML est fourni dans les 10 langues d'interface.
- **Raffinement du panneau de navigation** — les statistiques et les boutons d'actions rapides s'adaptent aux langues à mots longs : les chiffres restent alignés sur une seule ligne, les libellés ne se coupent ni ne se chevauchent jamais, et les légendes des boutons sont limitées à deux lignes.
- **Barres de défilement entièrement masquées** dans le panneau de navigation et les vues de révision des cartes mémo.
- Description bilingue du plugin (anglais + chinois) dans le manifest, et introduction bilingue dans le README chinois.

## 🛠 Développement

- Prérequis : Node.js 18+
- `npm install` · `npm run dev` (surveillance) · `npm run build:release` (bundle lisible, non minifié, tel qu'exigé par le répertoire communautaire) · `npm test`

## 📄 Licence

[GPL-3.0](../../LICENSE)

## ❤️ Soutenir le projet

Vous avez trouvé un bug ou vous avez une idée ? Ouvrez une issue dans ce dépôt. Vous pouvez également trouver l'auteur sous le nom de **PandoraReads** (潘多拉的数字花园) sur Weibo / Xiaohongshu / WeChat Channels.

---

*« Rendre l'apprentissage des langues aussi naturel que la respiration. » — Language Made Easy*
