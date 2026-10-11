import argparse
import json
import os
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from model import AudioClassifier, MAX_BYTES, SAMPLE_RATE, validate_pcm


class AudioServer(ThreadingHTTPServer):
    allow_reuse_address = os.name != "nt"

    def server_bind(self):
        if os.name == "nt":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def make_handler(classifier):
    class AudioHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def send_json(self, status, payload):
            body = json.dumps(payload, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            if self.path == "/status":
                self.send_json(200, classifier.status())
            else:
                self.send_json(404, {"error": "Not found."})

        def do_POST(self):
            if self.path != "/analyze":
                self.close_connection = True
                self.send_json(404, {"error": "Not found."})
                return
            if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/octet-stream":
                self.close_connection = True
                self.send_json(415, {"error": "Expected application/octet-stream PCM."})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                rate = int(self.headers.get("X-Sample-Rate", "0"))
                if not 0 < length <= MAX_BYTES:
                    self.close_connection = True
                    self.send_json(413, {"error": "Audio exceeds the 6-second limit or is empty."})
                    return
                if rate != SAMPLE_RATE:
                    raise ValueError(f"Expected X-Sample-Rate: {SAMPLE_RATE}.")
                body = self.rfile.read(length)
                if len(body) != length:
                    raise ValueError("Incomplete PCM payload.")
                samples = validate_pcm(body, rate)
            except (ValueError, TimeoutError) as error:
                self.close_connection = True
                self.send_json(400, {"error": str(error)})
                return
            if classifier.state != "ready":
                self.send_json(503, {"error": "The audio model is not ready.", **classifier.status()})
                return
            if not classifier.lock.acquire(blocking=False):
                self.send_json(429, {"error": "One audio analysis is already running."})
                return
            try:
                payload = classifier.analyze(samples)
                status = 200
            except Exception as error:
                payload = {"error": f"Audio analysis failed: {error}"}
                status = 500
            finally:
                classifier.lock.release()
            self.send_json(status, payload)

        def log_message(self, format, *args):
            if args and args[0].startswith("POST"):
                super().log_message(format, *args)

    return AudioHandler


def serve(port=8765, threads=6):
    classifier = AudioClassifier(threads=threads)
    server = AudioServer(("127.0.0.1", port), make_handler(classifier))
    server.daemon_threads = True
    threading.Thread(target=classifier.load, daemon=True, name="audio-model-loading").start()
    print(f"Audio service: http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("AUDIO_MODEL_PORT", "8765")))
    parser.add_argument("--threads", type=int, default=int(os.environ.get("AUDIO_MODEL_THREADS", "6")))
    args = parser.parse_args()
    serve(args.port, args.threads)
