# HTML Slide Editor

一个面向现有 HTML 演示文稿的本地可视化编辑器。它可以导入单个 HTML，或包含 HTML、CSS、图片与 classic JavaScript 的完整项目文件夹，然后自动识别页面和可编辑内容槽位，在真实 Preview 中完成页面切换、文字编辑、组件显隐和静态缩略图生成。

> 当前版本是浏览器端 Demo，重点验证 HTML Project Import、Pages / Preview / Slots 双向同步，以及 PowerPoint 风格的静态页面缩略图。

## 功能

- 导入单个 HTML 文件或完整 Project Folder
- 自动识别 canonical Slides 和 editable Slots
- 中央区域渲染真实 HTML、CSS、图片和 classic JavaScript
- `Pages → Preview` 与 `Preview → Pages / Slots` 双向同步
- Slot 文字修改、组件显示/隐藏和 Preview 高亮
- Undo / Redo 与本地草稿恢复
- 为所有 Slides 顺序生成 `160 × 90` 静态缩略图
- 缩略图渐进显示、单页失败隔离和重新导入取消保护
- 导出编辑后的 HTML 或带 Slot metadata 的模板 HTML

## 界面结构

```text
Pages                 Preview                    Slots
┌─────────────┐       ┌──────────────────────┐   ┌─────────────────┐
│ thumbnail 1 │       │                      │   │ title           │
│ thumbnail 2 │  ↔    │  imported HTML page  │ ↔ │ body            │
│ thumbnail 3 │       │                      │   │ image / visible │
└─────────────┘       └──────────────────────┘   └─────────────────┘
```

## 快速开始

项目不需要构建步骤。使用任意静态 HTTP Server 即可运行。

### Python

```powershell
cd html-slide-editor
python -m http.server 4176 --bind 127.0.0.1
```

打开：

- Editor: <http://127.0.0.1:4176/demo/index.html>
- Browser Test Runner: <http://127.0.0.1:4176/demo/tests/test-runner.html>

### 导入项目

1. 打开 Editor。
2. 点击 `Import HTML` 导入单文件，或点击 `Import Project Folder` 导入完整目录。
3. Folder Import 要求项目根目录存在 `index.html`。
4. 等待左侧显示 `Thumbnails: N / N`。
5. 点击 Pages、Preview 内原生导航或 Slots，检查三栏状态是否同步。

## Thumbnail Pipeline

```text
canonical/current HTML
        ↓
sequential thumbnail queue
        ↓
script-free same-origin renderer
        ↓
activate target slide
        ↓
wait for fonts and images
        ↓
html2canvas capture
        ↓
Map<slideId, dataUrl>
        ↓
progressive Pages rendering
```

缩略图采用单 renderer 顺序生成；每页 capture 后立即 dispose，因此不会长期保留一组隐藏 iframe。缓存只存在于当前 Import Session，重新导入会清空缓存并通过 generation token 阻止旧任务继续回写。

## 安全边界

- Main Preview 保持 `sandbox="allow-scripts"`，没有加入 `allow-same-origin`。
- Thumbnail Renderer 与 Main Preview 完全隔离。
- Thumbnail Document 会移除 imported scripts、inline event handlers、`javascript:` URLs、`iframe`、`object` 和 `embed`。
- 只有仓库内固定版本的 `html2canvas` 会在静态 renderer 中执行。
- Export 始终基于 Parent 持有的 canonical HTML，不读取 opaque Preview DOM。

## 测试

安装 Node dependencies：

```powershell
npm install
```

运行批量 Thumbnail 回归：

```powershell
node --test demo/tests/thumbnail-queue.test.mjs
```

浏览器完整 runner：

```text
http://127.0.0.1:4176/demo/tests/test-runner.html
```

当前 Browser Runner 基线：

```text
34 passed
5 known failures
0 unexpected failures
```

5 个 known failures 是既有环境/基线问题：inert parsing、缺失的 bridge fixture 路径、disabled-slot export，以及两个 localStorage environment 检查。

## 主要文件

| 文件 | 作用 |
|---|---|
| `demo/src/editor-ui.js` | 三栏 Editor 状态与交互入口 |
| `demo/src/folder-preview.js` | Folder Import、CSS / 图片 / classic JS 解析 |
| `demo/src/iframe-bridge.js` | Parent 与 sandboxed Preview 通信 |
| `demo/src/slide-detector.js` | Slide 根节点识别 |
| `demo/src/slot-detector.js` | 可编辑 Slot 识别与 metadata |
| `demo/src/static-thumbnail.js` | 安全静态文档、renderer 和截图 |
| `demo/src/thumbnail-queue.js` | 顺序队列、缓存、失败隔离和取消保护 |
| `demo/tests/test-runner.js` | 浏览器集成回归 |
| `demo/tests/thumbnail-queue.test.mjs` | Node 队列回归 |

## 当前限制

- 编辑 Slot 后不会自动刷新对应 Thumbnail；这是后续 Phase 4 的范围。
- Thumbnail Cache 不持久化，也不会写入 Export 或 Undo History。
- 不支持 ES module runtime 自动打包。
- 不解析 Canvas 中的文字，也不把动态创建的 DOM 自动提升为 Slots。
- CSS `url()` 和复杂跨域资源仍需要更完整的 Asset Resolver。

## 来源与许可

本项目从 [frontend-slides-editable](https://github.com/archlizheng/frontend-slides-editable) 的实验分支演进而来，当前仓库聚焦 HTML Import Editor 与静态缩略图工作流。

MIT License，详见 [LICENSE](./LICENSE)。
