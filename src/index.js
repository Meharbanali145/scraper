import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const USER_AGENT = "FlyRankInternshipA9/1.0 (+https://github.com/Meharbanali145/scraper.git)";
const CACHE_DIR = "./cache";

async function politeFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function fetchAndCache(url, cachePath) {
  if (existsSync(cachePath)) {
    const html = await readFile(cachePath, "utf-8");
    console.log(`CACHE HIT: ${cachePath} (${html.length} bytes)`);
    return html;
  }

  const response = await politeFetch(url);

  if (response.status !== 200) {
    throw new Error(`Failed fetch: ${url} returned status ${response.status}`);
  }

  const html = await response.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, html, "utf-8");
  console.log(`FETCH: ${url} → ${cachePath} (${html.length} bytes)`);
  return html;
}

async function main() {
  const url = "https://books.toscrape.com/catalogue/page-1.html";
  const cachePath = `${CACHE_DIR}/catalogue-page-1.html`;

  await fetchAndCache(url, cachePath);
}

main().catch((err) => console.error("Fatal error:", err.message));