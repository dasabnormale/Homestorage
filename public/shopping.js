import { $, escapeHtml, msDay } from "./helpers.js";
import { state, Storage } from "./state.js";
import {
  DEFAULT_UNIT,
  DEFAULT_USE_DAYS_SCOPE,
  USE_DAYS_SCOPE_PER_ITEM,
  normalizeCategory,
  normalizeUnit,
  normalizeUseDaysScope,
  displayCategory,
  categorySortIndex
} from "./catalog.js";
import { getArticleById, getRecipeById, upsertArticle } from "./data.js";
import { modalOpen, modalClose } from "./modal.js";
import { renderInventory } from "./inventory.js";
import { renderHistory } from "./history.js";
import { renderRecipes } from "./recipes.js";

function ensureShoppingLine(articleId, unit) {
  let line = state.shopping.find(s => s.articleId === articleId) || null;
  const incomingUnit = (unit || "").trim();
  if (!line) {
    line = {
      id: Storage.nextId(state),
      articleId,
      qty: 0,
      unit: normalizeUnit(incomingUnit || getArticleById(articleId)?.unit),
      sources: [],
      selected: false,
      createdAt: Date.now()
    };
    state.shopping.unshift(line);
  }
  if (!Array.isArray(line.sources)) line.sources = [];
  if (typeof line.selected !== "boolean") line.selected = false;
  if (incomingUnit) line.unit = normalizeUnit(incomingUnit);
  if (!line.unit) line.unit = normalizeUnit(getArticleById(articleId)?.unit);
  return line;
}

function recomputeLineQty(line) {
  line.qty = (line.sources || []).reduce((acc, s) => acc + Math.max(0, Number(s.qty || 0)), 0);
  if (!line.qty) line.qty = 0;
}

function addShoppingFromRecipe(articleId, recipeId, qty, unit) {
  const q = Math.max(1, Number(qty || 1));
  const line = ensureShoppingLine(articleId, unit);
  const idx = line.sources.findIndex(s => s.type === "recipe" && s.recipeId === recipeId);
  if (idx >= 0) line.sources[idx] = { type: "recipe", recipeId, qty: q };
  else line.sources.push({ type: "recipe", recipeId, qty: q });
  recomputeLineQty(line);
  Storage.save(state);
}

function addShoppingManual(articleId, qty, unit) {
  const q = Math.max(1, Number(qty || 1));
  const line = ensureShoppingLine(articleId, unit);
  const idx = line.sources.findIndex(s => s.type === "manual");
  if (idx >= 0) line.sources[idx].qty = Math.max(0, Number(line.sources[idx].qty || 0)) + q;
  else line.sources.push({ type: "manual", recipeId: null, qty: q });
  recomputeLineQty(line);
  Storage.save(state);
}

function reduceSourcesAfterPurchase(line, boughtQty) {
  let remaining = Math.max(0, Number(boughtQty || 0));
  const sources = [...(line.sources || [])];
  for (let i = 0; i < sources.length && remaining > 0; i++) {
    const sQty = Math.max(0, Number(sources[i].qty || 0));
    const take = Math.min(sQty, remaining);
    sources[i].qty = sQty - take;
    remaining -= take;
  }
  line.sources = sources.filter(s => Math.max(0, Number(s.qty || 0)) > 0);
  recomputeLineQty(line);
}

function renderShoppingAddForm() {
  const sel = $("#shopAddArticleSelect");
  const unitInput = $("#shopAddUnit");
  if (!sel) return;
  sel.innerHTML = "";

  const sorted = [...state.articles].sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
  if (!sorted.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Keine Artikel – unten erstellen";
    sel.appendChild(opt);
    sel.disabled = true;
    if (unitInput) {
      unitInput.value = DEFAULT_UNIT;
      unitInput.disabled = true;
    }
    return;
  }

  sel.disabled = false;
  sorted.forEach(a => {
    const opt = document.createElement("option");
    opt.value = String(a.id);
    opt.textContent = `${a.name}`;
    sel.appendChild(opt);
  });

  if (unitInput) {
    const current = getArticleById(Number(sel.value));
    unitInput.value = current?.unit || DEFAULT_UNIT;
    unitInput.disabled = false;
  }

  sel.onchange = () => {
    if (!unitInput) return;
    const current = getArticleById(Number(sel.value));
    unitInput.value = current?.unit || DEFAULT_UNIT;
  };
}

