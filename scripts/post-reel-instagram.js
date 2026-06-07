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

async function postReel(account, videoUrl, caption) {
  const { lang, igUserId, accessToken, pageName } = account;
  console.log(`  [${lang}] Creating reel container for @${pageName}...`);
  const createRes = await graphAPI("POST", `/v21.0/${igUserId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
    access_token: accessToken,
  });
  if (createRes.status !== 200 || !createRes.data.id) throw new Error(`Container creation failed: ${JSON.stringify(createRes.data)}`);
  const containerId = createRes.data.id;

  console.log(`  [${lang}] Container ${containerId}, processing...`);
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const st = await graphAPI("GET", `/v21.0/${containerId}`, { fields: "status_code", access_token: accessToken });
    const status = st.data?.status_code;
    if (status === "FINISHED") break;
    if (status === "ERROR") throw new Error(`Processing failed for container ${containerId}`);
    if (i % 3 === 0) console.log(`  [${lang}] Status: ${status || "IN_PROGRESS"}...`);
  }

  console.log(`  [${lang}] Publishing reel...`);
  const pub = await graphAPI("POST", `/v21.0/${igUserId}/media_publish`, { creation_id: containerId, access_token: accessToken });
  if (pub.status !== 200 || !pub.data.id) throw new Error(`Publish failed: ${JSON.stringify(pub.data)}`);
  return pub.data.id;
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

  let posted = 0;
  for (const account of accounts) {
    if (!meta.langs.includes(account.lang)) { console.log(`  [${account.lang}] no reel for this language, skip`); continue; }
    const caption = meta.captions[account.lang] || "";
    const videoUrl = `${videoBaseUrl}/lumen_post_${dateStr}_${account.lang}.mp4`;
    try {
      const id = await postReel(account, videoUrl, caption);
      console.log(`  [${account.lang}] ✅ Reel posted! Media ID: ${id}\n`);
      posted++;
    } catch (err) {
      console.error(`  [${account.lang}] ❌ Failed: ${err.message}\n`);
    }
    await sleep(3000);
  }
  console.log(`📸 Done: ${posted} reels posted`);
}

main();
