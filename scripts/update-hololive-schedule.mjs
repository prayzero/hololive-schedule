import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { fetchTextWithPolicy } from "./lib/safe-fetch.mjs";
import {
  readJsonFileStrict,
  resolveContainedPath,
  validateExternalArchiveRoot,
  writeFileAtomically,
} from "./lib/secure-io.mjs";

const SOURCE_ROOT = "https://schedule.hololive.tv";
const SOURCE_FEEDS = [
  { branch: "JP", url: `${SOURCE_ROOT}/lives/hololive` },
  { branch: "ID", url: `${SOURCE_ROOT}/lives/indonesia` },
  { branch: "EN", url: `${SOURCE_ROOT}/lives/english` },
  { branch: "DEV_IS", url: `${SOURCE_ROOT}/lives/dev_is` },
];
const SOURCE_TIMEZONE = "Asia/Tokyo";
const SOURCE_REFRESH_MINUTES = 15;
const COLLECTOR_VERSION = "3.0.0";
const REQUEST_TIMEOUT_MS = 20_000;
const ARCHIVE_FILE_PATTERN = /^\d{4}-\d{2}\.json$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAXIMUM_ARCHIVE_MONTHS = 120;
const MAXIMUM_ARCHIVE_FILE_BYTES = 2 * 1024 * 1024;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const publicDataDirectory = resolve(projectRoot, "public", "data");
const outputPath = resolve(publicDataDirectory, "schedule.json");
const publicIndexPath = resolve(publicDataDirectory, "schedule-index.json");
const publicArchiveDirectory = resolve(
  publicDataDirectory,
  "schedule-archive",
);
const durableDataDirectory = process.env.SCHEDULE_ARCHIVE_ROOT
  ? validateExternalArchiveRoot(process.env.SCHEDULE_ARCHIVE_ROOT, {
      workspaceRoot: projectRoot,
      label: "SCHEDULE_ARCHIVE_ROOT",
    })
  : publicDataDirectory;
const durableIndexPath = resolveContainedPath(
  durableDataDirectory,
  "schedule-index.json",
);
const durableArchiveDirectory = resolveContainedPath(
  durableDataDirectory,
  "schedule-archive",
);

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
    return new URL(candidate, SOURCE_ROOT).toString();
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

function parseSchedule(html, branch, now = new Date()) {
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
        branch,
      });
    });
  });

  return sortEntries(entries);
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
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

    return (
      String(left.date ?? "").localeCompare(String(right.date ?? "")) ||
      left.name.localeCompare(right.name, "ko")
    );
  });
}

function mergeEntry(previous, incoming, isLive = false) {
  const value = (key, fallback = null) => {
    const candidate = incoming?.[key];
    return candidate === null ||
      candidate === undefined ||
      (typeof candidate === "string" && candidate.trim() === "")
      ? previous?.[key] ?? fallback
      : candidate;
  };
  const videoId = value("videoId", value("id"));

  return {
    id: videoId,
    date: value("date"),
    dateLabel: value("dateLabel"),
    time: value("time"),
    startsAt: value("startsAt"),
    name: value("name", ""),
    title: value("title"),
    url: value(
      "url",
      videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
    ),
    videoId,
    thumbnail: value("thumbnail"),
    avatar: value("avatar"),
    isLive,
    branch: value("branch"),
  };
}

function validIsoDate(value) {
  const dateText = String(value ?? "");

  if (!ISO_DATE_PATTERN.test(dateText)) {
    return false;
  }

  const [year, month, day] = dateText.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function validateEntries(entries, label) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`${label} contains no schedule entries.`);
  }

  const seenVideoIds = new Set();

  for (const entry of entries) {
    if (
      !entry ||
      !/^[A-Za-z0-9_-]{6,20}$/.test(String(entry.videoId ?? "")) ||
      seenVideoIds.has(entry.videoId)
    ) {
      throw new Error(`${label} contains an invalid or duplicate videoId.`);
    }

    if (!validIsoDate(entry.date)) {
      throw new Error(
        `${label} contains an invalid date for ${entry.videoId}.`,
      );
    }

    seenVideoIds.add(entry.videoId);
  }
}

