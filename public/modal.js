import { $ } from "./helpers.js";

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

export { modalOpen, modalClose };
