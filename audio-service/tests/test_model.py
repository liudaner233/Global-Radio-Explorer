import math

import numpy as np
import pytest

from model import MAX_BYTES, SAMPLE_RATE, classify_similarities, validate_pcm


LABELS = ["kind:music", "kind:speech", "kind:ambient", "kind:unknown", "character:intense", "character:soft", "character:neutral"]


def test_pcm_preserves_little_endian_float_samples():
    original = np.linspace(-1, 1, SAMPLE_RATE, dtype="<f4")
    decoded = validate_pcm(original.tobytes(), SAMPLE_RATE)
    np.testing.assert_array_equal(decoded, original)


@pytest.mark.parametrize("body,rate", [
    (bytes(MAX_BYTES + 4), SAMPLE_RATE),
    (bytes(4 * SAMPLE_RATE // 2 - 4), SAMPLE_RATE),
    (bytes(SAMPLE_RATE * 4 + 1), SAMPLE_RATE),
    (bytes(SAMPLE_RATE * 4), 44100),
    (np.full(SAMPLE_RATE, math.nan, dtype="<f4").tobytes(), SAMPLE_RATE),
    (np.full(SAMPLE_RATE, 1.1, dtype="<f4").tobytes(), SAMPLE_RATE),
], ids=["oversize", "short", "misaligned", "wrong-rate", "nan", "out-of-range"])
def test_pcm_rejects_unsafe_or_wrongly_encoded_payloads(body, rate):
    with pytest.raises(ValueError):
        validate_pcm(body, rate)


def test_similarity_groups_preserve_independent_content_and_character():
    result = classify_similarities(LABELS, [0.48, 0.16, 0.12, 0.01, 0.11, 0.42, 0.2])
    assert result["kind"] == "music"
    assert result["character"] == "soft"
    assert 0 <= result["confidence"] <= 1
    for scores in result["scores"].values():
        assert sum(scores.values()) == pytest.approx(1)


def test_ambiguous_similarity_does_not_fabricate_a_confident_label():
    result = classify_similarities(LABELS, [0.2] * len(LABELS))
    assert result["kind"] == "unknown"
    assert result["character"] == "neutral"


def test_noise_never_creates_an_intense_music_character():
    result = classify_similarities(LABELS, [0.08, 0.07, 0.12, 0.5, 0.42, 0.15, 0.1])
    assert result["kind"] == "unknown"
    assert result["character"] == "neutral"


def test_nonfinite_similarity_is_rejected_before_json_response():
    with pytest.raises(ValueError):
        classify_similarities(LABELS, [math.nan] * len(LABELS))
