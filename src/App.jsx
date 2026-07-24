import React, { useState, useEffect, useMemo } from "react";
import {
  Plus, Trash2, X, Settings2, Wallet, DollarSign, Coins, LineChart, Globe,
  Receipt, ArrowDownRight, ArrowUpRight, Download, Zap, Check, LogOut,
} from "lucide-react";
import { storage, signIn, signOut, currentSession } from "./supabaseStorage";

const PKR_SOURCES = [
  "Be Filing Salary",
  "Be Filing Profit Share",
  "Be Filing Commission",
  "Binance P2P",
  "Other",
];
const USD_SOURCES = ["Be Filing Salary", "Be Filing Profit Share", "Be Filing Commission", "Fiverr", "Other"];
const PKR_CHANNELS = ["NayaPay", "Bank Transfer", "Cash", "Other"];
const USD_CHANNELS = ["Payoneer", "Wise", "Bank Transfer", "Binance", "Other"];
const COINS = ["USDT", "BTC", "ETH", "BNB", "SOL", "Other"];
const MARKETS = ["US", "PSX", "Other"];

const EXPENSE_CATEGORIES = [
  "Rent", "Food & Groceries", "Utilities & Bills", "Internet & Mobile",
  "Transport & Fuel", "Health & Medical", "Education", "Shopping & Clothing",
  "Family Support", "Business Expense", "Software & Subscriptions",
  "Taxes & Fees", "Travel", "Entertainment", "Charity & Zakat",
  "Bank & Transfer Fees", "Repairs & Maintenance", "Other",
];

const EXPENSE_ACCOUNTS = ["PKR account", "USD account", "Binance"];

const INK = {
  "Be Filing Salary": "#1B4D3E",
  "Be Filing Profit Share": "#2E6E5A",
  "Be Filing Commission": "#4B8B72",
  Fiverr: "#8C6A2F",
  "Binance P2P": "#7A4E2D",
  Other: "#6B6B6B",
};

