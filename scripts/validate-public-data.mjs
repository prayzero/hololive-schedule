import { access, readFile, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const publicRoot = resolve(projectRoot, "public");
const dataRoot = resolve(publicRoot, "data");
const maximumFileBytes = 10 * 1024 * 1024;
const maximumTotalBytes = 25 * 1024 * 1024;
const maximumArrayItems = 20_000;
const maximumObjectKeys = 200;
const maximumStringLength = 20_000;
const maximumDepth = 50;
const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);
const identityKeys = ["id", "videoId"];
const urlKeyPattern = /(?:urls?|uris?|links?|thumbnails?|avatars?|sources?)$/i;
const absoluteSchemePattern = /^[a-z][a-z\d+.-]*:/i;
const dangerousSchemePattern = /^(?:javascript|vbscript|data|file|blob):/i;

const jsonPaths = await listJsonFiles(dataRoot);
if (jsonPaths.length === 0) {
  throw new Error("public/data contains no JSON files.");
}

let totalBytes = 0;
let checkedValues = 0;

for (const path of jsonPaths) {
  const fileStat = await stat(path);
  totalBytes += fileStat.size;
  if (fileStat.size > maximumFileBytes) {
    fail(path, `file exceeds ${maximumFileBytes} bytes`);
  }
  if (totalBytes > maximumTotalBytes) {
    throw new Error(`public/data exceeds ${maximumTotalBytes} bytes in total.`);
  }

  let payload;
  try {
    payload = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(path, `invalid JSON: ${messageOf(error)}`);
  }

  validateKnownShape(path, payload);
  await validatePayload(path, payload);
}

console.log(
  `Validated ${jsonPaths.length} public JSON files (${checkedValues.toLocaleString("en-US")} values).`,
);

async function listJsonFiles(directory) {
  const paths = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await listJsonFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      paths.push(path);
    }
  }

  return paths.sort();
}

async function validatePayload(filePath, payload) {
  const stack = [{ value: payload, path: [] }];

  while (stack.length > 0) {
    const current = stack.pop();
    const { value, path } = current;
    checkedValues += 1;

    if (path.length > maximumDepth) {
      fail(filePath, `nesting exceeds ${maximumDepth} at ${displayPath(path)}`);
    }

    if (typeof value === "string") {
      await validateString(filePath, path, value);
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length > maximumArrayItems) {
        fail(
          filePath,
          `array exceeds ${maximumArrayItems} items at ${displayPath(path)}`,
        );
      }
      validateUniqueIdentities(filePath, path, value);
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: value[index], path: [...path, index] });
      }
      continue;
    }

    if (value && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length > maximumObjectKeys) {
        fail(
          filePath,
          `object exceeds ${maximumObjectKeys} keys at ${displayPath(path)}`,
        );
      }
      for (const [key, child] of entries) {
        if (dangerousKeys.has(key)) {
          fail(filePath, `forbidden object key at ${displayPath([...path, key])}`);
        }
        stack.push({ value: child, path: [...path, key] });
      }
    }
  }
}

async function validateString(filePath, path, rawValue) {
  const value = rawValue.trim();
  const key = [...path].reverse().find((part) => typeof part === "string") ?? "";
  const isUrlField = urlKeyPattern.test(key);

  if (rawValue.length > maximumStringLength) {
    fail(
      filePath,
      `string exceeds ${maximumStringLength} characters at ${displayPath(path)}`,
    );
  }

  if (
    /^(?:checkedAt|generatedAt|updatedAt|verifiedAt|publishedAt|startsAt|endsAt)$/i.test(
      key,
    ) &&
    value &&
    !Number.isFinite(Date.parse(value))
  ) {
    fail(filePath, `invalid timestamp at ${displayPath(path)}: ${value}`);
  }

  if (
    /^(?:checkedAt|generatedAt|updatedAt|verifiedAt)$/i.test(key) &&
    value &&
    Date.parse(value) > Date.now() + 24 * 60 * 60 * 1_000
  ) {
    fail(filePath, `metadata timestamp is in the future at ${displayPath(path)}`);
  }

  if (isUrlField && /^[\\/]{2}/.test(value)) {
    fail(filePath, `protocol-relative URL at ${displayPath(path)}`);
  }

  if (isUrlField && dangerousSchemePattern.test(value)) {
    fail(filePath, `dangerous URL scheme at ${displayPath(path)}`);
  }

  if (isUrlField && absoluteSchemePattern.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch (error) {
      fail(filePath, `malformed URL at ${displayPath(path)}: ${messageOf(error)}`);
    }

    if (url.protocol !== "https:") {
      fail(filePath, `non-HTTPS URL at ${displayPath(path)}`);
    }
    if (url.username || url.password) {
      fail(filePath, `URL credentials at ${displayPath(path)}`);
    }
    return;
  }

  if (!isUrlField) return;
  if (!value) {
    fail(filePath, `empty URL at ${displayPath(path)}`);
  }
  if (value.includes("\\") || value.includes("?") || value.includes("#")) {
    fail(filePath, `unsafe local URL at ${displayPath(path)}`);
  }

  const segments = value.split("/");
  if (
    !["images", "data"].includes(segments[0]) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    fail(filePath, `local URL leaves the approved public paths at ${displayPath(path)}`);
  }

  const target = resolve(publicRoot, ...segments);
  if (!isInside(publicRoot, target)) {
    fail(filePath, `local URL escapes public/ at ${displayPath(path)}`);
  }

  try {
    await access(target);
  } catch {
    fail(filePath, `local URL target is missing at ${displayPath(path)}: ${value}`);
  }
}

