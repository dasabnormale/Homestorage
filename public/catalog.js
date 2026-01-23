import { escapeHtml } from "./helpers.js";

const ARTICLE_CATEGORIES = [
  "Blumen / Pflanzen",
  "Früchte & Gemüse",
  "Backwaren / Brot",
  "Frische Convenience",
  "Milchprodukte Joghurt Käse",
  "Fleisch/Fisch",
  "Charcuterie / Aufschnitt / Feinkost",
  "Grundnahrungsmittel",
  "Tiefkühl",
  "Non-Food"
];
const CATEGORY_FALLBACK = "Divers";
const CATEGORY_ORDER = [...ARTICLE_CATEGORIES, CATEGORY_FALLBACK];
const DEFAULT_UNIT = "Stk";
const UNIT_OPTIONS = ["Stk", "Zehe", "g", "ml", "Pack", "Dose", "Bund"];
const USE_DAYS_SCOPE_ALL = "all";
const USE_DAYS_SCOPE_PER_ITEM = "per-item";
const USE_DAYS_SCOPE_OPTIONS = [
  { value: USE_DAYS_SCOPE_ALL, label: "Alle zusammen" },
  { value: USE_DAYS_SCOPE_PER_ITEM, label: "Pro Stück" }
];
const DEFAULT_USE_DAYS_SCOPE = USE_DAYS_SCOPE_ALL;

function normalizeCategory(cat) {
  const clean = (cat || "").trim();
  return ARTICLE_CATEGORIES.includes(clean) ? clean : "";
}

function displayCategory(cat) {
  const clean = normalizeCategory(cat);
  return clean || CATEGORY_FALLBACK;
}

function categorySortIndex(cat) {
  const label = displayCategory(cat);
  const idx = CATEGORY_ORDER.indexOf(label);
  return idx < 0 ? CATEGORY_ORDER.length - 1 : idx;
}

function categoryOptionsHtml(selected) {
  const clean = normalizeCategory(selected);
  const opts = [`<option value="">${escapeHtml(`${CATEGORY_FALLBACK} (keine Auswahl)`)}</option>`];
  ARTICLE_CATEGORIES.forEach(cat => {
    const sel = cat === clean ? " selected" : "";
    opts.push(`<option value="${escapeHtml(cat)}"${sel}>${escapeHtml(cat)}</option>`);
  });
  return opts.join("");
}

function normalizeUnit(unit) {
  const clean = (unit || "").trim();
  return clean || DEFAULT_UNIT;
}

function unitOptionsHtml(selected) {
  const clean = normalizeUnit(selected);
  const opts = [];
  if (!UNIT_OPTIONS.includes(clean)) {
    opts.push(`<option value="${escapeHtml(clean)}" selected>${escapeHtml(clean)}</option>`);
  }
  UNIT_OPTIONS.forEach(unit => {
    const sel = unit === clean ? " selected" : "";
    opts.push(`<option value="${escapeHtml(unit)}"${sel}>${escapeHtml(unit)}</option>`);
  });
  return opts.join("");
}

function normalizeUseDaysScope(scope) {
  const clean = (scope || "").trim();
  return USE_DAYS_SCOPE_OPTIONS.some(opt => opt.value === clean) ? clean : DEFAULT_USE_DAYS_SCOPE;
}

function useDaysScopeOptionsHtml(selected) {
  const clean = normalizeUseDaysScope(selected);
  return USE_DAYS_SCOPE_OPTIONS.map(opt => {
    const sel = opt.value === clean ? " selected" : "";
    return `<option value="${escapeHtml(opt.value)}"${sel}>${escapeHtml(opt.label)}</option>`;
  }).join("");
}

function recipeItemUnit(item, article) {
  const unit = item?.unit || article?.unit || DEFAULT_UNIT;
  return normalizeUnit(unit);
}

export {
  ARTICLE_CATEGORIES,
  CATEGORY_FALLBACK,
  CATEGORY_ORDER,
  DEFAULT_UNIT,
  UNIT_OPTIONS,
  USE_DAYS_SCOPE_ALL,
  USE_DAYS_SCOPE_PER_ITEM,
  USE_DAYS_SCOPE_OPTIONS,
  DEFAULT_USE_DAYS_SCOPE,
  normalizeCategory,
  displayCategory,
  categorySortIndex,
  categoryOptionsHtml,
  normalizeUnit,
  unitOptionsHtml,
  normalizeUseDaysScope,
  useDaysScopeOptionsHtml,
  recipeItemUnit
};
