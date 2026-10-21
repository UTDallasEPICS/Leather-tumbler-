"""Authorize every outgoing frame against current DB status and revocation."""

from fastapi import WebSocket, HTTPException
from starlette.concurrency import run_in_threadpool


class Broadcaster:
    def __init__(self, auth):
        self.auth = auth
        self._clients: dict[WebSocket, str] = {}

    def add(self, ws, token):
        self._clients[ws] = token

    def remove(self, ws):
        self._clients.pop(ws, None)

    @property
    def client_count(self):
        return len(self._clients)

    async def send(self, ws, message):
        try:
            await run_in_threadpool(self.auth.authenticate, self._clients[ws])
        except HTTPException:
            self.remove(ws)
            await ws.close(code=1008)
            return
        await ws.send_json(message)

    async def broadcast(self, message):
        for ws in list(self._clients):
            try:
                await self.send(ws, message)
            except Exception:
                # Fail closed on DB or transport errors; never send unchecked data.
                self.remove(ws)
                try:
                    await ws.close(code=1011)
                except RuntimeError:
                    continue
