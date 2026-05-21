import { readFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const figures = JSON.parse(readFileSync(join(ROOT, "data/figures.json"), "utf8"));
const quotes = JSON.parse(readFileSync(join(ROOT, "data/quotes.json"), "utf8"));

const dateStr = process.argv[2] || new Date().toISOString().split("T")[0];
const outDir = join(ROOT, "out", dateStr);
const accounts = JSON.parse(process.env.INSTAGRAM_ACCOUNTS || "[]");
const videoBaseUrl = process.env.VIDEO_BASE_URL || "";

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

function graphAPI(method, path, params) {
  const query = new URLSearchParams(params).toString();
  const fullPath = method === "GET" ? `${path}?${query}` : path;
  const body = method === "POST" ? query : null;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "graph.facebook.com",
        path: fullPath,
        method,
        headers:
          method === "POST"
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(body),
              }
            : {},
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function postStory(account, videoUrl) {
  const { lang, igUserId, accessToken, pageName } = account;

  console.log(`  [${lang}] Creating story container for @${pageName}...`);

  const createRes = await graphAPI("POST", `/v19.0/${igUserId}/media`, {
    media_type: "STORIES",
    video_url: videoUrl,
    access_token: accessToken,
  });

  if (createRes.status !== 200 || !createRes.data.id) {
    throw new Error(
      `Container creation failed: ${JSON.stringify(createRes.data)}`
    );
  }

  const containerId = createRes.data.id;
  console.log(
    `  [${lang}] Container: ${containerId}, waiting for processing...`
  );

  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    const statusRes = await graphAPI("GET", `/v19.0/${containerId}`, {
      fields: "status_code",
      access_token: accessToken,
    });

    const status = statusRes.data?.status_code;
    if (status === "FINISHED") break;
    if (status === "ERROR")
      throw new Error(`Processing failed for container ${containerId}`);
    if (i % 3 === 0) console.log(`  [${lang}] Status: ${status || "IN_PROGRESS"}...`);
  }

  console.log(`  [${lang}] Publishing story...`);
  const publishRes = await graphAPI("POST", `/v19.0/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });

  if (publishRes.status !== 200 || !publishRes.data.id) {
    throw new Error(`Publish failed: ${JSON.stringify(publishRes.data)}`);
  }

  return publishRes.data.id;
}

async function main() {
  if (accounts.length === 0) {
    console.log("⚠ No Instagram accounts configured. Set INSTAGRAM_ACCOUNTS secret.");
    console.log('Format: [{"lang":"en","igUserId":"...","accessToken":"...","pageName":"lumen.en"},...]');
    return;
  }

  if (!videoBaseUrl) {
    console.log("⚠ VIDEO_BASE_URL not set. Videos must be hosted at a public URL.");
    return;
  }

  const { quote, figure } = getDailyQuote(dateStr);

  console.log(`\n📸 Instagram Story Posting — ${dateStr}`);
  console.log(`Figure: ${figure?.names?.en || "Unknown"}`);
  console.log(`Accounts: ${accounts.length}\n`);

  let posted = 0;
  for (const account of accounts) {
    const videoUrl = `${videoBaseUrl}/lumen_${dateStr}_${account.lang}.mp4`;

    try {
      const mediaId = await postStory(account, videoUrl);
      console.log(`  [${account.lang}] ✅ Story posted! Media ID: ${mediaId}\n`);
      posted++;
    } catch (err) {
      console.error(`  [${account.lang}] ❌ Failed: ${err.message}\n`);
    }

    await sleep(3000);
  }

  console.log(`📸 Done: ${posted}/${accounts.length} stories posted`);
}

main();
