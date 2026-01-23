import { $, escapeHtml } from "./helpers.js";
import { state, Storage } from "./state.js";
import {
  DEFAULT_UNIT,
  DEFAULT_USE_DAYS_SCOPE,
  normalizeCategory,
  normalizeUnit,
  normalizeUseDaysScope,
  recipeItemUnit,
  unitOptionsHtml
} from "./catalog.js";
import { getArticleById, getRecipeById, upsertArticle, upsertRecipe, removeRecipe } from "./data.js";
import { addShoppingFromRecipe } from "./shopping.js";
import { modalOpen, modalClose } from "./modal.js";
import {
  applyAutoConsumption,
  availableInventoryBase,
  consumeInventoryByArticle,
  renderInventory
} from "./inventory.js";

let selectedRecipeId = null;
let editingRecipeId = null;

function plannedShoppingBase(articleId) {
  const line = state.shopping.find(s => s.articleId === articleId);
  if (!line) return 0;
  return Math.max(0, Number(line.qty || 0));
}

function computeAllocation() {
  const recipes = [...state.recipes].sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
  const byArticle = new Map();
  recipes.forEach(r => {
    (r.items || []).forEach(it => {
      const need = Math.max(1, Number(it.qty || 1));
      const arr = byArticle.get(it.articleId) || [];
      arr.push({ recipeId: r.id, need });
      byArticle.set(it.articleId, arr);
    });
  });

  const alloc = {};
  recipes.forEach(r => { alloc[r.id] = {}; });

  byArticle.forEach((needsArr, articleId) => {
    let inv = availableInventoryBase(articleId);
    let shop = plannedShoppingBase(articleId);

    needsArr.forEach(n => {
      const invCover = Math.min(inv, n.need);
      inv -= invCover;

      const remain = n.need - invCover;
      const shopCover = Math.min(shop, remain);
      shop -= shopCover;

      const missing = remain - shopCover;
      alloc[n.recipeId][articleId] = { need: n.need, invCover, shopCover, missing };
    });
  });

  return alloc;
}

function recipeStatusForList(r, alloc) {
  const items = r.items || [];
  if (!items.length) return { cls: "", text: "0 Artikel" };
  let missingCount = 0;
  let coveredByShop = 0;

  items.forEach(it => {
    const a = alloc?.[r.id]?.[it.articleId];
    const missing = a ? a.missing : Math.max(1, Number(it.qty || 1));
    if (missing > 0) missingCount++;
    else {
      const need = a?.need || Math.max(1, Number(it.qty || 1));
      const invCover = a?.invCover || 0;
      if (invCover < need) coveredByShop++;
    }
  });

  if (missingCount === 0 && coveredByShop === 0) return { cls: "ok", text: "Alles im Lager" };
  if (missingCount === 0 && coveredByShop > 0) return { cls: "needShop", text: "Durch Einkaufsliste gedeckt" };
  return { cls: "missing", text: `${missingCount} fehlt` };
}

