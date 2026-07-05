(function initYtBiliContent() {
  "use strict";

  const STORAGE_PREFIX = "ytbili:";
  const VIDEO_PREFIX = `${STORAGE_PREFIX}video:`;
  const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;
  const SEARCH_CACHE_VERSION = 3;
  const DEFAULT_SETTINGS = {
    autoSearch: true,
    strictness: "careful",
    likeBeforeOpen: false
  };
  const STRICTNESS = {
    careful: { confident: 0.72, possible: 0.56, related: 0.34 },
    balanced: { confident: 0.66, possible: 0.5, related: 0.3 },
    relaxed: { confident: 0.6, possible: 0.44, related: 0.26 }
  };

  const app = {
    videoId: null,
    runId: 0,
    host: null,
    metadata: null,
    settings: { ...DEFAULT_SETTINGS },
    record: null,
    ranked: []
  };

  start();

  function start() {
    window.addEventListener("yt-navigate-finish", scheduleRouteCheck);
    window.addEventListener("popstate", scheduleRouteCheck);
    setInterval(checkRoute, 1000);
    scheduleRouteCheck();
  }

  function scheduleRouteCheck() {
    window.setTimeout(checkRoute, 250);
  }

  async function checkRoute() {
    const videoId = getCurrentVideoId();
    if (!videoId) {
      app.videoId = null;
      removeHost();
      return;
    }

    if (videoId === app.videoId && app.host && document.body.contains(app.host)) {
      ensureHost({ allowFallback: false });
      return;
    }

    app.videoId = videoId;
    app.runId += 1;
    const runId = app.runId;
    app.ranked = [];
    app.record = null;
    app.metadata = null;

    const settingsPromise = getSettings();
    const recordPromise = getVideoRecord(videoId);
    const metadataPromise = collectMetadata(runId);
    await waitForPreferredHost(runId, 2200);
    if (!isCurrent(runId)) return;
    renderLoading("正在读取这个 YouTube 视频的信息");

    const [settings, record, metadata] = await Promise.all([settingsPromise, recordPromise, metadataPromise]);

    if (!isCurrent(runId)) return;

    app.settings = settings;
    app.record = record;
    app.metadata = metadata;

    if (!metadata.title) {
      renderError("还没读到视频标题", "稍等片刻或刷新页面后再试。", metadata);
      return;
    }

    if (!settings.autoSearch) {
      renderPaused(metadata);
      return;
    }

    if (record.accepted && record.accepted.bvid) {
      app.ranked = [record.accepted];
      renderFound(metadata, [record.accepted], { cached: true });
      return;
    }

    await searchAndRender(runId, metadata, record);
  }

  async function searchAndRender(runId, metadata, record) {
    renderLoading("正在帮你找 B站同源视频", metadata);

    const queries = YtBiliMatcher.buildSearchQueries(metadata.title);
    let currentRecord = record || {};
    const cacheFresh =
      currentRecord.search &&
      currentRecord.search.version === SEARCH_CACHE_VERSION &&
      Date.now() - currentRecord.search.savedAt < 6 * 60 * 60 * 1000;
    let results = cacheFresh ? currentRecord.search.results : null;
    let searchSource = cacheFresh ? currentRecord.search.source : null;
    let searchError = null;

    if (!results) {
      try {
        const response = await chrome.runtime.sendMessage({ type: "YTBILI_SEARCH", queries });
        if (!response || !response.ok) throw new Error((response && response.error) || "B站搜索暂时不可用");
        results = response.results || [];
        searchSource = response.source || "api";
        currentRecord = await updateVideoRecord(metadata.videoId, {
          search: { savedAt: Date.now(), version: SEARCH_CACHE_VERSION, results, source: searchSource }
        });
        app.record = currentRecord;
      } catch (error) {
        searchError = error;
        results = [];
      }
    }

    if (!isCurrent(runId)) return;

    const rejected = [];
    let ranked = YtBiliMatcher.rankCandidates(metadata, results, rejected);
    app.ranked = ranked;

    if (ranked.length) {
      const displayable = pickDisplayableCandidates(ranked);
      if (displayable.length) {
        renderFound(metadata, displayable, { cached: false });
        return;
      }
    }

    if (searchSource !== "page") {
      renderLoading("正在换一种方式找 B站视频", metadata);
      try {
        const response = await chrome.runtime.sendMessage({ type: "YTBILI_SEARCH", queries, strategy: "page" });
        if (!response || !response.ok) throw new Error((response && response.error) || "B站网页搜索暂时不可用");
        results = mergeResults(results, response.results || []);
        searchSource = "page";
        currentRecord = await updateVideoRecord(metadata.videoId, {
          search: { savedAt: Date.now(), version: SEARCH_CACHE_VERSION, results, source: searchSource }
        });
        app.record = currentRecord;
        ranked = YtBiliMatcher.rankCandidates(metadata, results, rejected);
        app.ranked = ranked;

        const displayable = pickDisplayableCandidates(ranked);
        if (displayable.length) {
          renderFound(metadata, displayable, { cached: false });
          return;
        }
      } catch (error) {
        searchError = searchError || error;
      }
    }

    if (searchError) {
      renderSearchError(metadata, searchError);
      return;
    }

    renderNoMatch(metadata);
  }

  async function collectMetadata(runId) {
    const started = Date.now();
    let title = "";
    let channelName = "";
    let durationSeconds = null;

    while (Date.now() - started < 5000) {
      if (!isCurrent(runId)) break;

      title = readTitle();
      channelName = readChannelName();
      durationSeconds = readDuration();

      if (title && (durationSeconds || Date.now() - started > 1400)) break;
      await sleep(250);
    }

    return {
      videoId: getCurrentVideoId(),
      title,
      channelName,
      durationSeconds,
      url: location.href
    };
  }

  function readTitle() {
    const selectors = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "h1.title yt-formatted-string",
      "meta[name='title']"
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node ? node.textContent || node.getAttribute("content") : "";
      if (value && value.trim()) return value.trim();
    }

    const documentTitle = document.title.replace(/\s+-\s+YouTube\s*$/i, "").trim();
    return documentTitle || "";
  }

  function readChannelName() {
    const selectors = [
      "#owner #channel-name a",
      "ytd-watch-metadata ytd-channel-name a",
      "#upload-info #channel-name a"
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node ? node.textContent : "";
      if (value && value.trim()) return value.trim();
    }
    return "";
  }

  function readDuration() {
    const video = document.querySelector("video");
    if (video && Number.isFinite(video.duration) && video.duration > 0) return video.duration;

    const timeText = document.querySelector(".ytp-time-duration")?.textContent || "";
    return YtBiliMatcher.parseDuration(timeText);
  }

  function getHostTarget(allowFallback) {
    const sidebar =
      document.querySelector("ytd-watch-flexy #secondary #secondary-inner") ||
      document.querySelector("ytd-watch-flexy #secondary");

    if (sidebar) return { target: sidebar, sidebar: true };
    if (!allowFallback) return null;

    const fallback =
      document.querySelector("#below") ||
      document.querySelector("#primary-inner") ||
      document.querySelector("ytd-watch-flexy #primary") ||
      document.body;

    return fallback ? { target: fallback, sidebar: false } : null;
  }

  async function waitForPreferredHost(runId, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!isCurrent(runId)) return false;
      if (getHostTarget(false)) return true;
      await sleep(100);
    }
    return Boolean(getHostTarget(true));
  }

  function ensureHost(options = {}) {
    const allowFallback = options.allowFallback !== false;
    let host = document.getElementById("ytbili-root");
    if (!host) {
      host = document.createElement("section");
      host.id = "ytbili-root";
      host.setAttribute("aria-live", "polite");
    }

    const placement = getHostTarget(allowFallback);
    if (!placement) return false;
    const { target, sidebar } = placement;

    if (host.parentElement !== target) {
      target.prepend(host);
    }

    app.host = host;
    app.host.classList.toggle("ytbili-sidebar", Boolean(sidebar));
    app.host.classList.toggle("ytbili-fallback", !sidebar);
    syncThemeClass();
    return true;
  }

  function removeHost() {
    if (app.host) app.host.remove();
    app.host = null;
  }

  function syncThemeClass() {
    if (!app.host) return;
    const dark = document.documentElement.hasAttribute("dark") || document.documentElement.getAttribute("dark") === "true";
    app.host.classList.toggle("ytbili-dark", dark);
  }

  function renderLoading(message, metadata) {
    renderCard({
      eyebrow: "B站同源助手",
      title: message,
      body: metadata && metadata.title ? metadata.title : "打开 YouTube 视频后，我会自动帮你找 B站版本。",
      status: "loading",
      actions: []
    });
  }

  function renderPaused(metadata) {
    renderCard({
      eyebrow: "已暂停自动搜索",
      title: "需要时再帮你找 B站版本",
      body: metadata.title,
      status: "neutral",
      actions: [
        button("现在查找", "primary", async () => {
          await saveSettings({ autoSearch: true });
          app.settings.autoSearch = true;
          await searchAndRender(app.runId, metadata, app.record || {});
        }),
        linkButton("打开 B站搜索", buildManualSearchUrl(metadata.title))
      ]
    });
  }

  function renderFound(metadata, matches, options) {
    const top = matches[0];
    const thresholds = getThresholds();
    const tier = options.cached ? "confirmed" : candidateTier(top, thresholds);
    const confident = tier === "confirmed" || tier === "strong" || tier === "likely";
    const title =
      tier === "confirmed"
        ? "已确认 B站版本"
        : confident
          ? "找到 B站版本"
          : "B站有相近内容";

    const actions = confident
      ? app.settings.likeBeforeOpen
        ? [
            button("点赞打开", "primary", () => openBilibili(metadata, top, { likeFirst: true, remember: true })),
            button("仅打开", "secondary", () => openBilibili(metadata, top, { likeFirst: false, remember: true }))
          ]
        : [
            button("打开", "primary", () => openBilibili(metadata, top, { likeFirst: false, remember: true })),
            button("点赞打开", "secondary", () => openBilibili(metadata, top, { likeFirst: true, remember: true }))
          ]
      : [
          button("打开看看", "primary", () => openBilibili(metadata, top, { likeFirst: false, remember: false })),
          linkButton("去 B站搜", buildManualSearchUrl(metadata.title), "secondary")
        ];

    renderCard({
      eyebrow: "B站同源助手",
      title,
      body: confidenceCopy(tier, top),
      status: confident ? "success" : "warning",
      match: top,
      tier,
      candidates: matches.slice(1, 4),
      actions,
      actionHint: confident ? likeOpenHint() : "",
      metadata
    });
  }

  function renderNoMatch(metadata) {
    renderCard({
      eyebrow: "B站同源助手",
      title: "暂时没找到",
      body: "可能标题不同，或 B站还没有同源视频。",
      status: "neutral",
      actions: [
        linkButton("去 B站搜", buildManualSearchUrl(metadata.title), "primary"),
        button("重试", "secondary", () => searchAndRender(app.runId, metadata, app.record || {}))
      ],
      metadata
    });
  }

  function renderSearchError(metadata, error) {
    renderCard({
      eyebrow: "B站同源助手",
      title: "B站搜索被拦住了",
      body: error && error.message ? error.message : "可以先用手动搜索打开 B站结果页。",
      status: "warning",
      actions: [
        linkButton("去 B站搜", buildManualSearchUrl(metadata.title), "primary"),
        button("重试", "secondary", () => searchAndRender(app.runId, metadata, app.record || {}))
      ],
      metadata
    });
  }

  function renderError(title, body, metadata) {
    renderCard({
      eyebrow: "B站同源助手",
      title,
      body,
      status: "warning",
      actions: metadata && metadata.title ? [linkButton("手动去 B站搜", buildManualSearchUrl(metadata.title))] : []
    });
  }

  function renderCard(model) {
    if (!ensureHost({ allowFallback: true })) return;
    app.host.replaceChildren();

    const card = div(`ytbili-card ytbili-card-${model.status || "neutral"}`);
    const header = div("ytbili-header");
    const mark = div(`ytbili-status ytbili-status-${model.status || "neutral"}`);
    const intro = div("ytbili-intro");
    const eyebrow = div("ytbili-eyebrow", model.eyebrow);
    const title = div("ytbili-title", model.title);
    const body = div("ytbili-body", model.body);
    const headerActions = div("ytbili-header-actions");
    const close = button("收起", "plain", () => app.host.replaceChildren(renderCollapsed(model)));

    intro.append(eyebrow, title, body);
    header.append(mark, intro);

    if (model.status === "loading") {
      const spinner = div("ytbili-spinner");
      spinner.setAttribute("aria-hidden", "true");
      headerActions.append(spinner);
    }
    headerActions.append(close);
    header.append(headerActions);

    card.append(header);

    if (model.match) {
      card.append(renderMatch(model.match));
    }

    if (model.candidates && model.candidates.length) {
      card.append(renderCandidates(model.metadata, model.candidates));
    }

    if (model.actions && model.actions.length) {
      const actions = div("ytbili-actions");
      actions.append(...model.actions);
      card.append(actions);
    }

    if (model.actionHint) {
      card.append(div("ytbili-action-hint", model.actionHint));
    }

    app.host.append(card);
  }

  function renderCollapsed(model) {
    const pill = div("ytbili-pill");
    const text = div("ytbili-pill-text", model.match ? "B站版本" : "B站助手");
    const reopen = button("展开", "plain", () => renderCard(model));
    pill.append(text, reopen);
    return pill;
  }

  function renderMatch(match) {
    const wrap = div("ytbili-match");
    const thumb = document.createElement("img");
    thumb.className = "ytbili-thumb";
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.referrerPolicy = "no-referrer";
    thumb.src = match.pic || "";

    const content = div("ytbili-match-content");
    const title = div("ytbili-match-title", match.title || "B站视频");
    const meta = div("ytbili-match-meta");
    meta.append(
      span(match.author || "B站 UP主"),
      span(YtBiliMatcher.formatDuration(match.durationSeconds) || match.duration || "时长未知"),
      renderConfidence(match)
    );
    content.append(title, meta);
    wrap.append(thumb, content);
    return wrap;
  }

  function renderCandidates(metadata, candidates) {
    const wrap = document.createElement("details");
    wrap.className = "ytbili-candidates";
    const label = document.createElement("summary");
    label.className = "ytbili-candidates-label";
    label.textContent = `其他 ${candidates.length} 个可能匹配`;
    wrap.append(label);

    for (const candidate of candidates) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ytbili-candidate";
      row.addEventListener("click", () =>
        openBilibili(metadata, candidate, {
          likeFirst: false,
          remember: candidateTier(candidate) !== "related" && candidateTier(candidate) !== "weak"
        })
      );

      const title = div("ytbili-candidate-title", candidate.title);
      const meta = div("ytbili-candidate-meta");
      meta.append(
        span(candidate.author || "B站"),
        span(YtBiliMatcher.formatDuration(candidate.durationSeconds) || candidate.duration || "时长未知"),
        renderConfidence(candidate)
      );
      row.append(title, meta);
      wrap.append(row);
    }

    return wrap;
  }

  function renderConfidence(match) {
    const tier = candidateTier(match);
    const node = document.createElement("span");
    node.className = `ytbili-confidence ytbili-confidence-${tier}`;
    node.setAttribute("aria-label", confidenceLabel(tier));

    const bars = document.createElement("span");
    bars.className = "ytbili-confidence-bars";
    const active = tier === "confirmed" || tier === "strong" || tier === "likely" ? 3 : tier === "related" ? 2 : 1;
    for (let index = 0; index < 3; index += 1) {
      const bar = document.createElement("span");
      bar.className = index < active ? "is-active" : "";
      bars.append(bar);
    }

    const label = document.createElement("span");
    label.className = "ytbili-confidence-label";
    label.textContent = confidenceLabel(tier);
    node.append(bars, label);
    return node;
  }

  function button(label, variant, onClick) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = `ytbili-button ytbili-button-${variant || "secondary"}`;
    node.textContent = label;
    node.addEventListener("click", async (event) => {
      event.preventDefault();
      node.disabled = true;
      try {
        await onClick();
      } finally {
        window.setTimeout(() => {
          node.disabled = false;
        }, 700);
      }
    });
    return node;
  }

  function linkButton(label, url, variant) {
    const node = document.createElement("a");
    node.className = `ytbili-button ytbili-button-${variant || "secondary"}`;
    node.textContent = label;
    node.href = url;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
    node.addEventListener("click", () => pauseCurrentYoutubeVideo());
    return node;
  }

  async function openBilibili(metadata, match, options = {}) {
    pauseCurrentYoutubeVideo();

    if (options.remember !== false) {
      await saveAcceptedMatch(metadata.videoId, match);
    }

    const shouldLike = Boolean(options.likeFirst);
    if (shouldLike) {
      await likeCurrentYoutubeVideo();
      await sleep(250);
    }

    window.open(match.url, "_blank", "noopener,noreferrer");
  }

  function pauseCurrentYoutubeVideo() {
    const video = document.querySelector("video");
    if (!video || video.paused) return false;
    video.pause();
    return true;
  }

  async function likeCurrentYoutubeVideo() {
    const scopes = [
      document.querySelector("ytd-watch-metadata"),
      document.querySelector("#top-level-buttons-computed"),
      document.querySelector("#actions")
    ].filter(Boolean);

    const possibleButtons = scopes.flatMap((scope) =>
      Array.from(
        scope.querySelectorAll(
          "ytd-segmented-like-dislike-button-renderer button, segmented-like-dislike-button-view-model button, like-button-view-model button"
        )
      )
    );
    const likeButton = possibleButtons.find((node) => {
      const label = `${node.getAttribute("aria-label") || ""} ${node.title || ""}`.toLowerCase();
      const isDislike = label.includes("dislike") || label.includes("不喜欢") || label.includes("踩");
      const isLike = label.includes("like") || label.includes("我喜欢") || label.includes("赞");
      return isLike && !isDislike;
    });

    if (!likeButton) return false;
    if (likeButton.getAttribute("aria-pressed") === "true") return true;

    likeButton.click();
    showToast("已尝试为 YouTube 原视频点赞");
    return true;
  }

  function showToast(message) {
    if (!app.host) return;
    const toast = div("ytbili-toast", message);
    app.host.append(toast);
    window.setTimeout(() => toast.remove(), 2200);
  }

  async function getSettings() {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    const stored = data[SETTINGS_KEY] || {};
    return {
      ...DEFAULT_SETTINGS,
      autoSearch: stored.autoSearch ?? DEFAULT_SETTINGS.autoSearch,
      strictness: stored.strictness || DEFAULT_SETTINGS.strictness,
      likeBeforeOpen: Boolean(stored.likeBeforeOpen)
    };
  }

  async function saveSettings(partial) {
    const next = { ...(await getSettings()), ...partial };
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  }

  async function getVideoRecord(videoId) {
    const data = await chrome.storage.local.get(`${VIDEO_PREFIX}${videoId}`);
    return data[`${VIDEO_PREFIX}${videoId}`] || {};
  }

  async function updateVideoRecord(videoId, partial) {
    const key = `${VIDEO_PREFIX}${videoId}`;
    const current = await getVideoRecord(videoId);
    const next = { ...current, ...partial, updatedAt: Date.now() };
    await chrome.storage.local.set({ [key]: next });
    return next;
  }

  async function saveAcceptedMatch(videoId, match) {
    app.record = await updateVideoRecord(videoId, {
      accepted: {
        aid: match.aid,
        bvid: match.bvid,
        title: match.title,
        author: match.author,
        duration: match.duration,
        durationSeconds: match.durationSeconds,
        pic: match.pic,
        url: match.url,
        score: match.score,
        acceptedAt: Date.now()
      }
    });
  }

  function getThresholds() {
    return STRICTNESS[app.settings.strictness] || STRICTNESS.careful;
  }

  function pickDisplayableCandidates(ranked) {
    return (ranked || []).filter(isDisplayableCandidate).slice(0, 5);
  }

  function isDisplayableCandidate(candidate) {
    const thresholds = getThresholds();
    if (!candidate) return false;
    if (candidate.score >= thresholds.related) return true;

    const parts = candidate.scoreParts || {};
    const strongSourceClue = parts.author >= 0.65 || parts.duration >= 0.86;
    const meaningfulTitle = parts.title >= 0.16;
    const sameSeries = parts.episode && parts.episode.sameSeries;
    const highSearchRank = Number(candidate.searchRank || 0) > 0 && Number(candidate.searchRank) <= 3;
    const visibleBiliHit = highSearchRank && parts.title >= 0.1 && candidate.score >= 0.18;

    return Boolean(
      visibleBiliHit ||
        (meaningfulTitle && strongSourceClue && candidate.score >= 0.24) ||
        (sameSeries && candidate.score >= 0.22)
    );
  }

  function candidateTier(candidate, thresholds = getThresholds()) {
    if (!candidate) return "weak";
    if (candidate.score >= thresholds.confident) return "strong";
    if (candidate.score >= thresholds.possible) return "likely";
    if (isDisplayableCandidate(candidate)) return "related";
    return "weak";
  }

  function confidenceLabel(tier) {
    if (tier === "confirmed" || tier === "strong" || tier === "likely") return "很像同一个";
    if (tier === "related") return "可能相关";
    return "线索较弱";
  }

  function confidenceCopy(tier, candidate) {
    if (tier === "confirmed" || tier === "strong" || tier === "likely") return "标题、时长这些线索都对得上。";
    const episode = candidate?.scoreParts?.episode;
    if (episode?.sameSeries && episode?.mismatch) return "像同一个系列，但集数不完全一致。";
    return "有明显相似线索，建议先点开看一眼。";
  }

  function likeOpenHint() {
    if (app.settings.likeBeforeOpen) {
      return "已开启自动点赞：主按钮会先给当前 YouTube 视频点赞，再打开 B站；想不点赞就点“仅打开”。";
    }
    return "点“点赞打开”会先给当前 YouTube 视频点赞，再打开 B站，让推荐算法知道你喜欢这个题材。";
  }

  function mergeResults(primary, secondary) {
    const merged = new Map();
    for (const item of [...(primary || []), ...(secondary || [])]) {
      if (item && item.bvid && !merged.has(item.bvid)) merged.set(item.bvid, item);
    }
    return Array.from(merged.values());
  }

  function buildManualSearchUrl(title) {
    return `https://search.bilibili.com/all?keyword=${encodeURIComponent(title || "")}`;
  }

  function getCurrentVideoId() {
    if (location.hostname !== "www.youtube.com" && location.hostname !== "youtube.com") return null;
    if (location.pathname !== "/watch") return null;
    return new URLSearchParams(location.search).get("v");
  }

  function isCurrent(runId) {
    return runId === app.runId && app.videoId === getCurrentVideoId();
  }

  function div(className, text) {
    const node = document.createElement("div");
    node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function span(text) {
    const node = document.createElement("span");
    node.textContent = text;
    return node;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
