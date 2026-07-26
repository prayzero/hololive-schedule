import { readFile, writeFile } from "node:fs/promises";
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

const payload = {
  checkedAt: "2026-07-26T00:00:00+09:00",
  sourceUrl: "https://www.hololive-dreams.com/en",
  officialNewsUrl: "https://hololive.hololivepro.com/en/news/20260723-01-401/",
  sourceNote:
    "hololive Dreams 공식 영어 사이트에 공개된 출시 캐릭터 54명과 공식 썸네일을 사용합니다. 공개 공식 웹사이트에는 소환 확률·픽업 확률·천장 규칙이 게시되어 있지 않으므로 계산기에는 게임 내 배너의 제공 비율을 직접 입력해야 합니다.",
  launchDate: "2026-07-23",
  game: {
    title: "hololive Dreams",
    shortName: "홀로도리",
    genre: "Rhythm & RPG",
    pricing: "무료 플레이 · 인앱 구매",
    officialUrl: "https://www.hololive-dreams.com/en",
    appStoreUrl: "https://apps.apple.com/jp/app/id6756641135",
    googlePlayUrl: "https://play.google.com/store/apps/details?id=game.qualiarts.hololive.dreams.jp",
    steamUrl: "https://store.steampowered.com/app/4282500/hololive_Dreams",
  },
  rarities: [3, 4, 5],
  ratesPublishedOnOfficialWeb: false,
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

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`hololive Dreams 데이터 생성 완료: ${characters.length}명`);
