"use client"

import { useEffect, useRef, useState } from "react"
import { useDashboard } from "@/lib/dashboard-context"

const BACKGROUND_IMAGES = [
  "/offline-bg/dava-bg-01.jpg",
  "/offline-bg/dava-bg-02.jpg",
  "/offline-bg/dava-bg-03.jpg",
  "/offline-bg/dava-bg-04.jpg",
  "/offline-bg/dava-bg-05.jpg",
  "/offline-bg/dava-bg-06.jpg",
  "/offline-bg/dava-bg-07.jpg",
  "/offline-bg/dava-bg-08.jpg",
]

const SLIDE_INTERVAL_MS = 7000
const FADE_DURATION_MS = 1200

export function OfflineBackground() {
  const { connectionStatus, isRunning } = useDashboard()
  const isOfflineLike = connectionStatus !== "connected" || !isRunning
  const [currentIndex, setCurrentIndex] = useState(0)
  const [previousIndex, setPreviousIndex] = useState<number | null>(null)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isOfflineLike) {
      setPreviousIndex(null)
      setImageLoadFailed(false)
      return
    }

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        setPreviousIndex(prev)
        return (prev + 1) % BACKGROUND_IMAGES.length
      })
    }, SLIDE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isOfflineLike])

  useEffect(() => {
    if (previousIndex === null) return
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
    fadeTimeoutRef.current = setTimeout(() => {
      setPreviousIndex(null)
    }, FADE_DURATION_MS)

    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
    }
  }, [previousIndex])

  if (!isOfflineLike) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Fallback style so offline mode is still visible even if images fail to load */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(0.58_0.23_27_/_0.22),transparent_42%),radial-gradient(circle_at_80%_30%,oklch(0.62_0.24_27_/_0.18),transparent_38%),linear-gradient(120deg,oklch(0.14_0_0)_0%,oklch(0.11_0_0)_100%)]" />
      {previousIndex !== null && (
        <img
          key={`previous-${previousIndex}`}
          src={BACKGROUND_IMAGES[previousIndex]}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-[0.18] transition-opacity duration-[1200ms]"
          onError={() => setImageLoadFailed(true)}
        />
      )}
      <img
        key={`current-${currentIndex}`}
        src={BACKGROUND_IMAGES[currentIndex]}
        alt=""
        className="absolute inset-0 size-full object-cover opacity-[0.26]"
        style={previousIndex !== null ? { animation: "offlineFadeIn 1200ms ease-in-out" } : undefined}
        onLoad={() => setImageLoadFailed(false)}
        onError={() => setImageLoadFailed(true)}
      />
      {!imageLoadFailed && <div className="absolute inset-0 bg-background/45" />}
      {imageLoadFailed && <div className="absolute inset-0 bg-background/35" />}
      <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-transparent to-background/60" />
    </div>
  )
}
