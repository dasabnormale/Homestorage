import { Storage, state } from "./state.js";
import { normalizeUseDaysScope } from "./catalog.js";

function getArticleById(id) {
  return state.articles.find(a => a.id === id) || null;
}

function getRecipeById(id) {
  return state.recipes.find(r => r.id === id) || null;
}

function upsertArticle(article) {
  if (article) article.useDaysScope = normalizeUseDaysScope(article.useDaysScope);
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

export { getArticleById, getRecipeById, upsertArticle, upsertRecipe, removeRecipe, removeArticle };