function validateKnownShape(filePath, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail(filePath, "top-level value must be an object");
  }

  const name = relative(dataRoot, filePath).replaceAll("\\", "/");
  if (name === "schedule.json" || /^schedule-archive\/\d{4}-\d{2}\.json$/.test(name)) {
    const entries = requireArray(filePath, payload, "entries", 1, 10_000);
    validateScheduleEntries(filePath, entries);
    return;
  }

  if (name === "schedule-index.json") {
    const dates = requireArray(filePath, payload, "dates", 1, 5_000);
    const months = requireArray(filePath, payload, "months", 1, 500);
    const dateTotal = dates.reduce((sum, item) => sum + Number(item?.count), 0);
    const monthTotal = months.reduce((sum, item) => sum + Number(item?.count), 0);
    if (
      !Number.isSafeInteger(payload.totalEntries) ||
      payload.totalEntries !== dateTotal ||
      payload.totalEntries !== monthTotal
    ) {
      fail(filePath, "schedule index counts do not reconcile");
    }
    for (const month of months) {
      if (!month || typeof month !== "object") {
        fail(filePath, "months must contain objects");
      }
      const expectedUrl = `data/schedule-archive/${month.month}.json`;
      if (month.url !== expectedUrl) {
        fail(filePath, `archive URL must be ${expectedUrl}`);
      }
    }
    return;
  }

  if (name === "youtube-lives.json") {
    const lives = requireArray(filePath, payload, "lives", 200, 10_000);
    validateYouTubeLives(filePath, lives);
    return;
  }

  const collections = {
    "events.json": [["events", 20, 2_000]],
    "talents.json": [["talents", 50, 500]],
    "solo-lives.json": [["lives", 40, 5_000]],
    "hololive-dreams.json": [
      ["characters", 50, 500],
      ["pickups", 0, 200],
      ["rarities", 1, 20],
    ],
    "music.json": [
      ["members", 50, 500],
      ["tracks", 3_000, 20_000],
      ["sourceUrls", 1, 100],
    ],
    "hololive-official-card-game.json": [
      ["releases", 1, 500],
      ["rarities", 1, 100],
      ["cards", 2_000, 10_000],
      ["sourceUrls", 1, 100],
    ],
    "hololive-wafers.json": [
      ["releases", 1, 100],
      ["rarities", 1, 20],
      ["cards", 250, 2_000],
      ["sourceUrls", 1, 100],
    ],
  }[name];

  if (!collections) {
    fail(filePath, "unexpected JSON file under public/data");
  }

  for (const [key, minimum, maximum] of collections) {
    requireArray(filePath, payload, key, minimum, maximum);
  }

  if (
    name === "hololive-official-card-game.json" ||
    name === "hololive-wafers.json"
  ) {
    validateCollectionCatalog(filePath, payload, name);
  }
}

function requireArray(filePath, payload, key, minimum, maximum) {
  const value = payload[key];
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(
      filePath,
      `${key} must contain ${minimum}–${maximum} items`,
    );
  }
  return value;
}

