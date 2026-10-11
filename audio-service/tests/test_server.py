import concurrent.futures
import http.client
import io
import json
import threading
import time
from http.server import ThreadingHTTPServer

import numpy as np
import pytest

from model import MAX_BYTES, MODEL_ID, SAMPLE_RATE
from server import make_handler
from server import AudioServer


class TestClassifier:
    __test__ = False

    def __init__(self):
        self.state = "ready"
        self.lock = threading.Lock()
        self.started = threading.Event()
        self.release = threading.Event()
        self.delay = False
        self.fail = False

    def status(self):
        return {"state": self.state, "name": MODEL_ID, "busy": self.lock.locked()}

    def analyze(self, samples):
        self.started.set()
        if self.delay:
            self.release.wait(3)
        if self.fail:
            raise RuntimeError("test inference failure")
        return {"kind": "speech", "character": "neutral", "confidence": 0.8, "model": MODEL_ID, "scores": {}, "elapsedMs": 1}


@pytest.fixture
def service():
    classifier = TestClassifier()
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(classifier))
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    yield server.server_port, classifier
    classifier.release.set()
    server.shutdown()
    server.server_close()
    thread.join(1)


def request(port, method="POST", path="/analyze", body=None, headers=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    body = np.full(SAMPLE_RATE, 0.1, dtype="<f4").tobytes() if body is None and method == "POST" else body
    headers = headers or {"Content-Type": "application/octet-stream", "X-Sample-Rate": str(SAMPLE_RATE)}
    connection.request(method, path, body=body, headers=headers)
    response = connection.getresponse()
    result = response.status, json.loads(response.read())
    connection.close()
    return result


def test_status_remains_responsive_while_inference_is_running(service):
    port, classifier = service
    classifier.delay = True
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        analysis = pool.submit(request, port)
        assert classifier.started.wait(1)
        started = time.perf_counter()
        status, payload = request(port, method="GET", path="/status")
        assert time.perf_counter() - started < 0.5
        assert status == 200 and payload["busy"]
        assert request(port)[0] == 429
        classifier.release.set()
        assert analysis.result(timeout=1)[0] == 200


def test_service_does_not_analyze_until_model_is_ready(service):
    port, classifier = service
    classifier.state = "loading"
    assert request(port)[0] == 503
    assert not classifier.started.is_set()


def test_failed_inference_releases_the_single_request_slot(service):
    port, classifier = service
    classifier.fail = True
    assert request(port)[0] == 500
    assert not classifier.lock.locked()
    classifier.fail = False
    assert request(port)[0] == 200


@pytest.mark.parametrize("failed", [False, True], ids=["success", "failure"])
def test_inference_slot_is_released_before_writing_response(failed):
    classifier = TestClassifier()
    classifier.fail = failed
    handler = object.__new__(make_handler(classifier))
    body = np.full(SAMPLE_RATE, 0.1, dtype="<f4").tobytes()
    handler.path = "/analyze"
    handler.headers = {
        "Content-Type": "application/octet-stream",
        "Content-Length": str(len(body)),
        "X-Sample-Rate": str(SAMPLE_RATE),
    }
    handler.rfile = io.BytesIO(body)
    responses = []

    def send_json(status, payload):
        assert not classifier.lock.locked()
        responses.append((status, payload))

    handler.send_json = send_json
    handler.do_POST()

    assert len(responses) == 1
    assert responses[0][0] == (500 if failed else 200)


def test_only_one_audio_server_can_own_a_port():
    first = AudioServer(("127.0.0.1", 0), make_handler(TestClassifier()))
    try:
        with pytest.raises(OSError):
            AudioServer(("127.0.0.1", first.server_port), make_handler(TestClassifier()))
    finally:
        first.server_close()


@pytest.mark.parametrize("body,headers,expected", [
    (b"x", {"Content-Type": "audio/wav", "X-Sample-Rate": "48000"}, 415),
    (b"", {"Content-Type": "application/octet-stream", "X-Sample-Rate": "48000", "Content-Length": str(MAX_BYTES + 4)}, 413),
    (bytes(SAMPLE_RATE * 4), {"Content-Type": "application/octet-stream", "X-Sample-Rate": "44100"}, 400),
    (bytes(4), {"Content-Type": "application/octet-stream", "X-Sample-Rate": "48000"}, 400),
], ids=["wrong-content-type", "oversize", "wrong-sample-rate", "too-short"])
def test_http_rejects_invalid_pcm_before_inference(service, body, headers, expected):
    port, classifier = service
    assert request(port, body=body, headers=headers)[0] == expected
    assert not classifier.started.is_set()
