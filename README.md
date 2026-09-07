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