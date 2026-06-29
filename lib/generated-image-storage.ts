export const GENERATED_IMAGES_BUCKET = "generated-images";

export function isStoredGeneratedImageUrl(url: string): boolean {
  const trimmed = url.trim();
  return /\/storage\/v1\/object\/public\/generated-images\//i.test(trimmed) || /^https:\/\/media\.otato\.art\//i.test(trimmed);
}
