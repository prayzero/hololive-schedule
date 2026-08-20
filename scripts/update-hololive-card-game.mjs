import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const officialOrigin = "https://hololive-official-cardgame.com";
const cardListUrl = `${officialOrigin}/cardlist/`;
const pageSize = 15;
const requestConcurrency = 6;
const maximumAttempts = 4;
const rarityOrder = [
  "SEC",
  "OUR",
  "HR",
  "UR",
  "SY",
  "SR",
  "S",
  "OSR",
  "OC",
  "RR",
  "R",
  "U",
  "C",
  "P",
];
const rarityRank = new Map(rarityOrder.map((rarity, index) => [rarity, index]));
const categoryRank = new Map([
  ["booster", 0],
  ["deck", 1],
  ["accessory", 2],
  ["promo", 3],
]);
const categoryLabels = new Map([
  ["booster", "부스터 팩"],
  ["deck", "스타트 덱"],
  ["accessory", "컬렉션 상품"],
  ["promo", "PR 카드"],
]);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputPath = path.join(
  projectRoot,
  "public",
  "data",
  "hololive-official-card-game.json",
);

const generatedAt = new Date();
const asOfDate = generatedAt.toLocaleDateString("en-CA", {
  timeZone: "Asia/Tokyo",
});

const productIndexHtml = await fetchHtml(cardListUrl, "product index");
const products = parseProducts(productIndexHtml);
validateProducts(products);

const initialResults = await mapLimit(
  products,
  requestConcurrency,
  async (product) => {
    const url = productCardListUrl(product.id);
    const html = await fetchHtml(url, `${product.id} page 1`);
    const expectedCount = parseResultCount(html, product.id);
    const occurrences = parseCardOccurrences(html, product);
    return { product, expectedCount, occurrences };
  },
);

const pageJobs = [];
for (const result of initialResults) {
  const pageCount = Math.ceil(result.expectedCount / pageSize);
  for (let page = 2; page <= pageCount; page += 1) {
    pageJobs.push({
      product: result.product,
      expectedCount: result.expectedCount,
      page,
      pageCount,
    });
  }
}

const remainingResults = await mapLimit(
  pageJobs,
  requestConcurrency,
  async (job) => {
    const url = productCardPageUrl(job.product.id, job.page);
    const html = await fetchHtml(url, `${job.product.id} page ${job.page}`);
    const occurrences = parseCardOccurrences(html, job.product);
    const expectedPageCount =
      job.page < job.pageCount
        ? pageSize
        : job.expectedCount - pageSize * (job.pageCount - 1);
    if (occurrences.length !== expectedPageCount) {
      throw new Error(
        `${job.product.id} page ${job.page}: expected ${expectedPageCount} cards, parsed ${occurrences.length}`,
      );
    }
    return { ...job, occurrences };
  },
);

const occurrencesByProduct = new Map(
  initialResults.map((result) => [result.product.id, [...result.occurrences]]),
);
for (const result of remainingResults.sort(
  (left, right) =>
    left.product.sortOrder - right.product.sortOrder || left.page - right.page,
)) {
  occurrencesByProduct.get(result.product.id).push(...result.occurrences);
}

for (const result of initialResults) {
  const occurrences = occurrencesByProduct.get(result.product.id);
  validateProductOccurrences(result.product, occurrences, result.expectedCount);
  result.product.cardCount = occurrences.length;
}

const cardsById = mergeOccurrences(products, occurrencesByProduct);
const globalSearchHtml = await fetchHtml(
  `${officialOrigin}/cardlist/cardsearch/?view=text&sort=no`,
  "global card count",
);
const officialGlobalCount = parseResultCount(globalSearchHtml, "all cards");

if (cardsById.size !== officialGlobalCount) {
  throw new Error(
    `official card count mismatch: product union has ${cardsById.size}, global search reports ${officialGlobalCount}`,
  );
}

const productsById = new Map(products.map((product) => [product.id, product]));
const mergedCards = [...cardsById.values()]
  .map((card) => ({
    ...card,
    productIds: card.productIds.sort(
      (left, right) =>
        productsById.get(left).sortOrder - productsById.get(right).sortOrder,
    ),
  }))
  .sort((left, right) => compareCards(left, right, productsById))
  .map((card, sortOrder) => ({ ...card, sortOrder }));

