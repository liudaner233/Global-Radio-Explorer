# Global Radio Explorer · 全球电台探索者

在地球上寻找电台，听见不同地方的声音。

一个基于 React、TypeScript 和 Three.js 的全球电台播放器。支持交互式 3D 地球、近景地图、实时昼夜、分类发现和本地收藏；宽幅音浪由实际播放的音频驱动，还可选装本地音频模型，让音乐、人声与环境声呈现不同的视觉表现。

## 能做什么

### 地图探索

- **从全球到街道**：旋转、拖动和缩放地球，拉近后按视野加载 OpenStreetMap 瓦片，显示城市、道路与地名。地球贴图和国家边界随项目部署。
- **实时昼夜与当地时间**：日照位置随 UTC 时间和季节更新，晨昏边界柔和过渡；地图中心显示当地时间及昼夜状态，处理地理时区与夏令时。
- **扫描与分类信标**：开屏扫描逐步显现真实电台位置，信标持续呼吸；分类按钮、地图光点和中心选台框共享配色。地图独立加载全球节点，桌面最多 6000 条，移动端及低性能设备最多 2500 条。
- **中心选台与国家查询**：拖动地图，让电台进入中心圆环，点击名称即可收听；点击国家打开电台面板，每页 50 条，支持继续加载。悬停仅高亮国家。
- **粒子背景**：地球周围的粒子缓慢漂移并响应鼠标吸引，背景和扫描层不拦截页面点击。

### 发现与收听

- **搜索与分类**：按名称搜索，并组合 Pop、Rock、News、Electronic、Jazz、Classical 等分类。分类和列表有缓存，刷新失败保留已加载内容。
- **附近与情境发现**：Nearby 列出地图中心附近的已加载电台，无需定位权限；Discover 提供 World、Focus、Unwind、Energy，以及日出和夜晚筛选。
- **环球旅程**：生成最多六站的跨国家路线，在地球上显示连线。通过路线卡片、播放器或支持的系统媒体面板手动切站，不自动打断收听。
- **完整播放控制**：播放、暂停、音量、静音、收藏和站点外链；支持 Media Session，音量偏好跨刷新保留。
- **安静收听与睡眠计时**：一键收起侧栏；设置 15 / 30 / 60 分钟定时，最后 30 秒渐弱后暂停，切台保留计时。
- **收藏与收听护照**：在本地保存收藏、听过的国家、累计可听时长和最近电台。护照按实际可听播放进度记录，暂停、缓冲和静音不计时。

### 真实音浪

- 桌面最长 704px，手机整行展示。实际 PCM、频谱、能量和瞬态控制波形，暂停、静音或无声时回落为平线。
- 可选的 **Meta PE-AV Large** 在本地识别音乐、人声、环境声及柔和 / 激烈特征，平滑改变渐变配色和运动阻尼。使用官方预训练权重，无需自行训练基础模型。
- 模型推理与逐帧绘制分离；未安装模型时，可采样的电台仍显示真实频谱，不影响播放。

侧栏适配手机并可折叠。页面隐藏时暂停地图和背景动画，保留收听；尊重系统的减少动态效果设置。键盘 `/` 聚焦搜索，空格播放或暂停。

## 快速开始

需要 Node.js **22.12+（22.x）、24.x 或 26+**，建议使用 Node.js 24。基础功能无需 Python、模型权重或 API 密钥。

