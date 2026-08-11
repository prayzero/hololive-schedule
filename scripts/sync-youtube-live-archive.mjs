import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const publicArchivePath = resolve(
  projectRoot,
  "public",
  "data",
  "youtube-lives.json",
);
const durableRoot = process.env.SCHEDULE_ARCHIVE_ROOT;
const durableArchivePath =
  process.env.YOUTUBE_ARCHIVE_PATH ??
  (durableRoot ? resolve(durableRoot, "youtube-lives.json") : null);
const mode = process.argv[2];

if (!durableArchivePath) {
  throw new Error(
    "YOUTUBE_ARCHIVE_PATH or SCHEDULE_ARCHIVE_ROOT is required.",
  );
}

if (mode === "restore") {
  const [current, durable] = await Promise.all([
    readArchive(publicArchivePath),
    readArchive(durableArchivePath, true),
  ]);

  if (!durable) {
    console.log("No durable YouTube live archive exists yet.");
  } else if (checkedAtTime(durable.payload) > checkedAtTime(current.payload)) {
    await writeAtomically(publicArchivePath, durable.contents);
    console.log(
      `Restored newer YouTube live archive checked at ${durable.payload.checkedAt}.`,
    );
  } else {
    console.log(
      `Repository YouTube live archive is current (${current.payload.checkedAt}).`,
    );
  }
} else if (mode === "persist") {
  const current = await readArchive(publicArchivePath);
  await writeAtomically(durableArchivePath, current.contents);
  console.log(
    `Persisted YouTube live archive checked at ${current.payload.checkedAt}.`,
  );
} else {
  throw new Error('Mode must be either "restore" or "persist".');
}

async function readArchive(path, optional = false) {
  try {
    const contents = await readFile(path, "utf8");
    const payload = JSON.parse(contents);
    checkedAtTime(payload);
    if (!Array.isArray(payload.lives)) {
      throw new Error("lives must be an array");
    }
    return { contents, payload };
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    throw new Error(
      `Invalid YouTube live archive at ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function checkedAtTime(payload) {
  const time = Date.parse(payload?.checkedAt);
  if (!Number.isFinite(time)) {
    throw new Error("checkedAt must be a valid ISO timestamp");
  }
  return time;
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
