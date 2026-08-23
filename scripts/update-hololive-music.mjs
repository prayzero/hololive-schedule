import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import {
  fetchJsonWithPolicy,
  fetchTextWithPolicy,
} from "./lib/safe-fetch.mjs";
import {
  readJsonFileStrict,
  writeFileAtomically,
} from "./lib/secure-io.mjs";
import { approvedMusicHttpsUrl } from "./lib/music-url-policy.mjs";

const ORIGINAL_SONGS_URL =
  "https://docs.google.com/spreadsheets/d/1NYZza5QTN4ZIyot6XWvD8VwROL1R0EptlkJttySZ4Ew/export?format=csv&gid=387240143";
const ORIGINAL_SONGS_SOURCE_URL =
  "https://docs.google.com/spreadsheets/d/1NYZza5QTN4ZIyot6XWvD8VwROL1R0EptlkJttySZ4Ew/edit#gid=387240143";
const COVER_SONGS_URL =
  "https://docs.google.com/spreadsheets/d/1aivH92zPSn1sdjmYdw1gq7K7_f8pglZSVXuG-JpLTeo/export?format=csv&gid=1378277195";
const COVER_SONGS_SOURCE_URL =
  "https://docs.google.com/spreadsheets/d/1aivH92zPSn1sdjmYdw1gq7K7_f8pglZSVXuG-JpLTeo/edit#gid=1378277195";
const OFFICIAL_MUSIC_URL =
  "https://hololive.hololivepro.com/en/music/";
