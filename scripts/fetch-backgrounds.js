// ─────────────────────────────────────────────────────────────────────────
// One-time(-ish) fetcher for themed background art.
//
// Pulls PUBLIC-DOMAIN paintings from the Met Museum open API (no key, free)
// into public/bg/<theme>/. The daily post pipeline picks one at random per
// figure based on the figure's theme. Re-run any time to add more variety;
// it skips themes that already have enough images unless --force is passed.
//
//   node scripts/fetch-backgrounds.js            # fill up to TARGET each
//   node scripts/fetch-backgrounds.js --force     # re-download
//   node scripts/fetch-backgrounds.js antik dogu  # only these themes
// ─────────────────────────────────────────────────────────────────────────
import { mkdirSync, existsSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BG_ROOT = join(__dirname, "..", "public", "bg");

const TARGET_PER_THEME = 5;
const MAX_EDGE = 1600; // px — keep the repo lean; backgrounds sit behind a dark overlay

// Pictorial works only — this filters out museum object photos (vases on white
// seamless, weapons, sculpture) which are useless as cinematic backgrounds.
const PICTORIAL = /painting|scroll|album|codic|folio|fresco|illustrat|miniatur/i;
// Reject off-brand subjects by title: religious icons (Madonna/saints) and
// obvious single-object/portrait works that read poorly as scenic backgrounds.
const REJECT_TITLE = /madonna|virgin|saint|christ|holy|crucifix|nativity|annunciation|lions?|portrait of|self-portrait/i;

// Met department IDs scope the search to the right kind of art, which is far
// more reliable than keywords alone. 6=Asian, 11=European Paintings, 14=Islamic.
const THEMES = {
  antik:    { dept: 11, queries: ["Roman ruins", "classical landscape", "Arcadian landscape", "ruins capriccio", "ancient temple"] },
  dogu:     { dept: 6,  queries: ["landscape", "mountains", "river landscape", "misty mountains", "waterfall"] },
  tasavvuf: { dept: 14, queries: ["garden", "landscape", "hunt", "Shahnama", "Khamsa", "encampment"] },
  ronesans: { dept: 11, queries: ["ruins capriccio", "architectural fantasy", "Italian landscape", "classical architecture", "ancient ruins"] },
  modern:   { dept: 11, queries: ["romantic landscape", "moonlight", "stormy sky", "mountain landscape", "twilight landscape"] },
};

// Auto quality gate: reject pale museum scans (white paper margins read as flat
// grey behind the bust) and extreme aspect ratios (fan paintings have white
// corners). Brightness is measured by shrinking to 1px and reading its luma.
const MAX_AVG_LUMA = 150; // 0-255; dark paintings ~40-95, pale-paper scans >170
const MIN_ASPECT = 0.45;
const MAX_ASPECT = 2.3;

function qualityOk(file) {
  try {
    const luma = parseInt(
      execSync(`"${process.env.FFMPEG_PATH || "ffmpeg"}" -v error -i "${file}" -vf scale=1:1 -f rawvideo -pix_fmt gray - 2>/dev/null | xxd -p | head -c2`, { encoding: "utf8" }).trim() || "ff",
      16
    );
    const dims = execSync(`sips -g pixelWidth -g pixelHeight "${file}" 2>/dev/null`, { encoding: "utf8" });
    const w = +(dims.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
    const h = +(dims.match(/pixelHeight:\s*(\d+)/)?.[1] || 1);
    const aspect = w / h;
    if (luma > MAX_AVG_LUMA) return { ok: false, why: `too bright (luma ${luma})` };
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return { ok: false, why: `bad aspect ${aspect.toFixed(2)}` };
    return { ok: true, luma, aspect };
  } catch {
    return { ok: true }; // if measurement fails, don't block
  }
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "lumen-bg-fetch/1.0" } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = [];
    https.get(url, { headers: { "User-Agent": "lumen-bg-fetch/1.0" } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      res.on("data", (c) => file.push(c));
      res.on("end", () => { writeFileSync(dest, Buffer.concat(file)); resolve(); });
    }).on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchIds(query, dept) {
  const url = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&departmentId=${dept}&q=${encodeURIComponent(query)}`;
  const res = await getJSON(url);
  return res.objectIDs || [];
}

async function fetchTheme(theme, cfg) {
  const dir = join(BG_ROOT, theme);
  mkdirSync(dir, { recursive: true });
  const force = process.argv.includes("--force");
  const have = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(jpg|png)$/i.test(f)).length : 0;
  if (!force && have >= TARGET_PER_THEME) {
    console.log(`✓ ${theme}: already has ${have} images, skipping`);
    return;
  }
  console.log(`\n▶ ${theme}: fetching (have ${have}/${TARGET_PER_THEME})`);

  // Gather candidate IDs across all queries, de-duplicated.
  const ids = [];
  for (const q of cfg.queries) {
    try { ids.push(...(await searchIds(q, cfg.dept)).slice(0, 60)); } catch { /* ignore */ }
    await sleep(300);
  }
  const seen = new Set();
  const unique = ids.filter((id) => (seen.has(id) ? false : seen.add(id)));

  let saved = have;
  let idx = saved;
  for (const id of unique) {
    if (saved >= TARGET_PER_THEME) break;
    let obj;
    try { obj = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`); }
    catch { continue; }
    await sleep(150);
    if (!obj.isPublicDomain || !obj.primaryImage) continue;
    if (!PICTORIAL.test(obj.classification || "")) continue;
    if (REJECT_TITLE.test(obj.title || "")) continue;
    const ext = obj.primaryImage.split(".").pop().split("?")[0].toLowerCase();
    const tmp = join(dir, `_tmp.${ext === "png" ? "png" : "jpg"}`);
    const out = join(dir, `bg_${String(idx).padStart(2, "0")}.jpg`);
    try {
      await download(obj.primaryImage, tmp);
      const q = qualityOk(tmp);
      if (!q.ok) { execSync(`rm -f "${tmp}"`); console.log(`   - skip "${(obj.title||"").slice(0,30)}": ${q.why}`); continue; }
      // Resize down with sips (macOS) to keep the repo lean. Falls back to copy.
      try { execSync(`sips -Z ${MAX_EDGE} "${tmp}" --out "${out}" >/dev/null 2>&1`); }
      catch { execSync(`cp "${tmp}" "${out}"`); }
      execSync(`rm -f "${tmp}"`);
      console.log(`   + ${theme}/bg_${String(idx).padStart(2, "0")}.jpg  ← "${obj.title}" (${obj.artistDisplayName || "?"}, ${obj.objectDate || "?"})`);
      saved++; idx++;
    } catch (e) {
      console.log(`   ! skip ${id}: ${e.message}`);
    }
  }
  if (saved < TARGET_PER_THEME) console.log(`   ⚠ ${theme}: only got ${saved}/${TARGET_PER_THEME}`);
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const themes = only.length ? only : Object.keys(THEMES);
  for (const t of themes) {
    if (!THEMES[t]) { console.log(`? unknown theme "${t}"`); continue; }
    await fetchTheme(t, THEMES[t]);
  }
  console.log("\n✦ Background fetch done.");
}

main();
