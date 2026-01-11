const Storage = {
  key: "fw_data_v1",
  load() {
    const raw = localStorage.getItem(this.key);
    const base = { articles: [], recipes: [], shopping: [], inventory: [], history: [], seq: 1 };
    if (!raw) return base;
    try {
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") return base;
      if (!Array.isArray(p.articles)) p.articles = [];
      if (!Array.isArray(p.recipes)) p.recipes = [];
      if (!Array.isArray(p.shopping)) p.shopping = [];
      if (!Array.isArray(p.inventory)) p.inventory = [];
      if (!Array.isArray(p.history)) p.history = [];
      if (!p.seq) p.seq = 1;
      return p;
    } catch {
      return base;
    }
  },
  save(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  },
  nextId(data) {
    const id = data.seq || 1;
    data.seq = id + 1;
    return id;
  }
};

let state = Storage.load();

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const routes = ["recipes", "articles", "shopping", "inventory", "history"];
let currentRoute = "recipes";
let selectedRecipeId = null;
let editingRecipeId = null;

function escapeHtml(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[c]));
}

function msDay(n) {
  return Number(n) * 24 * 60 * 60 * 1000;
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}.${m}.${y}`;
}

function fmtIsoDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getArticleById(id) {
  return state.articles.find(a => a.id === id) || null;
}

function getRecipeById(id) {
  return state.recipes.find(r => r.id === id) || null;
}

function upsertArticle(article) {
  const idx = state.articles.findIndex(a => a.id === article.id);
  if (idx >= 0) state.articles[idx] = article;
  else state.articles.unshift(article);
  Storage.save(state);
}

function upsertRecipe(recipe) {
  const idx = state.recipes.findIndex(r => r.id === recipe.id);
  if (idx >= 0) state.recipes[idx] = recipe;
  else state.recipes.unshift(recipe);
  Storage.save(state);
}

function removeRecipe(id) {
  state.recipes = state.recipes.filter(r => r.id !== id);
  state.shopping = state.shopping.map(line => ({
    ...line,
    sources: (line.sources || []).filter(s => s.recipeId !== id)
  })).filter(line => (line.sources || []).length > 0);
  Storage.save(state);
}

function removeArticle(id) {
  state.articles = state.articles.filter(a => a.id !== id);
  state.recipes = state.recipes.map(r => ({ ...r, items: (r.items || []).filter(it => it.articleId !== id) }));
  state.shopping = state.shopping.filter(s => s.articleId !== id);
  state.inventory = state.inventory.filter(i => i.articleId !== id);
  state.history = state.history.map(h => ({ ...h, items: (h.items || []).filter(x => x.articleId !== id) }))
    .filter(h => (h.items || []).length > 0);
  Storage.save(state);
}

function modalOpen({ title, bodyHtml, footerButtons }) {
  const t = $("#modalTitle");
  const b = $("#modalBody");
  const f = $("#modalFooter");
  if (!t || !b || !f) return;
  t.textContent = title;
  b.innerHTML = bodyHtml || "";
  f.innerHTML = "";
  (footerButtons || []).forEach(btnDef => {
    const btn = document.createElement("button");
    btn.className = btnDef.className || "btn";
    btn.textContent = btnDef.label;
    btn.addEventListener("click", btnDef.onClick);
    f.appendChild(btn);
  });
  $("#modal")?.classList.remove("hidden");
}

function modalClose() {
  $("#modal")?.classList.add("hidden");
  const b = $("#modalBody");
  const f = $("#modalFooter");
  if (b) b.innerHTML = "";
  if (f) f.innerHTML = "";
}

$("#modalClose")?.addEventListener("click", modalClose);
$("#modal")?.addEventListener("click", (e) => {
  if (e.target?.id === "modal") modalClose();
});

function ensureShoppingLine(articleId) {
  let line = state.shopping.find(s => s.articleId === articleId) || null;
  if (!line) {
    line = { id: Storage.nextId(state), articleId, qty: 0, sources: [], selected: false, createdAt: Date.now() };
    state.shopping.unshift(line);
  }
  if (!Array.isArray(line.sources)) line.sources = [];
  if (typeof line.selected !== "boolean") line.selected = false;
  return line;
}

function recomputeLineQty(line) {
  line.qty = (line.sources || []).reduce((acc, s) => acc + Math.max(0, Number(s.qty || 0)), 0);
  if (!line.qty) line.qty = 0;
}

function addShoppingFromRecipe(articleId, recipeId, qty) {
  const q = Math.max(1, Number(qty || 1));
  const line = ensureShoppingLine(articleId);
  const idx = line.sources.findIndex(s => s.type === "recipe" && s.recipeId === recipeId);
  if (idx >= 0) line.sources[idx] = { type: "recipe", recipeId, qty: q };
  else line.sources.push({ type: "recipe", recipeId, qty: q });
  recomputeLineQty(line);
  Storage.save(state);
}

function addShoppingManual(articleId, qty) {
  const q = Math.max(1, Number(qty || 1));
  const line = ensureShoppingLine(articleId);
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

function availableInventoryBase(articleId) {
  return state.inventory
    .filter(i => i.articleId === articleId && !i.consumed)
    .reduce((acc, i) => acc + Math.max(0, Number(i.qty || 0)), 0);
}

function plannedShoppingBase(articleId) {
  const line = state.shopping.find(s => s.articleId === articleId);
  if (!line) return 0;
  return Math.max(0, Number(line.qty || 0));
}

function computeAllocation() {
  const recipes = [...state.recipes].sort((a,b) => (a.name||"").localeCompare(b.name||"", "de"));
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
    const missing = a ? a.missing : Math.max(1, Number(it.qty||1));
    if (missing > 0) missingCount++;
    else {
      const need = a?.need || Math.max(1, Number(it.qty||1));
      const invCover = a?.invCover || 0;
      if (invCover < need) coveredByShop++;
    }
  });

  if (missingCount === 0 && coveredByShop === 0) return { cls: "ok", text: "Alles im Lager" };
  if (missingCount === 0 && coveredByShop > 0) return { cls: "needShop", text: "Durch Einkaufsliste gedeckt" };
  return { cls: "missing", text: `${missingCount} fehlt` };
}

function routeTo(route) {
  currentRoute = routes.includes(route) ? route : "recipes";
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${currentRoute}`)?.classList.remove("hidden");
  $$(".navLink").forEach(a => a.classList.toggle("active", a.dataset.route === currentRoute));

  if (currentRoute === "recipes") renderRecipes();
  if (currentRoute === "articles") renderArticles();
  if (currentRoute === "shopping") renderShopping();
  if (currentRoute === "inventory") renderInventory();
  if (currentRoute === "history") renderHistory();
}

