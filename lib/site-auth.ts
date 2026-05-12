export const SITE_AUTH_COOKIE = "script_agent_site_auth";

const DEFAULT_SITE_PASSWORD = "x)r)y.Yg6J4wnM\\";
const SITE_AUTH_PEPPER = "script-agent-site-auth-v1";

export function getSitePassword(): string {
  return process.env.SCRIPT_AGENT_SITE_PASSWORD || DEFAULT_SITE_PASSWORD;
}

export async function createSiteAuthToken(password = getSitePassword()): Promise<string> {
  const data = new TextEncoder().encode(`${SITE_AUTH_PEPPER}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

