"""Send demo blendshape frames to the web UI via WebSocket.

This helper starts a lightweight WebSocket server (default ws://127.0.0.1:8765/blendshape)
and pushes animated blendshape values so you can verify the Three.js viewer reacts as
expected.

Usage:

    python blendshape_stream_publisher.py \
        --host 127.0.0.1 --port 8765 --path /blendshape --fps 30

Then, in the web page, set the Blendshape WebSocket URL to
``ws://127.0.0.1:8765/blendshape`` and click “Connect Stream”.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import signal
import time
from typing import Dict

try:
    import websockets
except ImportError as exc:  # pragma: no cover - dependency error path
    raise SystemExit("Please install the 'websockets' package (pip install websockets)") from exc


def make_frame(timestamp: float) -> Dict[str, float]:
    """Generate a deterministic set of blendshape values based on time."""

    jaw = 0.5 + 0.5 * math.sin(timestamp * 2.0)
    smile = 0.5 + 0.5 * math.sin(timestamp * 1.5 + math.pi / 3)
    eye_blink_left = 0.5 + 0.5 * math.sin(timestamp * 1.2 + math.pi / 2)
    eye_blink_right = 0.5 + 0.5 * math.sin(timestamp * 1.1 + math.pi / 1.7)
    brow = 0.5 + 0.5 * math.sin(timestamp * 0.8)

    return {
        "JawOpen": round(max(0.0, min(1.0, jaw)), 3),
        "SmileLeft": round(max(0.0, min(1.0, smile)), 3),
        "SmileRight": round(max(0.0, min(1.0, 1 - smile)), 3),
        "EyeBlinkLeft": round(max(0.0, min(1.0, eye_blink_left)), 3),
        "EyeBlinkRight": round(max(0.0, min(1.0, eye_blink_right)), 3),
        "BrowInnerUp": round(max(0.0, min(1.0, brow)), 3),
    }


async def stream_blendshapes(websocket: websockets.WebSocketServerProtocol, fps: float) -> None:
    interval = 1.0 / fps
    start = time.perf_counter()
    frame_idx = 0

    await websocket.send(json.dumps({"info": "blendshape stream started", "fps": fps}))

    while True:
        timestamp = time.perf_counter() - start
        frame = make_frame(timestamp)
        frame["frame"] = frame_idx
        await websocket.send(json.dumps(frame))
        frame_idx += 1
        await asyncio.sleep(interval)


async def handler(
    websocket: websockets.WebSocketServerProtocol,
    path: str,
    fps: float,
    expected_path: str,
) -> None:
    if expected_path and path != expected_path:
        await websocket.close(code=1008, reason='invalid path')
        print(f"client {websocket.remote_address} attempted path {path}, expected {expected_path}")
        return
    client = websocket.remote_address
    print(f"client connected from {client}")
    try:
        await stream_blendshapes(websocket, fps)
    except asyncio.CancelledError:  # pragma: no cover
        raise
    except Exception as exc:  # pragma: no cover - log and continue
        print(f"stream error for {client}: {exc}")
    finally:
        print(f"client disconnected {client}")


async def main_async(args: argparse.Namespace) -> None:
    async with websockets.serve(
        lambda ws, p: handler(ws, p, args.fps, args.path),
        host=args.host,
        port=args.port,
        path=args.path,
        ping_interval=30,
        ping_timeout=30,
    ) as server:
        print(f"Serving blendshape stream on ws://{args.host}:{args.port}{args.path}")
        # websockets.serve does not filter path; we enforce inside handler.

        stop = asyncio.Future()

        def _on_signal(_sig: int) -> None:
            if not stop.done():
                stop.set_result(None)

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _on_signal, sig)
            except NotImplementedError:  # pragma: no cover (Windows)
                pass

        await stop
        print("Shutting down blendshape server...")
        server.close()
        await server.wait_closed()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve animated blendshape frames over WebSocket")
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind (default: 127.0.0.1)')
    parser.add_argument('--port', type=int, default=8765, help='Port to bind (default: 8765)')
    parser.add_argument('--path', default='/blendshape', help='URL path (informational)')
    parser.add_argument('--fps', type=float, default=30.0, help='Frames per second to send')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:  # pragma: no cover
        print("Interrupted by user")


if __name__ == '__main__':
    main()
