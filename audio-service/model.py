import hashlib
import json
import math
import threading
import time
from pathlib import Path

MODEL_ID = "facebook/pe-av-large"
EXPECTED_AUDIO_PARAMETERS = 1_134_277_568
EXPECTED_LABELS = ("kind:music", "kind:speech", "kind:ambient", "kind:unknown", "character:intense", "character:soft", "character:neutral")
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models" / "pe-av-large"
SAMPLE_RATE = 48000
MAX_SECONDS = 6
MAX_BYTES = SAMPLE_RATE * MAX_SECONDS * 4
TEMPERATURE = 0.045


def validate_pcm(body, sample_rate):
    import numpy as np

    if sample_rate != SAMPLE_RATE:
        raise ValueError(f"Audio must be mono {SAMPLE_RATE} Hz Float32 little-endian PCM.")
    if len(body) % 4 or not 4 * SAMPLE_RATE // 2 <= len(body) <= MAX_BYTES:
        raise ValueError("Audio must contain between 0.5 and 6 seconds of Float32 PCM.")
    samples = np.frombuffer(body, dtype="<f4")
    if not np.isfinite(samples).all() or np.max(np.abs(samples)) > 1.01:
        raise ValueError("Audio contains invalid or out-of-range PCM samples.")
    return samples


def classify_similarities(labels, similarities):
    groups = {}
    for label, similarity in zip(labels, similarities, strict=True):
        if not math.isfinite(float(similarity)):
            raise ValueError("Audio similarity contains a nonfinite value.")
        family, name = label.split(":", 1)
        groups.setdefault(family, {})[name] = float(similarity)
    scores = {}
    choices = {}
    confidence = {}
    for family in ["kind", "character"]:
        values = groups[family]
        highest = max(values.values())
        exponentials = {name: math.exp((value - highest) / TEMPERATURE) for name, value in values.items()}
        total = sum(exponentials.values())
        relative = {name: value / total for name, value in exponentials.items()}
        ranking = sorted(relative, key=relative.get, reverse=True)
        winner = ranking[0]
        choices[family] = winner
        confidence[family] = relative[winner]
        scores[family] = relative
        if family == "kind" and (relative[winner] < 0.42 or relative[winner] - relative[ranking[1]] < 0.06):
            choices[family] = "unknown"
        if family == "character" and (relative[winner] < 0.55 or relative[winner] - relative[ranking[1]] < 0.06):
            choices[family] = "neutral"
    if choices["kind"] == "unknown":
        choices["character"] = "neutral"
    return {
        "kind": choices["kind"],
        "character": choices["character"],
        "confidence": confidence["kind"],
        "kindConfidence": confidence["kind"],
        "characterConfidence": confidence["character"],
        "scores": scores,
    }


