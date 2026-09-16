import type {
  EventsPayload, HololiveDreamsPayload, ScheduleIndexPayload, SchedulePayload,
  SoloLivesPayload, TalentsPayload, YouTubeLivesPayload,
} from "./types";
import { validateSiteResourcePayload } from "./dataValidation.js";

export interface SiteData {
  schedule: SchedulePayload;
  scheduleIndex: ScheduleIndexPayload;
  events: EventsPayload;
  talents: TalentsPayload;
  solos: SoloLivesPayload;
  youtubeLives: YouTubeLivesPayload;
  hololiveDreams: HololiveDreamsPayload;
}

export const RESOURCE_KEYS = [
  "schedule", "scheduleIndex", "events", "talents", "solos", "youtubeLives", "hololiveDreams",
] as const satisfies readonly (keyof SiteData)[];
export type ResourceKey = typeof RESOURCE_KEYS[number];
export type ResourceErrors = Partial<Record<ResourceKey, string | null>>;

const resourceLabels: Record<ResourceKey, string> = {
  schedule: "방송 일정", scheduleIndex: "방송 기록 목록", events: "행사",
  talents: "멤버", solos: "솔로 공연", youtubeLives: "YouTube 라이브", hololiveDreams: "홀로도리",
};
export async function loadSiteResource<K extends ResourceKey>(
  key: K,
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<SiteData[K]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetcher(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("HTTP failure");
    const payload: unknown = await response.json();
    if (!validateSiteResourcePayload(key, payload)) {
      throw new Error("Invalid resource shape");
    }
    return payload as SiteData[K];
  } catch {
    throw new Error(`${resourceLabels[key]} 데이터를 불러오지 못했습니다. 다시 시도해 주세요.`);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export async function loadSiteResources(
  urls: Record<ResourceKey, string>,
  signal: AbortSignal,
  onLoaded: (key: ResourceKey, value: SiteData[ResourceKey]) => void,
  onError: (key: ResourceKey, message: string) => void,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await Promise.all(RESOURCE_KEYS.map(async (key) => {
    try {
      const value = await loadSiteResource(key, urls[key], signal, fetcher);
      if (!signal.aborted) onLoaded(key, value);
    } catch (error) {
      if (!signal.aborted) onError(key, error instanceof Error ? error.message : "데이터 로딩 실패");
    }
  }));
}

export function resourceErrorForView(view: string, errors: ResourceErrors): string | null {
  const dependencies: Record<string, ResourceKey[]> = {
    schedule: ["schedule", "scheduleIndex", "talents"],
    concerts: ["events", "solos", "talents"], local: ["events"],
    solo: ["youtubeLives", "talents"], dream: ["hololiveDreams", "talents"],
    music: ["talents"], cards: [], wafer: [],
  };
  return (dependencies[view] ?? []).map((key) => errors[key]).find(Boolean) ?? null;
}

export function archiveErrorForView(
  view: string,
  selectedDate: string,
  error: { month: string; message: string } | null,
): string | null {
  return view === "schedule" && error?.month === selectedDate.slice(0, 7) ? error.message : null;
}

export function fallbackScheduleDate(dates: string[], selectedDate: string, today: string) {
  if (dates.length === 0 || dates.includes(selectedDate)) return null;
  const sorted = [...dates].sort();
  const date = sorted.find((value) => value >= today) ?? sorted[sorted.length - 1];
  return { date, hideEnded: date >= today };
}
