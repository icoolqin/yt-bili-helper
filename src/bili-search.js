(function initBiliSearchExtractor() {
  "use strict";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "YTBILI_EXTRACT_SEARCH_RESULTS") return false;

    waitForResults()
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : "读取 B站搜索页失败"
        });
      });

    return true;
  });

  async function waitForResults() {
    const started = Date.now();
    while (Date.now() - started < 9000) {
      const results = extractResults();
      if (results.length) return results;
      await sleep(450);
    }

    if (/验证码|risk-captcha|访问异常/.test(document.body?.innerText || document.title)) {
      throw new Error("B站搜索页触发了验证码");
    }

    return [];
  }

  function extractResults() {
    const byBvid = new Map();

    for (const anchor of document.querySelectorAll('a[href*="/video/BV"]')) {
      const bvid = extractBvid(anchor.href);
      if (!bvid || byBvid.has(bvid)) continue;

      const card = findCard(anchor);
      const title = readTitle(anchor, card);
      if (!title || title.length < 2) continue;

      byBvid.set(bvid, {
        bvid,
        title,
        author: readAuthor(card),
        duration: readDuration(card),
        durationSeconds: parseDuration(readDuration(card)),
        play: readPlay(card),
        pic: readImage(card),
        searchRank: byBvid.size + 1,
        url: `https://www.bilibili.com/video/${bvid}/`
      });
    }

    return Array.from(byBvid.values()).slice(0, 20);
  }

  function findCard(anchor) {
    return (
      anchor.closest(".bili-video-card") ||
      anchor.closest("[class*='video-card']") ||
      anchor.closest(".video-list-item") ||
      anchor.closest(".video-item") ||
      anchor.closest(".search-card") ||
      anchor.closest("[class*='result']") ||
      anchor.closest("li") ||
      anchor.parentElement
    );
  }

  function readTitle(anchor, card) {
    const titleNode =
      card?.querySelector(".bili-video-card__info--tit") ||
      card?.querySelector("h3") ||
      card?.querySelector("[class*='title']") ||
      card?.querySelector("[class*='tit']") ||
      card?.querySelector("[title]") ||
      anchor;

    return cleanText(
      anchor.getAttribute("title") ||
        titleNode?.getAttribute("title") ||
        titleNode?.textContent ||
        anchor.textContent
    );
  }

  function readAuthor(card) {
    const node =
      card?.querySelector("[class*='up-name']") ||
      card?.querySelector("[class*='author']") ||
      card?.querySelector("[class*='name']");
    const text = cleanText(node?.textContent || "");
    if (text) return text.replace(/^UP主[:：]?\s*/, "");

    const lines = cleanText(card?.textContent || "")
      .split(/\s+/)
      .filter(Boolean);
    const upIndex = lines.findIndex((line) => /^UP$|^UP主$/.test(line));
    return upIndex >= 0 && lines[upIndex + 1] ? lines[upIndex + 1] : "";
  }

  function readDuration(card) {
    const text = card?.textContent || "";
    const match = text.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/);
    return match ? match[0] : "";
  }

  function readPlay(card) {
    const text = cleanText(card?.textContent || "");
    const match = text.match(/(\d+(?:\.\d+)?\s*[万亿]?)(?:\s*播放|\s*观看|$)/);
    return match ? parseCount(match[1]) : 0;
  }

  function readImage(card) {
    const img = card?.querySelector("img");
    const url =
      img?.currentSrc ||
      img?.src ||
      img?.getAttribute("data-src") ||
      img?.getAttribute("data-original") ||
      "";
    return normalizeUrl(url);
  }

  function extractBvid(url) {
    const match = String(url || "").match(/\/video\/(BV[a-zA-Z0-9]+)/);
    return match ? match[1] : "";
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u200b/g, "")
      .replace(/\s+/g, " ")
      .trim();
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

  function parseCount(value) {
    const text = String(value || "").replace(/,/g, "").trim();
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

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
