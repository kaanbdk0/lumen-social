// Posts the rendered Reels to Instagram — one language per account, as a REEL
// (shared to feed) with the localized caption. Reads out/posts/<date>/meta.json
// produced by render-post.js. Mirrors the working story-posting auth flow.
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const dateStr = process.argv[2] || new Date().toISOString().split("T")[0];
const metaPath = join(ROOT, "out", "posts", dateStr, "meta.json");
const accounts = JSON.parse(process.env.INSTAGRAM_ACCOUNTS || "[]");
const videoBaseUrl = process.env.VIDEO_BASE_URL || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function graphAPI(method, path, params) {
  const query = new URLSearchParams(params).toString();
  const fullPath = method === "GET" ? `${path}?${query}` : path;
  const body = method === "POST" ? query : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "graph.instagram.com",
        path: fullPath,
        method,
        headers: method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, data }); } });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function resolveUserId(accessToken) {
  const res = await graphAPI("GET", "/me", { fields: "id,username", access_token: accessToken });
  if (res.data?.id) return res.data.id;
  throw new Error(`Could not resolve IG user ID: ${JSON.stringify(res.data)}`);
}

// Poll the container until Instagram finishes transcoding. Patient (up to ~15 min)
// because IG processing can be slow on busy days; we only publish once it is
// actually FINISHED, so we never fire a doomed publish that returns 9007.
async function waitForFinished(lang, containerId, accessToken) {
  const MAX_POLLS = 150; // 150 × 6s = 15 min
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(6000);
    const st = await graphAPI("GET", `/v21.0/${containerId}`, { fields: "status_code", access_token: accessToken });
    const status = st.data?.status_code;
    if (status === "FINISHED") return true;
    if (status === "ERROR") throw new Error(`Processing failed: ${JSON.stringify(st.data)}`);
    if (i % 5 === 0) console.log(`  [${lang}] processing… ${status || "IN_PROGRESS"} (${i * 6}s)`);
  }
  return false;
}

// Publish, retrying the transient "media not ready yet" error (code 9007 /
// subcode 2207027) that IG returns when transcoding lags behind the status.
async function publishWithRetry(lang, igUserId, containerId, accessToken) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const pub = await graphAPI("POST", `/v21.0/${igUserId}/media_publish`, { creation_id: containerId, access_token: accessToken });
    if (pub.status === 200 && pub.data?.id) return pub.data.id;
    const err = pub.data?.error || {};
    const transient = err.code === 9007 || err.error_subcode === 2207027 || err.is_transient;
    if (transient && attempt < 6) {
      console.log(`  [${lang}] not ready yet, retry ${attempt}/5 in 20s…`);
      await sleep(20000);
      continue;
    }
    throw new Error(`Publish failed: ${JSON.stringify(pub.data)}`);
  }
}

async function postReel(account, videoUrl, caption) {
  const { lang, igUserId, accessToken, pageName } = account;
  console.log(`  [${lang}] creating reel container for @${pageName}…`);
  const createRes = await graphAPI("POST", `/v21.0/${igUserId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
    access_token: accessToken,
  });
  if (createRes.status !== 200 || !createRes.data.id) throw new Error(`Container creation failed: ${JSON.stringify(createRes.data)}`);
  const containerId = createRes.data.id;

  const finished = await waitForFinished(lang, containerId, accessToken);
  if (!finished) console.log(`  [${lang}] still processing after 15 min — attempting publish with retries…`);
  return publishWithRetry(lang, igUserId, containerId, accessToken);
}

async function main() {
  if (!existsSync(metaPath)) { console.log(`⚠ meta.json not found: ${metaPath}`); return; }
  if (accounts.length === 0) { console.log("⚠ No Instagram accounts configured (INSTAGRAM_ACCOUNTS)."); return; }
  if (!videoBaseUrl) { console.log("⚠ VIDEO_BASE_URL not set."); return; }

  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  console.log(`\n📸 Instagram Reels — ${dateStr} | ${meta.figureKey} | langs: ${meta.langs.join(",")}\n`);

  for (const account of accounts) {
    if (!account.igUserId) {
      try { account.igUserId = await resolveUserId(account.accessToken); } catch (e) { console.error(`  [${account.lang}] ❌ resolve id: ${e.message}`); }
    }
  }

  // Post all accounts in PARALLEL. Each container is transcoded server-side by
  // Instagram, so the wait is I/O-bound — running them concurrently makes total
  // wall time ≈ the slowest single account instead of the sum. (Sequential posting
  // used to blow past the job time limit whenever IG was slow, dropping every
  // account after the first.) Each account keeps its own try/catch so one failure
  // never affects the others.
  const results = await Promise.all(accounts.map(async (account) => {
    if (!meta.langs.includes(account.lang)) { console.log(`  [${account.lang}] no reel for this language, skip`); return false; }
    const caption = meta.captions[account.lang] || "";
    const videoUrl = `${videoBaseUrl}/lumen_post_${dateStr}_${account.lang}.mp4`;
    try {
      const id = await postReel(account, videoUrl, caption);
      console.log(`  [${account.lang}] ✅ Reel posted! Media ID: ${id}`);
      return true;
    } catch (err) {
      console.error(`  [${account.lang}] ❌ Failed: ${err.message}`);
      return false;
    }
  }));
  const posted = results.filter(Boolean).length;
  console.log(`📸 Done: ${posted}/${meta.langs.length} reels posted`);
}

main();