function validateScheduleEntries(filePath, entries) {
  for (const entry of entries) {
    const videoId = String(entry?.videoId ?? "");
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId) || entry.id !== videoId) {
      fail(filePath, "schedule entry has an invalid id/videoId pair");
    }
    const expectedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    if (entry.url !== expectedUrl) {
      fail(filePath, `schedule URL must be canonical for ${videoId}`);
    }
    if (
      entry.thumbnail !== null &&
      entry.thumbnail !== `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    ) {
      fail(filePath, `schedule thumbnail must be canonical for ${videoId}`);
    }
  }
}

function validateYouTubeLives(filePath, lives) {
  const categories = new Set([
    "birthday",
    "anniversary",
    "3d",
    "concert",
    "special",
  ]);

  for (const live of lives) {
    const videoId = String(live?.videoId ?? "");
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId) || live.id !== videoId) {
      fail(filePath, "YouTube live has an invalid id/videoId pair");
    }
    if (live.videoUrl !== `https://www.youtube.com/watch?v=${videoId}`) {
      fail(filePath, `YouTube live URL must be canonical for ${videoId}`);
    }
    if (live.thumbnailUrl !== `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`) {
      fail(filePath, `YouTube thumbnail must be canonical for ${videoId}`);
    }
    if (
      !Array.isArray(live.memberIds) ||
      live.memberIds.length === 0 ||
      live.memberIds.length > 20 ||
      live.memberIds.some((memberId) => typeof memberId !== "string" || !memberId)
    ) {
      fail(filePath, `YouTube live has invalid memberIds for ${videoId}`);
    }
    if (!categories.has(live.category)) {
      fail(filePath, `YouTube live has invalid category for ${videoId}`);
    }
  }
}

