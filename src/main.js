const path = require('path');
const dotenv = require('dotenv');
const { fetchPageSnapshot } = require('./fetchThread');
const { parseThread, parseThreadCandidatesFromLinks } = require('./parseThread');
const { buildSearchUrl, pickNextThreadCandidate, shouldSwitchThread } = require('./detectNextThread');
const { createNotifier } = require('./notifyDiscord');
const { loadState, saveState } = require('./storage');

dotenv.config();

const CONFIG = {
  threadUrl: process.env.THREAD_URL || process.env.BAKUSAI_THREAD_URL,
  seriesName: process.env.SERIES_NAME || '',
  webhookUrl: process.env.WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '',
  stateFile: path.resolve(process.cwd(), process.env.STATE_FILE || './data/state.json'),
  headless: process.env.HEADLESS !== 'false',
  initialBootNotify: process.env.INITIAL_BOOT_NOTIFY === 'true',
  includePostSnippets: process.env.INCLUDE_POST_SNIPPETS === 'true',
  playwrightTimeoutMs: Number(process.env.PLAYWRIGHT_TIMEOUT_MS || 30000),
  searchUrlTemplate:
    process.env.BAKUSAI_SEARCH_URL_TEMPLATE ||
    'https://bakusai.com/sch_thr_thread/acode=0/word={query}/'
};

