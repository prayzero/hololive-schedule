import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import {
  mkdir,
  open,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, parse, relative, resolve, sep } from "node:path";

export async function writeFileAtomically(path, contents, encoding = "utf8") {
  const destination = resolve(path);
  const directory = dirname(destination);
  const temporaryPath = resolve(
    directory,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;

  await mkdir(directory, { recursive: true });

  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents, encoding);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, destination);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function readJsonFileStrict(
  path,
  {
    allowMissing = false,
    missingValue = null,
    label = path,
    maxBytes = 10 * 1024 * 1024,
  } = {},
) {
  let contents;
  let handle;

  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(`maxBytes must be a positive safe integer for ${label}.`);
  }

  try {
    handle = await open(path, "r");
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      throw new Error(`${label} is not a regular file.`);
    }
    if (fileStat.size > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte safety limit.`);
    }
    contents = await handle.readFile("utf8");
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") {
      return missingValue;
    }
    throw new Error(`Could not read ${label}: ${errorMessage(error)}`, {
      cause: error,
    });
  } finally {
    await handle?.close().catch(() => {});
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

export function validateExternalArchiveRoot(
  value,
  { workspaceRoot, label = "archive root" },
) {
  if (!String(value ?? "").trim()) {
    throw new Error(`${label} must not be empty.`);
  }

  const archiveRoot = resolve(String(value));
  const workspace = resolve(workspaceRoot);
  const filesystemRoot = parse(archiveRoot).root;
  const home = resolve(homedir());
  const dangerousExactTargets = new Set([
    filesystemRoot.toLowerCase(),
    home.toLowerCase(),
    workspace.toLowerCase(),
    resolve(process.cwd()).toLowerCase(),
  ]);

  if (dangerousExactTargets.has(archiveRoot.toLowerCase())) {
    throw new Error(`${label} resolves to a dangerous target: ${archiveRoot}`);
  }
  if (
    isPathInside(archiveRoot, workspace) ||
    isPathInside(workspace, archiveRoot)
  ) {
    throw new Error(
      `${label} must be outside and must not contain the workspace: ${archiveRoot}`,
    );
  }
  if (process.env.GITHUB_ACTIONS === "true") {
    const runnerTempValue = process.env.RUNNER_TEMP;
    if (!String(runnerTempValue ?? "").trim()) {
      throw new Error(`RUNNER_TEMP is required to validate ${label}.`);
    }

    const runnerTemp = resolve(String(runnerTempValue));
    const runnerTempIsDangerous = [
      parse(runnerTemp).root,
      home,
      workspace,
    ].some((path) => path.toLowerCase() === runnerTemp.toLowerCase());
    if (
      runnerTempIsDangerous ||
      archiveRoot.toLowerCase() === runnerTemp.toLowerCase() ||
      !isPathInside(runnerTemp, archiveRoot)
    ) {
      throw new Error(
        `${label} must be a strict descendant of RUNNER_TEMP in GitHub Actions: ${archiveRoot}`,
      );
    }
  }

  return archiveRoot;
}

export function resolveContainedPath(root, ...segments) {
  const base = resolve(root);
  const target = resolve(base, ...segments);

  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error(`Resolved path escapes archive root: ${target}`);
  }
  return target;
}

function isPathInside(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== "..")
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
