# 2026-04-10 MiniMax Music Studio 初版

## 目的

为 OCT 增加一个独立的音乐生成工作台，让用户可以像使用 Suno 一样，直接填写风格描述与歌词，调用 MiniMax `music_generation` 生成歌曲并试听。

## 本次调整

### 1. 打开 MUSIC 标签页入口

- `src/components/TabBar.tsx`

将原先隐藏的 SOUND Beta 标签正式打开，并以 `MUSIC` 名称对外呈现。

### 2. 主进程新增 MiniMax 音乐生成 IPC

- `electron/main.ts`
- `electron/preload.ts`
- `src/vite-env.d.ts`

新增 `music-generate`：

- 从当前配置读取 `MINIMAX_API_KEY`
- 调用 `POST /v1/music_generation`
- 将返回的十六进制音频数据转成前端可直接播放/下载的 Base64

### 3. SOUND 页重构为音乐工作台

- `src/components/SoundTab.tsx`
- `src/styles/SoundTab.css`

首版能力：

- 输入曲目标题、音乐描述、歌词
- 切换纯音乐 / 自动生成歌词
- 选择 `music-2.6` / `music-2.5+` / `music-2.5`
- 生成后直接试听、下载
- 保留最近 8 个生成结果，方便回听比较

### 4. 创作区对齐 Suno 的 Simple / Advanced 心智

- `src/components/SoundTab.tsx`
- `src/styles/SoundTab.css`

后续迭代中，将原先“自定义内容 / 自动生成”的双面板结构，进一步调整为更接近 Suno 的两档模式：

- `Simple`
  - 只保留 `Song Description`
  - 提供 `+ Audio` / `+ Lyrics` / `Instrumental` 胶囊开关
  - 在底部展示 `Inspiration` 风格标签
- `Advanced`
  - 拆成 `Audio` / `Lyrics` / `Styles` / `More Options`
  - `Lyrics` 面板专门承载自定义歌词
  - `Styles` 面板承载风格描述与灵感标签
  - 保持与三套主题变量一致的卡片、胶囊按钮和状态样式

### 5. 接入歌词生成与人声预设

- `electron/main.ts`
- `electron/preload.ts`
- `src/vite-env.d.ts`
- `src/components/SoundTab.tsx`
- `src/styles/SoundTab.css`

补充 `POST /v1/lyrics_generation` 调用链路，用于：

- 根据主题和风格自动生成完整歌词
- 将返回的 `title` / `style_tags` / `lyrics` 回填到面板
- 在 `Advanced > Lyrics` 中继续手动修改

同时增加创作预设按钮：

- `男声`
- `女声`
- `对唱`
- `纯音乐`

这类控制目前主要通过 prompt 模板实现，因为官方公开的 `music_generation` 接口尚未提供单独的“男声 / 女声 / 时长”参数。

### 6. 最近生成历史持久化

- `electron/main.ts`
- `electron/preload.ts`
- `src/vite-env.d.ts`
- `src/components/SoundTab.tsx`

将音乐生成结果从“仅前端内存态”改成“主进程落盘保存”：

- 每次成功生成后，把音频文件保存到应用 `userData/music-studio/`
- 用 `history.json` 记录最近 8 首作品的元数据
- 面板挂载时自动回读历史，因此切换标签页或重启应用后仍可继续试听

同时在界面中明确提示：

- 官方文档中，只有 `output_format: url` 时下载链接有效期为 24 小时
- 当前 OCT 默认使用 `hex` 返回并落盘成本地文件，因此不依赖官方临时链接时效

## 结果

- OCT 现在有了一个独立的 MiniMax 音乐生成面板
- 交互形态更接近音乐创作工具，而不是传统设置页
- 创作流程已经对齐为“快速出歌”和“深入细调”两条路径
- 为后续增加“再生成一个版本”“歌词优化”“封面图”“工程导出”留出了清晰入口
