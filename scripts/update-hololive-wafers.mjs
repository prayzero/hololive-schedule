import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputPath = path.join(
  projectRoot,
  "public",
  "data",
  "hololive-wafers.json",
);

const checkedAt = new Date().toISOString();
const cutoffDate = "2026-08-20";
const series = "bandai-hololive-wafer";
const officialProductIndexUrl =
  "https://www.bandai.co.jp/candy/characters/character462/index.html";
const memberRarityId = "wafer-member-card";
const groupRarityId = "wafer-group-foil-card";

const memberEntries = [
  ["tokino-sora", "ときのそら"],
  ["robocosan", "ロボ子さん"],
  ["sakura-miko", "さくらみこ"],
  ["hoshimachi-suisei", "星街すいせい"],
  ["azki", "AZKi"],
  ["yozora-mel", "夜空メル"],
  ["aki-rosenthal", "アキ・ローゼンタール"],
  ["akai-haato", "赤井はあと"],
  ["shirakami-fubuki", "白上フブキ"],
  ["natsuiro-matsuri", "夏色まつり"],
  ["minato-aqua", "湊あくあ"],
  ["murasaki-shion", "紫咲シオン"],
  ["nakiri-ayame", "百鬼あやめ"],
  ["yuzuki-choco", "癒月ちょこ"],
  ["oozora-subaru", "大空スバル"],
  ["ookami-mio", "大神ミオ"],
  ["nekomata-okayu", "猫又おかゆ"],
  ["inugami-korone", "戌神ころね"],
  ["usada-pekora", "兎田ぺこら"],
  ["shiranui-flare", "不知火フレア"],
  ["shirogane-noel", "白銀ノエル"],
  ["houshou-marine", "宝鐘マリン"],
  ["amane-kanata", "天音かなた"],
  ["tsunomaki-watame", "角巻わため"],
  ["tokoyami-towa", "常闇トワ"],
  ["himemori-luna", "姫森ルーナ"],
  ["yukihana-lamy", "雪花ラミィ"],
  ["momosuzu-nene", "桃鈴ねね"],
  ["shishiro-botan", "獅白ぼたん"],
  ["omaru-polka", "尾丸ポルカ"],
  ["laplus-darknesss", "ラプラス・ダークネス"],
  ["takane-lui", "鷹嶺ルイ"],
  ["hakui-koyori", "博衣こより"],
  ["sakamata-chloe", "沙花叉クロヱ"],
  ["kazama-iroha", "風真いろは"],
  ["ayunda-risu", "アユンダ・リス"],
  ["moona-hoshinova", "ムーナ・ホシノヴァ"],
  ["airani-iofifteen", "アイラニ・イオフィフティーン"],
  ["kureiji-ollie", "クレイジー・オリー"],
  ["anya-melfissa", "アーニャ・メルフィッサ"],
  ["pavolia-reine", "パヴォリア・レイネ"],
  ["vestia-zeta", "ベスティア・ゼータ"],
  ["kaela-kovalskia", "カエラ・コヴァルスキア"],
  ["kobo-kanaeru", "こぼ・かなえる"],
  ["mori-calliope", "森カリオペ"],
  ["takanashi-kiara", "小鳥遊キアラ"],
  ["ninomae-inanis", "一伊那尓栖"],
  ["gawr-gura", "がうる・ぐら"],
  ["watson-amelia", "ワトソン・アメリア"],
  ["irys", "IRyS"],
  ["ceres-fauna", "セレス・ファウナ"],
  ["ouro-kronii", "オーロ・クロニー"],
  ["nanashi-mumei", "七詩ムメイ"],
  ["hakos-baelz", "ハコス・ベールズ"],
  ["shiori-novella", "シオリ・ノヴェラ"],
  ["koseki-bijou", "古石ビジュー"],
  ["nerissa-ravencroft", "ネリッサ・レイヴンクロフト"],
  ["fuwawa-abyssgard", "フワワ・アビスガード"],
  ["mococo-abyssgard", "モココ・アビスガード"],
  ["hiodoshi-ao", "火威青"],
  ["otonose-kanade", "音乃瀬奏"],
  ["ichijou-ririka", "一条莉々華"],
  ["juufuutei-raden", "儒烏風亭らでん"],
  ["todoroki-hajime", "轟はじめ"],
  ["elizabeth-rose-bloodflame", "エリザベス・ローズ・ブラッドフレイム"],
  ["gigi-murin", "ジジ・ムリン"],
  ["cecilia-immergreen", "セシリア・イマーグリーン"],
  ["raora-panthera", "ラオーラ・パンテーラ"],
  ["hibikisaki-riona", "響咲リオナ"],
  ["koganei-niko", "虎金妃笑虎"],
  ["mizumiya-suu", "水宮枢"],
  ["rindo-chihaya", "輪堂千速"],
  ["kikirara-vivi", "綺々羅々ヴィヴィ"],
];

const members = new Map(
  memberEntries.map(([id, title]) => [id, { id, title }]),
);

