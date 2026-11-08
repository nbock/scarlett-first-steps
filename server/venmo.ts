// Accept a username or a Venmo profile link; store only the username.
export function normalizeVenmo(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 240) return null;
  let username = value.trim();
  if (!username) return "";
  if (/^(?:(?:www|account)\.)?venmo\.com\//i.test(username)) username = "https://" + username;
  if (/^https?:\/\//i.test(username)) {
    try {
      const url = new URL(username);
      if (!["venmo.com", "www.venmo.com", "account.venmo.com"].includes(url.hostname)
        || url.username || url.password || url.port) return null;
      const path = url.pathname.match(/^\/(?:u\/)?([^/]+)\/?$/);
      if (!path) return null;
      username = decodeURIComponent(path[1]);
    } catch { return null; }
  }
  username = username.replace(/^@/, "");
  return /^[a-zA-Z0-9_-]{5,30}$/.test(username) ? username : null;
}

export const venmoProfileUrl = (username: string) => `https://venmo.com/u/${encodeURIComponent(username)}`;
