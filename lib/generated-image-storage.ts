export const GENERATED_IMAGES_BUCKET = "generated-images";

export function isStoredGeneratedImageUrl(url: string): boolean {
  return /\/storage\/v1\/object\/public\/generated-images\//i.test(url.trim());
}
