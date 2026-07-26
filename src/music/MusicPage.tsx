import {
  Album,
  ArrowDownUp,
  Clock3,
  Disc3,
  ExternalLink,
  Headphones,
  ListMusic,
  Music2,
  Play,
  UsersRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  MusicCategory,
  MusicLink,
  MusicMember,
  MusicPayload,
  MusicSort,
  MusicTrack,
  Talent,
} from "../types";
import "./music.css";

interface MusicPageProps {
  payload: MusicPayload;
  talents: Talent[];
  query: string;
  selectedMemberId: string;
  onSelectedMemberChange: (memberId: string) => void;
}

interface MemberTrackCounts {
  solo: number;
  collaboration: number;
  cover: number;
  total: number;
}

const BRANCH_ORDER: Record<Talent["branch"], number> = {
  JP: 0,
  DEV_IS: 1,
  EN: 2,
  ID: 3,
};

const CATEGORY_OPTIONS: Array<{
  id: MusicCategory;
  label: string;
  shortLabel: string;
}> = [
  { id: "solo", label: "솔로곡 · 앨범", shortLabel: "솔로곡" },
  { id: "collaboration", label: "콜라보", shortLabel: "콜라보" },
  { id: "cover", label: "커버", shortLabel: "커버" },
];

const SORT_OPTIONS: Array<{ id: MusicSort; label: string }> = [
  { id: "release", label: "앨범 · 발매순" },
  { id: "duration-asc", label: "짧은 곡순" },
  { id: "duration-desc", label: "긴 곡순" },
];

