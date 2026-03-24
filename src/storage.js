const fs = require('fs/promises');
const path = require('path');

async function ensureStateDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function loadState(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const normalized = raw.replace(/^\uFEFF/, '');
    if (!normalized.trim()) {
      return null;
    }

    return JSON.parse(normalized);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function saveState(filePath, state) {
  await ensureStateDirectory(filePath);
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = {
  loadState,
  saveState
};