const rarities = rarityOrder
  .map((id, sortOrder) => ({
    id,
    label: id,
    sortOrder,
  }))
  .filter((rarity) => mergedCards.some((card) => card.rarity === rarity.id));

const releasedCardCount = mergedCards.filter((card) =>
  card.productIds.some((productId) => productsById.get(productId).isReleased),
).length;
const productMembershipCount = products.reduce(
  (total, product) => total + product.cardCount,
  0,
);

const releases = products.map((product) => ({
  id: product.id,
  name: product.name,
  shortName: product.id,
  releaseDate: product.releaseDate,
  category: categoryLabels.get(product.category),
  sourceUrl: product.sourceUrl,
  cardCount: product.cardCount,
}));

const cards = mergedCards.map((card) => {
  const memberNames = card.cardType.includes("ホロメン") ? [card.name] : undefined;
  return {
    id: card.id,
    releaseIds: card.productIds,
    cardNumber: card.cardNumber,
    title: card.name,
    rarityId: card.rarity,
    imageUrl: card.imageUrl,
    sourceUrl: card.sourceUrl,
    ...(memberNames ? { memberNames } : {}),
    variantLabel: formatVariantLabel(card),
    sortOrder: card.sortOrder,
  };
});

const payload = {
  checkedAt: generatedAt.toISOString(),
  sourceNote: [
    `공식 일본어 카드 DB 공개 레코드 ${cards.length.toLocaleString("ko-KR")}종을 공식 record ID 기준으로 병합했습니다.`,
    `제품별 재수록은 같은 보유 체크를 공유하며 수록 관계는 ${productMembershipCount.toLocaleString("ko-KR")}건입니다.`,
    `${asOfDate} 기준 출시 완료 ${releasedCardCount.toLocaleString("ko-KR")}종, 공식 DB에 선공개된 출시 예정 ${(
      cards.length - releasedCardCount
    ).toLocaleString("ko-KR")}종을 포함합니다.`,
    "PR 카드는 공식 카드리스트에 단일 발매일이 없어 releaseDate를 null로 유지했습니다.",
  ].join(" "),
  sourceUrls: [cardListUrl, `${officialOrigin}/cardlist/cardsearch/`],
  releases,
  rarities,
  cards,
};

validatePayload(payload, officialGlobalCount);
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(
  [
    `Wrote ${path.relative(projectRoot, outputPath)}`,
    `${releases.length} releases`,
    `${rarities.length} rarities`,
    `${cards.length} unique official variants`,
    `${productMembershipCount} product memberships`,
    `${releasedCardCount} released / ${cards.length - releasedCardCount} upcoming`,
  ].join(" | "),
);

function parseProducts(html) {
  const $ = cheerio.load(html);
  const parsed = [];

  $(".product-item-list > .product-item").each((sourceOrder, element) => {
    const item = $(element);
    const anchor = item.find('a[href*="expansion="]').first();
    if (anchor.length === 0) return;

    const href = anchor.attr("href");
    const url = new URL(href, officialOrigin);
    const id = url.searchParams.get("expansion")?.trim();
    if (!id) return;

    const name = cleanText(item.find(".name").first().text());
    const releaseText = cleanText(item.find(".detail").first().text());
    const releaseDate = parseJapaneseDate(releaseText);
    const category = parseProductCategory(item);

    parsed.push({
      id,
      name,
      category,
      releaseDate,
      isReleased: releaseDate ? releaseDate <= asOfDate : true,
      sourceUrl: productCardListUrl(id),
      sortOrder: sourceOrder,
      cardCount: 0,
    });
  });

  return parsed
    .sort((left, right) => {
      if (left.releaseDate && right.releaseDate) {
        const dateOrder = right.releaseDate.localeCompare(left.releaseDate);
        if (dateOrder !== 0) return dateOrder;
      } else if (left.releaseDate) {
        return -1;
      } else if (right.releaseDate) {
        return 1;
      }

      return (
        categoryRank.get(left.category) - categoryRank.get(right.category) ||
        left.sortOrder - right.sortOrder
      );
    })
    .map((product, sortOrder) => ({ ...product, sortOrder }));
}

function parseProductCategory(item) {
  if (item.hasClass("product-type-boosters")) return "booster";
  if (item.hasClass("product-type-decks")) return "deck";
  if (item.hasClass("product-type-accessories")) return "accessory";
  if (item.hasClass("product-type-pr")) return "promo";
  throw new Error(`unknown product category: ${cleanText(item.text()).slice(0, 80)}`);
}

