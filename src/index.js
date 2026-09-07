import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import * as cheerio from "cheerio";

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


main().catch((err) => console.error("Fatal error:", err.message));

async function getBookLinksFromPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const links = [];

  $("article.product_pod h3 a").each((_, el) => {
    const href = $(el).attr("href");
    const absoluteUrl = new URL(href, pageUrl).toString();
    links.push(absoluteUrl);
  });

  // find the "next" link, if it exists
  const nextHref = $("li.next a").attr("href");
  const nextUrl = nextHref ? new URL(nextHref, pageUrl).toString() : null;

  return { links, nextUrl };
}

async function discoverAllBookUrls() {
  let pageUrl = "https://books.toscrape.com/catalogue/page-1.html";
  let pageNum = 1;
  const MAX_PAGES = 3;
  const allLinks = [];

  while (pageUrl && pageNum <= MAX_PAGES) {
    const cachePath = `${CACHE_DIR}/catalogue-page-${pageNum}.html`;
    const html = await fetchAndCache(pageUrl, cachePath);

    const { links, nextUrl } = await getBookLinksFromPage(html, pageUrl);
    allLinks.push(...links);

    if (pageNum > 1) {
      await new Promise((r) => setTimeout(r, 500));
    }

    pageUrl = nextUrl;
    pageNum++;
  }

  const uniqueUrls = [...new Set(allLinks)];

  console.log(`catalogue_pages=${pageNum - 1}`);
  console.log(`discovered=${allLinks.length}`);
  console.log(`unique_urls=${uniqueUrls.length}`);

  return uniqueUrls;
}

async function main() {
  const url = "https://books.toscrape.com/catalogue/page-1.html";
  const cachePath = `${CACHE_DIR}/catalogue-page-1.html`;
  const bookUrls = await discoverAllBookUrls();

  await fetchAndCache(url, cachePath);
}