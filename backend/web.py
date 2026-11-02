"""Serve the exported Next.js site from the API's own origin.

Used when the Pi is reached through a tunnel (ngrok): the tunnel exposes one
HTTPS address, so the pages, `/api/*` and `/ws` must all come from this server.
"""

import stat

from starlette.staticfiles import StaticFiles


class ExportedSite(StaticFiles):
    """`next build` output: `/run` is `run.html`; unknown paths get `404.html`."""

    def __init__(self, directory: str):
        super().__init__(directory=directory, html=True)

    async def get_response(self, path, scope):
        last = path.rstrip("/").rsplit("/", 1)[-1]
        if last not in ("", ".") and "." not in last:
            # lookup_path keeps the result inside `directory`.
            full_path, stat_result = self.lookup_path(path.rstrip("/") + ".html")
            if stat_result and stat.S_ISREG(stat_result.st_mode):
                return self.file_response(full_path, stat_result, scope)
        return await super().get_response(path, scope)
