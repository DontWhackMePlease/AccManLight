// Account Manager Light — the page: Supabase (sign in, storage), the three screens, the settings.
import * as core from "./core.js?v=0.77.0";
import { EXPENSE, INCOME, TRANSFER, t as text } from "./core.js?v=0.77.0";

const BUCKET = "account-manager";
const store = {  // what the phone keeps between two visits
  get(key, fallback = null) {
    try { const v = localStorage.getItem("am." + key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem("am." + key, JSON.stringify(value)); } catch { /* private mode */ } },
  drop(key) { try { localStorage.removeItem("am." + key); } catch { /* private mode */ } },
};

// ------------------------------------------------------------------ Supabase

class NetworkError extends Error {}

export class Supabase {
  constructor(url, key, session) {
    this.url = core.projectUrl(url);
    this.key = (key || "").trim();
    this.session = session;  // {access_token, refresh_token, user_id, email, expires_at}
  }

  async #fetch(path, options = {}) {
    try {
      return await fetch(this.url + path, options);
    } catch (error) {
      throw new NetworkError(error.message || String(error));
    }
  }

  async #token(grant, body) {
    const answer = await this.#fetch(`/auth/v1/token?grant_type=${grant}`, {
      method: "POST", headers: { apikey: this.key, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await answer.json().catch(() => ({}));
    if (!answer.ok || !data.access_token) {
      throw new Error(data.error_description || data.msg || data.message || `HTTP ${answer.status}`);
    }
    this.session = {
      access_token: data.access_token, refresh_token: data.refresh_token, user_id: data.user?.id,
      email: data.user?.email ?? this.session?.email, expires_at: Date.now() + (data.expires_in ?? 3600) * 1000 - 60000,
    };
    store.set("session", this.session);
    return this.session;
  }

  signIn(email, password) { return this.#token("password", { email: email.trim(), password }); }

  async #access() {
    if (!this.session?.refresh_token) throw new Error("not signed in");
    if (!this.session.access_token || Date.now() > (this.session.expires_at ?? 0)) {
      await this.#token("refresh_token", { refresh_token: this.session.refresh_token });
    }
    return this.session.access_token;
  }

  async #storage(method, path, body, headers = {}, again = true) {
    const token = await this.#access();
    const answer = await this.#fetch(`/storage/v1/${path}`, {
      method, body, cache: "no-store",
      headers: { apikey: this.key, Authorization: `Bearer ${token}`, ...headers },
    });
    if ((answer.status === 401 || answer.status === 403) && again) {  // expired: renewed once
      this.session.access_token = "";
      return this.#storage(method, path, body, headers, false);
    }
    return answer;
  }

  #name(name) { return `${BUCKET}/${this.session.user_id}/${name}`; }

  async download(name) {
    const answer = await this.#storage("GET", `object/authenticated/${this.#name(name)}`);
    if (answer.status === 400 || answer.status === 404) return null;
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
    return answer.json();
  }

  async upload(name, data) {
    const answer = await this.#storage("POST", `object/${this.#name(name)}`, JSON.stringify(data),
      { "Content-Type": "application/json", "x-upsert": "true" });
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  }

  async list(folder) {
    const answer = await this.#storage("POST", `object/list/${BUCKET}`, JSON.stringify({
      prefix: `${this.session.user_id}/${folder}`, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" },
    }), { "Content-Type": "application/json" });
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
    return (await answer.json()).filter((item) => item.id && item.name.endsWith(".json")).map((item) => folder + item.name);
  }

  async remove(names) {
    if (!names.length) return;
    const answer = await this.#storage("DELETE", `object/${BUCKET}`,
      JSON.stringify({ prefixes: names.map((n) => `${this.session.user_id}/${n}`) }), { "Content-Type": "application/json" });
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  }
}

// ------------------------------------------------------------------ state

const state = {
  snapshot: store.get("snapshot"),
  waiting: store.get("waiting", []),    // in the storage, not yet written by the main application
  rejected: store.get("rejected", []),  // refused by it, with the reason
  outbox: store.get("outbox", []),      // entered here, not sent yet (no network)
  screen: "balances",
  kind: EXPENSE,
  message: null,
};

