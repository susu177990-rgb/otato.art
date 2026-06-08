export const API_KEY_CONFIGURED_PLACEHOLDER = "__api_key_configured__";

export function isApiKeyConfiguredPlaceholder(value: unknown): boolean {
  return typeof value === "string" && value === API_KEY_CONFIGURED_PLACEHOLDER;
}

export function redactApiKeyForClient(value: string): string {
  return value.trim() ? API_KEY_CONFIGURED_PLACEHOLDER : "";
}
