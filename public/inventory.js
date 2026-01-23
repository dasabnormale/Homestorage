import { state, Storage } from "./state.js";
import { $, escapeHtml, fmtDate, msDay } from "./helpers.js";
import {
  DEFAULT_UNIT,
  DEFAULT_USE_DAYS_SCOPE,
  USE_DAYS_SCOPE_ALL,
  USE_DAYS_SCOPE_PER_ITEM,
  normalizeUnit,
  normalizeUseDaysScope
} from "./catalog.js";
import { getArticleById } from "./data.js";
import { modalOpen, modalClose } from "./modal.js";
import { renderRecipes } from "./recipes.js";

function inventoryUseDays(inv) {
  const raw = Number(inv?.useDays);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  const article = getArticleById(inv?.articleId);
  const fallback = Number(article?.useDays);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function inventoryUseDaysScope(inv) {
  const raw = inv?.useDaysScope;
  if (raw) return normalizeUseDaysScope(raw);
  const article = getArticleById(inv?.articleId);
  return normalizeUseDaysScope(article?.useDaysScope || DEFAULT_USE_DAYS_SCOPE);
}

function ensureInventoryTiming(inv, now) {
  if (!inv) return;
  const tsNow = Number.isFinite(now) ? now : Date.now();
  const useDays = inventoryUseDays(inv);
  const useDaysScope = inventoryUseDaysScope(inv);
  inv.useDays = useDays;
  inv.useDaysScope = useDaysScope;

  const purchasedAt = Number(inv.purchasedAt) || tsNow;

  if (!useDays) {
    inv.useByAt = null;
    if (!Number.isFinite(Number(inv.cycleStartedAt))) inv.cycleStartedAt = purchasedAt;
    return;
  }

  if (useDaysScope === USE_DAYS_SCOPE_PER_ITEM) {
    if (!Number.isFinite(Number(inv.cycleStartedAt))) inv.cycleStartedAt = purchasedAt;
    inv.useByAt = Number(inv.cycleStartedAt) + msDay(useDays);
  } else {
    inv.useByAt = purchasedAt + msDay(useDays);
  }
}

function applyAutoConsumption() {
  const now = Date.now();
  let changed = false;
  const events = [];

  state.inventory.forEach(inv => {
    ensureInventoryTiming(inv, now);
    const qty = Math.max(0, Number(inv.qty || 0));
    const useDays = Math.max(0, Number(inv.useDays || 0));
    if (!qty || !useDays) return;
    if (inv.useDaysScope !== USE_DAYS_SCOPE_PER_ITEM) return;

    const cycleStartRaw = Number(inv.cycleStartedAt);
    const cycleStart = Number.isFinite(cycleStartRaw) ? cycleStartRaw : (Number(inv.purchasedAt) || now);
    const cycleMs = msDay(useDays);
    const elapsed = now - cycleStart;
    if (elapsed < cycleMs) {
      inv.useByAt = cycleStart + cycleMs;
      return;
    }

    const cycles = Math.floor(elapsed / cycleMs);
    const consumeCount = Math.min(qty, cycles);
    if (!consumeCount) return;

    inv.qty = qty - consumeCount;
    inv.cycleStartedAt = cycleStart + (consumeCount * cycleMs);
    inv.useByAt = inv.cycleStartedAt + cycleMs;
    inv.lastAutoConsumedAt = now;
    inv.lastAutoConsumedQty = consumeCount;
    changed = true;
    events.push({ articleId: inv.articleId, qty: consumeCount });
  });

  if (changed) Storage.save(state);
  return events;
}

function consumeInventoryEntry(inv, qty, options = {}) {
  const available = Math.max(0, Number(inv?.qty || 0));
  const take = Math.min(available, Math.max(0, Number(qty || 0)));
  if (!take) return 0;

  inv.qty = available - take;

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const resetCycle = options.resetCycle === true;
  const useDays = inventoryUseDays(inv);
  const useDaysScope = inventoryUseDaysScope(inv);
  inv.useDays = useDays;
  inv.useDaysScope = useDaysScope;

  if (useDays > 0 && useDaysScope === USE_DAYS_SCOPE_PER_ITEM) {
    if (inv.qty > 0) {
      if (resetCycle) inv.cycleStartedAt = now;
      else if (!Number.isFinite(Number(inv.cycleStartedAt))) inv.cycleStartedAt = Number(inv.purchasedAt) || now;
      inv.useByAt = Number(inv.cycleStartedAt) + msDay(useDays);
    }
  } else if (useDays > 0 && useDaysScope === USE_DAYS_SCOPE_ALL) {
    if (!inv.useByAt) {
      const base = Number(inv.purchasedAt) || now;
      inv.useByAt = base + msDay(useDays);
    }
  }

  return take;
}

function consumeInventoryByArticle(articleId, qty, options = {}) {
  let remaining = Math.max(0, Number(qty || 0));
  if (!remaining) return { consumed: 0, remaining: 0 };

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const entries = state.inventory
    .filter(inv => inv.articleId === articleId && Math.max(0, Number(inv.qty || 0)) > 0);

  entries.forEach(inv => ensureInventoryTiming(inv, now));
  entries.sort((a, b) => {
    const aBy = a.useByAt || Number.MAX_SAFE_INTEGER;
    const bBy = b.useByAt || Number.MAX_SAFE_INTEGER;
    if (aBy !== bBy) return aBy - bBy;
    return (Number(a.purchasedAt) || 0) - (Number(b.purchasedAt) || 0);
  });

  let consumed = 0;
  entries.forEach(inv => {
    if (!remaining) return;
    const take = consumeInventoryEntry(inv, remaining, { ...options, now });
    remaining -= take;
    consumed += take;
  });

  return { consumed, remaining };
}

function availableInventoryBase(articleId) {
  return state.inventory
    .filter(i => i.articleId === articleId && !i.consumed)
    .reduce((acc, i) => acc + Math.max(0, Number(i.qty || 0)), 0);
}

function openInventoryConsumeModal(inv) {
  const a = getArticleById(inv.articleId);
  const unit = normalizeUnit(inv.unit || a?.unit || DEFAULT_UNIT);
  const available = Math.max(0, Number(inv.qty || 0));

  if (!available) {
    modalOpen({
      title: "Verbrauchen",
      bodyHtml: `<div class="empty">Kein Bestand vorhanden.</div>`,
      footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
    });
    return;
  }

  modalOpen({
    title: `${a ? a.name : "Artikel"} verbrauchen`,
    bodyHtml: `
      <div class="field">
        <label>Menge</label>
        <input id="inventoryConsumeQty" type="number" min="0" step="1" value="1" />
        <div class="hint">Verfügbar: ${escapeHtml(String(available))} ${escapeHtml(unit)}</div>
      </div>
    `,
    footerButtons: [
      { label: "Abbrechen", className: "btn", onClick: modalClose },
      { label: "Verbrauchen", className: "btn primary", onClick: () => {
        const raw = $("#inventoryConsumeQty")?.value || 0;
        const requested = Math.max(0, Number(raw || 0));
        if (!requested) {
          modalClose();
          return;
        }
        const now = Date.now();
        const take = Math.min(requested, available);
        consumeInventoryEntry(inv, take, { resetCycle: true, now });
        Storage.save(state);
        modalClose();
        renderInventory();
        renderRecipes();
      }}
    ]
  });
}

function renderInventory() {
  applyAutoConsumption();
  const list = $("#inventoryList");
  const empty = $("#inventoryEmpty");
  if (!list || !empty) return;
  list.innerHTML = "";

  const items = [...state.inventory];
  if (!items.length) empty.classList.remove("hidden");
  else empty.classList.add("hidden");

  const now = Date.now();

  items.sort((a, b) => {
    const aBy = a.useByAt || Number.MAX_SAFE_INTEGER;
    const bBy = b.useByAt || Number.MAX_SAFE_INTEGER;
    if (aBy !== bBy) return aBy - bBy;
    return (b.purchasedAt || 0) - (a.purchasedAt || 0);
  });

  items.forEach(inv => {
    const a = getArticleById(inv.articleId);
    const unit = normalizeUnit(inv.unit || a?.unit || DEFAULT_UNIT);
    const expired = inv.useByAt && inv.useByAt < now;
    const lastAutoQty = Math.max(0, Number(inv.lastAutoConsumedQty || 0));
    const lastAutoAt = inv.lastAutoConsumedAt ? fmtDate(inv.lastAutoConsumedAt) : "";
    const autoTxt = lastAutoQty ? `Auto-Verbrauch: ${lastAutoQty}${lastAutoAt ? ` · ${lastAutoAt}` : ""}` : "";

    const row = document.createElement("div");
    row.className = "irow";
    row.innerHTML = `
      <div>
        <div class="iname">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
        <div class="imeta">
          Bestand: ${escapeHtml(String(Math.max(0, Number(inv.qty || 0))))} ${escapeHtml(unit)}
          · Kauf: ${escapeHtml(fmtDate(inv.purchasedAt))}
          · Brauchen bis: <span class="${expired ? "expired" : ""}">${escapeHtml(inv.useByAt ? fmtDate(inv.useByAt) : "—")}</span>
        </div>
        ${autoTxt ? `<div class="istatus">${escapeHtml(autoTxt)}</div>` : ""}
      </div>
      <div class="iqty">
        <input type="number" min="0" step="1" value="${escapeHtml(String(Math.max(0, Number(inv.qty || 0))))}" />
      </div>
      <div class="iactions">
        <button class="btn" data-action="consume">Verbrauchen</button>
        <button class="btn danger" data-action="delete">Löschen</button>
      </div>
    `;

    row.querySelector('input[type="number"]')?.addEventListener("change", (e) => {
      const nextQty = Math.max(0, Number(e.target.value || 0));
      inv.qty = nextQty;
      Storage.save(state);
      renderInventory();
      renderRecipes();
    });

    row.querySelector('[data-action="consume"]')?.addEventListener("click", () => {
      openInventoryConsumeModal(inv);
    });

    row.querySelector('[data-action="delete"]')?.addEventListener("click", () => {
      state.inventory = state.inventory.filter(x => x.id !== inv.id);
      Storage.save(state);
      renderInventory();
      renderRecipes();
    });

    list.appendChild(row);
  });
}

export {
  applyAutoConsumption,
  availableInventoryBase,
  consumeInventoryEntry,
  consumeInventoryByArticle,
  renderInventory
};