const groupEntries = [
  [
    "0th-gen",
    "0期生",
    ["tokino-sora", "robocosan", "sakura-miko", "hoshimachi-suisei", "azki"],
  ],
  [
    "1st-gen",
    "1期生",
    ["yozora-mel", "aki-rosenthal", "akai-haato", "shirakami-fubuki", "natsuiro-matsuri"],
  ],
  [
    "1st-gen-without-mel",
    "1期生",
    ["aki-rosenthal", "akai-haato", "shirakami-fubuki", "natsuiro-matsuri"],
  ],
  [
    "2nd-gen",
    "2期生",
    ["minato-aqua", "murasaki-shion", "nakiri-ayame", "yuzuki-choco", "oozora-subaru"],
  ],
  [
    "hololive-gamers",
    "ホロライブゲーマーズ",
    ["shirakami-fubuki", "ookami-mio", "nekomata-okayu", "inugami-korone"],
  ],
  [
    "3rd-gen",
    "3期生",
    ["usada-pekora", "shiranui-flare", "shirogane-noel", "houshou-marine"],
  ],
  [
    "4th-gen",
    "4期生",
    ["amane-kanata", "tsunomaki-watame", "tokoyami-towa", "himemori-luna"],
  ],
  [
    "5th-gen",
    "5期生",
    ["yukihana-lamy", "momosuzu-nene", "shishiro-botan", "omaru-polka"],
  ],
  [
    "holox",
    "秘密結社holoX",
    ["laplus-darknesss", "takane-lui", "hakui-koyori", "sakamata-chloe", "kazama-iroha"],
  ],
  [
    "holoid-gen1",
    "hololive Indonesia 1期生",
    ["ayunda-risu", "moona-hoshinova", "airani-iofifteen"],
  ],
  [
    "holoid-gen2",
    "hololive Indonesia 2期生",
    ["kureiji-ollie", "anya-melfissa", "pavolia-reine"],
  ],
  [
    "holoid-gen3",
    "hololive Indonesia 3期生",
    ["vestia-zeta", "kaela-kovalskia", "kobo-kanaeru"],
  ],
  [
    "holoen-myth",
    "hololive English -Myth-",
    ["mori-calliope", "takanashi-kiara", "ninomae-inanis", "gawr-gura", "watson-amelia"],
  ],
  [
    "holoen-promise",
    "hololive English -Promise-",
    ["irys", "ceres-fauna", "ouro-kronii", "nanashi-mumei", "hakos-baelz"],
  ],
  [
    "holoen-advent",
    "hololive English -Advent-",
    ["shiori-novella", "koseki-bijou", "nerissa-ravencroft", "fuwawa-abyssgard", "mococo-abyssgard"],
  ],
  [
    "regloss",
    "ReGLOSS",
    ["hiodoshi-ao", "otonose-kanade", "ichijou-ririka", "juufuutei-raden", "todoroki-hajime"],
  ],
];

const groups = new Map(
  groupEntries.map(([id, title, memberIds]) => [
    id,
    { id, title, memberIds },
  ]),
);

const imageSize = "322.6% 218.6%";
// The official group-card sheets use either a 2x2 or a 2+1 landscape grid.
// These values keep the source image's square aspect ratio inside the 5:7
// thumbnail while isolating one row and cropping only the outer card margins.
const groupImageSize = "260% 185.7%";
const layoutPositions = {
  six: [
    "2.5% 3.4%",
    "50% 3.4%",
    "97.3% 3.4%",
    "2.5% 91.6%",
    "50% 91.6%",
    "97.3% 91.6%",
  ],
  five: [
    "2.5% 3.4%",
    "50% 3.4%",
    "97.3% 3.4%",
    "24% 91.6%",
    "76% 91.6%",
  ],
  four: [
    "24% 3.4%",
    "76% 3.4%",
    "24% 91.6%",
    "76% 91.6%",
  ],
  threeBottom: ["2.5% 91.6%", "50% 91.6%", "97.3% 91.6%"],
  groupFour: ["9.4% 0%", "90.6% 0%", "9.4% 100%", "90.6% 100%"],
  groupThree: ["9.4% 0%", "90.6% 0%", "50% 100%"],
};

const memberSheet = (url, memberIds, layout) => ({
  url,
  cardKeys: memberIds.map((id) => `member:${id}`),
  layout,
});

const groupSheet = (url, groupIds) => ({
  url,
  cardKeys: groupIds.map((id) => `group:${id}`),
  layout: groupIds.length === 4 ? "groupFour" : "groupThree",
});