const OFFICIAL_PROFILE_ORIGIN = "https://hololive.hololivepro.com";
const YOUTUBE_ROOT = "https://www.youtube.com";
const REQUEST_TIMEOUT_MS = 30_000;
const PROFILE_CONCURRENCY = 8;
const VIDEO_CONCURRENCY = 8;
const LINK_LABELS = {
  youtube: "YouTube",
  streaming: "스트리밍",
  music: "음원",
  album: "앨범",
  other: "링크",
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const talentsPath = resolve(projectRoot, "public", "data", "talents.json");
const outputPath = resolve(projectRoot, "public", "data", "music.json");

const COHORT_ORDER = new Map([
  ["JP:0기생", 0],
  ["JP:1기생", 1],
  ["JP:1기생 · GAMERS", 1],
  ["JP:2기생", 2],
  ["JP:GAMERS", 3],
  ["JP:3기생", 4],
  ["JP:4기생", 5],
  ["JP:5기생", 6],
  ["JP:holoX", 7],
  ["DEV_IS:ReGLOSS", 0],
  ["DEV_IS:FLOW GLOW", 1],
  ["EN:Myth", 0],
  ["EN:Promise", 1],
  ["EN:Advent", 2],
  ["EN:Justice", 3],
  ["ID:ID 1기생", 0],
  ["ID:ID 2기생", 1],
  ["ID:ID 3기생", 2],
]);
const VERIFIED_DEBUT_DATE_FALLBACKS = new Map([
  // COVER's official debut announcement: https://cover-corp.com/news/detail/20181115
  ["azki", "2018-11-15"],
  // These three dates are also published as "Debut date" on the official profiles.
  ["kureiji-ollie", "2020-12-04"],
  ["anya-melfissa", "2020-12-05"],
  ["pavolia-reine", "2020-12-06"],
]);
const VERIFIED_ORIGINAL_DURATION_FALLBACKS = new Map([
  // Tokyo Xtreme Racer ORIGINAL SOUNDTRACK, disc 2 track 21 (4:13).
  // The linked YouTube video is longer than the released audio track.
  // https://gameost.net/tokyo-xtreme-racer-original-soundtrack/
  ["rindo-chihaya:beatyourself:2026-02-25", 253],
]);
const KNOWN_COVER_EQUIVALENT_VIDEO_GROUPS = [
  // The same AmaLee × Mori Calliope × Bao recording was published
  // on the collaborators' channels and again as an official audio upload.
  ["rS8dhda9kIE", "OUwc0JnEJvM", "LzzktEXaspI"],
];
const OFFICIAL_PROFILE_SLUG_OVERRIDES = new Map([
  ["robocosan", "roboco-san"],
  ["sakura-miko", "sakuramiko"],
]);

const talentPayload = JSON.parse(await readFile(talentsPath, "utf8"));
const previousMusicPayload = await readJsonFileStrict(outputPath, {
  allowMissing: true,
  missingValue: { tracks: [] },
  label: "existing public music data",
});
if (
  !previousMusicPayload ||
  typeof previousMusicPayload !== "object" ||
  !Array.isArray(previousMusicPayload.tracks)
) {
  throw new Error("Existing public music data must contain a tracks array.");
}
const previousDebutDates = new Map(
  (previousMusicPayload.members ?? [])
    .filter((member) => member.talentId && member.debutDate)
    .map((member) => [member.talentId, member.debutDate]),
);
const talents = talentPayload.talents.filter(
  (talent) => talent.status === "active" || talent.status === "affiliate",
);
const officialProfileRequestUrls = new Map(
  talents.map((talent) => [
    requiredTalentId(talent.id),
    officialTalentProfileRequestUrl(talent),
  ]),
);

if (talents.length !== 65) {
  throw new Error(
    `Expected 65 active/affiliate talents, but talents.json contains ${talents.length}.`,
  );
}

const [originalCsv, coverCsv] = await Promise.all([
  fetchText(ORIGINAL_SONGS_URL),
  fetchText(COVER_SONGS_URL),
]);
const originalRows = csvRecords(originalCsv);
const coverRows = csvRecords(coverCsv);
const talentMatchers = createTalentMatchers(talents);

console.log(`Loaded ${originalRows.length} original-song rows.`);
console.log(`Loaded ${coverRows.length} cover-song rows.`);
console.log(`Collecting official debut dates for ${talents.length} talents...`);

const debutDates = await mapWithConcurrency(
  talents,
  PROFILE_CONCURRENCY,
  async (talent) => {
    try {
      const html = await retry(
        () => fetchText(officialProfileRequestUrls.get(talent.id)),
        2,
      );
      return (
        extractDebutDate(html) ??
        VERIFIED_DEBUT_DATE_FALLBACKS.get(talent.id) ??
        previousDebutDates.get(talent.id) ??
        null
      );
    } catch (error) {
      console.warn(
        `Debut date request failed for ${talent.id}: ${errorMessage(error)}`,
      );
      return (
        VERIFIED_DEBUT_DATE_FALLBACKS.get(talent.id) ??
        previousDebutDates.get(talent.id) ??
        null
      );
    }
  },
);

const members = createMusicMembers(talents, debutDates);
const missingDebuts = members.filter((member) => !member.debutDate);
if (missingDebuts.length > 0) {
  console.warn(
    `Missing debut dates: ${missingDebuts
      .map((member) => member.talentId)
      .join(", ")}`,
  );
}

const originalDrafts = originalRows
  .map((row) => originalTrackFromRow(row, talentMatchers))
  .filter(Boolean);
const coverDrafts = deduplicateCoverTracks(
  coverRows
    .map((row) => coverTrackFromRow(row, talentMatchers))
    .filter(Boolean),
);

const originalVideoIds = Array.from(
  new Set(
    originalDrafts
      .map((track) => track.youtubeVideoId)
      .filter(Boolean),
  ),
);
const originalTitlesByVideoId = new Map();
for (const track of originalDrafts) {
  if (!track.youtubeVideoId) {
    continue;
  }

  const titles =
    originalTitlesByVideoId.get(track.youtubeVideoId) ?? new Set();
  titles.add(normalizeName(track.title));
  originalTitlesByVideoId.set(track.youtubeVideoId, titles);
}
const ambiguousOriginalVideoIds = new Set(
  Array.from(originalTitlesByVideoId)
    .filter(([_videoId, titles]) => titles.size > 1)
    .map(([videoId]) => videoId),
);
const durationEligibleVideoIds = originalVideoIds.filter(
  (videoId) => !ambiguousOriginalVideoIds.has(videoId),
);
const durationsByVideoId = previousDurationCache(previousMusicPayload.tracks);
const missingOriginalVideoIds = durationEligibleVideoIds.filter(
  (videoId) => !durationsByVideoId.has(videoId),
);
const youtubeConfig =
  missingOriginalVideoIds.length > 0
    ? await loadYouTubeClientConfig(talents[0])
    : null;

if (youtubeConfig && missingOriginalVideoIds.length > 0) {
  console.log(
    `Collecting YouTube player metadata for ${missingOriginalVideoIds.length}/${durationEligibleVideoIds.length} eligible original-song videos...`,
  );
  const durationResults = await mapWithConcurrency(
    missingOriginalVideoIds,
    VIDEO_CONCURRENCY,
    async (videoId) => {
      try {
        return [
          videoId,
          await fetchYouTubeDuration(videoId, youtubeConfig),
        ];
      } catch (error) {
        console.warn(
          `YouTube metadata failed for ${videoId}: ${errorMessage(error)}`,
        );
        return [videoId, null];
      }
    },
  );
  durationResults.forEach(([videoId, duration]) => {
    durationsByVideoId.set(videoId, duration);
  });
} else if (missingOriginalVideoIds.length > 0) {
  console.warn(
    "YouTube client configuration was unavailable; original-song durations will be null.",
  );
}
console.log(
  `Excluded ${ambiguousOriginalVideoIds.size} shared original-song videos from duration assignment.`,
);

const originalTracks = originalDrafts.map(
  ({ youtubeVideoId, ...track }) => {
    const verifiedDuration = VERIFIED_ORIGINAL_DURATION_FALLBACKS.get(
      `${track.memberIds.slice().sort().join(",")}:${normalizeName(
        track.title,
      )}:${track.releaseDate ?? ""}`,
    );

    return {
      ...track,
      durationSeconds:
        verifiedDuration ??
        (youtubeVideoId && !ambiguousOriginalVideoIds.has(youtubeVideoId)
          ? durationsByVideoId.get(youtubeVideoId) ?? null
          : null),
    };
  },
);
const coverTracks = coverDrafts.map(
  ({ youtubeVideoId: _youtubeVideoId, ...track }) => track,
);
const sortedTracks = [...originalTracks, ...coverTracks].sort(compareTracks);
const { tracks, preservedIdCount, newIdCount } = reconcileTrackIds(
  sortedTracks,
  previousMusicPayload.tracks,
);

const payload = {
  checkedAt: new Date().toISOString(),
  sourceNote:
    "hololive 공식 프로필의 Debut/Debut Stream/Debut date와 공개 원곡·커버곡 시트를 결합했습니다. AZKi는 COVER 공식 데뷔 발표일을 사용했습니다. 원곡 길이는 YouTube player metadata와 확인된 음원 길이로 보완하며, 조회 실패 항목은 null입니다.",
  sourceUrls: [
    ORIGINAL_SONGS_SOURCE_URL,
    COVER_SONGS_SOURCE_URL,
    OFFICIAL_MUSIC_URL,
  ],
  members,
  tracks,
};

await writeFileAtomically(
  outputPath,
  `${JSON.stringify(payload, null, 2)}\n`,
);

const durationCount = tracks.filter(
  (track) => Number.isFinite(track.durationSeconds) && track.durationSeconds > 0,
).length;
const categoryCounts = Object.fromEntries(
  ["solo", "collaboration", "cover"].map((category) => [
    category,
    tracks.filter((track) => track.category === category).length,
  ]),
);

console.log(`Wrote ${outputPath}`);
console.log(
  `Members: ${members.length}; tracks: ${tracks.length} (${Object.entries(
    categoryCounts,
  )
    .map(([category, count]) => `${category} ${count}`)
    .join(", ")}).`,
);
console.log(
  `Durations: ${durationCount}/${tracks.length} (${(
    (durationCount / Math.max(tracks.length, 1)) *
    100
  ).toFixed(1)}%).`,
);
console.log(
  `Track IDs: preserved ${preservedIdCount}; new ${newIdCount}.`,
);

function parseCsv(input) {
  const text = input.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("Malformed RFC 4180 CSV: unterminated quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function csvRecords(input) {
  const rows = parseCsv(input);
  const headers = rows.shift() ?? [];

  return rows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header.trim(), values[index] ?? ""]),
    ),
  );
}