function validateCollectionCatalog(filePath, payload, name) {
  const releases = payload.releases;
  const rarities = payload.rarities;
  const cards = payload.cards;
  const expectedHost =
    name === "hololive-official-card-game.json"
      ? "hololive-official-cardgame.com"
      : "www.bandai.co.jp";
  const expectedImagePrefix =
    name === "hololive-official-card-game.json"
      ? "/wp-content/images/cardlist/"
      : "/candy/published/bnc_files/product/";

  if (
    typeof payload.sourceNote !== "string" ||
    payload.sourceNote.trim().length < 20
  ) {
    fail(filePath, "sourceNote must explain the catalog scope");
  }

  const releaseIds = new Set();
  const membershipCounts = new Map();
  for (const release of releases) {
    if (!release || typeof release !== "object") {
      fail(filePath, "releases must contain objects");
    }
    if (!isSafeCatalogId(release.id) || releaseIds.has(release.id)) {
      fail(filePath, `invalid or duplicate release id: ${release.id ?? "<empty>"}`);
    }
    releaseIds.add(release.id);
    membershipCounts.set(release.id, 0);

    if (
      typeof release.name !== "string" ||
      !release.name.trim() ||
      typeof release.shortName !== "string" ||
      !release.shortName.trim() ||
      typeof release.category !== "string" ||
      !release.category.trim()
    ) {
      fail(filePath, `release ${release.id} has missing display fields`);
    }
    if (
      release.releaseDate !== null &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(release.releaseDate) ||
        !Number.isFinite(Date.parse(`${release.releaseDate}T00:00:00Z`)))
    ) {
      fail(filePath, `release ${release.id} has an invalid releaseDate`);
    }
    if (!Number.isSafeInteger(release.cardCount) || release.cardCount < 1) {
      fail(filePath, `release ${release.id} has an invalid cardCount`);
    }
    validateCatalogUrlHost(filePath, release.sourceUrl, expectedHost, release.id);
  }

  const rarityIds = new Set();
  const raritySortOrders = new Set();
  for (const rarity of rarities) {
    if (!rarity || typeof rarity !== "object") {
      fail(filePath, "rarities must contain objects");
    }
    if (!isSafeCatalogId(rarity.id) || rarityIds.has(rarity.id)) {
      fail(filePath, `invalid or duplicate rarity id: ${rarity.id ?? "<empty>"}`);
    }
    if (typeof rarity.label !== "string" || !rarity.label.trim()) {
      fail(filePath, `rarity ${rarity.id} has an empty label`);
    }
    if (
      !Number.isSafeInteger(rarity.sortOrder) ||
      rarity.sortOrder < 0 ||
      raritySortOrders.has(rarity.sortOrder)
    ) {
      fail(filePath, `rarity ${rarity.id} has an invalid sortOrder`);
    }
    rarityIds.add(rarity.id);
    raritySortOrders.add(rarity.sortOrder);
  }

  const cardSortOrders = new Set();
  for (const card of cards) {
    if (!card || typeof card !== "object") {
      fail(filePath, "cards must contain objects");
    }
    if (
      !isSafeCatalogId(card.id) ||
      typeof card.cardNumber !== "string" ||
      !card.cardNumber.trim() ||
      typeof card.title !== "string" ||
      !card.title.trim()
    ) {
      fail(filePath, `card has invalid identity fields: ${card?.id ?? "<empty>"}`);
    }
    if (!rarityIds.has(card.rarityId)) {
      fail(filePath, `card ${card.id} references unknown rarity ${card.rarityId}`);
    }
    if (
      !Array.isArray(card.releaseIds) ||
      card.releaseIds.length < 1 ||
      card.releaseIds.length > 20 ||
      new Set(card.releaseIds).size !== card.releaseIds.length
    ) {
      fail(filePath, `card ${card.id} has invalid releaseIds`);
    }
    for (const releaseId of card.releaseIds) {
      if (!releaseIds.has(releaseId)) {
        fail(filePath, `card ${card.id} references unknown release ${releaseId}`);
      }
      membershipCounts.set(releaseId, membershipCounts.get(releaseId) + 1);
    }
    if (
      !Number.isSafeInteger(card.sortOrder) ||
      card.sortOrder < 0 ||
      cardSortOrders.has(card.sortOrder)
    ) {
      fail(filePath, `card ${card.id} has an invalid sortOrder`);
    }
    cardSortOrders.add(card.sortOrder);

    validateCatalogUrlHost(filePath, card.imageUrl, expectedHost, card.id);
    const imageUrl = new URL(card.imageUrl);
    if (!imageUrl.pathname.startsWith(expectedImagePrefix)) {
      fail(filePath, `card ${card.id} uses an unapproved image path`);
    }
    if (card.sourceUrl !== undefined) {
      validateCatalogUrlHost(filePath, card.sourceUrl, expectedHost, card.id);
    }
    if (
      card.memberNames !== undefined &&
      (!Array.isArray(card.memberNames) ||
        card.memberNames.length > 20 ||
        card.memberNames.some(
          (memberName) =>
            typeof memberName !== "string" || !memberName.trim(),
        ))
    ) {
      fail(filePath, `card ${card.id} has invalid memberNames`);
    }
    for (const key of ["imageSize", "imagePosition"]) {
      if (
        card[key] !== undefined &&
        !/^\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(card[key])
      ) {
        fail(filePath, `card ${card.id} has invalid ${key}`);
      }
    }
  }

  for (const release of releases) {
    if (membershipCounts.get(release.id) !== release.cardCount) {
      fail(
        filePath,
        `release ${release.id} cardCount does not reconcile: ${release.cardCount} != ${membershipCounts.get(release.id)}`,
      );
    }
  }

  for (const sourceUrl of payload.sourceUrls) {
    validateCatalogUrlHost(filePath, sourceUrl, expectedHost, "sourceUrls");
  }
}

function isSafeCatalogId(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)
  );
}

function validateCatalogUrlHost(filePath, value, expectedHost, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(filePath, `${label} has a malformed catalog URL`);
  }
  if (url.protocol !== "https:" || url.hostname !== expectedHost) {
    fail(filePath, `${label} uses an unapproved catalog URL host`);
  }
}

function validateUniqueIdentities(filePath, path, values) {
  for (const key of identityKeys) {
    if (
      values.length === 0 ||
      !values.every(
        (value) =>
          value && typeof value === "object" && typeof value[key] === "string",
      )
    ) {
      continue;
    }

    const seen = new Set();
    for (const value of values) {
      const identity = value[key].trim();
      if (!identity || seen.has(identity)) {
        fail(
          filePath,
          `empty or duplicate ${key} at ${displayPath(path)}: ${identity || "<empty>"}`,
        );
      }
      seen.add(identity);
    }
  }
}

function isInside(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function displayPath(path) {
  return path.length === 0 ? "<root>" : path.join(".");
}

function fail(filePath, message) {
  throw new Error(`${relative(projectRoot, filePath)}: ${message}`);
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
