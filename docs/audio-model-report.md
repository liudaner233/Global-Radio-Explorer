# Audio visualizer model selection and verification

Research date: 2026-10-03. Target machine: AMD Ryzen 7 7840HS, Radeon 780M integrated graphics, 28 GB RAM, Windows. No NVIDIA CUDA device is available.

## Chosen implementation

The implementation uses the original [Meta Perception Encoder Audio-Visual large](https://huggingface.co/facebook/pe-av-large) (`facebook/pe-av-large`, revision `0d24878d4107d64bef49e53602fc34ce6f94f6d8`) in float32. It retains the entire **1,134,277,568-parameter audio encoder and original audio projection**, rather than replacing it with the small variant. The official complete checkpoint is **8,938,944,864 bytes**; the audio weights alone contain about 4.54 GB of tensor data. The original text encoder produces normalized embeddings for 23 fixed descriptions once at setup, averaged into seven class prototypes. Audio embeddings are compared with these prototypes using cosine similarity.

The model takes mono 48 kHz audio. Each request contains at most six seconds. Normalized embeddings and prompt ensembles support music/speech/ambient/noise and intense/soft/neutral descriptions without transcription or fabricated training. The softmax scores only express relative similarity among those descriptions; they do not establish calibrated human emotion probabilities. Content and expression confidence are reported separately. Weak expression evidence keeps the visualizer neutral.

The browser's actual frequency spectrum, signal energy and transients drive every animation frame. Model inference only changes the slower visual character and color. These separate timescales keep the visual response immediate and prevent CPU model inference from blocking playback or globe rendering. The local server limits PyTorch to six CPU threads by default, accepts one analysis at a time and serves status requests on independent threads. No microphone input or permanent PCM storage is used.

## Contemporary alternatives investigated

| Candidate                  | Actual downloadable checkpoint                                                                                                                                       | License and input                                 | Suitability on this machine                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PE-AV large**            | Official float32 checkpoint 8.94 GB; full large audio branch 1.134 billion parameters                                                                                | Apache 2.0; 48 kHz mono                           | Modern contrastive audio representation with a feasible CPU encoder. Selected and implemented.                                                                              |
| **Audio Flamingo Next**    | [nvidia/audio-flamingo-next-hf](https://huggingface.co/nvidia/audio-flamingo-next-hf), 8.267 billion parameters, about 16.53 GB BF16                                 | NVIDIA OneWay noncommercial; 16 kHz               | Strong instruction following and reasoning. Large language generation, memory footprint and CPU latency are poorly matched to repeated background analysis.                 |
| **Music Flamingo 2601**    | [nvidia/music-flamingo-2601-hf](https://huggingface.co/nvidia/music-flamingo-2601-hf), about 16.53 GB BF16                                                           | NVIDIA OneWay noncommercial; 16 kHz               | Detailed music descriptions and reasoning. Requires substantially heavier inference than a contrastive encoder.                                                             |
| **MOSS-Music 8B Thinking** | [OpenMOSS-Team/MOSS-Music-8B-Thinking](https://huggingface.co/OpenMOSS-Team/MOSS-Music-8B-Thinking), about 9.05 billion total parameters and 18.11 GB BF16           | Apache 2.0                                        | A more recent and strong music understanding candidate; its autoregressive generation has a different cost and task profile. Not substituted into a CPU visualization loop. |
| **MOSS-Audio**             | [OpenMOSS/MOSS-Audio](https://github.com/OpenMOSS/MOSS-Audio); 4B-labelled model has about 5.22 billion total parameters / 10.45 GB BF16; 8B Thinking about 18.11 GB | Apache 2.0                                        | Unified speech, sound and music reasoning, with substantial CPU memory and generation cost.                                                                                 |
| **MuQ-MuLan large**        | [OpenMuQ/MuQ-MuLan-large](https://huggingface.co/OpenMuQ/MuQ-MuLan-large), downloadable weights about 2.65 GB                                                        | Code MIT; pretrained weights CC BY-NC 4.0; 24 kHz | Strong music/text contrastive option. Official released model uses Million Song Dataset and is not necessarily the full-data model from its reported best paper results.    |
| **HeartCLAP**              | Mentioned in [HeartMuLa's official project](https://github.com/HeartMuLa/heartlib), but no independently downloadable official HeartCLAP checkpoint was verified     | Availability not established                      | A paper description is insufficient to claim a working installation. Excluded until official weights and a supported inference path exist.                                  |

The [PE-AV paper](https://arxiv.org/html/2512.19687v1) reports strong zero-shot general-audio, music and emotion-related results. For example, its large model outperforms the CLAP baseline on the paper's GTZAN, NSynth, VGGSound and CREMA comparisons. Those benchmarks are relevant evidence for a modern audio representation, but **they do not establish that this project's intense/soft prompt ensemble is universally state of the art**.

[Audio Flamingo Next](https://arxiv.org/html/2604.10905v1), [NVIDIA Music Flamingo](https://github.com/NVIDIA/audio-intelligence), [MOSS-Audio](https://arxiv.org/html/2606.01802v1) and [MOSS-Music](https://github.com/OpenMOSS/MOSS-Music) target richer question answering, captions and reasoning. Their published benchmarks compare different tasks and cannot be combined into an absolute ranking for live radio waveform aesthetics. “Best” here means a deliberately strong current open encoder, preserving its large weights, that can actually be installed and repeatedly executed on the available CPU.

Older YAMNet/CLAP and a hand-written loudness classifier are not presented as the requested strongest model. No model was trained from a few demo clips and no random classifier output is advertised as AI analysis.

## Reproducible verification

The locked environment contains Python 3.12, PyTorch 2.9.1 CPU, Transformers 5.6.0, Hugging Face Hub 1.5.0, safetensors 0.7.0 and NumPy 2.3.5. Only the Transformers audio and ModernBERT text architectures are constructed; the unused visual stack does not require timm or a CUDA installation. Parameters load strictly from the official checkpoint. The RoPE buffers omitted from safetensors are restored using the official audio rotary module, without clearing already loaded parameters.

Run the instructions in [audio-service/README.md](../audio-service/README.md). The real recordings and reproduction script are separate from protocol unit tests:

- Kennedy speech from [Hugging Face's Transformers.js example assets](https://huggingface.co/datasets/Xenova/transformers.js-docs/tree/main).
- Rain from [ESC-50](https://github.com/karolpiczak/ESC-50), used only for local evaluation under CC BY-NC 3.0.
- Debussy _Clair de lune_, played by Laurens Goedhart, 2011; [recording source and CC BY 3.0 attribution](<https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg>). Six seconds are cropped from 12 seconds, downmixed and resampled.
- Thorvi's _The Ancient Traveller_ sample, 2009; [uploader's public-domain recording](https://commons.wikimedia.org/wiki/File:The_Ancient_Traveller_sample.ogg). Six seconds are cropped from six seconds, downmixed and resampled. A second trial reduces amplitude to 20% to distinguish semantic expression from simple loudness.

Protocol tests cover mono Float32 decoding, incorrect lengths/rates/nonfinite values, relative score normalization, uncertainty handling, concurrent status responses, the single-request limit and recovery after inference failures. Their mock inference is only an HTTP correctness test; semantic claims require the actual downloaded model and real recordings above.

## Measurements on the target machine

The original large model was actually downloaded, checksum-verified, installed and run in float32. The audio branch contains 1,134,277,568 parameters. Five real-recording conditions were each analyzed twice; the complete outputs and source checksums are in `audio-service/validation-results.json`.

| Recording                   | Actual content result | Actual expression result | Median inference time                      |
| --------------------------- | --------------------- | ------------------------ | ------------------------------------------ |
| Kennedy speech              | Speech                | Neutral                  | 3.92 s, including the first cold inference |
| ESC-50 rain                 | Ambient               | Neutral                  | 3.08 s for a five-second clip              |
| Debussy piano               | Music                 | Soft                     | 3.56 s                                     |
| Thorvi metal                | Music                 | Intense                  | 3.61 s                                     |
| Same metal at 20% amplitude | Music                 | Intense                  | 3.45 s                                     |

All ten outputs matched these illustrative content references. The quiet metal condition retained its intense semantic character; the classification was not merely a loudness threshold. Across all requests, median latency was 3.51 s, with a 3.05–4.33 s range. Concurrent status responses stayed below 13.33 ms. The working set of the warmed process was approximately 5.73 GB.

Native Edge subsequently played repeated copies of the real piano, metal and speech clips through the actual player. AudioWorklet captured 288,000 mono samples at 48 kHz per request, the Worker posted 1,152,000 bytes to the real gateway, and the loaded large model returned music/soft, music/intense and speech/neutral. The visible player showed the corresponding content labels and three different smoothly changing palettes. Capturing six seconds plus inference took approximately 10.6–10.9 seconds before the first semantic update, while the true spectrum responded immediately. Pausing settled to a flat baseline. No Worker or JavaScript page errors occurred.

Native Edge also played the registered Radio Paradise Main Mix 320k AAC station through the real gateway in both development and the compiled production preview. Playback began in approximately 3.94–3.95 seconds, the actual radio PCM reached PE-AV large, the 704 px visualizer responded, and no JavaScript page errors occurred. The first development sample was music/intense; a later production sample had weaker evidence and correctly retained the neutral palette instead of forcing a confident content label.

The original player, volume, sleep fade, station journey, listening passport and responsive layouts were checked in native Edge. Capability tests that disable captureStream exercise the safe MediaElementSource fallback in Edge; they are not a claim of testing actual Safari.

An additional recovery check reproduced the unavailable-analysis state using the actual live Radio Paradise stream: the first proxy request was deliberately failed with HTTP 502, native direct playback continued, and captureStream raised the browser's real SecurityError. Clicking the player's Retry control opened a fresh same-origin stream. Its captured audio tracks were deliberately delayed by 400 ms, then the real six-second PCM reached PE-AV large and returned music/neutral with a content score of 0.692. The visualizer resumed, the Retry control disappeared, and no JavaScript page errors occurred. Those two injected transport conditions tested recovery; the radio audio and model inference were real.

These are illustrative checks rather than a held-out accuracy benchmark. They do not establish universal emotion accuracy or an absolute best model across unrelated audio tasks.
