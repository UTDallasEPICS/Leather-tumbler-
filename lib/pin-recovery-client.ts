"use client"

import { getWebSocketUrl } from "@/lib/settings"

type RecoveryResponse = {
  success: boolean
  message?: string
  [key: string]: unknown
}

export async function sendRecoveryRequest(
  type: string,
  payload: Record<string, unknown>,
  timeoutMs = 10000
): Promise<RecoveryResponse> {
  const wsUrl = getWebSocketUrl()
  const requestId = crypto.randomUUID()

  return await new Promise<RecoveryResponse>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("Request timed out."))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timeout)
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ type, requestId, ...payload }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data?.requestId !== requestId) return
        cleanup()
        ws.close()
        resolve(data as RecoveryResponse)
      } catch {
        // Ignore non-JSON messages.
      }
    }

    ws.onerror = () => {
      cleanup()
      reject(new Error("Unable to reach backend server."))
    }

    ws.onclose = () => {
      // If server closes before response, allow timeout to report.
    }
  })
}
