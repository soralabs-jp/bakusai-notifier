const { normalizeSeriesName } = require('./parseThread');

function buildSearchUrl(seriesName, template) {
  if (!seriesName || !template) {
    return null;
  }

  return template.replace('{query}', encodeURIComponent(seriesName));
}

function pickNextThreadCandidate(currentThread, currentCandidates = [], searchCandidates = []) {
  const all = [...currentCandidates, ...searchCandidates];
  const normalizedCurrentSeries = normalizeSeriesName(currentThread.seriesName);
  let best = null;

  for (const candidate of all) {
    if (!candidate?.threadNo || !candidate?.url) {
      continue;
    }

    if (currentThread.threadNo && candidate.threadNo <= currentThread.threadNo) {
      continue;
    }

    const normalizedCandidateSeries = normalizeSeriesName(candidate.seriesName);
    if (
      normalizedCurrentSeries &&
      normalizedCandidateSeries &&
      normalizedCandidateSeries !== normalizedCurrentSeries &&
      !normalizedCandidateSeries.includes(normalizedCurrentSeries) &&
      !normalizedCurrentSeries.includes(normalizedCandidateSeries)
    ) {
      continue;
    }

    const score =
      (candidate.score || 0) +
      (currentThread.threadNo && candidate.threadNo === currentThread.threadNo + 1 ? 100 : 0) +
      (currentThread.threadNo && candidate.threadNo > currentThread.threadNo
        ? 20 - Math.min(candidate.threadNo - currentThread.threadNo, 20)
        : 0);

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

  return nextCandidate.threadNo > currentThread.threadNo;
}

module.exports = {
  buildSearchUrl,
  pickNextThreadCandidate,
  shouldSwitchThread
};
