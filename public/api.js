async function request(path, options = {}) {
  const opts = { ...options };
  opts.headers = opts.headers ? { ...opts.headers } : {};

  if (opts.body && !opts.headers["Content-Type"]) {
    opts.headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, opts);

  if (res.status === 204) {
    return null;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data && data.error ? data.error : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

async function getItems() {
  return request("/api/items");
}

async function createItem(payload) {
  return request("/api/items", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

async function updateItem(id, payload) {
  return request(`/api/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload || {})
  });
}

async function deleteItem(id) {
  return request(`/api/items/${id}`, { method: "DELETE" });
}

async function getState() {
  return request("/api/state");
}

async function saveState(payload) {
  return request("/api/state", {
    method: "PUT",
    body: JSON.stringify(payload || {})
  });
}

export { getItems, createItem, updateItem, deleteItem, getState, saveState };