function createTalentMatchers(roster) {
  return roster.map((talent) => {
    const candidates = [talent.name, talent.nativeName];

    for (const alias of talent.aliases ?? []) {
      if (normalizeName(alias).length >= 6) {
        candidates.push(alias);
      }
    }

    return {
      id: talent.id,
      names: Array.from(
        new Set(candidates.map(normalizeName).filter(Boolean)),
      ),
    };
  });
}

function matchTalentIds(value, matchers) {
  const normalized = normalizeName(value);
  if (!normalized) {
    return [];
  }

  return matchers
    .filter((matcher) =>
      matcher.names.some((name) => normalized.includes(name)),
    )
    .map((matcher) => matcher.id);
}

function originalTrackFromRow(row, matchers) {
  const memberIds = matchTalentIds(row.Members_Romaji, matchers);
  if (memberIds.length === 0) {
    return null;
  }

  const registeredTitle = cleanValue(row.Title_Registered);
  const nativeTitle = cleanValue(row.Title);
  const translatedTitle = cleanValue(row.Title_Translated);
  const romanizedTitle = cleanValue(row.Title_Romaji);
  const title =
    registeredTitle ??
    nativeTitle ??
    translatedTitle ??
    romanizedTitle ??
    "Untitled original song";
  const subtitle = firstDistinct(
    title,
    nativeTitle,
    translatedTitle,
    romanizedTitle,
  );
  const videoId =
    firstYouTubeId(row.Music_link) ?? firstYouTubeId(row.Video_link);
  const releaseType = releaseTypeFromLocation(
    row.Song_location || row.Song_Location || row.Song_type,
  );
  const albumTitle =
    releaseType === "album" || releaseType === "ep"
      ? cleanValue(row.CD_source)
      : null;
  const membersAmount = normalizeName(
    row.Members_amount || row.Members_Amount,
  );
  const isExplicitlySolo =
    membersAmount === "solo" ||
    membersAmount === "1" ||
    membersAmount === "single";
  const category =
    memberIds.length > 1 || (!isExplicitlySolo && membersAmount)
      ? "collaboration"
      : "solo";
  const links = [
    ...youtubeLinks(row.Video_link),
    ...typedLinks("streaming", row["Download/Streaming_link"]),
    ...typedLinks("music", row.Music_link),
    ...typedLinks("album", row.CD_link),
  ];
  const releaseDate = normalizeDate(row.Release_date);

  return {
    id: stableTrackId("original", [
      title,
      cleanValue(row.Members_Romaji),
      releaseDate,
    ]),
    title,
    subtitle,
    category,
    memberIds,
    artist:
      cleanValue(row.Members_Romaji) ??
      cleanValue(row.Members) ??
      memberIds.join(", "),
    releaseDate,
    durationSeconds: null,
    albumTitle,
    releaseType,
    thumbnailUrl: videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : null,
    links: deduplicateLinks(links),
    youtubeVideoId: videoId,
  };
}