window.addEventListener("hashchange", () => {
  const r = location.hash.replace("#", "") || "recipes";
  routeTo(r);
});

function renderRecipes() {
  const alloc = computeAllocation();

  const q = ($("#recipeSearch")?.value || "").trim().toLowerCase();
  const list = $("#recipeList");
  if (!list) return;
  list.innerHTML = "";

  const recipes = [...state.recipes].filter(r => {
    if (!q) return true;
    const hay = `${r.name || ""} ${(r.tags || "")} ${(r.description || "")}`.toLowerCase();
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
    const unit = a?.unit || "Stk";
    const checked = it.checked !== false;

    const info = alloc?.[recipe.id]?.[it.articleId] || {
      need: Math.max(1, Number(it.qty||1)), invCover: 0, shopCover: 0, missing: Math.max(1, Number(it.qty||1))
    };

    let hlClass = "hlMissing";
    if (info.missing <= 0 && info.invCover >= info.need) hlClass = "hlInv";
    else if (info.missing <= 0 && info.shopCover > 0) hlClass = "hlShop";

    const row = document.createElement("div");
    row.className = `row ${hlClass}`;
    row.innerHTML = `
      <input class="checkbox" type="checkbox" ${checked ? "checked" : ""} data-idx="${idx}" />
      <div>
        <div class="name ${checked ? "" : "strike"}">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
        <div class="muted">
          Bedarf: ${escapeHtml(String(info.need))} ${escapeHtml(unit)}
          · Lager: ${escapeHtml(String(info.invCover))}
          · Einkaufsliste: ${escapeHtml(String(info.shopCover))}
          · Fehlt: ${escapeHtml(String(info.missing))}
        </div>
      </div>
      <div class="qty">
        <span class="${checked ? "" : "strike"}">${escapeHtml(String(it.qty || 1))}</span>
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

    chosen.forEach(it => addShoppingFromRecipe(it.articleId, r.id, Number(it.qty || 1)));

    modalOpen({
      title: "Auf Einkaufsliste",
      bodyHtml: `<div class="empty">${chosen.length} Artikel wurden auf die Einkaufsliste gesetzt (stückgenau wie im Rezept).</div>`,
      footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
    });
  };

  $("#btnResetChecks").onclick = () => {
    const r = getRecipeById(recipe.id);
    (r.items || []).forEach(it => it.checked = true);
    upsertRecipe(r);
    renderRecipes();
  };
}

function renderRecipeEditor(recipe) {
  $("#editRecipeName").value = recipe.name || "";
  $("#editRecipeTags").value = (recipe.tags || "").toString();
  $("#editRecipeDescription").value = recipe.description || "";
  $("#editItemQty").value = 1;
  $("#inlineArticleName").value = "";

  const sel = $("#editItemArticleSelect");
  sel.innerHTML = "";
  const sorted = [...state.articles].sort((a,b) => (a.name||"").localeCompare(b.name||"", "de"));

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
      opt.textContent = `${a.name} (${a.unit || "Stk"})`;
      sel.appendChild(opt);
    });
  }

  const wrap = $("#editRecipeItems");
  wrap.innerHTML = "";
  (recipe.items || []).forEach((it, idx) => {
    const a = getArticleById(it.articleId);
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div></div>
      <div>
        <div class="name">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
        <div class="muted">${escapeHtml(a ? (a.unit || "Stk") : "")}</div>
      </div>
      <div class="qty">
        <input type="number" min="1" step="1" value="${escapeHtml(String(it.qty || 1))}" data-idx="${idx}" />
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
    const r = getRecipeById(recipe.id);
    r.items = r.items || [];
    r.items.push({ articleId, qty, checked: true });
    upsertRecipe(r);
    renderRecipeEditor(r);
  };

  $("#btnInlineAddArticle").onclick = () => {
    const name = ($("#inlineArticleName").value || "").trim();
    const unit = $("#inlineArticleUnit").value || "Stk";
    if (!name) return;

    const existing = state.articles.find(a => (a.name || "").trim().toLowerCase() === name.toLowerCase());
    if (existing) return;

    const a = { id: Storage.nextId(state), name, unit, useDays: 0, createdAt: Date.now() };
    upsertArticle(a);
    $("#inlineArticleName").value = "";
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

$("#btnNewRecipe")?.addEventListener("click", () => {
  const r = { id: Storage.nextId(state), name: "Neues Rezept", description: "", tags: "", items: [], createdAt: Date.now() };
  upsertRecipe(r);
  selectedRecipeId = r.id;
  editingRecipeId = r.id;
  renderRecipes();
});

$("#recipeSearch")?.addEventListener("input", renderRecipes);

function openArticleEditor(articleId) {
  const a = articleId ? getArticleById(articleId) : { id: null, name: "", unit: "Stk", useDays: 0 };

  modalOpen({
    title: articleId ? "Artikel bearbeiten" : "Neuer Artikel",
    bodyHtml: `
      <div class="field">
        <label>Name</label>
        <input id="mArticleName" type="text" value="${escapeHtml(a.name || "")}" />
      </div>
      <div class="field">
        <label>Einheit (für Rezepte & Einkaufsliste)</label>
        <input id="mArticleUnit" type="text" value="${escapeHtml(a.unit || "Stk")}" />
      </div>
      <div class="field">
        <label>Typische Verbrauchszeit (Tage)</label>
        <input id="mArticleUseDays" type="number" min="0" step="1" value="${escapeHtml(String(Math.max(0, Number(a.useDays || 0))))}" />
        <div class="hint">0 = nicht berechnen.</div>
      </div>
    `,
    footerButtons: [
      { label: "Abbrechen", className: "btn", onClick: modalClose },
      { label: "Speichern", className: "btn primary", onClick: () => {
        const name = ($("#mArticleName").value || "").trim();
        const unit = ($("#mArticleUnit").value || "Stk").trim() || "Stk";
        const useDays = Math.max(0, Number($("#mArticleUseDays").value || 0));
        if (!name) return;

        const clash = state.articles.find(x => x.id !== a.id && (x.name||"").trim().toLowerCase() === name.toLowerCase());
        if (clash) return;

        if (articleId) upsertArticle({ ...getArticleById(articleId), name, unit, useDays });
        else upsertArticle({ id: Storage.nextId(state), name, unit, useDays, createdAt: Date.now() });

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
  const sort = $("#articleSort")?.value || "name-asc";

  let items = [...state.articles].filter(a => {
    if (!q) return true;
    return `${a.name || ""} ${a.unit || ""}`.toLowerCase().includes(q);
  });

  if (sort === "name-asc") items.sort((a,b) => (a.name||"").localeCompare(b.name||"", "de"));
  if (sort === "name-desc") items.sort((a,b) => (b.name||"").localeCompare(a.name||"", "de"));
  if (sort === "newest") items.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  const table = $("#articleTable");
  if (!table) return;

  table.innerHTML = `
    <div class="thead">
      <div>Name</div>
      <div>Einheit</div>
      <div style="text-align:right">Aktionen</div>
    </div>
  `;

  if (!items.length) {
    table.innerHTML += `<div class="trow"><div class="tname">Keine Artikel</div><div></div><div class="tactions"></div></div>`;
    return;
  }

  items.forEach(a => {
    const row = document.createElement("div");
    row.className = "trow";
    row.innerHTML = `
      <div class="tname">
        ${escapeHtml(a.name || "")}
        <div class="muted">Verbrauchszeit: ${escapeHtml(String(Math.max(0, Number(a.useDays||0))))} Tage</div>
      </div>
      <div class="tunit">${escapeHtml(a.unit || "Stk")}</div>
      <div class="tactions">
        <button class="btn" data-action="edit" data-id="${a.id}">Bearbeiten</button>
        <button class="btn danger" data-action="delete" data-id="${a.id}">Löschen</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]')?.addEventListener("click", () => openArticleEditor(a.id));
    row.querySelector('[data-action="delete"]')?.addEventListener("click", () => confirmDeleteArticle(a.id));
    table.appendChild(row);
  });
}