async function fetchSource(feed) {
  const response = await fetchTextWithPolicy(
    feed.url,
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.8",
        "User-Agent":
          "hololive-schedule-pages/1.0 (+https://github.com/prayzero/hololive-schedule)",
      },
    },
    {
      allowedOrigins: [SOURCE_ROOT],
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: 5 * 1024 * 1024,
      maxRedirects: 2,
    },
  );
  return response.text;
}

async function readJson(path) {
  return readJsonFileStrict(path, {
    allowMissing: true,
    missingValue: null,
    label: `schedule archive ${path}`,
    maxBytes: MAXIMUM_ARCHIVE_FILE_BYTES,
  });
}

async function listArchiveFiles(directory) {
  try {
    const paths = (await readdir(directory, { withFileTypes: true }))
      .filter(
        (entry) => entry.isFile() && ARCHIVE_FILE_PATTERN.test(entry.name),
      )
      .map((entry) => resolve(directory, entry.name))
      .sort();
    if (paths.length > MAXIMUM_ARCHIVE_MONTHS) {
      throw new Error(
        `Schedule archive exceeds the ${MAXIMUM_ARCHIVE_MONTHS}-month safety limit.`,
      );
    }
    return paths;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function loadArchive() {
  const archiveEntries = new Map();
  const knownMonths = new Set();
  const durableMonthPayloads = new Map();
  const durableFiles = await listArchiveFiles(durableArchiveDirectory);
  const isBootstrap = durableFiles.length === 0;
  const archiveSources = isBootstrap
    ? [
        {
          paths: await listArchiveFiles(publicArchiveDirectory),
          rememberPayload:
            publicArchiveDirectory === durableArchiveDirectory,
        },
      ]
    : [
        {
          paths: durableFiles,
          rememberPayload: true,
        },
      ];

  for (const source of archiveSources) {
    for (const path of source.paths) {
      const payload = await readJson(path);
      const month = path.slice(-12, -5);

      if (!payload || !Array.isArray(payload.entries)) {
        throw new Error(`Archive file ${path} has an invalid payload.`);
      }

      knownMonths.add(month);
      if (source.rememberPayload) {
        durableMonthPayloads.set(month, payload);
      }

      for (const entry of payload.entries) {
        if (!entry?.videoId) {
          throw new Error(`Archive file ${path} contains a missing videoId.`);
        }

        archiveEntries.set(
          entry.videoId,
          mergeEntry(archiveEntries.get(entry.videoId), entry, false),
        );
      }
    }
  }

  const seedPayload = isBootstrap ? await readJson(outputPath) : null;

  if (seedPayload?.entries) {
    for (const entry of seedPayload.entries) {
      if (!entry?.videoId) {
        throw new Error(
          `Bootstrap schedule ${outputPath} contains a missing videoId.`,
        );
      }

      archiveEntries.set(
        entry.videoId,
        mergeEntry(archiveEntries.get(entry.videoId), entry, false),
      );
      if (validIsoDate(entry.date)) {
        knownMonths.add(entry.date.slice(0, 7));
      }
    }
  }

  return {
    archiveEntries,
    durableMonthPayloads,
    knownMonths,
    durableIndex: await readJson(durableIndexPath),
  };
}

async function writeJsonCopies(paths, payload) {
  const uniquePaths = [...new Set(paths)];
  const contents = `${JSON.stringify(payload, null, 2)}\n`;

  for (const path of uniquePaths) {
    await writeFileAtomically(path, contents);
  }
}

function monthGroups(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const monthEntries = grouped.get(month) ?? [];
    monthEntries.push(entry);
    grouped.set(month, monthEntries);
  }

  for (const [month, monthEntries] of grouped) {
    grouped.set(month, sortEntries(monthEntries));
  }

  return grouped;
}

function payloadCoreMatches(previous, entries) {
  if (!previous || !Array.isArray(previous.entries)) {
    return false;
  }

  return (
    JSON.stringify(previous.entries.map((entry) => mergeEntry(null, entry))) ===
    JSON.stringify(entries)
  );
}

function indexCore(payload) {
  return {
    timezone: payload?.timezone,
    totalEntries: payload?.totalEntries,
    dates: payload?.dates,
    months: payload?.months,
  };
}

async function main() {
  const collectedAt = new Date();
  const pages = await Promise.all(
    SOURCE_FEEDS.map(async (feed) => ({
      feed,
      html: await fetchSource(feed),
    })),
  );
  const seenVideoIds = new Set();
  const currentRawEntries = sortEntries(
    pages
      .flatMap(({ feed, html }) =>
        parseSchedule(html, feed.branch, collectedAt),
      )
      .filter((entry) => {
        if (seenVideoIds.has(entry.videoId)) {
          return false;
        }

        seenVideoIds.add(entry.videoId);
        return true;
      }),
  );

  validateEntries(currentRawEntries, "Current Holodule snapshot");

  const {
    archiveEntries,
    durableMonthPayloads,
    knownMonths,
    durableIndex,
  } = await loadArchive();
  const previousIds = new Set(archiveEntries.keys());
  const currentEntries = currentRawEntries.map((entry) =>
    mergeEntry(archiveEntries.get(entry.videoId), entry, entry.isLive),
  );

  for (const entry of currentEntries) {
    archiveEntries.set(
      entry.videoId,
      mergeEntry(archiveEntries.get(entry.videoId), entry, false),
    );
  }

  const allEntries = sortEntries([...archiveEntries.values()]);
  validateEntries(allEntries, "Cumulative Holodule archive");
  const grouped = monthGroups(allEntries);

  for (const month of grouped.keys()) {
    knownMonths.add(month);
  }

  for (const month of [...knownMonths].sort()) {
    const entries = grouped.get(month) ?? [];
    const previous = durableMonthPayloads.get(month);
    const generatedAt = payloadCoreMatches(previous, entries)
      ? previous.generatedAt
      : collectedAt.toISOString();
    const payload = {
      generatedAt,
      source: SOURCE_FEEDS[0].url,
      sources: SOURCE_FEEDS.map(({ url }) => url),
      sourceRefreshMinutes: SOURCE_REFRESH_MINUTES,
      collectorVersion: COLLECTOR_VERSION,
      timezone: SOURCE_TIMEZONE,
      month,
      entries,
    };

    await writeJsonCopies(
      [
        resolve(durableArchiveDirectory, `${month}.json`),
        resolve(publicArchiveDirectory, `${month}.json`),
      ],
      payload,
    );
  }

  const dateCounts = new Map();

  for (const entry of allEntries) {
    dateCounts.set(entry.date, (dateCounts.get(entry.date) ?? 0) + 1);
  }

  const dates = [...dateCounts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({
      date,
      month: date.slice(0, 7),
      count,
    }));
  const months = [...grouped]
    .filter(([, entries]) => entries.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, entries]) => ({
      month,
      count: entries.length,
      firstDate: entries[0].date,
      lastDate: entries.at(-1).date,
      url: `data/schedule-archive/${month}.json`,
    }));
  const nextIndexCore = {
    timezone: SOURCE_TIMEZONE,
    totalEntries: allEntries.length,
    dates,
    months,
  };
  const updatedAt =
    JSON.stringify(indexCore(durableIndex)) === JSON.stringify(nextIndexCore)
      ? durableIndex.updatedAt
      : collectedAt.toISOString();
  const indexPayload = {
    updatedAt: updatedAt ?? collectedAt.toISOString(),
    ...nextIndexCore,
  };

  await writeJsonCopies(
    [durableIndexPath, publicIndexPath],
    indexPayload,
  );

  const currentPayload = {
    generatedAt: collectedAt.toISOString(),
    source: SOURCE_FEEDS[0].url,
    sources: SOURCE_FEEDS.map(({ url }) => url),
    sourceRefreshMinutes: SOURCE_REFRESH_MINUTES,
    collectorVersion: COLLECTOR_VERSION,
    timezone: SOURCE_TIMEZONE,
    entries: sortEntries(currentEntries),
  };

  await writeFileAtomically(
    outputPath,
    `${JSON.stringify(currentPayload, null, 2)}\n`,
  );

  const newEntryCount = allEntries.filter(
    (entry) => !previousIds.has(entry.videoId),
  ).length;
  console.log(
    `Collected ${currentEntries.length} current entries; archive now has ${allEntries.length} entries across ${months.length} month(s), including ${newEntryCount} new video(s).`,
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`Schedule update failed. ${message}`);
  process.exitCode = 1;
});
