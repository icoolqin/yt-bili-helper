(function initYtBiliMatcher(global) {
  "use strict";

  const NOISE_WORDS = [
    "youtube",
    "bilibili",
    "哔哩哔哩",
    "b站",
    "中字",
    "中文字幕",
    "熟肉",
    "搬运",
    "转载",
    "完整版",
    "高清",
    "1080p",
    "4k"
  ];

  function stripHtml(value) {
    return String(value || "").replace(/<[^>]*>/g, " ");
  }

  function normalizeText(value) {
    let text = stripHtml(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/&quot;|&#34;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\[[^\]]{0,32}\]|\([^)]{0,32}\)|【[^】]{0,32}】|（[^）]{0,32}）/g, " ")
      .replace(/https?:\/\/\S+/g, " ");

    for (const word of NOISE_WORDS) {
      text = text.replace(new RegExp(escapeRegExp(word), "g"), " ");
    }

    return text
      .replace(/[\u200b-\u200f\ufeff]/g, "")
      .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function toBigrams(text) {
    const compact = normalizeText(text).replace(/\s+/g, "");
    if (!compact) return [];
    if (compact.length === 1) return [compact];

    const grams = [];
    for (let index = 0; index < compact.length - 1; index += 1) {
      grams.push(compact.slice(index, index + 2));
    }
    return grams;
  }

  function jaccard(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    if (!setA.size || !setB.size) return 0;

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection += 1;
    }

    const union = setA.size + setB.size - intersection;
    return union ? intersection / union : 0;
  }

  function titleSimilarity(sourceTitle, candidateTitle) {
    const source = normalizeText(sourceTitle);
    const candidate = normalizeText(candidateTitle);
    if (!source || !candidate) return 0;

    const sourceCompact = source.replace(/\s+/g, "");
    const candidateCompact = candidate.replace(/\s+/g, "");
    const containment =
      sourceCompact.includes(candidateCompact) || candidateCompact.includes(sourceCompact)
        ? Math.min(sourceCompact.length, candidateCompact.length) /
          Math.max(sourceCompact.length, candidateCompact.length)
        : 0;
    const series = seriesSimilarity(sourceCompact, candidateCompact);

    return clamp(jaccard(toBigrams(source), toBigrams(candidate)) * 0.66 + containment * 0.2 + series * 0.14, 0, 1);
  }

  function seriesSimilarity(sourceCompact, candidateCompact) {
    const sourceSeries = stripEpisodeSuffix(sourceCompact);
    const candidateSeries = stripEpisodeSuffix(candidateCompact);
    if (!sourceSeries || !candidateSeries) return 0;

    const common = commonPrefixLength(sourceSeries, candidateSeries);
    const base = Math.max(sourceSeries.length, candidateSeries.length);
    if (common < 5 || !base) return 0;
    return common / base;
  }

  function stripEpisodeSuffix(value) {
    return String(value || "")
      .replace(/(?:ep|episode|第)\d{1,4}(?:集|期|话)?[\s\S]*$/i, "")
      .replace(/第[一二三四五六七八九十百千万零〇两]{1,8}(?:集|期|话)[\s\S]*$/i, "");
  }

  function commonPrefixLength(a, b) {
    const limit = Math.min(a.length, b.length);
    let index = 0;
    while (index < limit && a[index] === b[index]) index += 1;
    return index;
  }

  function parseDuration(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
    const text = String(value || "").trim();
    if (!text) return null;

    const parts = text.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) return null;

    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    const rounded = Math.round(seconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function durationScore(sourceSeconds, candidateSeconds) {
    if (!Number.isFinite(sourceSeconds) || sourceSeconds <= 0 || !Number.isFinite(candidateSeconds) || candidateSeconds <= 0) {
      return { score: 0.55, ratio: null, hardMismatch: false };
    }

    const diff = Math.abs(sourceSeconds - candidateSeconds);
    const base = Math.max(sourceSeconds, candidateSeconds);
    const ratio = diff / base;
    const lengthRatio = Math.max(sourceSeconds, candidateSeconds) / Math.max(1, Math.min(sourceSeconds, candidateSeconds));

    if (lengthRatio >= 2.2) return { score: 0.05, ratio, hardMismatch: true };
    if (ratio <= 0.02 || diff <= 4) return { score: 1, ratio, hardMismatch: false };
    if (ratio <= 0.06) return { score: 0.86, ratio, hardMismatch: false };
    if (ratio <= 0.12) return { score: 0.58, ratio, hardMismatch: false };
    if (ratio <= 0.2) return { score: 0.28, ratio, hardMismatch: false };
    return { score: 0.1, ratio, hardMismatch: true };
  }

  function authorScore(channelName, candidate) {
    const source = normalizeText(channelName);
    if (!source) return 0.2;

    const haystack = normalizeText(`${candidate.author || ""} ${candidate.title || ""} ${candidate.tag || ""}`);
    if (!haystack) return 0;
    if (haystack.includes(source.replace(/\s+/g, ""))) return 1;

    return titleSimilarity(source, haystack) >= 0.42 ? 0.65 : 0;
  }

  function popularityScore(candidate) {
    const plays = Number(candidate.play || candidate.view || 0);
    if (!Number.isFinite(plays) || plays <= 0) return 0.25;
    return clamp(Math.log10(plays + 10) / 7, 0.1, 1);
  }

  function candidatePenalty(sourceTitle, candidate) {
    const source = normalizeText(sourceTitle);
    const title = normalizeText(candidate.title || "");
    let penalty = 0;

    const candidateLooksLikeCollection = /合集|全[0-9一二三四五六七八九十百]+集|全集|课程|列表|playlist/i.test(title);
    const sourceLooksLikeCollection = /合集|全[0-9一二三四五六七八九十百]+集|全集|课程|列表|playlist/i.test(source);
    if (candidateLooksLikeCollection && !sourceLooksLikeCollection) penalty += 0.22;

    const candidateLooksLikeClip = /切片|片段|reaction|解说|二创/i.test(title);
    const sourceLooksLikeClip = /切片|片段|reaction|解说|二创/i.test(source);
    if (candidateLooksLikeClip && !sourceLooksLikeClip) penalty += 0.1;

    return penalty;
  }

  function scoreCandidate(source, candidate) {
    const sourceDuration = parseDuration(source.durationSeconds);
    const candidateDuration = parseDuration(candidate.durationSeconds || candidate.duration);
    const title = titleSimilarity(source.title, candidate.title);
    const duration = durationScore(sourceDuration, candidateDuration);
    const author = authorScore(source.channelName, candidate);
    const popularity = popularityScore(candidate);
    const penalty = candidatePenalty(source.title, candidate);
    const episode = episodeRelation(source.title, candidate.title);

    let score = title * 0.66 + duration.score * 0.24 + author * 0.05 + popularity * 0.05 - penalty;
    if (episode.sameSeries && episode.mismatch) score -= 0.08;
    if (duration.hardMismatch && title < 0.9) score = Math.min(score, 0.5);
    if (title < 0.32) score = Math.min(score, 0.46);

    return {
      ...candidate,
      score: clamp(score, 0, 1),
      scoreParts: {
        title,
        duration: duration.score,
        author,
        popularity,
        penalty,
        durationRatio: duration.ratio,
        episode
      }
    };
  }

  function episodeRelation(sourceTitle, candidateTitle) {
    const source = normalizeText(sourceTitle).replace(/\s+/g, "");
    const candidate = normalizeText(candidateTitle).replace(/\s+/g, "");
    const sourceEpisode = extractEpisodeNumber(source);
    const candidateEpisode = extractEpisodeNumber(candidate);
    const sourceSeries = stripEpisodeSuffix(source);
    const candidateSeries = stripEpisodeSuffix(candidate);
    const sameSeries =
      sourceSeries &&
      candidateSeries &&
      commonPrefixLength(sourceSeries, candidateSeries) >= Math.min(8, Math.min(sourceSeries.length, candidateSeries.length));

    return {
      sourceEpisode,
      candidateEpisode,
      sameSeries,
      mismatch:
        Number.isFinite(sourceEpisode) &&
        Number.isFinite(candidateEpisode) &&
        sourceEpisode !== candidateEpisode
    };
  }

  function extractEpisodeNumber(value) {
    const text = String(value || "");
    const numeric = text.match(/(?:ep|episode|第)(\d{1,4})(?:集|期|话)?/i);
    if (numeric) return Number(numeric[1]);
    const chinese = text.match(/第([一二三四五六七八九十百千万零〇两]{1,8})(?:集|期|话)/);
    if (chinese) return chineseNumber(chinese[1]);
    return null;
  }

  function chineseNumber(value) {
    const digits = {
      零: 0,
      "〇": 0,
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9
    };
    const text = String(value || "");
    if (text.length === 1 && Object.prototype.hasOwnProperty.call(digits, text)) return digits[text];
    const tenIndex = text.indexOf("十");
    if (tenIndex >= 0) {
      const tensText = text.slice(0, tenIndex);
      const onesText = text.slice(tenIndex + 1);
      const tens = tensText ? digits[tensText] || 0 : 1;
      const ones = onesText ? digits[onesText] || 0 : 0;
      return tens * 10 + ones;
    }
    return null;
  }

  function rankCandidates(source, candidates, rejectedBvids) {
    const rejected = new Set(rejectedBvids || []);
    return (candidates || [])
      .filter((candidate) => candidate && candidate.bvid && !rejected.has(candidate.bvid))
      .map((candidate) => scoreCandidate(source, candidate))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }

  function buildSearchQueries(title) {
    const original = stripHtml(title).normalize("NFKC").replace(/\s+/g, " ").trim();
    const normalized = normalizeText(title);
    const withoutBrackets = stripHtml(title)
      .normalize("NFKC")
      .replace(/\[[^\]]{0,32}\]|\([^)]{0,32}\)|【[^】]{0,32}】|（[^）]{0,32}）/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const beforeSeparator = withoutBrackets.split(/\s[-|｜:：]\s|[|｜]/)[0]?.trim();
    const seriesQuery = stripEpisodeSuffix(beforeSeparator || withoutBrackets)
      .replace(/\s+/g, " ")
      .trim();

    const queries = [original, seriesQuery, withoutBrackets, normalized, beforeSeparator]
      .filter(Boolean)
      .map((query) => query.slice(0, 80));

    return Array.from(new Set(queries)).slice(0, 4);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  global.YtBiliMatcher = {
    buildSearchQueries,
    formatDuration,
    normalizeText,
    parseDuration,
    rankCandidates,
    scoreCandidate,
    stripHtml,
    titleSimilarity
  };
})(globalThis);