const config = () => store.get("config", { url: "", key: "", language: "auto" });
const lang = () => {
  const chosen = config().language;
  if (chosen && chosen !== "auto") return chosen;
  return state.snapshot?.language || (navigator.language || "en").slice(0, 2);
};
const t = (key, values) => text(lang(), key, values);
const money = (cents, currency) => core.formatAmount(cents, currency || "EUR", lang());
const client = () => {
  const c = config();
  return c.url && c.key && store.get("session") ? new Supabase(c.url, c.key, store.get("session")) : null;
};

function save() {
  store.set("snapshot", state.snapshot);
  store.set("waiting", state.waiting);
  store.set("rejected", state.rejected);
  store.set("outbox", state.outbox);
}

function say(message, kind = "info") {
  state.message = message ? { message, kind } : null;
  render();
}

// ------------------------------------------------------------- exchanges

async function sendOutbox(supabase) {
  for (const tx of [...state.outbox]) {
    await supabase.upload(`pending/${tx.id}.json`, tx);
    state.outbox = state.outbox.filter((x) => x.id !== tx.id);
    state.waiting.push(tx);
    save();
  }
}

/** Everything again from the storage: the snapshot, what waits, what was refused. */
export async function refresh() {
  const supabase = client();
  if (!supabase) return say(t("setupFirst"), "error");
  say(t("loading"));
  try {
    await sendOutbox(supabase);
    state.snapshot = (await supabase.download("snapshot.json")) ?? state.snapshot;
    const read = async (folder) => (await Promise.all((await supabase.list(folder)).map((n) => supabase.download(n))))
      .filter(Boolean);
    state.waiting = await read("pending/");
    state.rejected = await read("rejected/");
    save();
    say(null);
  } catch (error) {
    say(t("errNetwork", { error: error.message }), "error");
  }
}

async function record(tx) {
  state.outbox.push(tx);
  save();
  const supabase = client();
  try {
    if (!supabase) throw new NetworkError("offline");
    await sendOutbox(supabase);
    say(t("saved"), "ok");
  } catch (error) {
    say(error instanceof NetworkError ? t("savedOffline") : t("errNetwork", { error: error.message }), "error");
  }
}

async function removeWaiting(tx) {
  if (!confirm(t("removeConfirm"))) return;
  if (state.outbox.some((x) => x.id === tx.id)) {
    state.outbox = state.outbox.filter((x) => x.id !== tx.id);
  } else {
    try { await client().remove([`pending/${tx.id}.json`]); } catch (error) { return say(t("errNetwork", { error: error.message }), "error"); }
    state.waiting = state.waiting.filter((x) => x.id !== tx.id);
  }
  save();
  render();
}

async function dismissRejected(tx) {
  try { await client().remove([`rejected/${tx.id}.json`]); } catch (error) { return say(t("errNetwork", { error: error.message }), "error"); }
  state.rejected = state.rejected.filter((x) => x.id !== tx.id);
  save();
  render();
}

// ---------------------------------------------------------------- screens

const h = (tag, attributes = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
    else if (value === true) node.setAttribute(name, "");
    else if (value !== false && value != null) node.setAttribute(name, value);
  }
  for (const child of children.flat(Infinity)) if (child != null && child !== false) node.append(child.nodeType ? child : String(child));
  return node;
};

/** Accounts folded on the balances screen (kept on the phone). */
function foldedAccounts() {
  const kept = store.get("folded");
  return new Set(kept ?? core.initiallyFolded(state.snapshot));
}

/** Banking institutions folded on the balances screen: only their header and their total show. */
function foldedInstitutions() {
  return new Set(store.get("foldedGroups", []));
}

function toggleGroup(institution) {
  const folded = foldedInstitutions();
  if (folded.has(institution)) folded.delete(institution); else folded.add(institution);
  store.set("foldedGroups", [...folded]);
  render();
}

function groupHeader(group, balances, isFolded) {
  const totals = core.groupTotals(group, balances);
  return h("h2", { class: "group-head", role: "button", "aria-expanded": String(!isFolded),
                   onclick: () => toggleGroup(group.institution) },
    h("span", {}, h("span", { class: "chevron" }, isFolded ? "▸" : "▾"), group.institution || "—"),
    isFolded ? h("span", { class: "group-total" },
      [...totals].map(([currency, cents]) => money(cents, currency)).join(" · ")) : null);
}

