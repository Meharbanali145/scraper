import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import * as cheerio from "cheerio";
import { z } from "zod";

let cacheHitCount = 0;


const USER_AGENT = "FlyRankInternshipA9/1.0 (+https://github.com/Meharbanali145/scraper.git)";
const CACHE_DIR = "./cache";

const BookSchema = z.object({
  title: z.string().min(1),
  product_url: z.string().url(),
  price_text: z.string(),
  price_gbp: z.number().positive(),
  availability_text: z.string(),
  rating_text: z.string().nullable(),
  description: z.string().nullable(),
  source_page: z.string().url(),
  fetched_at: z.string(),
});

function normalizeRecord(raw) {
  const priceMatch = raw.price_text.match(/[\d.]+/);
  const price_gbp = priceMatch ? parseFloat(priceMatch[0]) : NaN;

  return {
    ...raw,
    price_gbp,
  };
}

async function writeRunReport(startTime, stats) {
  const report = {
    start_time: startTime,
    duration_ms: Date.now() - new Date(startTime).getTime(),
    catalogue_pages_fetched: 3,
    cache_hits: stats.cacheHits,
    valid_records: stats.validRecords,
    invalid_records: stats.invalidRecords,
    failed_pages: stats.failedPages,
  };

  await writeFile("./output/run-report.json", JSON.stringify(report, null, 2), "utf-8");
  console.log("Run report written:", JSON.stringify(report, null, 2));
}

function validateRecords(rawRecords) {
  const validRecords = [];
  const invalidRecords = [];
  const seenUrls = new Set();

  for (const raw of rawRecords) {
    const normalized = normalizeRecord(raw);

    if (seenUrls.has(normalized.product_url)) {
      continue; // duplicate — skip silently, canonical URL already counted
    }

    const result = BookSchema.safeParse(normalized);

    if (result.success) {
      validRecords.push(result.data);
      seenUrls.add(normalized.product_url);
    } else {
      invalidRecords.push({
        record: normalized,
        reason: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
  }

  return { validRecords, invalidRecords };
}

async function storeRecords(validRecords, invalidRecords) {
  await mkdir("./output", { recursive: true });
  await writeFile("./output/books.json", JSON.stringify(validRecords, null, 2), "utf-8");
  await writeFile("./output/errors.json", JSON.stringify(invalidRecords, null, 2), "utf-8");

  console.log(`valid_records=${validRecords.length}`);
  console.log(`invalid_records=${invalidRecords.length}`);
}

async function politeFetch(url, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status >= 500 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000));
      return politeFetch(url, attempt + 1);
    }

    return response;
  } catch (err) {
    clearTimeout(timeout);
    if (attempt < 2 && err.name === "AbortError") {
      await new Promise((r) => setTimeout(r, 1000));
      return politeFetch(url, attempt + 1);
    }
    throw err;
  }
}

async function fetchAndCache(url, cachePath) {
  if (existsSync(cachePath)) {
    const html = await readFile(cachePath, "utf-8");
    console.log(`CACHE HIT: ${cachePath} (${html.length} bytes)`);
    cacheHitCount++;
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
  const failedPages = [];

  for (let i = 0; i < bookUrls.length; i++) {
    const url = bookUrls[i];
    const urlParts = url.split("/").filter(Boolean);
    const bookId = urlParts[urlParts.length - 2];
    const cachePath = `${CACHE_DIR}/book-${bookId}.html`;

    try {
      const { html, wasCached } = await fetchAndCache(url, cachePath);
      const record = extractBookDetails(html, url, url);
      records.push(record);

      if (!wasCached) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.log(`SKIPPED (failed page): ${url} — ${err.message}`);
      failedPages.push({ url, reason: err.message });
    }
  }

  console.log(`detail_pages=${records.length}`);
  console.log(`failed_pages=${failedPages.length}`);

  return { records, failedPages };
}

async function main() {
  const startTime = new Date().toISOString();

  const bookUrls = await discoverAllBookUrls();
  const { records: rawRecords, failedPages } = await extractAllBooks(bookUrls);
  const { validRecords, invalidRecords } = validateRecords(rawRecords);
  await storeRecords(validRecords, invalidRecords);

  await writeRunReport(startTime, {
  cacheHits: cacheHitCount,
  validRecords: validRecords.length,
  invalidRecords: invalidRecords.length,
  failedPages: failedPages.length,
});
}

main().catch((err) => console.error("Fatal error:", err.message));