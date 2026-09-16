import type { CuratedEvent, EventRegion } from "./types";

export type LocalEventFilter = "ALL" | EventRegion | "ENDED";

export const EVENT_REGIONS = [
  "JP",
  "KR",
  "US",
  "TW",
  "CN",
  "GLOBAL",
] as const satisfies readonly EventRegion[];

export const LOCAL_EVENT_FILTERS = [
  "ALL",
  ...EVENT_REGIONS,
  "ENDED",
] as const satisfies readonly LocalEventFilter[];

const REGION_LABELS: Record<EventRegion, string> = {
  JP: "일본",
  KR: "한국",
  US: "미국",
  TW: "대만",
  CN: "중국",
  GLOBAL: "글로벌",
};

export function eventRegionLabel(region: EventRegion): string {
  return REGION_LABELS[region];
}

export function isEventRegion(value: string | null): value is EventRegion {
  return (
    value !== null && (EVENT_REGIONS as readonly string[]).includes(value)
  );
}

export function localEventFilterLabel(filter: LocalEventFilter): string {
  if (filter === "ALL") return "전체";
  if (filter === "ENDED") return "종료";
  return eventRegionLabel(filter);
}

export function isDiscoverableLocalEvent(
  event: Pick<CuratedEvent, "categories">,
): boolean {
  return (
    event.categories.includes("collaboration") ||
    event.categories.includes("exhibition") ||
    event.categories.includes("festival")
  );
}

export function eventMatchesRegionFilter(
  event: Pick<CuratedEvent, "region" | "supportedRegions">,
  filter: LocalEventFilter,
): boolean {
  if (filter === "ALL" || filter === "ENDED") return true;
  if (event.region === filter) return true;
  if (event.region !== "GLOBAL" || filter === "GLOBAL") return false;

  return event.supportedRegions?.includes(filter) ?? false;
}
