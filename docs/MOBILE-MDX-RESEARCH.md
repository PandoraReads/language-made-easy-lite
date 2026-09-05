# 移动端本地词典(MDX)可行性深度调查

日期: 2026-08-24
范围: 调查 iOS/Android 平板上让插件调用本地 MDX 词典的技术路线
结论: **可行**。推荐「文件选择器流式导入 + OPFS 随机读 + vendor js-mdict 替换数据源层」方案,渲染层零改动复用。

---

## 1. 结论速览

| 问题 | 答案 |
|---|---|
| 移动端能不能解析 MDX | 能。MDX 格式解析本身是纯计算,zlib/lzo/ripemd128 均有纯 JS 实现(js-mdict 已内含) |
| 最大的障碍是什么 | 不是解析,是**随机读文件**:移动端没有 Node fs,`vault.adapter.readBinary()` 只能整文件读入且走 base64 桥接,大词典会慢 + OOM |
| 破局点 1 | `<input type="file">` 在 Obsidian 移动端可用(官方 obsidian-importer 已验证),拿到的 `File` 对象支持 `slice()` 分块流式读取,可从「文件」App/iCloud 任意位置导入且不经过 vault |
| 破局点 2 | OPFS(浏览器私有文件系统)提供真正的按偏移随机读:`createSyncAccessHandle()` 支持 iOS 16.4+ / Android WebView,配合 Web Worker 使用 |
| 破局点 3 | js-mdict(MIT 许可,已核实)对文件系统的依赖收敛在 `FileScanner` 一个类、两个同步读方法上,替换成本极低 |
| 渲染要重写吗 | 不要。`DictView` 的 Shadow DOM + CSS 注入 + MDD Blob URL 管线是平台无关的 DOM/Blob API,原样复用 |
| 推荐路径 | 方案 C(见第 4 节):导入一次存 OPFS,之后查词只读所需字节块,内存占用与词典体积无关 |

---

## 2. 桌面端现状(移植基线)

活代码链路(桌面):

```
入口(命令/双击/Ctrl+Shift+mouseup/右键菜单)
  → captureContext → triggerLookup (main-unified-full.ts:1740-1854)
  → DictView.lookup (views/dict-view.ts:233,右侧侧栏视图,无独立弹窗)
  → UnifiedDictionaryService.lookupMulti (services/UnifiedDictionaryService.ts:567)
  → querySingleMDX (:108,按 dict.id 缓存引擎实例)
  → MDXEngine.lookup (core/MDXEngine.ts:125,原词→小写→首字母大写三级尝试 + @@@LINK 一跳)
  → DictResult{definition,style,srcMdx,dictId,dictName} 流式回调
  → renderSingleResult (dict-view.ts:358,Shadow DOM 注入词典 CSS/折叠修复 CSS/暗色主题)
```

移动端目前是**静默禁用**:

- `core/MDXEngine.ts:9` — 仅 `Platform.isDesktop` 时 `require('fs')`/`require('js-mdict')`
- `core/MDXEngine.ts:34/126/172` — 移动端 `load()/lookup()/getResource()` 直接 return null
- `Settings.ts:859` — 移动端词典配置区只显示提示「移动端暂不支持本地 MDX 词典,请使用网络词典」
- `UnifiedDictionaryService.ts:606` — 移动端强制走在线词典兜底
- 移动端查词入口已存在:浮动放大镜按钮 `main-unified-full.ts:1540-1607`,无需新增入口

桌面专属依赖完整清单(移植时要逐一处理):

| 位置 | 依赖 | 用途 |
|---|---|---|
| `core/MDXEngine.ts:8-15` | 惰性 require fs + js-mdict | 引擎加载 |
| `core/MDXEngine.ts:40,52-54,100` | fs.existsSync/readFileSync/readdirSync | 路径校验/CSS 读取/MDD 自动发现 |
| `core/MDXEngine.ts:133,270,295` | Buffer.isBuffer/from(base64) | MDD 资源字节处理 |
| `Settings.ts:1679,1689` | window.require('fs') | 同名 .mdd/.css 自动发现 |
| `Settings.ts:1637-1643` | electron webUtils | 隐藏 file input 兜底取路径 |
| `utils/electron-remote.ts` | @electron/remote | 原生文件选择对话框 |
| js-mdict 内部 `scanner.js` | node:fs openSync/readSync | 按位置同步读(唯一硬耦合点) |

关键事实(本次核实):

