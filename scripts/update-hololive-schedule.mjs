import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const SOURCE_URL = "https://schedule.hololive.tv/lives/all";
const SOURCE_TIMEZONE = "Asia/Tokyo";
const SOURCE_REFRESH_MINUTES = 15;
const COLLECTOR_VERSION = "1.0.0";
const REQUEST_TIMEOUT_MS = 20_000;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputPath = resolve(projectRoot, "public", "data", "schedule.json");

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  const candidate = normalizeText(value);

  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate, SOURCE_URL).toString();
  } catch {
    return null;
  }
}

function parseYouTubeUrl(value) {
  const normalizedUrl = normalizeUrl(value);

  if (!normalizedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = null;

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com"
    ) {
      if (parsedUrl.pathname === "/watch") {
        videoId = parsedUrl.searchParams.get("v");
      } else {
        const pathMatch = parsedUrl.pathname.match(
          /^\/(?:live|shorts|embed)\/([^/?#]+)/,
        );
        videoId = pathMatch?.[1] ?? null;
      }
    } else if (hostname === "youtu.be") {
      videoId = parsedUrl.pathname.split("/").filter(Boolean)[0] ?? null;
    } else {
      return null;
    }

    if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
      return null;
    }

    return {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
    };
  } catch {
    return null;
  }
}

function currentTokyoDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SOURCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function inferIsoDate(dateLabel, now = new Date()) {
  const match = normalizeText(dateLabel).match(/(\d{1,2})\s*\/\s*(\d{1,2})/);

  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const today = currentTokyoDateParts(now);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const candidates = [today.year - 1, today.year, today.year + 1]
    .map((year) => {
      const candidateUtc = Date.UTC(year, month - 1, day);
      const candidate = new Date(candidateUtc);
      const isValid =
        candidate.getUTCFullYear() === year &&
        candidate.getUTCMonth() === month - 1 &&
        candidate.getUTCDate() === day;

      return isValid
        ? {
            year,
            distance: Math.abs(candidateUtc - todayUtc),
          }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.distance - right.distance);

  if (candidates.length === 0) {
    return null;
  }

  const year = String(candidates[0].year).padStart(4, "0");
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTime(value) {
  const match = normalizeText(value).match(
    /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/,
  );

  if (!match) {
    return null;
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function imageUrl($card, matcher) {
  let found = null;
  const $images = $card.find("img");

  $images.each((index) => {
    if (found) {
      return;
    }

    const $image = $images.eq(index);
    const candidates = [
      $image.attr("src"),
      $image.attr("data-src"),
      $image.attr("data-original"),
    ];

    for (const candidate of candidates) {
      const normalized = normalizeUrl(candidate);

      if (normalized && matcher.test(normalized)) {
        found = normalized;
        return;
      }
    }
  });

  return found;
}

function hasLiveBorder($card) {
  const nodesToInspect = [$card, $card.parent()];

  return nodesToInspect.some(($node) => {
    const style = normalizeText($node.attr("style")).toLowerCase();
    const className = normalizeText($node.attr("class")).toLowerCase();
    const liveAttribute = normalizeText(
      $node.attr("data-live") ?? $node.attr("aria-current"),
    ).toLowerCase();
    const red =
      "(?:red|#f00(?:000)?|#ff0000|#e60012|rgb\\(\\s*255\\s*,\\s*0\\s*,\\s*0\\s*\\))";

    return (
      new RegExp(`border(?:-color)?\\s*:[^;]*${red}`, "i").test(style) ||
      /(?:^|\s)(?:is-)?live(?:\s|$)/i.test(className) ||
      liveAttribute === "true" ||
      liveAttribute === "live"
    );
  });
}

function parseSchedule(html, now = new Date()) {
  const $ = cheerio.load(html);
  const entries = [];
  const seenVideoIds = new Set();
  let currentDateLabel = null;
  let currentIsoDate = null;

  $(".tab-pane.show.active > .container").each((_, container) => {
    const $container = $(container);
    const nextDateLabel = normalizeText(
      $container.find(".holodule.navbar-text").first().text(),
    );

    if (nextDateLabel) {
      currentDateLabel = nextDateLabel;
      currentIsoDate = inferIsoDate(nextDateLabel, now);
    }

    $container.find("a.thumbnail").each((__, card) => {
      const $card = $(card);
      const youtube = parseYouTubeUrl($card.attr("href"));

      if (!youtube || seenVideoIds.has(youtube.videoId)) {
        return;
      }

      const name = normalizeText($card.find(".name").first().text());
      const rawTime = normalizeText($card.find(".datetime").first().text());
      const time = parseTime(rawTime);
      const thumbnail =
        imageUrl($card, /(?:^|\.)img\.youtube\.com\/vi\//i) ??
        `https://img.youtube.com/vi/${youtube.videoId}/mqdefault.jpg`;
      const avatar = imageUrl($card, /(?:^|\.)yt3(?:\.ggpht)?\.com\//i);
      const imageAlt = normalizeText(
        $card.find(`img[src*="${youtube.videoId}"]`).first().attr("alt"),
      );
      const title = normalizeText($card.attr("title")) || imageAlt || null;

      seenVideoIds.add(youtube.videoId);
      entries.push({
        id: youtube.videoId,
        date: currentIsoDate,
        dateLabel: currentDateLabel,
        time,
        startsAt:
          currentIsoDate && time ? `${currentIsoDate}T${time}:00+09:00` : null,
        name,
        title,
        url: youtube.url,
        videoId: youtube.videoId,
        thumbnail,
        avatar,
        isLive: hasLiveBorder($card),
      });
    });
  });

  return entries.sort((left, right) => {
    if (left.startsAt && right.startsAt) {
      const startComparison = left.startsAt.localeCompare(right.startsAt);
      return startComparison || left.name.localeCompare(right.name, "ko");
    }

    if (left.startsAt) {
      return -1;
    }

    if (right.startsAt) {
      return 1;
    }

    return left.name.localeCompare(right.name, "ko");
  });
}

async function fetchSource() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "hololive-schedule-pages/1.0 (+https://github.com/prayzero/hololive-schedule)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Holodule responded with ${response.status} ${response.statusText}`,
      );
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function writeAtomically(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function main() {
  const collectedAt = new Date();
  const html = await fetchSource();
  const entries = parseSchedule(html, collectedAt);

  if (entries.length === 0) {
    throw new Error(
      "No Holodule entries were parsed; the existing schedule file was left unchanged.",
    );
  }

  const payload = {
    generatedAt: collectedAt.toISOString(),
    source: SOURCE_URL,
    sourceRefreshMinutes: SOURCE_REFRESH_MINUTES,
    collectorVersion: COLLECTOR_VERSION,
    timezone: SOURCE_TIMEZONE,
    entries,
  };

  await writeAtomically(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `Collected ${entries.length} Holodule entries into ${outputPath}`,
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`Schedule update failed. ${message}`);
  process.exitCode = 1;
});
