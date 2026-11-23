// Account Manager Light — the logic, without the page (also run by the tests under Node).
//
// The snapshot comes from the main application (accounts with their balances, third parties, categories);
// the transactions entered here wait in the storage (pending) until the main application writes them.

export const VERSION = "0.76.1";  // shown in the settings: to check which version the phone runs

export const EXPENSE = "EXPENSE", INCOME = "INCOME", TRANSFER = "TRANSFER";
export const INVESTMENT = "INVESTMENT";

// ------------------------------------------------------------------ texts

export const TEXTS = {
  en: {
    balances: "Balances", entry: "New", pending: "Waiting", settings: "Settings",
    expense: "Expense", income: "Income", transfer: "Transfer",
    account: "Account", from: "From", to: "To", date: "Date", amount: "Amount", thirdParty: "Third party",
    category: "Category", comment: "Comment", save: "Save", none: "(none)", newThirdParty: "New name = new third party",
    asOf: "Balances of {date}", withWaiting: "with {count} transaction(s) waiting", total: "Total",
    noSnapshot: "No balances yet: in the main application, File › Synchronize with the mobile app, then ⟳ here.",
    saved: "Saved: it will be written by the main application when it starts.",
    savedOffline: "Kept on the phone: it will be sent when the network is back.",
    waitingTitle: "Waiting to be written by the main application", notSent: "Not sent yet",
    refusedTitle: "Refused by the main application", dismiss: "Dismiss", remove: "Delete",
    removeConfirm: "Delete this transaction?", nothingWaiting: "Nothing is waiting.",
    project: "Supabase project URL", anonKey: "Publishable key", email: "E-mail", password: "Password",
    signIn: "Sign in", signOut: "Sign out", signedInAs: "Signed in as {email}.", language: "Language",
    auto: "As the main application", refresh: "Refresh", version: "Version {version}", loading: "Loading…",
    setupFirst: "Set up the connection first (Settings).",
    errAmount: "Type an amount greater than zero.", errAccount: "Choose the account.",
    errAccounts: "Choose two different accounts.", errCurrency: "A transfer between two currencies is not possible here.",
    errDate: "Choose a date.", errOpened: "“{name}” was opened on {date}: nothing can be dated before.",
    errClosed: "“{name}” is closed.", errCategory: "This category does not fit this kind of transaction.",
    errNetwork: "The network or Supabase cannot be reached: {error}", subAccount: "sub-account",
  },
  fr: {
    balances: "Soldes", entry: "Saisie", pending: "En attente", settings: "Réglages",
    expense: "Dépense", income: "Recette", transfer: "Virement",
    account: "Compte", from: "Depuis", to: "Vers", date: "Date", amount: "Montant", thirdParty: "Tiers",
    category: "Catégorie", comment: "Commentaire", save: "Enregistrer", none: "(aucune)",
    newThirdParty: "Nouveau nom = nouveau tiers",
    asOf: "Soldes du {date}", withWaiting: "avec {count} transaction(s) en attente", total: "Total",
    noSnapshot: "Pas encore de soldes : dans l'application principale, Fichier › Synchroniser avec l'appli mobile, puis ⟳ ici.",
    saved: "Enregistrée : elle sera écrite par l'application principale à son démarrage.",
    savedOffline: "Gardée sur le téléphone : elle sera envoyée au retour du réseau.",
    waitingTitle: "En attente d'écriture par l'application principale", notSent: "Pas encore envoyée",
    refusedTitle: "Refusées par l'application principale", dismiss: "Retirer", remove: "Supprimer",
    removeConfirm: "Supprimer cette transaction ?", nothingWaiting: "Rien n'est en attente.",
    project: "URL du projet Supabase", anonKey: "Clé publishable", email: "E-mail", password: "Mot de passe",
    signIn: "Se connecter", signOut: "Se déconnecter", signedInAs: "Connecté en tant que {email}.", language: "Langue",
    auto: "Comme l'application principale", refresh: "Actualiser", version: "Version {version}", loading: "Chargement…",
    setupFirst: "Configurez d'abord la connexion (Réglages).",
    errAmount: "Saisissez un montant supérieur à zéro.", errAccount: "Choisissez le compte.",
    errAccounts: "Choisissez deux comptes différents.", errCurrency: "Un virement entre deux devises n'est pas possible ici.",
    errDate: "Choisissez une date.", errOpened: "« {name} » a été ouvert le {date} : rien ne peut être daté avant.",
    errClosed: "« {name} » est clôturé.", errCategory: "Cette catégorie ne convient pas à ce type de transaction.",
    errNetwork: "Le réseau ou Supabase est injoignable : {error}", subAccount: "sous-compte",
  },
};

