function decodeMaybe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseAttributes(attributeText) {
  const attributes = {};
  const pattern = /([A-Za-z0-9_-]+)=("([^"]*)"|([^"\s]+))/g;
  let match = pattern.exec(attributeText);

  while (match) {
    const key = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? "";
    attributes[key] = decodeMaybe(value.trim());
    match = pattern.exec(attributeText);
  }

  return attributes;
}

function normalizeHeaderMap(rawHeaders) {
  if (!rawHeaders || typeof rawHeaders !== "object") {
    return {};
  }

  const headers = {};
  const referer = rawHeaders.referer || rawHeaders.referrer;
  const userAgent = rawHeaders["user-agent"] || rawHeaders.userAgent;
  const origin = rawHeaders.origin;

  if (referer) {
    headers.referer = referer;
  }
  if (userAgent) {
    headers.userAgent = userAgent;
  }
  if (origin) {
    headers.origin = origin;
  }

  return headers;
}

function parseM3U(text, baseUrl) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const channels = [];
  let pendingMeta = null;
  let pendingHeaders = {};
  let pendingGroup = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("#EXTINF")) {
      const [, attributeText = "", titleText = ""] = line.match(/^#EXTINF:(.*?),(.*)$/) || [];
      const attributes = parseAttributes(attributeText);
      pendingMeta = {
        attributes,
        title: titleText.trim() || attributes["tvg-name"] || "Untitled Channel"
      };
      continue;
    }

    if (line.startsWith("#EXTGRP:")) {
      pendingGroup = line.slice("#EXTGRP:".length).trim();
      continue;
    }

    if (line.startsWith("#EXTVLCOPT:")) {
      const value = line.slice("#EXTVLCOPT:".length);
      const [key, ...rest] = value.split("=");
      const optionValue = rest.join("=").trim();
      const normalizedKey = key.trim().toLowerCase();

      if (normalizedKey === "http-referrer" || normalizedKey === "http-referer") {
        pendingHeaders.referer = optionValue;
      } else if (normalizedKey === "http-origin") {
        pendingHeaders.origin = optionValue;
      } else if (normalizedKey === "http-user-agent") {
        pendingHeaders.userAgent = optionValue;
      }
      continue;
    }

    if (line.startsWith("#EXTHTTP:")) {
      try {
        const jsonValue = JSON.parse(line.slice("#EXTHTTP:".length).trim());
        pendingHeaders = { ...pendingHeaders, ...normalizeHeaderMap(jsonValue) };
      } catch {
        // Ignore malformed blocks and keep parsing channels.
      }
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    const streamUrl = baseUrl ? new URL(line, baseUrl).toString() : line;
    const attributes = pendingMeta?.attributes || {};
    const name = pendingMeta?.title || attributes["tvg-name"] || attributes["tvg-id"] || "Untitled Channel";
    const group = attributes["group-title"] || pendingGroup || "Ungrouped";

    channels.push({
      id: `${name}-${channels.length + 1}`,
      name,
      group,
      logo: attributes["tvg-logo"] || "",
      streamUrl,
      rawStreamUrl: line,
      type: /\.m3u8($|\?)/i.test(streamUrl) ? "hls" : "stream",
      headers: normalizeHeaderMap(pendingHeaders)
    });

    pendingMeta = null;
    pendingHeaders = {};
    pendingGroup = "";
  }

  return channels;
}

module.exports = {
  parseM3U
};