function coverTrackFromRow(row, matchers) {
  const memberIds = matchTalentIds(row.performers, matchers);
  if (memberIds.length === 0) {
    return null;
  }

  const videoId =
    firstYouTubeId(row.link) ??
    (/^[A-Za-z0-9_-]{11}$/.test(row.stream?.trim() ?? "")
      ? row.stream.trim()
      : null);
  const musicName = cleanValue(row.music_name);
  const videoTitle = cleanValue(row.title);
  const title = musicName ?? videoTitle ?? "Untitled cover song";
  const originalArtist = cleanValue(row.original_artist);
  const subtitle = firstDistinct(title, originalArtist, videoTitle);
  const duration = positiveInteger(row.duration);
  const releaseDate = normalizeDate(row.date);
  const coverUrl = validHttpsUrl(row.link);
  const links =
    coverUrl && videoId
      ? [
          {
            label: LINK_LABELS.youtube,
            kind: "youtube",
            url: coverUrl,
          },
        ]
      : [];

  return {
    id: videoId
      ? stableTrackId("cover", [videoId, normalizeName(title)])
      : stableTrackId("cover", [
          title,
          cleanValue(row.performers),
          releaseDate,
        ]),
    title,
    subtitle,
    category: "cover",
    memberIds,
    artist:
      cleanValue(row.performers) ??
      cleanValue(row.channel) ??
      memberIds.join(", "),
    releaseDate,
    durationSeconds: duration,
    albumTitle: null,
    releaseType: "single",
    thumbnailUrl: videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : null,
    links,
    youtubeVideoId: videoId,
  };
}

function deduplicateCoverTracks(tracks) {
  const byVideoAndTitle = new Map();
  const withoutVideo = [];

  for (const track of tracks) {
    if (!track.youtubeVideoId) {
      withoutVideo.push(track);
      continue;
    }

    const key = `${track.youtubeVideoId}:${normalizeName(track.title)}`;
    const existing = byVideoAndTitle.get(key);
    if (!existing) {
      byVideoAndTitle.set(key, track);
      continue;
    }

    byVideoAndTitle.set(key, {
      ...existing,
      memberIds: Array.from(
        new Set([...existing.memberIds, ...track.memberIds]),
      ),
      durationSeconds:
        existing.durationSeconds ?? track.durationSeconds ?? null,
      links: deduplicateLinks([...existing.links, ...track.links]),
    });
  }

  const videoDeduplicated = [
    ...byVideoAndTitle.values(),
    ...withoutVideo,
  ];
  const semanticGroups = new Map();
  const result = [];

  for (const track of videoDeduplicated) {
    const duration = positiveInteger(track.durationSeconds);
    if (!track.releaseDate || !duration) {
      result.push(track);
      continue;
    }

    const key = [
      normalizeName(track.title),
      track.memberIds.slice().sort().join(","),
      track.releaseDate,
    ].join(":");
    const candidates = semanticGroups.get(key) ?? [];
    const matching = candidates.find(
      (candidate) =>
        Math.abs(candidate.track.durationSeconds - duration) <= 2,
    );

    if (!matching) {
      const index = result.push(track) - 1;
      candidates.push({ index, track });
      semanticGroups.set(key, candidates);
      continue;
    }

    const merged = {
      ...matching.track,
      id: stableTrackId("cover", [key, "same-song"]),
      memberIds: Array.from(
        new Set([...matching.track.memberIds, ...track.memberIds]),
      ),
      durationSeconds: Math.min(
        matching.track.durationSeconds,
        duration,
      ),
      links: deduplicateLinks([
        ...matching.track.links,
        ...track.links,
      ]),
    };
    result[matching.index] = merged;
    matching.track = merged;
  }

  return mergeKnownCoverEquivalents(result);
}

