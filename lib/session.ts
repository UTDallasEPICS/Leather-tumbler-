// Bearer credentials live in memory and are bound to the issuing API origin.
let session: { token: string; base: string } | null = null
export function setAccessToken(token: string, base: string) { session = { token, base } }
export function getAccessToken(base: string) { return session?.base === base ? session.token : null }
export function clearAccessToken() { session = null }