function toggle(accountId) {
  const folded = foldedAccounts();
  if (folded.has(accountId)) folded.delete(accountId); else folded.add(accountId);
  store.set("folded", [...folded]);
  render();
}

/** The horizon of the balances shown: today, end of month or everything planned (kept on the phone). */
function horizon() {
  const kept = store.get("horizon");
  return core.HORIZONS.includes(kept) ? kept : "today";
}

function setHorizon(value) {
  store.set("horizon", value);
  render();
}

function horizonSwitch(snap) {
  const chosen = horizon();
  const limit = core.horizonEnd(chosen);
  const hint = chosen === "today" ? t("horizonToday")
    : chosen === "month_end" ? t("horizonMonth", { date: core.formatDate(limit, lang()) }) : t("horizonForecast");
  return h("div", { class: "horizon" },
    h("div", { class: "kinds" }, core.HORIZONS.map((value) => h("button", {
      type: "button", class: value === chosen ? "on" : "", onclick: () => setHorizon(value),
    }, t(value)))),
    h("p", { class: "as-of hint" }, core.hasHorizons(snap) ? hint : t("oldSnapshot")));
}

function balancesScreen() {
  const snap = state.snapshot;
  if (!snap) return h("p", { class: "empty" }, t("noSnapshot"));
  const folded = foldedAccounts();
  const foldedGroups = foldedInstitutions();
  const pending = [...state.waiting, ...state.outbox];
  const balances = core.adjustedBalances(snap, pending, horizon());
  const count = core.stillWaiting(snap, pending).length;
  const totals = new Map();
  for (const a of snap.accounts) {
    if (a.real) totals.set(a.currency, (totals.get(a.currency) ?? 0) + balances.get(a.id).consolidated);
  }
  return h("div", {},
    horizonSwitch(snap),
    h("p", { class: "as-of" }, t("asOf", { date: new Date(snap.generated_at).toLocaleString(lang()) }),
      count ? h("span", { class: "badge" }, " · " + t("withWaiting", { count })) : null),
    core.accountTree(snap).map((group) => h("section", { class: `group${foldedGroups.has(group.institution) ? " folded" : ""}` },
      groupHeader(group, balances, foldedGroups.has(group.institution)),
      foldedGroups.has(group.institution) ? null : core.visibleRows(group.rows, folded).map(({ account, depth, hasChildren }) => {
        const b = balances.get(account.id);
        const shown = b.consolidated;  // with its sub-accounts; its own balance below when different
        const isFolded = folded.has(account.id);
        return h("div", {
          class: `row depth${Math.min(depth, 3)}${account.open ? "" : " closed"}${hasChildren ? " node" : ""}`,
          onclick: hasChildren ? () => toggle(account.id) : null,
          role: hasChildren ? "button" : null, "aria-expanded": hasChildren ? String(!isFolded) : null,
        },
          h("span", { class: "name" },
            h("span", { class: "chevron" }, hasChildren ? (isFolded ? "▸" : "▾") : ""), account.name),
          h("span", { class: `amount${shown < 0 ? " negative" : ""}` }, money(shown, account.currency)),
          b.balance !== b.consolidated ? h("span", { class: "own" }, money(b.balance, account.currency)) : null);
      }))),
    h("div", { class: "row total" }, h("span", { class: "name" }, t("total")),
      h("span", { class: "amount" }, [...totals].map(([currency, cents]) => money(cents, currency)).join(" · "))));
}

function select(id, options, chosen, placeholder) {
  return h("select", { id },
    placeholder ? h("option", { value: "" }, placeholder) : null,
    options.map(([value, label]) => h("option", { value, selected: String(value) === String(chosen) }, label)));
}

