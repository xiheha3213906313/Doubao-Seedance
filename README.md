# Doubao Seedance 本地视频生成面板

一个本地可运行的豆包 Seedance 视频生成面板，提供模型选择、首尾帧/参考图上传、参数配置、任务管理、导入导出与本地数据持久化能力，并通过本地代理安全调用火山方舟视频生成 API。

## 功能特性

- 文生视频、图生视频、首尾帧/首帧模式、参考图模式
- 模型切换与能力自适配（音频、时长模式、分辨率、参考图等）
- 任务记录、收藏与筛选
- 本地任务数据保存与图片素材管理
- 生成请求通过本地代理转发，避免浏览器跨域问题
- 支持任务数据导入/导出（7z）

## 技术栈

- 前端：原生 HTML/CSS/JS
- 开发服务：Vite
- 本地服务：Node.js（server.js）
- Dev 工具：Agentation（仅开发模式注入）

## 目录结构

- [index.html](file:///c:/Users/xiheha/Desktop/Doubao-Seedance/index.html) 主页面
- css/ 样式文件
- js/ 前端逻辑
- json/ 本地生成的请求配置文件
- server.js 本地服务与代理
- server/ 服务端工具与配置
- data/ 本地任务与素材数据
- scripts/ 开发与停止脚本
- 调用文档/ 官方 API 参考文档
- dist/ 构建输出

## 环境要求

- Node.js 18+（建议 20+）
- Windows 下可使用项目自带的 bin\node.exe

## 快速开始

### 方式一：直接运行（生产/静态）

1. 双击 [start.bat](file:///c:/Users/xiheha/Desktop/Doubao-Seedance/start.bat)
2. 浏览器自动打开本地地址
3. 点击“配置”，填写 API Key
4. 输入提示词或上传图片后点击生成

### 方式二：开发模式（Vite + 本地后端）

```bash
npm install
npm run dev
```

脚本会同时启动后端与 Vite，并自动打开浏览器。

### 停止服务

```bash
npm run stop
```

或运行 [stop.bat](file:///c:/Users/xiheha/Desktop/Doubao-Seedance/stop.bat)。

## 配置说明

### API Key

- 在“配置”面板输入 API Key
- Key 保存在浏览器 IndexedDB（本地存储，不写入仓库）

### 模型请求配置文件

- 本地服务会自动写入 [json/model-config.json](file:///c:/Users/xiheha/Desktop/Doubao-Seedance/json/model-config.json)
- 该文件来自当前界面参数与输入内容
- 调用后端时会使用该配置生成请求体

## 本地服务与接口

- 本地服务入口：[server.js](file:///c:/Users/xiheha/Desktop/Doubao-Seedance/server.js)
- 配置保存：POST /api/save-config
- 创建生成任务（代理）：POST /api/generate
- 查询任务状态（代理）：GET /api/generate/:id
- 任务列表：GET /api/tasks
- 任务详情：GET/POST /api/tasks/:id/manifest
- 任务素材保存：POST /api/tasks/:id/save-inputs
- 下载生成视频：POST /api/tasks/:id/videos/download
- 导出数据：GET /api/export/start + /api/export/status + /api/export/download
- 导入数据：POST /api/import

## 数据存储说明

- 任务数据：data/tasks/（每个任务一个目录，含 manifest.json 与视频文件）
- 图片素材：data/assets/images/
- 索引文件：
  - data/tasks/index.json
  - data/assets/index.json

## 构建与预览

```bash
npm run build
npm run preview
```

构建产物输出到 dist/。

## 常见问题

### 1. 提示 CORS 或网络错误

请确保本地后端已启动并通过 /api/generate 发起请求，避免浏览器跨域限制。

### 2. API Key 丢失

API Key 存在浏览器 IndexedDB，清理浏览器数据会导致 Key 丢失。

### 3. 无法导入/导出

导入导出依赖 bin/7za.exe，请确保该文件存在。

## 参考文档

- 相关 API 文档位于 [调用文档](file:///c:/Users/xiheha/Desktop/Doubao-Seedance/调用文档)