const releaseDefinitions = [
  {
    id: "hololive-wafer-2022",
    name: "ホロライブ ウエハース",
    shortName: "웨하스 1탄",
    releaseDate: "2022-03-21",
    sourceUrl:
      "https://www.bandai.co.jp/candy/products/2022/4549660699910000.html",
    productImageUrl:
      "https://www.bandai.co.jp/candy/published/bnc_files/product/PV3/0000003234612zu5a0uier1s8zvdITFrNV68CdJAGIie9PV3.jpg",
    memberIds: [
      "tokino-sora", "robocosan", "yozora-mel", "aki-rosenthal", "akai-haato", "shirakami-fubuki",
      "natsuiro-matsuri", "minato-aqua", "murasaki-shion", "nakiri-ayame", "yuzuki-choco", "oozora-subaru",
      "azki", "ookami-mio", "sakura-miko", "nekomata-okayu", "inugami-korone", "hoshimachi-suisei",
      "usada-pekora", "shiranui-flare", "shirogane-noel", "houshou-marine", "amane-kanata", "tsunomaki-watame",
      "tokoyami-towa", "himemori-luna", "yukihana-lamy", "momosuzu-nene", "shishiro-botan", "omaru-polka",
    ],
    groupIds: ["0th-gen", "1st-gen", "2nd-gen", "hololive-gamers", "3rd-gen", "4th-gen", "5th-gen"],
    sheets: [
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/Ove/000000323465mXVk3GmEiiQYqFV4bGzLofjx988xsQ4M0Ove.jpg", ["tokino-sora", "robocosan", "yozora-mel", "aki-rosenthal", "akai-haato", "shirakami-fubuki"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/MOE/0000003234696FmyIQXKPZbyZQbHFTxBPfjRm5PmWGxqlMOE.jpg", ["natsuiro-matsuri", "minato-aqua", "murasaki-shion", "nakiri-ayame", "yuzuki-choco", "oozora-subaru"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/jwi/0000003234737oh2gw6OixrYrBm3Aa0fukCBCMOzNyajLjwi.jpg", ["azki", "ookami-mio", "sakura-miko", "nekomata-okayu", "inugami-korone", "hoshimachi-suisei"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/KfL/0000003234777cV6NsGBCakIVpXLyD5LoJzi9UNnTJ67IKfL.jpg", ["usada-pekora", "shiranui-flare", "shirogane-noel", "houshou-marine", "amane-kanata", "tsunomaki-watame"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/Ezz/000000323481utLYBqldCDkfFRCHIngZ0f7gkCEWXI7UqEzz.jpg", ["tokoyami-towa", "himemori-luna", "yukihana-lamy", "momosuzu-nene", "shishiro-botan", "omaru-polka"], "six"),
      groupSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/Z0I/00000032348510QpvfBVFIpQxfdsmf0W6CVpr8PV6jkjcZ0I.jpg", ["0th-gen", "1st-gen", "2nd-gen", "hololive-gamers"]),
      groupSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/y5b/000000323489ur090YzAOgLjgvgVdfhWvKDRPGwR2Oh2Xy5b.jpg", ["3rd-gen", "4th-gen", "5th-gen"]),
    ],
  },
  {
    id: "hololive-wafer-2-2023",
    name: "ホロライブ ウエハース2",
    shortName: "웨하스 2탄",
    releaseDate: "2023-03-20",
    sourceUrl:
      "https://www.bandai.co.jp/candy/products/2023/4549660821076000.html",
    productImageUrl:
      "https://www.bandai.co.jp/candy/published/bnc_files/product/dTz/000000358898G6CSaR16jfk8DtVu6G5uteDZ0jM6NeNXudTz.jpg",
    memberIds: [
      "tokino-sora", "robocosan", "yozora-mel", "aki-rosenthal", "akai-haato", "shirakami-fubuki",
      "natsuiro-matsuri", "minato-aqua", "murasaki-shion", "nakiri-ayame", "yuzuki-choco", "oozora-subaru",
      "azki", "ookami-mio", "sakura-miko", "nekomata-okayu", "inugami-korone", "hoshimachi-suisei",
      "usada-pekora", "shiranui-flare", "shirogane-noel", "houshou-marine", "amane-kanata", "tsunomaki-watame",
      "tokoyami-towa", "himemori-luna", "yukihana-lamy", "momosuzu-nene", "shishiro-botan", "omaru-polka",
      "laplus-darknesss", "takane-lui", "hakui-koyori", "sakamata-chloe", "kazama-iroha",
    ],
    groupIds: ["0th-gen", "1st-gen", "2nd-gen", "hololive-gamers", "3rd-gen", "4th-gen", "5th-gen", "holox"],
    sheets: [
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/cAB/0000003589024gYsTps6gcSZc21JYCOzL09D4Vk984FZxcAB.jpg", ["tokino-sora", "robocosan", "yozora-mel", "aki-rosenthal", "akai-haato", "shirakami-fubuki"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/RiG/000000358906tf02HCDacl04Sfxyjyp7qJzGP4usAKZS6RiG.jpg", ["natsuiro-matsuri", "minato-aqua", "murasaki-shion", "nakiri-ayame", "yuzuki-choco", "oozora-subaru"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/tgo/000000358910r6nF6xwYPu0oRhJ9s0iWUpjmNpFACio7ztgo.jpg", ["azki", "ookami-mio", "sakura-miko", "nekomata-okayu", "inugami-korone", "hoshimachi-suisei"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/c07/000000358914UfqLs4st3Y6IyjuKYUgNpXpruPZzzzrLKc07.jpg", ["usada-pekora", "shiranui-flare", "shirogane-noel", "houshou-marine", "amane-kanata", "tsunomaki-watame"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/hFP/000000358918z1DGk3NowcIuQT14E2yPJjfi3gOHj8F5OhFP.jpg", ["tokoyami-towa", "himemori-luna", "yukihana-lamy", "momosuzu-nene", "shishiro-botan", "omaru-polka"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/OwY/0000003589222NRzWmgLkDSZEHl6zbByG7KaJdb9JaE5TOwY.jpg", ["laplus-darknesss", "takane-lui", "hakui-koyori", "sakamata-chloe", "kazama-iroha"], "five"),
      groupSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/1iV/000000358926OkTEaaTEAllmbPkMXgprlriKzwmN9oQ5M1iV.jpg", ["0th-gen", "1st-gen", "2nd-gen", "hololive-gamers"]),
      groupSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/6Zz/000000358930kJMR6fNQuPizLjst1xXbJoL5kHpW0SkHg6Zz.jpg", ["3rd-gen", "4th-gen", "5th-gen", "holox"]),
    ],
  },
  {
    id: "hololive-production-wafer-expo-2024-vol1",
    name: "ホロライブプロダクション ウエハース -hololive SUPER EXPO 2024 vol.1-",
    shortName: "EXPO 2024 vol.1",
    releaseDate: "2024-04-22",
    sourceUrl:
      "https://www.bandai.co.jp/candy/products/2024/4549660958307000.html",
    productImageUrl:
      "https://www.bandai.co.jp/candy/published/bnc_files/product/LiZ/000000398095o925SUM4balonC9EKcxXCf5SeTNff56F0LiZ.jpg",
    memberIds: [
      "usada-pekora", "shiranui-flare", "shirogane-noel", "houshou-marine",
      "amane-kanata", "tsunomaki-watame", "tokoyami-towa", "himemori-luna",
      "yukihana-lamy", "momosuzu-nene", "shishiro-botan", "omaru-polka",
      "laplus-darknesss", "takane-lui", "hakui-koyori", "sakamata-chloe", "kazama-iroha",
      "kureiji-ollie", "anya-melfissa", "pavolia-reine", "vestia-zeta", "kaela-kovalskia", "kobo-kanaeru",
      "irys", "ceres-fauna", "ouro-kronii", "nanashi-mumei", "hakos-baelz",
      "shiori-novella", "koseki-bijou", "nerissa-ravencroft", "fuwawa-abyssgard", "mococo-abyssgard",
    ],
    groupIds: ["3rd-gen", "4th-gen", "5th-gen", "holox", "holoid-gen2", "holoid-gen3", "holoen-promise", "holoen-advent"],
    sheets: [
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/70P/000000398099LssGAAg5KW8NC5wIPcaNSQiH5qpjvGgA870P.jpg", ["usada-pekora", "shiranui-flare", "shirogane-noel", "houshou-marine"], "four"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/QuZ/0000003981033g22bHlwPuvgUCxde7jtMGQQ4VQsjExoaQuZ.jpg", ["amane-kanata", "tsunomaki-watame", "tokoyami-towa", "himemori-luna"], "four"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/aL2/000000398107kT7X6KGKRWu6ofLJpYPSRqNAp6fVzoRajaL2.jpg", ["yukihana-lamy", "momosuzu-nene", "shishiro-botan", "omaru-polka"], "four"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/Y5Y/000000398111psuB3pM7zQzh2lraa1M85BNizslmkaKU5Y5Y.jpg", ["laplus-darknesss", "takane-lui", "hakui-koyori", "sakamata-chloe", "kazama-iroha"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/Xi7/000000398115dmFntqLKg9Mkxj10gmjzn50EzwNfUX67aXi7.jpg", ["kureiji-ollie", "anya-melfissa", "pavolia-reine", "vestia-zeta", "kaela-kovalskia", "kobo-kanaeru"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/Vc1/0000003981191VUceD3wUVCRlhlYoDXkivpBs6BQ7N3hJVc1.jpg", ["irys", "ceres-fauna", "ouro-kronii", "nanashi-mumei", "hakos-baelz"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/UBw/000000398123LQK7yuIqgWIH2FxhzUSl8uwMd9ZjJPd4CUBw.jpg", ["shiori-novella", "koseki-bijou", "nerissa-ravencroft", "fuwawa-abyssgard", "mococo-abyssgard"], "five"),
      groupSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/0oa/000000398127GTFDmhveXhdlfbn3XMJiIdRT1YRIH2YB70oa.jpg", ["3rd-gen", "4th-gen", "5th-gen", "holox"]),
      groupSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/hqd/0000003981311KohiAKkSG7xMTB1ujmK9EaSTF2tsRlGnhqd.jpg", ["holoid-gen2", "holoid-gen3", "holoen-promise", "holoen-advent"]),
    ],
  },
  {
    id: "hololive-production-wafer-expo-2024-vol2",
    name: "ホロライブプロダクション ウエハース -hololive SUPER EXPO 2024 vol.2-",
    shortName: "EXPO 2024 vol.2",
    releaseDate: "2024-05-13",
    sourceUrl:
      "https://www.bandai.co.jp/candy/products/2024/4570117910968000.html",
    productImageUrl:
      "https://www.bandai.co.jp/candy/published/bnc_files/product/UWg/000000400999vCRrMDSXqFmNfgvTutdYZWcZrErnQ0zqTUWg.jpg",
    memberIds: [
      "tokino-sora", "robocosan", "azki", "sakura-miko", "hoshimachi-suisei",
      "aki-rosenthal", "akai-haato", "shirakami-fubuki", "natsuiro-matsuri",
      "minato-aqua", "murasaki-shion", "nakiri-ayame", "yuzuki-choco", "oozora-subaru",
      "ookami-mio", "nekomata-okayu", "inugami-korone",
      "ayunda-risu", "moona-hoshinova", "airani-iofifteen",
      "mori-calliope", "takanashi-kiara", "ninomae-inanis", "gawr-gura", "watson-amelia",
      "hiodoshi-ao", "otonose-kanade", "ichijou-ririka", "juufuutei-raden", "todoroki-hajime",
    ],
    groupIds: ["0th-gen", "1st-gen-without-mel", "2nd-gen", "hololive-gamers", "holoid-gen1", "holoen-myth", "regloss"],
    sheets: [
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/YAK/000000401003O4tCiXBhCwFGmi5iyxmKOhXkxIyLoWUtSYAK.jpg", ["tokino-sora", "robocosan", "azki", "sakura-miko", "hoshimachi-suisei"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/w0Y/000000401007e3JGKGu5tBSMs5qa31J99EUNIfgJ9klCPw0Y.jpg", ["aki-rosenthal", "akai-haato", "shirakami-fubuki", "natsuiro-matsuri"], "four"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/mLl/000000401011YzfJGL8p3AD47WCBAY3PPHi5UYK4HGmnMmLl.jpg", ["minato-aqua", "murasaki-shion", "nakiri-ayame", "yuzuki-choco", "oozora-subaru"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/qZl/000000401015bo3Q0WHfS3zLpPRMEKu4DvE15wEZuXNZoqZl.jpg", ["ookami-mio", "nekomata-okayu", "inugami-korone"], "threeBottom"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/MxL/0000004010197sO5IwlLWc0xAYQnV1rNK5CXhuySiSkpaMxL.jpg", ["ayunda-risu", "moona-hoshinova", "airani-iofifteen"], "threeBottom"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/j8U/000000401023LyHjdPewsdzmdCMjk8cQATBGs74VnniiGj8U.jpg", ["mori-calliope", "takanashi-kiara", "ninomae-inanis", "gawr-gura", "watson-amelia"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/HRS/000000401027slxU6EJgnBraZy7stvQQQRbvTABpnUO5iHRS.jpg", ["hiodoshi-ao", "otonose-kanade", "ichijou-ririka", "juufuutei-raden", "todoroki-hajime"], "five"),
      groupSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/s4r/000000401031jOAyj51SlX3YjqTrFqOxMdrnkt0ZE4ySAs4r.jpg", ["0th-gen", "1st-gen-without-mel", "2nd-gen", "hololive-gamers"]),
      groupSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/kZt/000000401035t3jmgAQzsHXeywepDZTpTk1D8YNqo0TitkZt.jpg", ["holoid-gen1", "holoen-myth", "regloss"]),
    ],
  },
  {
    id: "hololive-production-wafer-vol3-2025",
    name: "ホロライブプロダクション ウエハース vol.3",
    shortName: "웨하스 vol.3",
    releaseDate: "2025-06-30",
    sourceUrl:
      "https://www.bandai.co.jp/candy/products/2025/4570117917110000.html",
    productImageUrl:
      "https://www.bandai.co.jp/candy/published/bnc_files/product/zHw/0000004402314NHP5JjvjYksGsbiUfAa5Rh1pNO72WLBuzHw.jpg",
    memberIds: [
      "tokino-sora", "robocosan", "aki-rosenthal", "akai-haato", "shirakami-fubuki",
      "natsuiro-matsuri", "murasaki-shion", "nakiri-ayame", "yuzuki-choco", "oozora-subaru", "azki",
      "ookami-mio", "sakura-miko", "nekomata-okayu", "inugami-korone", "hoshimachi-suisei", "usada-pekora",
      "shiranui-flare", "shirogane-noel", "houshou-marine", "amane-kanata", "tsunomaki-watame", "tokoyami-towa",
      "himemori-luna", "yukihana-lamy", "momosuzu-nene", "shishiro-botan", "omaru-polka", "laplus-darknesss",
      "takane-lui", "hakui-koyori", "kazama-iroha", "ayunda-risu", "moona-hoshinova", "airani-iofifteen",
      "kureiji-ollie", "anya-melfissa", "pavolia-reine", "vestia-zeta", "kaela-kovalskia", "kobo-kanaeru",
      "mori-calliope", "takanashi-kiara", "ninomae-inanis", "gawr-gura",
      "irys", "ouro-kronii", "nanashi-mumei", "hakos-baelz",
    ],
    groupIds: [],
    sheets: [
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/HgT/000000440235KFXqCfSr532CroPX3JqQ3CnjPZr43P7FMHgT.jpg", ["tokino-sora", "robocosan", "aki-rosenthal", "akai-haato", "shirakami-fubuki"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/5wl/000000440239hwrLu5hM4mVE0y8fC8SpTqJ0Nm29adbRM5wl.jpg", ["natsuiro-matsuri", "murasaki-shion", "nakiri-ayame", "yuzuki-choco", "oozora-subaru", "azki"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/QIJ/000000440243MCPjQNxrgWosYTBtCG7rIwko2LPwkIYy1QIJ.jpg", ["ookami-mio", "sakura-miko", "nekomata-okayu", "inugami-korone", "hoshimachi-suisei", "usada-pekora"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/42q/0000004402476mvQZqgdLpLl2bAw8e1tTxEi3vhA4WA5T42q.jpg", ["shiranui-flare", "shirogane-noel", "houshou-marine", "amane-kanata", "tsunomaki-watame", "tokoyami-towa"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/lEn/000000440251NeCcXk4P4mbsWA0omxpYwpcqib7ZGD0JBlEn.jpg", ["himemori-luna", "yukihana-lamy", "momosuzu-nene", "shishiro-botan", "omaru-polka", "laplus-darknesss"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/mUh/000000440255g8vrP8eqB1Q968VVnmTTpGJeRMDOfAxmNmUh.jpg", ["takane-lui", "hakui-koyori", "kazama-iroha", "ayunda-risu", "moona-hoshinova", "airani-iofifteen"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/zXE/000000440259Rd68BirDmNa571luySILfvdhmtfBeBgLFzXE.jpg", ["kureiji-ollie", "anya-melfissa", "pavolia-reine", "vestia-zeta", "kaela-kovalskia", "kobo-kanaeru"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/d3n/000000440263LUYVVAmETHCQOpqFG7zsFFyd14AbbtuBNd3n.jpg", ["mori-calliope", "takanashi-kiara", "ninomae-inanis", "gawr-gura"], "four"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/9Sj/000000440267MFawz5CGEyGzGtRYFYviAJj7MaxNZu8aw9Sj.jpg", ["irys", "ouro-kronii", "nanashi-mumei", "hakos-baelz"], "four"),
    ],
  },
  {
    id: "hololive-production-wafer-vol4-2025",
    name: "ホロライブプロダクション ウエハースvol.4",
    shortName: "웨하스 vol.4",
    releaseDate: "2025-12-29",
    sourceUrl:
      "https://www.bandai.co.jp/candy/products/2025/4570117922718000.html",
    productImageUrl:
      "https://www.bandai.co.jp/candy/published/bnc_files/product/4A7/000000459995SMdvlnnAlq2GXunENbgs5NpUEfFVmYAO74A7.jpg",
    memberIds: [
      "tokino-sora", "robocosan", "aki-rosenthal", "akai-haato", "shirakami-fubuki",
      "natsuiro-matsuri", "nakiri-ayame", "yuzuki-choco", "oozora-subaru", "azki",
      "ookami-mio", "sakura-miko", "nekomata-okayu", "inugami-korone", "hoshimachi-suisei",
      "ayunda-risu", "moona-hoshinova", "airani-iofifteen", "kureiji-ollie", "anya-melfissa", "pavolia-reine",
      "mori-calliope", "takanashi-kiara", "ninomae-inanis", "irys", "ouro-kronii", "hakos-baelz",
      "otonose-kanade", "ichijou-ririka", "juufuutei-raden", "todoroki-hajime",
    ],
    groupIds: [],
    sheets: [
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/S8S/000000459999SQCTzsHUaMZUN9aJcxsS6Jz7lKm4VrLNtS8S.jpg", ["tokino-sora", "robocosan", "aki-rosenthal", "akai-haato", "shirakami-fubuki"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/08v/000000460003569udhkiVlzINDueltG9yeliQg2gOGzRx08v.jpg", ["natsuiro-matsuri", "nakiri-ayame", "yuzuki-choco", "oozora-subaru", "azki"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/baa/000000460007SJdDKr3t53n21GGxyhvnKy59C56LFhta1baa.jpg", ["ookami-mio", "sakura-miko", "nekomata-okayu", "inugami-korone", "hoshimachi-suisei"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/j01/000000460011TB1wtSGc4JM1kZ7lNUifULDHHRgEKKex1j01.jpg", ["ayunda-risu", "moona-hoshinova", "airani-iofifteen", "kureiji-ollie", "anya-melfissa", "pavolia-reine"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/hLx/0000004600151WKLwDmnQ2iqZiszux7fJbkIonnTcekuZhLx.jpg", ["mori-calliope", "takanashi-kiara", "ninomae-inanis", "irys", "ouro-kronii", "hakos-baelz"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/SJ1/000000460019ZWkekkTh9XaS959YMKxCuaTumxNG1FXGMSJ1.jpg", ["otonose-kanade", "ichijou-ririka", "juufuutei-raden", "todoroki-hajime"], "four"),
    ],
  },
  {
    id: "hololive-production-wafer-vol5-2026",
    name: "ホロライブプロダクション ウエハースvol.5",
    shortName: "웨하스 vol.5",
    releaseDate: "2026-03-02",
    sourceUrl:
      "https://www.bandai.co.jp/candy/products/2026/4570117923463000.html",
    productImageUrl:
      "https://www.bandai.co.jp/candy/published/bnc_files/product/t16/000000466431LHMHRQxJmRHUqdqrqcNvrzrWFvY1ZkF0Et16.jpg",
    memberIds: [
      "usada-pekora", "shiranui-flare", "shirogane-noel", "houshou-marine", "amane-kanata",
      "tsunomaki-watame", "tokoyami-towa", "himemori-luna", "yukihana-lamy", "momosuzu-nene", "shishiro-botan",
      "omaru-polka", "laplus-darknesss", "takane-lui", "hakui-koyori", "kazama-iroha", "vestia-zeta",
      "kaela-kovalskia", "kobo-kanaeru", "shiori-novella", "koseki-bijou", "nerissa-ravencroft", "fuwawa-abyssgard",
      "mococo-abyssgard", "elizabeth-rose-bloodflame", "gigi-murin", "cecilia-immergreen", "raora-panthera", "hibikisaki-riona",
      "koganei-niko", "mizumiya-suu", "rindo-chihaya", "kikirara-vivi",
    ],
    groupIds: [],
    sheets: [
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/pyO/000000466435g1ck2M3lDMzxibgMzR75EovYl53SKwya6pyO.jpg", ["usada-pekora", "shiranui-flare", "shirogane-noel", "houshou-marine", "amane-kanata"], "five"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/B0W/000000466439b0LrbYxlAMUFK411UAwXdKt77FLI5Tbe4B0W.jpg", ["tsunomaki-watame", "tokoyami-towa", "himemori-luna", "yukihana-lamy", "momosuzu-nene", "shishiro-botan"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/5Cy/000000466443at5RoyRpeVm2dIwyaAh7YVtYE2xQdy66O5Cy.jpg", ["omaru-polka", "laplus-darknesss", "takane-lui", "hakui-koyori", "kazama-iroha", "vestia-zeta"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/K9c/0000004664472wd5N447kY2HxWNS7PUU9m4XOHW1FFKVYK9c.jpg", ["kaela-kovalskia", "kobo-kanaeru", "shiori-novella", "koseki-bijou", "nerissa-ravencroft", "fuwawa-abyssgard"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/R1J/000000466451d6G59GJg1fuXEBK7XIUax8LS4zfsYT7CZR1J.jpg", ["mococo-abyssgard", "elizabeth-rose-bloodflame", "gigi-murin", "cecilia-immergreen", "raora-panthera", "hibikisaki-riona"], "six"),
      memberSheet("https://www.bandai.co.jp/candy/published/bnc_files/product/BwE/000000466455yBGDgZDea4Y9l6EwdiUyGrClnNR9U4FtABwE.jpg", ["koganei-niko", "mizumiya-suu", "rindo-chihaya", "kikirara-vivi"], "four"),
    ],
  },
];

const expectedCounts = new Map([
  ["hololive-wafer-2022", 37],
  ["hololive-wafer-2-2023", 43],
  ["hololive-production-wafer-expo-2024-vol1", 41],
  ["hololive-production-wafer-expo-2024-vol2", 37],
  ["hololive-production-wafer-vol3-2025", 49],
  ["hololive-production-wafer-vol4-2025", 31],
  ["hololive-production-wafer-vol5-2026", 33],
]);

function getMember(id) {
  const member = members.get(id);
  if (!member) {
    throw new Error(`웨하스 멤버 사전에 없는 ID입니다: ${id}`);
  }
  return member;
}

function getGroup(id) {
  const group = groups.get(id);
  if (!group) {
    throw new Error(`웨하스 그룹 사전에 없는 ID입니다: ${id}`);
  }
  return group;
}

function buildImageAssignments(definition) {
  const assignments = new Map();
  for (const sheet of definition.sheets) {
    if (!sheet.url.startsWith("https://www.bandai.co.jp/candy/")) {
      throw new Error(`${definition.id}: 비공식 이미지 URL이 포함되었습니다.`);
    }
    const positions = sheet.layout ? layoutPositions[sheet.layout] : null;
    if (sheet.layout && (!positions || positions.length !== sheet.cardKeys.length)) {
      throw new Error(
        `${definition.id}: ${sheet.layout} 시트의 카드 수와 좌표 수가 다릅니다.`,
      );
    }
    sheet.cardKeys.forEach((cardKey, index) => {
      if (assignments.has(cardKey)) {
        throw new Error(`${definition.id}: 이미지 배정이 중복되었습니다: ${cardKey}`);
      }
      assignments.set(cardKey, {
        imageUrl: sheet.url,
        ...(positions
          ? {
              imageSize: sheet.layout.startsWith("group")
                ? groupImageSize
                : imageSize,
              imagePosition: positions[index],
            }
          : {}),
      });
    });
  }
  return assignments;
}

function buildRelease(definition, releaseIndex, firstCardSortOrder) {
  const assignments = buildImageAssignments(definition);
  const rows = [
    ...definition.memberIds.map((id) => ({ type: "member", id })),
    ...definition.groupIds.map((id) => ({ type: "group", id })),
  ];
  const expectedCount = expectedCounts.get(definition.id);
  if (rows.length !== expectedCount) {
    throw new Error(
      `${definition.id}: 정의된 ${rows.length}장이 공식 ${expectedCount}장과 다릅니다.`,
    );
  }

  const cards = rows.map((row, index) => {
    const cardKey = `${row.type}:${row.id}`;
    const image = assignments.get(cardKey);
    if (!image) {
      throw new Error(`${definition.id}: 공식 이미지가 배정되지 않았습니다: ${cardKey}`);
    }
    const entry = row.type === "member" ? getMember(row.id) : getGroup(row.id);
    const memberNames =
      row.type === "member"
        ? [entry.title]
        : entry.memberIds.map((memberId) => getMember(memberId).title);
    return {
      id: `${definition.id}-${row.type}-${row.id}`,
      releaseIds: [definition.id],
      cardNumber: String(index + 1).padStart(2, "0"),
      title: entry.title,
      rarityId:
        row.type === "member" ? memberRarityId : groupRarityId,
      series,
      releaseDate: definition.releaseDate,
      sourceUrl: definition.sourceUrl,
      imageUrl: image.imageUrl,
      ...(image.imageSize
        ? {
            imageSize: image.imageSize,
            imagePosition: image.imagePosition,
          }
        : {}),
      memberNames,
      variantLabel:
        row.type === "member"
          ? "메탈릭 멤버 카드"
          : "금박 그룹 카드 · 공식 그룹 시트",
      sortOrder: firstCardSortOrder + index,
    };
  });

  return {
    release: {
      id: definition.id,
      name: definition.name,
      shortName: definition.shortName,
      releaseDate: definition.releaseDate,
      category: "반다이 수집형 메탈릭 웨하스 카드",
      series,
      sourceUrl: definition.sourceUrl,
      imageUrl: definition.productImageUrl,
      cardCount: cards.length,
      sortOrder: releaseIndex + 1,
    },
    cards,
  };
}

let nextCardSortOrder = 1;
const built = releaseDefinitions.map((definition, releaseIndex) => {
  const builtRelease = buildRelease(
    definition,
    releaseIndex,
    nextCardSortOrder,
  );
  nextCardSortOrder += builtRelease.cards.length;
  return builtRelease;
});
const releases = built.map(({ release }) => release);
const cards = built.flatMap(({ cards: releaseCards }) => releaseCards);
const rarities = [
  { id: memberRarityId, label: "멤버 카드", sortOrder: 1 },
  { id: groupRarityId, label: "그룹 카드 · 금박", sortOrder: 2 },
];

const payload = {
  checkedAt,
  sourceNote:
    "2026-08-20까지 일본에서 발매 완료된 반다이 일반 수집형 홀로라이브 웨하스 7종, 총 271장을 공식 제품 페이지와 공식 갤러리 순서로 정리했습니다. hololive OFFICIAL CARD GAME 트윈 웨하스와 2026-08-31 발매 예정 vol.6, 2026-11 발매 예정 vol.7은 제외했습니다. 공식 갤러리는 여러 카드를 한 장의 1200×1200 시트로 제공하므로 멤버 카드와 가로형 금박 그룹 카드 모두 imageSize/imagePosition으로 해당 공식 카드 영역을 잘라 표시합니다.",
  sourceUrls: [
    officialProductIndexUrl,
    ...releases.map(({ sourceUrl }) => sourceUrl),
  ],
  releases,
  rarities,
  cards,
};

if (releases.length !== 7 || cards.length !== 271) {
  throw new Error(
    `웨하스 카탈로그 수가 올바르지 않습니다: ${releases.length}종 · ${cards.length}장`,
  );
}

const releaseIds = new Set();
const cardIds = new Set();
const cardSortOrders = new Set();
const rarityIds = new Set(rarities.map(({ id }) => id));
for (const release of releases) {
  if (releaseIds.has(release.id)) {
    throw new Error(`웨하스 출시 ID가 중복되었습니다: ${release.id}`);
  }
  releaseIds.add(release.id);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(release.releaseDate) ||
    release.releaseDate > cutoffDate
  ) {
    throw new Error(`미출시 또는 잘못된 날짜가 포함되었습니다: ${release.id}`);
  }
  const releaseCards = cards.filter(({ releaseIds: ids }) =>
    ids.includes(release.id),
  );
  if (releaseCards.length !== release.cardCount) {
    throw new Error(
      `${release.id}: cardCount ${release.cardCount}와 실제 ${releaseCards.length}장이 다릅니다.`,
    );
  }
  const firstCardSortOrder = releaseCards[0]?.sortOrder;
  releaseCards.forEach((card, index) => {
    if (card.sortOrder !== firstCardSortOrder + index) {
      throw new Error(`${release.id}: 카드 sortOrder가 연속적이지 않습니다.`);
    }
  });
}

for (const card of cards) {
  if (cardIds.has(card.id)) {
    throw new Error(`웨하스 카드 ID가 중복되었습니다: ${card.id}`);
  }
  cardIds.add(card.id);
  if (cardSortOrders.has(card.sortOrder)) {
    throw new Error(`웨하스 카드 sortOrder가 중복되었습니다: ${card.sortOrder}`);
  }
  cardSortOrders.add(card.sortOrder);
  if (
    card.releaseIds.length !== 1 ||
    !releaseIds.has(card.releaseIds[0]) ||
    !rarityIds.has(card.rarityId) ||
    !card.title ||
    !card.sourceUrl ||
    !card.imageUrl ||
    !Number.isInteger(card.sortOrder) ||
    card.sortOrder < 1 ||
    card.sortOrder > cards.length
  ) {
    throw new Error(`웨하스 카드 필수 정보가 잘못되었습니다: ${card.id}`);
  }
  if (!card.imageUrl.startsWith("https://www.bandai.co.jp/candy/")) {
    throw new Error(`공식 반다이 이미지가 아닙니다: ${card.id}`);
  }
  if (
    (card.imageSize && !card.imagePosition) ||
    (!card.imageSize && card.imagePosition) ||
    !card.imageSize ||
    !card.imagePosition ||
    (card.imagePosition &&
      !/^\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(card.imagePosition))
  ) {
    throw new Error(`스프라이트 이미지 좌표가 잘못되었습니다: ${card.id}`);
  }
}

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `홀로라이브 웨하스 데이터 생성 완료: ${releases.length}종 · ${cards.length}장`,
);
