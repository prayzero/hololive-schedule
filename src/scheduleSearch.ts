import type { ScheduleEntry, Talent } from "./types";

export function talentSearchValues(talent: Talent): string[] {
  return [
    talent.name,
    talent.nameKo,
    talent.nativeName,
    talent.branch,
    talent.generation,
    ...talent.aliases,
  ];
}

export function broadcastSearchValues(
  entry: Pick<ScheduleEntry, "name" | "title" | "branch">,
  talent?: Talent,
): Array<string | null | undefined> {
  return [
    entry.name,
    entry.title,
    ...(talent ? talentSearchValues(talent) : [entry.branch]),
  ];
}
