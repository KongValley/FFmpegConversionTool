# 音视频转换工具

Windows 10/11 x64 桌面端音视频批量转换工具：Electron + Vue 3 + FFmpeg，NVIDIA 显卡时自动使用 NVENC 硬件编码，失败自动回退 CPU。

- 拖入文件或文件夹 → 选格式与质量 → 一键批量转换，实时显示进度、速度与剩余时间。
- FFmpeg 首次启动自动下载（BtbN win64-gpl 构建，含 NVENC），之后离线可用。

## 功能

- **批量队列**：一次拖入多个文件或整个文件夹（递归收集媒体文件），串行转换，可单独取消或全部取消。
- **预设格式**：MP4（H.264 / H.265 / AV1）、MKV（H.265）、WebM（VP9）、MP3、M4A、WAV、FLAC、GIF。
- **硬件加速**：NVENC 优先（H.264/H.265/AV1），启动时用黑帧实机验证驱动可用性；GPU 编码失败自动回退 CPU 并提示。高级面板可额外开启 `-hwaccel cuda` 硬件解码。
- **高级参数**：质量优先（CRF/CQ）或指定码率、分辨率（含自定义 W×H）、帧率、音频编码/码率/声道/采样率、追加任意 FFmpeg 参数。
- **失败重试**：失败任务一键重试，重新探测媒体信息并重新计算不冲突的输出路径。
- **桌面体验**：批量结束发系统通知（窗口失焦时）、任务栏显示总进度、窗口大小/位置与高级参数自动记忆。

## 系统要求

- Windows 10 / 11 x64
- 首次启动需要能访问 GitHub Releases（下载 FFmpeg，约 200 MB）；也可用环境变量指定本地副本离线安装
- GPU 加速需要 NVIDIA 显卡与较新驱动；无 NVIDIA 显卡时全部走 CPU，功能不受影响

## 快速开始

1. 从 GitHub Releases 下载 `media-converter-<版本>-win-x64.zip`（由 GitHub Actions 自动构建）。
2. 解压到独立文件夹，运行 `音视频转换工具.exe`（免安装，zip 根目录即程序文件）。
3. 首次启动会自动下载并校验 FFmpeg，看到顶栏显示 `FFmpeg <版本> · GPU：NVENC …` 即可使用。

程序数据位于 `%APPDATA%/media-converter`：`settings.json`（设置）与 `bin/ffmpeg/`（FFmpeg 缓存）。

## 使用

| 操作 | 说明 |
|---|---|
| 添加 | 拖入文件/文件夹，或点“添加文件”；添加后提示“已添加 N 项（，跳过 M 项）” |
| 格式 | 右侧“目标格式”分组为 视频 / 音频 / 动图 |
| 质量 | 高 / 中 / 低（音频预设不显示，改用音频码率） |
| 加速 | `自动（GPU 优先）` 或 `仅 CPU`；无硬件编码器的格式会禁用并说明 |
| 输出目录 | 默认同源目录，可改为指定目录（自动递归创建） |
| 开始转换 | 队列中排队任务依次执行；运行中可单独取消或“取消全部” |
| 完成后 | “打开所在文件夹”定位输出文件；“清空已完成”清理列表 |

输出文件名为 `<原名>_converted.<扩展名>`，已存在时依次尝试 `_converted_2`、`_converted_3`，**不覆盖**已有文件。

## 预设格式

| 预设 | 容器 | 视频编码（GPU / CPU） | 音频编码 |
|---|---|---|---|
| MP4 (H.264) | mp4 | `h264_nvenc` / `libx264` | aac |
| MP4 (H.265) | mp4 | `hevc_nvenc` / `libx265` | aac（写入 `hvc1` 标签） |
| MP4 (AV1) | mp4 | `av1_nvenc` / `libsvtav1` | aac |
| MKV (H.265) | mkv | `hevc_nvenc` / `libx265` | aac |
| WebM (VP9) | webm | 无硬件编码器，`libvpx-vp9` | libopus |
| MP3 / M4A / WAV / FLAC | mp3 / m4a / wav / flac | 仅音频（`-vn`） | libmp3lame / aac / pcm_s16le / flac |
| GIF | gif | palettegen + paletteuse（15 fps） | 无 |

质量档位对应编码参数：

