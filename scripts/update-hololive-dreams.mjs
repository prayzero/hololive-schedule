import { access, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const talentsPath = path.join(projectRoot, "public", "data", "talents.json");
const outputPath = path.join(projectRoot, "public", "data", "hololive-dreams.json");

const officialRoster = [
  ["Anya Melfissa", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/3a5ba19be7b04beb8c2462c1b51feacf/anya-thumb.png?fm=webp&w=600"],
  ["Ninomae Ina'nis", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/b2974d0f9dc249e8b0762aa88397a9f7/inanis-thumb.png?fm=webp&w=600"],
  ["Nekomata Okayu", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/eac06ac6d39d4c35a97569bc0fcefacc/okayu-thumb.png?fm=webp&w=600"],
  ["Shirogane Noel", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/f7727067c2a54c84b77e2f079b9b3004/noel-thumb.png?fm=webp&w=600"],
  ["Robocosan", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/4aee93bd7e65456099c281e815c2c35b/robocosan-thumb.png?fm=webp&w=600"],
  ["Mococo Abyssgard", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/3d55fa6360d043febba6c8744a35b725/mococo-thumb.png?fm=webp&w=600"],
  ["Houshou Marine", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/9e910cb3fd8c4c5fb9de5ab9c1a698c6/marin-thumb.png?fm=webp&w=600"],
  ["Nerissa Ravencroft", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/0043249dffda433e8e625bab0283f89f/nerissa-thumb.png?fm=webp&w=600"],
  ["Hakos Baelz", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/aebe5e38086648aca61c7319c00873f0/baelz-thumb.png?fm=webp&w=600"],
  ["La+ Darknesss", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/7e98a0c2018c4d7c935bce849fcbdfb0/la%2B-thumb.png?fm=webp&w=600"],
  ["Shishiro Botan", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/984d6e499a414367a1c2a4d2e952a713/botan-thumb.png?fm=webp&w=600"],
  ["Kureiji Ollie", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/ee27a4f327014ef28c3629e7b57a245b/ollie-thumb.png?fm=webp&w=600"],
  ["Shiranui Flare", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/81cadcd56bd24fee80d15f0cb6038713/flare-thumb.png?fm=webp&w=600"],
  ["Tsunomaki Watame", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/ee8ef07e5d2a46d3b95bd9441312719e/watame-thumb.png?fm=webp&w=600"],
  ["Nakiri Ayame", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/95185f179aa3457ca56c4a7632430297/ayame-thumb.png?fm=webp&w=600"],
  ["Yuzuki Choco", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/42f07a56c29d44dfb5707f9a2e43f3a9/choco-thumb.png?fm=webp&w=600"],
  ["IRyS", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/c8caedbc91ed448d83e6303e19dc6e80/irys-thumb.png?fm=webp&w=600"],
  ["Akai Haato", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/328b0e08c0314187b229b815cd2b44ee/haato-thumb.png?fm=webp&w=600"],
  ["Takanashi Kiara", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/8ffc14508c8a469b925a6e98ca1ff1d3/kiara-thumb.png?fm=webp&w=600"],
  ["Kobo Kanaeru", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/5c6adab15fbc4c2eb50643073064c940/kobo-thumb.png?fm=webp&w=600"],
  ["Koseki Bijou", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/e7f7ce711b1949e2818ee550995093e2/bijou-thumb.png?fm=webp&w=600"],
  ["Juufuutei Raden", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/83b51c64bbbb4f4cac31719d6e429e56/raden-thumb.png?fm=webp&w=600"],
  ["Hoshimachi Suisei", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/53f043a616784e88b28a52926dc1e5fc/suisei-thumb.png?fm=webp&w=600"],
  ["Shirakami Fubuki", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/26a02f0fa8a5478d81d1aeeaf3845310/fubuki-thumb.png?fm=webp&w=600"],
  ["Usada Pekora", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/f847246c577a4a4d99c946887d042704/pecora-thumb.png?fm=webp&w=600"],
  ["Hakui Koyori", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/c5405f9bf1aa41da8a722ae3cd402f75/koyori-thumb.png?fm=webp&w=600"],
  ["Ayunda Risu", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/0299cbbb67ff4303a87c642e290a5ca3/risu-thumb.png?fm=webp&w=600"],
  ["Inugami Korone", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/514f345adaa44287a1b2376c081ef5ba/korone-thumb.png?fm=webp&w=600"],
  ["Sakura Miko", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/06db26bc27854497abd82e77026b58ff/miko-thumb.png?fm=webp&w=600"],
  ["Otonose Kanade", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/5f46a4adcc0d410b978fd4385289e30e/kanade-thumb.png?fm=webp&w=600"],
  ["Ouro Kronii", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/66dfe4cfda194bb5aed236743f4c1ab5/kuronii-thumb.png?fm=webp&w=600"],
  ["Pavolia Reine", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/368bc52be5974aee8c9543504c791fd7/reine-thumb.png?fm=webp&w=600"],
  ["Tokino Sora", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/3a7e997f00454eefb330a41df03f63ea/tokino-sora-thumb.png?fm=webp&w=600"],
  ["Takane Lui", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/b694fa24658b41968b467f176c92faa3/lui-thumb.png?fm=webp&w=600"],
  ["Mori Calliope", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/b337e9da4cf844f385235b7b5fb0a837/calliope-thumb.png?fm=webp&w=600"],
  ["Tokoyami Towa", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/c6c1d824d2ac41ed812480841d176fb3/towa-thumb.png?fm=webp&w=600"],
  ["Kazama Iroha", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/6a2c9f534dcb404d9ad1aa595029b9d3/iroha-thumb.png?fm=webp&w=600"],
  ["Momosuzu Nene", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/156de050b066424cbbe0e1a6884ebd46/nene-thumb.png?fm=webp&w=600"],
  ["Kaela Kovalskia", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/9295a1461ad44730ab7ab6ea8fbb6365/kaela-thumb.png?fm=webp&w=600"],
  ["Natsuiro Matsuri", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/c40601152934484d94e00bd59664ecda/matsuri-thumb.png?fm=webp&w=600"],
  ["Aki Rosenthal", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/f848d95faddc4fd7b43b34f188fd572c/aki-thumb.png?fm=webp&w=600"],
  ["Vestia Zeta", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/f7471ae33bbf4a8f8518ae7a9194468b/zeta-thumb.png?fm=webp&w=600"],
  ["Fuwawa Abyssgard", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/c1df586021224c91b75d4338c8e40dfc/fuwawa-thumb.png?fm=webp&w=600"],
  ["Moona Hoshinova", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/1bd39df2a5004650a8076cd7cfc1ffd2/moona-thumb.png?fm=webp&w=600"],
  ["Todoroki Hajime", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/e101f86f5834420d9e53952d4f939556/hajime-thumb.png?fm=webp&w=600"],
  ["Himemori Luna", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/773da20669dd4492bb91e29de166cb85/luna-thumb.png?fm=webp&w=600"],
  ["AZKi", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/917f3db6fc27401a8cc20a9ad024825c/azki-thumb.png?fm=webp&w=600"],
  ["Ichijou Ririka", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/3e0d41f26b1d4665af990c557b9a89ee/ririka-thumb.png?fm=webp&w=600"],
  ["Shiori Novella", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/d1eae5972a724e24bd43a35f00de3d87/shiori-thumb.png?fm=webp&w=600"],
  ["Oozora Subaru", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/18eb7c0e59a74d5db8356d7f02a2e5e8/subaru-thumb.png?fm=webp&w=600"],
  ["Airani Iofifteen", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/207cc475944549a080a0c7aaf353416d/iofi-thumb.png?fm=webp&w=600"],
  ["Yukihana Lamy", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/39c701f7dd604c4fa0e0adc37517f318/lamy-thumb.png?fm=webp&w=600"],
  ["Omaru Polka", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/ec2dd64acb644126a4591f1e6dad2ec1/polka-thumb.png?fm=webp&w=600"],
  ["Ookami Mio", "https://images.microcms-assets.io/assets/f5f18e8e6a3c4c81af28f013b94e7f38/8778d0cbbfa3400c819cd72b36e18e0b/mio-thumb.png?fm=webp&w=600"],
];

function normalizeName(value) {
  return value
    .normalize("NFKC")
    .replace(/[’‘`´?]/g, "'")
    .replace(/[^\p{L}\p{N}+']/gu, "")
    .toLowerCase();
}

const talentPayload = JSON.parse(await readFile(talentsPath, "utf8"));
const talentByName = new Map();
for (const talent of talentPayload.talents) {
  for (const candidate of [talent.name, ...(talent.aliases ?? [])]) {
    talentByName.set(normalizeName(candidate), talent);
  }
}

const characters = officialRoster.map(([officialName, imageUrl]) => {
  const talent = talentByName.get(normalizeName(officialName));
  if (!talent) {
    throw new Error(`기존 talents.json에서 찾을 수 없는 공식 캐릭터: ${officialName}`);
  }
  return {
    id: talent.id,
    talentId: talent.id,
    name: officialName,
    nameKo: talent.nameKo,
    nativeName: talent.nativeName,
    branch: talent.branch,
    generation: talent.generation,
    imageUrl,
    accent: talent.accent,
  };
});

const summerPickupCards = [
  {
    id: "holonatsu-2026-oozora-subaru",
    talentId: "oozora-subaru",
    cardTitle: "Energeticスプラッシュ！",
    rarity: 5,
    imageUrl: "images/dream-pickups/holonatsu-2026/oozora-subaru.png",
    imageAlt: "★5 Energetic 스플래시! 오오조라 스바루 카드 일러스트",
    imagePosition: "50% 42%",
    imageScale: 1.22,
  },
  {
    id: "holonatsu-2026-shiranui-flare",
    talentId: "shiranui-flare",
    cardTitle: "sparks sunset",
    rarity: 5,
    imageUrl: "images/dream-pickups/holonatsu-2026/shiranui-flare.png",
    imageAlt: "★5 sparks sunset 시라누이 후레아 카드 일러스트",
    imagePosition: "50% 42%",
    imageScale: 1.22,
  },
  {
    id: "holonatsu-2026-shirogane-noel",
    talentId: "shirogane-noel",
    cardTitle: "波まとうゆるふわKnight",
    rarity: 5,
    imageUrl: "images/dream-pickups/holonatsu-2026/shirogane-noel.png",
    imageAlt: "★5 파도를 두른 폭신폭신 Knight 시로가네 노엘 카드 일러스트",
    imagePosition: "50% 44%",
  },
  {
    id: "holonatsu-2026-tsunomaki-watame",
    talentId: "tsunomaki-watame",
    cardTitle: "真夏のもふもふフロートタイム",
    rarity: 5,
    imageUrl: "images/dream-pickups/holonatsu-2026/tsunomaki-watame.png",
    imageAlt: "★5 한여름의 복슬복슬 플로트 타임 츠노마키 와타메 카드 일러스트",
    imagePosition: "50% 43%",
  },
  {
    id: "holonatsu-2026-otonose-kanade",
    talentId: "otonose-kanade",
    cardTitle: "潮風にのせる、笑顔のハーモニー",
    rarity: 5,
    imageUrl: "images/dream-pickups/holonatsu-2026/otonose-kanade.png",
    imageAlt: "★5 바닷바람에 싣는, 미소의 하모니 오토노세 카나데 카드 일러스트",
    imagePosition: "50% 45%",
  },
];

const summerSniperPickupCards = [
  {
    id: "summer-sniper-2026-sakura-miko",
    talentId: "sakura-miko",
    cardTitle: "ビーチで弾ける、光彩ショット！",
    rarity: 5,
    imageUrl: "images/dream-pickups/summer-sniper-2026/sakura-miko.jpg",
    imageAlt: "★5 해변에서 터지는, 광채 샷! 사쿠라 미코 카드 일러스트",
    imagePosition: "48% 36%",
    imageScale: 1.22,
  },
  {
    id: "summer-sniper-2026-hoshimachi-suisei",
    talentId: "hoshimachi-suisei",
    cardTitle: "夏に一閃！水鉄砲のアルペジオ",
    rarity: 5,
    imageUrl: "images/dream-pickups/summer-sniper-2026/hoshimachi-suisei.jpg",
    imageAlt: "★5 여름에 일섬! 물총의 아르페지오 호시마치 스이세이 카드 일러스트",
    imagePosition: "58% 36%",
    imageScale: 1.22,
  },
];

const heatedSummerDayPickupCards = [
  {
    id: "heated-summer-day-2026-mori-calliope",
    talentId: "mori-calliope",
    cardTitle: "ビーチに刺さるReaper's Spike",
    rarity: 5,
    imageUrl: "images/dream-pickups/heated-summer-day-2026/mori-calliope.jpg",
    imageAlt: "★5 해변에 꽂히는 Reaper's Spike 모리 칼리오페 카드 일러스트",
    imagePosition: "40% 35%",
    imageScale: 1.22,
  },
  {
    id: "heated-summer-day-2026-nakiri-ayame",
    talentId: "nakiri-ayame",
    cardTitle: "鬼神流・ぷかぷかリゾート",
    rarity: 5,
    imageUrl: "images/dream-pickups/heated-summer-day-2026/nakiri-ayame.jpg",
    imageAlt: "★5 귀신류 둥실둥실 리조트 나키리 아야메 카드 일러스트",
    imagePosition: "42% 35%",
    imageScale: 1.22,
  },
  {
    id: "heated-summer-day-2026-kureiji-ollie",
    talentId: "kureiji-ollie",
    cardTitle: "常夏のCrazy Dive",
    rarity: 5,
    imageUrl: "images/dream-pickups/heated-summer-day-2026/kureiji-ollie.jpg",
    imageAlt: "★5 한여름의 Crazy Dive 쿠레이지 올리 카드 일러스트",
    imagePosition: "60% 35%",
    imageScale: 1.22,
  },
  {
    id: "heated-summer-day-2026-himemori-luna",
    talentId: "himemori-luna",
    cardTitle: "のんびり姫のおねだりビーチ",
    rarity: 5,
    imageUrl: "images/dream-pickups/heated-summer-day-2026/himemori-luna.jpg",
    imageAlt: "★5 느긋한 공주의 조르는 비치 히메모리 루나 카드 일러스트",
    imagePosition: "62% 35%",
    imageScale: 1.22,
  },
  {
    id: "heated-summer-day-2026-ninomae-inanis",
    talentId: "ninomae-inanis",
    cardTitle: "潮騒の記憶をたどって",
    rarity: 5,
    imageUrl: "images/dream-pickups/heated-summer-day-2026/ninomae-inanis.jpg",
    imageAlt: "★5 파도 소리의 기억을 더듬어 니노마에 이나니스 카드 일러스트",
    imagePosition: "58% 34%",
    imageScale: 1.22,
  },
];

const pickups = [
  {
    id: "heated-summer-day-selectable-2026",
    title: "선택 가능! 「열기를 띤 여름의 하루」 가챠",
    subtitle: "신규 수영복 ★5 5명 중 1명을 선택 · 선택 대상 출현율 상승 · 파크·라이브 의상 포함",
    targetRatePercent: null,
    rateLabel: "선택한 신규 수영복 ★5 한 명",
    rateBreakdown: [],
    startsOn: "2026-08-17",
    endsOn: null,
    startsAt: "2026-08-17T11:00:00+09:00",
    endsAt: null,
    announcedOn: "2026-08-16",
    sourceLabel: "hololive Dreams 공식 X 신규 픽업 공지",
    sourceUrl: "https://x.com/hololive_dreams/status/2089171498506621279",
    scheduleNote:
      "2026년 8월 17일 11시부터 일반형과 동시에 개최됩니다. 칼리오페·아야메·올리·루나·이나 중 한 명을 선택하면 해당 멤버의 출현율이 더 올라갑니다. 종료 시각과 숫자 제공 비율은 외부 공식 채널에 공개되지 않아 게임 내 공지에서 확인해야 합니다.",
    cards: heatedSummerDayPickupCards,
  },
  {
    id: "heated-summer-day-standard-2026",
    title: "「열기를 띤 여름의 하루」 가챠",
    subtitle: "신규 수영복 ★5 칼리오페·아야메·올리·루나·이나 · 파크·라이브 의상 포함",
    targetRatePercent: null,
    rateLabel: "신규 수영복 ★5 다섯 명 전체",
    rateBreakdown: [],
    startsOn: "2026-08-17",
    endsOn: null,
    startsAt: "2026-08-17T11:00:00+09:00",
    endsAt: null,
    announcedOn: "2026-08-16",
    sourceLabel: "hololive Dreams 공식 X 신규 픽업 공지",
    sourceUrl: "https://x.com/hololive_dreams/status/2089171498506621279",
    scheduleNote:
      "2026년 8월 17일 11시부터 선택형과 동시에 개최됩니다. 신규 카드를 획득하면 각 멤버의 파크 의상과 라이브 의상도 함께 획득합니다. 종료 시각과 숫자 제공 비율은 외부 공식 채널에 공개되지 않아 게임 내 공지에서 확인해야 합니다. 신규 멤버는 이후 개최 가챠에도 등장하지만 상시 홀로도리 가챠에서는 배출되지 않습니다.",
    cards: heatedSummerDayPickupCards,
  },
  {
    id: "summer-sniper-2026",
    title: "「두 사람이 여름을 저격!」 가챠",
    subtitle: "신규 수영복 ★5 사쿠라 미코·호시마치 스이세이 · 파크·라이브 의상 포함",
    targetRatePercent: null,
    rateLabel: "신규 수영복 ★5 미코·스이세이",
    rateBreakdown: [],
    startsOn: "2026-08-07",
    endsOn: "2026-08-17",
    startsAt: "2026-08-07T11:00:00+09:00",
    endsAt: "2026-08-17T10:59:59+09:00",
    announcedOn: "2026-08-07",
    sourceLabel: "hololive Dreams 공식 X 신규 픽업 공지",
    sourceUrl: "https://x.com/hololive_dreams/status/2085547563827302723",
    scheduleNote:
      "2026년 8월 7일 11시부터 8월 17일 10시 59분까지 개최됐습니다. 공식 X에는 종료 시각이 없어 게임 내 화면을 기록한 공략 자료와 다음 픽업 전환을 교차 확인했습니다. 두 카드를 획득하면 각각 파크 의상과 라이브 의상도 함께 획득합니다. 제공 비율은 외부 공식 채널에 공개되지 않았습니다.",
    cards: summerSniperPickupCards,
  },
  {
    id: "holonatsu-paradise-2026",
    title: "선택 가능! sunny summer 바캉스! 가챠",
    subtitle: "신규 수영복 ★5 5명 중 1명을 선택 · 선택 1% · 나머지 각 0.25%",
    targetRatePercent: 1,
    rateLabel: "선택한 수영복 ★5 한 명",
    rateBreakdown: [
      { label: "선택한 수영복 ★5", ratePercent: 1 },
      { label: "나머지 수영복 ★5 각", ratePercent: 0.25 },
      { label: "통상 ★5 각", ratePercent: 0.0555 },
      { label: "★5 전체", ratePercent: 5 },
    ],
    startsOn: "2026-07-28",
    endsOn: "2026-08-07",
    startsAt: "2026-07-28T11:00:00+09:00",
    endsAt: "2026-08-07T10:59:59+09:00",
    announcedOn: "2026-07-27",
    sourceLabel: "hololive Dreams 공식 X 픽업 공지",
    sourceUrl: "https://x.com/hololive_dreams/status/2081924023081210346",
    scheduleNote:
      "선택한 카드 1%, 나머지 4장은 각 0.25%입니다. 일반형과 가챠Pt를 공유하며, 200Pt 교환 대상은 게임 내 교환소에서 확인할 수 있습니다.",
    cards: summerPickupCards,
  },
  {
    id: "sunny-summer-vacation-standard-2026",
    title: "sunny summer 바캉스! 가챠",
    subtitle: "신규 수영복 ★5 5명 각 0.4% · 다섯 명 전체 획득 확률 2%",
    targetRatePercent: 2,
    rateLabel: "수영복 ★5 다섯 명 전체",
    rateBreakdown: [
      { label: "수영복 ★5 각", ratePercent: 0.4 },
      { label: "수영복 ★5 5명 전체", ratePercent: 2 },
      { label: "통상 ★5 각", ratePercent: 0.0555 },
      { label: "★5 전체", ratePercent: 5 },
    ],
    startsOn: "2026-07-28",
    endsOn: "2026-08-07",
    startsAt: "2026-07-28T11:00:00+09:00",
    endsAt: "2026-08-07T10:59:59+09:00",
    announcedOn: "2026-07-27",
    sourceLabel: "hololive Dreams 공식 X 픽업 공지",
    sourceUrl: "https://x.com/hololive_dreams/status/2081924023081210346",
    scheduleNote:
      "신규 5장은 각 0.4%(합계 2%)입니다. 선택형과 가챠Pt를 공유하며, 향후 이벤트 가챠에는 다시 등장하지만 상시 홀로도리 가챠에서는 배출되지 않습니다.",
    cards: summerPickupCards,
  },
];

const payload = {
  checkedAt: "2026-08-20T11:40:36+09:00",
  sourceUrl: "https://www.hololive-dreams.com/en",
  officialNewsUrl: "https://hololive.hololivepro.com/en/news/20260723-01-401/",
  sourceNote:
    "hololive Dreams 공식 사이트에 공개된 출시 캐릭터 54명과 공식 썸네일을 사용합니다. 로스터·다운로드 링크와 현재 픽업은 공식 웹·X에서 2026-08-20 재확인했고, 개별 제공 비율은 게임 내 제공 비율 화면을 기준으로 2026-07-29 확인했습니다. 8월 7일 미코·스이세이 픽업 종료는 게임 내 화면 기반 공략 자료와 다음 픽업 전환을 교차 확인했습니다. 8월 17일 신규 칼리오페·아야메·올리·루나·이나 픽업의 종료 시각과 숫자 제공 비율은 외부 공식 채널에 공개되지 않아 확인 필요로 표시합니다.",
  launchDate: "2026-07-23",
  game: {
    title: "hololive Dreams",
    shortName: "홀로도리",
    genre: "Rhythm & RPG",
    pricing: "무료 플레이 · 인앱 구매",
    officialUrl: "https://www.hololive-dreams.com/en",
    appStoreUrl: "https://itunes.apple.com/us/app/id6756641249?mt=8",
    googlePlayUrl: "https://play.google.com/store/apps/details?id=game.qualiarts.hololive.dreams.com",
    steamUrl: "https://store.steampowered.com/app/4282500/hololive_Dreams",
  },
  rarities: [3, 4, 5],
  ratesPublishedOnOfficialWeb: false,
  gachaRates: {
    verifiedAt: "2026-07-29T12:00:00+09:00",
    sourceLabel: "게임 내 제공 비율",
    normalRates: {
      star3: 85,
      star4: 10,
      star5: 5,
    },
    guaranteedTenthRates: {
      star3: 0,
      star4: 95,
      star5: 5,
    },
    targetPresets: [
      {
        id: "summer-selected-star5",
        label: "선택형에서 고른 수영복 ★5 1명",
        shortLabel: "선택한 1명",
        ratePercent: 1,
        note: "선택 가능 가챠에서 직접 고른 수영복 ★5 한 명",
      },
      {
        id: "summer-any-star5",
        label: "일반형 수영복 ★5 5명 전체",
        shortLabel: "수영복 5명",
        ratePercent: 2,
        note: "일반형에서 신규 수영복 ★5 다섯 명 중 아무나",
      },
      {
        id: "summer-standard-specific-star5",
        label: "일반형 특정 수영복 ★5 1명",
        shortLabel: "수영복 특정 1명",
        ratePercent: 0.4,
        note: "일반형에서 지정한 수영복 ★5 한 명",
      },
      {
        id: "summer-unselected-star5",
        label: "선택형 비선택 수영복 ★5 1명",
        shortLabel: "비선택 수영복",
        ratePercent: 0.25,
        note: "선택형에서 고르지 않은 수영복 ★5 한 명",
      },
      {
        id: "summer-permanent-specific-star5",
        label: "여름 가챠 통상 ★5 1명",
        shortLabel: "여름 통상 ★5",
        ratePercent: 0.0555,
        note: "두 여름 가챠에 포함된 통상 ★5 중 특정 한 명",
      },
      {
        id: "standard-specific-star5",
        label: "통상 특정 ★5 멤버",
        shortLabel: "통상 특정 ★5",
        ratePercent: 0.0925,
        note: "상시 홀로도리 가챠의 특정 ★5 멤버 1명",
      },
      {
        id: "any-star5",
        label: "아무 ★5 멤버",
        shortLabel: "★5 전체",
        ratePercent: 5,
        note: "멤버와 관계없이 ★5가 나올 전체 확률",
      },
      {
        id: "beginner-selected-star5",
        label: "초심자 선택 픽업 ★5",
        shortLabel: "선택 픽업",
        ratePercent: 0.6666,
        note: "초심자 응원 가챠에서 선택한 특정 ★5 멤버 1명",
      },
      {
        id: "beginner-unselected-star5",
        label: "초심자 비선택 ★5",
        shortLabel: "비선택 ★5",
        ratePercent: 0.0588,
        note: "초심자 응원 가챠에서 선택하지 않은 특정 ★5 멤버 1명",
      },
    ],
    rateReferenceUrl: "https://game8.jp/hololive-dreams/801993",
    pickupReferenceUrl: "https://x.com/hololive_dreams/status/2089171498506621279",
    screenshotReferenceUrl:
      "https://appmedia.jp/wp-content/uploads/2026/07/135040_8l2nf.webp",
    officialNoticeUrl:
      "https://www.hololive-dreams.com/news/detail/aku8rsuo9",
  },
  pickups,
  characters,
};

const requiredCharacterFields = [
  "id",
  "talentId",
  "name",
  "nameKo",
  "nativeName",
  "branch",
  "generation",
  "imageUrl",
  "accent",
];
if (characters.length !== 54) {
  throw new Error(`공식 캐릭터 수가 54명이 아닙니다: ${characters.length}`);
}
if (new Set(characters.map(({ id }) => id)).size !== characters.length) {
  throw new Error("캐릭터 ID가 중복되었습니다.");
}
for (const character of characters) {
  for (const field of requiredCharacterFields) {
    if (typeof character[field] !== "string" || character[field].trim() === "") {
      throw new Error(`${character.name}: ${field} 필드가 비어 있습니다.`);
    }
  }
  const image = new URL(character.imageUrl);
  if (
    image.hostname !== "images.microcms-assets.io" ||
    !decodeURIComponent(image.pathname).endsWith("-thumb.png")
  ) {
    throw new Error(`${character.name}: 공식 썸네일 형식이 아닙니다.`);
  }
}

const pickupCardsById = new Map();
const baseCharacterIds = new Set(characters.map(({ id }) => id));
const pickupIds = new Set();
const publicRoot = path.join(projectRoot, "public");
for (const pickup of pickups) {
  if (
    !pickup.id ||
    !pickup.title ||
    !pickup.rateLabel ||
    !pickup.startsOn ||
    !pickup.sourceUrl
  ) {
    throw new Error(`픽업 필수 정보가 비어 있습니다: ${pickup.id}`);
  }
  if (pickupIds.has(pickup.id)) {
    throw new Error(`픽업 ID가 중복되었습니다: ${pickup.id}`);
  }
  pickupIds.add(pickup.id);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(pickup.startsOn) ||
    (pickup.endsOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(pickup.endsOn))
  ) {
    throw new Error(`픽업 날짜 형식이 올바르지 않습니다: ${pickup.id}`);
  }
  const startsAt = Date.parse(
    pickup.startsAt ?? `${pickup.startsOn}T00:00:00+09:00`,
  );
  const endsAt = pickup.endsAt
    ? Date.parse(pickup.endsAt)
    : pickup.endsOn
      ? Date.parse(`${pickup.endsOn}T23:59:59+09:00`)
      : null;
  if (
    !Number.isFinite(startsAt) ||
    (endsAt !== null && (!Number.isFinite(endsAt) || startsAt > endsAt))
  ) {
    throw new Error(`픽업 시작·종료 시각이 올바르지 않습니다: ${pickup.id}`);
  }
  if (
    pickup.targetRatePercent !== null &&
    (!Number.isFinite(pickup.targetRatePercent) ||
      pickup.targetRatePercent <= 0 ||
      pickup.targetRatePercent > 100)
  ) {
    throw new Error(`픽업 확률이 올바르지 않습니다: ${pickup.id}`);
  }
  if (
    (pickup.targetRatePercent !== null && !pickup.rateBreakdown.length) ||
    pickup.rateBreakdown.some(
      ({ label, ratePercent }) =>
        !label ||
        !Number.isFinite(ratePercent) ||
        ratePercent <= 0 ||
        ratePercent > 100,
    )
  ) {
    throw new Error(`픽업 세부 확률이 올바르지 않습니다: ${pickup.id}`);
  }
  if (!pickup.cards.length) {
    throw new Error(`픽업 카드가 비어 있습니다: ${pickup.id}`);
  }
  const cardIdsInPickup = new Set();
  for (const card of pickup.cards) {
    if (!card.id || !card.cardTitle || !card.imageUrl || !card.imageAlt) {
      throw new Error(`${pickup.id}: 픽업 카드 필수 정보가 비어 있습니다.`);
    }
    if (cardIdsInPickup.has(card.id)) {
      throw new Error(
        `같은 픽업 일정에 카드 ID가 중복되었습니다: ${pickup.id} · ${card.id}`,
      );
    }
    cardIdsInPickup.add(card.id);
    if (baseCharacterIds.has(card.id)) {
      throw new Error(`픽업 카드 ID가 기본 캐릭터와 충돌합니다: ${card.id}`);
    }
    const previousCard = pickupCardsById.get(card.id);
    if (previousCard) {
      const identityFields = [
        "talentId",
        "cardTitle",
        "rarity",
        "imageUrl",
        "imageAlt",
        "imagePosition",
        "imageScale",
      ];
      const hasConflictingIdentity = identityFields.some(
        (field) => (previousCard[field] ?? null) !== (card[field] ?? null),
      );
      if (hasConflictingIdentity) {
        throw new Error(
          `같은 픽업 카드 ID에 서로 다른 카드 정보가 있습니다: ${card.id}`,
        );
      }
    } else {
      pickupCardsById.set(card.id, card);
    }
    if (!talentPayload.talents.some(({ id }) => id === card.talentId)) {
      throw new Error(
        `${pickup.id}: talents.json에서 찾을 수 없는 픽업 멤버 ${card.talentId}`,
      );
    }
    if (card.rarity !== null && !payload.rarities.includes(card.rarity)) {
      throw new Error(`${pickup.id}: 지원하지 않는 카드 등급 ${card.rarity}`);
    }
    if (
      card.imageScale !== undefined &&
      (!Number.isFinite(card.imageScale) ||
        card.imageScale < 0.5 ||
        card.imageScale > 3)
    ) {
      throw new Error(`${pickup.id}: 이미지 배율이 올바르지 않습니다: ${card.id}`);
    }
    if (
      card.imagePosition !== undefined &&
      !/^\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(card.imagePosition)
    ) {
      throw new Error(`${pickup.id}: 이미지 위치가 올바르지 않습니다: ${card.id}`);
    }
    const cardImagePath = path.resolve(publicRoot, card.imageUrl);
    if (!cardImagePath.startsWith(`${publicRoot}${path.sep}`)) {
      throw new Error(`${pickup.id}: 이미지 경로가 public 밖을 가리킵니다.`);
    }
    await access(cardImagePath);
  }
}

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `hololive Dreams 데이터 생성 완료: ${characters.length}명 · 픽업 ${pickups.length}건`,
);