function parseJapaneseDate(value) {
  const match = value.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function parseResultCount(html, label) {
  const $ = cheerio.load(html);
  const rawCount = cleanText($(".cardlist-Result_Target_Num .num").first().text());
  const count = Number.parseInt(rawCount, 10);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error(`${label}: invalid result count ${JSON.stringify(rawCount)}`);
  }
  return count;
}

function parseCardOccurrences(html, product) {
  const $ = cheerio.load(html);
  const occurrences = [];

  $('li:has(a[href^="/cardlist/?id="])').each((_, element) => {
    const item = $(element);
    const anchor = item.find('a[href^="/cardlist/?id="]').first();
    const sourceUrl = new URL(anchor.attr("href"), officialOrigin);
    const rawOfficialId = sourceUrl.searchParams.get("id");
    const officialRecordId = Number.parseInt(rawOfficialId, 10);
    const image = item.find(".img img").first();
    const imageUrl = new URL(image.attr("src"), officialOrigin).href;
    const cardNumber = cleanText(item.find(".number").first().text());
    const name =
      cleanText(item.find(".name").first().text()) || cleanText(image.attr("alt"));
    const info = parseDefinitionList(item.find(".info > dl").first(), $);
    const rarity = info.get("レアリティ") ?? "";
    const cardType = info.get("カードタイプ") ?? "";
    const variant = path.posix.basename(
      decodeURIComponent(new URL(imageUrl).pathname),
      path.posix.extname(new URL(imageUrl).pathname),
    );

    occurrences.push({
      id: String(officialRecordId),
      officialRecordId,
      cardNumber,
      name,
      rarity,
      cardType,
      imageUrl,
      sourceUrl: `${officialOrigin}/cardlist/?id=${officialRecordId}`,
      variant,
      productId: product.id,
    });
  });

  return occurrences;
}

function parseDefinitionList(list, $) {
  const values = new Map();
  list.children("dt").each((_, element) => {
    const key = cleanText($(element).text());
    const value = cleanText($(element).next("dd").text());
    if (key) values.set(key, value);
  });
  return values;
}

function validateProducts(products) {
  if (products.length === 0) throw new Error("official product index is empty");
  const ids = new Set();
  for (const product of products) {
    if (ids.has(product.id)) throw new Error(`duplicate product id: ${product.id}`);
    ids.add(product.id);
    if (!product.name) throw new Error(`${product.id}: missing product name`);
    if (!categoryRank.has(product.category)) {
      throw new Error(`${product.id}: invalid category ${product.category}`);
    }
    assertHttps(product.sourceUrl, `${product.id} sourceUrl`);
  }
}

function validateProductOccurrences(product, occurrences, expectedCount) {
  if (occurrences.length !== expectedCount) {
    throw new Error(
      `${product.id}: expected ${expectedCount} cards, parsed ${occurrences.length}`,
    );
  }

  const ids = new Set();
  for (const card of occurrences) {
    validateCardOccurrence(card, product.id);
    if (ids.has(card.id)) {
      throw new Error(`${product.id}: duplicate official record id ${card.id}`);
    }
    ids.add(card.id);
  }
}

function validateCardOccurrence(card, productId) {
  for (const key of ["id", "cardNumber", "name", "rarity", "imageUrl", "variant"]) {
    if (!card[key]) throw new Error(`${productId}: card ${card.id || "?"} missing ${key}`);
  }
  if (!Number.isSafeInteger(card.officialRecordId) || card.officialRecordId < 1) {
    throw new Error(`${productId}: invalid official record id ${card.officialRecordId}`);
  }
  if (!rarityRank.has(card.rarity)) {
    throw new Error(`${productId}: unknown rarity ${card.rarity} on ${card.id}`);
  }
  assertHttps(card.imageUrl, `${productId} card ${card.id} imageUrl`);
  assertHttps(card.sourceUrl, `${productId} card ${card.id} sourceUrl`);
}

