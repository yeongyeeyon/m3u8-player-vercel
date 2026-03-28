const {
  applyCommonHeaders,
  getRequestHeaders,
  isLikelyCloudflareBlock,
  isLikelyManifest,
  rewriteManifest
} = require("./_lib/proxy");

module.exports = async function handler(req, res) {
  applyCommonHeaders(res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed. Use GET." });
    return;
  }

  const targetUrl = req.query.url;
  if (!targetUrl) {
    res.status(400).json({ error: "Missing required query parameter: url" });
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    res.status(400).json({ error: "Target stream URL is not a valid absolute URL." });
    return;
  }

  if (!/^https?:$/.test(parsedUrl.protocol)) {
    res.status(400).json({ error: "Only http and https stream URLs are supported." });
    return;
  }

  const options = {
    referer: req.query.referer || "",
    origin: req.query.origin || "",
    userAgent: req.query.ua || ""
  };

  try {
    const upstreamResponse = await fetch(parsedUrl.toString(), {
      headers: getRequestHeaders(req, options),
      redirect: "follow"
    });

    const contentType = upstreamResponse.headers.get("content-type") || "";

    if (!upstreamResponse.ok) {
      res.status(upstreamResponse.status).json({
        error: `Upstream stream request failed with status ${upstreamResponse.status}.`,
        targetUrl: parsedUrl.toString()
      });
      return;
    }

    if (isLikelyManifest(parsedUrl.toString(), contentType)) {
      const text = await upstreamResponse.text();

      if (isLikelyCloudflareBlock(text)) {
        res.status(502).json({
          error:
            "The stream host returned a Cloudflare block page instead of a playable manifest. The upstream host needs to allow proxy requests from your deployment.",
          targetUrl: parsedUrl.toString()
        });
        return;
      }

      const manifest = rewriteManifest(text, parsedUrl.toString(), req, options);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.status(200).send(manifest);
      return;
    }

    res.status(upstreamResponse.status);

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    const contentLength = upstreamResponse.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    const acceptRanges = upstreamResponse.headers.get("accept-ranges");
    if (acceptRanges) {
      res.setHeader("Accept-Ranges", acceptRanges);
    }

    const arrayBuffer = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    res.status(502).json({
      error: error.message || "Failed to proxy upstream stream.",
      targetUrl: parsedUrl.toString()
    });
  }
};