function renderShopping() {
  renderShoppingAddForm();

  $("#btnAddManualToShopping").onclick = () => {
    const articleId = Number($("#shopAddArticleSelect")?.value || 0);
    const qty = Math.max(1, Number($("#shopAddQty")?.value || 1));
    const unit = ($("#shopAddUnit")?.value || DEFAULT_UNIT).trim() || DEFAULT_UNIT;
    if (!articleId) return;
    addShoppingManual(articleId, qty, unit);
    renderShopping();
    renderRecipes();
  };

  $("#btnShopCreateArticle").onclick = () => {
    const name = ($("#shopNewArticleName")?.value || "").trim();
    const category = normalizeCategory($("#shopNewArticleCategory")?.value || "");
    const useDays = Math.max(0, Number($("#shopNewArticleUseDays")?.value || 0));
    const useDaysScope = normalizeUseDaysScope($("#shopNewArticleUseDaysScope")?.value || DEFAULT_USE_DAYS_SCOPE);
    if (!name) return;

    const existing = state.articles.find(a => (a.name || "").trim().toLowerCase() === name.toLowerCase());
    if (existing) return;

    upsertArticle({ id: Storage.nextId(state), name, category, useDays, useDaysScope, createdAt: Date.now() });
    $("#shopNewArticleName").value = "";
    $("#shopNewArticleCategory").value = "";
    $("#shopNewArticleUseDays").value = 0;
    $("#shopNewArticleUseDaysScope").value = DEFAULT_USE_DAYS_SCOPE;
    renderShopping();
  };

  const list = $("#shoppingList");
  const empty = $("#shoppingEmpty");
  if (!list || !empty) return;

  list.innerHTML = "";
  const lines = [...state.shopping].filter(l => Math.max(0, Number(l.qty || 0)) > 0);

  if (!lines.length) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
  }

  lines.sort((a, b) => {
    const aArticle = getArticleById(a.articleId);
    const bArticle = getArticleById(b.articleId);
    const aCat = displayCategory(aArticle?.category);
    const bCat = displayCategory(bArticle?.category);
    const catDiff = categorySortIndex(aCat) - categorySortIndex(bCat);
    if (catDiff !== 0) return catDiff;
    const aName = (aArticle?.name || "Unbekannter Artikel").toLowerCase();
    const bName = (bArticle?.name || "Unbekannter Artikel").toLowerCase();
    return aName.localeCompare(bName, "de");
  });

  lines.forEach(line => {
    const a = getArticleById(line.articleId);
    const unit = normalizeUnit(line.unit || a?.unit || DEFAULT_UNIT);

    const sourceTxt = (() => {
      const src = line.sources || [];
      const recipeParts = src
        .filter(s => s.type === "recipe" && s.recipeId)
        .map(s => {
          const r = getRecipeById(s.recipeId);
          return r ? `${r.name}: ${s.qty} ${unit}` : null;
        })
        .filter(Boolean);

      const manual = src.find(s => s.type === "manual");
      const manualTxt = manual ? `Manuell: ${manual.qty} ${unit}` : null;

      const all = [...recipeParts];
      if (manualTxt) all.push(manualTxt);

      if (!all.length) return "—";
      return all.slice(0, 3).join(" · ") + (all.length > 3 ? " · …" : "");
    })();

    const row = document.createElement("div");
    row.className = "srow";
    row.innerHTML = `
      <input class="checkbox" type="checkbox" ${line.selected ? "checked" : ""} />
      <div>
        <div class="sname">${escapeHtml(a ? a.name : "Unbekannter Artikel")} (${escapeHtml(unit)})</div>
        <div class="smeta">Benötigt: ${escapeHtml(String(line.qty))} ${escapeHtml(unit)} · ${escapeHtml(sourceTxt)}</div>
      </div>
      <div class="sqty">
        <span>${escapeHtml(String(line.qty))} ${escapeHtml(unit)}</span>
      </div>
      <div class="sactions">
        <button class="btn danger">Entfernen</button>
      </div>
    `;

    row.querySelector('input[type="checkbox"]')?.addEventListener("change", (e) => {
      line.selected = e.target.checked;
      Storage.save(state);
    });

    row.querySelector("button")?.addEventListener("click", () => {
      state.shopping = state.shopping.filter(x => x.id !== line.id);
      Storage.save(state);
      renderShopping();
      renderRecipes();
    });

    list.appendChild(row);
  });

  $("#btnSelectAllShopping").onclick = () => {
    state.shopping.forEach(l => l.selected = true);
    Storage.save(state);
    renderShopping();
  };

  $("#btnConfirmPurchase").onclick = () => {
    const selected = state.shopping.filter(l => l.selected && Math.max(0, Number(l.qty || 0)) > 0);
    if (!selected.length) {
      modalOpen({
        title: "Keine Auswahl",
        bodyHtml: `<div class="empty">Bitte wähle mindestens einen Eintrag aus.</div>`,
        footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
      });
      return;
    }

    const body = `
      <div class="empty">
        Du bestätigst jetzt den Einkauf. Für jeden Artikel gibst du an, wie viel tatsächlich ins Lager geht.
        <br><br>
        Beispiel Knoblauch: benötigt 3 Zehen, gekauft 12 Zehen → gib 12 ein.
      </div>
      <div class="block">
        <div class="blockTitle">Gekauft (ins Lager)</div>
        ${selected.map(l => {
          const a = getArticleById(l.articleId);
          const unit = normalizeUnit(l.unit || a?.unit || DEFAULT_UNIT);
          return `
            <div class="row">
              <div></div>
              <div>
                <div class="name">${escapeHtml(a ? a.name : "Unbekannt")}</div>
                <div class="muted">Benötigt: ${escapeHtml(String(l.qty))} ${escapeHtml(unit)}</div>
              </div>
              <div class="qty">
                <input data-buy="${l.id}" type="number" min="0" step="1" value="${escapeHtml(String(l.qty))}" />
              </div>
              <div class="actions"></div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    modalOpen({
      title: "Einkauf bestätigen",
      bodyHtml: body,
      footerButtons: [
        { label: "Abbrechen", className: "btn", onClick: modalClose },
        { label: "Bestätigen", className: "btn primary", onClick: () => {
          const purchasedAt = Date.now();
          const historyEntry = { id: Storage.nextId(state), purchasedAt, items: [] };

          selected.forEach(line => {
            const input = document.querySelector(`input[data-buy="${line.id}"]`);
            const bought = Math.max(0, Number(input?.value || 0));
            const a = getArticleById(line.articleId);
            const unit = normalizeUnit(line.unit || a?.unit || DEFAULT_UNIT);

            if (bought > 0) {
              const useDays = Math.max(0, Number(a?.useDays || 0));
              const useDaysScope = normalizeUseDaysScope(a?.useDaysScope || DEFAULT_USE_DAYS_SCOPE);
              let useByAt = null;
              let cycleStartedAt = null;
              if (useDays) {
                if (useDaysScope === USE_DAYS_SCOPE_PER_ITEM) {
                  cycleStartedAt = purchasedAt;
                  useByAt = purchasedAt + msDay(useDays);
                } else {
                  useByAt = purchasedAt + msDay(useDays);
                }
              }

              state.inventory.unshift({
                id: Storage.nextId(state),
                articleId: line.articleId,
                qty: bought,
                unit,
                purchasedAt,
                useDays,
                useDaysScope,
                cycleStartedAt,
                useByAt,
                consumed: false,
                consumedAt: null
              });

              historyEntry.items.push({
                articleId: line.articleId,
                neededQty: Math.max(0, Number(line.qty || 0)),
                boughtQty: bought,
                unit,
                sources: (line.sources || []).map(s => ({ type: s.type, recipeId: s.recipeId || null, qty: s.qty }))
              });

              reduceSourcesAfterPurchase(line, bought);
            }

            line.selected = false;
          });

          state.shopping = state.shopping.filter(l => Math.max(0, Number(l.qty || 0)) > 0);

          if (historyEntry.items.length) state.history.unshift(historyEntry);

          Storage.save(state);
          modalClose();
          renderShopping();
          renderInventory();
          renderHistory();
          renderRecipes();
        }}
      ]
    });
  };
}

export { addShoppingFromRecipe, addShoppingManual, renderShopping };