class AudioClassifier:
    def __init__(self, model_dir=MODEL_DIR, threads=6):
        self.model_dir = Path(model_dir)
        self.threads = max(1, min(8, threads))
        self.state = "loading"
        self.error = None
        self.lock = threading.Lock()
        self.encoder = None
        self.audio_head = None
        self.prototypes = None
        self.labels = None
        self.hop_length = 1920
        self.last_elapsed_ms = None

    def status(self):
        result = {
            "state": self.state,
            "name": MODEL_ID,
            "sampleRate": SAMPLE_RATE,
            "maxSeconds": MAX_SECONDS,
            "precision": "float32",
            "threads": self.threads,
            "busy": self.lock.locked(),
            "confidenceMeaning": "Relative prompt similarity, not a calibrated emotion probability.",
        }
        if self.error:
            result["error"] = self.error
        if self.last_elapsed_ms is not None:
            result["lastElapsedMs"] = self.last_elapsed_ms
        return result

    def load(self):
        try:
            import torch
            from safetensors.torch import load_file
            from transformers import PeAudioEncoderConfig
            from transformers.models.pe_audio.modeling_pe_audio import PeAudioContrastiveHead, PeAudioEncoder, PeAudioEncoderRotaryEmbedding

            torch.set_num_threads(self.threads)
            torch.set_num_interop_threads(1)
            manifest = json.loads((self.model_dir / "manifest.json").read_text(encoding="utf-8"))
            if manifest.get("model") != MODEL_ID or manifest.get("audioParameters") != EXPECTED_AUDIO_PARAMETERS:
                raise RuntimeError("The prepared weights are not the PE-AV large audio branch.")
            if manifest.get("labelsVersion") != 1 or tuple(manifest.get("labels", [])) != EXPECTED_LABELS:
                raise RuntimeError("The prepared labels do not match the supported classification schema.")
            prompts_sha256 = hashlib.sha256((BASE_DIR / "prompts.json").read_bytes()).hexdigest()
            if manifest.get("promptsSha256") != prompts_sha256:
                raise RuntimeError("The audio descriptions changed. Run npm run audio:setup to refresh the text prototypes.")
            config = json.loads((self.model_dir / "config.json").read_text(encoding="utf-8"))
            audio_config = PeAudioEncoderConfig.from_dict(config["audio_video_config"]["audio_config"])
            self.hop_length = audio_config.dac_config.hop_length
            with torch.device("meta"):
                encoder = PeAudioEncoder(audio_config)
                audio_head = PeAudioContrastiveHead(audio_config.hidden_size, config["text_config"]["hidden_size"])
            state = load_file(str(self.model_dir / manifest["audioWeights"]), device="cpu")
            encoder.load_state_dict({key.removeprefix("audio_encoder."): value for key, value in state.items() if key.startswith("audio_encoder.")}, strict=True, assign=True)
            audio_head.load_state_dict({key.removeprefix("audio_head."): value for key, value in state.items() if key.startswith("audio_head.")}, strict=True, assign=True)
            encoder.rotary_emb = PeAudioEncoderRotaryEmbedding(audio_config)
            if any(value.is_meta for value in list(encoder.parameters()) + list(encoder.buffers()) + list(audio_head.parameters())):
                raise RuntimeError("Audio model loading left unresolved meta tensors.")
            encoder.eval()
            audio_head.eval()
            self.encoder = encoder
            self.audio_head = audio_head
            self.prototypes = load_file(str(self.model_dir / manifest["textEmbeddings"]), device="cpu")["prototypes"]
            self.labels = manifest["labels"]
            if self.prototypes.shape != (len(self.labels), config["text_config"]["hidden_size"]):
                raise RuntimeError("The text prototype dimensions do not match the audio projection.")
            if not torch.isfinite(self.prototypes).all():
                raise RuntimeError("The prepared text prototypes contain invalid values.")
            self.state = "ready"
            print(f"Loaded {MODEL_ID}, {manifest['audioParameters']:,} audio parameters, {self.threads} CPU threads.", flush=True)
        except Exception as error:
            self.error = str(error)
            self.state = "error"
            print(f"Audio model failed to load: {error}", flush=True)

    def analyze(self, samples):
        import numpy as np
        import torch

        started = time.perf_counter()
        rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
        if rms < 0.00005:
            result = {"kind": "unknown", "character": "neutral", "confidence": 0.0, "kindConfidence": 0.0, "characterConfidence": 0.0, "scores": {}, "reason": "silence"}
        else:
            remainder = len(samples) % self.hop_length
            if remainder:
                samples = np.pad(samples, (0, self.hop_length - remainder), mode="reflect")
            waveform = torch.from_numpy(samples.copy()).reshape(1, 1, -1)
            with torch.inference_mode():
                outputs = self.encoder(input_values=waveform, return_dict=True)
                embedded = torch.nn.functional.normalize(self.audio_head(outputs.pooler_output), dim=-1)
                similarities = (embedded @ self.prototypes.T)[0].tolist()
            result = classify_similarities(self.labels, similarities)
        self.last_elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        result["model"] = MODEL_ID
        result["elapsedMs"] = self.last_elapsed_ms
        return result
