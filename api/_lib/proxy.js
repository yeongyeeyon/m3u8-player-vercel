function isLikelyCloudflareBlock(text) {
  if (typeof text !== "string") {
    return false;
  }

  return text.includes("Attention Required! | Cloudflare") || text.includes("Sorry, you have been blocked");
}

function isLikelyManifest(url, contentType, bodyText) {
  const normalizedType = (contentType || "").toLowerCase();
  return (
    normalizedType.includes("application/vnd.apple.mpegurl") ||
    normalizedType.includes("application/x-mpegurl") ||
    normalizedType.includes("audio/mpegurl") ||
    /\.m3u8($|\?)/i.test(url) ||
    (typeof bodyText === "string" && bodyText.trimStart().startsWith("#EXTM3U"))
  );
}

function buildProxyUrl(req, targetUrl, options = {}) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const proxyUrl = new URL("/api/proxy", `${protocol}://${req.headers.host}`);

  proxyUrl.searchParams.set("url", targetUrl);

  if (options.referer) {
    proxyUrl.searchParams.set("referer", options.referer);
  }
  if (options.origin) {
    proxyUrl.searchParams.set("origin", options.origin);
  }
  if (options.userAgent) {
    proxyUrl.searchParams.set("ua", options.userAgent);
  }

  return proxyUrl.toString();
}

function rewriteTagAttributes(line, baseUrl, req, options) {
  return line.replace(/URI="([^"]+)"/gi, (_match, uriValue) => {
    const absoluteUrl = new URL(uriValue, baseUrl).toString();
    return `URI="${buildProxyUrl(req, absoluteUrl, options)}"`;
  });
}

function rewriteManifest(text, baseUrl, req, options = {}) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((rawLine) => {
      const line = rawLine.trim();

      if (!line) {
        return rawLine;
      }

      if (line.startsWith("#")) {
        return rewriteTagAttributes(rawLine, baseUrl, req, options);
      }

      const absoluteUrl = new URL(line, baseUrl).toString();
      return buildProxyUrl(req, absoluteUrl, options);
    })
    .join("\n");
}

function getRequestHeaders(req, overrides = {}) {
  const headers = {
    "user-agent":
      overrides.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    accept: req.headers.accept || "*/*"
  };

  if (overrides.referer) {
    headers.referer = overrides.referer;
  }
  if (overrides.origin) {
    headers.origin = overrides.origin;
  }
  if (req.headers.range) {
    headers.range = req.headers.range;
  }

  return headers;
}

function applyCommonHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
}

module.exports = {
  applyCommonHeaders,
  buildProxyUrl,
  getRequestHeaders,
  isLikelyCloudflareBlock,
  isLikelyManifest,
  rewriteManifest
};
