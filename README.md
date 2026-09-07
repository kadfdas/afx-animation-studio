# AFX 动画工坊 — 前端动画框架

零依赖的网页动画编辑器：纯 **HTML + CSS + JavaScript**，无需安装、无需构建。同时提供 **Electron 桌面版**，可打包成 Windows 安装包/便携 exe，普通用户下载即可使用。

## 桌面版（Electron）

### 下载与使用

桌面版已打包在 `dist/` 目录下，提供两种分发形态：

| 文件 | 说明 |
|------|------|
| `AFX动画工坊-1.0.0-x64.exe` | **NSIS 安装包**（约 78 MB）。双击运行，按向导安装，可选择安装目录、创建桌面/开始菜单快捷方式。卸载通过控制面板或安装目录下的 `Uninstall AFX动画工坊.exe`。 |
| `AFX动画工坊-1.0.0-portable.exe` | **便携版单文件**（约 78 MB）。双击即运行，无需安装，所有数据保存在用户目录。 |
| `dist/win-unpacked/` | **绿色版目录**。包含 `AFX动画工坊.exe` 及运行时文件，整体拷贝到任意位置即可运行。 |

> 安装包与便携版均已包含 Electron 运行时，**用户电脑无需安装 Node.js 或任何依赖**。

### 桌面版增强功能

- 原生「文件」菜单：新建 / 打开项目 / 保存项目 / 退出
- 原生「保存」「打开」对话框（替代浏览器下载/上传）
- 原生「播放」菜单：空格播放/暂停、Shift+空格停止
- 窗口尺寸与位置记忆、单实例锁
- 开发者工具可通过「视图 → 开发者工具」打开

### 开发者：从源码打包

环境要求：Node.js ≥ 18。

```bash
# 1. 安装依赖
npm install

# 2. 开发模式运行
npm start

# 3. 打包（生成安装包 + 便携版）
npm run dist
```

打包产物输出到 `dist/` 目录。首次打包会自动下载 Electron 二进制与 NSIS 工具（已配置 npmmirror 国内镜像，见 `.npmrc`）。

> 打包所需的 Electron 运行时与构建工具链体积较大，首次 `npm install` 请耐心等待。

## 项目结构

```
1/
├── index.html            # 页面入口（五区布局）
├── main.js               # Electron 主进程（窗口/菜单/IPC）
├── preload.js            # 预加载脚本（暴露原生文件对话框 API）
├── package.json          # npm 配置 + electron-builder 打包配置
├── .npmrc                # 国内镜像配置（npmmirror）
├── css/
│   └── style.css         # 全局样式（深色编辑器主题）
├── js/
│   ├── easing.js         # 缓动函数库（12 种速度曲线）
│   ├── scene.js          # 场景 JSON 数据模型 + 元素工厂 + 序列化
│   ├── render.js         # 画布渲染引擎（逐帧计算、拖拽、媒体同步）
│   ├── panels.js         # 左侧元素列表 + 右侧属性编辑面板
│   ├── timelineui.js     # 底部时间轴轨道（显隐段 / 动画条 / 播放头）
│   └── app.js            # 播放引擎 + 工具栏 + 保存导入 + 模式切换
└── README.md
```

## 运行说明

**方式一（最简单）**：直接双击 `index.html` 用浏览器打开（推荐 Chrome / Edge）。

**方式二（本地服务器）**：

