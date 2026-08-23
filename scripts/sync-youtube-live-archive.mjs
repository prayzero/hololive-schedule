import { open } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveContainedPath,
  validateExternalArchiveRoot,
  writeFileAtomically,
} from "./lib/secure-io.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const publicArchivePath = resolve(
  projectRoot,
  "public",
  "data",
  "youtube-lives.json",
);
const configuredArchivePath = process.env.YOUTUBE_ARCHIVE_PATH?.trim();
const configuredDurableRoot = process.env.SCHEDULE_ARCHIVE_ROOT?.trim();
const durableRootValue = configuredDurableRoot ??
  (configuredArchivePath ? dirname(resolve(configuredArchivePath)) : null);
const durableRoot = durableRootValue
  ? validateExternalArchiveRoot(durableRootValue, {
      workspaceRoot: projectRoot,
      label: configuredDurableRoot
        ? "SCHEDULE_ARCHIVE_ROOT"
        : "YOUTUBE_ARCHIVE_PATH parent",
    })
  : null;
const durableArchivePath = durableRoot
  ? resolveContainedPath(
      durableRoot,
      configuredArchivePath ?? "youtube-lives.json",
    )
  : null;
const mode = process.argv[2];

if (!durableArchivePath) {
  throw new Error(
    "YOUTUBE_ARCHIVE_PATH or SCHEDULE_ARCHIVE_ROOT is required.",
  );
}
if (basename(durableArchivePath) !== "youtube-lives.json") {
  throw new Error(
    "YOUTUBE_ARCHIVE_PATH must end with youtube-lives.json.",
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
    await writeFileAtomically(publicArchivePath, durable.contents);
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
  await writeFileAtomically(durableArchivePath, current.contents);
  console.log(
    `Persisted YouTube live archive checked at ${current.payload.checkedAt}.`,
  );
} else {
  throw new Error('Mode must be either "restore" or "persist".');
}

async function readArchive(path, optional = false) {
  let handle;
  try {
    handle = await open(path, "r");
    const fileStat = await handle.stat();
    if (!fileStat.isFile() || fileStat.size > 10 * 1024 * 1024) {
      throw new Error("archive must be a regular file no larger than 10 MiB");
    }
    const contents = await handle.readFile("utf8");
    const payload = JSON.parse(contents);
    checkedAtTime(payload);
    if (!Array.isArray(payload.lives) || payload.lives.length > 20_000) {
      throw new Error("lives must be an array with at most 20,000 entries");
    }
    return { contents, payload };
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    throw new Error(
      `Invalid YouTube live archive at ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    await handle?.close().catch(() => {});
  }
}

function checkedAtTime(payload) {
  const time = Date.parse(payload?.checkedAt);
  if (!Number.isFinite(time)) {
    throw new Error("checkedAt must be a valid ISO timestamp");
  }
  return time;
}
