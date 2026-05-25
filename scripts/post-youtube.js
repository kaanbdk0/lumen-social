import { readFileSync, createReadStream, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const figures = JSON.parse(readFileSync(join(ROOT, "data/figures.json"), "utf8"));
const quotes = JSON.parse(readFileSync(join(ROOT, "data/quotes.json"), "utf8"));
const locales = JSON.parse(readFileSync(join(ROOT, "data/locales.json"), "utf8"));

const dateStr = process.argv[2] || new Date().toISOString().split("T")[0];
const outDir = join(ROOT, "out", dateStr);
const videoFile = join(outDir, `lumen_${dateStr}_en.mp4`);

function stableHashBig(str) {
  let hash = BigInt(5381);
  for (const ch of Buffer.from(str, "utf8")) {
    hash = ((hash << BigInt(5)) + hash) + BigInt(ch);
    hash = hash & BigInt("0xFFFFFFFFFFFFFFFF");
  }
  return hash & BigInt("0x7FFFFFFFFFFFFFFF");
}

function getDailyQuote(date) {
  let hash = stableHashBig(date);
  hash = (hash * BigInt(2654435761)) & BigInt("0x7FFFFFFFFFFFFFFF");
  const index = Number(hash % BigInt(quotes.length));
  const quote = quotes[index];
  const figure = figures.find((f) => f.id === quote.figure_id);
  return { quote, figure };
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString();

  const res = await httpsRequest({
    hostname: "oauth2.googleapis.com",
    path: "/token",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
  }, body);

  if (res.status !== 200) throw new Error(`Token refresh failed: ${JSON.stringify(res.data)}`);
  return res.data.access_token;
}

async function uploadVideo(accessToken, videoPath, title, description, tags) {
  const fileSize = statSync(videoPath).size;
  const metadata = JSON.stringify({
    snippet: { title, description, tags, categoryId: "22" },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  });

  // Step 1: Start resumable upload
  const initRes = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "www.googleapis.com",
      path: "/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": fileSize,
        "X-Upload-Content-Type": "video/mp4",
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, data }));
    });
    req.on("error", reject);
    req.write(metadata);
    req.end();
  });

  if (initRes.status !== 200) throw new Error(`Upload init failed (${initRes.status}): ${initRes.data}`);
  const uploadUrl = initRes.headers.location;
  if (!uploadUrl) throw new Error("No upload URL returned");

  // Step 2: Upload video data
  const uploadRes = await new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "video/mp4",
        "Content-Length": fileSize,
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);

    const stream = createReadStream(videoPath);
    stream.pipe(req);
  });

  if (uploadRes.status !== 200) throw new Error(`Upload failed (${uploadRes.status}): ${JSON.stringify(uploadRes.data)}`);
  return uploadRes.data;
}

async function main() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.log("⚠ YouTube credentials missing.");
    return;
  }

  if (!existsSync(videoFile)) {
    console.log(`⚠ Video not found: ${videoFile}`);
    return;
  }

  console.log(`\n📺 YouTube Shorts Upload — ${dateStr}`);

  const { quote, figure } = getDailyQuote(dateStr);
  const figureName = figure?.names?.en || "Unknown";
  const quoteText = quote?.texts?.en || "";

  const title = `${figureName}: "${quoteText.substring(0, 60)}${quoteText.length > 60 ? "..." : ""}"`;
  const description = `✦ ${quoteText}\n— ${figureName}\n\n${locales.en.slogan}\n\n#Shorts #Lumen #Wisdom #Quotes #${figureName.replace(/\s/g, "")} #Philosophy #DailyWisdom`;
  const tags = ["wisdom", "quotes", "philosophy", "shorts", "lumen", figureName.toLowerCase()];

  console.log(`Figure: ${figureName}`);
  console.log(`Title: ${title}`);

  try {
    console.log("🔑 Refreshing access token...");
    const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);

    console.log("📤 Uploading video...");
    const result = await uploadVideo(accessToken, videoFile, title, description, tags);

    console.log(`✅ YouTube Shorts uploaded! Video ID: ${result.id}`);
    console.log(`   URL: https://youtube.com/shorts/${result.id}`);
  } catch (err) {
    console.error(`❌ YouTube upload failed: ${err.message}`);
  }
}

main();