$("#btnNewArticle")?.addEventListener("click", () => openArticleEditor(null));
$("#articleSearch")?.addEventListener("input", renderArticles);
$("#articleSort")?.addEventListener("change", renderArticles);

$("#btnSeedDemo")?.addEventListener("click", () => {
  if (state.articles.length || state.recipes.length || state.shopping.length || state.inventory.length || state.history.length) return;

  const garlic = { id: Storage.nextId(state), name: "Knoblauch", unit: "Zehe", useDays: 14, createdAt: Date.now() };
  const tomato = { id: Storage.nextId(state), name: "Tomaten (Dose)", unit: "Dose", useDays: 365, createdAt: Date.now() };
  upsertArticle(garlic);
  upsertArticle(tomato);

  const r1 = {
    id: Storage.nextId(state),
    name: "Tomatensauce",
    tags: "",
    description: "1) Knoblauch\n2) Tomaten\n3) Köcheln",
    items: [{ articleId: garlic.id, qty: 1, checked: true }, { articleId: tomato.id, qty: 1, checked: true }],
    createdAt: Date.now()
  };
  upsertRecipe(r1);

  selectedRecipeId = r1.id;
  renderRecipes();
});

function renderShoppingAddForm() {
  const sel = $("#shopAddArticleSelect");
  if (!sel) return;
  sel.innerHTML = "";

  const sorted = [...state.articles].sort((a,b) => (a.name||"").localeCompare(b.name||"", "de"));
  if (!sorted.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Keine Artikel – unten erstellen";
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }

  sel.disabled = false;
  sorted.forEach(a => {
    const opt = document.createElement("option");
    opt.value = String(a.id);
    opt.textContent = `${a.name} (${a.unit || "Stk"})`;
    sel.appendChild(opt);
  });
}