function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLocaleLowerCase();
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return "길이 미확인";
  }

  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function durationDateTime(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }

  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${remainingSeconds}S`;
}

function formatDate(value: string | null) {
  if (!value) return "날짜 미확인";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function compareNullableDuration(
  left: MusicTrack,
  right: MusicTrack,
  direction: "asc" | "desc",
) {
  if (left.durationSeconds === null && right.durationSeconds === null) {
    return left.title.localeCompare(right.title);
  }
  if (left.durationSeconds === null) return 1;
  if (right.durationSeconds === null) return -1;

  const difference = left.durationSeconds - right.durationSeconds;
  return direction === "asc" ? difference : -difference;
}

function latestReleaseDate(tracks: MusicTrack[]) {
  return tracks.reduce(
    (latest, track) =>
      track.releaseDate && track.releaseDate > latest
        ? track.releaseDate
        : latest,
    "",
  );
}

function countTracks(tracks: MusicTrack[]): MemberTrackCounts {
  const counts: MemberTrackCounts = {
    solo: 0,
    collaboration: 0,
    cover: 0,
    total: tracks.length,
  };

  tracks.forEach((track) => {
    counts[track.category] += 1;
  });
  return counts;
}

function linkIcon(link: MusicLink) {
  if (link.kind === "youtube") return <Play size={13} aria-hidden="true" />;
  if (link.kind === "album") return <Album size={13} aria-hidden="true" />;
  return <Headphones size={13} aria-hidden="true" />;
}

function linkLabel(link: MusicLink) {
  if (link.label) return link.label;
  if (link.kind === "youtube") return "YouTube";
  if (link.kind === "streaming") return "스트리밍";
  if (link.kind === "music") return "음원";
  if (link.kind === "album") return "앨범";
  return "링크";
}

function visibleTrackLinks(links: MusicLink[]) {
  const listeningLinks = links.filter((link) => link.kind !== "album");
  const preferredKinds: MusicLink["kind"][] = [
    "youtube",
    "streaming",
    "music",
    "other",
  ];
  const selected = preferredKinds
    .map((kind) => listeningLinks.find((link) => link.kind === kind))
    .filter((link): link is MusicLink => Boolean(link))
    .slice(0, 4);

  if (selected.length < 4) {
    const selectedUrls = new Set(selected.map((link) => link.url));
    for (const link of listeningLinks) {
      if (!selectedUrls.has(link.url)) {
        selected.push(link);
        selectedUrls.add(link.url);
      }
      if (selected.length === 4) break;
    }
  }

  return selected;
}

function TrackRow({
  track,
  showAlbum,
}: {
  track: MusicTrack;
  showAlbum: boolean;
}) {
  return (
    <article className="music-track-row">
      {track.thumbnailUrl ? (
        <img
          src={track.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="music-track-placeholder" aria-hidden="true">
          <Music2 size={18} />
        </span>
      )}

      <div className="music-track-copy">
        <div>
          <strong>{track.title}</strong>
          <time dateTime={durationDateTime(track.durationSeconds)}>
            {formatDuration(track.durationSeconds)}
          </time>
        </div>
        {track.subtitle && track.subtitle !== track.title ? (
          <small>{track.subtitle}</small>
        ) : null}
        <p>
          <span>{track.artist}</span>
          {showAlbum && track.albumTitle ? (
            <em>{track.albumTitle}</em>
          ) : null}
          {track.releaseDate ? <time>{formatDate(track.releaseDate)}</time> : null}
        </p>
      </div>

      <div className="music-track-links">
        {visibleTrackLinks(track.links).map((link) => (
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            key={`${track.id}:${link.kind}:${link.url}`}
            aria-label={`${track.title} ${linkLabel(link)} 새 창에서 열기`}
          >
            {linkIcon(link)}
            <span>{linkLabel(link)}</span>
            <ExternalLink size={10} aria-hidden="true" />
          </a>
        ))}
      </div>
    </article>
  );
}

function ReleaseGroups({ tracks }: { tracks: MusicTrack[] }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, MusicTrack[]>();

    tracks.forEach((track) => {
      const key = track.albumTitle?.trim() || "싱글 · 미수록곡";
      const existing = grouped.get(key) ?? [];
      existing.push(track);
      grouped.set(key, existing);
    });

    return [...grouped.entries()]
      .map(([title, groupTracks]) => ({
        title,
        tracks:
          title === "싱글 · 미수록곡"
            ? [...groupTracks].sort((left, right) =>
                (right.releaseDate ?? "").localeCompare(
                  left.releaseDate ?? "",
                ),
              )
            : groupTracks,
        latestDate: latestReleaseDate(groupTracks),
      }))
      .sort((left, right) => {
        if (left.title === "싱글 · 미수록곡") return 1;
        if (right.title === "싱글 · 미수록곡") return -1;
        return right.latestDate.localeCompare(left.latestDate);
      });
  }, [tracks]);

  return (
    <div className="music-release-groups">
      {groups.map((group) => {
        const representative = group.tracks.find(
          (track) => track.thumbnailUrl,
        );

        return (
          <section className="music-release-group" key={group.title}>
            <header>
              {representative?.thumbnailUrl ? (
                <img
                  src={representative.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span aria-hidden="true">
                  <Disc3 size={23} />
                </span>
              )}
              <div>
                <small>
                  {group.title === "싱글 · 미수록곡" ? "SINGLES" : "ALBUM · EP"}
                </small>
                <h4>{group.title}</h4>
                <p>
                  {group.tracks.length}곡
                  {group.latestDate ? ` · ${formatDate(group.latestDate)}` : ""}
                </p>
              </div>
            </header>
            <div className="music-release-track-list">
              {group.tracks.map((track) => (
                <TrackRow track={track} showAlbum={false} key={track.id} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function MusicPage({
  payload,
  talents,
  query,
  selectedMemberId,
  onSelectedMemberChange,
}: MusicPageProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [category, setCategory] = useState<MusicCategory>("solo");
  const [sort, setSort] = useState<MusicSort>("release");

  const talentById = useMemo(
    () => new Map(talents.map((talent) => [talent.id, talent])),
    [talents],
  );
  const memberById = useMemo(
    () =>
      new Map(
        payload.members.map((member) => [member.talentId, member] as const),
      ),
    [payload.members],
  );
  const tracksByMember = useMemo(() => {
    const map = new Map<string, MusicTrack[]>();
    payload.members.forEach((member) => map.set(member.talentId, []));

    payload.tracks.forEach((track) => {
      track.memberIds.forEach((memberId) => {
        const existing = map.get(memberId);
        if (existing) existing.push(track);
      });
    });
    return map;
  }, [payload.members, payload.tracks]);
  const countsByMember = useMemo(
    () =>
      new Map(
        payload.members.map((member) => [
          member.talentId,
          countTracks(tracksByMember.get(member.talentId) ?? []),
        ]),
      ),
    [payload.members, tracksByMember],
  );

  const orderedMembers = useMemo(
    () =>
      payload.members
        .map((member) => ({
          member,
          talent: talentById.get(member.talentId),
        }))
        .filter(
          (
            item,
          ): item is {
            member: MusicMember;
            talent: Talent;
          } => Boolean(item.talent),
        )
        .sort(
          (left, right) =>
            BRANCH_ORDER[left.talent.branch] -
              BRANCH_ORDER[right.talent.branch] ||
            left.member.cohortOrder - right.member.cohortOrder ||
            (left.member.debutDate ?? "9999-12-31").localeCompare(
              right.member.debutDate ?? "9999-12-31",
            ) ||
            left.member.debutOrder - right.member.debutOrder ||
            left.talent.nameKo.localeCompare(right.talent.nameKo, "ko"),
        ),
    [payload.members, talentById],
  );

  const normalizedQuery = normalizeSearch(query);
  const matchingTrackMemberIds = useMemo(() => {
    if (!normalizedQuery) return new Set<string>();
    const ids = new Set<string>();

    payload.tracks.forEach((track) => {
      const searchable = normalizeSearch(
        [
          track.title,
          track.subtitle,
          track.artist,
          track.albumTitle,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (searchable.includes(normalizedQuery)) {
        track.memberIds.forEach((memberId) => ids.add(memberId));
      }
    });
    return ids;
  }, [normalizedQuery, payload.tracks]);

  const filteredMembers = useMemo(
    () =>
      orderedMembers.filter(({ talent }) => {
        if (!normalizedQuery) return true;
        const searchable = normalizeSearch(
          [
            talent.name,
            talent.nameKo,
            talent.nativeName,
            talent.branch,
            talent.generation,
            talent.aliases.join(" "),
          ].join(" "),
        );
        return (
          searchable.includes(normalizedQuery) ||
          matchingTrackMemberIds.has(talent.id)
        );
      }),
    [matchingTrackMemberIds, normalizedQuery, orderedMembers],
  );

  const memberGroups = useMemo(() => {
    const groups: Array<{
      key: string;
      branch: Talent["branch"];
      generation: string;
      members: typeof filteredMembers;
    }> = [];

    filteredMembers.forEach((item) => {
      const key = `${item.talent.branch}:${item.member.cohortOrder}`;
      const lastGroup = groups.at(-1);
      if (!lastGroup || lastGroup.key !== key) {
        groups.push({
          key,
          branch: item.talent.branch,
          generation: item.talent.generation,
          members: [item],
        });
      } else {
        lastGroup.members.push(item);
      }
    });
    return groups;
  }, [filteredMembers]);

  const selectedTalent = selectedMemberId
    ? talentById.get(selectedMemberId) ?? null
    : null;
  const selectedMember = selectedMemberId
    ? memberById.get(selectedMemberId) ?? null
    : null;
  const selectedTracks = useMemo(
    () => tracksByMember.get(selectedMemberId) ?? [],
    [selectedMemberId, tracksByMember],
  );
  const selectedCounts = useMemo(
    () => countTracks(selectedTracks),
    [selectedTracks],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (selectedTalent && selectedMember) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [selectedMember, selectedTalent]);

  useEffect(() => {
    if (!selectedMemberId) return;
    const firstAvailable = CATEGORY_OPTIONS.find(
      (option) => selectedCounts[option.id] > 0,
    );
    setCategory(firstAvailable?.id ?? "solo");
    setSort("release");
  }, [selectedMemberId, selectedCounts]);

  const categoryTracks = useMemo(
    () => selectedTracks.filter((track) => track.category === category),
    [category, selectedTracks],
  );
  const durationSortedTracks = useMemo(() => {
    if (sort === "release") return categoryTracks;
    return [...categoryTracks].sort((left, right) =>
      compareNullableDuration(
        left,
        right,
        sort === "duration-asc" ? "asc" : "desc",
      ),
    );
  }, [categoryTracks, sort]);

  const closeDialog = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  };

  const handleDialogClosed = () => {
    if (selectedMemberId) onSelectedMemberChange("");
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  };

  const originalCount = payload.tracks.filter(
    (track) => track.category !== "cover",
  ).length;
  const coverCount = payload.tracks.length - originalCount;

  return (
    <section className="music-page" id="hololive-music">
      <div className="music-page-heading">
        <div>
          <span>
            <Music2 size={15} aria-hidden="true" />
            MEMBER DISCOGRAPHY
          </span>
          <h2>기수와 데뷔 순서로 찾는 홀로라이브 음악</h2>
          <p>
            멤버를 누르면 솔로곡은 앨범별로, 콜라보와 커버는 각각 나누어
            볼 수 있습니다.
          </p>
        </div>
        <div className="music-page-stats">
          <span>
            <UsersRound size={16} aria-hidden="true" />
            <strong>{payload.members.length}</strong>
            멤버
          </span>
          <span>
            <Disc3 size={16} aria-hidden="true" />
            <strong>{originalCount.toLocaleString("ko-KR")}</strong>
            원곡
          </span>
          <span>
            <Mic2Icon />
            <strong>{coverCount.toLocaleString("ko-KR")}</strong>
            커버
          </span>
        </div>
      </div>

      {memberGroups.length ? (
        <div className="music-generation-list">
          {memberGroups.map((group) => (
            <section className="music-generation-section" key={group.key}>
              <header>
                <span>{group.branch}</span>
                <div>
                  <h3>{group.generation}</h3>
                  <p>데뷔일이 빠른 순 · {group.members.length}명</p>
                </div>
              </header>
              <div className="music-member-grid">
                {group.members.map(({ talent, member }) => {
                  const counts = countsByMember.get(talent.id) ?? {
                    solo: 0,
                    collaboration: 0,
                    cover: 0,
                    total: 0,
                  };

                  return (
                    <button
                      type="button"
                      className="music-member-card"
                      key={talent.id}
                      style={{ "--music-accent": talent.accent } as CSSProperties}
                      aria-haspopup="dialog"
                      onClick={(event) => {
                        lastTriggerRef.current = event.currentTarget;
                        onSelectedMemberChange(talent.id);
                      }}
                    >
                      <span className="music-member-portrait">
                        <img
                          src={talent.portraitUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                        <i aria-hidden="true">
                          <ListMusic size={16} />
                        </i>
                      </span>
                      <span className="music-member-copy">
                        <small>{formatDate(member.debutDate)} 데뷔</small>
                        <strong>{talent.nameKo}</strong>
                        <em>{talent.name}</em>
                        <span>
                          <b>솔로 {counts.solo}</b>
                          <b>협업 {counts.collaboration}</b>
                          <b>커버 {counts.cover}</b>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="music-empty">
          <Music2 size={30} aria-hidden="true" />
          <strong>검색과 일치하는 멤버나 곡이 없습니다</strong>
          <p>멤버 이름, 곡명 또는 앨범명으로 다시 검색해 주세요.</p>
        </div>
      )}

      <div className="music-source-note">
        <Clock3 size={16} aria-hidden="true" />
        <p>
          공개된 영상·음원 링크를 기준으로 정리했습니다. 재생시간은 공개
          음원·영상 메타데이터 기준이며 판본에 따라 조금 다를 수 있습니다.
          삭제·비공개 영상과 최근 발매곡은 반영 시점에 따라 빠질 수 있습니다.
        </p>
        <div>
          {payload.sourceUrls.map((url, index) => (
            <a href={url} target="_blank" rel="noreferrer" key={url}>
              {index === 0 ? "원곡 목록" : index === 1 ? "커버 목록" : "공식 음악"}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>

      <dialog
        className="music-dialog"
        ref={dialogRef}
        aria-labelledby="music-dialog-title"
        aria-describedby="music-dialog-description"
        onClose={handleDialogClosed}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeDialog();
        }}
      >
        {selectedTalent && selectedMember ? (
          <div className="music-dialog-shell">
            <header className="music-dialog-header">
              <div
                className="music-dialog-member"
                style={
                  { "--music-accent": selectedTalent.accent } as CSSProperties
                }
              >
                <img src={selectedTalent.portraitUrl} alt="" />
                <div>
                  <span>
                    {selectedTalent.branch} · {selectedTalent.generation}
                  </span>
                  <h2 id="music-dialog-title">{selectedTalent.nameKo}</h2>
                  <p id="music-dialog-description">
                    {selectedTalent.nativeName} ·{" "}
                    {formatDate(selectedMember.debutDate)} 데뷔
                  </p>
                </div>
              </div>
              <div className="music-dialog-total">
                <strong>{selectedCounts.total}</strong>
                <span>등록 곡</span>
              </div>
              <button
                type="button"
                className="music-dialog-close"
                onClick={closeDialog}
                aria-label={`${selectedTalent.nameKo} 음악 팝업 닫기`}
              >
                <X size={21} aria-hidden="true" />
              </button>
            </header>

            <div className="music-dialog-controls">
              <div className="music-category-tabs" aria-label="음악 분류">
                {CATEGORY_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={category === option.id ? "is-active" : ""}
                    aria-pressed={category === option.id}
                    disabled={selectedCounts[option.id] === 0}
                    onClick={() => setCategory(option.id)}
                  >
                    {option.label}
                    <span>{selectedCounts[option.id]}</span>
                  </button>
                ))}
              </div>
              <label className="music-sort-select">
                <ArrowDownUp size={15} aria-hidden="true" />
                <span className="sr-only">곡 정렬</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as MusicSort)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="music-dialog-body">
              <div className="music-current-summary">
                <span>
                  {CATEGORY_OPTIONS.find((option) => option.id === category)
                    ?.shortLabel ?? "곡"}{" "}
                  {categoryTracks.length}곡
                </span>
                <p>
                  {sort === "release"
                    ? category === "cover"
                      ? "최근 공개된 커버부터 표시합니다."
                      : "앨범·EP는 작품별로 묶고 싱글은 따로 표시합니다."
                    : `${SORT_OPTIONS.find((option) => option.id === sort)?.label}으로 전체 곡을 정렬했습니다.`}
                </p>
              </div>

              {categoryTracks.length ? (
                sort === "release" && category !== "cover" ? (
                  <ReleaseGroups tracks={categoryTracks} />
                ) : (
                  <div className="music-flat-track-list">
                    {(sort === "release"
                      ? [...durationSortedTracks].sort((left, right) =>
                          (right.releaseDate ?? "").localeCompare(
                            left.releaseDate ?? "",
                          ),
                        )
                      : durationSortedTracks
                    ).map((track) => (
                      <TrackRow track={track} showAlbum key={track.id} />
                    ))}
                  </div>
                )
              ) : (
                <div className="music-dialog-empty">
                  <Music2 size={26} aria-hidden="true" />
                  <strong>이 분류에 등록된 곡이 없습니다</strong>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}

function Mic2Icon() {
  return <Headphones size={16} aria-hidden="true" />;
}

export default MusicPage;
