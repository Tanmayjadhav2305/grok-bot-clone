const SITE_ALIASES: Record<string, string> = {
  gmail: "https://mail.google.com/",
  "google mail": "https://mail.google.com/",
  outlook: "https://outlook.live.com/mail/",
  hotmail: "https://outlook.live.com/mail/",
  youtube: "https://www.youtube.com/",
  github: "https://github.com/",
  hn: "https://news.ycombinator.com/",
  "hacker news": "https://news.ycombinator.com/",
  google: "https://www.google.com/",
};

function applyAlias(raw: string): string {
  const key = raw.trim().toLowerCase();
  return SITE_ALIASES[key] ?? raw;
}

/** Coerce model args into an http(s) URL (or search URL). */
export function resolveNavigateUrl(args: unknown):
  | { ok: true; url: string }
  | { ok: false; error: string } {
  const obj =
    args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const rawCandidates = [obj.url, obj.href, obj.link, obj.query, obj.q];
  let raw = "";
  for (const c of rawCandidates) {
    if (typeof c === "string" && c.trim()) {
      raw = c.trim();
      break;
    }
  }
  if (!raw) {
    return {
      ok: false,
      error: `navigate requires url (got ${JSON.stringify(args)})`,
    };
  }

  raw = applyAlias(raw);

  const looksLikeUrl =
    /^https?:\/\//i.test(raw) ||
    /^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw) ||
    raw.startsWith("localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}/.test(raw);

  if (!looksLikeUrl) {
    // "open gmail" style phrases
    const lowered = raw.toLowerCase();
    for (const [alias, url] of Object.entries(SITE_ALIASES)) {
      if (lowered.includes(alias)) {
        return { ok: true, url };
      }
    }
    return {
      ok: true,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(raw)}`,
    };
  }

  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      ok: false,
      error: `invalid URL: ${JSON.stringify(raw)}`,
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `only http/https allowed: ${parsed.protocol}` };
  }
  return { ok: true, url: parsed.toString() };
}
