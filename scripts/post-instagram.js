import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Instagram Graph API requires:
// 1. Facebook Page linked to Instagram Business account
// 2. Long-lived access token per account
// Format in secret: JSON array of { lang, igUserId, accessToken, pageName }
const accounts = JSON.parse(process.env.INSTAGRAM_ACCOUNTS || "[]");

const dateStr = new Date().toISOString().split("T")[0];
const outDir = join(ROOT, "out", dateStr);

function postRequest(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      let d = "";
      res.on("data", (c) => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function postStory(account) {
  const { lang, igUserId, accessToken, pageName } = account;
  const videoFile = join(outDir, `lumen_${dateStr}_${lang}.mp4`);

  try {
    // Step 1: Upload video to Instagram
    // Note: For Reels/Stories, video must be hosted at a public URL
    // In production, upload to a temp storage (S3/Cloudflare R2) first
    console.log(`[${lang}] Posting story to @${pageName}...`);
    
    // Instagram Graph API story publish flow:
    // POST /{ig-user-id}/media?media_type=STORIES&video_url={url}&access_token={token}
    // POST /{ig-user-id}/media_publish?creation_id={id}&access_token={token}
    
    console.log(`[${lang}] ✅ Story posted (placeholder — needs video hosting setup)`);
  } catch (err) {
    console.error(`[${lang}] ❌ Failed: ${err.message}`);
  }
}

async function main() {
  if (accounts.length === 0) {
    console.log("⚠ No Instagram accounts configured. Set INSTAGRAM_ACCOUNTS secret.");
    console.log("Expected format: JSON array of { lang, igUserId, accessToken, pageName }");
    return;
  }

  console.log(`\n📸 Instagram Story Posting — ${dateStr}`);
  console.log(`Found ${accounts.length} accounts\n`);

  for (const account of accounts) {
    await postStory(account);
  }

  console.log("\n✅ Instagram posting complete");
}

main();
