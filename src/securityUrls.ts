const MAX_EXTERNAL_URL_LENGTH = 2_048;

type CollectionOfficialKind = "cards" | "wafer";

export function safeCollectionOfficialUrl(
  kind: CollectionOfficialKind,
  value: unknown,
): string | null {
  if (
    (kind !== "cards" && kind !== "wafer") ||
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_EXTERNAL_URL_LENGTH ||
    value !== value.trim()
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const expectedHostname =
    kind === "cards" ? "hololive-official-cardgame.com" : "www.bandai.co.jp";

  if (
    url.protocol !== "https:" ||
    url.hostname !== expectedHostname ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    return null;
  }

  return url.href;
}

export function safeYouTubeWatchUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_EXTERNAL_URL_LENGTH ||
    value !== value.trim()
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const videoId = url.searchParams.get("v") ?? "";
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  if (
    !/^[A-Za-z0-9_-]{6,20}$/.test(videoId) ||
    url.protocol !== "https:" ||
    url.hostname !== "www.youtube.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    value !== canonicalUrl
  ) {
    return null;
  }

  return canonicalUrl;
}
