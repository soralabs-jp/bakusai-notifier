function cleanTitle(rawTitle) {
  return String(rawTitle || '')
    .replace(/\s*[|｜].*$/, '')
    .replace(/\s+-\s+爆サイ\.com\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSeriesName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[【】\[\]()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSeriesTitle(rawTitle) {
  const title = cleanTitle(rawTitle);
  const match = title.match(/^(.*?)(\d{1,4})(?:\s*スレ目)?$/);

  if (!match) {
    return {
      title,
      seriesName: title,
      threadNo: null
    };
  }

  return {
    title,
    seriesName: match[1].trim(),
    threadNo: Number(match[2])
  };
}

function collectResNumbers(bodyText) {
  const numbers = new Set();
  const patterns = [
    /(?:^|\s)#(\d{1,4})(?=\s|$)/gm,
    /(?:^|\s)No\.?\s*(\d{1,4})(?=\s|$)/gim,
    /(?:^|\n)\s*(\d{1,4})\s+(?:名無しさん|匿名|202\d[-/])/gm,
    /(?:レス|res)\s*[:#]?\s*(\d{1,4})/gim
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(bodyText)) !== null) {
      const value = Number(match[1]);
      if (value >= 1 && value <= 1000) {
        numbers.add(value);
      }
    }
  }

  return Array.from(numbers).sort((a, b) => a - b);
}

function extractPostSnippets(bodyText, latestResNo, limit = 3) {
  if (!latestResNo) {
    return [];
  }

  const lines = String(bodyText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const snippets = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(new RegExp(`^(?:#|No\\.?\\s*)?${latestResNo - snippets.length}\\b`));
    if (!match) {
      continue;
    }

    const nextLine = lines[index + 1] || '';
    if (nextLine) {
      snippets.push(nextLine.slice(0, 80));
    }

    if (snippets.length >= limit) {
      break;
    }
  }

  return snippets;
}

function scoreNextThreadLink(link, baseInfo) {
  let score = 0;
  const text = cleanTitle(link.text);
  const parsed = parseSeriesTitle(text);
  const normalizedBase = normalizeSeriesName(baseInfo.seriesName);
  const normalizedCandidate = normalizeSeriesName(parsed.seriesName);

  if (/次スレ/i.test(link.text)) {
    score += 50;
  }

  if (
    normalizedBase &&
    normalizedCandidate &&
    (normalizedCandidate === normalizedBase ||
      normalizedCandidate.includes(normalizedBase) ||
      normalizedBase.includes(normalizedCandidate))
  ) {
    score += 30;
  }

  if (baseInfo.threadNo && parsed.threadNo === baseInfo.threadNo + 1) {
    score += 100;
  } else if (baseInfo.threadNo && parsed.threadNo && parsed.threadNo > baseInfo.threadNo) {
    score += 20 - Math.min(parsed.threadNo - baseInfo.threadNo, 20);
  }

  return {
    ...parsed,
    url: link.href,
    score,
    sourceText: link.text
  };
}

function parseThread(snapshot, options = {}) {
  const titleSource =
    options.title ||
    snapshot.titleCandidates?.find(Boolean) ||
    snapshot.pageTitle ||
    '';
  const titleInfo = parseSeriesTitle(titleSource);
  const resNumbers = collectResNumbers(snapshot.bodyText || '');
  const latestResNo = resNumbers.length > 0 ? resNumbers[resNumbers.length - 1] : null;

  const nextThreadCandidates = (snapshot.links || [])
    .map((link) => scoreNextThreadLink(link, titleInfo))
    .filter((candidate) => candidate.score > 0 && candidate.url);

  return {
    title: titleInfo.title,
    seriesName: options.seriesName || titleInfo.seriesName,
    threadNo: titleInfo.threadNo,
    url: snapshot.finalUrl || snapshot.requestedUrl,
    latestResNo,
    resNumbers,
    reachedMax: latestResNo === 1000,
    nextThreadCandidates,
    snippets: options.includePostSnippets ? extractPostSnippets(snapshot.bodyText, latestResNo) : [],
    debug: snapshot.debug || {}
  };
}

function parseThreadCandidatesFromLinks(links, seriesName) {
  const normalizedSeries = normalizeSeriesName(seriesName);
  const seen = new Set();
  const candidates = [];

  for (const link of links || []) {
    if (!link.href || !link.text) {
      continue;
    }

    const parsed = parseSeriesTitle(link.text);
    const normalizedCandidate = normalizeSeriesName(parsed.seriesName);

    if (!parsed.threadNo) {
      continue;
    }

    if (
      normalizedSeries &&
      normalizedCandidate &&
      normalizedCandidate !== normalizedSeries &&
      !normalizedCandidate.includes(normalizedSeries) &&
      !normalizedSeries.includes(normalizedCandidate)
    ) {
      continue;
    }

    if (seen.has(link.href)) {
      continue;
    }

    seen.add(link.href);
    candidates.push({
      title: parsed.title,
      seriesName: parsed.seriesName,
      threadNo: parsed.threadNo,
      url: link.href
    });
  }

  return candidates.sort((a, b) => a.threadNo - b.threadNo);
}

module.exports = {
  cleanTitle,
  normalizeSeriesName,
  parseSeriesTitle,
  parseThread,
  parseThreadCandidatesFromLinks
};
