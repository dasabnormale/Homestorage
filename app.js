const Storage = {
  key: "fw_data_v1",
  load() {
    const raw = localStorage.getItem(this.key);
    const base = { articles: [], recipes: [], shopping: [], inventory: [], seq: 1 };
    if (!raw) return base;
    try {
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") return base;
      if (!Array.isArray(p.articles)) p.articles = [];
      if (!Array.isArray(p.recipes)) p.recipes = [];
      if (!Array.isArray(p.shopping)) p.shopping = [];
      if (!Array.isArray(p.inventory)) p.inventory = [];
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

const routes = ["recipes", "articles", "shopping", "inventory"];
let currentRoute = "recipes";
let selectedRecipeId = null;
let editingRecipeId = null;
let showConsumedInventory = false;

function routeTo(route) {
  currentRoute = routes.includes(route) ? route : "recipes";
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${currentRoute}`).classList.remove("hidden");
  $$(".navLink").forEach(a => a.classList.toggle("active", a.dataset.route === currentRoute));

  if (currentRoute === "recipes") renderRecipes();
  if (currentRoute === "articles") renderArticles();
  if (currentRoute === "shopping") renderShopping();
  if (currentRoute === "inventory") renderInventory();
}

window.addEventListener("hashchange", () => {
  const r = location.hash.replace("#", "") || "recipes";
  routeTo(r);
});

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

function humanizeDays(days) {
  if (!days || Number(days) <= 0) return "—";
  const d = Number(days);
  if (d % 365 === 0) return `${d / 365} Jahr(e)`;
  if (d % 30 === 0) return `${d / 30} Monat(e)`;
  if (d % 7 === 0) return `${d / 7} Woche(n)`;
  return `${d} Tag(e)`;
}

function daysToParts(days) {
  const d = Number(days || 0);
  if (!d) return { value: 7, unit: "weeks" };
  if (d % 365 === 0) return { value: d / 365, unit: "years" };
  if (d % 30 === 0) return { value: d / 30, unit: "months" };
  if (d % 7 === 0) return { value: d / 7, unit: "weeks" };
  return { value: d, unit: "days" };
}

function partsToDays(value, unit) {
  const v = Math.max(1, Number(value || 1));
  if (unit === "years") return v * 365;
  if (unit === "months") return v * 30;
  if (unit === "weeks") return v * 7;
  return v;
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
  Storage.save(state);
}

function removeArticle(id) {
  state.articles = state.articles.filter(a => a.id !== id);
  state.recipes = state.recipes.map(r => ({
    ...r,
    items: (r.items || []).filter(it => it.articleId !== id)
  }));
  state.shopping = state.shopping.filter(s => s.articleId !== id);
  state.inventory = state.inventory.filter(i => i.articleId !== id);
  Storage.save(state);
}

function addToShopping(articleId, qty) {
  const q = Math.max(1, Number(qty || 1));
  const entry = state.shopping.find(s => s.articleId === articleId && !s.done);
  if (entry) entry.qty += q;
  else state.shopping.unshift({
    id: Storage.nextId(state),
    articleId,
    qty: q,
    done: false,
    createdAt: Date.now(),
    purchasedAt: null,
    inventoryId: null
  });
  Storage.save(state);
}

function addToInventoryFromShopping(shoppingItem) {
  const a = getArticleById(shoppingItem.articleId);
  const purchasedAt = shoppingItem.purchasedAt || Date.now();
  const useDays = Number(a?.useDays || 0);
  const useByAt = useDays ? (purchasedAt + msDay(useDays)) : null;

  const inv = {
    id: Storage.nextId(state),
    articleId: shoppingItem.articleId,
    qty: Math.max(1, Number(shoppingItem.qty || 1)),
    purchasedAt,
    useByAt,
    consumed: false,
    consumedAt: null
  };

  state.inventory.unshift(inv);
  shoppingItem.inventoryId = inv.id;
  Storage.save(state);
}

function removeInventoryEntry(id) {
  state.inventory = state.inventory.filter(i => i.id !== id);
  Storage.save(state);
}

function modalOpen({ title, bodyHtml, footerButtons }) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = bodyHtml || "";
  const footer = $("#modalFooter");
  footer.innerHTML = "";
  (footerButtons || []).forEach(b => {
    const btn = document.createElement("button");
    btn.className = b.className || "btn";
    btn.textContent = b.label;
    btn.addEventListener("click", b.onClick);
    footer.appendChild(btn);
  });
  $("#modal").classList.remove("hidden");
}

function modalClose() {
  $("#modal").classList.add("hidden");
  $("#modalBody").innerHTML = "";
  $("#modalFooter").innerHTML = "";
}

$("#modalClose").addEventListener("click", modalClose);
$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") modalClose();
});

function renderRecipes() {
  const q = ($("#recipeSearch").value || "").trim().toLowerCase();
  const list = $("#recipeList");
  list.innerHTML = "";

  const recipes = [...state.recipes].filter(r => {
    if (!q) return true;
    const hay = `${r.name || ""} ${(r.tags || "").toString()} ${(r.description || "").toString()}`.toLowerCase();
    return hay.includes(q);
  });

  recipes.forEach(r => {
    const card = document.createElement("div");
    card.className = "itemCard" + (r.id === selectedRecipeId ? " active" : "");
    const itemCount = (r.items || []).length;
    card.innerHTML = `
      <div class="itemTitle">${escapeHtml(r.name || "Unbenannt")}</div>
      <div class="itemSub">${itemCount} Artikel · ${escapeHtml((r.tags || "").toString())}</div>
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

  renderRecipeRightPane();
}

function renderRecipeRightPane() {
  const recipe = selectedRecipeId ? getRecipeById(selectedRecipeId) : null;
  $("#recipeDetail").classList.add("hidden");
  $("#recipeEditor").classList.add("hidden");
  $("#recipeDetailEmpty").classList.add("hidden");
  $("#recipeDetailActions").innerHTML = "";

  if (!recipe) {
    $("#recipeDetailEmpty").classList.remove("hidden");
    $("#recipeDetailTitle").textContent = "Rezept";
    return;
  }

  if (editingRecipeId === recipe.id) {
    $("#recipeDetailTitle").textContent = "Rezept bearbeiten";
    $("#recipeEditor").classList.remove("hidden");
    renderRecipeEditor(recipe);
    return;
  }

  $("#recipeDetailTitle").textContent = recipe.name || "Rezept";
  $("#recipeDetail").classList.remove("hidden");

  const actions = $("#recipeDetailActions");
  const btnEdit = document.createElement("button");
  btnEdit.className = "btn";
  btnEdit.textContent = "Bearbeiten";
  btnEdit.addEventListener("click", () => {
    editingRecipeId = recipe.id;
    renderRecipeRightPane();
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

  actions.appendChild(btnEdit);
  actions.appendChild(btnDel);

  const items = recipe.items || [];
  $("#recipeItemCount").textContent = `${items.length} Artikel`;

  $("#recipeDescription").textContent = recipe.description || "";

  const itemsWrap = $("#recipeItems");
  itemsWrap.innerHTML = "";
  items.forEach((it, idx) => {
    const a = getArticleById(it.articleId);
    const checked = it.checked !== false;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <input class="checkbox" type="checkbox" ${checked ? "checked" : ""} data-idx="${idx}" />
      <div>
        <div class="name ${checked ? "" : "strike"}">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
        <div class="muted">${escapeHtml(a ? (a.unit || "Stk") : "")}</div>
      </div>
      <div class="qty">
        <span class="${checked ? "" : "strike"}">${escapeHtml(String(it.qty || 1))}</span>
      </div>
      <div class="actions">
        <button class="btn" data-action="remove" data-idx="${idx}">Entfernen</button>
      </div>
    `;

    row.querySelector("input[type=checkbox]").addEventListener("change", (e) => {
      const i = Number(e.target.dataset.idx);
      const r = getRecipeById(recipe.id);
      r.items[i].checked = e.target.checked;
      upsertRecipe(r);
      renderRecipeRightPane();
    });

    row.querySelector("[data-action=remove]").addEventListener("click", (e) => {
      const i = Number(e.target.dataset.idx);
      const r = getRecipeById(recipe.id);
      r.items.splice(i, 1);
      upsertRecipe(r);
      renderRecipeRightPane();
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
    chosen.forEach(it => addToShopping(it.articleId, Number(it.qty || 1)));
    modalOpen({
      title: "Auf Einkaufsliste",
      bodyHtml: `<div class="empty">${chosen.length} Artikel wurden auf die Einkaufsliste übernommen.</div>`,
      footerButtons: [{ label: "OK", className: "btn primary", onClick: () => { modalClose(); location.hash = "#shopping"; routeTo("shopping"); } }]
    });
  };

  $("#btnResetChecks").onclick = () => {
    const r = getRecipeById(recipe.id);
    (r.items || []).forEach(it => it.checked = true);
    upsertRecipe(r);
    renderRecipeRightPane();
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

    row.querySelector("input[type=number]").addEventListener("change", (e) => {
      const i = Number(e.target.dataset.idx);
      const r = getRecipeById(recipe.id);
      r.items[i].qty = Math.max(1, Number(e.target.value || 1));
      upsertRecipe(r);
      renderRecipeEditor(r);
    });

    row.querySelector("[data-action=remove]").addEventListener("click", (e) => {
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
    if (existing) {
      modalOpen({
        title: "Artikel existiert bereits",
        bodyHtml: `<div class="empty"><b>${escapeHtml(existing.name)}</b> existiert bereits.</div>`,
        footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
      });
      return;
    }

    const a = { id: Storage.nextId(state), name, unit, useDays: 7, createdAt: Date.now() };
    upsertArticle(a);
    $("#inlineArticleName").value = "";

    const r = getRecipeById(recipe.id);
    renderRecipeEditor(r);
  };

  $("#btnSaveRecipe").onclick = () => {
    const name = ($("#editRecipeName").value || "").trim();
    if (!name) {
      modalOpen({
        title: "Fehlender Name",
        bodyHtml: `<div class="empty">Bitte gib dem Rezept einen Namen.</div>`,
        footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
      });
      return;
    }
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

$("#btnNewRecipe").addEventListener("click", () => {
  const r = { id: Storage.nextId(state), name: "Neues Rezept", description: "", tags: "", items: [], createdAt: Date.now() };
  upsertRecipe(r);
  selectedRecipeId = r.id;
  editingRecipeId = r.id;
  renderRecipes();
});

$("#recipeSearch").addEventListener("input", renderRecipes);

function renderArticles() {
  const q = ($("#articleSearch").value || "").trim().toLowerCase();
  const sort = $("#articleSort").value;

  let items = [...state.articles].filter(a => {
    if (!q) return true;
    return `${a.name || ""} ${a.unit || ""}`.toLowerCase().includes(q);
  });

  if (sort === "name-asc") items.sort((a,b) => (a.name||"").localeCompare(b.name||"", "de"));
  if (sort === "name-desc") items.sort((a,b) => (b.name||"").localeCompare(a.name||"", "de"));
  if (sort === "newest") items.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  const table = $("#articleTable");
  table.innerHTML = `
    <div class="thead">
      <div>Name</div>
      <div>Einheit</div>
      <div style="text-align:right">Aktionen</div>
    </div>
  `;

  if (!items.length) {
    table.innerHTML += `<div class="trow"><div class="tname">Keine Artikel</div><div class="tunit"></div><div class="tactions"></div></div>`;
    return;
  }

  items.forEach(a => {
    const row = document.createElement("div");
    row.className = "trow";
    row.innerHTML = `
      <div class="tname">
        ${escapeHtml(a.name || "")}
        <div class="muted">Verbrauchszeit: ${escapeHtml(humanizeDays(a.useDays))}</div>
      </div>
      <div class="tunit">${escapeHtml(a.unit || "Stk")}</div>
      <div class="tactions">
        <button class="btn" data-action="edit" data-id="${a.id}">Bearbeiten</button>
        <button class="btn danger" data-action="delete" data-id="${a.id}">Löschen</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]').addEventListener("click", () => openArticleEditor(a.id));
    row.querySelector('[data-action="delete"]').addEventListener("click", () => confirmDeleteArticle(a.id));
    table.appendChild(row);
  });
}

function openArticleEditor(articleId) {
  const a = articleId ? getArticleById(articleId) : { id: null, name: "", unit: "Stk", useDays: 7 };
  const parts = daysToParts(a.useDays);

  modalOpen({
    title: articleId ? "Artikel bearbeiten" : "Neuer Artikel",
    bodyHtml: `
      <div class="field">
        <label>Name</label>
        <input id="mArticleName" type="text" value="${escapeHtml(a.name || "")}" placeholder="z.B. Bananen" />
      </div>
      <div class="grid2">
        <div class="field">
          <label>Einheit</label>
          <select id="mArticleUnit">
            ${["Stk","g","ml","Pack","Dose","Bund"].map(u => `<option value="${u}" ${u===(a.unit||"Stk")?"selected":""}>${u}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Typische Verbrauchszeit</label>
          <div class="grid2" style="gap:10px">
            <input id="mUseValue" type="number" min="1" step="1" value="${escapeHtml(String(parts.value || 7))}" />
            <select id="mUseUnit">
              <option value="days" ${parts.unit==="days"?"selected":""}>Tage</option>
              <option value="weeks" ${parts.unit==="weeks"?"selected":""}>Wochen</option>
              <option value="months" ${parts.unit==="months"?"selected":""}>Monate</option>
              <option value="years" ${parts.unit==="years"?"selected":""}>Jahre</option>
            </select>
          </div>
          <div class="hint">Wird im Lager genutzt, um „spätestens brauchen bis“ zu berechnen.</div>
        </div>
      </div>
    `,
    footerButtons: [
      { label: "Abbrechen", className: "btn", onClick: modalClose },
      { label: "Speichern", className: "btn primary", onClick: () => {
        const name = ($("#mArticleName").value || "").trim();
        const unit = $("#mArticleUnit").value || "Stk";
        const useValue = $("#mUseValue").value;
        const useUnit = $("#mUseUnit").value;
        const useDays = partsToDays(useValue, useUnit);

        if (!name) return;

        const clash = state.articles.find(x => x.id !== a.id && (x.name||"").trim().toLowerCase() === name.toLowerCase());
        if (clash) {
          modalOpen({
            title: "Name bereits vorhanden",
            bodyHtml: `<div class="empty"><b>${escapeHtml(name)}</b> existiert bereits.</div>`,
            footerButtons: [{ label: "OK", className: "btn primary", onClick: modalClose }]
          });
          return;
        }

        if (articleId) {
          const updated = { ...getArticleById(articleId), name, unit, useDays };
          upsertArticle(updated);
        } else {
          const created = { id: Storage.nextId(state), name, unit, useDays, createdAt: Date.now() };
          upsertArticle(created);
        }
        modalClose();
        renderArticles();
        if (currentRoute === "recipes") renderRecipes();
        if (currentRoute === "inventory") renderInventory();
      }}
    ]
  });

  setTimeout(() => $("#mArticleName")?.focus(), 0);
}

function confirmDeleteArticle(articleId) {
  const a = getArticleById(articleId);
  if (!a) return;

  const usedInRecipes = state.recipes.some(r => (r.items||[]).some(it => it.articleId === articleId));
  const usedInShopping = state.shopping.some(s => s.articleId === articleId);
  const usedInInventory = state.inventory.some(i => i.articleId === articleId);

  modalOpen({
    title: "Artikel löschen",
    bodyHtml: `
      <div class="empty">
        Willst du <b>${escapeHtml(a.name)}</b> wirklich löschen?<br><br>
        ${usedInRecipes ? "Hinweis: Artikel wird auch aus Rezepten entfernt.<br>" : ""}
        ${usedInShopping ? "Hinweis: Artikel wird auch aus der Einkaufsliste entfernt.<br>" : ""}
        ${usedInInventory ? "Hinweis: Artikel wird auch aus dem Lager entfernt." : ""}
      </div>
    `,
    footerButtons: [
      { label: "Abbrechen", className: "btn", onClick: modalClose },
      { label: "Löschen", className: "btn danger", onClick: () => {
        modalClose();
        removeArticle(articleId);
        renderArticles();
        if (currentRoute === "recipes") renderRecipes();
        if (currentRoute === "shopping") renderShopping();
        if (currentRoute === "inventory") renderInventory();
      }}
    ]
  });
}

$("#btnNewArticle").addEventListener("click", () => openArticleEditor(null));
$("#articleSearch").addEventListener("input", renderArticles);
$("#articleSort").addEventListener("change", renderArticles);

$("#btnSeedDemo").addEventListener("click", () => {
  if (state.articles.length || state.recipes.length || state.shopping.length || state.inventory.length) {
    modalOpen({
      title: "Demo-Daten",
      bodyHtml: `<div class="empty">Du hast bereits Daten. Demo-Daten hinzufügen?</div>`,
      footerButtons: [
        { label: "Abbrechen", className: "btn", onClick: modalClose },
        { label: "Hinzufügen", className: "btn primary", onClick: () => { modalClose(); seedDemo(); } }
      ]
    });
  } else {
    seedDemo();
  }
});

function seedDemo() {
  const a1 = { id: Storage.nextId(state), name: "Bananen", unit: "Stk", useDays: 7, createdAt: Date.now() };
  const a2 = { id: Storage.nextId(state), name: "Zahnpasta", unit: "Stk", useDays: 180, createdAt: Date.now() };
  const a3 = { id: Storage.nextId(state), name: "Spaghetti", unit: "Pack", useDays: 365, createdAt: Date.now() };
  const a4 = { id: Storage.nextId(state), name: "Tomaten (Dose)", unit: "Dose", useDays: 365, createdAt: Date.now() };
  [a1,a2,a3,a4].forEach(upsertArticle);

  const r = {
    id: Storage.nextId(state),
    name: "Schnelle Tomatenpasta",
    tags: "pasta,schnell",
    description: "1) Zwiebeln anbraten\n2) Tomaten dazu\n3) Spaghetti kochen\n4) Mischen, würzen",
    items: [
      { articleId: a3.id, qty: 1, checked: true },
      { articleId: a4.id, qty: 1, checked: true }
    ],
    createdAt: Date.now()
  };
  upsertRecipe(r);

  renderArticles();
  selectedRecipeId = r.id;
  editingRecipeId = null;
  location.hash = "#recipes";
  routeTo("recipes");
}

function renderShopping() {
  const list = $("#shoppingList");
  const empty = $("#shoppingEmpty");
  list.innerHTML = "";

  if (!state.shopping.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const items = [...state.shopping].sort((a,b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (b.createdAt||0) - (a.createdAt||0);
  });

  items.forEach(s => {
    const a = getArticleById(s.articleId);
    const row = document.createElement("div");
    row.className = "srow";
    const purchasedTxt = s.purchasedAt ? `Eingekauft: ${fmtDate(s.purchasedAt)}` : "Noch nicht eingekauft";
    const useByTxt = (() => {
      const inv = s.inventoryId ? state.inventory.find(i => i.id === s.inventoryId) : null;
      if (!inv || !inv.useByAt) return "Brauchen bis: —";
      return `Brauchen bis: ${fmtDate(inv.useByAt)}`;
    })();

    row.innerHTML = `
      <input class="checkbox" type="checkbox" ${s.done ? "checked" : ""} />
      <div>
        <div class="sname ${s.done ? "strike" : ""}">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
        <div class="smeta">${escapeHtml(a ? (a.unit || "Stk") : "")} · ${escapeHtml(purchasedTxt)} · ${escapeHtml(useByTxt)}</div>
      </div>
      <div class="sqty">
        <input type="number" min="1" step="1" value="${escapeHtml(String(Math.max(1, s.qty || 1)))}" />
      </div>
      <div class="sactions">
        <button class="btn danger">Entfernen</button>
      </div>
    `;

    const cb = row.querySelector("input[type=checkbox]");
    const qtyInput = row.querySelector("input[type=number]");
    const btnRemove = row.querySelector("button");

    cb.addEventListener("change", () => {
      const nowDone = cb.checked;

      if (nowDone) {
        if (!s.purchasedAt) s.purchasedAt = Date.now();
        s.done = true;
        if (!s.inventoryId) addToInventoryFromShopping(s);
      } else {
        s.done = false;
        s.purchasedAt = null;
        if (s.inventoryId) {
          removeInventoryEntry(s.inventoryId);
          s.inventoryId = null;
        }
      }

      Storage.save(state);
      renderShopping();
    });

    qtyInput.addEventListener("change", () => {
      s.qty = Math.max(1, Number(qtyInput.value || 1));
      if (s.inventoryId) {
        const inv = state.inventory.find(i => i.id === s.inventoryId);
        if (inv) inv.qty = s.qty;
      }
      Storage.save(state);
      renderShopping();
    });

    btnRemove.addEventListener("click", () => {
      if (s.inventoryId) removeInventoryEntry(s.inventoryId);
      state.shopping = state.shopping.filter(x => x.id !== s.id);
      Storage.save(state);
      renderShopping();
    });

    list.appendChild(row);
  });

  $("#btnClearDone").onclick = () => {
    const toRemove = state.shopping.filter(s => s.done);
    toRemove.forEach(s => { if (s.inventoryId) removeInventoryEntry(s.inventoryId); });
    state.shopping = state.shopping.filter(s => !s.done);
    Storage.save(state);
    renderShopping();
  };

  $("#btnClearAll").onclick = () => {
    modalOpen({
      title: "Einkaufsliste löschen",
      bodyHtml: `<div class="empty">Willst du wirklich alle Einträge löschen?</div>`,
      footerButtons: [
        { label: "Abbrechen", className: "btn", onClick: modalClose },
        { label: "Alles löschen", className: "btn danger", onClick: () => {
          modalClose();
          state.shopping.forEach(s => { if (s.inventoryId) removeInventoryEntry(s.inventoryId); });
          state.shopping = [];
          Storage.save(state);
          renderShopping();
        }}
      ]
    });
  };
}

function renderInventory() {
  const list = $("#inventoryList");
  const empty = $("#inventoryEmpty");
  list.innerHTML = "";

  const items = [...state.inventory].filter(i => showConsumedInventory ? true : !i.consumed);

  if (!items.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  items.sort((a,b) => {
    const ad = a.consumed ? 1 : 0;
    const bd = b.consumed ? 1 : 0;
    if (ad !== bd) return ad - bd;
    const aBy = a.useByAt || Number.MAX_SAFE_INTEGER;
    const bBy = b.useByAt || Number.MAX_SAFE_INTEGER;
    if (aBy !== bBy) return aBy - bBy;
    return (b.purchasedAt||0) - (a.purchasedAt||0);
  });

  const now = Date.now();

  items.forEach(inv => {
    const a = getArticleById(inv.articleId);
    const useBy = inv.useByAt ? fmtDate(inv.useByAt) : "—";
    const purchased = fmtDate(inv.purchasedAt);
    const expired = inv.useByAt && inv.useByAt < now;

    const row = document.createElement("div");
    row.className = "irow";
    row.innerHTML = `
      <div>
        <div class="iname ${inv.consumed ? "strike" : ""}">${escapeHtml(a ? a.name : "Unbekannter Artikel")}</div>
        <div class="imeta">
          ${escapeHtml(a ? (a.unit || "Stk") : "")}
          · Kauf: ${escapeHtml(purchased)}
          · Brauchen bis: <span class="${expired ? "expired" : ""}">${escapeHtml(useBy)}</span>
        </div>
      </div>
      <div class="istatus ${expired ? "expired" : ""}">
        ${inv.consumed ? "Verbraucht" : (expired ? "Abgelaufen" : "Aktiv")}
      </div>
      <div class="iqty">
        <input type="number" min="1" step="1" value="${escapeHtml(String(Math.max(1, inv.qty || 1)))}" />
      </div>
      <div class="iactions">
        <button class="btn" data-action="consume">${inv.consumed ? "Reaktivieren" : "Verbraucht"}</button>
        <button class="btn danger" data-action="delete">Löschen</button>
      </div>
      <div class="hidden"></div>
    `;

    const qtyInput = row.querySelector("input[type=number]");
    const btnConsume = row.querySelector('[data-action="consume"]');
    const btnDelete = row.querySelector('[data-action="delete"]');

    qtyInput.addEventListener("change", () => {
      inv.qty = Math.max(1, Number(qtyInput.value || 1));
      state.shopping.forEach(s => {
        if (s.inventoryId === inv.id) s.qty = inv.qty;
      });
      Storage.save(state);
      renderInventory();
    });

    btnConsume.addEventListener("click", () => {
      inv.consumed = !inv.consumed;
      inv.consumedAt = inv.consumed ? Date.now() : null;
      Storage.save(state);
      renderInventory();
    });

    btnDelete.addEventListener("click", () => {
      state.shopping.forEach(s => {
        if (s.inventoryId === inv.id) {
          s.inventoryId = null;
          s.done = false;
          s.purchasedAt = null;
        }
      });
      removeInventoryEntry(inv.id);
      renderInventory();
    });

    list.appendChild(row);
  });

  $("#btnToggleConsumed").onclick = () => {
    showConsumedInventory = !showConsumedInventory;
    $("#btnToggleConsumed").textContent = showConsumedInventory ? "Nur aktive anzeigen" : "Verbrauchte anzeigen";
    renderInventory();
  };

  $("#btnClearConsumed").onclick = () => {
    modalOpen({
      title: "Verbrauchte löschen",
      bodyHtml: `<div class="empty">Willst du alle als „verbraucht“ markierten Lager-Einträge löschen?</div>`,
      footerButtons: [
        { label: "Abbrechen", className: "btn", onClick: modalClose },
        { label: "Löschen", className: "btn danger", onClick: () => {
          modalClose();
          const consumedIds = new Set(state.inventory.filter(i => i.consumed).map(i => i.id));
          state.shopping.forEach(s => {
            if (s.inventoryId && consumedIds.has(s.inventoryId)) {
              s.inventoryId = null;
              s.done = false;
              s.purchasedAt = null;
            }
          });
          state.inventory = state.inventory.filter(i => !i.consumed);
          Storage.save(state);
          renderInventory();
        }}
      ]
    });
  };
}

function init() {
  const startRoute = location.hash.replace("#","") || "recipes";
  routeTo(startRoute);

  if (!state.articles.length) {
    const a = { id: Storage.nextId(state), name: "Zwiebeln", unit: "Stk", useDays: 14, createdAt: Date.now() };
    upsertArticle(a);
    Storage.save(state);
  }
}

init();
