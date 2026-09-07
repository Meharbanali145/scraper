# The Polite Scraper

A small, polite scraping pipeline for FlyRank Internship — Backend Track.

It downloads the first three catalogue pages of Books to Scrape, visits all 60 book pages, turns
messy HTML into clean, checked JSON records — politely, without crashing on a broken page, and
with an honest report at the end of every run.

## Target Classification

- **Site:** Books to Scrape (books.toscrape.com)
- **Why this site:** It is an official public sandbox built specifically for people to practice
  scraping on.
- **Scope:** The first 3 catalogue pages only (60 books total).
- **Data collected:** Book title, price, availability, star rating, and description.
- **Why this is appropriate:** The site is built for scraping practice, requires no login, has no
  paywall, and all data is public.

**Robots.txt check:** Requested `https://books.toscrape.com/robots.txt` — result: `404 Not Found`.
No robots file exists on this site. A missing file is not permission — it is just a missing file.

> I will not reuse this code on another site without checking its rules and terms first.

## How to run

1. Clone this repo and `cd scraper`
2. Install dependencies: `npm install`
3. Run the scraper: `node src/index.js`

Output appears in `output/books.json`, `output/errors.json`, and `output/run-report.json`.
Running it again is safe — it will read from the local `cache/` folder instead of re-requesting
pages, and will produce the same 60 records rather than duplicating them.

## Lane

JavaScript / Node.js (ES modules)

Dependencies:
- `cheerio` — HTML parsing
- `zod` — schema validation

Install with `npm install`.

## Record schema

Each validated record in `output/books.json` has:

| Field | Type | Notes |
|---|---|---|
| title | string | Book title |
| product_url | string (URL) | Canonical identity of the record |
| price_text | string | Raw price as shown on the page (e.g. "£51.77") |
| price_gbp | number | Parsed numeric price |
| availability_text | string | Raw stock text |
| rating_text | string \| null | Word rating (e.g. "Three") |
| description | string \| null | Book description, null if none on the page |
| source_page | string (URL) | Page the record was collected from (provenance) |
| fetched_at | string (ISO date) | When the record was fetched (provenance) |

Records that fail this schema are written to `output/errors.json` instead, along with the reason
they failed.

## Politeness rules

- Identifies itself with a custom User-Agent naming the project and linking to this repo
- Waits at least 500ms between real network requests (skipped for cache hits)
- Every request has an 8-second timeout
- Checks the HTTP status code before parsing; only 200 is treated as success
- Reads from a local cache during development instead of re-requesting pages
- Retries once on timeout or 5xx server errors; never retries 404 or 403 (those are permanent
  failures, not fixed by trying again)

## Sample run report

```json
{
  "start_time": "2026-09-07T05:26:21.691Z",
  "duration_ms": 3669,
  "catalogue_pages_fetched": 3,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0
}
```

## Why this needed no browser

The book data (title, price, availability, description) is present directly in the server-rendered
HTML — viewing the page source shows it without running any JavaScript. A headless browser like
Playwright would only add startup cost and memory overhead with no benefit here.

## Ethics note

This scraper only targets a public sandbox built for practicing scraping. In general: use an
official API when one exists, never bypass logins or paywalls, and only collect the data you
actually need.