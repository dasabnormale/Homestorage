import { $, $$ } from "./helpers.js";
import { state, Storage } from "./state.js";
import { DEFAULT_USE_DAYS_SCOPE } from "./catalog.js";
import { upsertArticle } from "./data.js";
import { openArticleEditor, renderArticles } from "./articles.js";
import { renderRecipes } from "./recipes.js";
import { renderShopping } from "./shopping.js";
import { renderInventory } from "./inventory.js";
import { renderHistory } from "./history.js";

const routes = ["recipes", "articles", "shopping", "inventory", "history"];
let currentRoute = "recipes";

function routeTo(route) {
  currentRoute = routes.includes(route) ? route : "recipes";
  $$(".view").forEach(v => v.classList.add("hidden"));
  $("#view-" + currentRoute)?.classList.remove("hidden");
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

function init() {
  const startRoute = location.hash.replace("#", "") || "recipes";
  routeTo(startRoute);

  if (!state.articles.length) {
    upsertArticle({
      id: Storage.nextId(state),
      name: "Knoblauch",
      unit: "Zehe",
      useDays: 14,
      useDaysScope: DEFAULT_USE_DAYS_SCOPE,
      createdAt: Date.now()
    });
  }

  $("#btnNewArticle")?.addEventListener("click", () => openArticleEditor(null));

  const r = location.hash.replace("#", "") || "recipes";
  routeTo(r);
}

export { init };
