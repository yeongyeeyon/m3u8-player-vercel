const DEFAULT_PLAYLIST_URL = "https://3gvchh5vsgxboe2c.private.blob.vercel-storage.com/mirrors/mylist.m3u";
const PLAYLIST_OVERRIDE_STORAGE_KEY = "signal-deck-playlist-overrides";

const SAMPLE_PLAYLIST = `#EXTM3U
#EXTINF:-1 tvg-name="Ocean News" tvg-logo="https://dummyimage.com/256x256/d7f5c4/071106&text=ON" group-title="News",Ocean News
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-name="Signal Sports" tvg-logo="https://dummyimage.com/256x256/0b1114/d7f5c4&text=SS" group-title="Sports",Signal Sports
https://test-streams.mux.dev/test_001/stream.m3u8
#EXTINF:-1 tvg-name="Cinema Grid" tvg-logo="https://dummyimage.com/256x256/101820/f0ff84&text=CG" group-title="Movies",Cinema Grid
https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8`;

const state = {
  channels: [],
  filteredChannels: [],
  activeChannelId: null,
  hls: null,
  playlistSource: null
};

const elements = {
  playlistForm: document.getElementById("playlist-form"),
  playlistUrl: document.getElementById("playlist-url"),
  playlistReferer: document.getElementById("playlist-referer"),
  playlistOrigin: document.getElementById("playlist-origin"),
  playlistUserAgent: document.getElementById("playlist-user-agent"),
  playlistFile: document.getElementById("playlist-file"),
  playlistRaw: document.getElementById("playlist-raw"),
  loadRawButton: document.getElementById("load-raw-button"),
  useDemoButton: document.getElementById("use-demo-button"),
  loadStatus: document.getElementById("load-status"),
  playlistDiagnostics: document.getElementById("playlist-diagnostics"),
  channelCount: document.getElementById("channel-count"),
  playlistMode: document.getElementById("playlist-mode"),
  groupFilter: document.getElementById("group-filter"),
  searchInput: document.getElementById("search-input"),
  channelList: document.getElementById("channel-list"),
  nowPlaying: document.getElementById("now-playing"),
  channelGroup: document.getElementById("channel-group"),
  channelSource: document.getElementById("channel-source"),
  playbackStatus: document.getElementById("playback-status"),
  player: document.getElementById("player")
};

function setStatus(message, tone = "neutral") {
  elements.loadStatus.textContent = message;
  elements.loadStatus.style.color = tone === "error" ? "var(--danger)" : tone === "success" ? "var(--accent)" : "";
}

function setPlaybackStatus(message, tone = "neutral") {
  elements.playbackStatus.textContent = message;
  elements.playbackStatus.style.color = tone === "error" ? "var(--danger)" : tone === "success" ? "var(--accent)" : "";
}

function setDiagnostics(message, tone = "neutral") {
  elements.playlistDiagnostics.textContent = message;
  elements.playlistDiagnostics.style.color =
    tone === "error" ? "var(--danger)" : tone === "success" ? "var(--accent)" : "";
}

