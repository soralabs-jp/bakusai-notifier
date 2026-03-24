const { chromium } = require('playwright');

async function fetchPageSnapshot(url, options = {}) {
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

module.exports = {
  fetchPageSnapshot
};
