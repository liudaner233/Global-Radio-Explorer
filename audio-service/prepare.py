import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODEL_ID = "facebook/pe-av-large"
REVISION = "0d24878d4107d64bef49e53602fc34ce6f94f6d8"
CHECKPOINT_SHA256 = "7192bdcfc5fec52687b36c92db404a303b0d9bbbb85d26839e530b4f3d44a354"
MODEL_DIR = BASE_DIR / "models" / "pe-av-large"


def prepare(force=False, threads=6):
    prompts_bytes = (BASE_DIR / "prompts.json").read_bytes()
    prompts_sha256 = hashlib.sha256(prompts_bytes).hexdigest()
    manifest_path = MODEL_DIR / "manifest.json"
    if manifest_path.exists() and not force:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        files = [manifest.get("audioWeights", ""), manifest.get("textEmbeddings", "")]
        if manifest.get("revision") == REVISION and manifest.get("checkpointSha256") == CHECKPOINT_SHA256 and manifest.get("promptsSha256") == prompts_sha256 and all(
            name and (MODEL_DIR / name).is_file() for name in files
        ):
            print("PE-AV large is already prepared.", flush=True)
            return manifest

    os.environ.setdefault("HF_HOME", str(BASE_DIR / "models" / "hub"))
    from huggingface_hub import hf_hub_download

    files = {}
    for name in ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "model.safetensors"]:
        print(f"Downloading {MODEL_ID}/{name} at revision {REVISION}.", flush=True)
        files[name] = Path(hf_hub_download(MODEL_ID, name, revision=REVISION))

    print("Verifying the official checkpoint SHA-256.", flush=True)
    with files["model.safetensors"].open("rb") as checkpoint:
        checkpoint_sha256 = hashlib.file_digest(checkpoint, "sha256").hexdigest()
    if checkpoint_sha256 != CHECKPOINT_SHA256:
        raise RuntimeError("The downloaded checkpoint does not match the official pinned SHA-256.")

    import torch
    from safetensors import safe_open
    from safetensors.torch import save_file
    from transformers import AutoModel, ModernBertConfig, PreTrainedTokenizerFast
    from transformers.models.pe_audio.modeling_pe_audio import PeAudioContrastiveHead

    torch.set_num_threads(max(1, min(8, threads)))
    torch.set_num_interop_threads(1)
    config = json.loads(files["config.json"].read_text(encoding="utf-8"))
    text_config = ModernBertConfig.from_dict(config["text_config"])
    prompts = json.loads(prompts_bytes)
    labels = []
    phrases = []
    spans = []
    for family in ["kind", "character"]:
        for label, descriptions in prompts[family].items():
            labels.append(f"{family}:{label}")
            start = len(phrases)
            phrases.extend(descriptions)
            spans.append((start, len(phrases)))

    tokenizer_config = json.loads(files["tokenizer_config.json"].read_text(encoding="utf-8"))
    tokenizer_keys = {"cls_token", "sep_token", "pad_token", "mask_token", "unk_token", "bos_token", "eos_token", "model_max_length", "clean_up_tokenization_spaces", "model_input_names"}
    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(files["tokenizer.json"]), **{key: value for key, value in tokenizer_config.items() if key in tokenizer_keys})
    text_model = AutoModel.from_config(text_config)
    text_head = PeAudioContrastiveHead(text_config.hidden_size, text_config.hidden_size)

    with safe_open(files["model.safetensors"], framework="pt", device="cpu") as checkpoint:
        text_state = {
            key.removeprefix("text_model."): checkpoint.get_tensor(key)
            for key in checkpoint.keys()
            if key.startswith("text_model.")
        }
        head_state = {
            key.removeprefix("audio_model.text_audio_head."): checkpoint.get_tensor(key)
            for key in checkpoint.keys()
            if key.startswith("audio_model.text_audio_head.")
        }
    text_model.load_state_dict(text_state, strict=True, assign=True)
    text_head.load_state_dict(head_state, strict=True, assign=True)
    text_model.eval()
    text_head.eval()
    embeddings = []
    print(f"Encoding {len(phrases)} fixed descriptions with the original PE-AV text encoder.", flush=True)
    with torch.inference_mode():
        for start in range(0, len(phrases), 4):
            inputs = tokenizer(phrases[start : start + 4], padding=True, truncation=True, max_length=128, return_tensors="pt")
            outputs = text_model(**inputs, output_hidden_states=True, return_dict=True)
            projected = text_head(outputs.hidden_states[-1][:, 0])
            embeddings.append(torch.nn.functional.normalize(projected, dim=-1))
        phrase_embeddings = torch.cat(embeddings)
        prototypes = torch.stack([
            torch.nn.functional.normalize(phrase_embeddings[start:end].mean(dim=0), dim=-1)
            for start, end in spans
        ])
    del text_model, text_head, text_state, head_state

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    save_file({"prototypes": prototypes.contiguous()}, str(MODEL_DIR / "text-embeddings.safetensors"))
    print("Extracting the complete large audio encoder and its original projection head.", flush=True)
    with safe_open(files["model.safetensors"], framework="pt", device="cpu") as checkpoint:
        audio_state = {
            key.removeprefix("audio_model."): checkpoint.get_tensor(key)
            for key in checkpoint.keys()
            if key.startswith("audio_model.audio_encoder.") or key.startswith("audio_model.audio_head.")
        }
    save_file(audio_state, str(MODEL_DIR / "audio.safetensors"))
    (MODEL_DIR / "config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest = {
        "model": MODEL_ID,
        "revision": REVISION,
        "checkpointSha256": checkpoint_sha256,
        "labelsVersion": prompts["version"],
        "descriptionCount": len(phrases),
        "promptsSha256": prompts_sha256,
        "labels": labels,
        "sampleRate": 48000,
        "maxSeconds": 6,
        "audioParameters": sum(tensor.numel() for tensor in audio_state.values()),
        "precision": "float32",
        "audioWeights": "audio.safetensors",
        "textEmbeddings": "text-embeddings.safetensors",
        "license": "Apache-2.0",
        "source": f"https://huggingface.co/{MODEL_ID}/tree/{REVISION}",
        "confidenceMeaning": "Relative similarity among the fixed prompt ensemble; not a calibrated emotional probability.",
    }
    temporary_manifest = manifest_path.with_suffix(".json.tmp")
    temporary_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary_manifest.replace(manifest_path)
    print(f"Ready: {MODEL_DIR}, {manifest['audioParameters']:,} audio parameters.", flush=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--threads", type=int, default=6)
    args = parser.parse_args()
    try:
        prepare(force=args.force, threads=args.threads)
    except Exception as error:
        print(f"Model preparation failed: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1) from error
