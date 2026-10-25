# Language Made Easy — Espacio de trabajo inmersivo para aprender inglés en Obsidian

> 🌐 Otros idiomas: [English](./README-EN.md) · [简体中文](../../README.md) · [繁體中文](./README-ZH-TW.md) · [Deutsch](./README-DE.md) · [Français](./README-FR.md) · Español · [日本語](./README-JA.md) · [한국어](./README-KO.md) · [Русский](./README-RU.md) · [ไทย](./README-TH.md)

**Language Made Easy (LME)** convierte tu bóveda de Obsidian en un espacio de trabajo inmersivo completo para aprender inglés: búsqueda instantánea en el diccionario mientras lees, tarjetas de repaso espaciado con FSRS, shadowing de videos con subtítulos sincronizados y análisis potenciado por IA — todo en un solo lugar y guardado como notas simples en tu bóveda.

<p align="center"><img src="../../assets/screenshots/hero-overview.png" width="640" alt="Solución integral para el aprendizaje de idiomas"></p>


> ### 💡 Aviso sobre el modelo freemium
> Las funciones básicas de este plugin son gratuitas de instalar y usar; las funciones avanzadas se desbloquean por completo con la Edición Completa — una compra única, con acceso de por vida a todas las actualizaciones futuras. El diálogo de mejora dentro del plugin muestra los enlaces de compra. Consulta la [comparación de funciones](#-free-basic-vs-full-edition) más abajo para ver las diferencias.
>
> **La Edición Básica cubre todo el ciclo diario de aprendizaje — búsqueda, repaso de tarjetas, shadowing y notas de video; las capacidades avanzadas, como más idiomas, sincronización entre dispositivos y procesamiento por lotes, están en la Edición Completa.**

---

## ✨ Todos los módulos de funciones

### 🎬 Notas de video con un clic — del enlace a la lista para hacer shadowing en un solo paso
Pega un enlace de YouTube / Bilibili y el plugin obtiene el título, el canal y la portada, crea una nota de subtítulos estructurada y descarga los subtítulos — listo para hacer shadowing en cualquier momento. Tres puntos de entrada:
- **Panel de navegación**: el botón «Generar nota de video» junto al cuadro de búsqueda
- **Taller de shadowing**: haz clic en el icono del taller en la cinta lateral y analiza un enlace en el cuadro de entrada
- **Página de suscripciones de YouTube**: genera notas de cualquier video mientras navegas tu feed, **con descarga por lotes de selección múltiple** (Edición Completa)

<p align="center"><img src="../../assets/screenshots/video-note.png" width="640" alt="Nota de video generada"></p>

<p align="center"><img src="../../assets/screenshots/nav-video-note.gif" width="640" alt="Introduce un enlace de video en el panel de navegación para generar una nota de video con un clic"></p>

**Gestión unificada de notas**: todas las notas de video se encuentran en la página de catálogo del taller, con ordenación, filtrado y agrupación; haz clic en una tarjeta para empezar el shadowing, o Shift+clic para previsualizar la nota.

<p align="center"><img src="../../assets/screenshots/workshop-catalog.png" width="640" alt="Página del catálogo del taller"></p>

### 📖 Asistente de diccionario — lee cualquier cosa, consulta al instante
- **Búsqueda instantánea**: `Ctrl/Cmd + doble clic` sobre cualquier palabra (o selecciona texto) — las definiciones aparecen al instante en la barra lateral
- **Captura de contexto**: la frase completa que contiene la palabra se guarda automáticamente como su frase de ejemplo
- **Diccionarios MDX sin conexión**: carga diccionarios locales `.mdx`/`.mdd` en el escritorio sin límite de cantidad (la importación en móvil es de la Edición Completa)
- **Cadena de respaldo en línea**: Youdao → Google Translate → MyMemory, todas APIs públicas gratuitas, sin necesidad de claves
- **Pronunciación**: reproducción de audio con precarga inteligente
- **Añadir con un clic** a tu cuaderno de vocabulario (IndexedDB + archivo markdown mantenido automáticamente)

<p align="center"><img src="../../assets/screenshots/dictionary-lookup.png" width="640" alt="Búsqueda con doble clic y definiciones en la barra lateral"></p>

### 🧠 Tarjetas FSRS — recuerda lo que aprendes
- El avanzado **planificador FSRS** (`ts-fsrs`) calcula los intervalos de repaso óptimos para cada tarjeta
- **Modo de estudio con volteo** con animaciones fluidas de las tarjetas y sonido de pasar página
- **Panel de crecimiento**: mapa de calor anual, estadísticas de repaso y recordatorio diario de repaso
- **Gestor de tarjetas**: buscar, filtrar por idioma/dominio, ordenar, edición en línea y borrado masivo
- **Mascota compañera de aprendizaje** 🐣: una pequeña compañera que eclosiona, sube de nivel y crece con tus rachas

<p align="center"><img src="../../assets/screenshots/flashcard-review.png" width="300" alt="Repaso de tarjetas"> <img src="../../assets/screenshots/flashcard-review-2.png" width="300" alt="Estadísticas del repaso de tarjetas"></p>

<p align="center"><img src="../../assets/screenshots/one-click-cards.png" width="640" alt="Proceso de creación de tarjetas con un clic"></p>
<p align="center"><img src="../../assets/screenshots/batch-generate.png" width="640" alt="Generación de tarjetas por lotes con IA (Edición Completa)"></p>

### 🎬 Taller de shadowing de videos — aprende con videos reales
- **Archivos de YouTube, Bilibili y video/audio locales** en un solo espacio de trabajo
- **Genera una nota de video desde una URL**, descarga los subtítulos en ella y practica sin conexión en cualquier momento
- **Sincronización de subtítulos en tiempo real** con desplazamiento automático durante la reproducción
- **Modo shadowing y modo dictado** — cambia con un clic entre repetir lo que escuchas y escribir lo que oyes
- **Control preciso de la reproducción**: velocidad 0.8x / 1.0x / 1.25x y saltos rápidos de -5 s / -10 s
- **Página de catálogo del taller**: todas tus notas de subtítulos organizadas con ordenación, filtrado y agrupación

<p align="center"><img src="../../assets/screenshots/shadowing-mode.png" width="315" alt="Modo shadowing"> <img src="../../assets/screenshots/dictation-mode.png" width="315" alt="Modo dictado"></p>
<p align="center"><em>Modo shadowing (izquierda) y modo dictado (derecha)</em></p>

<p align="center"><img src="../../assets/screenshots/listening-mode-2.png" width="640" alt="Modo de escucha"></p>
<p align="center"><img src="../../assets/screenshots/record-pronunciation.png" width="640" alt="Graba y obtén puntuación de pronunciación con IA"></p>
<p align="center"><img src="../../assets/screenshots/focus-mode.png" width="640" alt="Modo de concentración"></p>
<p align="center"><em>Modo de concentración</em></p>

### ✨ Análisis potenciado por IA — usa tu propia clave de API
- **6 plantillas de análisis integradas**: análisis integral, dificultad del vocabulario, contexto cultural, lectura bilingüe detallada, cuestionario de comprensión y reto de rellenar huecos
- **Marcas de tiempo clicables** en cada informe — salta directamente al momento del video
- **Historial y catálogo de informes**: explora, busca, agrupa y vuelve a abrir informes anteriores
- **Puntuación de pronunciación con IA** en las grabaciones de shadowing
- **Autocompletado de tarjetas con un clic**: deja que la IA complete los campos que falten en tus tarjetas
- Funciona con **OpenAI, DeepSeek, Google Gemini, Kimi, GLM, Qwen, OpenRouter o cualquier endpoint compatible con OpenAI** — tu clave, tu elección, tus datos

<p align="center"><img src="../../assets/screenshots/ai-analysis-2.png" width="640" alt="Informe de análisis potenciado por IA"></p>

### 📺 Suscripciones a canales de YouTube
- Suscríbete a canales con **categorías, sondeo RSS y notificaciones de videos nuevos**
- Explora tu feed en vistas de tarjeta/lista y **previsualiza videos dentro de la app** sin salir de Obsidian
- **Generación de notas de video con subtítulos con un clic**, incluida la descarga por lotes de selección múltiple

<p align="center"><img src="../../assets/screenshots/youtube-subscriptions.png" width="640" alt="Suscripciones a canales de YouTube"></p>

### 📝 Y mucho más
- Conversión de **SRT a nota** (individual y por lotes) para tus propios archivos de subtítulos
- **Test de tamaño de vocabulario** — estima tu vocabulario con tests de muestreo
- **Guía HTML para principiantes** incluida
- **10 temas**: Paper & Ink, Mint Atelier, Rose Blush, Lavender Dream, Candy Pop, Mindful Oasis, Coral Warmth, Ocean Glass, Aurora Prism y Dark Lemon
- Soporte completo para **escritorio y móvil**

---

## 🆓 Edición Básica (gratuita) vs Edición Completa

La Edición Básica es gratis para siempre. La **Edición Completa** desbloquea todos los módulos avanzados que aparecen a continuación — **compra única, uso de por vida, actualizaciones gratuitas**:

| Módulo de funciones | Básica (gratuita) | Edición Completa |
|---|:---:|:---:|
| Búsqueda en el diccionario (doble clic / captura de contexto / pronunciación / cuaderno) | ✅ | ✅ |
| Diccionarios MDX locales (escritorio) | ✅ | ✅ |
| Diccionarios en móvil (importación para consultas sin conexión) | — | ✅ |
| Sincronización de tarjetas entre dispositivos | — | ✅ |
| Tarjetas FSRS (modo volteo / estadísticas / mascota) | ✅ | ✅ |
| Análisis con IA (6 plantillas / puntuación / autocompletado de tarjetas) | **Parcial** | **Completo** |
| Taller de shadowing (shadowing / dictado / control de velocidad) | ✅ | ✅ |
| Generación de notas de video (incl. descarga de subtítulos) | ✅ | ✅ |
| SRT a nota, test de vocabulario, suscripciones y previsualización de YouTube | ✅ | ✅ |
| **Más idiomas**: alemán / francés / español / coreano / ruso / japonés | — | ✅ |
| **9 temas de interfaz adicionales** (además de Classic Paper & Ink) | — | ✅ |
| **Descarga de subtítulos con un clic / por lotes** desde la página de suscripciones | — | ✅ |
| **Notas de marcadores de video** (captura de pantalla + salto al momento exacto) | — | ✅ |
| **Generación de tarjetas por lotes con IA** desde cualquier nota | — | ✅ |
| **Anotación de vocabulario por niveles con un clic** (Oxford CEFR 3000/5000 + listas de exámenes de China) | — | ✅ |
| **Importación / exportación de datos de tarjetas** (JSON / TXT / MD / CSV) | — | ✅ |
| **Guardar informes de IA localmente** (nota / HTML / imagen larga) | — | ✅ |
| **Tarjetas didácticas de video** (cuestionarios emergentes durante la reproducción) | — | ✅ |
| **Modos de repaso de tarjetas de escucha / escritura** | — | ✅ |
| **Plantillas de prompts de IA personalizadas** (añade / edita las tuyas) | — | ✅ |

## 🛒 Desbloquea la Edición Completa

La Edición Completa es una **compra única** (sin suscripción) con **actualizaciones gratuitas de por vida**. Consíguela en las tiendas oficiales del autor:

- **小红书 (Xiaohongshu)**: https://xhslink.com/m/4ke3sdw1uXp
- **B站 (Bilibili)**: https://b23.tv/QYtaP7T
- **视频号小店 (tienda de WeChat Channels)**: https://store.weixin.qq.com/shop/a/T9WX95cCebFqe4F

¿Preguntas sobre el uso o la Edición Completa? Escanea el código QR para añadir al autor en WeChat:

<p align="center"><img src="../../assets/wechat-qr.jpg" width="200" alt="Añade al autor en WeChat" /></p>

---

## 🚀 Instalación

**Desde el directorio de la comunidad de Obsidian (recomendado)**: Ajustes → Plugins de la comunidad → Explorar → busca «Language Made Easy» → Instalar → Activar.

**Manual**: descarga `main.js`, `manifest.json` y `styles.css` de la última [release](https://github.com/PandoraReads/language-made-easy-lite/releases) en la carpeta `.obsidian/plugins/language-made-easy/`, y luego activa el plugin en Ajustes → Plugins de la comunidad.

### Primeros pasos
1. **Funciones de IA (opcional)** — añade un proveedor de LLM con tu propia clave de API en los ajustes del plugin (OpenAI / DeepSeek / Gemini / Kimi / GLM / Qwen / OpenRouter / cualquier otro compatible con OpenAI)
2. **Diccionarios (opcional)** — registra diccionarios MDX locales, o usa la cadena en línea gratuita
3. **Cuaderno de vocabulario** — elige la carpeta para el archivo de vocabulario mantenido automáticamente
4. Haz clic en el icono del birrete académico de la cinta lateral para abrir el **panel de navegación** y explorar

## 🌐 Uso de la red

El plugin funciona totalmente sin conexión, salvo por las siguientes peticiones opcionales iniciadas por el usuario:

- **Diccionario / traducción / pronunciación**: `dict.youdao.com`, `translate.googleapis.com` / `translate.google.com`, `dict.iciba.com`, `api.mymemory.translated.net`
- **Videos y subtítulos** (cuando abres/descargas un video o actualizas las suscripciones): `www.youtube.com`, `i.ytimg.com` / `img.youtube.com`, `api.bilibili.com`, `www.bilibili.com`, `b23.tv`; en móvil, la inserción de YouTube recurre al proxy oficial de Obsidian `releases.obsidian.md`
- **Funciones de IA** (solo si configuras un proveedor): el endpoint del proveedor que elijas, al que se llama con **tu propia clave de API**
- Los diccionarios MDX son archivos locales — no se descarga nada

## 🔒 Privacidad

- **Sin telemetría, sin analíticas, sin cuentas**
- Los únicos datos que salen de tu dispositivo son las consultas/traducciones que tú inicias y los proveedores de IA que **tú** configuras

**Archivos fuera de la bóveda**: los ajustes del diccionario pueden apuntar a archivos MDX guardados en otro lugar de tu dispositivo; el plugin solo lee los archivos que seleccionas explícitamente.

## 📋 Registro de cambios

### 4.2.0

- **Interfaz en 10 idiomas** — inglés, chino simplificado/tradicional, alemán, francés, español, japonés, coreano, ruso y tailandés. La interfaz sigue el idioma de Obsidian por defecto y puede sobrescribirse en Ajustes; las vistas abiertas se vuelven a renderizar inmediatamente después del cambio.
- **Informes de IA localizados** — se añadieron variantes de prompts en inglés, y los informes se redactan en el idioma de tu interfaz en las interfaces no chinas.
- **Cadena de traducción más inteligente** — los objetivos de traducción siguen el idioma de la interfaz, y los idiomas de aprendizaje que no son inglés usan Google Translate por defecto.
- **Flujo de compra localizado** — las interfaces no chinas abren el sitio web oficial en el diálogo de mejora.
- **Guía integrada multilingüe** — la guía HTML se incluye en los 10 idiomas de la interfaz.
- **Mejoras del panel de navegación** — las estadísticas y los botones de acción rápida se adaptan a los idiomas con palabras largas: los números permanecen alineados en una sola línea, las etiquetas nunca se parten ni se superponen, y los textos de los botones se limitan a dos líneas.
- **Barras de desplazamiento totalmente ocultas** en el panel de navegación y en las vistas de repaso de tarjetas.
- Descripción bilingüe del plugin (inglés + chino) en el manifiesto, e introducción bilingüe en el README en chino.

## 🛠 Desarrollo

- Requisitos: Node.js 18+
- `npm install` · `npm run dev` (modo vigilancia) · `npm run build:release` (bundle legible, sin minificar, según lo exige el directorio de la comunidad) · `npm test`

## 📄 Licencia

[GPL-3.0](../../LICENSE)

## ❤️ Apoyo

¿Encontraste un error o tienes una idea? Abre un issue en este repositorio. También puedes encontrar al autor como **PandoraReads** (潘多拉的数字花园) en Weibo / Xiaohongshu / WeChat Channels.

---

*«Hacer que aprender idiomas sea tan natural como respirar.» — Language Made Easy*
