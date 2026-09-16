import assert from "node:assert/strict";
import test from "node:test";
import {
  hydrateCandidate,
  matchesStrongEventTitle,
  requireInitialData,
} from "../research/fetch-youtube-jp.mjs";

const KoyoriTitle =
  "【完全生3D】 #博衣こより超重大告知 アリ‼ アコースティックライブin Autumn #holoAcousticLive 【AZKi/常闇トワ/こぼ・かなえる/虎金妃笑虎/博衣こより／ホロライブ】";
const KoyoriTalent = {
  id: "hakui-koyori",
  channelId: "UC6eWCld0KwmyHFbAqK3V-Rw",
};
const KoyoriCandidate = {
  videoId: "_Rvx92mPFT0",
  searchTitle: KoyoriTitle,
};

function koyoriPlayerResponse(overrides = {}) {
  return {
    playabilityStatus: { status: "OK" },
    videoDetails: {
      videoId: KoyoriCandidate.videoId,
      title: KoyoriTitle,
      channelId: KoyoriTalent.channelId,
      lengthSeconds: "4050",
      isLiveContent: true,
      ...overrides.videoDetails,
    },
    microformat: {
      playerMicroformatRenderer: {
        publishDate: "2026-09-12T05:11:06-07:00",
        liveBroadcastDetails: {
          startTimestamp: "2026-09-12T10:57:15+00:00",
          endTimestamp: "2026-09-12T12:04:39+00:00",
        },
        ...overrides.microformat,
      },
    },
  };
}

test("JP source parsing fails closed when ytInitialData is absent", () => {
  assert.deepEqual(
    requireInitialData(
      '<script>var ytInitialData = {"contents":{"ok":true}};</script>',
      "test search",
    ),
    { contents: { ok: true } },
  );
  assert.throws(
    () => requireInitialData("<html>consent page</html>", "test search"),
    /test search did not contain valid ytInitialData/,
  );
});

test("JP title policy accepts bounded 3D-to-live wording only", () => {
  assert.equal(matchesStrongEventTitle(KoyoriTitle), true);
  assert.equal(
    matchesStrongEventTitle("【3D】ゲームで遊びます【ホロライブ】"),
    false,
  );
  assert.equal(
    matchesStrongEventTitle(`3D${"あ".repeat(46)}ライブ`),
    false,
  );
  assert.equal(
    matchesStrongEventTitle("【3DLIVE振り返り】ライブの裏話をします"),
    false,
  );
});

test("JP hydration propagates transport failure without an outer retry", async () => {
  let calls = 0;
  await assert.rejects(
    hydrateCandidate(KoyoriTalent, KoyoriCandidate, {
      fetchPlayer: async () => {
        calls += 1;
        throw new TypeError("fetch failed");
      },
    }),
    /fetch failed/,
  );
  assert.equal(calls, 1);
});

test("JP hydration requires exact owner and live metadata", async () => {
  const record = await hydrateCandidate(KoyoriTalent, KoyoriCandidate, {
    fetchPlayer: async (_url, init) => {
      assert.equal(init.method, "POST");
      assert.equal(JSON.parse(init.body).videoId, KoyoriCandidate.videoId);
      return koyoriPlayerResponse();
    },
  });

  assert.equal(record?.videoId, KoyoriCandidate.videoId);
  assert.equal(record?.memberId, KoyoriTalent.id);
  assert.equal(record?.durationSeconds, 4050);
  assert.equal(record?.isLiveArchive, true);

  assert.equal(
    await hydrateCandidate(KoyoriTalent, KoyoriCandidate, {
      fetchPlayer: async () =>
        koyoriPlayerResponse({
          videoDetails: { channelId: "UCaaaaaaaaaaaaaaaaaaaaaa" },
        }),
    }),
    null,
  );
  assert.equal(
    await hydrateCandidate(KoyoriTalent, KoyoriCandidate, {
      fetchPlayer: async () =>
        koyoriPlayerResponse({
          videoDetails: { isLiveContent: false },
          microformat: { liveBroadcastDetails: undefined },
        }),
    }),
    null,
  );
});