function renderShopping() {
  renderShoppingAddForm();

  $("#btnAddManualToShopping").onclick = () => {
    const articleId = Number($("#shopAddArticleSelect")?.value || 0);
    const qty = Math.max(1, Number($("#shopAddQty")?.value || 1));
    if (!articleId) return;
    addShoppingManual(articleId, qty);
    renderShopping();
    renderRecipes();
  };

  $("#btnShopCreateArticle").onclick = () => {
    const name = ($("#shopNewArticleName")?.value || "").trim();
    const unit = ($("#shopNewArticleUnit")?.value || "Stk").trim() || "Stk";
    const useDays = Math.max(0, Number($("#shopNewArticleUseDays")?.value || 0));
    if (!name) return;

    const existing = state.articles.find(a => (a.name||"").trim().toLowerCase() === name.toLowerCase());
    if (existing) return;

    upsertArticle({ id: Storage.nextId(state), name, unit, useDays, createdAt: Date.now() });
    $("#shopNewArticleName").value = "";
    renderShopping();
  };

  const list = $("#shoppingList");
  const empty = $("#shoppingEmpty");
  if (!list || !empty) return;

  list.innerHTML = "";
  const lines = [...state.shopping].filter(l => Math.max(0, Number(l.qty||0)) > 0);

  if (!lines.length) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
  }

  lines.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  lines.forEach(line => {
    const a = getArticleById(line.articleId);
    const unit = a?.unit || "Stk";

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

  $("#btnSelectNoneShopping").onclick = () => {
    state.shopping.forEach(l => l.selected = false);
    Storage.save(state);
    renderShopping();
  };

  $("#btnClearShopping").onclick = () => {
    modalOpen({
      title: "Einkaufsliste leeren",
      bodyHtml: `<div class="empty">Willst du wirklich die komplette Einkaufsliste leeren?</div>`,
      footerButtons: [
        { label: "Abbrechen", className: "btn", onClick: modalClose },
        { label: "Leeren", className: "btn danger", onClick: () => {
          modalClose();
          state.shopping = [];
          Storage.save(state);
          renderShopping();
          renderRecipes();
        }}
      ]
    });
  };

  $("#btnConfirmPurchase").onclick = () => {
    const selected = state.shopping.filter(l => l.selected && Math.max(0, Number(l.qty||0)) > 0);
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
          const unit = a?.unit || "Stk";
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
            const unit = a?.unit || "Stk";

            if (bought > 0) {
              const useDays = Math.max(0, Number(a?.useDays || 0));
              const useByAt = useDays ? (purchasedAt + msDay(useDays)) : null;

              state.inventory.unshift({
                id: Storage.nextId(state),
                articleId: line.articleId,
                qty: bought,
                purchasedAt,
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

          state.shopping = state.shopping.filter(l => Math.max(0, Number(l.qty||0)) > 0);

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

function renderInventory() {
  const list = $("#inventoryList");
  const empty = $("#inventoryEmpty");
  if (!list || !empty) return;
  list.innerHTML = "";

  const items = [...state.inventory];
  if (!items.length) empty.classList.remove("hidden");
  else empty.classList.add("hidden");

  const now = Date.now();

  items.sort((a,b) => {
    const ad = a.consumed ? 1 : 0;
    const bd = b.consumed ? 1 : 0;
    if (ad !== bd) return ad - bd;
    const aBy = a.useByAt || Number.MAX_SAFE_INTEGER;
    const bBy = b.useByAt || Number.MAX_SAFE_INTEGER;
    if (aBy !== bBy) return aBy - bBy;
    return (b.purchasedAt||0) - (a.purchasedAt||0);
  });

  items.forEach(inv => {
    const a = getArticleById(inv.articleId);
    const unit = a?.unit || "Stk";
    const expired = inv.useByAt && inv.useByAt < now;

    const row = document.createElement("div");
    row.className = "irow";
    row.innerHTML = `
      <div>
        <div class="iname ${inv.consumed ? "strike" : ""}">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
        <div class="imeta">
          Bestand: ${escapeHtml(String(Math.max(0, Number(inv.qty||0))))} ${escapeHtml(unit)}
          · Kauf: ${escapeHtml(fmtDate(inv.purchasedAt))}
          · Brauchen bis: <span class="${expired ? "expired" : ""}">${escapeHtml(inv.useByAt ? fmtDate(inv.useByAt) : "—")}</span>
        </div>
      </div>
      <div class="istatus ${expired ? "expired" : ""}">
        ${inv.consumed ? "Verbraucht" : (expired ? "Abgelaufen" : "Aktiv")}
      </div>
      <div class="iqty">
        <input type="number" min="0" step="1" value="${escapeHtml(String(Math.max(0, Number(inv.qty || 0))))}" />
      </div>
      <div class="iactions">
        <button class="btn" data-action="consume">${inv.consumed ? "Reaktivieren" : "Verbraucht"}</button>
        <button class="btn danger" data-action="delete">Löschen</button>
      </div>
      <div class="hidden"></div>
    `;

    row.querySelector('input[type="number"]')?.addEventListener("change", (e) => {
      inv.qty = Math.max(0, Number(e.target.value || 0));
      Storage.save(state);
      renderInventory();
      renderRecipes();
    });

    row.querySelector('[data-action="consume"]')?.addEventListener("click", () => {
      inv.consumed = !inv.consumed;
      inv.consumedAt = inv.consumed ? Date.now() : null;
      Storage.save(state);
      renderInventory();
      renderRecipes();
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

function renderHistory() {
  const list = $("#historyList");
  const empty = $("#historyEmpty");
  if (!list || !empty) return;
  list.innerHTML = "";

  if (!state.history.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const groups = new Map();
  state.history.forEach(h => {
    const k = fmtIsoDate(h.purchasedAt);
    const arr = groups.get(k) || [];
    arr.push(h);
    groups.set(k, arr);
  });

  [...groups.entries()].sort((a,b) => b[0].localeCompare(a[0])).forEach(([dateKey, entries]) => {
    const header = document.createElement("div");
    header.className = "block";
    header.innerHTML = `<div class="blockTitle">${escapeHtml(fmtDate(entries[0].purchasedAt))}</div>`;
    list.appendChild(header);

    entries.forEach(h => {
      (h.items || []).forEach(it => {
        const a = getArticleById(it.articleId);
        const unit = it.unit || a?.unit || "Stk";

        const sources = (it.sources || [])
          .filter(s => s.type === "recipe" && s.recipeId)
          .map(s => {
            const r = getRecipeById(s.recipeId);
            return r ? `${r.name}: ${s.qty} ${unit}` : null;
          })
          .filter(Boolean);

        const manual = (it.sources || []).find(s => s.type === "manual");
        if (manual) sources.push(`Manuell: ${manual.qty} ${unit}`);

        const srcTxt = sources.length ? sources.slice(0, 3).join(" · ") + (sources.length > 3 ? " · …" : "") : "—";

        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <div></div>
          <div>
            <div class="name">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
            <div class="muted">
              Benötigt: ${escapeHtml(String(it.neededQty))} ${escapeHtml(unit)}
              · Gekauft: ${escapeHtml(String(it.boughtQty))} ${escapeHtml(unit)}
              · ${escapeHtml(srcTxt)}
            </div>
          </div>
          <div class="qty"></div>
          <div class="actions"></div>
        `;
        list.appendChild(row);
      });
    });
  });

  $("#btnClearHistory").onclick = () => {
    modalOpen({
      title: "Historie löschen",
      bodyHtml: `<div class="empty">Willst du wirklich die komplette Historie löschen?</div>`,
      footerButtons: [
        { label: "Abbrechen", className: "btn", onClick: modalClose },
        { label: "Löschen", className: "btn danger", onClick: () => {
          modalClose();
          state.history = [];
          Storage.save(state);
          renderHistory();
        }}
      ]
    });
  };
}

function init() {
  const startRoute = location.hash.replace("#","") || "recipes";
  routeTo(startRoute);

  if (!state.articles.length) {
    upsertArticle({ id: Storage.nextId(state), name: "Knoblauch", unit: "Zehe", useDays: 14, createdAt: Date.now() });
  }

  $("#btnNewArticle")?.addEventListener("click", () => openArticleEditor(null));

  const r = location.hash.replace("#","") || "recipes";
  routeTo(r);
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
      // Fallback: sollte praktisch nicht passieren
      missCount++;
    }
  });

  return { total, invCount, shopCount, missCount };
}


init();