export function t(lang, key, values = {}) {
  const text = (TEXTS[lang] || TEXTS.en)[key] ?? TEXTS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (all, name) => (name in values ? String(values[name]) : all));
}

/** The address of the project, whatever was copied (a path after it, or the address of the dashboard). */
export function projectUrl(text) {
  let value = String(text ?? "").trim();
  if (!value) return "";
  if (!value.includes("://")) value = "https://" + value;
  try {
    const url = new URL(value);
    const found = url.pathname.match(/\/project\/([a-z0-9]{10,})/);
    if (url.hostname.endsWith("supabase.com") && found) return `https://${found[1]}.supabase.co`;
    return url.origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

// --------------------------------------------------------------- amounts

/** "12,5" / "1 234.56" → 1250 / 123456 cents; null when it is not an amount. */
export function parseAmount(text) {
  const clean = String(text ?? "").replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [units, decimals = ""] = clean.split(".");
  return Number(units) * 100 + Number((decimals + "00").slice(0, 2));
}

export function formatAmount(cents, currency = "EUR", lang = "fr") {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency })
    .format(cents / 100);
}

export function formatDate(iso, lang = "fr") {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return lang === "fr" ? `${d}/${m}/${y}` : `${d}/${m}/${y}`;
}

export function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// -------------------------------------------------------------- accounts

export function accountsById(snapshot) {
  return new Map((snapshot?.accounts ?? []).map((a) => [a.id, a]));
}

/** The account and those above it, up to the real account. */
export function chain(snapshot, accountId) {
  const byId = accountsById(snapshot);
  const found = [];
  let account = byId.get(accountId);
  while (account) {
    found.push(account.id);
    account = account.parent_id == null ? null : byId.get(account.parent_id);
  }
  return found;
}

/** The transactions still to count: waiting here or in the storage, not yet in the balances of the snapshot. */
export function stillWaiting(snapshot, transactions) {
  const imported = new Set(snapshot?.imported ?? []);
  const seen = new Set();
  return transactions.filter((tx) => {
    if (!tx || imported.has(tx.id) || seen.has(tx.id)) return false;
    seen.add(tx.id);
    return true;
  });
}

/**
 * Balances of the snapshot with the transactions waiting: {id: {balance, consolidated}}.
 * The own balance moves on the account of the transaction; the consolidated balance on it and on every
 * account above it (a transfer inside a family cancels out on their common accounts).
 */
export function adjustedBalances(snapshot, transactions) {
  const result = new Map((snapshot?.accounts ?? []).map((a) => [a.id, { balance: a.balance, consolidated: a.consolidated }]));
  const move = (accountId, amount) => {
    if (!result.has(accountId)) return;
    result.get(accountId).balance += amount;
    for (const id of chain(snapshot, accountId)) result.get(id).consolidated += amount;
  };
  for (const tx of stillWaiting(snapshot, transactions)) {
    if (tx.kind === EXPENSE) move(tx.source_account_id, -tx.amount);
    else if (tx.kind === INCOME) move(tx.dest_account_id, tx.amount);
    else if (tx.kind === TRANSFER) {
      move(tx.source_account_id, -tx.amount);
      move(tx.dest_account_id, tx.amount);
    }
  }
  return result;
}