function decodeMaybe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseAttributes(attributeText) {
  const attributes = {};
  const attributePattern = /([A-Za-z0-9_-]+)=("([^"]*)"|([^"\s]+))/g;
  let match = attributePattern.exec(attributeText);

  while (match) {
    const key = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? "";
    attributes[key] = decodeMaybe(value.trim());
    match = attributePattern.exec(attributeText);
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

function getPlaylistOverrides() {
  return normalizeHeaderMap({
    referer: elements.playlistReferer.value.trim(),
    origin: elements.playlistOrigin.value.trim(),
    userAgent: elements.playlistUserAgent.value.trim()
  });
}

function persistPlaylistOverrides() {
  try {
    window.localStorage.setItem(PLAYLIST_OVERRIDE_STORAGE_KEY, JSON.stringify(getPlaylistOverrides()));
  } catch {
    // Ignore storage failures and continue without persistence.
  }
}

function restorePlaylistOverrides() {
  try {
    const savedValue = window.localStorage.getItem(PLAYLIST_OVERRIDE_STORAGE_KEY);
    if (!savedValue) {
      return;
    }

    const overrides = normalizeHeaderMap(JSON.parse(savedValue));
    elements.playlistReferer.value = overrides.referer || "";
    elements.playlistOrigin.value = overrides.origin || "";
    elements.playlistUserAgent.value = overrides.userAgent || "";
  } catch {
    // Ignore malformed persisted values.
  }
}

function parseM3UText(text, baseUrl) {
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
        // Ignore malformed header blocks and continue parsing channels.
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
    const headers = normalizeHeaderMap(pendingHeaders);

    channels.push({
      id: `${name}-${channels.length + 1}`,
      name,
      group,
      logo: attributes["tvg-logo"] || "",
      streamUrl,
      rawStreamUrl: line,
      type: /\.m3u8($|\?)/i.test(streamUrl) ? "hls" : "stream",
      headers
    });

    pendingMeta = null;
    pendingHeaders = {};
    pendingGroup = "";
  }

  return channels;
}

function makeProxyUrl(channel) {
  const proxyUrl = new URL("/api/proxy", window.location.origin);
  proxyUrl.searchParams.set("url", channel.streamUrl);

  if (channel.headers?.referer) {
    proxyUrl.searchParams.set("referer", channel.headers.referer);
  }
  if (channel.headers?.origin) {
    proxyUrl.searchParams.set("origin", channel.headers.origin);
  }
  if (channel.headers?.userAgent) {
    proxyUrl.searchParams.set("ua", channel.headers.userAgent);
  }

  return proxyUrl.toString();
}

function buildPlaylistRequestUrl(url, overrides) {
  const requestUrl = new URL("/api/playlist", window.location.origin);
  requestUrl.searchParams.set("url", url);

  if (overrides.referer) {
    requestUrl.searchParams.set("referer", overrides.referer);
  }
  if (overrides.origin) {
    requestUrl.searchParams.set("origin", overrides.origin);
  }
  if (overrides.userAgent) {
    requestUrl.searchParams.set("ua", overrides.userAgent);
  }

  return requestUrl.toString();
}

function applyPlaylistHeaderFallbacks(channels, overrides) {
  if (!overrides.referer && !overrides.origin && !overrides.userAgent) {
    return channels;
  }

  return channels.map((channel) => ({
    ...channel,
    headers: {
      referer: channel.headers?.referer || overrides.referer || "",
      origin: channel.headers?.origin || overrides.origin || "",
      userAgent: channel.headers?.userAgent || overrides.userAgent || ""
    }
  }));
}

function formatOverrideSummary(overrides) {
  const parts = [];

  if (overrides.referer) {
    parts.push(`referer=${overrides.referer}`);
  }
  if (overrides.origin) {
    parts.push(`origin=${overrides.origin}`);
  }
  if (overrides.userAgent) {
    parts.push(`ua=${overrides.userAgent}`);
  }

  return parts.join(" | ");
}

function formatDiagnosticMessage(payload, overrides, mode = "error") {
  const lines = [];

  if (mode === "success") {
    lines.push("Remote playlist fetch succeeded.");
  }

  if (payload?.diagnostic?.upstreamStatus) {
    lines.push(`Upstream status: ${payload.diagnostic.upstreamStatus}`);
  }
  if (payload?.diagnostic?.contentType) {
    lines.push(`Content-Type: ${payload.diagnostic.contentType}`);
  }
  if (payload?.diagnostic?.finalUrl && payload.diagnostic.finalUrl !== payload?.sourceUrl) {
    lines.push(`Final URL: ${payload.diagnostic.finalUrl}`);
  }
  if (payload?.diagnostic?.hint) {
    lines.push(payload.diagnostic.hint);
  }
  if (payload?.diagnostic?.responsePreview) {
    lines.push(`Preview: ${payload.diagnostic.responsePreview}`);
  }

  const overrideSummary = formatOverrideSummary(overrides);
  if (overrideSummary) {
    lines.push(`Overrides: ${overrideSummary}`);
  }

  return lines.join("\n") || "No upstream diagnostics available.";
}

