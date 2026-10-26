# Global Radio Explorer

[![CI](https://github.com/liudaner233/Global-Radio-Explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/liudaner233/Global-Radio-Explorer/actions/workflows/ci.yml)

Explore live radio worldwide on an interactive 3D globe, with day/night lighting, genre discovery, favorites, listening journeys, and responsive audio visualization.

Built with React, TypeScript, and Three.js. Browse the globe, move closer for street-level map detail, and find something new to listen to. An optional local content-analysis service adapts the visualizer to music, speech, and ambient sound.

## Features

### Explore the map

- **Globe to street level:** rotate, drag, and zoom the globe. OpenStreetMap tiles load for the current view as you move closer. Base globe textures and country boundaries ship with the application.
- **Day/night lighting and local time:** sunlight follows UTC time and the seasons, with a soft twilight transition. The center clock uses geographic time zones and daylight saving rules.
- **Station scanning and genre colors:** an opening scan reveals real station locations with gently pulsing beacons. Genre controls, map points, and the center picker share a consistent palette. The map loads up to 6,000 stations on desktop and 2,500 on mobile or lower-performance devices.
- **Center picker and country browsing:** move a station into the center ring and click its name to listen. Click a country to open its station list, with 50 results per page; hovering only highlights its boundary.
- **Interactive background:** slow-moving particles surround the globe and respond to the pointer without blocking map or player controls.

### Discover and listen

- **Search and genres:** combine station-name searches with Pop, Rock, News, Electronic, Jazz, Classical, and other genres. Cached results remain available if a refresh fails.
- **Nearby and Discover:** browse loaded stations near the map center without granting location access. Discover offers World, Focus, Unwind, and Energy selections, plus sunrise and nighttime filters.
- **Listening journeys:** build a route of up to six stops across countries, with connections drawn on the globe. Change stations manually through the route, player, or supported system media controls.
- **Playback controls:** play, pause, adjust volume, mute, save favorites, and open station websites. Media Session integration supports system media controls, and volume preferences persist across reloads.
- **Quiet listening and sleep timer:** collapse the sidebars or set a 15-, 30-, or 60-minute timer. Audio fades during the final 30 seconds, and changing stations preserves the deadline.
- **Favorites and listening passport:** keep favorite stations, visited countries, audible listening time, and recent stations in your browser. Paused, buffering, and muted playback do not add listening time.

### Audio visualization

- A waveform up to 704px wide on desktop, with a full-row layout on phones. Actual PCM, frequency data, energy, and transients drive the animation; pausing, muting, or silence settles it to a flat baseline.
- Optional **Meta PE-AV Large** analysis identifies music, speech, and ambient content, with gentle or energetic characteristics that adjust the gradient and motion damping.
- Background inference runs separately from drawing. Without the optional service, stations that permit audio capture still provide a live spectrum.

The layout adapts to mobile screens, sidebars can collapse, and animations respect reduced-motion preferences. Map and background animations pause while the page is hidden without stopping playback. Press `/` to focus search or Space to play and pause.

## Quick start

Use Node.js **22.12+ within the 22.x series, 24.x, or 26+**. Node.js 24 is recommended. Basic playback and exploration do not require Python, model weights, or API keys.

```bash
git clone https://github.com/liudaner233/Global-Radio-Explorer.git
cd Global-Radio-Explorer
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and select a station.

To build and inspect the production bundle locally:

```bash
npm run build
npm run preview
```

Use the preview URL printed in the terminal. `npm run preview` is for local checks, not production hosting.

## Optional local content analysis

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from the project root:

```bash
npm run audio:setup
npm run dev
```

Setup creates an isolated Python 3.12 environment, downloads a pinned release of [facebook/pe-av-large](https://huggingface.co/facebook/pe-av-large), caches text-description embeddings, and extracts the complete Large audio branch.

| Requirement           | Details                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Initial download      | Approximately 8.94GB for the official checkpoint                                                                    |
| Runtime weights       | Approximately 4.54GB for the audio branch                                                                           |
| Preparation resources | Reserve approximately 15GB of disk space and at least 12GB of available RAM; 16GB or more system RAM is recommended |
| Inference             | Runs on CPU without CUDA; defaults to six threads and one analysis request at a time                                |
| First content update  | Up to six seconds of sampling, followed by background inference; the spectrum responds immediately                  |
| Audio handling        | Runs locally by default, does not use a microphone, and does not save incoming PCM                                  |

Model files and the Python environment are excluded from Git. Once preparation is complete, the development and preview servers start the local service automatically. Use `npm run audio:serve` to start it separately.

Inference speed depends on hardware. The tested Ryzen 7 7840HS system took about 3.5 seconds per six-second sample, with a warmed service using approximately 5.73GB of memory. Results express similarity to a fixed set of descriptions, not calibrated emotion probabilities. See the [model evaluation report](docs/audio-model-report.md) and [service documentation](audio-service/README.md) for measurements and limitations.

## Configuration and deployment

Copy [.env.example](.env.example) to `.env.local` to customize the defaults:

```dotenv
VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=OpenStreetMap contributors
VITE_MAP_ATTRIBUTION_URL=https://www.openstreetmap.org/copyright
AUDIO_MODEL_PORT=8765
AUDIO_MODEL_THREADS=6
AUDIO_MODEL_DISABLED=false
```

Map tile providers must support `{z}/{x}/{y}` URLs. Keep the provider's attribution and choose a service suitable for your traffic. The default OpenStreetMap configuration does not support offline downloads or bulk preloading.

`npm run build` produces `dist/` for static hosting. Map exploration, search, favorites, and native playback work without the Node gateway; audio analysis remains subject to browser cross-origin policies and stream formats.

The development and preview servers include the [controlled audio gateway](server/audioGateway.mjs). To analyze streams without CORS headers in production, mount this middleware in a same-origin Node service and retain these routes. Run the Python service separately when content analysis is needed.

```text
GET  /api/audio/capabilities
GET  /api/audio/stream/:stationUuid
GET  /api/audio/model/status
POST /api/audio/analyze
```

The gateway resolves stream addresses from Radio Browser station UUIDs, validates redirects and public addresses, and removes ICY metadata. It does not accept arbitrary proxy URLs. The Python service listens only on `127.0.0.1`; do not expose its port directly. If you host the gateway and model remotely, sampled audio is sent to that server for analysis.

### Playback and analysis limits

- Map points use the catalog's latest health check, valid stream addresses, and coordinates. They are not live availability probes and cannot guarantee playback on every network.
- Failed proxy connections, HLS, and unsupported streams fall back to native direct playback where possible. A cross-origin stream may be playable while remaining unavailable for safe audio capture.
- If the player shows `Audio analysis unavailable`, click **Retry** below the waveform to reconnect. Hover over the message for the capture error. This status does not necessarily mean the model service is offline.
- Nearby and Discover use stations already loaded by the application, not a complete directory for the area. Favorites, passport data, and preferences stay in the current browser without account synchronization.
- Station metadata and detailed map tiles require access to external services. Optional model setup also requires access to the official weight source.

## Development

| Command                      | Purpose                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`                | Start the development server on port 3000                                 |
| `npm run build`              | Check TypeScript and build the production bundle                          |
| `npm run lint`               | Run TypeScript, ESLint, and React Hooks checks                            |
| `npm run format:check`       | Check Prettier formatting                                                 |
| `npm run test:run`           | Run frontend tests                                                        |
| `npm run test:audio-gateway` | Test the gateway and local-service lifecycle                              |
| `npm run test:audio-model`   | Run Python service protocol tests; requires the Python environment        |
| `npm run audio:setup`        | Prepare the optional environment and model weights                        |
| `npm run audio:serve`        | Start the local content-analysis service separately                       |
| `npm run create-shortcut`    | Create a Windows desktop shortcut that starts the local site and opens it |

GitHub Actions runs frontend, gateway, and build checks on Ubuntu and Windows, with a separate Python service test job. CI does not download model weights.

The frontend uses React 19, TypeScript, Vite 7, Tailwind CSS 4, react-globe.gl / Three.js, Canvas / Web Audio API, Motion, and Lucide. The optional service uses Python, PyTorch, and Transformers; model weights are not part of the frontend bundle.

```text
src/
  components/       Globe, sidebars, country panel, player, and visualizer
  hooks/            Station catalog, map controls, audio lifecycle, and listening features
  lib/              APIs, geography, genre colors, audio analysis, and local storage
  workers/          Background content-analysis requests
  worklets/         PCM capture
server/             Same-origin audio gateway
audio-service/      Optional PE-AV preparation, inference, and evaluation
scripts/            Service lifecycle and Windows utilities
public/maps/        Globe textures and country boundaries
docs/               Feature design and model verification
```

## Data and resources

- [Radio Browser](https://www.radio-browser.info/): station catalog and metadata.
- [OpenStreetMap](https://www.openstreetmap.org/copyright): detailed map tiles, subject to its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- Natural Earth country boundaries and three-globe example textures: sources and licenses are listed in the [map asset documentation](public/maps/README.md).
- [Meta PE-AV Large](https://huggingface.co/facebook/pe-av-large): optional pretrained model under Apache 2.0.

Day/night rendering uses the [NOAA solar position approximation](https://gml.noaa.gov/grad/solcalc/solareqns.PDF) for visualization, not precise sunrise or sunset forecasting. Radio programming and third-party data and resources remain subject to their respective owners' rights and terms.
