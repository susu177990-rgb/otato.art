"use client";

import { type CSSProperties, useRef, useState } from "react";
import styles from "../canvas-page.module.css";

export type CanvasIconName =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "preset"
  | "group"
  | "ungroup"
  | "copy"
  | "paste"
  | "delete"
  | "generate"
  | "play"
  | "pause";

function formatAudioTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function CanvasAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  const seek = (value: string) => {
    const audio = audioRef.current;
    const nextTime = Number(value);
    if (!audio || !Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div
      className={styles.audioPlayer}
      data-canvas-no-zoom
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        className={styles.audioPlayButton}
        aria-label={playing ? "暂停音频" : "播放音频"}
        onClick={togglePlayback}
      >
        <CanvasIcon name={playing ? "pause" : "play"} />
      </button>
      <span className={styles.audioTime}>{formatAudioTime(currentTime)}</span>
      <input
        className={styles.audioProgress}
        type="range"
        min="0"
        max={duration || 0}
        step="0.01"
        value={Math.min(currentTime, duration || currentTime)}
        onChange={(e) => seek(e.currentTarget.value)}
        style={{ "--audio-progress": `${progress}%` } as CSSProperties}
        aria-label="音频播放进度"
      />
      <span className={styles.audioTime}>{formatAudioTime(duration)}</span>
    </div>
  );
}

export function CanvasIcon({ name }: { name: CanvasIconName }) {
  const common = { vectorEffect: "non-scaling-stroke" as const };
  return (
    <svg className={styles.canvasSvgIcon} viewBox="0 0 24 24" aria-hidden>
      {name === "text" ? (
        <>
          <path {...common} d="M5 6h14" />
          <path {...common} d="M8 6v12" />
          <path {...common} d="M16 6v12" />
          <path {...common} d="M7 18h10" />
        </>
      ) : name === "image" ? (
        <>
          <rect {...common} x="4" y="5" width="16" height="14" rx="3" />
          <path {...common} d="m7 16 4-4 3 3 2-2 3 3" />
          <circle {...common} cx="15.5" cy="9.5" r="1.5" />
        </>
      ) : name === "video" ? (
        <>
          <rect {...common} x="4" y="6" width="13" height="12" rx="3" />
          <path {...common} d="m17 10 4-2v8l-4-2" />
        </>
      ) : name === "audio" ? (
        <>
          <path {...common} d="M9 18V6l9-2v12" />
          <circle {...common} cx="7" cy="18" r="3" />
          <circle {...common} cx="16" cy="16" r="3" />
        </>
      ) : name === "preset" ? (
        <>
          <path {...common} d="M12 3l1.4 4.2L18 8.6l-4.1 2.2L12 15l-1.9-4.2L6 8.6l4.6-1.4L12 3z" />
          <path {...common} d="M5 15h5" />
          <path {...common} d="M14 18h5" />
          <path {...common} d="M6 20h9" />
        </>
      ) : name === "group" ? (
        <>
          <rect {...common} x="4" y="5" width="7" height="7" rx="2" />
          <rect {...common} x="13" y="5" width="7" height="7" rx="2" />
          <rect {...common} x="4" y="14" width="7" height="5" rx="2" />
          <rect {...common} x="13" y="14" width="7" height="5" rx="2" />
        </>
      ) : name === "ungroup" ? (
        <>
          <rect {...common} x="4" y="5" width="7" height="7" rx="2" />
          <rect {...common} x="13" y="12" width="7" height="7" rx="2" />
          <path {...common} d="M14 5h4v4" />
          <path {...common} d="M10 19H6v-4" />
        </>
      ) : name === "copy" ? (
        <>
          <rect {...common} x="8" y="8" width="11" height="11" rx="2" />
          <path {...common} d="M5 15V6a1 1 0 0 1 1-1h9" />
        </>
      ) : name === "paste" ? (
        <>
          <path {...common} d="M9 5h6l1 3H8l1-3z" />
          <rect {...common} x="5" y="7" width="14" height="13" rx="3" />
          <path {...common} d="M9 13h6" />
          <path {...common} d="M9 16h4" />
        </>
      ) : name === "delete" ? (
        <>
          <path {...common} d="M5 7h14" />
          <path {...common} d="M10 7V5h4v2" />
          <path {...common} d="M8 10v8" />
          <path {...common} d="M12 10v8" />
          <path {...common} d="M16 10v8" />
          <path {...common} d="M7 7l1 14h8l1-14" />
        </>
      ) : name === "generate" ? (
        <>
          <path {...common} d="M12 3l1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8L12 3z" />
          <path {...common} d="M5 17h5" />
          <path {...common} d="M14 19h5" />
        </>
      ) : name === "pause" ? (
        <>
          <path {...common} d="M9 7v10" />
          <path {...common} d="M15 7v10" />
        </>
      ) : (
        <path {...common} d="M9 7v10l8-5-8-5z" />
      )}
    </svg>
  );
}