function updateGroupFilter(channels) {
  const groups = Array.from(new Set(channels.map((channel) => channel.group || "Ungrouped"))).sort((a, b) =>
    a.localeCompare(b)
  );

  elements.groupFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All groups";
  elements.groupFilter.appendChild(allOption);

  for (const group of groups) {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    elements.groupFilter.appendChild(option);
  }
}

function applyFilters() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const group = elements.groupFilter.value;

  state.filteredChannels = state.channels.filter((channel) => {
    const matchesSearch =
      !search ||
      channel.name.toLowerCase().includes(search) ||
      (channel.group || "").toLowerCase().includes(search);
    const matchesGroup = group === "all" || channel.group === group;
    return matchesSearch && matchesGroup;
  });

  renderChannelList();
}

function channelInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderChannelList() {
  elements.channelCount.textContent = `${state.filteredChannels.length} channels`;
  elements.channelList.innerHTML = "";

  if (!state.filteredChannels.length) {
    const empty = document.createElement("div");
    empty.className = "channel-empty";
    empty.textContent = state.channels.length
      ? "No channels match the current search or group filter."
      : "Load a playlist to populate the channel directory.";
    elements.channelList.appendChild(empty);
    return;
  }

  for (const channel of state.filteredChannels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `channel-card${channel.id === state.activeChannelId ? " active" : ""}`;
    button.addEventListener("click", () => playChannel(channel));

    const logo = channel.logo
      ? `<div class="channel-logo"><img src="${escapeHtml(channel.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></div>`
      : `<div class="channel-logo"><span class="channel-fallback">${escapeHtml(channelInitials(channel.name) || "TV")}</span></div>`;

    button.innerHTML = `
      ${logo}
      <div class="channel-main">
        <p class="channel-name">${escapeHtml(channel.name)}</p>
        <p class="channel-meta">${escapeHtml(channel.group || "Ungrouped")}</p>
      </div>
      <span class="channel-tag">${escapeHtml(channel.type)}</span>
    `;

    elements.channelList.appendChild(button);
  }
}

function setChannels(channels, sourceMode, sourceLabel) {
  state.channels = channels;
  state.activeChannelId = null;
  state.playlistSource = { sourceMode, sourceLabel };
  updateGroupFilter(channels);
  applyFilters();
  elements.playlistMode.textContent = sourceMode;
  setStatus(`Loaded ${channels.length} channels from ${sourceLabel}.`, channels.length ? "success" : "neutral");

  if (channels.length) {
    playChannel(channels[0]);
  } else {
    setPlaybackStatus("Playlist contains no playable channels.", "error");
  }
}

async function loadPlaylistFromUrl(url) {
  const overrides = getPlaylistOverrides();
  persistPlaylistOverrides();
  setStatus("Fetching playlist through the Vercel proxy...");
  elements.playlistMode.textContent = "Remote URL";
  setDiagnostics("Testing remote playlist access from the serverless proxy...");

  const response = await fetch(buildPlaylistRequestUrl(url, overrides));
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    setDiagnostics(formatDiagnosticMessage(payload, overrides), "error");
    throw new Error(payload.error || "Unable to load remote playlist.");
  }

  const channels = applyPlaylistHeaderFallbacks(payload.channels || [], overrides);
  setDiagnostics(formatDiagnosticMessage(payload, overrides, "success"), "success");
  setChannels(channels, "Remote URL", payload.sourceUrl || url);
}

async function loadPlaylistFromFile(file) {
  const overrides = getPlaylistOverrides();
  persistPlaylistOverrides();
  const text = await file.text();
  const channels = applyPlaylistHeaderFallbacks(parseM3UText(text), overrides);
  setDiagnostics(
    `Playlist loaded from local file.\nNo remote playlist fetch was required.${formatOverrideSummary(overrides) ? `\nOverrides: ${formatOverrideSummary(overrides)}` : ""}`,
    "success"
  );
  setChannels(channels, "Local File", file.name);
}