```bash
# 任选其一
npx serve .
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 功能速览

| 区域 | 功能 |
|------|------|
| 顶部 | 播放 / 暂停 / 停止、时间显示、画布宽高/时长/背景设置、保存 JSON / 导入 JSON / 新建、预览模式 |
| 左侧 | 添加元素（文字 / 图片 / 视频 / 音频 / SVG 图形）、元素列表（选中、删除） |
| 中间 | 画布实时预览；拖拽移动元素；双击文字可直接编辑 |
| 右侧 | 选中元素的属性面板：坐标、宽高（支持等比）、旋转、不透明度、内容编辑、显隐段、移动/缩放/透明/旋转动画、音频设置、层级（置顶/上移/下移/置底） |
| 底部 | 时间轴：秒刻度尺、每元素一行（蓝框=显隐时间段，彩条=移动/缩放/透明/旋转动画，绿条=音频窗口）、播放头拖动跳转、缩放 |

### 快捷键

- `空格`：播放 / 暂停
- `Delete`：删除选中元素
- `Esc`：退出预览模式

### 典型工作流

1. 左侧点击「＋ 文字 / ＋ 图片 / ＋ SVG 图形」添加元素（图片、视频、音频会弹出文件选择，文件以 base64 内嵌进项目 JSON）。
2. 在画布上拖动元素，或在右侧属性面板精确设置 X/Y、宽高。
3. 在右侧「移动动画」「缩放动画」等分组勾选「启用」，设置方向、距离、时长、延迟、缓动曲线、结束后是否回到起点。
4. 在「显隐时间轴」中设置出现/消失时间，支持多段显隐与段内淡入淡出。
5. 音频元素可设置播放起止时间、音量、淡入淡出，与动画时间轴自动同步。
6. 点击「预览模式」纯净播放；「保存 JSON」导出项目文件，「导入 JSON」恢复。

## 场景 JSON 数据结构

```jsonc
{
  "version": 1,
  "meta": {
    "name": "演示项目",
    "duration": 8,          // 总时长（秒）
    "width": 960,           // 画布宽
    "height": 540,          // 画布高
    "background": "#ffffff" // 画布背景
  },
  "elements": [
    {
      "id": "text_abc123_1",
      "type": "text",              // text | image | video | audio | svg
      "name": "标题文字",
      "content": {                 // 类型相关内容
        "text": "你好，动画世界",
        "fontSize": 42,
        "color": "#2d3436",
        "bold": true
        // image/video/audio: "src": "data:...（base64 内嵌媒体）"
        // svg: "svg": "<svg ...>...</svg>", "preset": "star"
      },
      "style": {
        "x": 250, "y": 70,         // 画布坐标（px）
        "width": 460, "height": 60,
        "opacity": 1,
        "rotation": 0
      },
      "visibility": [              // 显隐时间段（支持多段显隐）
        { "start": 0, "end": 8, "fadeIn": 0, "fadeOut": 0 }
      ],
      "animations": {
        "move": {                  // 位移动画
          "enabled": true,
          "direction": "right",    // right|left|up|down|upRight|upLeft|downRight|downLeft
          "distance": 200,         // 位移距离 px
          "duration": 1.2,         // 持续秒数
          "delay": 0,              // 延迟秒数
          "easing": "easeOutCubic",
          "after": "stay"          // stay=停在终点 | back=回到起点
        },
        "scale": {                 // 尺寸动画（A → B）
          "enabled": false,
          "fromWidth": 100, "fromHeight": 100,
          "toWidth": 160, "toHeight": 160,
          "duration": 1.5, "delay": 0, "easing": "easeInOutQuad"
        },
        "opacity": {               // 不透明度渐变
          "enabled": false,
          "from": 0, "to": 1,
          "duration": 1, "delay": 0, "easing": "easeInOutQuad"
        },
        "rotate": {                // 旋转动画
          "enabled": false,
          "angle": 360,            // 旋转角度（0~360）
          "direction": "cw",       // cw 顺时针 | ccw 逆时针
          "duration": 3, "delay": 0, "easing": "linear"
        }
      },
      "audio": {                   // 音频/视频播放窗口（与时间轴同步）
        "start": 0, "end": 5,
        "volume": 1,
        "fadeIn": 0.5, "fadeOut": 0.5
      }
    }
  ]
}
```

- 保存的 JSON 完全自包含（媒体以 base64 内嵌），可直接作为项目文件分发与再次导入。
- 缓动曲线可选：`linear / easeInQuad / easeOutQuad / easeInOutQuad / easeInCubic / easeOutCubic / easeInOutCubic / easeOutQuart / easeInOutQuart / easeOutBack / easeOutBounce / easeOutElastic`。

## 核心实现要点

- **单一渲染路径**：编辑态与播放态共用 `applyFrame(t)` —— 每一帧对每个元素计算 `elementStateAt(t)`（可见性 → 位移 → 缩放 → 旋转 → 透明度 → 分段淡入淡出），再写入 DOM 样式，保证「所见即所得」。
- **播放引擎**：`requestAnimationFrame` 累计时间驱动播放头；`requestAnimationFrame` 时间戳与 `performance.now()` 锚点换算，支持随时暂停 / 跳转后续播。
- **媒体同步**：音频/视频按播放窗口（start~end）自动播放、暂停、定位（漂移 >0.28s 时纠偏），音量按淡入/淡出包络逐帧计算。
- **时间轴交互**：显隐段/动画条支持拖动移动、拖动边缘改长度；刻度尺拖动 = scrub 跳转。