function mergeKnownCoverEquivalents(tracks) {
  let mergedTracks = [...tracks];

  for (const videoIds of KNOWN_COVER_EQUIVALENT_VIDEO_GROUPS) {
    const idSet = new Set(videoIds);
    const matches = mergedTracks.filter((track) =>
      track.links.some((link) => {
        const videoId = youtubeIdFromUrl(link.url);
        return videoId ? idSet.has(videoId) : false;
      }),
    );
    if (matches.length < 2) {
      continue;
    }

    const representative = [...matches].sort(
      (left, right) =>
        String(left.releaseDate ?? "9999-99-99").localeCompare(
          String(right.releaseDate ?? "9999-99-99"),
        ) || left.title.length - right.title.length,
    )[0];
    const durations = matches
      .map((track) => positiveInteger(track.durationSeconds))
      .filter(Boolean);
    const merged = {
      ...representative,
      id: stableTrackId("cover", [
        ...videoIds.slice().sort(),
        "same-recording",
      ]),
      memberIds: Array.from(
        new Set(matches.flatMap((track) => track.memberIds)),
      ),
      durationSeconds:
        durations.length > 0 ? Math.min(...durations) : null,
      links: deduplicateLinks(
        matches.flatMap((track) => track.links),
      ),
    };
    const matchSet = new Set(matches);
    mergedTracks = mergedTracks.filter(
      (track) => !matchSet.has(track),
    );
    mergedTracks.push(merged);
  }

  return mergedTracks;
}

function createMusicMembers(roster, debutDates) {
  const drafts = roster.map((talent, originalIndex) => ({
    talentId: talent.id,
    branch: talent.branch,
    cohortOrder:
      COHORT_ORDER.get(`${talent.branch}:${talent.generation}`) ?? 999,
    debutDate: debutDates[originalIndex],
    originalIndex,
  }));
  const groups = new Map();

  for (const member of drafts) {
    const key = `${member.branch}:${member.cohortOrder}`;
    const group = groups.get(key) ?? [];
    group.push(member);
    groups.set(key, group);
  }

  const debutOrders = new Map();
  for (const group of groups.values()) {
    group
      .sort(
        (left, right) =>
          String(left.debutDate ?? "9999-99-99").localeCompare(
            String(right.debutDate ?? "9999-99-99"),
          ) || left.originalIndex - right.originalIndex,
      )
      .forEach((member, index) => {
        debutOrders.set(member.talentId, index);
      });
  }

  const branchOrder = { JP: 0, DEV_IS: 1, EN: 2, ID: 3 };
  return drafts
    .map((member) => ({
      talentId: member.talentId,
      debutDate: member.debutDate,
      cohortOrder: member.cohortOrder,
      debutOrder: debutOrders.get(member.talentId) ?? 999,
      branch: member.branch,
    }))
    .sort(
      (left, right) =>
        (branchOrder[left.branch] ?? 999) -
          (branchOrder[right.branch] ?? 999) ||
        left.cohortOrder - right.cohortOrder ||
        String(left.debutDate ?? "9999-99-99").localeCompare(
          String(right.debutDate ?? "9999-99-99"),
        ) ||
        left.debutOrder - right.debutOrder ||
        left.talentId.localeCompare(right.talentId),
    )
    .map(({ branch: _branch, ...member }) => member);
}

function extractDebutDate(html) {
  const $ = cheerio.load(html);
  let value = null;

  $(".talent_data dt").each((_index, element) => {
    const label = $(element).text().replace(/\s+/g, " ").trim();
    if (/^Debut(?: Stream| date)?$/i.test(label)) {
      value = $(element).next("dd").text().replace(/\s+/g, " ").trim();
      return false;
    }
    return undefined;
  });

  if (!value) {
    const dataText = $(".talent_data").text().replace(/\s+/g, " ");
    value = dataText.match(
      /Debut(?: Stream| date)?\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4})/i,
    )?.[1];
  }

  return englishDateToIso(value);
}

function englishDateToIso(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i,
  );
  if (!match) {
    return null;
  }

  const months = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const month = months[match[1].toLocaleLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isInteger(year)
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}

async function loadYouTubeClientConfig(seedTalent) {
  try {
    const channelId = requiredYouTubeChannelId(seedTalent.channelId);
    const searchUrl = new URL(
      `/channel/${encodeURIComponent(channelId)}/search`,
      YOUTUBE_ROOT,
    );
    searchUrl.searchParams.set("query", "music");
    const html = await fetchText(searchUrl.toString());
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
    const clientVersion = html.match(
      /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/,
    )?.[1];

    return validYouTubeApiKey(apiKey) && validYouTubeClientVersion(clientVersion)
      ? { apiKey, clientVersion }
      : null;
  } catch (error) {
    console.warn(`YouTube configuration failed: ${errorMessage(error)}`);
    return null;
  }
}

async function fetchYouTubeDuration(videoId, config) {
  const verifiedVideoId = requiredYouTubeVideoId(videoId);
  const playerUrl = new URL("/youtubei/v1/player", YOUTUBE_ROOT);
  playerUrl.searchParams.set("key", requiredYouTubeApiKey(config.apiKey));
  const player = await fetchJson(
    playerUrl.toString(),
    {
      method: "POST",
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: config.clientVersion,
            hl: "en",
            gl: "US",
          },
        },
        videoId: verifiedVideoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    },
  );
  const duration = positiveInteger(player.videoDetails?.lengthSeconds);
  return duration ?? null;
}

