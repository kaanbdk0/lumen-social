// Uploads the EN Reel to YouTube Shorts using title/description from
// out/posts/<date>/meta.json (produced by render-post.js). Reuses the working
// resumable-upload + refresh-token flow from post-youtube.js.
import { readFileSync, createReadStream, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const dateStr = process.argv[2] || new Date().toISOString().split("T")[0];
const outDir = join(ROOT, "out", "posts", dateStr);
const metaPath = join(outDir, "meta.json");
const videoFile = join(outDir, `lumen_post_${dateStr}_en.mp4`);

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, data }); } });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString();
  const res = await httpsRequest({
    hostname: "oauth2.googleapis.com", path: "/token", method: "POST",
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
  const initRes = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "www.googleapis.com",
      path: "/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": fileSize, "X-Upload-Content-Type": "video/mp4" },
    }, (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, data: d })); });
    req.on("error", reject); req.write(metadata); req.end();
  });
  if (initRes.status !== 200) throw new Error(`Upload init failed (${initRes.status}): ${initRes.data}`);
  const uploadUrl = initRes.headers.location;
  if (!uploadUrl) throw new Error("No upload URL returned");

  const uploadRes = await new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search, method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "video/mp4", "Content-Length": fileSize },
    }, (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => { try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); } }); });
    req.on("error", reject);
    createReadStream(videoPath).pipe(req);
  });
  if (uploadRes.status !== 200) throw new Error(`Upload failed (${uploadRes.status}): ${JSON.stringify(uploadRes.data)}`);
  return uploadRes.data;
}

async function main() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) { console.log("⚠ YouTube credentials missing."); return; }
  if (!existsSync(metaPath)) { console.log(`⚠ meta.json not found: ${metaPath}`); return; }
  if (!existsSync(videoFile)) { console.log(`⚠ EN reel not found: ${videoFile}`); return; }

  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const title = (meta.titles?.en || "Lumen #shorts").slice(0, 100);
  const description = meta.captions?.en || "";
  const hashtagTags = (description.match(/#\w+/g) || []).map((h) => h.slice(1)).slice(0, 12);
  const tags = Array.from(new Set(["wisdom", "quotes", "philosophy", "shorts", "lumen", ...hashtagTags]));

  console.log(`\n📺 YouTube Shorts — ${dateStr} | ${meta.figureKey}\nTitle: ${title}`);
  try {
    const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
    const result = await uploadVideo(accessToken, videoFile, title, description, tags);
    console.log(`✅ Uploaded! https://youtube.com/shorts/${result.id}`);
  } catch (err) {
    console.error(`❌ YouTube upload failed: ${err.message}`);
  }
}

main();