function entryScreen() {
  const snap = state.snapshot;
  if (!snap) return h("p", { class: "empty" }, t("noSnapshot"));
  const kind = state.kind;
  const draft = state.draft ?? (state.draft = { date: core.today() });
  const accounts = core.accountsFor(snap, kind).map((a) => [a.id, a.path + (a.currency !== "EUR" ? ` (${a.currency})` : "")]);
  const categories = core.categoriesFor(snap, kind).map((c) => [c.id, c.label]);
  const tabs = h("div", { class: "kinds" }, [EXPENSE, INCOME, TRANSFER].map((k) => h("button", {
    type: "button", class: k === kind ? "on" : "", onclick: () => { state.kind = k; state.draft.category_id = null; render(); },
  }, t(k.toLowerCase()))));
  const field = (label, input) => h("label", {}, h("span", {}, label), input);
  const remember = (event) => { draft[event.target.id] = event.target.value; };
  const form = h("form", { class: "entry", oninput: remember, onchange: remember, onsubmit: (e) => { e.preventDefault(); submit(); } },
    tabs,
    kind === TRANSFER
      ? [field(t("from"), select("source_account_id", accounts, draft.source_account_id, "—")),
         field(t("to"), select("dest_account_id", accounts, draft.dest_account_id, "—"))]
      : field(t("account"), select("account_id", accounts, draft.account_id ?? accounts[0]?.[0])),
    field(t("date"), h("input", { id: "date", type: "date", value: draft.date, required: true })),
    field(t("amount"), h("input", { id: "amount", inputmode: "decimal", autocomplete: "off", placeholder: "0,00",
                                    value: draft.amount ?? "" })),
    kind === TRANSFER ? null : field(t("thirdParty"), h("input", {
      id: "third_party", list: "parties", autocomplete: "off", placeholder: t("newThirdParty"), value: draft.third_party ?? "",
      onchange: (e) => {  // its default category, as in the main application
        const found = core.defaultCategory(snap, e.target.value, kind);
        if (found != null) { draft.category_id = found; render(); }
      },
    })),
    h("datalist", { id: "parties" }, (snap.third_parties ?? []).map((p) => h("option", { value: p.name }))),
    field(t("category"), select("category_id", categories, draft.category_id, t("none"))),
    field(t("comment"), h("input", { id: "comment", autocomplete: "off", value: draft.comment ?? "" })),
    h("button", { type: "submit", class: "primary" }, t("save")));
  return form;
}

async function submit() {
  const d = state.draft;
  const kind = state.kind;
  const accounts = core.accountsFor(state.snapshot, kind);
  const fields = {
    date: d.date, amount: core.parseAmount(d.amount), comment: d.comment, third_party: d.third_party,
    category_id: d.category_id ? Number(d.category_id) : null,
    account_id: Number(d.account_id ?? accounts[0]?.id), source_account_id: Number(d.source_account_id),
    dest_account_id: Number(d.dest_account_id),
  };
  const tx = core.transactionFile(kind, { ...fields, amount: fields.amount ?? 0 });
  const problem = core.check(state.snapshot, tx);
  if (problem) return say(t(problem[0], problem[1]), "error");
  state.draft = { date: d.date, account_id: d.account_id };  // ready for the next one, same day and account
  await record(tx);
}

function describe(tx) {
  const byId = core.accountsById(state.snapshot);
  const name = (id) => byId.get(id)?.path ?? "?";
  const account = tx.kind === TRANSFER ? `${name(tx.source_account_id)} → ${name(tx.dest_account_id)}`
    : name(tx.kind === EXPENSE ? tx.source_account_id : tx.dest_account_id);
  const currency = byId.get(tx.source_account_id ?? tx.dest_account_id)?.currency;
  return [core.formatDate(tx.date, lang()), tx.third_party || t(tx.kind.toLowerCase()), account,
    money(core.signedFor(tx), currency)];
}

function waitingScreen() {
  const snap = state.snapshot;
  const outboxIds = new Set(state.outbox.map((x) => x.id));
  const list = core.stillWaiting(snap, [...state.outbox, ...state.waiting]);
  const line = (tx, extra, action) => {
    const [date, who, account, amount] = describe(tx);
    return h("div", { class: "item" },
      h("div", { class: "what" }, h("b", {}, who), h("span", {}, `${date} · ${account}`),
        tx.comment ? h("span", { class: "comment" }, tx.comment) : null, extra),
      h("div", { class: "side" }, h("span", { class: `amount${amount.startsWith("-") ? " negative" : ""}` }, amount), action));
  };
  return h("div", {},
    h("h2", {}, t("waitingTitle")),
    list.length ? list.map((tx) => line(tx, outboxIds.has(tx.id) ? h("span", { class: "warn" }, t("notSent")) : null,
      h("button", { class: "small", onclick: () => removeWaiting(tx) }, t("remove"))))
      : h("p", { class: "empty" }, t("nothingWaiting")),
    state.rejected.length ? [h("h2", { class: "refused" }, t("refusedTitle")), state.rejected.map((tx) =>
      line(tx, h("span", { class: "error-text" }, tx.error),
        h("button", { class: "small", onclick: () => dismissRejected(tx) }, t("dismiss"))))] : null);
}

