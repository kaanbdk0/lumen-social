import { readFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const figures = JSON.parse(readFileSync(join(ROOT, "data/figures.json"), "utf8"));
const quotes = JSON.parse(readFileSync(join(ROOT, "data/quotes.json"), "utf8"));

const dateStr = process.argv[2] || new Date().toISOString().split("T")[0];
const outDir = join(ROOT, "out", dateStr);
const videoFile = join(outDir, `lumen_${dateStr}_en.mp4`);

function stableHash(str) {
  let hash = BigInt(5381);
  for (const ch of Buffer.from(str, "utf8")) {
    hash = ((hash << BigInt(5)) + hash) + BigInt(ch);
    hash = hash & BigInt("0xFFFFFFFFFFFFFFFF");
  }
  return Number(hash & BigInt("0x7FFFFFFFFFFFFFFF"));
}

function getDailyQuote(date) {
  const seed = stableHash(date);
  const index = seed % quotes.length;
  const quote = quotes[index];
  const figure = figures.find((f) => f.id === quote.figure_id);
  return { quote, figure };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function refreshAccessToken(clientKey, clientSecret, ttRefreshToken) {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: ttRefreshToken,
  }).toString();

  const res = await httpsRequest(
    {
      hostname: "open.tiktokapis.com",
      path: "/v2/oauth/token/",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (res.data?.access_token) {
    return res.data;
  }
  if (res.data?.data?.access_token) {
    return res.data.data;
  }
  throw new Error(`Token refresh failed: ${JSON.stringify(res.data)}`);
}

async function initVideoUpload(accessToken, videoPath, title) {
  const fileSize = statSync(videoPath).size;
  const body = JSON.stringify({
    post_info: {
      title,
      privacy_level: "PUBLIC_TO_EVERYONE",
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 3000,
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: fileSize,
      chunk_size: fileSize,
      total_chunk_count: 1,
    },
  });

  const res = await httpsRequest(
    {
      hostname: "open.tiktokapis.com",
      path: "/v2/post/publish/video/init/",
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (res.data?.data?.upload_url) return res.data.data;
  throw new Error(`Upload init failed: ${JSON.stringify(res.data)}`);
}

async function uploadVideo(uploadUrl, videoPath) {
  const fileSize = statSync(videoPath).size;
  const videoData = readFileSync(videoPath);
  const url = new URL(uploadUrl);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
          "Content-Length": fileSize,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on("error", reject);
    req.write(videoData);
    req.end();
  });
}

async function checkPublishStatus(accessToken, publishId) {
  const body = JSON.stringify({ publish_id: publishId });
  return httpsRequest(
    {
      hostname: "open.tiktokapis.com",
      path: "/v2/post/publish/status/fetch/",
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );
}

async function main() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const ttRefreshToken = process.env.TIKTOK_REFRESH_TOKEN;

  if (!clientKey || !clientSecret || !ttRefreshToken) {
    console.log("⚠ TikTok credentials missing. Need TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN.");
    return;
  }

  if (!existsSync(videoFile)) {
    console.log(`⚠ Video not found: ${videoFile}`);
    return;
  }

  const { quote, figure } = getDailyQuote(dateStr);
  const figureName = figure?.names?.en || "Unknown";
  const quoteText = quote?.texts?.en || "";
  const title = `${figureName}: "${quoteText.substring(0, 80)}${quoteText.length > 80 ? "..." : ""}" #Lumen #Wisdom #Quotes #${figureName.replace(/\s/g, "")}`;

  console.log(`\n🎵 TikTok Upload — ${dateStr}`);
  console.log(`Figure: ${figureName}`);

  try {
    console.log("🔑 Refreshing access token...");
    const tokenData = await refreshAccessToken(clientKey, clientSecret, ttRefreshToken);
    const accessToken = tokenData.access_token;

    if (tokenData.refresh_token && tokenData.refresh_token !== ttRefreshToken) {
      console.log("⚠ New refresh token returned — update TIKTOK_REFRESH_TOKEN secret!");
      console.log(`  New token: ${tokenData.refresh_token.substring(0, 20)}...`);
    }

    console.log("📤 Initializing upload...");
    const { upload_url, publish_id } = await initVideoUpload(accessToken, videoFile, title);

    console.log("📤 Uploading video...");
    const uploadRes = await uploadVideo(upload_url, videoFile);
    console.log(`  Upload response: ${uploadRes.status}`);

    console.log("⏳ Checking publish status...");
    for (let i = 0; i < 12; i++) {
      await sleep(10000);
      const statusRes = await checkPublishStatus(accessToken, publish_id);
      const state = statusRes.data?.data?.status;

      if (state === "PUBLISH_COMPLETE") {
        console.log(`✅ TikTok video published! Publish ID: ${publish_id}`);
        return;
      }
      if (state === "FAILED") {
        throw new Error(`Publishing failed: ${JSON.stringify(statusRes.data)}`);
      }
      console.log(`  Status: ${state || "processing"}...`);
    }

    console.log(`✅ TikTok upload sent. Publish ID: ${publish_id} (may still be processing)`);
  } catch (err) {
    console.error(`❌ TikTok upload failed: ${err.message}`);
  }
}

main();