function mergeOccurrences(products, occurrencesByProduct) {
  const merged = new Map();
  const productsById = new Map(products.map((product) => [product.id, product]));

  for (const product of products) {
    for (const occurrence of occurrencesByProduct.get(product.id)) {
      const existing = merged.get(occurrence.id);
      if (!existing) {
        merged.set(occurrence.id, {
          id: occurrence.id,
          officialRecordId: occurrence.officialRecordId,
          cardNumber: occurrence.cardNumber,
          name: occurrence.name,
          rarity: occurrence.rarity,
          cardType: occurrence.cardType,
          imageUrl: occurrence.imageUrl,
          sourceUrl: occurrence.sourceUrl,
          variant: occurrence.variant,
          productIds: [product.id],
          _imageProductId: product.id,
        });
        continue;
      }

      for (const key of ["cardNumber", "name", "rarity", "variant"]) {
        if (existing[key] !== occurrence[key]) {
          throw new Error(
            `official record ${occurrence.id} conflicts on ${key}: ${JSON.stringify(existing[key])} vs ${JSON.stringify(occurrence[key])}`,
          );
        }
      }

      if (existing.productIds.includes(product.id)) {
        throw new Error(`official record ${occurrence.id} repeats in ${product.id}`);
      }
      existing.productIds.push(product.id);

      if (
        compareImageCandidates(
          occurrence,
          product.id,
          existing,
          existing._imageProductId,
          productsById,
        ) < 0
      ) {
        existing.imageUrl = occurrence.imageUrl;
        existing._imageProductId = product.id;
      }
    }
  }

  for (const card of merged.values()) delete card._imageProductId;
  return merged;
}

function compareImageCandidates(left, leftProductId, right, rightProductId, productsById) {
  const prefix = left.cardNumber.split("-")[0].toLowerCase();
  const leftPrefixPenalty = leftProductId.toLowerCase() === prefix ? 0 : 1;
  const rightPrefixPenalty = rightProductId.toLowerCase() === prefix ? 0 : 1;
  if (leftPrefixPenalty !== rightPrefixPenalty) {
    return leftPrefixPenalty - rightPrefixPenalty;
  }

  const leftDate = productsById.get(leftProductId).releaseDate ?? "9999-12-31";
  const rightDate = productsById.get(rightProductId).releaseDate ?? "9999-12-31";
  return (
    leftDate.localeCompare(rightDate) ||
    productsById.get(leftProductId).sortOrder -
      productsById.get(rightProductId).sortOrder
  );
}

function compareCards(left, right, productsById) {
  const leftProductOrder = Math.min(
    ...left.productIds.map((id) => productsById.get(id).sortOrder),
  );
  const rightProductOrder = Math.min(
    ...right.productIds.map((id) => productsById.get(id).sortOrder),
  );
  return (
    leftProductOrder - rightProductOrder ||
    rarityRank.get(left.rarity) - rarityRank.get(right.rarity) ||
    left.cardNumber.localeCompare(right.cardNumber, "en", {
      numeric: true,
      sensitivity: "base",
    }) ||
    left.variant.localeCompare(right.variant, "en", {
      numeric: true,
      sensitivity: "base",
    }) ||
    left.officialRecordId - right.officialRecordId
  );
}

function formatVariantLabel(card) {
  const prefix = `${card.cardNumber}_${card.rarity}`;
  const suffix = card.variant.startsWith(prefix)
    ? card.variant.slice(prefix.length).replace(/^_+/, "")
    : card.variant;
  return suffix ? `${card.rarity} · ${suffix}` : card.rarity;
}

