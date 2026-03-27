<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ee53f0e3-12e3-4613-8d7a-40e128e332ec

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## 可观测性 SLO 指标

| 指标名称 | 目标 (SLO) | 监测方式 |
| --- | --- | --- |
| 流连通性 | 99.9% 成功率 | 边缘节点对源站的探测 (Synthetic Probing) |
| 首包时间 (TTFB) | <100ms | 全球分布式拨测 (Global Synthetics) |
| 音频卡顿率 | <0.5% | 客户端埋点上报 (RUM) |

## 关键功能模块与实现手段

| 功能模块 | 实现手段 |
| --- | --- |
| 模拟调频底噪 | 使用 `AudioBufferSourceNode` 播放白噪音，其 `gain`（音量）随 `map.on('move')` 的速度动态变化。 |
| 实时元数据拉取 | 建立鼠标悬停侦听（`mousemove`），通过 `features[0].properties` 快速提取电台频率、流媒体地址。 |
| 绿色视觉一致性 | 所有点位采用发射光晕（Glow Effect）效果，强调能量感。 |

## 流媒体协议选型与优化策略

| 协议类型 | 适用场景 | 优化策略 |
| --- | --- | --- |
| SHOUTcast/Icecast | 传统电台主力（MP3/AAC 流） | 使用 Fetch API + ReadableStream 直接拉取二进制流，跳过传统 HLS 的切片等待。 |
| LL-HLS | Apple 生态 / 移动端 Safari | 启用 Partial Segments（200ms）和 Blocking Playlist Reload，消除 3 个切片的强制缓冲限制。 |
| MPEG-DASH | Android / Chrome / 大屏终端 | 采用 CMAF（Common Media Application Format）切片，实现一份文件同时供给 DASH 和 HLS，减少服务器 IO。 |