| 编码器 | 高 | 中 | 低 |
|---|---|---|---|
| libx264 | slow / CRF 18 | medium / CRF 23 | faster / CRF 28 |
| libx265 | slow / CRF 20 | medium / CRF 24 | faster / CRF 28 |
| libsvtav1 | preset 4 / CRF 28 | preset 6 / CRF 32 | preset 8 / CRF 36 |
| libvpx-vp9 | CRF 24 | CRF 31 | CRF 36（`-b:v 0 -row-mt 1`） |
| h264_nvenc | p6 / CQ 19 | p5 / CQ 23 | p4 / CQ 28 |
| hevc_nvenc | p6 / CQ 21 | p5 / CQ 25 | p4 / CQ 29 |
| av1_nvenc | p6 / CQ 24 | p5 / CQ 28 | p4 / CQ 32 |

## 环境变量

| 变量 | 作用 |
|---|---|
| `FFMPEG_DIR` | 直接指定含 `ffmpeg.exe` / `ffprobe.exe` 的目录，跳过下载（目录缺文件会明确报错） |
| `FFMPEG_ZIP_PATH` | 指定本地 `ffmpeg-master-latest-win64-gpl.zip`，跳过网络下载 |

## 发布

日常使用本地打包即可，GitHub Release 由云端 Actions 生成：

| 场景 | 操作 | 结果 |
|---|---|---|
| 本地自用 | `npm run dist` | 只在 `release/` 生成 zip，不发布（`--publish never`） |
| 云端发布 | `git tag v0.1.0 && git push origin v0.1.0` | 触发 `.github/workflows/release.yml`：类型检查 + 单元测试 → 打包 → 发布 GitHub Release（附件即 zip） |
| 仅构建不发版 | Actions 页面手动 `Run workflow` | 上传构建物到该次运行的 Artifacts，不创建 Release |

- 打 tag 前请同步 `package.json` 的 `version`：CI 会校验两者一致，不一致直接失败。
- `npm run smoke`（真实 NVENC/NVDEC 转码）需要 NVIDIA 显卡，只在本地执行，CI 不跑。

## 开发

需要 Node.js ≥ 22.12。

```bash
npm install
npm run dev        # 开发模式启动（electron-vite + HMR）
npm run typecheck  # vue-tsc + tsc，零告警
npm test           # 单元测试：参数生成、进度解析、路径扫描
npm run smoke      # 真实转码冒烟：CPU/GPU 编码、硬件解码、mp3、gif（首次约 200MB 下载）
npm run dist       # 打包免安装 zip 到 release/
```

```
src/
  shared/     纯逻辑：类型、预设表、FFmpeg 参数生成、进度解析、设置默认值（无 Electron 依赖）
  main/       Electron 主进程：FFmpeg 安装与能力探测、ffprobe、串行任务队列、IPC
  preload/    contextBridge 暴露的类型化 API（contextIsolation + sandbox）
  renderer/   Vue 3 界面：队列列表、转换设置、高级参数
test/         node:test 单元测试
scripts/      smoke.ts（真实转码验证）、make-icon.mjs（生成应用图标）
```

设计要点：

- FFmpeg 参数由 `src/shared/args.ts` 的纯函数生成，主进程与冒烟脚本共用同一份逻辑，测试直接断言参数数组。
- 主进程用 `-progress pipe:1` 解析进度，200 ms 节流广播；取消走 `taskkill /PID <pid> /T /F` 并删除半成品。
- 硬件能力在启动时实测（`-encoders` + 黑帧编码），失败即按 CPU 处理，不阻断转换。

## 已知限制

- 只保留首条视频与首条音频流，字幕与数据流不写入输出（`-sn -dn`）。
- “额外 FFmpeg 参数”按空白切分，不支持引号与转义。
- GIF 固定 15 fps，仅“分辨率”中的宽度生效。
- 硬件解码开关仅对 NVDEC 支持的编码有效；遇到不支持的编码 FFmpeg 会回退软件解码，失败时请关闭该开关重新添加文件。
- 队列为串行执行（单个任务占满时不会并发编码）。

## 许可

本项目以 [MIT 许可证](LICENSE) 发布，Copyright (c) 2026 KongValley。

FFmpeg 不随本项目分发：程序首次启动时从 BtbN 官方构建下载 `ffmpeg-master-latest-win64-gpl.zip`（遵循 GPL），仅作为独立进程调用；若用 `FFMPEG_DIR` 指定自备构建，请遵守该构建的许可条款。
