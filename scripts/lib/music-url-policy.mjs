const EXACT_HOSTS = new Set([
  "anthurium.tokyo",
  "distrokid.com",
  "linkco.re",
  "m.youtube.com",
  "mora.jp",
  "music.youtube.com",
  "nex-tone.link",
  "open.spotify.com",
  "orcd.co",
  "seesaawiki.jp",
  "sound.jp",
  "www.diverse.direct",
  "www.jvcmusic.co.jp",
  "www.youtube.com",
  "youtu.be",
  "youtube.com",
]);
const TRUSTED_SERVICE_SUFFIXES = [
  "bandcamp.com",
  "fanlink.to",
  "fanlink.tv",
  "ffm.to",
  "lnk.to",
  "streamlink.to",
];

export function approvedMusicHttpsUrl(value) {
  let url;

  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const allowed =
    EXACT_HOSTS.has(hostname) ||
    TRUSTED_SERVICE_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );

  return allowed ? url.toString() : null;
}
