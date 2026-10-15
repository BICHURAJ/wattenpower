const TOKEN_KEY = "wp.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (auth && token) headers.Authorization = "Bearer " + token;

  const res = await fetch("/api" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    clearToken();
    if (!location.pathname.startsWith("/login")) location.href = "/login";
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok)
    throw new Error(data?.error || "Request failed (" + res.status + ")");
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path) => request(path, { method: "DELETE" }),
  public: {
    post: (path, body) => request(path, { method: "POST", body, auth: false }),
  },
};

/** Build a querystring from an object, skipping empty values. */
export function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (
      value !== "" &&
      value !== undefined &&
      value !== null &&
      value !== "All"
    )
      search.set(key, value);
  }
  const str = search.toString();
  return str ? "?" + str : "";
}

export const money = (value) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    Number(value) || 0,
  );

const round2 = (value) => Math.round(value * 100) / 100;

/** One quotation line: net (qty x price), its VAT, and total including VAT. */
export const lineAmounts = (item) => {
  const net = round2((Number(item.qty) || 0) * (Number(item.unitPrice) || 0));
  const vat = round2(net * ((Number(item.vat) || 0) / 100));
  return { net, vat, total: round2(net + vat) };
};

/** The discount in pounds for lines coming to `subtotal` (ex VAT). Same as server/src/quoteMath.js. */
export const discountAmount = (subtotal, discount) => {
  const value = Number(discount?.value) || 0;
  if (!["percent", "amount"].includes(discount?.type) || value <= 0 || subtotal <= 0) return 0;
  return round2(discount.type === "percent" ? subtotal * (Math.min(value, 100) / 100) : Math.min(value, subtotal));
};

/**
 * Quotation totals, worked out exactly as the server does (server/src/quoteMath.js;
 * both run the same test cases): { subtotal, discount, net, vatTotal, total }.
 * A discount is shared across the lines by value, and each line's VAT is on
 * its discounted price, since quotes mix 20% and 0% VAT lines.
 */
export const quoteTotals = (items = [], discount) => {
  const nets = items.map((item) => lineAmounts(item).net);
  const subtotal = round2(nets.reduce((a, b) => a + b, 0));
  const off = discountAmount(subtotal, discount);
  const last = nets.reduce((at, n, i) => (n > 0 ? i : at), -1);
  let given = 0;
  let vatTotal = 0;
  items.forEach((item, i) => {
    let share = 0;
    if (off && nets[i] > 0) {
      share = i === last ? round2(off - given) : round2((off * nets[i]) / subtotal);
      given = round2(given + share);
    }
    vatTotal += round2((nets[i] - share) * ((Number(item.vat) || 0) / 100));
  });
  vatTotal = round2(vatTotal);
  const net = round2(subtotal - off);
  return { subtotal, discount: off, net, vatTotal, total: round2(net + vatTotal) };
};

export const shortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "--";

export const inputDate = (value) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export const timeAgo = (value) => {
  if (!value) return "";
  const seconds = Math.floor((Date.now() - new Date(value)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  return days + "d ago";
};
