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
  }[name];

  if (!collections) {
    fail(filePath, "unexpected JSON file under public/data");
  }

  for (const [key, minimum, maximum] of collections) {
    requireArray(filePath, payload, key, minimum, maximum);
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
