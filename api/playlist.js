const { parseM3U } = require("./_lib/m3u");
const { applyCommonHeaders, getRequestHeaders, isLikelyCloudflareBlock } = require("./_lib/proxy");

function readPlaylistOverrides(req) {
  return {
    referer: req.query.referer || "",
    origin: req.query.origin || "",
    userAgent: req.query.ua || ""
  };
}

function buildResponsePreview(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function isPrivateVercelBlob(url) {
  return /\.private\.blob\.vercel-storage\.com$/i.test(url.hostname);
}

module.exports = async function handler(req, res) {
  applyCommonHeaders(res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed. Use GET." });
    return;
  }

  const sourceUrl = req.query.url;
  if (!sourceUrl) {
    res.status(400).json({ error: "Missing required query parameter: url" });
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    res.status(400).json({ error: "Playlist URL is not a valid absolute URL." });
    return;
  }

  if (!/^https?:$/.test(parsedUrl.protocol)) {
    res.status(400).json({ error: "Only http and https playlist URLs are supported." });
    return;
  }

  try {
    const overrides = readPlaylistOverrides(req);
    const requestHeaders = getRequestHeaders(req, overrides);

    if (isPrivateVercelBlob(parsedUrl) && process.env.BLOB_READ_WRITE_TOKEN) {
      requestHeaders.authorization = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
    }

    const upstreamResponse = await fetch(parsedUrl.toString(), {
      headers: requestHeaders
    });

    const text = await upstreamResponse.text();
    const diagnostic = {
      upstreamStatus: upstreamResponse.status,
      contentType: upstreamResponse.headers.get("content-type") || "",
      finalUrl: upstreamResponse.url || parsedUrl.toString()
    };

    if (isLikelyCloudflareBlock(text)) {
      res.status(502).json({
        error:
          "The playlist host returned a Cloudflare block page instead of the M3U file. This usually means the upstream is blocking server-side requests from Vercel.",
        sourceUrl: parsedUrl.toString(),
        diagnostic: {
          ...diagnostic,
          responsePreview: buildResponsePreview(text),
          hint: "Header overrides may fix simple anti-hotlinking, but they will not bypass a real Cloudflare bot challenge."
        }
      });
      return;
    }

    if (!upstreamResponse.ok) {
      res.status(upstreamResponse.status).json({
        error: `Upstream playlist request failed with status ${upstreamResponse.status}.`,
        sourceUrl: parsedUrl.toString(),
        diagnostic: {
          ...diagnostic,
          responsePreview: buildResponsePreview(text),
          hint: isPrivateVercelBlob(parsedUrl)
            ? process.env.BLOB_READ_WRITE_TOKEN
              ? "The request used your server-side BLOB_READ_WRITE_TOKEN. If it still failed, verify the blob URL or token scope."
              : "This is a private Vercel Blob URL. Add BLOB_READ_WRITE_TOKEN to your Vercel project env so the server can read it."
            : overrides.referer || overrides.origin || overrides.userAgent
              ? "Overrides were sent, so the upstream is likely blocking Vercel itself or requires cookies/session-based access."
              : "Try setting playlist Referer, Origin, or User-Agent overrides. If it still fails, mirror the playlist file to a host you control."
        }
      });
      return;
    }

    const channels = parseM3U(text, parsedUrl.toString());
    if (!channels.length) {
      res.status(502).json({
        error: "The upstream response was fetched, but it did not parse as a valid M3U playlist.",
        sourceUrl: parsedUrl.toString(),
        diagnostic: {
          ...diagnostic,
          responsePreview: buildResponsePreview(text),
          hint: "If this preview looks like HTML instead of playlist text, the host is returning a block or login page."
        }
      });
      return;
    }

    res.status(200).json({
      sourceUrl: parsedUrl.toString(),
      channelCount: channels.length,
      channels,
      diagnostic
    });
  } catch (error) {
    res.status(502).json({
      error: error.message || "Failed to fetch remote playlist.",
      sourceUrl: parsedUrl.toString()
    });
  }
};
