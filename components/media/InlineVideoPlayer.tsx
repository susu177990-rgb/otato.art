"use client";

import { useRef, useState } from "react";
import styles from "./inline-video-player.module.css";

type InlineVideoPlayerProps = {
  src: string;
  title?: string;
  suggestedFileName?: string;
  className?: string;
  videoClassName?: string;
  preload?: "none" | "metadata" | "auto";
};

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "video";
}

function guessVideoExtension(url: string): string {
  const cleanUrl = url.split("?")[0] ?? "";
  const match = cleanUrl.match(/\.([a-z0-9]{3,4})$/i);
  const ext = match?.[1]?.toLowerCase();
  if (ext === "webm" || ext === "mov" || ext === "m4v") return ext;
  return "mp4";
}

function buildDownloadName(src: string, suggestedFileName?: string): string {
  if (suggestedFileName?.trim()) return sanitizeFileName(suggestedFileName.trim());
  return `${sanitizeFileName("video")}.${guessVideoExtension(src)}`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function InlineVideoPlayer({
  src,
  title = "视频",
  suggestedFileName,
  className,
  videoClassName,
  preload = "metadata",
}: InlineVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      video.pause();
    }
  }

  function handleSeek(value: string) {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Number(value);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function toggleMuted() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }

  function handleVolume(value: string) {
    const video = videoRef.current;
    if (!video) return;
    const nextVolume = Math.min(1, Math.max(0, Number(value)));
    video.volume = nextVolume;
    video.muted = nextVolume === 0 ? true : false;
    setVolume(nextVolume);
    setIsMuted(video.muted);
  }

  async function handleDownload() {
    if (isDownloading) return;
    const filename = buildDownloadName(src, suggestedFileName);
    setIsDownloading(true);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      const anchor = document.createElement("a");
      anchor.href = src;
      anchor.download = filename;
      anchor.rel = "noopener";
      anchor.target = "_blank";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className={joinClassNames(styles.player, className)} data-playing={isPlaying ? "true" : "false"}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload={preload}
        className={joinClassNames(styles.video, videoClassName)}
        aria-label={title}
        onClick={() => {
          void togglePlay();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setVolume(event.currentTarget.volume);
          setIsMuted(event.currentTarget.muted);
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setIsMuted(event.currentTarget.muted);
        }}
      />
      <button
        type="button"
        className={[styles.cornerButton, styles.downloadButton].join(" ")}
        onClick={handleDownload}
        disabled={isDownloading}
        aria-label="下载视频"
      >
        {isDownloading ? "..." : <DownloadIcon />}
      </button>
      <div className={styles.controls}>
        <button type="button" className={styles.iconButton} onClick={() => void togglePlay()} aria-label={isPlaying ? "暂停" : "播放"}>
          {isPlaying ? "Ⅱ" : "▶"}
        </button>
        <input
          className={styles.progress}
          type="range"
          min="0"
          max={duration || 0}
          step="0.01"
          value={Math.min(currentTime, duration || currentTime)}
          aria-label="播放进度"
          onChange={(event) => handleSeek(event.currentTarget.value)}
        />
        <span className={styles.time}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className={styles.volumeControl}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={toggleMuted}
            aria-label={isMuted ? "打开声音" : "静音"}
          >
            {isMuted || volume === 0 ? <MutedIcon /> : <VolumeIcon />}
          </button>
          <input
            className={styles.volumeRange}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            aria-label="音量"
            onChange={(event) => handleVolume(event.currentTarget.value)}
          />
        </div>
      </div>
    </div>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={styles.controlIcon}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a8 8 0 0 1 0 12" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={styles.controlIcon}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="m17 9 4 4" />
      <path d="m21 9-4 4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={styles.controlIcon}>
      <path d="M12 4v10" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}