/** Accounts as shown: by banking institution, each real account followed by its sub-accounts (depth). */
export function accountTree(snapshot) {
  const accounts = (snapshot?.accounts ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const children = new Map();
  for (const a of accounts) {
    if (a.parent_id != null) {
      if (!children.has(a.parent_id)) children.set(a.parent_id, []);
      children.get(a.parent_id).push(a);
    }
  }
  const groups = new Map();
  for (const a of accounts.filter((x) => x.parent_id == null)) {
    const key = a.institution || "";
    if (!groups.has(key)) groups.set(key, []);
    const rows = groups.get(key);
    const add = (account, depth, ancestors) => {
      const kids = children.get(account.id) ?? [];
      rows.push({ account, depth, ancestors, hasChildren: kids.length > 0 });
      for (const child of kids) add(child, depth + 1, [...ancestors, account.id]);
    };
    add(a, 0, []);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([institution, rows]) => ({ institution, rows }));
}

/** The rows to show: those under a folded account are hidden (folded: a set of account ids). */
export function visibleRows(rows, folded) {
  return rows.filter((row) => !row.ancestors.some((id) => folded.has(id)));
}

/** Total of a banking institution: the consolidated balances of its real accounts, by currency. */
export function groupTotals(group, balances) {
  const totals = new Map();
  for (const { account } of group.rows) {
    if (account.parent_id == null) {
      totals.set(account.currency, (totals.get(account.currency) ?? 0) + balances.get(account.id).consolidated);
    }
  }
  return totals;
}

/** Folded at first: every account with sub-accounts (the phone shows the real accounts first). */
export function initiallyFolded(snapshot) {
  const parents = new Set((snapshot?.accounts ?? []).filter((a) => a.parent_id != null).map((a) => a.parent_id));
  return [...parents];
}

/** Accounts offered for a kind of transaction: open, real ones for an income or an expense. */
export function accountsFor(snapshot, kind) {
  return (snapshot?.accounts ?? [])
    .filter((a) => a.open && a.type !== INVESTMENT && (kind === TRANSFER || a.real))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function categoriesFor(snapshot, kind) {
  if (kind === TRANSFER) return (snapshot?.categories ?? []).slice().sort((a, b) => a.label.localeCompare(b.label));
  return (snapshot?.categories ?? []).filter((c) => c.kind === kind).sort((a, b) => a.label.localeCompare(b.label));
}

/** The default category of a third party for an expense or an income (null if none). */
export function defaultCategory(snapshot, thirdPartyName, kind) {
  const name = String(thirdPartyName ?? "").trim().toLowerCase();
  const party = (snapshot?.third_parties ?? []).find((p) => p.name.toLowerCase() === name);
  if (!party) return null;
  return kind === EXPENSE ? party.expense_category_id : kind === INCOME ? party.income_category_id : null;
}

/** The checks the main application will make, so that a refusal is rare: null, or [text key, values]. */
export function check(snapshot, tx) {
  const byId = accountsById(snapshot);
  if (!Number.isInteger(tx.amount) || tx.amount <= 0) return ["errAmount", {}];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date ?? "")) return ["errDate", {}];
  const ids = tx.kind === TRANSFER ? [tx.source_account_id, tx.dest_account_id]
    : [tx.kind === EXPENSE ? tx.source_account_id : tx.dest_account_id];
  if (ids.some((id) => !byId.has(id))) return ["errAccount", {}];
  if (tx.kind === TRANSFER) {
    if (ids[0] === ids[1]) return ["errAccounts", {}];
    if (byId.get(ids[0]).currency !== byId.get(ids[1]).currency) return ["errCurrency", {}];
  }
  for (const id of ids) {
    const a = byId.get(id);
    if (!a.open) return ["errClosed", { name: a.name }];
    if (a.opened_on && tx.date < a.opened_on) return ["errOpened", { name: a.name, date: a.opened_on }];
  }
  if (tx.category_id != null && tx.kind !== TRANSFER) {
    const category = (snapshot?.categories ?? []).find((c) => c.id === tx.category_id);
    if (!category || category.kind !== tx.kind) return ["errCategory", {}];
  }
  return null;
}

/** The file of a transaction entered here (read by the main application). */
export function transactionFile(kind, fields) {
  const tx = {
    id: fields.id ?? newId(), format: 1, created_at: new Date().toISOString(), kind,
    date: fields.date, amount: fields.amount, comment: (fields.comment ?? "").trim(),
    source_account_id: null, dest_account_id: null, third_party: null, category_id: fields.category_id ?? null,
  };
  if (kind === EXPENSE) tx.source_account_id = fields.account_id;
  else if (kind === INCOME) tx.dest_account_id = fields.account_id;
  else {
    tx.source_account_id = fields.source_account_id;
    tx.dest_account_id = fields.dest_account_id;
  }
  if (kind !== TRANSFER) tx.third_party = (fields.third_party ?? "").trim() || null;
  return tx;
}

/** Signed amount of a transaction for an account (negative when money leaves it). */
export function signedFor(tx) {
  return tx.kind === EXPENSE ? -tx.amount : tx.amount;
}
