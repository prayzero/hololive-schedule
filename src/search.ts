export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’']/g, "")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function includesSearch(
  values: Array<string | null | undefined>,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;

  const compactQuery = normalizedQuery.replace(/\s/g, "");
  return values.some((value) => {
    const normalizedValue = normalizeSearch(String(value ?? ""));
    if (normalizedValue.includes(normalizedQuery)) return true;

    return (
      compactQuery.length >= 4 &&
      normalizedValue.replace(/\s/g, "").includes(compactQuery)
    );
  });
}
