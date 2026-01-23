import { getState, saveState } from "./api.js";

const baseState = { articles: [], recipes: [], shopping: [], inventory: [], history: [], seq: 1 };

function normalizeState(raw) {
  const data = raw && typeof raw === "object" ? { ...raw } : {};
  const next = { ...baseState, ...data };
  if (!Array.isArray(next.articles)) next.articles = [];
  if (!Array.isArray(next.recipes)) next.recipes = [];
  if (!Array.isArray(next.shopping)) next.shopping = [];
  if (!Array.isArray(next.inventory)) next.inventory = [];
  if (!Array.isArray(next.history)) next.history = [];
  const seq = Number(next.seq);
  next.seq = Number.isInteger(seq) && seq > 0 ? seq : 1;
  return next;
}

const state = { ...baseState };

const Storage = {
  async load() {
    try {
      const remote = await getState();
      return normalizeState(remote);
    } catch {
      return normalizeState(null);
    }
  },
  save(data) {
    saveState(data).catch(() => null);
  },
  nextId(data) {
    const id = data.seq || 1;
    data.seq = id + 1;
    return id;
  }
};

async function loadState() {
  const data = await Storage.load();
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, data);
  return state;
}

export { Storage, state, loadState };
