const { parseM3U } = require("./_lib/m3u");
const { applyCommonHeaders, getRequestHeaders, isLikelyCloudflareBlock } = require("./_lib/proxy");

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
    const upstreamResponse = await fetch(parsedUrl.toString(), {
      headers: getRequestHeaders(req)
    });

    const text = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      res.status(upstreamResponse.status).json({
        error: `Upstream playlist request failed with status ${upstreamResponse.status}.`,
        sourceUrl: parsedUrl.toString()
      });
      return;
    }

    if (isLikelyCloudflareBlock(text)) {
      res.status(502).json({
        error:
          "The playlist host returned a Cloudflare block page instead of the M3U file. This will also likely fail from Vercel unless that host allows the deployment to fetch the playlist.",
        sourceUrl: parsedUrl.toString()
      });
      return;
    }

    const channels = parseM3U(text, parsedUrl.toString());
    res.status(200).json({
      sourceUrl: parsedUrl.toString(),
      channelCount: channels.length,
      channels
    });
  } catch (error) {
    res.status(502).json({
      error: error.message || "Failed to fetch remote playlist.",
      sourceUrl: parsedUrl.toString()
    });
  }
};

