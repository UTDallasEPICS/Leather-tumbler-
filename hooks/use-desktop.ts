import * as React from 'react'

// From this width up the app uses the desktop layout (side menu, wide dashboard); below it, the phone column.
const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

export function useIsDesktop() {
  // false on the static render, then the real answer in the browser, updating live as the window resizes
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches, () => false)
}