function firstYouTubeId(value) {
  for (const url of urlsFromCell(value)) {
    const videoId = youtubeIdFromUrl(url);
    if (videoId) {
      return videoId;
    }
  }
  return null;
}

function youtubeIdFromUrl(value) {
  const valid = validHttpsUrl(value);
  if (!valid) {
    return null;
  }

  const url = new URL(valid);
  const host = url.hostname.toLocaleLowerCase().replace(/^www\./, "");
  let candidate = null;

  if (host === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    candidate =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ??
      null;
  }

  return candidate && isYouTubeVideoId(candidate)
    ? candidate
    : null;
}

function youtubeLinks(value) {
  return urlsFromCell(value)
    .map((url) => youtubeIdFromUrl(url))
    .filter(Boolean)
    .map((videoId) => ({
      label: LINK_LABELS.youtube,
      kind: "youtube",
      url: canonicalYouTubeUrl(videoId),
    }));
}

function typedLinks(kind, value) {
  return urlsFromCell(value)
    .map(validHttpsUrl)
    .filter(Boolean)
    .map((url) => ({
      label: LINK_LABELS[kind] ?? LINK_LABELS.other,
      kind,
      url,
    }));
}

function urlsFromCell(value) {
  const matches = String(value ?? "").match(/https?:\/\/[^\s,]+/gi) ?? [];
  return matches.map((url) => url.replace(/[)\]}>.,;]+$/g, ""));
}

function validHttpsUrl(value) {
  return approvedMusicHttpsUrl(value);
}

function officialTalentProfileRequestUrl(talent) {
  const talentId = requiredTalentId(talent.id);
  const slug = OFFICIAL_PROFILE_SLUG_OVERRIDES.get(talentId) ?? talentId;
  const canonicalUrl = new URL(
    `/en/talents/${encodeURIComponent(slug)}/`,
    OFFICIAL_PROFILE_ORIGIN,
  );
  let declaredUrl;

  try {
    declaredUrl = new URL(String(talent.officialProfileUrl ?? ""));
  } catch (error) {
    throw new Error(`Invalid official profile URL for ${talentId}.`, {
      cause: error,
    });
  }

  if (
    declaredUrl.username ||
    declaredUrl.password ||
    declaredUrl.toString() !== canonicalUrl.toString()
  ) {
    throw new Error(
      `Official profile URL for ${talentId} does not match its canonical hololive profile.`,
    );
  }
  return canonicalUrl.toString();
}

function requiredTalentId(value) {
  const talentId = String(value ?? "");
  if (
    talentId.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(talentId)
  ) {
    throw new Error(`Invalid talent id: ${talentId}`);
  }
  return talentId;
}

function requiredYouTubeChannelId(value) {
  const channelId = String(value ?? "");
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
    throw new Error(`Invalid official YouTube channel id: ${channelId}`);
  }
  return channelId;
}

function isYouTubeVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(String(value ?? ""));
}

function requiredYouTubeVideoId(value) {
  const videoId = String(value ?? "");
  if (!isYouTubeVideoId(videoId)) {
    throw new Error(`Invalid YouTube video id: ${videoId}`);
  }
  return videoId;
}

function validYouTubeApiKey(value) {
  return /^[A-Za-z0-9_-]{20,128}$/.test(String(value ?? ""));
}

function requiredYouTubeApiKey(value) {
  const apiKey = String(value ?? "");
  if (!validYouTubeApiKey(apiKey)) {
    throw new Error("Invalid YouTube API key format.");
  }
  return apiKey;
}

function validYouTubeClientVersion(value) {
  return /^\d+(?:\.\d+){2,5}$/.test(String(value ?? ""));
}

function canonicalYouTubeUrl(videoId) {
  return `${YOUTUBE_ROOT}/watch?v=${videoId}`;
}

function deduplicateLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    if (!link?.kind || !link?.url || seen.has(link.url)) {
      return false;
    }
    seen.add(link.url);
    return true;
  });
}

function releaseTypeFromLocation(value) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase();
  if (/(^|[^a-z])ep([^a-z]|$)/.test(normalized)) {
    return "ep";
  }
  if (normalized.includes("album")) {
    return "album";
  }
  if (normalized.includes("single")) {
    return "single";
  }
  return "other";
}