const EXPENSE_INK = {
  Rent: "#8B2E2E", "Food & Groceries": "#A34B2A", "Utilities & Bills": "#9C5B1F",
  "Internet & Mobile": "#7A5230", "Transport & Fuel": "#6E4B3A", "Health & Medical": "#A03A55",
  Education: "#4A5A8B", "Shopping & Clothing": "#8B5E8B", "Family Support": "#5E7A4A",
  "Business Expense": "#3F6B6B", "Software & Subscriptions": "#5A5A8B",
  "Taxes & Fees": "#7A3A3A", Travel: "#2E6E8B", Entertainment: "#8B6A2E",
  "Charity & Zakat": "#2E7A5A", "Bank & Transfer Fees": "#6B5B4B",
  "Repairs & Maintenance": "#7A6A3A", Other: "#6B6B6B",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/* A period is a real calendar month, e.g. "2026-03". Keeping the year means
   March 2026 and March 2027 never get added together. */
function periodOf(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "unknown";
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function periodLabel(p) {
  if (p === "unknown") return "No date";
  const [y, m] = p.split("-");
  return MONTHS[Number(m) - 1] + " " + y;
}
function periodShort(p) {
  if (p === "unknown") return "?";
  const [y, m] = p.split("-");
  return MONTHS[Number(m) - 1].slice(0, 3) + " '" + y.slice(2);
}
/* Every month from the earliest entry to the latest, with no gaps skipped. */
function periodRange(periods) {
  const real = periods.filter((p) => p !== "unknown").sort();
  if (real.length === 0) return [];
  const [sy, sm] = real[0].split("-").map(Number);
  const [ey, em] = real[real.length - 1].split("-").map(Number);
  const out = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(y + "-" + String(m).padStart(2, "0"));
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

const K = { pkr: "fin5:pkr", usd: "fin5:usd", crypto: "fin5:crypto", stocks: "fin5:stocks", rate: "fin5:rate", expenses: "fin5:expenses", opening: "fin5:opening", inbox: "fin5:inbox" };

const OPENING_DEFAULT = { pkr: 0, usd: 0, binance: 0, stocks: 0 };

/* ---- Quick capture ----
 *
 * Turns a line like "600 food" or "50 usd fiverr in" into a real entry.
 * Everything is a guess the person can correct before it is applied, so the
 * parser leans towards reading something rather than rejecting the line. */

const CATEGORY_WORDS = {
  rent: "Rent", food: "Food & Groceries", grocery: "Food & Groceries",
  groceries: "Food & Groceries", khana: "Food & Groceries",
  bill: "Utilities & Bills", bills: "Utilities & Bills",
  electricity: "Utilities & Bills", gas: "Utilities & Bills",
  internet: "Internet & Mobile", mobile: "Internet & Mobile",
  phone: "Internet & Mobile", load: "Internet & Mobile",
  fuel: "Transport & Fuel", petrol: "Transport & Fuel",
  transport: "Transport & Fuel", uber: "Transport & Fuel",
  careem: "Transport & Fuel", rickshaw: "Transport & Fuel",
  medical: "Health & Medical", doctor: "Health & Medical",
  medicine: "Health & Medical", health: "Health & Medical",
  education: "Education", school: "Education", tuition: "Education",
  shopping: "Shopping & Clothing", clothes: "Shopping & Clothing",
  family: "Family Support", home: "Family Support",
  business: "Business Expense", office: "Business Expense",
  software: "Software & Subscriptions", subscription: "Software & Subscriptions",
  tax: "Taxes & Fees", travel: "Travel",
  entertainment: "Entertainment", movie: "Entertainment",
  charity: "Charity & Zakat", zakat: "Charity & Zakat",
  bank: "Bank & Transfer Fees", repair: "Repairs & Maintenance",
};

const SOURCE_WORDS = {
  salary: "Be Filing Salary", profit: "Be Filing Profit Share",
  commission: "Be Filing Commission", fiverr: "Fiverr",
  p2p: "Binance P2P",
};

function parseLine(text, defaultDate) {
  const raw = text.trim();
  if (!raw) return null;

  const words = raw.toLowerCase().split(/\s+/);

  const amountMatch = raw.match(/(\d[\d,]*\.?\d*)/);
  if (!amountMatch) return { error: "No amount found", raw };
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return { error: "Amount must be more than zero", raw };

  const hasUsd = words.some((w) => ["usd", "dollar", "dollars"].includes(w.replace(/[^a-z]/g, ""))) || raw.includes("$");
  const hasUsdt = words.some((w) => ["usdt", "binance"].includes(w.replace(/[^a-z]/g, "")));
  const isIncome = words.some((w) => ["in", "income", "received", "aya", "aaya", "mila"].includes(w.replace(/[^a-z]/g, "")));

  let category = null, source = null;
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, "");
    if (!category && CATEGORY_WORDS[clean]) category = CATEGORY_WORDS[clean];
    if (!source && SOURCE_WORDS[clean]) source = SOURCE_WORDS[clean];
  }
  /* "binance" only means income when the line also says money came in,
     otherwise it is USDT being spent. */
  if (!source && isIncome && hasUsdt) source = "Binance P2P";

  const note = raw.replace(amountMatch[0], "").trim().replace(/\s+/g, " ");

  if (source || (isIncome && !hasUsdt)) {
    return {
      type: "income", amount, date: defaultDate,
      currency: hasUsd ? "USD" : "PKR",
      source: source || "Other",
      channel: hasUsd ? "Payoneer" : "NayaPay",
      notes: note, raw,
    };
  }

  return {
    type: "expense", amount, date: defaultDate,
    account: hasUsdt ? "Binance" : hasUsd ? "USD account" : "PKR account",
    category: category || "Other", notes: note, raw,
  };
}

const fmtPKR = (n) => "Rs " + Math.round(n || 0).toLocaleString("en-US");
const fmtUSD = (n) => "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n, d = 4) => (n || 0).toLocaleString("en-US", { maximumFractionDigits: d });
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now() + "-" + Math.random().toString(36).slice(2, 7);

const FIELD = "w-full px-3 py-2 rounded-md border border-stone-300 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800 focus:border-transparent";
const LABEL = "block text-[11px] uppercase tracking-widest text-stone-500 mb-1.5";
const BTN = "px-4 py-2 text-sm rounded-md bg-emerald-900 text-white hover:bg-emerald-800 transition";
const GHOST = "px-3 py-2 text-sm rounded-md border border-stone-300 bg-white hover:bg-stone-50 transition";

function FinanceTracker({ onSignOut }) {
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [storageDown, setStorageDown] = useState(false);
  const [error, setError] = useState("");

  const [pkrTx, setPkrTx] = useState([]);
  const [usdTx, setUsdTx] = useState([]);
  const [crypto, setCrypto] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [rate, setRate] = useState(280);
  const [showRate, setShowRate] = useState(false);
  const [rateDraft, setRateDraft] = useState("280");
  const [opening, setOpening] = useState({ pkr: 7916, usd: 3627, binance: 1605, stocks: 0 });
  const [showOpening, setShowOpening] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [backupDraft, setBackupDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [openingDraft, setOpeningDraft] = useState({ pkr: "7916", usd: "3627", binance: "1605", stocks: "0" });

  useEffect(() => {
    (async () => {
      /* Ask which keys exist first. Without this, a first visit (nothing saved
         yet) looks exactly like a read failure, and the app wrongly refuses to
         save. Only a key that IS present but won't load is a real problem. */
      let known = null;
      try {
        const r = await storage.list("fin5:");
        if (r && Array.isArray(r.keys)) known = new Set(r.keys);
      } catch (e) {
        /* Listing itself failed. Treat every key as unknown and stay optimistic:
           a wrong warning that blocks saving is worse than no warning. */
        known = null;
      }

      const failed = [];
      const load = async (key, setter, name) => {
        if (known && !known.has(key)) return; // nothing saved under this key yet
        try {
          const r = await storage.get(key);
          if (r && r.value) {
            const parsed = JSON.parse(r.value);
            if (Array.isArray(parsed)) setter(parsed);
            else if (known) failed.push(name);
          }
        } catch (e) {
          /* Only complain when the key was listed as present. */
          if (known) failed.push(name);
        }
      };
      await load(K.pkr, setPkrTx, "PKR payments");
      await load(K.usd, setUsdTx, "USD payments");
      await load(K.crypto, setCrypto, "Binance trades");
      await load(K.stocks, setStocks, "stock holdings");
      await load(K.expenses, setExpenses, "expenses");
      await load(K.inbox, setInbox, "quick notes");
      try {
        const r = await storage.get(K.opening);
        if (r && r.value) {
          const saved = { ...OPENING_DEFAULT, ...JSON.parse(r.value) };
          setOpening(saved);
          setOpeningDraft({
            pkr: String(saved.pkr), usd: String(saved.usd),
            binance: String(saved.binance), stocks: String(saved.stocks),
          });
        }
      } catch (e) { /* keep the starting figures */ }
      try {
        const r = await storage.get(K.rate);
        if (r && r.value) { setRate(Number(r.value)); setRateDraft(String(r.value)); }
      } catch (e) { /* keep 280 */ }
      if (failed.length > 0) {
        setLoadFailed(true);
        setError(
          "Saved records exist for your " + failed.join(", ") + " but could not be read. " +
          "Nothing new will be saved until you reload, so that this cannot overwrite them. " +
          "Reload the page, and if it happens again, restore from a backup."
        );
      }
      setLoading(false);
    })();
  }, []);

  /* Storage calls can fail on a flaky connection. Retry a few times with a
     growing pause before giving up. */
  /* Storage can be unavailable in some environments. When it is, entries still
     work for the session and the Backup text is the way to keep them, so a
     failed write must never throw the entry away. */
  async function writeWithRetry(key, value, tries = 3) {
    let lastError;
    setSaveState("saving");
    for (let i = 0; i < tries; i++) {
      try {
        await storage.set(key, value);
        setSaveState("saved");
        setStorageDown(false);
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
        return true;
      } catch (e) {
        lastError = e;
        if (i < tries - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    console.error("Could not save " + key, lastError);
    setSaveState("failed");
    setStorageDown(true);
    return false;
  }

  async function save(key, next, setter, previous) {
    if (loadFailed) {
      return setError(
        "Not saving, because your existing records could not be loaded and this would replace them. " +
        "Reload the page first."
      );
    }
    setter(next);
    setError("");
    const ok = await writeWithRetry(key, JSON.stringify(next));
    /* The entry stays on screen either way. Undoing it would lose work that
       the person can still rescue through Backup. */
    return ok;
  }

  async function saveRate() {
    const v = Number(rateDraft);
    if (!v || v <= 0) return setError("Enter a rate greater than zero.");
    setRate(v); setShowRate(false); setError("");
    const ok = await writeWithRetry(K.rate, String(v));
    /* storageDown panel already explains the situation */
  }

  async function saveOpening() {
    const next = {
      pkr: Number(openingDraft.pkr) || 0,
      usd: Number(openingDraft.usd) || 0,
      binance: Number(openingDraft.binance) || 0,
      stocks: Number(openingDraft.stocks) || 0,
    };
    setOpening(next); setShowOpening(false); setError("");
    const ok = await writeWithRetry(K.opening, JSON.stringify(next));
    /* storageDown panel already explains the situation */
  }

  function makeBackup() {
    return JSON.stringify({
      version: 1, exported: new Date().toISOString(),
      opening, rate, pkr: pkrTx, usd: usdTx, crypto, stocks, expenses, inbox,
    }, null, 2);
  }

  async function restoreBackup() {
    let data;
    try { data = JSON.parse(backupDraft); }
    catch (e) { return setError("That backup text isn't valid. Paste the whole thing, including the braces."); }
    if (!data || typeof data !== "object") return setError("That backup text isn't in the right shape.");

    const arr = (v) => (Array.isArray(v) ? v : []);
    const nextPkr = arr(data.pkr), nextUsd = arr(data.usd);
    const nextCrypto = arr(data.crypto), nextStocks = arr(data.stocks), nextExpenses = arr(data.expenses);
    const nextInbox = arr(data.inbox);
    const nextOpening = { ...OPENING_DEFAULT, ...(data.opening || {}) };
    const nextRate = Number(data.rate) > 0 ? Number(data.rate) : rate;

    setPkrTx(nextPkr); setUsdTx(nextUsd); setCrypto(nextCrypto);
    setStocks(nextStocks); setExpenses(nextExpenses); setInbox(nextInbox);
    setOpening(nextOpening); setRate(nextRate);
    setOpeningDraft({
      pkr: String(nextOpening.pkr), usd: String(nextOpening.usd),
      binance: String(nextOpening.binance), stocks: String(nextOpening.stocks),
    });
    setRateDraft(String(nextRate));
    setShowBackup(false); setBackupDraft(""); setError("");

    const writes = await Promise.all([
      writeWithRetry(K.pkr, JSON.stringify(nextPkr)),
      writeWithRetry(K.usd, JSON.stringify(nextUsd)),
      writeWithRetry(K.crypto, JSON.stringify(nextCrypto)),
      writeWithRetry(K.stocks, JSON.stringify(nextStocks)),
      writeWithRetry(K.expenses, JSON.stringify(nextExpenses)),
      writeWithRetry(K.inbox, JSON.stringify(nextInbox)),
      writeWithRetry(K.opening, JSON.stringify(nextOpening)),
      writeWithRetry(K.rate, String(nextRate)),
    ]);
    if (writes.some((ok) => !ok)) {
      setError(
        "Your backup is showing on screen and the totals are correct, but it could not be stored " +
        "on this device. Keep your backup text safe."
      );
    }
  }

  /* Moves a parsed note into the real account it belongs to, then drops it
     from the inbox. Written as one batch so a half-applied list can't happen. */
  async function applyInbox(items) {
    if (loadFailed) {
      return setError("Not filing anything, because your records could not be loaded. Reload first.");
    }
    const nextPkr = [...pkrTx], nextUsd = [...usdTx], nextExp = [...expenses];

    items.forEach((it) => {
      if (it.type === "income") {
        const row = {
          id: uid(), date: it.date, amount: it.amount,
          source: it.source, channel: it.channel, notes: it.notes,
        };
        if (it.currency === "USD") nextUsd.unshift(row);
        else nextPkr.unshift(row);
      } else {
        nextExp.unshift({
          id: uid(), date: it.date, amount: it.amount,
          category: it.category, account: it.account, notes: it.notes,
        });
      }
    });

    const ids = new Set(items.map((i) => i.id));
    const nextInbox = inbox.filter((i) => !ids.has(i.id));

    setError("");

    setPkrTx(nextPkr); setUsdTx(nextUsd); setExpenses(nextExp);

    const okPkr = await writeWithRetry(K.pkr, JSON.stringify(nextPkr));
    const okUsd = await writeWithRetry(K.usd, JSON.stringify(nextUsd));
    const okExp = await writeWithRetry(K.expenses, JSON.stringify(nextExp));

    /* If storage is down the notes stay in the waiting list, so they are
       visible in two places rather than lost from both. */
    if (okPkr && okUsd && okExp) {
      setInbox(nextInbox);
      await writeWithRetry(K.inbox, JSON.stringify(nextInbox));
    }
  }

  /* ---- totals ---- */
  const pkrIncome = useMemo(() => opening.pkr + pkrTx.reduce((a, e) => a + e.amount, 0), [pkrTx, opening.pkr]);
  const usdIncome = useMemo(() => opening.usd + usdTx.reduce((a, e) => a + e.amount, 0), [usdTx, opening.usd]);

  const expenseStats = useMemo(() => {
    let pkr = 0, usd = 0, binance = 0;
    expenses.forEach((e) => {
      if (e.account === "PKR account") pkr += e.amount;
      else if (e.account === "USD account") usd += e.amount;
      else binance += e.amount;
    });
    return { pkr, usd, binance, list: expenses };
  }, [expenses]);

  const pkrTotal = pkrIncome - expenseStats.pkr;
  const usdTotal = usdIncome - expenseStats.usd;

  const cryptoStats = useMemo(() => {
    const byCoin = {};
    let usdReceived = 0, usdtSold = 0;
    crypto.forEach((t) => {
      if (!byCoin[t.coin]) byCoin[t.coin] = { coin: t.coin, qty: 0 };
      if (t.type === "buy") byCoin[t.coin].qty += t.qty;
      else {
        byCoin[t.coin].qty -= t.qty;
        usdReceived += t.qty;
        if (t.coin === "USDT") usdtSold += t.qty;
      }
    });
    const rawUsdt = opening.binance + (byCoin.USDT ? byCoin.USDT.qty : 0);
    const netUsdt = rawUsdt - expenseStats.binance;
    const holdings = Object.values(byCoin)
      .map((h) => (h.coin === "USDT" ? { ...h, qty: netUsdt } : h))
      .filter((h) => Math.abs(h.qty) > 0.000001);
    if (opening.binance > 0 && !byCoin.USDT) holdings.unshift({ coin: "USDT", qty: netUsdt });
    return { holdings, usdReceived, usdtSold, usdtQty: netUsdt, usdtSpent: expenseStats.binance };
  }, [crypto, expenseStats.binance, opening.binance]);

  const stockStats = useMemo(() => {
    let cost = opening.stocks, value = opening.stocks;
    const rows = stocks.map((s) => {
      const c = s.qty * s.buyPrice;
      const v = s.qty * (s.currentPrice || s.buyPrice);
      cost += c; value += v;
      return { ...s, cost: c, value: v, pl: v - c, plPct: c > 0 ? ((v - c) / c) * 100 : 0 };
    });
    return { rows, cost, value, pl: value - cost, plPct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
  }, [stocks, opening.stocks]);

  const allUsd = useMemo(() => {
    const grossIncome = pkrIncome / rate + usdIncome;
    const spentUsd = expenseStats.pkr / rate + expenseStats.usd + expenseStats.binance;
    const income = pkrTotal / rate + usdTotal;
    const assets = cryptoStats.usdtQty + stockStats.value;
    return {
      pkrAsUsd: pkrTotal / rate, usdIncome: usdTotal, income, grossIncome, spentUsd,
      crypto: cryptoStats.usdtQty, stocks: stockStats.value, assets, grand: income + assets,
    };
  }, [pkrIncome, usdIncome, pkrTotal, usdTotal, rate, cryptoStats, stockStats, expenseStats]);

  const thisMonth = useMemo(() => {
    const now = new Date();
    const p = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const inP = (r) => periodOf(r.date) === p;

    const pkrRows = pkrTx.filter(inP);
    const usdRows = usdTx.filter(inP);
    const expRows = expenses.filter(inP);

    const pkrIn = pkrRows.reduce((a, e) => a + e.amount, 0);
    const usdIn = usdRows.reduce((a, e) => a + e.amount, 0);

    let pkrOut = 0, usdOut = 0, binOut = 0;
    expRows.forEach((e) => {
      if (e.account === "PKR account") pkrOut += e.amount;
      else if (e.account === "USD account") usdOut += e.amount;
      else binOut += e.amount;
    });

    const earned = pkrIn / rate + usdIn;
    const spent = pkrOut / rate + usdOut + binOut;

    return {
      period: p, label: periodLabel(p),
      pkrIn, usdIn, pkrOut, usdOut, binOut,
      earned, spent, net: earned - spent,
      count: pkrRows.length + usdRows.length + expRows.length,
    };
  }, [pkrTx, usdTx, expenses, rate]);

  const TABS = [
    { id: "all", label: "All in USD", icon: Globe },
    { id: "quick", label: inbox.length > 0 ? "Quick add (" + inbox.length + ")" : "Quick add", icon: Zap },
    { id: "pkr", label: "PKR account", icon: Wallet },
    { id: "usd", label: "USD account", icon: DollarSign },
    { id: "crypto", label: "Binance", icon: Coins },
    { id: "stocks", label: "Stocks", icon: LineChart },
    { id: "expenses", label: "Expenses", icon: Receipt },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <p className="text-stone-500 text-sm tracking-widest uppercase">Loading your accounts</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="max-w-5xl mx-auto px-5 py-8 sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b-2 border-stone-900">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-900 mb-1">Abuzar · 2026</p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Every account, one page</h1>
            {saveState !== "idle" && (
              <p className={"text-[11px] mt-1.5 " +
                (saveState === "failed" ? "text-red-700"
                  : saveState === "saved" ? "text-emerald-800" : "text-stone-500")}>
                {saveState === "saving" ? "Saving…"
                  : saveState === "saved" ? "Saved" : "This session only"}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowOpening(true)} className={"flex items-center gap-2 " + GHOST}>
              <Wallet size={15} />
              Balances
            </button>
            <button onClick={() => { setBackupDraft(""); setCopied(false); setShowBackup(true); }}
              className={"flex items-center gap-2 " + GHOST}>
              <Download size={15} />
              Backup
            </button>
            <button onClick={() => setShowRate(true)} className={"flex items-center gap-2 " + GHOST}>
              <Settings2 size={15} />
              {rate} PKR/USD
            </button>
            <button onClick={onSignOut} aria-label="Sign out" className={"flex items-center gap-2 " + GHOST}>
              <LogOut size={15} />
            </button>
          </div>
        </header>

        <nav className="flex gap-1 mt-5 p-1 bg-stone-200 rounded-md overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={"flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm rounded transition whitespace-nowrap " +
                (tab === t.id ? "bg-white text-emerald-950 font-medium shadow-sm" : "text-stone-600 hover:text-stone-900")}>
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </nav>

        {error && (
          <div className="mt-4 px-4 py-3 rounded-md bg-amber-50 border border-amber-300 text-sm text-amber-900">
            <div className="flex justify-between gap-3">
              <span>{error}</span>
              <button onClick={() => setError("")} className="shrink-0 underline">Dismiss</button>
            </div>
            {loadFailed && (
              <button
                onClick={() => { setLoadFailed(false); setError(""); }}
                className="mt-3 px-3 py-1.5 text-[12px] rounded border border-amber-400 bg-white hover:bg-amber-100 transition">
                Nothing was saved before — let me use the app
              </button>
            )}
          </div>
        )}

        {storageDown ? (
          <div className="mt-4 px-4 py-4 rounded-md bg-red-50 border border-red-300">
            <p className="text-sm font-medium text-red-900">
              This page cannot save to your device
            </p>
            <p className="text-[12px] text-red-800 mt-1.5 leading-relaxed">
              Your entries still work and the totals are correct, but they will be gone when this page
              closes. Copy the text below and keep it somewhere safe. Paste it back under Backup next
              time, or when the app is set up on your own hosting.
            </p>
            <textarea readOnly value={makeBackup()} rows={5}
              onFocus={(e) => e.target.select()}
              className={FIELD + " mt-3 font-mono text-[10px] leading-relaxed resize-none"} />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(makeBackup())
                  .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
                  .catch(() => setError("Couldn't copy. Tap the text above and copy it by hand."));
              }}
              className={"w-full mt-2 " + GHOST}>
              {copied ? "Copied" : "Copy everything"}
            </button>
          </div>
        ) : (
          <div className="mt-4 px-4 py-3 rounded-md bg-stone-200 border border-stone-300 text-[12px] text-stone-700 flex flex-wrap items-center justify-between gap-2">
            <span>
              Before this app gets rebuilt or updated, press Backup and keep a copy. A rebuild reloads
              the app, and a copy is the only way to be sure nothing is lost.
            </span>
            <button onClick={() => { setBackupDraft(""); setCopied(false); setShowBackup(true); }}
              className="shrink-0 underline font-medium">
              Back up now
            </button>
          </div>
        )}

        {tab === "all" && (
          <AllInUsd rate={rate} totals={allUsd} pkrTotal={pkrTotal} usdTotal={usdTotal}
            stockStats={stockStats} cryptoStats={cryptoStats} expenseStats={expenseStats}
            thisMonth={thisMonth} go={setTab}
            counts={{ pkr: pkrTx.length, usd: usdTx.length, crypto: crypto.length, stocks: stocks.length, expenses: expenses.length }} />
        )}
        {tab === "quick" && (
          <QuickAdd inbox={inbox} rate={rate}
            onQueue={(items) => save(K.inbox, [...items, ...inbox], setInbox, inbox)}
            onApply={applyInbox}
            onDrop={(id) => save(K.inbox, inbox.filter((i) => i.id !== id), setInbox, inbox)}
            setError={setError} />
        )}
        {tab === "pkr" && (
          <CashAccount currency="PKR" title="PKR account" sub="Money received in rupees, minus what you spent."
            sources={PKR_SOURCES} channels={PKR_CHANNELS} fmt={fmtPKR} rows={pkrTx}
            income={pkrIncome} spent={expenseStats.pkr} total={pkrTotal} opening={opening.pkr}
            secondary={"= " + fmtUSD(pkrTotal / rate) + " at " + rate}
            onAdd={(e) => save(K.pkr, [e, ...pkrTx], setPkrTx, pkrTx)}
            onDelete={(id) => save(K.pkr, pkrTx.filter((x) => x.id !== id), setPkrTx, pkrTx)}
            setError={setError} />
        )}
        {tab === "usd" && (
          <CashAccount currency="USD" title="USD account" sub="Money received in dollars, minus what you spent."
            sources={USD_SOURCES} channels={USD_CHANNELS} fmt={fmtUSD} rows={usdTx}
            income={usdIncome} spent={expenseStats.usd} total={usdTotal} opening={opening.usd}
            secondary={"= " + fmtPKR(usdTotal * rate) + " at " + rate}
            onAdd={(e) => save(K.usd, [e, ...usdTx], setUsdTx, usdTx)}
            onDelete={(id) => save(K.usd, usdTx.filter((x) => x.id !== id), setUsdTx, usdTx)}
            setError={setError} />
        )}
        {tab === "crypto" && (
          <CryptoAccount trades={crypto} stats={cryptoStats}
            onAdd={(e) => save(K.crypto, [e, ...crypto], setCrypto, crypto)}
            onDelete={(id) => save(K.crypto, crypto.filter((x) => x.id !== id), setCrypto, crypto)}
            setError={setError} />
        )}
        {tab === "stocks" && (
          <StockAccount stats={stockStats}
            onAdd={(e) => save(K.stocks, [e, ...stocks], setStocks, stocks)}
            onUpdate={(id, p) => save(K.stocks, stocks.map((s) => (s.id === id ? { ...s, currentPrice: p } : s)), setStocks, stocks)}
            onDelete={(id) => save(K.stocks, stocks.filter((x) => x.id !== id), setStocks, stocks)}
            setError={setError} />
        )}
        {tab === "expenses" && (
          <ExpenseAccount rows={expenses} stats={expenseStats} rate={rate}
            onAdd={(e) => save(K.expenses, [e, ...expenses], setExpenses, expenses)}
            onDelete={(id) => save(K.expenses, expenses.filter((x) => x.id !== id), setExpenses, expenses)}
            setError={setError} />
        )}

        <p className="mt-12 pt-6 border-t border-stone-300 text-[11px] text-stone-400">
          Each account starts from the balance set under Balances, and every payment adds to it while
          every expense is subtracted from the account you charged it to. Stocks and USDT are counted in
          dollars directly. Only the PKR account converts, at {rate} PKR per USD. Records are saved here
          between visits.
        </p>
      </div>

      {showRate && (
        <Modal title="Exchange rate" onClose={() => setShowRate(false)}>
          <div>
            <label className={LABEL}>PKR per 1 USD</label>
            <input type="number" inputMode="decimal" value={rateDraft}
              onChange={(e) => setRateDraft(e.target.value)} className={FIELD} />
            <p className="text-[11px] text-stone-500 mt-2">
              Used only to show the PKR account in dollars. Check Google and update it when the rate
              moves.
            </p>
          </div>
          <button onClick={saveRate} className={"w-full " + BTN}>Save rate</button>
        </Modal>
      )}

      {showOpening && (
        <Modal title="Starting balances" onClose={() => setShowOpening(false)}>
          <p className="text-[11px] text-stone-500">
            These are the amounts already sitting in each account before you started logging here.
            Everything you add afterwards is counted on top of these figures.
          </p>
          <div>
            <label className={LABEL}>PKR account (Rs)</label>
            <input type="number" inputMode="decimal" value={openingDraft.pkr}
              onChange={(e) => setOpeningDraft({ ...openingDraft, pkr: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>USD account ($)</label>
            <input type="number" inputMode="decimal" value={openingDraft.usd}
              onChange={(e) => setOpeningDraft({ ...openingDraft, usd: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Binance (USDT)</label>
            <input type="number" inputMode="decimal" value={openingDraft.binance}
              onChange={(e) => setOpeningDraft({ ...openingDraft, binance: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Stocks ($)</label>
            <input type="number" inputMode="decimal" value={openingDraft.stocks}
              onChange={(e) => setOpeningDraft({ ...openingDraft, stocks: e.target.value })} className={FIELD} />
          </div>
          <button onClick={saveOpening} className={"w-full " + BTN}>Save balances</button>
        </Modal>
      )}

      {showBackup && (
        <Modal title="Backup and restore" onClose={() => setShowBackup(false)}>
          <p className="text-[11px] text-stone-500">
            Everything is already saved on this device. This is a spare copy in case you switch phone or
            clear your browser. Copy the text below and keep it somewhere safe, like a note to yourself.
          </p>
          <div>
            <label className={LABEL}>Your data</label>
            <textarea readOnly value={makeBackup()} rows={7}
              onFocus={(e) => e.target.select()}
              className={FIELD + " font-mono text-[10px] leading-relaxed resize-none"} />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(makeBackup())
                  .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
                  .catch(() => setError("Couldn't copy. Select the text and copy it by hand."));
              }}
              className={"w-full mt-2 " + GHOST}>
              {copied ? "Copied" : "Copy backup"}
            </button>
          </div>
          <div className="pt-4 border-t border-stone-200">
            <label className={LABEL}>Restore from a backup</label>
            <textarea value={backupDraft} onChange={(e) => setBackupDraft(e.target.value)} rows={4}
              placeholder="Paste a backup here"
              className={FIELD + " font-mono text-[10px] leading-relaxed resize-none"} />
            <p className="text-[11px] text-stone-500 mt-2">
              Restoring replaces everything currently in the app with what you paste. Copy your current
              backup first if you want to be able to come back to it.
            </p>
            <button onClick={restoreBackup} disabled={!backupDraft.trim()}
              className={"w-full mt-3 " + BTN + (backupDraft.trim() ? "" : " opacity-40 cursor-not-allowed")}>
              Restore this backup
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============ QUICK ADD ============ */

function QuickAdd({ inbox, rate, onQueue, onApply, onDrop, setError }) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(today());

  const preview = useMemo(
    () => text.split("\n").map((l) => parseLine(l, date)).filter(Boolean),
    [text, date]
  );
  const good = preview.filter((p) => !p.error);
  const bad = preview.filter((p) => p.error);

  function queue() {
    if (good.length === 0) return setError("Nothing to save yet. Write a line like: 600 food");
    setError("");
    onQueue(good.map((g) => ({ ...g, id: uid() })));
    setText("");
  }

  const describe = (it) =>
    it.type === "income"
      ? "Money in · " + it.source + " · " + (it.currency === "USD" ? fmtUSD(it.amount) : fmtPKR(it.amount))
      : "Spent · " + it.category + " · " +
        (it.account === "PKR account" ? fmtPKR(it.amount)
          : it.account === "USD account" ? fmtUSD(it.amount)
          : num(it.amount, 2) + " USDT");

  return (
    <>
      <div className="mt-8">
        <h2 className="text-xl font-semibold tracking-tight">Quick add</h2>
        <p className="text-sm text-stone-500 mt-0.5">
          Write it now, file it later. Works well on a phone.
        </p>
      </div>

      <section className="mt-6 border border-stone-300 bg-stone-50 px-5 py-5">
        <label className={LABEL}>What happened</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
          placeholder={"600 food\n1200 petrol\n50 usd fiverr in"}
          className={FIELD + " resize-none leading-relaxed"} />

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[150px]">
            <label className={LABEL}>Date for these</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
          </div>
          <button onClick={queue} className={BTN + " shrink-0"}>Save these</button>
        </div>

        <p className="text-[11px] text-stone-500 mt-3">
          One per line: the amount, then what it was. Add <strong>usd</strong> for dollars,
          <strong> usdt</strong> for Binance, and <strong>in</strong> when money came to you.
        </p>
      </section>

      {preview.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-3">
            How this reads
          </h2>
          <div className="border border-stone-300 rounded-md overflow-hidden bg-white">
            {preview.map((p, i) => (
              <div key={i} className={"px-4 py-3 " + (i > 0 ? "border-t border-stone-200" : "")}>
                <p className="text-[11px] text-stone-400 truncate">{p.raw}</p>
                {p.error ? (
                  <p className="text-sm text-red-700 mt-0.5">{p.error}</p>
                ) : (
                  <p className="text-sm text-stone-900 mt-0.5">{describe(p)}</p>
                )}
              </div>
            ))}
          </div>
          {bad.length > 0 && (
            <p className="text-[11px] text-stone-500 mt-2">
              Lines with a problem are skipped. Every line needs a number in it.
            </p>
          )}
        </section>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500">
            Waiting to be filed
          </h2>
          {inbox.length > 0 && (
            <button onClick={() => onApply(inbox)} className={"flex items-center gap-2 " + BTN}>
              <Check size={15} />
              File all {inbox.length}
            </button>
          )}
        </div>

        {inbox.length === 0 ? (
          <div className="border border-dashed border-stone-300 rounded-lg px-6 py-12 text-center bg-white">
            <Zap size={26} className="mx-auto text-stone-300" />
            <p className="mt-3 text-stone-700 font-medium">Nothing waiting</p>
            <p className="mt-1 text-sm text-stone-500 max-w-sm mx-auto">
              Jot things down here through the day. They stay put until you file them into your
              accounts.
            </p>
          </div>
        ) : (
          <>
            <div className="border border-stone-300 rounded-md overflow-hidden bg-white">
              {inbox.map((it, i) => (
                <div key={it.id}
                  className={"flex items-center gap-3 px-4 py-3 group hover:bg-stone-50 transition " +
                    (i > 0 ? "border-t border-stone-200" : "")}>
                  <div className="w-1 h-9 rounded-full shrink-0"
                    style={{ backgroundColor: it.type === "income" ? "#1B4D3E" : "#8B2E2E" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-stone-900 truncate">{describe(it)}</p>
                    <p className="text-[11px] text-stone-500 truncate">{it.date} · {it.raw}</p>
                  </div>
                  <button onClick={() => onApply([it])}
                    className="px-2 py-1 text-[11px] rounded border border-emerald-800 text-emerald-900 hover:bg-emerald-50 transition shrink-0">
                    File
                  </button>
                  <button onClick={() => onDrop(it.id)} aria-label="Remove this note"
                    className="p-1.5 rounded text-stone-300 hover:text-red-600 hover:bg-red-50 transition shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-stone-500 mt-3">
              These are saved and will still be here next time. Filing moves them into your accounts,
              where the totals pick them up.
            </p>
          </>
        )}
      </section>
    </>
  );
}

/* ============ OVERVIEW: NOW / THIS MONTH / ALL TIME ============ */

function AllInUsd({ rate, totals, pkrTotal, usdTotal, stockStats, cryptoStats, expenseStats, thisMonth, go, counts }) {
  const [view, setView] = useState("now");
  const empty = counts.pkr + counts.usd + counts.crypto + counts.stocks + counts.expenses === 0
    && totals.grand === 0;

  const views = [
    { id: "now", label: "What I have now" },
    { id: "month", label: thisMonth.label },
    { id: "all", label: "All time" },
  ];

  return (
    <>
      <div className="mt-8 flex gap-2 overflow-x-auto pb-1">
        {views.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={"px-3.5 py-2 text-xs rounded-full border whitespace-nowrap shrink-0 transition " +
              (view === v.id
                ? "bg-emerald-900 border-emerald-900 text-white"
                : "bg-white border-stone-300 text-stone-600 hover:border-stone-400")}>
            {v.label}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="mt-6 border border-dashed border-stone-300 rounded-lg px-6 py-14 text-center bg-white">
          <Globe size={28} className="mx-auto text-stone-300" />
          <p className="mt-4 text-stone-700 font-medium">Nothing recorded yet</p>
          <p className="mt-1 text-sm text-stone-500 max-w-md mx-auto">
            Set your starting balances from the Balances button, or pick an account above and add your
            first entry.
          </p>
        </div>
      ) : view === "now" ? (
        <NowView rate={rate} totals={totals} pkrTotal={pkrTotal} usdTotal={usdTotal}
          stockStats={stockStats} cryptoStats={cryptoStats} expenseStats={expenseStats} go={go} />
      ) : view === "month" ? (
        <MonthView rate={rate} m={thisMonth} go={go} />
      ) : (
        <AllTimeView rate={rate} totals={totals} stockStats={stockStats} expenseStats={expenseStats} go={go} />
      )}
    </>
  );
}

/* ---- 1. What I have right now ---- */

function NowView({ rate, totals, pkrTotal, usdTotal, stockStats, cryptoStats, expenseStats, go }) {
  const parts = [
    { label: "PKR account", usd: totals.pkrAsUsd, note: fmtPKR(pkrTotal), tab: "pkr", ink: "#1B4D3E" },
    { label: "USD account", usd: totals.usdIncome, note: fmtUSD(usdTotal), tab: "usd", ink: "#2E6E5A" },
    { label: "Binance", usd: totals.crypto, note: num(cryptoStats.usdtQty) + " USDT", tab: "crypto", ink: "#7A4E2D" },
    { label: "Stocks", usd: totals.stocks, note: "at the prices you entered", tab: "stocks", ink: "#8C6A2F" },
  ];
  const max = Math.max(...parts.map((p) => Math.max(p.usd, 0)), 1);

  return (
    <>
      <section className="mt-4 border border-stone-300 bg-stone-50 px-5 py-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Total I have right now</p>
        <p className="text-4xl sm:text-5xl font-semibold mt-2 tabular-nums text-emerald-950 break-words">
          {fmtUSD(totals.grand)}
        </p>
        <p className="text-sm text-stone-500 mt-1 tabular-nums">{fmtPKR(totals.grand * rate)} at {rate}</p>
        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-stone-300">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Cash in hand</p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-emerald-950">{fmtUSD(totals.income)}</p>
            <p className="text-[10px] text-stone-400 mt-0.5">PKR and USD accounts</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Assets held</p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-emerald-950">{fmtUSD(totals.assets)}</p>
            <p className="text-[10px] text-stone-400 mt-0.5">Binance and stocks</p>
          </div>
        </div>
      </section>

      {expenseStats.list.length > 0 && (
        <button onClick={() => go("expenses")}
          className="w-full mt-4 flex items-center justify-between gap-3 px-5 py-4 border border-stone-300 rounded-md bg-white hover:bg-stone-50 transition text-left">
          <div className="flex items-center gap-3">
            <ArrowDownRight size={18} className="text-red-700 shrink-0" />
            <div>
              <p className="text-sm font-medium text-stone-900">Spent so far</p>
              <p className="text-[11px] text-stone-500">
                {expenseStats.list.length} {expenseStats.list.length === 1 ? "expense" : "expenses"} recorded
              </p>
            </div>
          </div>
          <p className="text-lg tabular-nums font-semibold text-red-700 shrink-0">{fmtUSD(totals.spentUsd)}</p>
        </button>
      )}

      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">Account by account</h2>
        <div className="space-y-3">
          {parts.map((p) => (
            <button key={p.label} onClick={() => go(p.tab)} className="w-full text-left group">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-sm text-stone-800 group-hover:text-emerald-900 transition">{p.label}</span>
                <span className="text-sm tabular-nums font-medium whitespace-nowrap">
                  {fmtUSD(p.usd)}
                  <span className="text-stone-400 font-normal ml-2">
                    {totals.grand > 0 ? ((p.usd / totals.grand) * 100).toFixed(1) : "0.0"}%
                  </span>
                </span>
              </div>
              <div className="h-2 bg-stone-200 rounded-sm overflow-hidden">
                <div className="h-full rounded-sm transition-all duration-500"
                  style={{ width: (Math.max(p.usd, 0) / max) * 100 + "%", backgroundColor: p.ink }} />
              </div>
              <p className="text-[11px] text-stone-400 mt-1 tabular-nums">{p.note}</p>
            </button>
          ))}
        </div>

        {stockStats.cost > 0 && (
          <div className="mt-8 border border-stone-300 rounded-md bg-white p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-3">Stocks so far</p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-stone-500 text-[11px]">Invested</p>
                <p className="tabular-nums font-medium mt-0.5">{fmtUSD(stockStats.cost)}</p>
              </div>
              <div>
                <p className="text-stone-500 text-[11px]">Worth now</p>
                <p className="tabular-nums font-medium mt-0.5">{fmtUSD(stockStats.value)}</p>
              </div>
              <div>
                <p className="text-stone-500 text-[11px]">Profit / loss</p>
                <p className={"tabular-nums font-medium mt-0.5 " + (stockStats.pl >= 0 ? "text-emerald-800" : "text-red-700")}>
                  {(stockStats.pl >= 0 ? "+" : "") + fmtUSD(stockStats.pl)}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/* ---- 2. This month only ---- */

function MonthView({ rate, m, go }) {
  const rows = [
    { label: "Came in", value: m.earned, ink: "#1B4D3E", tone: "text-emerald-950" },
    { label: "Went out", value: m.spent, ink: "#8B2E2E", tone: "text-red-700" },
  ];
  const max = Math.max(m.earned, m.spent, 1);

  const detail = [
    { label: "PKR received", value: fmtPKR(m.pkrIn), tab: "pkr", up: true },
    { label: "USD received", value: fmtUSD(m.usdIn), tab: "usd", up: true },
    { label: "PKR spent", value: fmtPKR(m.pkrOut), tab: "expenses", up: false },
    { label: "USD spent", value: fmtUSD(m.usdOut), tab: "expenses", up: false },
    { label: "USDT spent", value: num(m.binOut, 2) + " USDT", tab: "expenses", up: false },
  ];

  return (
    <>
      <section className="mt-4 border border-stone-300 bg-stone-50 px-5 py-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Left over in {m.label}</p>
        <p className={"text-4xl sm:text-5xl font-semibold mt-2 tabular-nums break-words " +
          (m.net >= 0 ? "text-emerald-950" : "text-red-700")}>
          {(m.net >= 0 ? "" : "−") + fmtUSD(Math.abs(m.net))}
        </p>
        <p className="text-sm text-stone-500 mt-1 tabular-nums">
          {(m.net >= 0 ? "" : "−") + fmtPKR(Math.abs(m.net) * rate)} at {rate}
        </p>
        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-stone-300">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500 flex items-center gap-1">
              <ArrowUpRight size={11} className="text-emerald-800" /> Came in
            </p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-emerald-950">{fmtUSD(m.earned)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500 flex items-center gap-1">
              <ArrowDownRight size={11} className="text-red-700" /> Went out
            </p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-red-700">{fmtUSD(m.spent)}</p>
          </div>
        </div>
      </section>

      {m.count === 0 ? (
        <div className="mt-8 border border-dashed border-stone-300 rounded-lg px-6 py-12 text-center bg-white">
          <p className="text-stone-700 font-medium">Nothing logged in {m.label} yet</p>
          <p className="mt-1 text-sm text-stone-500 max-w-md mx-auto">
            Your balances are still there. This page fills up as you add payments and expenses dated
            this month.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">In versus out</h2>
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.label}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-sm text-stone-800">{r.label}</span>
                    <span className={"text-sm tabular-nums font-medium " + r.tone}>{fmtUSD(r.value)}</span>
                  </div>
                  <div className="h-2.5 bg-stone-200 rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm transition-all duration-500"
                      style={{ width: (r.value / max) * 100 + "%", backgroundColor: r.ink }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-3">
              {m.count} {m.count === 1 ? "entry" : "entries"} dated in {m.label}.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">By account</h2>
            <div className="border border-stone-300 rounded-md overflow-hidden bg-white">
              {detail.map((d, i) => (
                <button key={d.label} onClick={() => go(d.tab)}
                  className={"w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50 transition " +
                    (i === 0 ? "" : "border-t border-stone-200")}>
                  <span className="text-sm text-stone-700 flex items-center gap-2">
                    {d.up
                      ? <ArrowUpRight size={13} className="text-emerald-700 shrink-0" />
                      : <ArrowDownRight size={13} className="text-red-600 shrink-0" />}
                    {d.label}
                  </span>
                  <span className={"text-sm tabular-nums font-medium " + (d.up ? "text-emerald-950" : "text-red-700")}>
                    {d.value}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

/* ---- 3. All time ---- */

function AllTimeView({ rate, totals, stockStats, expenseStats, go }) {
  const savedPct = totals.grossIncome > 0
    ? ((totals.grossIncome - totals.spentUsd) / totals.grossIncome) * 100 : 0;

  return (
    <>
      <section className="mt-4 border border-stone-300 bg-stone-50 px-5 py-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Earned since the beginning</p>
        <p className="text-4xl sm:text-5xl font-semibold mt-2 tabular-nums text-emerald-950 break-words">
          {fmtUSD(totals.grossIncome)}
        </p>
        <p className="text-sm text-stone-500 mt-1 tabular-nums">{fmtPKR(totals.grossIncome * rate)} at {rate}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-stone-300">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Total earned</p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-emerald-950">{fmtUSD(totals.grossIncome)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Total spent</p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-red-700">{fmtUSD(totals.spentUsd)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Cash left</p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-emerald-950">{fmtUSD(totals.income)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Assets held</p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-emerald-950">{fmtUSD(totals.assets)}</p>
          </div>
        </div>
        {totals.grossIncome > 0 && (
          <div className="mt-5 pt-5 border-t border-stone-300">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Earned versus spent</span>
              <span className="text-sm tabular-nums font-medium text-emerald-900">
                {savedPct.toFixed(1)}% kept
              </span>
            </div>
            <div className="h-2.5 bg-stone-200 rounded-sm overflow-hidden flex">
              <div className="h-full bg-emerald-900 transition-all duration-500"
                style={{ width: Math.max(0, Math.min(100, savedPct)) + "%" }} />
              <div className="h-full bg-red-700 transition-all duration-500"
                style={{ width: Math.min(100, Math.max(0, 100 - savedPct)) + "%" }} />
            </div>
          </div>
        )}
      </section>

      {expenseStats.list.length > 0 && (
        <button onClick={() => go("expenses")}
          className="w-full mt-4 flex items-center justify-between gap-3 px-5 py-4 border border-stone-300 rounded-md bg-white hover:bg-stone-50 transition text-left">
          <div className="flex items-center gap-3">
            <ArrowDownRight size={18} className="text-red-700 shrink-0" />
            <div>
              <p className="text-sm font-medium text-stone-900">Spending so far</p>
              <p className="text-[11px] text-stone-500">
                {expenseStats.list.length} {expenseStats.list.length === 1 ? "expense" : "expenses"} recorded
              </p>
            </div>
          </div>
          <p className="text-lg tabular-nums font-semibold text-red-700 shrink-0">{fmtUSD(totals.spentUsd)}</p>
        </button>
      )}

      {stockStats.cost > 0 && (
        <div className="mt-4 border border-stone-300 rounded-md bg-white p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-3">Stocks so far</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-stone-500 text-[11px]">Invested</p>
              <p className="tabular-nums font-medium mt-0.5">{fmtUSD(stockStats.cost)}</p>
            </div>
            <div>
              <p className="text-stone-500 text-[11px]">Worth now</p>
              <p className="tabular-nums font-medium mt-0.5">{fmtUSD(stockStats.value)}</p>
            </div>
            <div>
              <p className="text-stone-500 text-[11px]">Profit / loss</p>
              <p className={"tabular-nums font-medium mt-0.5 " + (stockStats.pl >= 0 ? "text-emerald-800" : "text-red-700")}>
                {(stockStats.pl >= 0 ? "+" : "") + fmtUSD(stockStats.pl)}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============ CASH ACCOUNT (PKR / USD) ============ */

function CashAccount({ currency, title, sub, sources, channels, fmt, rows, income, spent, total, opening, secondary, onAdd, onDelete, setError }) {
  const [show, setShow] = useState(false);
  const [fMonth, setFMonth] = useState("all");
  const [fSource, setFSource] = useState("all");
  const blank = { date: today(), amount: "", source: sources[0], channel: channels[0], notes: "" };
  const [form, setForm] = useState(blank);

  const withMonth = useMemo(
    () => rows.map((e) => ({ ...e, period: periodOf(e.date) })), [rows]
  );

  const bySource = useMemo(() => {
    const map = {};
    withMonth
      .filter((e) => fMonth === "all" || e.period === fMonth)
      .forEach((e) => (map[e.source] = (map[e.source] || 0) + e.amount));
    const t = Object.values(map).reduce((a, b) => a + b, 0);
    return sources.filter((s) => map[s] > 0)
      .map((s) => ({ source: s, value: map[s], pct: t ? (map[s] / t) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [withMonth, sources, fMonth]);

  const byMonth = useMemo(() => {
    const map = {};
    withMonth.forEach((e) => (map[e.period] = (map[e.period] || 0) + e.amount));
    return periodRange(Object.keys(map)).map((p) => ({ period: p, value: map[p] || 0 }));
  }, [withMonth]);

  const monthOptions = useMemo(
    () => [...new Set(withMonth.map((e) => e.period))].sort().reverse(), [withMonth]
  );

  const peak = Math.max(...byMonth.map((m) => m.value), 1);

  const visible = withMonth
    .filter((e) => fMonth === "all" || e.period === fMonth)
    .filter((e) => fSource === "all" || e.source === fSource)
    .sort((a, b) => b.date.localeCompare(a.date));

  const filteredTotal = visible.reduce((a, e) => a + e.amount, 0);

  function submit() {
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return setError("Enter an amount greater than zero.");
    if (!form.date) return setError("Pick a date for this payment.");
    setError("");
    onAdd({ id: uid(), date: form.date, amount: amt, source: form.source, channel: form.channel, notes: form.notes.trim() });
    setForm({ ...blank, date: form.date, source: form.source, channel: form.channel });
    setShow(false);
  }

  return (
    <>
      <Head title={title} sub={sub} action="Add payment" onAction={() => setShow(true)} />

      <section className="mt-6 border border-stone-300 bg-stone-50 px-5 py-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Balance left</p>
        <p className={"text-3xl sm:text-4xl font-semibold mt-2 tabular-nums break-words " +
          (total < 0 ? "text-red-700" : "text-emerald-950")}>{fmt(total)}</p>
        <p className="text-sm text-stone-500 mt-1 tabular-nums">{secondary}</p>
        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-stone-300">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500 flex items-center gap-1">
              <ArrowUpRight size={11} className="text-emerald-800" /> Received
            </p>
            <p className="text-base font-semibold mt-1 tabular-nums text-emerald-950">{fmt(income)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500 flex items-center gap-1">
              <ArrowDownRight size={11} className="text-red-700" /> Spent
            </p>
            <p className="text-base font-semibold mt-1 tabular-nums text-red-700">{fmt(spent)}</p>
          </div>
        </div>
        {income > 0 && (
          <div className="mt-4 h-2 bg-stone-200 rounded-sm overflow-hidden">
            <div className="h-full bg-red-700 transition-all duration-500"
              style={{ width: Math.min(100, (spent / income) * 100) + "%" }} />
          </div>
        )}
        {opening > 0 && (
          <p className="text-[11px] text-stone-400 mt-3">
            Includes a starting balance of {fmt(opening)} that was already in this account.
          </p>
        )}
      </section>

      {rows.length === 0 && opening > 0 ? (
        <div className="mt-8 border border-dashed border-stone-300 rounded-lg px-6 py-12 text-center bg-white">
          <p className="text-stone-700 font-medium">Starting balance is set</p>
          <p className="mt-1 text-sm text-stone-500 max-w-md mx-auto">
            Your {currency} account opens at {fmt(opening)}. Add a payment whenever new money comes in
            and this page will chart it month by month.
          </p>
          <button onClick={() => setShow(true)} className={"mt-5 " + BTN}>Add payment</button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={currency === "PKR" ? Wallet : DollarSign}
          title={"No " + currency + " payments yet"}
          body={"Add a payment received in " + currency + " and this page will show where it came from, month by month."}
          action="Add payment" onAction={() => setShow(true)} />
      ) : (
        <>
          {monthOptions.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-3">Pick a month</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <MonthChip active={fMonth === "all"} onClick={() => setFMonth("all")} label="All time" />
                {monthOptions.map((p) => (
                  <MonthChip key={p} active={fMonth === p} onClick={() => setFMonth(p)} label={periodLabel(p)} />
                ))}
              </div>
              {fMonth !== "all" && (
                <div className="mt-4 border border-stone-300 rounded-md bg-white px-4 py-3 flex items-baseline justify-between gap-3">
                  <span className="text-sm text-stone-600">Received in {periodLabel(fMonth)}</span>
                  <span className="text-lg font-semibold tabular-nums text-emerald-950">{fmt(filteredTotal)}</span>
                </div>
              )}
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">
              Where it came from{fMonth !== "all" ? " in " + periodLabel(fMonth) : ""}
            </h2>
            <div className="space-y-3">
              {bySource.length === 0 ? (
                <p className="text-sm text-stone-500">Nothing received in this month.</p>
              ) : bySource.map((r) => (
                <div key={r.source}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-sm text-stone-800">{r.source}</span>
                    <span className="text-sm tabular-nums font-medium whitespace-nowrap">
                      {fmt(r.value)}
                      <span className="text-stone-400 font-normal ml-2">{r.pct.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div className="h-2 bg-stone-200 rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm transition-all duration-500"
                      style={{ width: r.pct + "%", backgroundColor: INK[r.source] || "#6B6B6B" }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">Month by month</h2>
            <div className="flex items-end gap-1 sm:gap-2 h-40 border-b border-stone-300 pb-px">
              {byMonth.map((m) => (
                <button key={m.period} onClick={() => setFMonth(m.period)}
                  className="flex-1 flex flex-col justify-end group relative min-w-[14px]">
                  <div className={"w-full rounded-t-sm transition-all duration-500 min-h-[2px] " +
                    (fMonth === m.period ? "bg-emerald-600" : "bg-emerald-900 group-hover:bg-emerald-700")}
                    style={{ height: (m.value / peak) * 100 + "%" }} />
                  {m.value > 0 && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-stone-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                      {fmt(m.value)}
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-1 sm:gap-2 mt-2">
              {byMonth.map((m) => (
                <div key={m.period} className="flex-1 min-w-[14px] text-center text-[9px] sm:text-[10px] text-stone-400 uppercase tracking-wider truncate">
                  {periodShort(m.period)}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500">All payments</h2>
              <div className="flex gap-2">
                <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded border border-stone-300 bg-white">
                  <option value="all">Every month</option>
                  {monthOptions.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
                </select>
                <select value={fSource} onChange={(e) => setFSource(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded border border-stone-300 bg-white">
                  <option value="all">Every source</option>
                  {sources.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {visible.length === 0 ? (
              <p className="text-sm text-stone-500 py-6 text-center border border-dashed border-stone-300 rounded-md">
                Nothing matches those filters. Widen them to see payments.
              </p>
            ) : (
              <div className="border border-stone-300 rounded-md overflow-hidden bg-white">
                {visible.map((e, i) => (
                  <Row key={e.id} first={i === 0} ink={INK[e.source] || "#6B6B6B"}
                    title={e.source} titleMuted={" · " + e.channel}
                    sub={e.date + (e.notes ? " · " + e.notes : "")}
                    main={fmt(e.amount)} onDelete={() => onDelete(e.id)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {show && (
        <Modal title={"Add " + currency + " payment"} onClose={() => setShow(false)}>
          <div>
            <label className={LABEL}>Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Amount in {currency}</label>
            <input type="number" inputMode="decimal" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder={currency === "PKR" ? "150000" : "500"} className={FIELD} />
          </div>
          <Select label="Where it came from" value={form.source} options={sources}
            onChange={(v) => setForm({ ...form, source: v })} />
          <Select label="How you received it" value={form.channel} options={channels}
            onChange={(v) => setForm({ ...form, channel: v })} />
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anything worth remembering" className={FIELD} />
          </div>
          <Actions onCancel={() => setShow(false)} onSave={submit} saveLabel="Save payment" />
        </Modal>
      )}
    </>
  );
}

/* ============ BINANCE ============ */

function CryptoAccount({ trades, stats, onAdd, onDelete, setError }) {
  const [show, setShow] = useState(false);
  const blank = { date: today(), type: "sell", coin: "USDT", qty: "", counterparty: "Arsalan Maroof", notes: "" };
  const [form, setForm] = useState(blank);
  const sorted = [...trades].sort((a, b) => b.date.localeCompare(a.date));

  function submit() {
    const q = Number(form.qty);
    if (!q || q <= 0) return setError("Enter a quantity greater than zero.");
    setError("");
    onAdd({ id: uid(), date: form.date, type: form.type, coin: form.coin, qty: q,
      counterparty: form.counterparty.trim(), notes: form.notes.trim() });
    setForm({ ...blank, date: form.date, coin: form.coin, type: form.type });
    setShow(false);
  }

  return (
    <>
      <Head title="Binance account" sub="USDT counted as dollars, one for one." action="Add trade" onAction={() => setShow(true)} />

      <section className="mt-6 border border-stone-300 bg-stone-50 px-5 py-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">USDT on hand</p>
        <p className="text-3xl sm:text-4xl font-semibold mt-2 tabular-nums text-emerald-950 break-words">
          {fmtUSD(stats.usdtQty)}
        </p>
        <p className="text-sm text-stone-500 mt-1 tabular-nums">{num(stats.usdtQty)} USDT</p>
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-stone-300">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Sold so far</p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-emerald-950">{num(stats.usdtSold)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Spent</p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-red-700">{num(stats.usdtSpent)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Trades</p>
            <p className="text-lg font-semibold mt-1 tabular-nums text-emerald-950">{trades.length}</p>
          </div>
        </div>
      </section>

      {trades.length === 0 && stats.usdtQty !== 0 ? (
        <div className="mt-8 border border-dashed border-stone-300 rounded-lg px-6 py-12 text-center bg-white">
          <p className="text-stone-700 font-medium">Starting balance is set</p>
          <p className="mt-1 text-sm text-stone-500 max-w-md mx-auto">
            Your Binance account opens at {num(stats.usdtQty)} USDT. Log a trade whenever you buy or
            sell and this page will track what is left.
          </p>
          <button onClick={() => setShow(true)} className={"mt-5 " + BTN}>Add trade</button>
        </div>
      ) : trades.length === 0 ? (
        <EmptyState icon={Coins} title="No trades logged yet"
          body="Record what you bought or sold and this page keeps track of what's left in your account."
          action="Add trade" onAction={() => setShow(true)} />
      ) : (
        <>
          {stats.holdings.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">What you hold</h2>
              <div className="border border-stone-300 rounded-md bg-white divide-y divide-stone-200">
                {stats.holdings.map((h) => (
                  <div key={h.coin} className="flex justify-between px-4 py-3 text-sm">
                    <span className="font-medium">{h.coin}</span>
                    <span className="tabular-nums">{num(h.qty)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">All trades</h2>
            <div className="border border-stone-300 rounded-md overflow-hidden bg-white">
              {sorted.map((t, i) => (
                <Row key={t.id} first={i === 0} ink={t.type === "sell" ? "#7A4E2D" : "#1B4D3E"}
                  title={(t.type === "sell" ? "Sold " : "Bought ") + num(t.qty) + " " + t.coin}
                  titleMuted={t.counterparty ? " · " + t.counterparty : ""}
                  sub={t.date + (t.notes ? " · " + t.notes : "")}
                  main={num(t.qty) + " " + t.coin}
                  secondary={t.type === "sell" ? "out" : "in"}
                  onDelete={() => onDelete(t.id)} />
              ))}
            </div>
          </section>
        </>
      )}

      {show && (
        <Modal title="Add trade" onClose={() => setShow(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Type</label>
              <Toggle options={["sell", "buy"]} labels={["Sell", "Buy"]} value={form.type}
                onChange={(v) => setForm({ ...form, type: v })} />
            </div>
          </div>
          <Select label="Coin" value={form.coin} options={COINS} onChange={(v) => setForm({ ...form, coin: v })} />
          <div>
            <label className={LABEL}>Quantity</label>
            <input type="number" inputMode="decimal" value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="500" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Traded with (optional)</label>
            <input type="text" value={form.counterparty}
              onChange={(e) => setForm({ ...form, counterparty: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={FIELD} />
          </div>
          <Actions onCancel={() => setShow(false)} onSave={submit} saveLabel="Save trade" />
        </Modal>
      )}
    </>
  );
}

/* ============ STOCKS ============ */

function StockAccount({ stats, onAdd, onUpdate, onDelete, setError }) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [priceDraft, setPriceDraft] = useState("");
  const blank = { symbol: "", name: "", market: "US", qty: "", buyPrice: "", currentPrice: "", date: today() };
  const [form, setForm] = useState(blank);

  function submit() {
    if (!form.symbol.trim()) return setError("Enter the ticker symbol.");
    const q = Number(form.qty), p = Number(form.buyPrice);
    if (!q || q <= 0) return setError("Enter how many shares you hold.");
    if (!p || p <= 0) return setError("Enter the price you paid per share.");
    setError("");
    onAdd({ id: uid(), symbol: form.symbol.trim().toUpperCase(), name: form.name.trim(),
      market: form.market, qty: q, buyPrice: p, currentPrice: Number(form.currentPrice) || p, date: form.date });
    setForm({ ...blank, market: form.market });
    setShow(false);
  }

  function savePrice() {
    const v = Number(priceDraft);
    if (!v || v <= 0) return setError("Enter a price greater than zero.");
    setError("");
    onUpdate(editing.id, v);
    setEditing(null);
  }

  return (
    <>
      <Head title="Stock account" sub="Holdings priced in dollars." action="Add holding" onAction={() => setShow(true)} />

      <div className="mt-4 px-4 py-3 rounded-md bg-stone-200 text-[12px] text-stone-600">
        Prices are the ones you enter. Connect your broker later and this section can pull them in
        automatically instead.
      </div>

      <section className="mt-6 border border-stone-300 bg-stone-50 px-5 py-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">Worth now</p>
        <p className="text-3xl sm:text-4xl font-semibold mt-2 tabular-nums text-emerald-950 break-words">
          {fmtUSD(stats.value)}
        </p>
        <p className={"text-sm mt-1 tabular-nums " + (stats.pl >= 0 ? "text-emerald-700" : "text-red-600")}>
          {(stats.pl >= 0 ? "+" : "") + fmtUSD(stats.pl)}
          {stats.cost > 0 && " (" + stats.plPct.toFixed(1) + "%)"} on {fmtUSD(stats.cost)} invested
        </p>
      </section>

      {stats.rows.length === 0 ? (
        <EmptyState icon={LineChart} title="No holdings yet"
          body="Add a stock with the price you paid, and this page will track what it's worth and whether you're up or down."
          action="Add holding" onAction={() => setShow(true)} />
      ) : (
        <section className="mt-8">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">Your holdings</h2>
          <div className="border border-stone-300 rounded-md overflow-hidden bg-white">
            {stats.rows.map((s, i) => (
              <div key={s.id}
                className={"flex items-center gap-3 px-4 py-3 group hover:bg-stone-50 transition " + (i > 0 ? "border-t border-stone-200" : "")}>
                <div className="w-1 h-9 rounded-full shrink-0" style={{ backgroundColor: s.pl >= 0 ? "#1B4D3E" : "#9B2C2C" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-stone-900 truncate">
                    {s.symbol}
                    <span className="text-stone-400"> · {s.market}{s.name ? " · " + s.name : ""}</span>
                  </p>
                  <p className="text-[11px] text-stone-500 truncate">
                    {num(s.qty, 2)} shares · paid {fmtUSD(s.buyPrice)} · now{" "}
                    <button onClick={() => { setEditing(s); setPriceDraft(String(s.currentPrice)); }}
                      className="underline decoration-dotted hover:text-emerald-900">
                      {fmtUSD(s.currentPrice)}
                    </button>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm tabular-nums font-medium text-emerald-950">{fmtUSD(s.value)}</p>
                  <p className={"text-[10px] tabular-nums " + (s.pl >= 0 ? "text-emerald-700" : "text-red-600")}>
                    {(s.pl >= 0 ? "+" : "") + fmtUSD(s.pl)} ({s.plPct.toFixed(1)}%)
                  </p>
                </div>
                <button onClick={() => onDelete(s.id)} aria-label={"Delete " + s.symbol}
                  className="p-1.5 rounded text-stone-300 hover:text-red-600 hover:bg-red-50 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 opacity-0 group-hover:opacity-100 transition">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {show && (
        <Modal title="Add holding" onClose={() => setShow(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Symbol</label>
              <input type="text" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="AAPL" className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Bought on</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={FIELD} />
            </div>
          </div>
          <div>
            <label className={LABEL}>Company name (optional)</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={FIELD} />
          </div>
          <Select label="Market" value={form.market} options={MARKETS} onChange={(v) => setForm({ ...form, market: v })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Shares</label>
              <input type="number" inputMode="decimal" value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="10" className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Price paid (USD)</label>
              <input type="number" inputMode="decimal" value={form.buyPrice}
                onChange={(e) => setForm({ ...form, buyPrice: e.target.value })} placeholder="185.50" className={FIELD} />
            </div>
          </div>
          <div>
            <label className={LABEL}>Price now in USD (optional)</label>
            <input type="number" inputMode="decimal" value={form.currentPrice}
              onChange={(e) => setForm({ ...form, currentPrice: e.target.value })}
              placeholder="Leave blank to use what you paid" className={FIELD} />
          </div>
          {form.qty && form.buyPrice && (
            <p className="text-[11px] text-stone-500 tabular-nums">
              That's {fmtUSD(Number(form.qty) * Number(form.buyPrice))} invested.
            </p>
          )}
          <Actions onCancel={() => setShow(false)} onSave={submit} saveLabel="Save holding" />
        </Modal>
      )}

      {editing && (
        <Modal title={"Update " + editing.symbol} onClose={() => setEditing(null)}>
          <div>
            <label className={LABEL}>Price now (USD)</label>
            <input type="number" inputMode="decimal" value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)} className={FIELD} />
            <p className="text-[11px] text-stone-500 mt-2">
              You hold {num(editing.qty, 2)} shares bought at {fmtUSD(editing.buyPrice)}.
            </p>
          </div>
          <Actions onCancel={() => setEditing(null)} onSave={savePrice} saveLabel="Update price" />
        </Modal>
      )}
    </>
  );
}

/* ============ EXPENSES ============ */

function ExpenseAccount({ rows, stats, rate, onAdd, onDelete, setError }) {
  const [show, setShow] = useState(false);
  const [fMonth, setFMonth] = useState("all");
  const [fCategory, setFCategory] = useState("all");
  const [fAccount, setFAccount] = useState("all");
  const blank = {
    date: today(), amount: "", category: EXPENSE_CATEGORIES[0],
    account: EXPENSE_ACCOUNTS[0], notes: "",
  };
  const [form, setForm] = useState(blank);

  const currencyOf = (account) => (account === "PKR account" ? "PKR" : "USD");
  const fmtFor = (account) => (account === "PKR account" ? fmtPKR : fmtUSD);
  const toUsd = (e) => (e.account === "PKR account" ? e.amount / rate : e.amount);

  const withMonth = useMemo(
    () => rows.map((e) => ({ ...e, period: periodOf(e.date), usd: toUsd(e) })),
    [rows, rate]
  );

  const totalUsd = useMemo(() => withMonth.reduce((a, e) => a + e.usd, 0), [withMonth]);

  const inMonth = useMemo(
    () => withMonth.filter((e) => fMonth === "all" || e.period === fMonth), [withMonth, fMonth]
  );

  const monthTotals = useMemo(() => {
    let pkr = 0, usd = 0, binance = 0, all = 0;
    inMonth.forEach((e) => {
      all += e.usd;
      if (e.account === "PKR account") pkr += e.amount;
      else if (e.account === "USD account") usd += e.amount;
      else binance += e.amount;
    });
    return { pkr, usd, binance, all };
  }, [inMonth]);

  const byCategory = useMemo(() => {
    const map = {};
    inMonth.forEach((e) => (map[e.category] = (map[e.category] || 0) + e.usd));
    const t = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.keys(map)
      .map((c) => ({ category: c, value: map[c], pct: t ? (map[c] / t) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [inMonth]);

  const byMonth = useMemo(() => {
    const map = {};
    withMonth.forEach((e) => (map[e.period] = (map[e.period] || 0) + e.usd));
    return periodRange(Object.keys(map)).map((p) => ({ period: p, value: map[p] || 0 }));
  }, [withMonth]);

  const monthOptions = useMemo(
    () => [...new Set(withMonth.map((e) => e.period))].sort().reverse(), [withMonth]
  );

  const peak = Math.max(...byMonth.map((m) => m.value), 1);

  const monthsUsed = byMonth.filter((m) => m.value > 0).length;
  const monthlyAverage = monthsUsed > 0 ? totalUsd / monthsUsed : 0;

  const visible = inMonth
    .filter((e) => fCategory === "all" || e.category === fCategory)
    .filter((e) => fAccount === "all" || e.account === fAccount)
    .sort((a, b) => b.date.localeCompare(a.date));

  function submit() {
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return setError("Enter an expense amount greater than zero.");
    if (!form.date) return setError("Pick a date for this expense.");
    setError("");
    onAdd({
      id: uid(), date: form.date, amount: amt, category: form.category,
      account: form.account, notes: form.notes.trim(),
    });
    setForm({ ...blank, date: form.date, category: form.category, account: form.account });
    setShow(false);
  }

  const accountCards = [
    { label: "PKR account", value: stats.pkr, fmt: fmtPKR, note: "= " + fmtUSD(stats.pkr / rate) },
    { label: "USD account", value: stats.usd, fmt: fmtUSD, note: "= " + fmtPKR(stats.usd * rate) },
    { label: "Binance", value: stats.binance, fmt: fmtUSD, note: num(stats.binance, 2) + " USDT" },
  ];

  return (
    <>
      <Head title="Expenses" sub="Everything you spent, taken off the account you paid from."
        action="Add expense" onAction={() => setShow(true)} />

      <section className="mt-6 border border-stone-300 bg-stone-50 px-5 py-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">
          {fMonth === "all" ? "Total spent" : "Spent in " + periodLabel(fMonth)}
        </p>
        <p className="text-3xl sm:text-4xl font-semibold mt-2 tabular-nums text-red-700 break-words">
          {fmtUSD(monthTotals.all)}
        </p>
        <p className="text-sm text-stone-500 mt-1 tabular-nums">{fmtPKR(monthTotals.all * rate)} at {rate}</p>
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-stone-300">
          {accountCards.map((c) => (
            <div key={c.label}>
              <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500">{c.label}</p>
              <p className="text-base font-semibold mt-1 tabular-nums text-red-700 break-words">
                {c.fmt(c.value)}
              </p>
              <p className="text-[10px] text-stone-400 tabular-nums mt-0.5">{c.note}</p>
            </div>
          ))}
        </div>
        {fMonth !== "all" && (
          <p className="text-[11px] text-stone-400 mt-4">
            Account figures above are lifetime totals. The big number follows the month you picked.
          </p>
        )}
      </section>

      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No expenses recorded yet"
          body="Add something you spent and it will be subtracted from the account you paid it from, so every balance shows what is actually left."
          action="Add expense" onAction={() => setShow(true)} />
      ) : (
        <>
          {monthOptions.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-3">Pick a month</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <MonthChip active={fMonth === "all"} onClick={() => setFMonth("all")} label="All time" />
                {monthOptions.map((p) => (
                  <MonthChip key={p} active={fMonth === p} onClick={() => setFMonth(p)} label={periodLabel(p)} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-8 grid grid-cols-2 gap-4">
            <div className="border border-stone-300 rounded-md bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.15em] text-stone-500">Average per month</p>
              <p className="text-xl font-semibold mt-1 tabular-nums text-stone-900">{fmtUSD(monthlyAverage)}</p>
              <p className="text-[11px] text-stone-400 mt-0.5">
                across {monthsUsed} {monthsUsed === 1 ? "month" : "months"} with spending
              </p>
            </div>
            <div className="border border-stone-300 rounded-md bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.15em] text-stone-500">Biggest category</p>
              <p className="text-xl font-semibold mt-1 text-stone-900 truncate">
                {byCategory.length > 0 ? byCategory[0].category : "None"}
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5 tabular-nums">
                {byCategory.length > 0 ? fmtUSD(byCategory[0].value) : ""}
              </p>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">
              Where it went{fMonth !== "all" ? " in " + periodLabel(fMonth) : ""}
            </h2>
            <div className="space-y-3">
              {byCategory.length === 0 ? (
                <p className="text-sm text-stone-500">Nothing spent in this month.</p>
              ) : byCategory.map((r) => (
                <div key={r.category}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-sm text-stone-800">{r.category}</span>
                    <span className="text-sm tabular-nums font-medium whitespace-nowrap">
                      {fmtUSD(r.value)}
                      <span className="text-stone-400 font-normal ml-2">{r.pct.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div className="h-2 bg-stone-200 rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm transition-all duration-500"
                      style={{ width: r.pct + "%", backgroundColor: EXPENSE_INK[r.category] || "#6B6B6B" }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">Month by month</h2>
            <div className="flex items-end gap-1 sm:gap-2 h-40 border-b border-stone-300 pb-px">
              {byMonth.map((m) => (
                <button key={m.period} onClick={() => setFMonth(m.period)}
                  className="flex-1 flex flex-col justify-end group relative min-w-[14px]">
                  <div className={"w-full rounded-t-sm transition-all duration-500 min-h-[2px] " +
                    (fMonth === m.period ? "bg-red-500" : "bg-red-700 group-hover:bg-red-600")}
                    style={{ height: (m.value / peak) * 100 + "%" }} />
                  {m.value > 0 && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-stone-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                      {fmtUSD(m.value)}
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-1 sm:gap-2 mt-2">
              {byMonth.map((m) => (
                <div key={m.period} className="flex-1 min-w-[14px] text-center text-[9px] sm:text-[10px] text-stone-400 uppercase tracking-wider truncate">
                  {periodShort(m.period)}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-stone-500">All expenses</h2>
              <div className="flex flex-wrap gap-2">
                <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded border border-stone-300 bg-white">
                  <option value="all">Every month</option>
                  {monthOptions.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
                </select>
                <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded border border-stone-300 bg-white">
                  <option value="all">Every category</option>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select value={fAccount} onChange={(e) => setFAccount(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded border border-stone-300 bg-white">
                  <option value="all">Every account</option>
                  {EXPENSE_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
            {visible.length === 0 ? (
              <p className="text-sm text-stone-500 py-6 text-center border border-dashed border-stone-300 rounded-md">
                Nothing matches those filters. Widen them to see expenses.
              </p>
            ) : (
              <div className="border border-stone-300 rounded-md overflow-hidden bg-white">
                {visible.map((e, i) => (
                  <Row key={e.id} first={i === 0} ink={EXPENSE_INK[e.category] || "#6B6B6B"}
                    title={e.category} titleMuted={" · " + e.account}
                    sub={e.date + (e.notes ? " · " + e.notes : "")}
                    main={"− " + fmtFor(e.account)(e.amount)}
                    secondary={e.account === "PKR account" ? fmtUSD(e.usd) : null}
                    onDelete={() => onDelete(e.id)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {show && (
        <Modal title="Add expense" onClose={() => setShow(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Date</label>
              <input type="date" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Amount ({currencyOf(form.account)})</label>
              <input type="number" inputMode="decimal" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0" className={FIELD} />
            </div>
          </div>
          <Select label="Paid from" value={form.account} options={EXPENSE_ACCOUNTS}
            onChange={(v) => setForm({ ...form, account: v })} />
          <Select label="Category" value={form.category} options={EXPENSE_CATEGORIES}
            onChange={(v) => setForm({ ...form, category: v })} />
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <input type="text" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="What was this for?" className={FIELD} />
          </div>
          {form.amount && Number(form.amount) > 0 && (
            <p className="text-[11px] text-stone-500 tabular-nums">
              {form.account === "PKR account"
                ? "That is " + fmtUSD(Number(form.amount) / rate) + " at " + rate + "."
                : "That is " + fmtPKR(Number(form.amount) * rate) + " at " + rate + "."}
              {" It will be subtracted from your " + form.account + "."}
            </p>
          )}
          <Actions onCancel={() => setShow(false)} onSave={submit} saveLabel="Save expense" />
        </Modal>
      )}
    </>
  );
}

/* ============ SHARED ============ */

function Head({ title, sub, action, onAction }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mt-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-stone-500 mt-0.5">{sub}</p>
      </div>
      <button onClick={onAction} className={"flex items-center gap-2 " + BTN}>
        <Plus size={16} />
        {action}
      </button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body, action, onAction }) {
  return (
    <div className="mt-8 border border-dashed border-stone-300 rounded-lg px-6 py-14 text-center bg-white">
      <Icon size={28} className="mx-auto text-stone-300" />
      <p className="mt-4 text-stone-700 font-medium">{title}</p>
      <p className="mt-1 text-sm text-stone-500 max-w-sm mx-auto">{body}</p>
      <button onClick={onAction} className={"mt-5 " + BTN}>{action}</button>
    </div>
  );
}

function MonthChip({ active, onClick, label }) {
  return (
    <button onClick={onClick}
      className={"px-3 py-1.5 text-xs rounded-full border whitespace-nowrap shrink-0 transition " +
        (active
          ? "bg-emerald-900 border-emerald-900 text-white"
          : "bg-white border-stone-300 text-stone-600 hover:border-stone-400")}>
      {label}
    </button>
  );
}

function Row({ first, ink, title, titleMuted, sub, main, secondary, onDelete }) {
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);

  return (
    <div className={"flex items-center gap-3 px-4 py-3 group hover:bg-stone-50 transition " + (first ? "" : "border-t border-stone-200")}>
      <div className="w-1 h-9 rounded-full shrink-0" style={{ backgroundColor: ink }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-stone-900 truncate">
          {title}
          <span className="text-stone-400">{titleMuted}</span>
        </p>
        <p className="text-[11px] text-stone-500 truncate">{sub}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={"text-sm tabular-nums font-medium " +
          (typeof main === "string" && main.startsWith("−") ? "text-red-700" : "text-emerald-950")}>{main}</p>
        {secondary && <p className="text-[10px] tabular-nums text-stone-400">{secondary}</p>}
      </div>
      {confirm ? (
        <div className="flex gap-1 shrink-0">
          <button onClick={onDelete}
            className="px-2 py-1 text-[11px] rounded bg-red-600 text-white hover:bg-red-700 transition">
            Delete
          </button>
          <button onClick={() => setConfirm(false)}
            className="px-2 py-1 text-[11px] rounded border border-stone-300 text-stone-600 hover:bg-stone-100 transition">
            Keep
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)} aria-label="Delete this record"
          className="p-1.5 rounded text-stone-300 hover:text-red-600 hover:bg-red-50 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100 transition">
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/40 p-0 sm:p-4">
      <div className="bg-stone-50 w-full sm:max-w-lg rounded-t-xl sm:rounded-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-stone-50 z-10">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-stone-200 transition">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Toggle({ options, labels, value, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-stone-200 rounded-md">
      {options.map((o, i) => (
        <button key={o} onClick={() => onChange(o)}
          className={"flex-1 py-1.5 text-sm rounded transition " +
            (value === o ? "bg-white font-medium text-emerald-950 shadow-sm" : "text-stone-600")}>
          {labels ? labels[i] : o}
        </button>
      ))}
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Actions({ onCancel, onSave, saveLabel }) {
  return (
    <div className="flex gap-2 pt-1">
      <button onClick={onCancel}
        className="flex-1 py-2.5 text-sm rounded-md border border-stone-300 bg-white hover:bg-stone-100 transition">
        Cancel
      </button>
      <button onClick={onSave}
        className="flex-1 py-2.5 text-sm rounded-md bg-emerald-900 text-white hover:bg-emerald-800 transition">
        {saveLabel}
      </button>
    </div>
  );
}

/* ============ SIGN IN ============ */

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    currentSession()
      .then((s) => setSession(s))
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  async function submit() {
    if (!email.trim() || !password) return setErr("Enter your email and password.");
    setBusy(true); setErr("");
    try {
      await signIn(email.trim(), password);
      setSession(await currentSession());
      setPassword("");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setSession(null);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <p className="text-stone-500 text-sm tracking-widest uppercase">Checking your sign in</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-900 mb-1">Abuzar</p>
          <h1 className="text-2xl font-semibold tracking-tight mb-6">Every account, one page</h1>
          <div className="border border-stone-300 bg-stone-50 rounded-md p-5 space-y-4">
            <div>
              <label className={LABEL}>Email</label>
              <input type="email" value={email} autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Password</label>
              <input type="password" value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} className={FIELD} />
            </div>
            {err && (
              <p className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
            )}
            <button onClick={submit} disabled={busy}
              className={"w-full " + BTN + (busy ? " opacity-50" : "")}>
              {busy ? "Signing in" : "Sign in"}
            </button>
          </div>
          <p className="mt-4 text-[11px] text-stone-400">
            Use the email and password you created under Authentication in Supabase.
          </p>
        </div>
      </div>
    );
  }

  return <FinanceTracker onSignOut={handleSignOut} />;
}