function loadPlaylistFromRawText(text) {
  const overrides = getPlaylistOverrides();
  persistPlaylistOverrides();
  const channels = applyPlaylistHeaderFallbacks(parseM3UText(text), overrides);
  setDiagnostics(
    `Playlist loaded from pasted text.\nNo remote playlist fetch was required.${formatOverrideSummary(overrides) ? `\nOverrides: ${formatOverrideSummary(overrides)}` : ""}`,
    "success"
  );
  setChannels(channels, "Raw Text", "pasted playlist");
}

function destroyHls() {
  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }
}

async function playChannel(channel) {
  const proxyUrl = makeProxyUrl(channel);
  state.activeChannelId = channel.id;
  renderChannelList();

  elements.nowPlaying.textContent = channel.name;
  elements.channelGroup.textContent = channel.group || "Ungrouped";
  elements.channelSource.textContent = channel.streamUrl;
  setPlaybackStatus("Connecting to stream...");

  const player = elements.player;
  destroyHls();
  player.pause();
  player.removeAttribute("src");
  player.load();

  if (window.Hls && window.Hls.isSupported()) {
    const hls = new window.Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 45
    });

    state.hls = hls;
    hls.attachMedia(player);
    hls.on(window.Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(proxyUrl);
    });
    hls.on(window.Hls.Events.MANIFEST_PARSED, async () => {
      setPlaybackStatus("Live stream ready.", "success");
      try {
        await player.play();
      } catch {
        setPlaybackStatus("Stream loaded. Tap play to start audio or video.");
      }
    });
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        setPlaybackStatus(`Playback failed: ${data.type}`, "error");
      }
    });
    return;
  }

  player.src = proxyUrl;
  try {
    await player.play();
    setPlaybackStatus("Playing with native media engine.", "success");
  } catch {
    setPlaybackStatus("Stream loaded. Tap play to start audio or video.");
  }
}

function hydrateSample() {
  elements.playlistRaw.value = SAMPLE_PLAYLIST;
  setDiagnostics("Sample playlist loaded locally for testing the player UI and stream switching.");
  loadPlaylistFromRawText(SAMPLE_PLAYLIST);
}

function bindEvents() {
  elements.playlistUrl.value = DEFAULT_PLAYLIST_URL;
  restorePlaylistOverrides();

  elements.playlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = elements.playlistUrl.value.trim();

    if (!url) {
      setStatus("Enter a playlist URL first.", "error");
      return;
    }

    try {
      await loadPlaylistFromUrl(url);
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  elements.playlistFile.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      await loadPlaylistFromFile(file);
    } catch {
      setStatus("The selected file could not be parsed as an M3U playlist.", "error");
    }
  });

  elements.loadRawButton.addEventListener("click", () => {
    const text = elements.playlistRaw.value.trim();
    if (!text) {
      setStatus("Paste an M3U playlist before loading raw text.", "error");
      return;
    }

    try {
      loadPlaylistFromRawText(text);
    } catch {
      setStatus("The pasted content could not be parsed as an M3U playlist.", "error");
    }
  });

  elements.useDemoButton.addEventListener("click", hydrateSample);
  elements.searchInput.addEventListener("input", applyFilters);
  elements.groupFilter.addEventListener("change", applyFilters);
  elements.playlistReferer.addEventListener("input", persistPlaylistOverrides);
  elements.playlistOrigin.addEventListener("input", persistPlaylistOverrides);
  elements.playlistUserAgent.addEventListener("input", persistPlaylistOverrides);

  elements.player.addEventListener("playing", () => {
    setPlaybackStatus("Playback in progress.", "success");
  });
  elements.player.addEventListener("waiting", () => {
    setPlaybackStatus("Buffering stream...");
  });
  elements.player.addEventListener("pause", () => {
    if (!elements.player.ended) {
      setPlaybackStatus("Playback paused.");
    }
  });
  elements.player.addEventListener("error", () => {
    setPlaybackStatus("The current stream could not be played.", "error");
  });
}

bindEvents();
