"use client";

import {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_GALLERY_STORAGE_KEY,
  IMAGE_SETTINGS_STORAGE_KEY,
  type ImageGalleryRecord,
  type ImageWorkspaceSettings,
  mergeImageSettings,
} from "@/lib/image-workspace";

export function loadImageSettings(): ImageWorkspaceSettings {
  if (typeof window === "undefined") return DEFAULT_IMAGE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(IMAGE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_IMAGE_SETTINGS;
    return mergeImageSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
}

export function saveImageSettings(settings: ImageWorkspaceSettings): void {
  window.localStorage.setItem(IMAGE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function loadImageGallery(): ImageGalleryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IMAGE_GALLERY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveImageGallery(records: ImageGalleryRecord[]): void {
  window.localStorage.setItem(IMAGE_GALLERY_STORAGE_KEY, JSON.stringify(records));
}

export function prependImageGalleryRecord(record: ImageGalleryRecord): ImageGalleryRecord[] {
  const next = [record, ...loadImageGallery()];
  saveImageGallery(next);
  return next;
}