function settingsScreen() {
  const c = config();
  const session = store.get("session");
  const keep = () => store.set("config", {
    ...config(), url: core.projectUrl(document.getElementById("url").value), key: document.getElementById("key").value.trim(),
    language: document.getElementById("language").value,
    email: document.getElementById("email")?.value.trim() ?? config().email,
  });
  return h("form", { class: "entry", onchange: (e) => { keep(); if (e.target.id === "language") render(); }, onsubmit: async (e) => {
      e.preventDefault(); keep();
      try {
        await new Supabase(config().url, config().key).signIn(document.getElementById("email").value,
          document.getElementById("password").value);
        await refresh();
        state.screen = "balances";
        render();
      } catch (error) { say(error.message, "error"); }
    } },
    h("label", {}, h("span", {}, t("project")), h("input", { id: "url", value: c.url, placeholder: "https://xxxx.supabase.co" })),
    h("label", {}, h("span", {}, t("anonKey")), h("input", { id: "key", value: c.key })),
    h("label", {}, h("span", {}, t("language")), select("language", [["auto", t("auto")], ["en", "English"], ["fr", "Français"]],
      c.language)),
    session ? [h("p", {}, t("signedInAs", { email: session.email ?? "" })),
      h("button", { type: "button", onclick: () => { store.drop("session"); render(); } }, t("signOut"))]
      : [h("label", {}, h("span", {}, t("email")), h("input", { id: "email", type: "email", autocomplete: "username", value: c.email ?? "" })),
         h("label", {}, h("span", {}, t("password")), h("input", { id: "password", type: "password",
                                                                autocomplete: "current-password" })),
         h("button", { type: "submit", class: "primary" }, t("signIn"))],
    h("p", { class: "version" }, t("version", { version: core.VERSION })));
}

export function render() {
  const root = document.getElementById("app");
  if (!root) return;
  const screens = { balances: balancesScreen, entry: entryScreen, pending: waitingScreen, settings: settingsScreen };
  const waiting = state.snapshot ? core.stillWaiting(state.snapshot, [...state.outbox, ...state.waiting]).length : 0;
  root.replaceChildren(...[
    h("header", {}, h("h1", {}, t(state.screen === "entry" ? "entry" : state.screen)),
      h("button", { class: "icon", title: t("refresh"), onclick: refresh }, "⟳")),
    state.message ? h("div", { class: `message ${state.message.kind}`, onclick: () => say(null) }, state.message.message) : null,
    h("main", {}, screens[state.screen]()),
    h("nav", {}, [["balances", "€"], ["entry", "+"], ["pending", "⏳"], ["settings", "⚙"]].map(([screen, icon]) =>
      h("button", { class: screen === state.screen ? "on" : "", onclick: () => { state.screen = screen; state.message = null; render(); } },
        h("span", { class: "glyph" }, icon), h("span", {}, t(screen)),
        screen === "pending" && waiting ? h("span", { class: "count" }, waiting) : null))),
  ].filter(Boolean));
}

const SPLASH_TIME = 4000;  // ms the start page stays from the opening (its fade in, 1.5 s, included), then it fades out (1.5 s)

function hideSplash(shownAt) {
  const splash = document.getElementById("splash");
  if (!splash) return;
  const version = document.getElementById("splash-version");
  if (version) version.textContent = core.VERSION;
  setTimeout(() => {
    splash.classList.add("gone");
    setTimeout(() => splash.remove(), 1600);
  }, Math.max(0, SPLASH_TIME - (Date.now() - shownAt)));
}

export function start() {
  const shownAt = performance.timeOrigin ? Math.round(performance.timeOrigin) : Date.now();
  render();
  hideSplash(shownAt);
  if (client()) refresh();
  else { state.screen = "settings"; render(); }
  window.addEventListener("online", () => client() && refresh());
  const secure = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  if ("serviceWorker" in navigator && secure) {
    // A new version of the page: checked at each opening and when the app comes back to the front; once it
    // is in place, the page reloads itself on it.
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((registration) => {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") { registration.update(); if (client()) refresh(); }
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
  }
}

export { state };