```bash
git clone https://github.com/liudaner233/Global-Radio-Explorer.git
cd Global-Radio-Explorer
npm ci
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，选择电台开始收听。

构建和本地预览：

```bash
npm run build
npm run preview
```

预览地址以终端输出为准。`npm run preview` 用于检查构建结果，不作为生产服务器。

## 可选：本地内容感知模型

安装 [uv](https://docs.astral.sh/uv/getting-started/installation/)，在项目根目录执行：

```bash
npm run audio:setup
npm run dev
```

首次准备会创建隔离的 Python 3.12 环境，下载固定版本的 [facebook/pe-av-large](https://huggingface.co/facebook/pe-av-large)，缓存文本描述向量，并提取完整 Large 音频分支。

| 项目     | 说明                                                           |
| -------- | -------------------------------------------------------------- |
| 首次下载 | 官方完整权重约 8.94GB                                          |
| 运行权重 | 音频分支约 4.54GB，约 11.34 亿参数                             |
| 准备资源 | 预留约 15GB 磁盘和至少 12GB 可用内存；建议 16GB 或更多系统内存 |
| 推理     | CPU 可运行，不需要 CUDA；默认使用 6 个线程，一次只分析一个样本 |
| 首次反馈 | 最多 6 秒采样，再进行后台推理；频谱即时响应，不等待识别        |
| 数据处理 | 默认在本机运行，不使用麦克风，也不保存收到的 PCM               |

模型文件和 Python 环境不随 Git 仓库分发。准备完成后，开发服务器和构建预览会自动启动本地服务；也可用 `npm run audio:serve` 单独启动。

在原开发机器（Ryzen 7 7840HS、28GB 内存）上，六秒片段的推理约需 3.5 秒，预热后的服务内存约 5.73GB。实际速度取决于硬件。识别结果是固定描述间的相似度判断，不是校准后的情绪概率，也不代表对所有节目都能准确分类。模型选型、许可和实测见 [音频模型报告](docs/audio-model-report.md) 与 [服务说明](audio-service/README.md)。

## 配置与部署

可将 [.env.example](.env.example) 复制为 `.env.local`。默认配置即可运行：

```dotenv
VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=OpenStreetMap contributors
VITE_MAP_ATTRIBUTION_URL=https://www.openstreetmap.org/copyright
AUDIO_MODEL_PORT=8765
AUDIO_MODEL_THREADS=6
AUDIO_MODEL_DISABLED=false
```

地图服务需兼容 `{z}/{x}/{y}`。高流量部署应配置符合流量规模的服务，并保留对应署名；默认 OpenStreetMap 瓦片不提供离线下载或批量预加载。

`npm run build` 生成 `dist/`，可部署到静态托管。静态站点保留地图、检索、收藏和原生收听能力；音频分析则受浏览器跨域策略和直播格式限制。

开发及预览服务器已挂载 [受控音频网关](server/audioGateway.mjs)。需要在生产环境分析无 CORS 响应头的直播时，应将该中间件挂载到同源 Node 服务，保留以下接口，并按需运行 Python 模型服务：

```text
GET  /api/audio/capabilities
GET  /api/audio/stream/:stationUuid
GET  /api/audio/model/status
POST /api/audio/analyze
```

网关按 Radio Browser 中的电台 UUID 解析播放源，校验重定向和公网地址，并剥离 ICY 元数据；不接受任意 URL 代理。Python 推理服务只监听 `127.0.0.1`，不要直接公开其端口。若将网关和模型部署到远程服务器，浏览器会把采样音频发送到该服务器进行分析。

### 播放与分析的边界

- 地图光点根据数据源最近的健康检查、有效地址和坐标筛选，不代表实时探测，也不保证当前网络下每个电台都能播放。
- 代理失败、HLS 或不支持的广播会回退原生直连，优先保留收听。跨域直连可能可以播放，但无法安全采样。
- 出现 `Audio analysis unavailable` 时，可点击音浪下的 **Retry** 重新连接；悬停提示文字可查看采样原因。它不一定表示模型离线。
- Nearby 和 Discover 使用已加载数据，并非所在地区的完整电台目录。收藏、护照和偏好仅保存在当前浏览器，不支持账户同步。
- 电台元数据和近景瓦片依赖外部网络；本地模型安装也需要访问官方权重源。

## 开发与检查

| 命令                         | 用途                                             |
| ---------------------------- | ------------------------------------------------ |
| `npm run dev`                | 开发服务器，默认端口 3000                        |
| `npm run build`              | TypeScript 检查与生产构建                        |
| `npm run lint`               | TypeScript、ESLint 与 React Hooks 检查           |
| `npm run format:check`       | 检查 Prettier 格式                               |
| `npm run test:run`           | 运行前端测试                                     |
| `npm run test:audio-gateway` | 运行网关与本地服务生命周期测试                   |
| `npm run test:audio-model`   | 运行 Python 模型协议测试，需先准备 Python 环境   |
| `npm run audio:setup`        | 准备可选模型环境与权重                           |
| `npm run audio:serve`        | 单独启动本地模型服务                             |
| `npm run create-shortcut`    | Windows 桌面快捷方式，可启动本地站点并打开浏览器 |

技术栈：React 19、TypeScript、Vite 7、Tailwind CSS 4、react-globe.gl / Three.js、Canvas / Web Audio API、Motion、Lucide。可选服务使用 Python、PyTorch 和 Transformers；模型不进入前端包。

```text
src/
  components/       地球、侧栏、国家面板、播放器与音浪
  hooks/            电台目录、地图控制、音频生命周期与收听功能
  lib/              API、地理计算、分类配色、音频分析与本地存储
  workers/          后台模型请求
  worklets/         真实 PCM 采样
server/             同源音频网关
audio-service/      可选 PE-AV 推理、准备与评测
scripts/            服务启动、生命周期管理与 Windows 工具
public/maps/        本地地球贴图及国家边界
docs/               功能设计与模型验证报告
```

## 数据与资源

- [Radio Browser](https://www.radio-browser.info/)：电台目录和元数据。
- [OpenStreetMap](https://www.openstreetmap.org/copyright)：近景地图；使用时遵循其 [瓦片政策](https://operations.osmfoundation.org/policies/tiles/)。
- Natural Earth 国家边界与 three-globe 示例贴图：来源和许可见 [地图资源说明](public/maps/README.md)。
- [Meta PE-AV Large](https://huggingface.co/facebook/pe-av-large)：可选预训练模型，Apache 2.0。

昼夜计算采用 [NOAA 太阳位置近似公式](https://gml.noaa.gov/grad/solcalc/solareqns.PDF)，用于地图视觉展示，不用于精确日出日落预报。电台节目、第三方数据与资源的权利属于各自提供者。
