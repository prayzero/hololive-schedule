export function normalizeMusicHeaders(headers, requiredHeaders) {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Music source contains duplicate column names.");
  }
  for (const name of requiredHeaders) {
    if (!normalized.includes(name)) {
      throw new Error(`Music source is missing required column: ${name}`);
    }
  }
  return normalized;
}

export function assertMusicCoverage(tracks, previousTracks) {
  for (const category of ["solo", "collaboration", "cover"]) {
    const count = tracks.filter((track) => track.category === category).length;
    const previousCount = previousTracks.filter((track) => track.category === category).length;
    if (count === 0 || count < previousCount * 0.8) {
      throw new Error(`Music ${category} count dropped from ${previousCount} to ${count}; keeping the last snapshot for review.`);
    }
  }
}
