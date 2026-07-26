import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

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

const talentPayload = JSON.parse(await readFile(talentsPath, "utf8"));
const previousMusicPayload = await readFile(outputPath, "utf8")
  .then(JSON.parse)
  .catch(() => ({ tracks: [] }));
const previousDebutDates = new Map(
  (previousMusicPayload.members ?? [])
    .filter((member) => member.talentId && member.debutDate)
    .map((member) => [member.talentId, member.debutDate]),
);
const talents = talentPayload.talents.filter(
  (talent) => talent.status === "active" || talent.status === "affiliate",
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
        () => fetchText(talent.officialProfileUrl),
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
  .map((row, index) =>
    originalTrackFromRow(row, index, talentMatchers),
  )
  .filter(Boolean);
const coverDrafts = deduplicateCoverTracks(
  coverRows
    .map((row, index) => coverTrackFromRow(row, index, talentMatchers))
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
const tracks = [...originalTracks, ...coverTracks].sort(compareTracks);

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

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

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

function originalTrackFromRow(row, index, matchers) {
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
    `Original song ${index + 1}`;
  const subtitle = firstDistinct(
    title,
    nativeTitle,
    translatedTitle,
    romanizedTitle,
  );
  const videoId =
    firstYouTubeId(row.Music_link) ?? firstYouTubeId(row.Video_link);
  const releaseType = releaseTypeFromLocation(row.Song_Location);
  const albumTitle =
    releaseType === "album" || releaseType === "ep"
      ? cleanValue(row.CD_source)
      : null;
  const membersAmount = normalizeName(row.Members_Amount);
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
      index,
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

function coverTrackFromRow(row, index, matchers) {
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
  const title = musicName ?? videoTitle ?? `Cover song ${index + 1}`;
  const originalArtist = cleanValue(row.original_artist);
  const subtitle = firstDistinct(title, originalArtist, videoTitle);
  const duration = positiveInteger(row.duration);
  const releaseDate = normalizeDate(row.date);
  const coverUrl = validHttpUrl(row.link);
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
          index,
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
    const html = await fetchText(
      `${YOUTUBE_ROOT}/channel/${seedTalent.channelId}/search?query=music`,
    );
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
    const clientVersion = html.match(
      /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/,
    )?.[1];

    return apiKey && clientVersion ? { apiKey, clientVersion } : null;
  } catch (error) {
    console.warn(`YouTube configuration failed: ${errorMessage(error)}`);
    return null;
  }
}

async function fetchYouTubeDuration(videoId, config) {
  const player = await fetchJson(
    `${YOUTUBE_ROOT}/youtubei/v1/player?key=${encodeURIComponent(config.apiKey)}`,
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
        videoId,
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
  const valid = validHttpUrl(value);
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

  return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate)
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
    .map(validHttpUrl)
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

function validHttpUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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
  const response = await request(url, options);
  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await request(url, options);
  return response.json();
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        ...(options.headers ?? {}),
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
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
