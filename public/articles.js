import { $, escapeHtml } from "./helpers.js";
import { state, Storage } from "./state.js";
import {
  DEFAULT_UNIT,
  DEFAULT_USE_DAYS_SCOPE,
  categoryOptionsHtml,
  displayCategory,
  normalizeCategory,
  normalizeUnit,
  normalizeUseDaysScope,
  useDaysScopeOptionsHtml
} from "./catalog.js";
import { getArticleById, upsertArticle, removeArticle } from "./data.js";
import { addShoppingManual, renderShopping } from "./shopping.js";
import { renderRecipes } from "./recipes.js";
import { renderInventory } from "./inventory.js";
import { renderHistory } from "./history.js";
import { modalOpen, modalClose } from "./modal.js";

function openArticleEditor(articleId) {
  const a = articleId
    ? getArticleById(articleId)
    : { id: null, name: "", category: "", useDays: 0, useDaysScope: DEFAULT_USE_DAYS_SCOPE };

  modalOpen({
    title: articleId ? "Artikel bearbeiten" : "Neuer Artikel",
    bodyHtml: `
      <div class="field">
        <label>Name</label>
        <input id="mArticleName" type="text" value="${escapeHtml(a.name || "")}" />
      </div>
      <div class="field">
        <label>Kategorie (optional)</label>
        <select id="mArticleCategory">
          ${categoryOptionsHtml(a.category)}
        </select>
      </div>
      <div class="field">
        <label>Verbrauch (Tage)</label>
        <input id="mArticleUseDays" type="number" min="0" step="1" value="${escapeHtml(String(Math.max(0, Number(a.useDays || 0))))}" />
        <div class="hint">0 = nicht berechnen.</div>
      </div>
      <div class="field">
        <label>Verbrauch gilt</label>
        <select id="mArticleUseDaysScope">
          ${useDaysScopeOptionsHtml(a.useDaysScope)}
        </select>
      </div>
    `,
    footerButtons: [
      { label: "Abbrechen", className: "btn", onClick: modalClose },
      { label: "Speichern", className: "btn primary", onClick: () => {
        const name = ($("#mArticleName").value || "").trim();
        const category = normalizeCategory($("#mArticleCategory").value || "");
        const useDays = Math.max(0, Number($("#mArticleUseDays").value || 0));
        const useDaysScope = normalizeUseDaysScope($("#mArticleUseDaysScope").value || DEFAULT_USE_DAYS_SCOPE);
        if (!name) return;

        const clash = state.articles.find(x => x.id !== a.id && (x.name || "").trim().toLowerCase() === name.toLowerCase());
        if (clash) return;

        if (articleId) upsertArticle({ ...getArticleById(articleId), name, category, useDays, useDaysScope });
        else upsertArticle({ id: Storage.nextId(state), name, category, useDays, useDaysScope, createdAt: Date.now() });

        modalClose();
        renderArticles();
        renderShopping();
        renderRecipes();
        renderInventory();
      }}
    ]
  });

  setTimeout(() => $("#mArticleName")?.focus(), 0);
}

function confirmDeleteArticle(articleId) {
  const a = getArticleById(articleId);
  if (!a) return;
  modalOpen({
    title: "Artikel löschen",
    bodyHtml: `<div class="empty">Willst du <b>${escapeHtml(a.name)}</b> wirklich löschen?</div>`,
    footerButtons: [
      { label: "Abbrechen", className: "btn", onClick: modalClose },
      { label: "Löschen", className: "btn danger", onClick: () => {
        modalClose();
        removeArticle(articleId);
        renderArticles();
        renderShopping();
        renderRecipes();
        renderInventory();
        renderHistory();
      }}
    ]
  });
}

function renderArticles() {
  const q = ($("#articleSearch")?.value || "").trim().toLowerCase();

  let items = [...state.articles].filter(a => {
    if (!q) return true;
    return `${a.name || ""} ${a.unit || ""}`.toLowerCase().includes(q);
  });

  items.sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));

  const table = $("#articleTable");
  if (!table) return;

  table.innerHTML = `
    <div class="thead">
      <div>Name</div>
      <div>Kategorie</div>
      <div style="text-align:right">Einkaufsliste</div>
      <div style="text-align:right">Aktionen</div>
    </div>
  `;

  if (!items.length) {
    table.innerHTML += `
      <div class="trow">
        <div class="tname">Keine Artikel</div>
        <div></div>
        <div></div>
        <div class="tactions"></div>
      </div>
    `;
    return;
  }

  items.forEach(a => {
    const row = document.createElement("div");
    row.className = "trow";
    row.innerHTML = `
      <div class="tname">
        ${escapeHtml(a.name || "")}
        <div class="muted">Verbrauchszeit: ${escapeHtml(String(Math.max(0, Number(a.useDays || 0))))} Tage</div>
      </div>
      <div class="tcategory">${escapeHtml(displayCategory(a.category))}</div>
      <div class="tadd">
        <input type="number" min="1" step="1" value="1" />
        <button class="btn" data-action="add-shopping" data-id="${a.id}">Zur Einkaufsliste</button>
      </div>
      <div class="tactions">
        <button class="btn" data-action="edit" data-id="${a.id}">Bearbeiten</button>
        <button class="btn danger" data-action="delete" data-id="${a.id}">Löschen</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]')?.addEventListener("click", () => openArticleEditor(a.id));
    row.querySelector('[data-action="delete"]')?.addEventListener("click", () => confirmDeleteArticle(a.id));
    row.querySelector('[data-action="add-shopping"]')?.addEventListener("click", (e) => {
      const qtyInput = row.querySelector('input[type="number"]');
      const qty = Math.max(1, Number(qtyInput?.value || 1));
      addShoppingManual(a.id, qty, normalizeUnit(a.unit || DEFAULT_UNIT));
      renderShopping();
      renderRecipes();
    });
    table.appendChild(row);
  });

  $("#btnArticleInlineAdd").onclick = () => {
    const name = ($("#articleInlineName").value || "").trim();
    const category = normalizeCategory($("#articleInlineCategory").value || "");
    const useDays = Math.max(0, Number($("#articleInlineUseDays").value || 0));
    const useDaysScope = normalizeUseDaysScope($("#articleInlineUseDaysScope").value || DEFAULT_USE_DAYS_SCOPE);
    if (!name) return;

    const existing = state.articles.find(a => (a.name || "").trim().toLowerCase() === name.toLowerCase());
    if (existing) return;

    upsertArticle({ id: Storage.nextId(state), name, category, useDays, useDaysScope, createdAt: Date.now() });
    $("#articleInlineName").value = "";
    $("#articleInlineCategory").value = "";
    $("#articleInlineUseDays").value = 0;
    $("#articleInlineUseDaysScope").value = DEFAULT_USE_DAYS_SCOPE;
    renderArticles();
  };
}

$("#btnNewArticle")?.addEventListener("click", () => openArticleEditor(null));
$("#articleSearch")?.addEventListener("input", renderArticles);

export { openArticleEditor, renderArticles };