- js-mdict 6.0.8 公开 API `lookup(word)`/`locate(key)` **是同步的**,内部全部经由 `FileScanner.readBuffer(offset, length): Uint8Array` 和 `readNumber(offset, length): DataView` 两个同步方法取数
- js-mdict 许可证为 **MIT**(node_modules 内 LICENSE 文件核实;jsdelivr 页面标的 AGPL 是错的),vendor 源码进本仓库无法律障碍
- lzo 解压有纯 JS 实现(lzo1x.js 已在依赖内),加密词典(ripemd128)同样有纯 JS 实现,vendor 后与桌面能力对等

---

## 3. 移动端平台的硬约束(证据)

| 约束 | 说明 | 证据 |
|---|---|---|
| 无 Node/Electron | 移动端是 Capacitor WebView,插件跑在沙箱 JS 环境 | [Obsidian Forum: 移动端用什么框架](https://forum.obsidian.md/t/what-framework-are-the-mobile-apps-using-reactnative-native/58571) |
| vault 外不可访问 | 插件无法读取设备任意路径;桌面那种「绝对路径查 C:\dict\oaldpe.mdx」在移动端不存在 | [Reddit 讨论](https://www.reddit.com/r/ObsidianMD/comments/1i4cgv7/can_obsidian_plugins_access_files_outside_the/) |
| readBinary 整文件读 | `vault.adapter.readBinary()` 是唯一二进制读法,一次性载入内存;无分块/流式 API(2025-11 官方仍无回应) | [论坛功能请求帖](https://forum.obsidian.md/t/add-api-support-for-reading-and-writing-binary-by-chunks-or-streaming/77384) |
| Capacitor 桥接 base64 | 大文件跨桥慢且内存翻倍 | [Capacitor issue #31](https://github.com/ionic-team/capacitor/issues/31) |
| WKWebView 内存上限 | 大文件整读触发 jetsam/OOM,iOS 上先例很多 | [Cordova-ios #1033](https://github.com/apache/cordova-ios/issues/1033) |

可用的「口子」:

| 能力 | 说明 | 证据 |
|---|---|---|
| `<input type="file">` | 移动端可用,弹出系统「文件」选择器;返回的 `File` 对象支持 `slice(start,end)` 按区间读,分块流式处理不会整文件进内存 | 官方 obsidian-importer 即此方案:[issue #4](https://github.com/obsidianmd/obsidian-importer/issues/4) |
| OPFS `navigator.storage.getDirectory()` | 浏览器私有文件系统,iOS 15.2+ / Android WebView 均支持 | [WebKit 官方博客](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/) |
| `createSyncAccessHandle()` | OPFS 上的**同步随机读写**(仅限 dedicated Worker;iOS 16.4+):`handle.read(buf, {at: offset})` 与桌面 fs.readSync 语义几乎一一对应 | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle) |
| IndexedDB | 全平台可靠的持久化兜底(异步,Blob 存储) | RxDB 等项目的通用回退模式 |

社区现状:**没有任何 Obsidian 插件真正在移动端解析过 MDX**。[obsidian-mdx-dictionary](https://github.com/MizarZh/obsidian-mdx-dictionary)(js-mdict + 本地 HTTP 服务器 + iframe)和 [obsidian-local-dict](https://github.com/yuscale/obsidian-local-dict)(SilverDict HTTP 服务)都是「本地服务器」路线,仅桌面。移动端查 MDX 的主流做法是跳专业词典 App(OpenMDict/欧路)。即:此功能没有现成轮子可抄,但也没有「已被证明不可行」的先例。

---

## 4. 候选方案对比

### 方案 A: 整文件读入内存(最简 PoC)

做法: MDX 放进 vault(iOS 用「文件」App 拷进 vault 目录,或 iCloud 同步),移动端 `readBinary()` → ArrayBuffer,用内存版后端(DataView)喂给 vendor 版解析器。

- 优点: 改造量最小,一周内可出可用版本
- 缺点: 首次加载慢(base64 桥接,100MB 级要数秒到数十秒);内存峰值 = 文件体积 x2-3(桥接 + ArrayBuffer + 解析临时),OALD10 级(100-300MB mdx,含音频 mdd 可达 GB 级)在 iOS 上有 OOM 风险;词典占 vault 同步流量
- 适用: 小词典(<=100MB)或作为 PoC 验证解析层

### 方案 B: 桌面预处理成「移动端词典包」

做法: 桌面端(已有完整解析能力)把 MDX 转换成「词头索引 + 释义分片 + 抽出的 CSS/图片资源」目录结构,放进 vault 同步;移动端只读索引(几 MB)+ 命中词条所在的小分片(每片 1-4MB)。

- 优点: 内存占用恒定极小;不依赖 OPFS/Worker 等新 API;查词快
- 缺点: 要定义并长期维护一套私有词典包格式;用户必须先在桌面跑一次转换;多一道同步分发流程
- 适用: 作为方案 C 的 Plan B(OPFS 在部分设备不可靠时启用)

### 方案 C: 文件选择器导入 + OPFS 随机读(推荐)

做法: 移动端设置页「导入词典」→ `<input type="file">` 多选 .mdx/.mdd/.css → `File.slice()` 512KB-1MB 分块流式写入 OPFS(全程不整文件进内存)→ 查词时 vendor 版解析器在 Web Worker 里用 `createSyncAccessHandle` 按偏移同步读。

- 优点: 不占 vault;文件可来自任意位置(文件 App/iCloud/网盘导出);内存占用与词典体积无关;导入一次永久使用;与桌面共用同一套 MDX 文件无需转换
- 缺点: 依赖 iOS 16.4+(2023-03 发布,2026 年覆盖存量设备足够);OPFS 在 WKWebView 的持久性需真机验证;Worker 内跑解析器增加一层消息通信
- 回退链: OPFS 不可用时降级为方案 A(内存后端 + 体积白名单),再不可用则提示不支持

### 方案 D: 文件导入 + IndexedDB 异步分块

做法: 同 C 的导入,但存 IndexedDB,查词时异步取所需块。

- 评估: 需要把 vendor 解析器全面异步化(lookup 本体也是同步的),改造深度远超 C;IndexedDB 取 Blob 的性能也低于 OPFS 同步句柄。**不推荐**,仅在 OPFS 全面失效时重新评估

### 方案 E: 局域网词典服务器

做法: 桌面跑 GoldenDict/SilverDict 类服务,移动端 HTTP 查询。

- 评估: 违背「本地、离线」初衷,移动端单独使用时不可用。仅适合用户自己有常开桌面机的场景。不采用

### 方案 F: URL Scheme 外跳词典 App(保底速赢)

做法: 移动端查词按钮增加「在外部词典打开」:欧路 `eudic://dict/q={word}`(iOS 6.3.0+ 还支持 x-callback-url 返回),Android 侧 MDict App 有 Intent。

- 评估: 半天工作量,可先解决「手机上完全没法查」的燃眉之急;但体验割裂(跳出 Obsidian),词典内容无法进生词本/笔记流。作为 C 落地前的过渡,不作为终态
- 参考: [欧路 URL Scheme 官方文档](https://docs.eudic.net/1/jin-jie-gong-neng/url-scheme)

---

## 5. 推荐架构(方案 C 展开)

```
┌─ 导入层(移动端设置页) ─────────────────────────────┐
│ <input type="file"> 多选(.mdx/.mdd/.css,不加 accept │
│ 过滤避免 iOS 灰显未知扩展名)                          │
│ → File.slice() 分块(512KB-1MB)流式写 OPFS + 进度条   │
│ → 同时流式解析头部,记录文件指纹与词表索引元数据        │
└──────────────────────────────────────────────┘
┌─ 存储层 ──────────────────────────────────────┐
│ OPFS: /dicts/{dictId}/mdx, mdd... + meta.json      │
│ navigator.storage.persist() 申请持久化              │
│ 配额/用量展示、删除管理                              │
└──────────────────────────────────────────────┘
┌─ 解析层(vendor js-mdict) ────────────────────────┐
│ FileScanner 抽象为 Backend 接口:                    │
│   readBuffer(offset,len) / readNumber(offset,len)   │
│ 三实现: fs(桌面,原样) / ArrayBuffer(内存降级) /     │
│         OPFS-syncHandle(移动,Worker 内)             │
│ Worker 协议: load/lookup/locate 三条 RPC            │
└──────────────────────────────────────────────┘
┌─ 服务层 ──────────────────────────────────────┐
│ MdxDictionary 增加 source: 'fs' | 'store' 判别字段  │
│ UnifiedDictionaryService.querySingleMDX 移动分支:   │
│   走 Worker 引擎,其余(词形还原/在线兜底/多词典排序)  │
│   逻辑不变                                           │
└──────────────────────────────────────────────┘
┌─ 渲染层(零改动) ────────────────────────────────┐
│ DictView Shadow DOM / CSS 注入 / 折叠修复 / 暗色主题 │
│ / MDD Blob URL / sound:// 播放 全部平台无关,复用    │
└──────────────────────────────────────────────┘
```

关键设计决策:

1. **vendor 而非 wrap**: 把 js-mdict dist 源码(MIT,附版权声明)复制进 `src/vendor/js-mdict/`,只改 `FileScanner` 与其构造入口。npm 包原样保留给桌面路径,二者并存直到移动端稳定后再统一。
2. **同步接口保形态**: 不把解析器异步化。OPFS 同步句柄 + Worker 恰好与 `readSync(fd, buf, {position})` 语义对齐,`lookup(word)` 保持同步签名,跨 Worker 用 postMessage 包一层 Promise RPC。
3. **索引常驻,块按需**: Worker 启动时解析 header + key block index(常驻内存,大词典约 5-15MB);每次查词只同步读一个 record block。查词延迟预期 <50ms。
4. **MDD 同通道**: 图片/音频资源走同一 Backend,`getResource` 逻辑(5 种路径变体二分 + 大小写兜底)原样搬进 Worker。

---

## 6. 分阶段实施计划

| 阶段 | 内容 | 验证标准 | 预估 |
|---|---|---|---|
| P0 PoC | vendor js-mdict + ArrayBuffer 后端 + 硬编码导入一本小 mdx + 现有 DictView 渲染;iOS/Android 真机各一台 | 移动端能查出词条且样式正确 | 2-4 天 |
| P1 存储与导入 | OPFS Worker 化、input file 流式导入、进度与错误处理、persist() | 300MB 级词典导入不崩,重启 App 后数据仍在 | 3-5 天 |
| P2 完整词典体验 | MDD 多分卷/图片/发音、CSS 导入、@@@LINK、词形还原联动、多词典排序 | OALD10 全功能对齐桌面(词典自带 JS 仍不执行,维持现状) | 3-4 天 |
| P3 设置与管理 | 移动端设置区(替换现有「暂不支持」提示)、每语言词典列表、用量/删除、i18n、新手指南补充 | 无桌面路径概念,纯导入式配置 | 2-3 天 |

P0 里必须先回答的验证点(风险前置):

1. iOS Obsidian WebView 中 `<input type="file">` 能否选中 .mdx(不加 accept 属性)
2. 插件内能否从 Blob URL 创建 Web Worker(blob worker 是 Obsidian 移动端插件常用手法,但需实测本插件环境)
3. OPFS 在 Obsidian 的 WKWebView 里的持久性:App 重启、iOS 系统存储压力下的表现;`persist()` 是否被授予
4. `createWritable`(主线程流式写)与 worker 同步句柄写在 iOS 上的可用组合
5. OALD10 真实体积下的导入耗时与查词延迟基线

---

## 7. 风险清单

| 风险 | 概率 | 缓解 |
|---|---|---|
| OPFS 数据被系统清掉(WKWebView 存储驱逐) | 低-中 | persist() + meta.json 记录指纹,检测丢失后提示一键重导入;词典源文件用户自留 |
| blob Worker 创建受限 | 低 | 回退:内存后端跑主线程(查词毫秒级同步解析,不卡 UI) |
| iOS <16.4 设备无同步句柄 | 低(2026 年) | 降级方案 A(体积白名单内走内存) |
| 大 MDD 超配额 | 中 | 设置页展示用量;音频型 MDD 允许跳过导入(发音已有在线 TTS 兜底) |
| Obsidian 移动端升级改变 WebView 行为 | 低 | 全部走特性检测,失败路径都有提示而非崩溃 |
| vendor 版与 npm 版行为漂移 | 低 | vendor 时锁 6.0.8 快照 + 注明来源 commit;桌面先不迁移,双轨验证一个版本周期 |

---

## 8. 参考资料

- Obsidian 论坛: [分块读取 API 请求(未实现)](https://forum.obsidian.md/t/add-api-support-for-reading-and-writing-binary-by-chunks-or-streaming/77384) / [移动端框架确认(Capacitor)](https://forum.obsidian.md/t/what-framework-are-the-mobile-apps-using-reactnative-native/58571)
- WebKit 官方: [File System Access API with OPFS](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/)
- MDN: [createSyncAccessHandle(仅 Worker)](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle)
- obsidian-importer 移动端 file input 先例: [issue #4](https://github.com/obsidianmd/obsidian-importer/issues/4)
- 桌面参考实现(均不可直接用于移动端): [obsidian-mdx-dictionary](https://github.com/MizarZh/obsidian-mdx-dictionary) / [obsidian-local-dict](https://github.com/yuscale/obsidian-local-dict)
- 欧路词典 URL Scheme: [官方文档](https://docs.eudic.net/1/jin-jie-gong-neng/url-scheme)
- Capacitor 桥接二进制限制: [issue #31](https://github.com/ionic-team/capacitor/issues/31)