function normalizeDate(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(
    2,
    "0",
  )}`;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.round(number)
    : null;
}

function cleanValue(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return !text || text === "-" || /^n\/?a$/i.test(text) ? null : text;
}

function firstDistinct(title, ...values) {
  const normalizedTitle = normalizeName(title);
  return (
    values.find(
      (value) => value && normalizeName(value) !== normalizedTitle,
    ) ?? null
  );
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function stableTrackId(prefix, parts) {
  const digest = createHash("sha1")
    .update(parts.map((part) => String(part ?? "")).join("\u001f"))
    .digest("hex")
    .slice(0, 14);
  return `${prefix}-${digest}`;
}

function reconcileTrackIds(tracks, previousTracks) {
  const previous = (previousTracks ?? []).filter(
    (track) =>
      track &&
      typeof track.id === "string" &&
      /^(?:original|cover)-[a-f0-9]{14}$/.test(track.id),
  );
  const previousByIdentity = new Map();

  for (const track of previous) {
    for (const { key } of trackIdentityKeys(track)) {
      const candidates = previousByIdentity.get(key) ?? [];
      candidates.push(track);
      previousByIdentity.set(key, candidates);
    }
  }

  const claimedPreviousIds = new Set();
  const assignedIds = new Set();
  const reservedPreviousIds = new Set(previous.map((track) => track.id));
  const freshIdentityCounts = new Map();
  let preservedIdCount = 0;
  let newIdCount = 0;

  const resolvedTracks = tracks.map((track) => {
    const previousTrack = claimPreviousTrack(
      track,
      previousByIdentity,
      claimedPreviousIds,
    );

    if (previousTrack) {
      claimedPreviousIds.add(previousTrack.id);
      assignedIds.add(previousTrack.id);
      preservedIdCount += 1;
      return {
        ...track,
        category: previousTrack.category,
        id: previousTrack.id,
      };
    }

    const prefix = trackKind(track);
    const identityParts = freshTrackIdentityParts(track);
    const identity = identityParts.join("\u001f");
    let occurrence = freshIdentityCounts.get(identity) ?? 0;
    let id;

    do {
      id = stableTrackId(
        prefix,
        occurrence === 0
          ? identityParts
          : [...identityParts, `duplicate:${occurrence}`],
      );
      occurrence += 1;
    } while (assignedIds.has(id) || reservedPreviousIds.has(id));

    freshIdentityCounts.set(identity, occurrence);
    assignedIds.add(id);
    newIdCount += 1;
    return { ...track, id };
  });

  return {
    tracks: resolvedTracks,
    preservedIdCount,
    newIdCount,
  };
}

function claimPreviousTrack(
  track,
  previousByIdentity,
  claimedPreviousIds,
) {
  for (const { key, allowEquivalentDuplicates } of trackIdentityKeys(track)) {
    const candidates = (previousByIdentity.get(key) ?? []).filter(
      (candidate) => !claimedPreviousIds.has(candidate.id),
    );

    if (candidates.length === 0) {
      continue;
    }
    if (candidates.length > 1 && !allowEquivalentDuplicates) {
      continue;
    }

    return candidates.sort(
      (left, right) =>
        trackSimilarityScore(track, right) -
          trackSimilarityScore(track, left) ||
        left.id.localeCompare(right.id),
    )[0];
  }

  return null;
}

function trackIdentityKeys(track) {
  const kind = trackKind(track);
  const title = normalizeName(track.title);
  const members = trackMemberKey(track);
  const releaseDate = String(track.releaseDate ?? "");
  const album = normalizeName(track.albumTitle);
  const releaseType = normalizeName(track.releaseType);
  const artist = normalizeName(track.artist);
  const videoIds = trackYouTubeIds(track);
  const keys = [];

  if (title && members && releaseDate) {
    keys.push({
      key: identityKey(
        "catalog",
        kind,
        title,
        members,
        releaseDate,
        album,
        releaseType,
      ),
      allowEquivalentDuplicates: true,
    });
    keys.push({
      key: identityKey("semantic", kind, title, members, releaseDate),
      allowEquivalentDuplicates: true,
    });
  }

  for (const videoId of videoIds) {
    if (title && members) {
      keys.push({
        key: identityKey(
          "video-title-members",
          kind,
          videoId,
          title,
          members,
        ),
        allowEquivalentDuplicates: true,
      });
    }
    if (title) {
      keys.push({
        key: identityKey("video-title", kind, videoId, title),
        allowEquivalentDuplicates: false,
      });
    }
    if (members && releaseDate) {
      keys.push({
        key: identityKey(
          "video-members-date",
          kind,
          videoId,
          members,
          releaseDate,
        ),
        allowEquivalentDuplicates: false,
      });
    }
  }

  if (title && members && album) {
    keys.push({
      key: identityKey("title-members-album", kind, title, members, album),
      allowEquivalentDuplicates: false,
    });
  }
  if (title && artist && releaseDate) {
    keys.push({
      key: identityKey("title-artist-date", kind, title, artist, releaseDate),
      allowEquivalentDuplicates: false,
    });
  }
  if (title && members) {
    keys.push({
      key: identityKey("title-members", kind, title, members),
      allowEquivalentDuplicates: false,
    });
  }

  const seen = new Set();
  return keys.filter(({ key }) => {
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function identityKey(label, ...parts) {
  return [label, ...parts].join("\u001f");
}

function trackKind(track) {
  return track.category === "cover" ? "cover" : "original";
}

function trackMemberKey(track) {
  return Array.from(new Set(track.memberIds ?? []))
    .map((memberId) => String(memberId))
    .sort()
    .join(",");
}

function trackYouTubeIds(track) {
  const videoIds = [];
  const thumbnailVideoId = String(track.thumbnailUrl ?? "").match(
    /i\.ytimg\.com\/vi\/([A-Za-z0-9_-]{11})\//,
  )?.[1];

  if (thumbnailVideoId) {
    videoIds.push(thumbnailVideoId);
  }
  for (const link of track.links ?? []) {
    const videoId = youtubeIdFromUrl(link.url);
    if (videoId) {
      videoIds.push(videoId);
    }
  }

  return Array.from(new Set(videoIds)).sort();
}

function trackSimilarityScore(left, right) {
  let score = 0;

  if (normalizeName(left.title) === normalizeName(right.title)) score += 64;
  if (trackMemberKey(left) === trackMemberKey(right)) score += 32;
  if (
    left.releaseDate &&
    right.releaseDate &&
    left.releaseDate === right.releaseDate
  ) {
    score += 16;
  }
  if (
    trackYouTubeIds(left).some((videoId) =>
      trackYouTubeIds(right).includes(videoId),
    )
  ) {
    score += 8;
  }
  if (
    left.albumTitle &&
    right.albumTitle &&
    normalizeName(left.albumTitle) === normalizeName(right.albumTitle)
  ) {
    score += 4;
  }
  if (normalizeName(left.artist) === normalizeName(right.artist)) score += 2;
  if (left.category === right.category) score += 1;

  return score;
}

function freshTrackIdentityParts(track) {
  return [
    "music-track-v2",
    trackKind(track),
    normalizeName(track.title),
    trackMemberKey(track),
    String(track.releaseDate ?? ""),
    normalizeName(track.albumTitle),
    normalizeName(track.releaseType),
    trackYouTubeIds(track).join(","),
    normalizeName(track.artist),
  ];
}

function previousDurationCache(tracks) {
  const durations = new Map();

  for (const track of tracks ?? []) {
    if (track.category === "cover") {
      continue;
    }

    const duration = positiveInteger(track.durationSeconds);
    if (!duration) {
      continue;
    }

    const videoId =
      String(track.thumbnailUrl ?? "").match(
        /i\.ytimg\.com\/vi\/([A-Za-z0-9_-]{11})\//,
      )?.[1] ??
      (track.links ?? [])
        .map((link) => youtubeIdFromUrl(link.url))
        .find(Boolean);
    if (videoId) {
      durations.set(videoId, duration);
    }
  }

  return durations;
}

function compareTracks(left, right) {
  return (
    String(left.releaseDate ?? "9999-99-99").localeCompare(
      String(right.releaseDate ?? "9999-99-99"),
    ) ||
    left.category.localeCompare(right.category) ||
    left.title.localeCompare(right.title, "en")
  );
}

async function fetchText(url, options = {}) {
  const result = await fetchTextWithPolicy(
    url,
    {
      ...options,
      headers: requestHeaders(options.headers),
    },
    requestPolicy(url),
  );
  return result.text;
}

async function fetchJson(url, options = {}) {
  const result = await fetchJsonWithPolicy(
    url,
    {
      ...options,
      headers: requestHeaders(options.headers, true),
    },
    requestPolicy(url),
  );
  return result.json;
}

function requestHeaders(headers, json = false) {
  return {
    "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
    ...(json ? { "Content-Type": "application/json" } : {}),
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
    ...(headers ?? {}),
  };
}

function requestPolicy(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();

  if (hostname === "docs.google.com") {
    return {
      allowedHostnames: ["docs.google.com"],
      allowedHostnameSuffixes: ["googleusercontent.com"],
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: 16 * 1024 * 1024,
      maxRedirects: 3,
    };
  }
  if (hostname === "hololive.hololivepro.com") {
    return {
      allowedOrigins: ["https://hololive.hololivepro.com"],
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: 3 * 1024 * 1024,
      maxRedirects: 2,
    };
  }
  if (hostname === "www.youtube.com" || hostname === "youtube.com") {
    return {
      allowedHostnames: ["www.youtube.com", "youtube.com"],
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: 8 * 1024 * 1024,
      maxRedirects: 2,
    };
  }

  throw new Error(`Music updater request host is not allowlisted: ${url.origin}`);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(
        items[currentIndex],
        currentIndex,
      );
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(items.length, 1)) },
      runWorker,
    ),
  );
  return results;
}

async function retry(worker, attempts) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await worker();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
