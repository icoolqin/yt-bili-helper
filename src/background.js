const SEARCH_ENDPOINT = "https://api.bilibili.com/x/web-interface/search/type";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "YTBILI_SEARCH") return false;

  searchBilibili(message.queries || [], message.strategy || "auto", sender.tab)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : "B站搜索暂时不可用"
      });
    });

  return true;
});

async function searchBilibili(queries, strategy, senderTab) {
  const normalizedQueries = Array.from(
    new Set(
      queries
        .map((query) => String(query || "").trim())
        .filter(Boolean)
        .slice(0, 4)
    )
  );

  if (!normalizedQueries.length) return { results: [], source: "empty" };

  const merged = new Map();
  let lastError = null;
  let source = "api";

  if (strategy !== "page") {
    for (const query of normalizedQueries) {
      try {
        const results = await fetchOneQuery(query);
        for (const item of results) {
          if (!merged.has(item.bvid)) merged.set(item.bvid, item);
        }
        if (merged.size >= 20) break;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (strategy === "page" || (!merged.size && lastError)) {
    source = "page";
    for (const query of normalizedQueries) {
      try {
        const pageResults = await searchViaBilibiliPage(query, senderTab);
        for (const item of pageResults) {
          if (!merged.has(item.bvid)) merged.set(item.bvid, item);
        }
        if (merged.size >= 20) break;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!merged.size && lastError) throw lastError;
  return { results: Array.from(merged.values()).slice(0, 24), source };
}

async function fetchOneQuery(query) {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("search_type", "video");
  url.searchParams.set("keyword", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "20");
  url.searchParams.set("order", "totalrank");
  url.searchParams.set("duration", "0");
  url.searchParams.set("tids", "0");

  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    referrer: "https://www.bilibili.com/",
    headers: {
      Accept: "application/json, text/plain, */*"
    }
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch (_error) {
    throw new Error("B站返回了验证页面，请用手动搜索打开。");
  }

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || "B站搜索暂时不可用");
  }

  const items = Array.isArray(payload.data && payload.data.result) ? payload.data.result : [];
  return items
    .filter((item) => item && item.type === "video" && item.bvid)
    .map(normalizeBilibiliItem);
}

function normalizeBilibiliItem(item) {
  return {
    aid: item.aid,
    bvid: item.bvid,
    title: stripHtml(item.title),
    author: item.author || "",
    duration: item.duration || "",
    durationSeconds: parseDuration(item.duration),
    play: parseCount(item.play),
    favorites: parseCount(item.favorites),
    like: parseCount(item.like),
    searchRank: Number(item.rank_index || item.rank_offset || 0) || null,
    tag: item.tag || "",
    pubdate: item.pubdate || 0,
    pic: normalizeUrl(item.pic),
    url: `https://www.bilibili.com/video/${item.bvid}/`
  };
}

async function searchViaBilibiliPage(query, senderTab) {
  const url = `https://search.bilibili.com/all?keyword=${encodeURIComponent(query)}`;
  const tab = await createTab({
    url,
    active: false,
    ...(senderTab && senderTab.windowId ? { windowId: senderTab.windowId } : {}),
    ...(senderTab && senderTab.id ? { openerTabId: senderTab.id } : {})
  });

  try {
    await waitForTabLoaded(tab.id, 12000);
    await delay(900);
    const response = await sendMessageWithRetry(tab.id, {
      type: "YTBILI_EXTRACT_SEARCH_RESULTS",
      query
    });

    if (!response || !response.ok) {
      throw new Error((response && response.error) || "B站网页搜索没有返回结果");
    }

    return response.results || [];
  } finally {
    if (tab && tab.id) {
      chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError);
    }
  }
}

function createTab(options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(options, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(tab);
    });
  });
}

function waitForTabLoaded(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => finish(new Error("B站搜索页加载超时")), timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };

    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else resolve();
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab && tab.status === "complete") finish();
    });
  });
}

async function sendMessageWithRetry(tabId, message) {
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await sendTabMessage(tabId, message);
      if (response) return response;
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw lastError || new Error("无法读取 B站搜索页");
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text || text === "--") return 0;
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return 0;
  if (text.includes("亿")) return Math.round(number * 100000000);
  if (text.includes("万")) return Math.round(number * 10000);
  return Math.round(number);
}

function normalizeUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http://")) return url.replace("http://", "https://");
  return url;
}

function parseDuration(value) {
  const parts = String(value || "")
    .trim()
    .split(":")
    .map((part) => Number(part));

  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