function validatePayload(payload, expectedCardCount) {
  if (payload.cards.length !== expectedCardCount) {
    throw new Error(
      `payload has ${payload.cards.length} cards, expected ${expectedCardCount}`,
    );
  }

  if (!payload.sourceNote || !Number.isFinite(Date.parse(payload.checkedAt))) {
    throw new Error("payload metadata is incomplete");
  }
  for (const sourceUrl of payload.sourceUrls) {
    assertHttps(sourceUrl, "payload source URL");
  }

  const releaseIds = new Set(payload.releases.map((release) => release.id));
  const rarityIds = new Set(payload.rarities.map((rarity) => rarity.id));
  if (releaseIds.size !== payload.releases.length) {
    throw new Error("payload has duplicate release ids");
  }
  if (rarityIds.size !== payload.rarities.length) {
    throw new Error("payload has duplicate rarity ids");
  }
  const cardIds = new Set();
  const sortOrders = new Set();
  const occurrenceVariantKeys = new Set();
  const occurrenceImageKeys = new Set();
  const membershipCounts = new Map(
    payload.releases.map((release) => [release.id, 0]),
  );

  for (const card of payload.cards) {
    if (cardIds.has(card.id)) throw new Error(`duplicate payload card id ${card.id}`);
    cardIds.add(card.id);
    if (!/^\d+$/.test(card.id)) {
      throw new Error(`payload card id is not an official numeric record id: ${card.id}`);
    }
    if (sortOrders.has(card.sortOrder)) {
      throw new Error(`duplicate payload sortOrder ${card.sortOrder}`);
    }
    sortOrders.add(card.sortOrder);
    for (const key of ["cardNumber", "title", "rarityId", "imageUrl"]) {
      if (!card[key]) throw new Error(`payload card ${card.id} missing ${key}`);
    }
    if (!rarityIds.has(card.rarityId)) {
      throw new Error(`card ${card.id} has unknown rarity ${card.rarityId}`);
    }
    if (card.releaseIds.length === 0) {
      throw new Error(`card ${card.id} has no release`);
    }
    const cardReleaseIds = new Set();
    for (const releaseId of card.releaseIds) {
      if (cardReleaseIds.has(releaseId)) {
        throw new Error(`card ${card.id} repeats release ${releaseId}`);
      }
      cardReleaseIds.add(releaseId);
      if (!releaseIds.has(releaseId)) {
        throw new Error(`card ${card.id} references unknown release ${releaseId}`);
      }
      const variantKey = [
        releaseId,
        card.cardNumber,
        card.rarityId,
        card.variantLabel ?? "",
      ].join("|");
      if (occurrenceVariantKeys.has(variantKey)) {
        throw new Error(`duplicate physical variant occurrence ${variantKey}`);
      }
      occurrenceVariantKeys.add(variantKey);

      const imageKey = `${releaseId}|${card.imageUrl}`;
      if (occurrenceImageKeys.has(imageKey)) {
        throw new Error(`duplicate image occurrence ${imageKey}`);
      }
      occurrenceImageKeys.add(imageKey);
      membershipCounts.set(releaseId, membershipCounts.get(releaseId) + 1);
    }
    assertHttps(card.imageUrl, `payload card ${card.id} imageUrl`);
    if (card.sourceUrl) {
      assertHttps(card.sourceUrl, `payload card ${card.id} sourceUrl`);
    }
  }

  if (sortOrders.size !== payload.cards.length) {
    throw new Error("payload card sort orders are incomplete");
  }
  for (let index = 0; index < payload.cards.length; index += 1) {
    if (!sortOrders.has(index)) {
      throw new Error(`payload is missing card sortOrder ${index}`);
    }
  }

  for (const release of payload.releases) {
    assertHttps(release.sourceUrl, `${release.id} sourceUrl`);
    if (!release.name || !release.shortName || !release.category) {
      throw new Error(`${release.id}: incomplete release metadata`);
    }
    if (
      release.releaseDate !== null &&
      !/^20\d{2}-\d{2}-\d{2}$/.test(release.releaseDate)
    ) {
      throw new Error(`${release.id}: invalid release date ${release.releaseDate}`);
    }
    if (membershipCounts.get(release.id) !== release.cardCount) {
      throw new Error(
        `${release.id}: release count ${release.cardCount} differs from ${membershipCounts.get(release.id)} card memberships`,
      );
    }
  }
}

function productCardListUrl(productId) {
  return `${officialOrigin}/cardlist/cardsearch/?expansion=${encodeURIComponent(productId)}&view=text&sort=no`;
}

function productCardPageUrl(productId, page) {
  return `${officialOrigin}/cardlist/cardsearch_ex?expansion=${encodeURIComponent(productId)}&view=text&sort=no&page=${page}`;
}

async function fetchHtml(url, label) {
  assertHttps(url, label);
  let lastError;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ja,en;q=0.7",
          "User-Agent":
            "hololive-schedule-card-catalog/1.0 (+https://github.com/prayzero/hololive-schedule)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      if (!html.trim()) throw new Error("empty response");
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < maximumAttempts) {
        await delay(500 * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(`${label}: failed after ${maximumAttempts} attempts: ${lastError}`);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

function assertHttps(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`${label}: non-HTTPS URL ${value}`);
  }
}

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
