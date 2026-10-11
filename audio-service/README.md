# Local audio intelligence

The visualizer combines live browser audio analysis with the original `facebook/pe-av-large` audio encoder. Frequency, transients and loudness update immediately; this service supplies a slower content and expression estimate. It never downloads a radio stream, uses a microphone or stores incoming PCM.

## Prepare

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from the project root:

```powershell
npm run audio:setup
```

The setup command installs the locked Python environment with `uv sync --project audio-service`, then invokes `prepare.py`. The first preparation downloads the official 8.94 GB checkpoint at a pinned revision. It encodes the fixed prompt ensemble once, then extracts the complete 1,134,277,568-parameter audio encoder and projection, about 4.54 GB in float32. Both the download cache and the extracted files are excluded from Git. Reserve approximately 15 GB of disk space and at least 12 GB of available RAM during preparation.

The serving process retains only the large audio branch and seven cached text prototypes. It does not retain the visual encoder, multimodal fusion model or text encoder. `prepare.py` checks the prompt file hash; editing prompts requires preparation again. It never substitutes a smaller model.

## Serve

The project gateway starts the prepared service automatically. For standalone development:

```powershell
audio-service/.venv/Scripts/python.exe audio-service/server.py --port 8765 --threads 6
```

Linux/macOS use `audio-service/.venv/bin/python`. The service listens only on `127.0.0.1`. `AUDIO_MODEL_PORT` and `AUDIO_MODEL_THREADS` are supported; CPU workers are limited to eight threads. One analysis runs at a time, while `/status` stays available through a separate HTTP thread.

`GET /status` returns `state`, `name`, `busy`, `sampleRate`, `maxSeconds`, `precision`, `threads` and optional error/timing fields.

`POST /analyze` accepts `application/octet-stream` with `X-Sample-Rate: 48000`. The body is 0.5–6 seconds of mono normalized Float32 little-endian PCM, maximum 1,152,000 bytes. A WAV header or compressed MP3 data is not accepted.

The response includes `kind` (`music`, `speech`, `ambient`, `unknown`), `character` (`intense`, `soft`, `neutral`), separate `kindConfidence` and `characterConfidence`, `confidence`, relative prompt `scores`, `model` and `elapsedMs`. `confidence` is the content score. These values describe similarity within a fixed prompt ensemble, not calibrated emotion probabilities. Uncertain expression returns `neutral`; noise and silence do not invent a musical expression.

## Reproduce checks

```powershell
uv sync --project audio-service --python 3.12 --locked
audio-service/.venv/Scripts/python.exe -m pytest -q audio-service/tests
audio-service/.venv/Scripts/python.exe audio-service/evaluate.py --repeats 2
```

Run the service before evaluation. `evaluate.py` downloads four real public recordings with source and attribution metadata, compares speech/rain/piano/metal, and repeats metal at one fifth amplitude. It records actual model outputs, latency, concurrent status response time and source hashes in `validation-results.json`. These illustrative clips are not a scientific emotion benchmark or training data. Downloaded recordings remain local and are excluded from Git; the ESC-50 sample is used solely for evaluation under its dataset license.

The model and weights are [Apache 2.0](https://huggingface.co/facebook/pe-av-large). The model selection and limitations are documented in [the evaluation report](../docs/audio-model-report.md).
