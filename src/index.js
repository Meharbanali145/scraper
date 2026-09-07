import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import * as cheerio from "cheerio";

const USER_AGENT = "FlyRankInternshipA9/1.0 (+https://github.com/Meharbanali145/scraper.git)";
const CACHE_DIR = "./cache";

async function politeFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

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
    return { html, wasCached: true };
  }

  const response = await politeFetch(url);

  if (response.status !== 200) {
    throw new Error(`Failed fetch: ${url} returned status ${response.status}`);
  }

  const html = await response.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, html, "utf-8");
  console.log(`FETCH: ${url} → ${cachePath} (${html.length} bytes)`);
  return { html, wasCached: false };
}

async function getBookLinksFromPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const links = [];

  $("article.product_pod h3 a").each((_, el) => {
    const href = $(el).attr("href");
    const absoluteUrl = new URL(href, pageUrl).toString();
    links.push(absoluteUrl);
  });

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
    const { html } = await fetchAndCache(pageUrl, cachePath);

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

function extractBookDetails(html, bookUrl, sourcePageUrl) {
  const $ = cheerio.load(html);
  const productArea = $(".product_page");

  const title = productArea.find("h1").text().trim();
  const priceText = productArea.find(".price_color").first().text().trim();
  const availabilityText = productArea.find(".availability").text().trim().replace(/\s+/g, " ");

  const ratingClass = productArea.find("p.star-rating").attr("class") || "";
  const ratingText = ratingClass.replace("star-rating", "").trim() || null;

  const descriptionEl = productArea.find("#product_description").next("p");
  const description = descriptionEl.length ? descriptionEl.text().trim() : null;

  return {
    title,
    product_url: bookUrl,
    price_text: priceText,
    availability_text: availabilityText,
    rating_text: ratingText,
    description,
    source_page: sourcePageUrl,
    fetched_at: new Date().toISOString(),
  };
}

async function extractAllBooks(bookUrls) {
  const records = [];

  for (let i = 0; i < bookUrls.length; i++) {
  const url = bookUrls[i];
  const urlParts = url.split("/").filter(Boolean);
  const bookId = urlParts[urlParts.length - 2];
  const cachePath = `${CACHE_DIR}/book-${bookId}.html`;

  const { html, wasCached } = await fetchAndCache(url, cachePath);
  const record = extractBookDetails(html, url, url);
  records.push(record);

  if (!wasCached) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

  console.log(`detail_pages=${records.length}`);
  console.log("Sample record:", JSON.stringify(records[0], null, 2));

  return records;
}

async function main() {
  const bookUrls = await discoverAllBookUrls();
  const records = await extractAllBooks(bookUrls);
}

main().catch((err) => console.error("Fatal error:", err.message));