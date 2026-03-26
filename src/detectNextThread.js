const { normalizeSeriesName } = require('./parseThread');

function buildSearchUrl(seriesName, template) {
  if (!seriesName || !template) {
    return null;
  }

  return template.replace('{query}', encodeURIComponent(seriesName));
}

function isSameSeries(currentThread, candidate) {
  const normalizedCurrentSeries = normalizeSeriesName(currentThread?.seriesName);
  const normalizedCandidateSeries = normalizeSeriesName(candidate?.seriesName);

  if (!normalizedCurrentSeries || !normalizedCandidateSeries) {
    return false;
  }

  return (
    normalizedCandidateSeries === normalizedCurrentSeries ||
    normalizedCandidateSeries.includes(normalizedCurrentSeries) ||
    normalizedCurrentSeries.includes(normalizedCandidateSeries)
  );
}

function pickNextThreadCandidate(currentThread, currentCandidates = [], searchCandidates = []) {
  const all = [...currentCandidates, ...searchCandidates];
  let best = null;

  for (const candidate of all) {
    if (!candidate?.threadNo || !candidate?.url) {
      continue;
    }

    if (!currentThread?.threadNo) {
      continue;
    }

    if (candidate.threadNo !== currentThread.threadNo + 1) {
      continue;
    }

    if (!isSameSeries(currentThread, candidate)) {
      continue;
    }

    const score = (candidate.score || 0) + 100;

    if (!best || score > best.score) {
      best = {
        ...candidate,
        score
      };
    }
  }

  return best;
}

function shouldSwitchThread(currentThread, nextCandidate) {
  if (!currentThread || !nextCandidate) {
    return false;
  }

  if (!currentThread.threadNo || !nextCandidate.threadNo) {
    return false;
  }

  return nextCandidate.threadNo === currentThread.threadNo + 1 && isSameSeries(currentThread, nextCandidate);
}

module.exports = {
  buildSearchUrl,
  pickNextThreadCandidate,
  shouldSwitchThread
};
