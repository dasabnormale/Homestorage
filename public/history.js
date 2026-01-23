import { $, escapeHtml, fmtDate, fmtIsoDate } from "./helpers.js";
import { state } from "./state.js";
import { DEFAULT_UNIT, normalizeUnit } from "./catalog.js";
import { getArticleById, getRecipeById } from "./data.js";

let historyShowAll = true;
let selectedHistoryDateKey = null;

function renderHistory() {
  const dateList = $("#historyDateList");
  const dateEmpty = $("#historyDateEmpty");
  const itemsWrap = $("#historyItems");
  const itemsEmpty = $("#historyItemsEmpty");
  const title = $("#historyDetailTitle");
  const btnShowAll = $("#btnHistoryShowAll");
  if (!dateList || !dateEmpty || !itemsWrap || !itemsEmpty || !title || !btnShowAll) return;

  const q = ($("#historySearch")?.value || "").trim().toLowerCase();

  dateList.innerHTML = "";
  itemsWrap.innerHTML = "";

  const groupMap = new Map();
  state.history.forEach(h => {
    const dateKey = fmtIsoDate(h.purchasedAt);
    let group = groupMap.get(dateKey);
    if (!group) {
      group = { dateKey, dateLabel: fmtDate(h.purchasedAt), sortTs: h.purchasedAt, items: [] };
      groupMap.set(dateKey, group);
    } else {
      group.sortTs = Math.max(group.sortTs, h.purchasedAt);
    }

    (h.items || []).forEach(it => {
      const a = getArticleById(it.articleId);
      const unit = normalizeUnit(it.unit || a?.unit || DEFAULT_UNIT);
      const name = a ? a.name : "Unbekannter Artikel";

      const sourceParts = [];
      const sourceSearchParts = [];
      (it.sources || [])
        .filter(s => s.type === "recipe" && s.recipeId)
        .forEach(s => {
          const r = getRecipeById(s.recipeId);
          if (r?.name) {
            sourceParts.push(`${r.name}: ${s.qty} ${unit}`);
            sourceSearchParts.push(r.name);
          }
        });

      const manual = (it.sources || []).find(s => s.type === "manual");
      if (manual) {
        sourceParts.push(`Manuell: ${manual.qty} ${unit}`);
        sourceSearchParts.push("manuell");
      }

      const srcTxt = sourceParts.length
        ? sourceParts.slice(0, 3).join(" · ") + (sourceParts.length > 3 ? " · …" : "")
        : "—";

      const searchText = `${name} ${unit} ${sourceSearchParts.join(" ")}`.toLowerCase();

      group.items.push({
        name,
        unit,
        neededQty: Math.max(0, Number(it.neededQty || 0)),
        boughtQty: Math.max(0, Number(it.boughtQty || 0)),
        sourceTxt: srcTxt,
        searchText
      });
    });
  });

  const groups = [...groupMap.values()].sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0));
  const filteredGroups = groups
    .map(g => {
      const items = q ? g.items.filter(it => it.searchText.includes(q)) : g.items;
      return { ...g, items };
    })
    .filter(g => g.items.length > 0);

  const hasHistory = groups.length > 0;
  if (!hasHistory) {
    dateEmpty.textContent = "Keine Einkäufe in der Historie.";
    itemsEmpty.textContent = "Keine Einkäufe in der Historie.";
    dateEmpty.classList.remove("hidden");
    itemsEmpty.classList.remove("hidden");
    title.textContent = "Historie";
    btnShowAll.classList.add("primary");
    return;
  }

  btnShowAll.classList.toggle("primary", historyShowAll);

  if (!filteredGroups.length) {
    dateEmpty.textContent = "Keine passenden Daten.";
    itemsEmpty.textContent = "Keine passenden Einkäufe.";
    dateEmpty.classList.remove("hidden");
    itemsEmpty.classList.remove("hidden");
  } else {
    dateEmpty.classList.add("hidden");
    itemsEmpty.classList.add("hidden");
  }

  if (!historyShowAll) {
    const keys = new Set(filteredGroups.map(g => g.dateKey));
    if (!selectedHistoryDateKey || !keys.has(selectedHistoryDateKey)) {
      selectedHistoryDateKey = filteredGroups.length ? filteredGroups[0].dateKey : null;
    }
  }

  filteredGroups.forEach(g => {
    const card = document.createElement("div");
    const countTxt = `${g.items.length} Artikel`;
    card.className = "itemCard" + (!historyShowAll && g.dateKey === selectedHistoryDateKey ? " active" : "");
    card.innerHTML = `
      <div class="itemTitle">${escapeHtml(g.dateLabel)}</div>
      <div class="itemSub">${escapeHtml(countTxt)}</div>
    `;
    card.addEventListener("click", () => {
      historyShowAll = false;
      selectedHistoryDateKey = g.dateKey;
      renderHistory();
    });
    dateList.appendChild(card);
  });

  const renderRow = (it) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div></div>
      <div>
        <div class="name">${escapeHtml(it.name)}</div>
        <div class="muted">
          Benötigt: ${escapeHtml(String(it.neededQty))} ${escapeHtml(it.unit)}
          · Gekauft: ${escapeHtml(String(it.boughtQty))} ${escapeHtml(it.unit)}
          · ${escapeHtml(it.sourceTxt)}
        </div>
      </div>
      <div class="qty"></div>
      <div class="actions"></div>
    `;
    return row;
  };

  if (historyShowAll) {
    title.textContent = "Alle Einkäufe";
    filteredGroups.forEach(g => {
      const header = document.createElement("div");
      header.className = "block";
      header.innerHTML = `<div class="blockTitle">${escapeHtml(g.dateLabel)}</div>`;
      itemsWrap.appendChild(header);
      g.items.forEach(it => itemsWrap.appendChild(renderRow(it)));
    });
  } else if (selectedHistoryDateKey) {
    const group = filteredGroups.find(g => g.dateKey === selectedHistoryDateKey) || null;
    if (group) {
      title.textContent = group.dateLabel;
      group.items.forEach(it => itemsWrap.appendChild(renderRow(it)));
    } else {
      title.textContent = "Historie";
    }
  }

  btnShowAll.onclick = () => {
    historyShowAll = true;
    selectedHistoryDateKey = null;
    renderHistory();
  };
}

$("#historySearch")?.addEventListener("input", renderHistory);

export { renderHistory };