function log(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[${timestamp}] ${message}`);
    return;
  }

  console.log(`[${timestamp}] ${message}`, extra);
}

function assertConfig() {
  if (!CONFIG.threadUrl) {
    throw new Error('THREAD_URL is required');
  }
}

function buildThreadState(thread) {
  return {
    title: thread.title,
    url: thread.url,
    threadNo: thread.threadNo
  };
}

function validateThreadSnapshot(thread) {
  const normalizedUrl = String(thread.url || '').replace(/\/+$/, '');
  const isTopPage = normalizedUrl === 'https://bakusai.com';
  const isGenericTitle = thread.title === '爆サイ.com';

  if (isTopPage || isGenericTitle) {
    throw new Error(
      '取得結果がスレページではありませんでした。THREAD_URL が正しいか、ログイン・年齢確認・アクセス制限の影響がないか確認してください。'
    );
  }
}

function mergeKnownThreads(knownThreads, thread) {
  const next = [...(knownThreads || [])];
  if (!next.some((item) => item.url === thread.url)) {
    next.push(buildThreadState(thread));
  }
  return next;
}

async function fetchAndParseThread(url) {
  const snapshot = await fetchPageSnapshot(url, {
    headless: CONFIG.headless,
    timeoutMs: CONFIG.playwrightTimeoutMs
  });

  const parsed = parseThread(snapshot, {
    seriesName: CONFIG.seriesName || undefined,
    includePostSnippets: CONFIG.includePostSnippets
  });

  log('Fetched thread snapshot', {
    url: parsed.url,
    title: parsed.title,
    latestResNo: parsed.latestResNo,
    candidates: parsed.nextThreadCandidates.length,
    debug: parsed.debug
  });

  validateThreadSnapshot(parsed);

  return parsed;
}

async function searchNextThreadCandidates(seriesName) {
  const searchUrl = buildSearchUrl(seriesName, CONFIG.searchUrlTemplate);
  if (!searchUrl) {
    return [];
  }

  log('Searching next-thread candidates', { searchUrl });
  const snapshot = await fetchPageSnapshot(searchUrl, {
    headless: CONFIG.headless,
    timeoutMs: CONFIG.playwrightTimeoutMs
  });

  const candidates = parseThreadCandidatesFromLinks(snapshot.links, seriesName);
  log('Search candidates parsed', { count: candidates.length });
  return candidates;
}

async function initializeState(notifier) {
  const parsedThread = await fetchAndParseThread(CONFIG.threadUrl);
  const initialState = {
    seriesName: CONFIG.seriesName || parsedThread.seriesName,
    currentThread: buildThreadState(parsedThread),
    lastSeenResNo: parsedThread.latestResNo,
    reachedMaxNotified: parsedThread.reachedMax,
    nextThreadCandidateUrl: null,
    knownThreads: mergeKnownThreads([], parsedThread),
    updatedAt: new Date().toISOString()
  };

  await saveState(CONFIG.stateFile, initialState);
  log('Initialized state file', { stateFile: CONFIG.stateFile, lastSeenResNo: parsedThread.latestResNo });

  if (CONFIG.initialBootNotify) {
    await notifier.notifyBoot({
      thread: parsedThread,
      latestResNo: parsedThread.latestResNo
    });
  }
}

async function run() {
  assertConfig();

  const notifier = createNotifier({ webhookUrl: CONFIG.webhookUrl });
  const state = await loadState(CONFIG.stateFile);

  if (!state?.currentThread?.url) {
    await initializeState(notifier);
    log('First run completed; state saved and exiting');
    return;
  }

  const threadUrl = state.currentThread.url || CONFIG.threadUrl;
  const parsedThread = await fetchAndParseThread(threadUrl);
  const lastSeenResNo = Number(state.lastSeenResNo || 0);

  if (parsedThread.latestResNo && parsedThread.latestResNo > lastSeenResNo) {
    await notifier.notifyNewPosts({
      diffCount: parsedThread.latestResNo - lastSeenResNo,
      thread: parsedThread,
      latestResNo: parsedThread.latestResNo,
      snippets: parsedThread.snippets
    });
  }

  if (parsedThread.reachedMax && !state.reachedMaxNotified) {
    await notifier.notifyReachedMax({ thread: parsedThread });
  }

  let nextCandidate = pickNextThreadCandidate(state.currentThread, parsedThread.nextThreadCandidates, []);

  if (!nextCandidate && parsedThread.seriesName) {
    const searchCandidates = await searchNextThreadCandidates(parsedThread.seriesName);
    nextCandidate = pickNextThreadCandidate(state.currentThread, parsedThread.nextThreadCandidates, searchCandidates);
  }

  if (nextCandidate && nextCandidate.url !== state.nextThreadCandidateUrl) {
    await notifier.notifyNextThreadCandidate({ thread: nextCandidate });
  }

  let nextState = {
    ...state,
    seriesName: state.seriesName || parsedThread.seriesName,
    currentThread: buildThreadState(parsedThread),
    lastSeenResNo: parsedThread.latestResNo ?? state.lastSeenResNo ?? null,
    reachedMaxNotified: parsedThread.reachedMax || state.reachedMaxNotified || false,
    nextThreadCandidateUrl: nextCandidate?.url || null,
    knownThreads: mergeKnownThreads(state.knownThreads, parsedThread),
    updatedAt: new Date().toISOString()
  };

  if (shouldSwitchThread(state.currentThread, nextCandidate)) {
    await notifier.notifySwitchedThread({
      fromThread: state.currentThread,
      toThread: nextCandidate
    });

    nextState = {
      ...nextState,
      currentThread: buildThreadState(nextCandidate),
      lastSeenResNo: null,
      reachedMaxNotified: false,
      nextThreadCandidateUrl: null,
      knownThreads: mergeKnownThreads(nextState.knownThreads, nextCandidate)
    };
  }

  await saveState(CONFIG.stateFile, nextState);
  log('State updated', {
    currentThread: nextState.currentThread,
    lastSeenResNo: nextState.lastSeenResNo,
    nextThreadCandidateUrl: nextState.nextThreadCandidateUrl
  });
}

run().catch(async (error) => {
  const notifier = createNotifier({ webhookUrl: CONFIG.webhookUrl });
  console.error(error);

  try {
    await notifier.notifyError({
      message: error.message,
      context: error.stack?.split('\n').slice(0, 3).join(' | ')
    });
  } catch (notifyError) {
    console.error('[notify-error]', notifyError);
  }

  process.exitCode = 1;
});
