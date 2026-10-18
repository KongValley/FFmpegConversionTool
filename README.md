# 音视频转换工具

Windows 10/11 x64 桌面端音视频批量转换工具：Electron + FFmpeg，NVIDIA GPU 时自动使用 NVENC 编码。

## 命令

```bash
npm install
npm run dev        # 开发模式启动
npm run typecheck  # 类型检查（vue-tsc + tsc）
npm test           # 参数生成 / 进度解析单元测试
npm run smoke      # 真实转码冒烟（含 NVENC 验证），首次约 200MB 下载
npm run dist       # 打包免安装 zip 到 release/
```

## FFmpeg 来源

首次启动自动从 BtbN 官方构建下载 `ffmpeg-master-latest-win64-gpl.zip`（约 200MB，含 NVENC），
解压到 `%APPDATA%/media-converter/bin/ffmpeg/`（开发与打包版共用同一缓存）。

环境变量覆盖（程序与 `npm run smoke` 都支持）：

- `FFMPEG_DIR`：直接指定含 `ffmpeg.exe` / `ffprobe.exe` 的目录，跳过下载。
- `FFMPEG_ZIP_PATH`：指定本地 zip 包，跳过网络下载。

## 功能

- 拖入文件或文件夹（文件夹递归收集媒体文件），或点击“添加文件”；添加后提示已添加/跳过数量。
- 批量队列：预设格式（MP4 H.264/H.265/AV1、MKV、WebM VP9、MP3、M4A、WAV、FLAC、GIF）+ 质量档位。
- GPU 加速：NVENC 自动优先，失败自动回退 CPU；高级面板可选 `-hwaccel cuda` 硬件解码。
- 失败任务可一键“重试”（重新计算不冲突的输出路径）。
- 批量结束发系统通知，运行中任务栏显示总进度；窗口大小/位置与高级参数自动记忆。

## 输出

默认输出到源文件同目录，文件名 `<原名>_converted.<扩展名>`；重名自动递增 `_2`、`_3`，
不覆盖已有文件；可在界面切换为指定输出目录。

## 分发

`npm run dist` 产出免安装压缩包 `release/media-converter-<版本>-win-x64.zip`：
解压到自己的独立文件夹后直接运行 `音视频转换工具.exe`（zip 根目录即为程序文件，没有外层目录）。
程序数据与 FFmpeg 缓存位于 `%APPDATA%/media-converter`，与开发模式共用。
