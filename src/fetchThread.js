const { chromium } = require('playwright');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchPageSnapshotOnce(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const headless = options.headless ?? true;
  const browser = await chromium.launch({ headless });

  try {
    const context = await browser.newContext({
      userAgent:
        options.userAgent ??
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const snapshot = await page.evaluate(() => {
      const toAbsoluteUrl = (href) => {
        try {
          return new URL(href, window.location.href).href;
        } catch {
          return null;
        }
      };

      const titleCandidates = [
        document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
        document.querySelector('h1')?.textContent,
        document.title
      ].filter(Boolean);

      return {
        finalUrl: window.location.href,
        pageTitle: document.title || '',
        titleCandidates,
        bodyText: document.body?.innerText || '',
        links: Array.from(document.querySelectorAll('a[href]'))
          .map((anchor) => ({
            text: (anchor.textContent || '').trim(),
            href: toAbsoluteUrl(anchor.getAttribute('href'))
          }))
          .filter((link) => link.href),
        debug: {
          anchorCount: document.querySelectorAll('a[href]').length,
          h1Count: document.querySelectorAll('h1').length
        }
      };
    });

    return {
      requestedUrl: url,
      ...snapshot
    };
  } finally {
    await browser.close();
  }
}

async function fetchPageSnapshot(url, options = {}) {
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 5000;
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetchPageSnapshotOnce(url, options);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }

      console.warn(`[fetch] attempt ${attempt} failed for ${url}: ${error.message}`);
      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError;
}

module.exports = {
  fetchPageSnapshot
};
