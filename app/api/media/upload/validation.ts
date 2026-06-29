export function validUserMediaKey(key: string, userId: string): boolean {
  if (!key || key.length > 700) return false;
  if (!key.startsWith(`ephemeral/${userId}/`)) return false;
  if (key.includes("..") || key.includes("//") || key.startsWith("/") || key.endsWith("/")) return false;
  return /^[a-zA-Z0-9/_.-]+\.[a-zA-Z0-9]+$/.test(key);
}
