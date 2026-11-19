// Small helpers for addresses. No DOM here, so the tests can run it.

// The host without www, and with the port if asked
export const hostOf = (url, port = false) => {
  try { const u = new URL(url); return (port ? u.host : u.hostname).replace(/^www\./, ""); } catch { return ""; }
};
export const prettyUrl = (url) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
export const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
