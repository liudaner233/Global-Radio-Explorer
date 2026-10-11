import argparse
import concurrent.futures
import hashlib
import json
import math
import platform
import statistics
import time
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

BASE_DIR = Path(__file__).resolve().parent
SAMPLE_DIR = BASE_DIR / "validation-audio"
SAMPLE_RATE = 48000
SAMPLES = [
    {
        "id": "speech",
        "file": "jfk.wav",
        "url": "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav",
        "source": "https://huggingface.co/datasets/Xenova/transformers.js-docs/tree/main",
        "attribution": "John F. Kennedy speech, Hugging Face Transformers.js documentation example.",
        "offset": 0,
        "expectedKind": "speech",
    },
    {
        "id": "rain",
        "file": "rain.wav",
        "url": "https://raw.githubusercontent.com/karolpiczak/ESC-50/master/audio/1-17367-A-10.wav",
        "source": "https://github.com/karolpiczak/ESC-50",
        "attribution": "ESC-50, rain class 10, Karol J. Piczak; dataset CC BY-NC 3.0, evaluation only.",
        "offset": 0,
        "expectedKind": "ambient",
    },
    {
        "id": "gentle-piano",
        "file": "piano.ogg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg",
        "source": "https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg",
        "attribution": "Claude Debussy, Clair de lune; Laurens Goedhart piano, 2011; recording CC BY 3.0, composer public domain. Mono/resampled 6-second crop from 12 s.",
        "offset": 12,
        "expectedKind": "music",
        "expectedCharacter": "soft",
    },
    {
        "id": "metal",
        "file": "metal.ogg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/2/2c/The_Ancient_Traveller_sample.ogg",
        "source": "https://commons.wikimedia.org/wiki/File:The_Ancient_Traveller_sample.ogg",
        "attribution": "Thorvi, The Ancient Traveller sample, 2009; uploader released recording into public domain. Mono/resampled 6-second crop from 6 s.",
        "offset": 6,
        "expectedKind": "music",
        "expectedCharacter": "intense",
    },
]


def download_samples():
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    for sample in SAMPLES:
        destination = SAMPLE_DIR / sample["file"]
        if destination.is_file():
            continue
        print(f"Downloading evaluation recording: {sample['id']}", flush=True)
        request = urllib.request.Request(sample["url"], headers={"User-Agent": "RadioExplorerAudioEvaluation/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response:
            destination.write_bytes(response.read())


def load_clip(sample, gain=1):
    path = SAMPLE_DIR / sample["file"]
    with sf.SoundFile(path) as recording:
        rate = recording.samplerate
        recording.seek(round(sample["offset"] * rate))
        samples = recording.read(6 * rate, dtype="float32", always_2d=True).mean(axis=1)
    divisor = math.gcd(rate, SAMPLE_RATE)
    samples = resample_poly(samples, SAMPLE_RATE // divisor, rate // divisor).astype("<f4")
    samples = np.clip(samples * gain, -1, 1).astype("<f4")
    return samples, hashlib.sha256(path.read_bytes()).hexdigest()


def get_json(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.load(response)


def analyze(url, samples):
    request = urllib.request.Request(
        f"{url}/analyze",
        data=samples.tobytes(),
        headers={"Content-Type": "application/octet-stream", "X-Sample-Rate": str(SAMPLE_RATE)},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def evaluate(url, repeats):
    download_samples()
    status = get_json(f"{url}/status")
    if status["state"] != "ready":
        raise RuntimeError(f"Audio model is not ready: {status}")
    report = {
        "testedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "status": status,
        "results": [],
        "interpretation": "These are real recordings and illustrative checks, not a held-out emotion benchmark. Scores are relative prompt similarities.",
    }
    trials = [(sample, 1) for sample in SAMPLES] + [(SAMPLES[-1], 0.2)]
    for sample, gain in trials:
        samples, checksum = load_clip(sample, gain)
        responses = []
        status_latencies = []
        for _ in range(repeats):
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(analyze, url, samples)
                time.sleep(0.25)
                started = time.perf_counter()
                concurrent_status = get_json(f"{url}/status")
                status_latencies.append(round((time.perf_counter() - started) * 1000, 2))
                responses.append(future.result())
        result = {
            **sample,
            "gain": gain,
            "sourceSha256": checksum,
            "seconds": round(len(samples) / SAMPLE_RATE, 4),
            "rms": round(float(np.sqrt(np.mean(np.square(samples, dtype=np.float64)))), 6),
            "responses": responses,
            "medianElapsedMs": statistics.median(response["elapsedMs"] for response in responses),
            "maxConcurrentStatusMs": max(status_latencies),
            "kindMatchesReference": all(response["kind"] == sample["expectedKind"] for response in responses),
        }
        if "expectedCharacter" in sample:
            result["characterMatchesReference"] = all(response["character"] == sample["expectedCharacter"] for response in responses)
        report["results"].append(result)
        print(json.dumps({"id": sample["id"], "gain": gain, "result": responses[-1], "statusMs": status_latencies[-1]}, ensure_ascii=False), flush=True)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--output", type=Path, default=BASE_DIR / "validation-results.json")
    args = parser.parse_args()
    if args.download_only:
        download_samples()
    else:
        report = evaluate(args.url.rstrip("/"), max(1, args.repeats))
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Saved real model measurements to {args.output}", flush=True)