function renderRecipes() {
  applyAutoConsumption();
  const alloc = computeAllocation();

  const q = ($("#recipeSearch")?.value || "").trim().toLowerCase();
  const list = $("#recipeList");
  if (!list) return;
  list.innerHTML = "";

  const recipes = [...state.recipes].filter(r => {
    if (!q) return true;
    const itemNames = (r.items || [])
      .map(it => getArticleById(it.articleId)?.name || "")
      .join(" ");
    const hay = `${r.name || ""} ${(r.tags || "")} ${(r.description || "")} ${itemNames}`.toLowerCase();
    return hay.includes(q);
  });

  recipes.forEach(r => {
    const st = recipeStatusForList(r, alloc);
    const card = document.createElement("div");
    const c = recipeCoverageCounts(r, alloc);

    card.className =
      "itemCard" +
      (r.id === selectedRecipeId ? " active" : "") +
      (st.cls ? ` ${st.cls}` : "");

    card.innerHTML = `
      <div class="itemTitle">${escapeHtml(r.name || "Unbenannt")}</div>
      <div class="itemSub">${(r.items || []).length} Artikel · ${escapeHtml(st.text)}</div>
      <div class="badges">
        <span class="badge inv">Lager: ${c.invCount}/${c.total}</span>
        <span class="badge shop">Einkauf: ${c.shopCount}/${c.total}</span>
        <span class="badge miss">Fehlt: ${c.missCount}/${c.total}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      selectedRecipeId = r.id;
      editingRecipeId = null;
      renderRecipes();
    });
    list.appendChild(card);
  });

  if (!recipes.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Keine Rezepte gefunden.";
    list.appendChild(empty);
  }

  renderRecipeRightPane(alloc);
}

function renderRecipeRightPane(alloc) {
  const recipe = selectedRecipeId ? getRecipeById(selectedRecipeId) : null;

  $("#recipeDetail")?.classList.add("hidden");
  $("#recipeEditor")?.classList.add("hidden");
  $("#recipeDetailEmpty")?.classList.add("hidden");

  const actions = $("#recipeDetailActions");
  if (actions) actions.innerHTML = "";

  if (!recipe) {
    $("#recipeDetailEmpty")?.classList.remove("hidden");
    const t = $("#recipeDetailTitle");
    if (t) t.textContent = "Rezept";
    return;
  }

  if (editingRecipeId === recipe.id) {
    const t = $("#recipeDetailTitle");
    if (t) t.textContent = "Rezept bearbeiten";
    $("#recipeEditor")?.classList.remove("hidden");
    renderRecipeEditor(recipe);
    return;
  }

  const t = $("#recipeDetailTitle");
  if (t) t.textContent = recipe.name || "Rezept";
  $("#recipeDetail")?.classList.remove("hidden");

  const btnEdit = document.createElement("button");
  btnEdit.className = "btn";
  btnEdit.textContent = "Bearbeiten";
  btnEdit.addEventListener("click", () => {
    editingRecipeId = recipe.id;
    renderRecipes();
  });

  const btnDel = document.createElement("button");
  btnDel.className = "btn danger";
  btnDel.textContent = "Löschen";
  btnDel.addEventListener("click", () => {
    modalOpen({
      title: "Rezept löschen",
      bodyHtml: `<div class="empty">Willst du <b>${escapeHtml(recipe.name || "dieses Rezept")}</b> wirklich löschen?</div>`,
      footerButtons: [
        { label: "Abbrechen", className: "btn", onClick: modalClose },
        { label: "Löschen", className: "btn danger", onClick: () => {
          modalClose();
          removeRecipe(recipe.id);
          if (selectedRecipeId === recipe.id) selectedRecipeId = null;
          editingRecipeId = null;
          renderRecipes();
        }}
      ]
    });
  });

  actions?.appendChild(btnEdit);
  actions?.appendChild(btnDel);

  const items = recipe.items || [];
  const badge = $("#recipeItemCount");
  if (badge) badge.textContent = `${items.length} Artikel`;

  const desc = $("#recipeDescription");
  if (desc) desc.textContent = recipe.description || "";

  const itemsWrap = $("#recipeItems");
  if (!itemsWrap) return;
  itemsWrap.innerHTML = "";

  items.forEach((it, idx) => {
    const a = getArticleById(it.articleId);
    const unit = recipeItemUnit(it, a);
    const checked = it.checked !== false;

    const info = alloc?.[recipe.id]?.[it.articleId] || {
      need: Math.max(1, Number(it.qty || 1)), invCover: 0, shopCover: 0, missing: Math.max(1, Number(it.qty || 1))
    };

    const hlClass = info.missing > 0 ? "hlMissing" : "";
    const need = Math.max(1, Number(info.need || 1));
    const invCover = Math.max(0, Number(info.invCover || 0));
    const shopCover = Math.max(0, Number(info.shopCover || 0));
    const invPct = Math.min(100, (invCover / need) * 100);
    const shopEnd = Math.min(100, invPct + (shopCover / need) * 100);

    const row = document.createElement("div");
    row.className = `row ${hlClass} hasCoverage`;
    row.innerHTML = `
      <div class="coverageBg" style="--inv:${invPct}%; --shop:${shopEnd}%"></div>
      <input class="checkbox" type="checkbox" ${checked ? "checked" : ""} data-idx="${idx}" />
      <div>
        <div class="name">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
        <div class="muted">
          Bedarf: ${escapeHtml(String(info.need))} ${escapeHtml(unit)}
          · Lager: ${escapeHtml(String(info.invCover))}
          · Einkaufsliste: ${escapeHtml(String(info.shopCover))}
          · Fehlt: ${escapeHtml(String(info.missing))}
        </div>
      </div>
      <div class="qty">
        <span>${escapeHtml(String(it.qty || 1))} ${escapeHtml(unit)}</span>
      </div>
      <div class="actions">
        <button class="btn" data-action="remove" data-idx="${idx}">Entfernen</button>
      </div>
    `;

    row.querySelector("input[type=checkbox]")?.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.idx);
      const r = getRecipeById(recipe.id);
      r.items[i].checked = e.target.checked;
      upsertRecipe(r);
      renderRecipes();
    });

    row.querySelector('[data-action="remove"]')?.addEventListener("click", (e) => {
      const i = Number(e.target.dataset.idx);
      const r = getRecipeById(recipe.id);
      r.items.splice(i, 1);
      upsertRecipe(r);
      renderRecipes();
    });

    itemsWrap.appendChild(row);
  });

  $("#btnAddToShopping").onclick = () => {
    const r = getRecipeById(recipe.id);
    const chosen = (r.items || []).filter(it => it.checked !== false);
    if (!chosen.length) {
      modalOpen({
        title: "Nichts ausgewählt",
        bodyHtml: `<div class="empty">Alle Artikel sind abgewählt. Hake mindestens einen Artikel an.</div>`,
        footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
      });
      return;
    }

    chosen.forEach(it => {
      const a = getArticleById(it.articleId);
      const unit = recipeItemUnit(it, a);
      addShoppingFromRecipe(it.articleId, r.id, Number(it.qty || 1), unit);
    });

    modalOpen({
      title: "Auf Einkaufsliste",
      bodyHtml: `<div class="empty">${chosen.length} Artikel wurden auf die Einkaufsliste gesetzt (stückgenau wie im Rezept).</div>`,
      footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
    });
  };

  $("#btnConsumeFromRecipe").onclick = () => {
    const r = getRecipeById(recipe.id);
    if (!r) return;
    openRecipeConsumeModal(r);
  };

  $("#btnResetChecks").onclick = () => {
    const r = getRecipeById(recipe.id);
    (r.items || []).forEach(it => it.checked = true);
    upsertRecipe(r);
    renderRecipes();
  };
}

function openRecipeConsumeModal(recipe) {
  applyAutoConsumption();
  const items = (recipe.items || []).map(it => {
    const a = getArticleById(it.articleId);
    return {
      articleId: it.articleId,
      name: a ? a.name : "Unbekannter Artikel",
      unit: recipeItemUnit(it, a),
      qty: Math.max(1, Number(it.qty || 1)),
      available: availableInventoryBase(it.articleId)
    };
  });

  if (!items.length) {
    modalOpen({
      title: "Rezept verbrauchen",
      bodyHtml: `<div class="empty">Dieses Rezept hat keine Artikel.</div>`,
      footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
    });
    return;
  }

  const body = `
    <div class="empty">Ziehe die Mengen direkt vom Lager ab.</div>
    <div class="block">
      <div class="blockTitle">Verbrauchen</div>
      ${items.map((it, idx) => `
        <div class="row">
          <div></div>
          <div>
            <div class="name">${escapeHtml(it.name)}</div>
            <div class="muted">Verfügbar: ${escapeHtml(String(it.available))} ${escapeHtml(it.unit)}</div>
          </div>
          <div class="qty">
            <input data-consume="${idx}" type="number" min="0" step="1" value="${escapeHtml(String(it.qty))}" />
          </div>
          <div class="actions"></div>
        </div>
      `).join("")}
    </div>
  `;

  modalOpen({
    title: "Rezept verbrauchen",
    bodyHtml: body,
    footerButtons: [
      { label: "Abbrechen", className: "btn", onClick: modalClose },
      { label: "Verbrauchen", className: "btn primary", onClick: () => {
        const now = Date.now();
        const requests = new Map();

        items.forEach((it, idx) => {
          const input = document.querySelector(`input[data-consume="${idx}"]`);
          const requested = Math.max(0, Number(input?.value || 0));
          if (!requested) return;
          const entry = requests.get(it.articleId) || {
            articleId: it.articleId,
            name: it.name,
            unit: it.unit,
            requested: 0
          };
          entry.requested += requested;
          requests.set(it.articleId, entry);
        });

        if (!requests.size) {
          modalClose();
          return;
        }

        let changed = false;
        const shortages = [];

        requests.forEach(req => {
          const available = availableInventoryBase(req.articleId);
          const toConsume = Math.min(req.requested, available);
          if (toConsume > 0) {
            const res = consumeInventoryByArticle(req.articleId, toConsume, { resetCycle: true, now });
            if (res.consumed > 0) changed = true;
          }
          if (req.requested > available) {
            shortages.push({
              name: req.name,
              missing: req.requested - available,
              unit: req.unit
            });
          }
        });

        if (changed) {
          Storage.save(state);
        }
        modalClose();
        renderInventory();
        renderRecipes();

        if (shortages.length) {
          modalOpen({
            title: "Nicht genug im Lager",
            bodyHtml: `<div class="empty">${shortages.map(s => (
              `${escapeHtml(s.name)}: ${escapeHtml(String(s.missing))} ${escapeHtml(s.unit)}`
            )).join("<br>")}</div>`,
            footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
          });
        }
      }}
    ]
  });
}

function renderRecipeEditor(recipe) {
  $("#editRecipeName").value = recipe.name || "";
  $("#editRecipeTags").value = (recipe.tags || "").toString();
  $("#editRecipeDescription").value = recipe.description || "";
  const unitSelect = $("#editItemUnit");
  const applyUnitOptions = (unit) => {
    if (!unitSelect) return;
    const clean = normalizeUnit(unit);
    unitSelect.innerHTML = unitOptionsHtml(clean);
    unitSelect.value = clean;
  };
  $("#editItemQty").value = 1;
  applyUnitOptions(DEFAULT_UNIT);
  $("#inlineArticleName").value = "";
  $("#inlineArticleCategory").value = "";
  $("#inlineArticleUseDays").value = 0;
  $("#inlineArticleUseDaysScope").value = DEFAULT_USE_DAYS_SCOPE;

  const sel = $("#editItemArticleSelect");
  sel.innerHTML = "";
  const sorted = [...state.articles].sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));

  if (!sorted.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Keine Artikel vorhanden – unten hinzufügen";
    sel.appendChild(opt);
    sel.disabled = true;
  } else {
    sel.disabled = false;
    sorted.forEach(a => {
      const opt = document.createElement("option");
      opt.value = String(a.id);
      opt.textContent = `${a.name}`;
      sel.appendChild(opt);
    });
  }

  if (unitSelect) {
    if (!sorted.length) {
      unitSelect.disabled = true;
      applyUnitOptions(DEFAULT_UNIT);
    } else {
      unitSelect.disabled = false;
      const currentArticle = getArticleById(Number(sel.value));
      applyUnitOptions(currentArticle?.unit || DEFAULT_UNIT);
    }
  }

  sel.onchange = () => {
    if (!unitSelect) return;
    const currentArticle = getArticleById(Number(sel.value));
    applyUnitOptions(currentArticle?.unit || DEFAULT_UNIT);
  };

  const wrap = $("#editRecipeItems");
  wrap.innerHTML = "";
  (recipe.items || []).forEach((it, idx) => {
    const a = getArticleById(it.articleId);
    const unit = recipeItemUnit(it, a);
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div></div>
      <div>
        <div class="name">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
        <div class="muted">${escapeHtml(unit)}</div>
      </div>
      <div class="qty">
        <input type="number" min="1" step="1" value="${escapeHtml(String(it.qty || 1))}" data-idx="${idx}" />
        <select data-unit-idx="${idx}">
          ${unitOptionsHtml(unit)}
        </select>
      </div>
      <div class="actions">
        <button class="btn danger" data-action="remove" data-idx="${idx}">Entfernen</button>
      </div>
    `;

    row.querySelector('input[type="number"]')?.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.idx);
      const r = getRecipeById(recipe.id);
      r.items[i].qty = Math.max(1, Number(e.target.value || 1));
      upsertRecipe(r);
      renderRecipeEditor(r);
    });

    row.querySelector('select[data-unit-idx]')?.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.unitIdx);
      const r = getRecipeById(recipe.id);
      r.items[i].unit = normalizeUnit(e.target.value);
      upsertRecipe(r);
      renderRecipeEditor(r);
    });

    row.querySelector('[data-action="remove"]')?.addEventListener("click", (e) => {
      const i = Number(e.target.dataset.idx);
      const r = getRecipeById(recipe.id);
      r.items.splice(i, 1);
      upsertRecipe(r);
      renderRecipeEditor(r);
    });

    wrap.appendChild(row);
  });

  $("#btnAddItemToRecipe").onclick = () => {
    if (!state.articles.length) return;
    const articleId = Number(sel.value);
    if (!articleId) return;
    const qty = Math.max(1, Number($("#editItemQty").value || 1));
    const unit = normalizeUnit($("#editItemUnit")?.value || DEFAULT_UNIT);
    const r = getRecipeById(recipe.id);
    r.items = r.items || [];
    r.items.push({ articleId, qty, unit, checked: true });
    upsertRecipe(r);
    renderRecipeEditor(r);
  };

  $("#btnInlineAddArticle").onclick = () => {
    const name = ($("#inlineArticleName").value || "").trim();
    const category = normalizeCategory($("#inlineArticleCategory").value || "");
    const useDays = Math.max(0, Number($("#inlineArticleUseDays").value || 0));
    const useDaysScope = normalizeUseDaysScope($("#inlineArticleUseDaysScope").value || DEFAULT_USE_DAYS_SCOPE);
    if (!name) return;

    const existing = state.articles.find(a => (a.name || "").trim().toLowerCase() === name.toLowerCase());
    if (existing) return;

    const a = { id: Storage.nextId(state), name, category, useDays, useDaysScope, createdAt: Date.now() };
    upsertArticle(a);
    $("#inlineArticleName").value = "";
    $("#inlineArticleCategory").value = "";
    $("#inlineArticleUseDays").value = 0;
    $("#inlineArticleUseDaysScope").value = DEFAULT_USE_DAYS_SCOPE;
    renderRecipeEditor(getRecipeById(recipe.id));
  };

  $("#btnSaveRecipe").onclick = () => {
    const name = ($("#editRecipeName").value || "").trim();
    if (!name) return;
    const r = getRecipeById(recipe.id);
    r.name = name;
    r.tags = ($("#editRecipeTags").value || "").trim();
    r.description = ($("#editRecipeDescription").value || "").trim();
    upsertRecipe(r);
    editingRecipeId = null;
    renderRecipes();
  };

  $("#btnCancelRecipeEdit").onclick = () => {
    editingRecipeId = null;
    renderRecipes();
  };
}

function recipeCoverageCounts(r, alloc) {
  const items = r.items || [];
  const total = items.length;

  let invCount = 0;
  let shopCount = 0;
  let missCount = 0;

  items.forEach(it => {
    const info = alloc?.[r.id]?.[it.articleId] || null;
    const need = info ? info.need : Math.max(1, Number(it.qty || 1));
    const invCover = info ? info.invCover : 0;
    const shopCover = info ? info.shopCover : 0;
    const missing = info ? info.missing : need;

    if (missing > 0) {
      missCount++;
    } else if (invCover >= need) {
      invCount++;
    } else if (shopCover > 0) {
      shopCount++;
    } else {
      missCount++;
    }
  });

  return { total, invCount, shopCount, missCount };
}

$("#btnNewRecipe")?.addEventListener("click", () => {
  const r = { id: Storage.nextId(state), name: "Neues Rezept", description: "", tags: "", items: [], createdAt: Date.now() };
  upsertRecipe(r);
  selectedRecipeId = r.id;
  editingRecipeId = r.id;
  renderRecipes();
});

$("#recipeSearch")?.addEventListener("input", renderRecipes);

export { renderRecipes };
