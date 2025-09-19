"""Utility to subscribe to XiaoZhi speech streams over WebSocket.

This helper mimics the browser client's handshake so that you can
monitor TTS progress messages and download the accompanying audio
frames (Opus) directly from the XiaoZhi server.

Usage example:

    python speech_stream_subscriber.py \
        --ws-url ws://127.0.0.1:8000/xiaozhi/v1/ \
        --device-mac 12:34:56:78:9A:BC \
        --client-id web_test_client \
        --token your-token1 \
        --text "你好，小智" \
        --save-opus out.opus

Dependencies:
    pip install websockets
"""

from __future__ import annotations

import argparse
import asyncio
import json
import secrets
import string
from pathlib import Path
from typing import Optional

try:
    import websockets
except ImportError as exc:  # pragma: no cover - dependency error path
    raise SystemExit(
        "Missing dependency: install the 'websockets' package (pip install websockets)"
    ) from exc


def _random_client_id(prefix: str = "py_subscriber") -> str:
    suffix = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(6))
    return f"{prefix}_{suffix}"


def _build_ws_url(base_url: str, device_id: str, client_id: str) -> str:
    separator = '&' if '?' in base_url else '?'
    return f"{base_url}{separator}device-id={device_id}&client-id={client_id}"


async def _send_hello(websocket: websockets.WebSocketClientProtocol, args: argparse.Namespace) -> None:
    hello_payload = {
        "type": "hello",
        "device_id": args.device_mac,
        "device_name": args.device_name,
        "device_mac": args.device_mac,
        "token": args.token,
        "features": {"mcp": True},
    }
    await websocket.send(json.dumps(hello_payload))


async def _send_listen(websocket: websockets.WebSocketClientProtocol, text: str) -> None:
    message = {
        "type": "listen",
        "mode": "manual",
        "state": "detect",
        "text": text,
    }
    await websocket.send(json.dumps(message))


def _write_audio_chunk(file_handle, chunk: bytes, counter: int) -> None:
    file_handle.write(chunk)
    file_handle.flush()
    print(f"[audio] wrote {len(chunk)} bytes | total chunks: {counter}")


async def _process_messages(
    websocket: websockets.WebSocketClientProtocol,
    opus_path: Optional[Path],
) -> None:
    chunk_counter = 0
    opus_file = opus_path.open("wb") if opus_path else None
    try:
        async for payload in websocket:
            if isinstance(payload, bytes):
                chunk_counter += 1
                if opus_file:
                    _write_audio_chunk(opus_file, payload, chunk_counter)
                else:
                    print(f"[audio] received {len(payload)} bytes (chunk {chunk_counter})")
                continue

            try:
                message = json.loads(payload)
            except json.JSONDecodeError:
                print(f"[text ] {payload}")
                continue

            msg_type = message.get("type", "?")

            if msg_type == "hello":
                print(f"[hello] session id: {message.get('session_id', '<none>')}")
            elif msg_type == "tts":
                state = message.get("state")
                text_segment = message.get("text")
                print(f"[tts  ] state={state} text={text_segment!r}")
            elif msg_type == "audio":
                print(f"[audio] control message: {json.dumps(message, ensure_ascii=False)}")
            elif msg_type == "stt":
                print(f"[stt ] text={message.get('text')!r}")
            elif msg_type == "llm":
                print(f"[llm ] text={message.get('text')!r}")
            else:
                print(f"[info ] {json.dumps(message, ensure_ascii=False)}")
    finally:
        if opus_file:
            opus_file.close()


async def subscribe(args: argparse.Namespace) -> None:
    device_mac = args.device_mac or args.device_id or args.client_id
    if not device_mac:
        device_mac = "AA:BB:CC:" + ":".join(
            f"{secrets.randbelow(256):02X}" for _ in range(3)
        )

    args.device_mac = device_mac
    args.device_name = args.device_name or "Python Speech Subscriber"

    client_id = args.client_id or _random_client_id()
    args.client_id = client_id
    ws_url = _build_ws_url(args.ws_url, device_mac, client_id)

    print(f"Connecting to {ws_url}")

    async with websockets.connect(ws_url, ping_interval=20, ping_timeout=20) as websocket:
        await _send_hello(websocket, args)
        if args.text:
            await _send_listen(websocket, args.text)

        opus_path = Path(args.save_opus).expanduser() if args.save_opus else None
        if opus_path:
            opus_path.parent.mkdir(parents=True, exist_ok=True)
            print(f"Saving raw Opus frames to {opus_path}")

        await _process_messages(websocket, opus_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Subscribe to XiaoZhi speech stream")
    parser.add_argument("--ws-url", default="ws://127.0.0.1:8000/xiaozhi/v1/", help="WebSocket endpoint")
    parser.add_argument("--client-id", help="Client ID used in query parameters")
    parser.add_argument("--device-id", help="Deprecated alias (kept for compatibility)")
    parser.add_argument("--device-mac", help="Device MAC used for handshake and query")
    parser.add_argument("--device-name", help="Friendly device name reported in hello message")
    parser.add_argument("--token", default="", help="Auth token if server requires it")
    parser.add_argument("--text", help="Send a listen request with this text after handshake")
    parser.add_argument("--save-opus", help="File path to store the received Opus stream")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        asyncio.run(subscribe(args))
    except KeyboardInterrupt:
        print("Interrupted by user")


if __name__ == "__main__":
    main()
