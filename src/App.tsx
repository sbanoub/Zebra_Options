import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Options Scenario Web App — v4
 * --------------------------------------------
 * New
 * - Top navigation with two pages: "Portfolio" and "Live Data".
 * - Summary bar restored (Total Current Value, Unrealized P/L, Value @ +/-%, Realized @ +/-%).
 * - Clean hash routing (#/portfolio, #/live).
 *
 * Fixes
 * - Stable decimal inputs (type 1.72, .35, 1.).
 * - CSV helpers use safe one-line strings and robust quoted-split regex.
 * - Inline smoke tests via console.assert.
 *
 * Notes
 * - Assumes US equity options (multiplier 100).
 * - "Realized @ +X%" = (Current * (1+X) - Entry) * Contracts * 100.
 */

// ---------- helpers ----------
const currency = (n: number | undefined | null) =>
  Number.isFinite(n as number)
    ? (n as number).toLocaleString(undefined, { style: "currency", currency: "USD" })
    : "—";

const numberOr = (v: unknown, fallback = 0) => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : fallback;
};

// pure compute helper (used both by UI and tests)
export function computeRow(
  entryPrice: number,
  currentPrice: number,
  contracts: number,
  strike: number,
  type: "C" | "P",
  pct: number
) {
  const m = 100;
  const p = pct / 100;
  const plusPrice = currentPrice > 0 ? currentPrice * (1 + p) : NaN;
  const minusPrice = currentPrice > 0 ? currentPrice * (1 - p) : NaN;
  const curValue = currentPrice > 0 && contracts > 0 ? currentPrice * contracts * m : NaN;
  const plusValue = Number.isFinite(plusPrice) && contracts > 0 ? (plusPrice as number) * contracts * m : NaN;
  const minusValue = Number.isFinite(minusPrice) && contracts > 0 ? (minusPrice as number) * contracts * m : NaN;
  const unrealNow = Number.isFinite(currentPrice) ? (currentPrice - entryPrice) * contracts * m : NaN;
  const realizedPlus = Number.isFinite(plusPrice) ? ((plusPrice as number) - entryPrice) * contracts * m : NaN;
  const realizedMinus = Number.isFinite(minusPrice) ? ((minusPrice as number) - entryPrice) * contracts * m : NaN;
  const breakevenStock = type === "C" ? strike + entryPrice : NaN;
  return { plusPrice, minusPrice, curValue, plusValue, minusValue, unrealNow, realizedPlus, realizedMinus, breakevenStock };
}

// quick smoke tests (run once in browser)
if (typeof window !== "undefined") {
  const t = computeRow(1.0, 1.72, 2, 15, "C", 15);
  console.assert(Math.abs((t.plusPrice as number) - 1.978) < 1e-9, "plusPrice 15% of 1.72 ≈ 1.978");
  console.assert(Math.abs((t.minusPrice as number) - 1.462) < 1e-9, "minusPrice 15% of 1.72 ≈ 1.462");
  console.assert(Math.abs((t.curValue as number) - 344) < 1e-9, "curValue 1.72 * 2 * 100 = 344");
}

// ---------- inputs ----------
function DecimalInput({
  value,
  onChange,
  decimals = 2,
  className = "",
}: {
  value: string | number;
  onChange: (v: string) => void;
  decimals?: number;
  className?: string;
}) {
  const [text, setText] = useState(String(value ?? ""));
  useEffect(() => {
    setText(String(value ?? ""));
  }, [value]);

  return (
    <input
      className={`w-28 border rounded-lg px-2 py-1 text-right ${className}`}
      value={text}
      inputMode="decimal"
      onChange={(e) => {
        const v = e.target.value;
        // allow empty, '.', or digits with one dot
        if (v === "" || v === "." || /^\d*\.?\d*$/.test(v)) setText(v);
      }}
      onBlur={() => {
        const n = parseFloat(text);
        if (Number.isFinite(n)) onChange(n.toFixed(decimals));
        else onChange("");
      }}
    />
  );
}

// ---------- data ----------
const emptyRow = () => ({
  id: crypto.randomUUID(),
  ticker: "CIFR",
  contract: "CIFR Dec 19 2025 15C",
  expiration: "2025-12-19",
  strike: "15",
  type: "C" as const,
  contracts: "1",
  entryPrice: "1.00",
  currentPrice: "0.90",
  notes: "",
});

// ---------- small UI ----------
function Nav({ route, setRoute }: { route: string; setRoute: (r: string) => void }) {
  return (
    <nav className="mb-6 flex items-center gap-2">
      {[
        { key: "portfolio", label: "Portfolio", hash: "#/portfolio" },
        { key: "live", label: "Live Data", hash: "#/live" },
      ].map((item) => (
        <a
          key={item.key}
          href={item.hash}
          onClick={(e) => {
            e.preventDefault();
            setRoute(item.key);
            window.location.hash = item.hash;
          }}
          className={`px-4 py-2 rounded-2xl border shadow text-sm ${
            route === item.key ? "bg-black text-white" : "bg-white hover:bg-slate-100"
          }`}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function SummaryBar({
  pct,
  totals,
}: {
  pct: number;
  totals: { curValue: number; unrealNow: number; plusValue: number; minusValue: number; realizedPlus: number; realizedMinus: number };
}) {
  return (
    <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <SummaryCard title="Total Current Value" value={totals.curValue} />
      <SummaryCard title="Total Unrealized P/L Now" value={totals.unrealNow} />
      <SummaryCard title={`Total Value @ +${pct}%`} value={totals.plusValue} />
      <SummaryCard title={`Total Value @ -${pct}%`} value={totals.minusValue} />
      <SummaryCard title={`Total Realized Gain @ +${pct}%`} value={totals.realizedPlus} />
      <SummaryCard title={`Total Realized Gain @ -${pct}%`} value={totals.realizedMinus} />
    </section>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-sm text-slate-600">{title}</div>
      <div className="text-xl font-semibold mt-1">{currency(value)}</div>
    </div>
  );
}

// ---------- app ----------
export default function App() {
  const [rows, setRows] = useState(() => {
    const fromLS = localStorage.getItem("optionsRows_v4");
    return fromLS ? JSON.parse(fromLS) : [emptyRow()];
  });
  const [pct, setPct] = useState(15);
  const [route, setRoute] = useState<string>(() => (window.location.hash.includes("/live") ? "live" : "portfolio"));

  // optional data feed (separate page)
  const [dataFeedUrl, setDataFeedUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshSec, setRefreshSec] = useState(15);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem("optionsRows_v4", JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.includes("/live") ? "live" : "portfolio");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!autoRefresh || route !== "live") {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => refreshAllQuotes(), Math.max(5, refreshSec) * 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [autoRefresh, refreshSec, dataFeedUrl, apiKey, rows, route]);

  const addRow = () => setRows((r: any[]) => [...r, emptyRow()]);
  const removeRow = (id: string) => setRows((r: any[]) => r.filter((x) => x.id !== id));
  const updateRow = (id: string, patch: Record<string, unknown>) =>
    setRows((r: any[]) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const computed = useMemo(() => {
    const withCalcs = rows.map((row: any) => {
      const entry = numberOr(row.entryPrice);
      const cur = numberOr(row.currentPrice);
      const qty = numberOr(row.contracts, 0);
      const strike = numberOr(row.strike);
      const res = computeRow(entry, cur, qty, strike, (row.type as "C" | "P") || "C", pct);
      return { ...row, ...res };
    });

    const totals = withCalcs.reduce(
      (acc: Record<string, number>, r: any) => {
        acc.curValue += numberOr(r.curValue, 0);
        acc.unrealNow += numberOr(r.unrealNow, 0);
        acc.plusValue += numberOr(r.plusValue, 0);
        acc.minusValue += numberOr(r.minusValue, 0);
        acc.realizedPlus += numberOr(r.realizedPlus, 0);
        acc.realizedMinus += numberOr(r.realizedMinus, 0);
        return acc;
      },
      { curValue: 0, unrealNow: 0, plusValue: 0, minusValue: 0, realizedPlus: 0, realizedMinus: 0 }
    );

    return { rows: withCalcs, totals };
  }, [rows, pct]);

  async function fetchOptionQuote(contractText: string) {
    if (!dataFeedUrl) return null;
    try {
      const url = new URL(dataFeedUrl);
      url.searchParams.set("contract", contractText);
      const res = await fetch(url.toString(), {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return typeof json?.last === "number" ? json.last : null;
    } catch (e) {
      console.warn("Fetch quote failed", e);
      return null;
    }
  }

  async function refreshQuote(id: string, contractText: string) {
    const px = await fetchOptionQuote(contractText);
    if (px != null) updateRow(id, { currentPrice: String(px) });
  }

  async function refreshAllQuotes() {
    for (const r of rows as any[]) {
      if (r.contract) {
        const px = await fetchOptionQuote(r.contract);
        if (px != null) updateRow(r.id, { currentPrice: String(px) });
      }
    }
  }

  const headers = [
    "Ticker",
    "Contract",
    "Exp.",
    "Strike",
    "Type",
    "Contracts",
    "Entry $",
    "Current $",
    `+${pct}% $`,
    `-${pct}% $`,
    "Current Value",
    `+${pct}% Value`,
    `-${pct}% Value`,
    "Unreal. P/L Now",
    `Realized @ +${pct}%`,
    `Realized @ -${pct}%`,
    "Breakeven (Calls)",
    "Notes",
    "",
  ];

  // CSV helpers
  const toCSV = () => {
    const csvHeaders = [
      "Ticker",
      "Contract",
      "Expiration",
      "Strike",
      "Type",
      "Contracts",
      "EntryPrice",
      "CurrentPrice",
      "Notes",
    ];
    const body = (rows as any[])
      .map((r) => [
        r.ticker,
        r.contract,
        r.expiration,
        r.strike,
        r.type,
        r.contracts,
        r.entryPrice,
        r.currentPrice,
        r.notes,
      ]
        .map((x) => (x == null ? "" : String(x).replaceAll('"', "")))
        .map((x) => `"${x}"`)
        .join(","))
      .join("\n");
    return `${csvHeaders.join(",")}\n${body}`;
  };

  const downloadCSV = () => {
    const blob = new Blob([toCSV()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `options_scenarios_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const uploadCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target as FileReader).result as string;
      if (!text || typeof text !== "string") return;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return;
      const [, ...rest] = lines;
      const parsed = rest.map((ln) => {
        const cols = ln
          .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
          .map((s) => s.replace(/^\"|\"$/g, ""));
        return {
          id: crypto.randomUUID(),
          ticker: cols[0] || "",
          contract: cols[1] || "",
          expiration: cols[2] || "",
          strike: cols[3] || "",
          type: (cols[4] || "C").toUpperCase() === "P" ? "P" : "C",
          contracts: cols[5] || "",
          entryPrice: cols[6] || "",
          currentPrice: cols[7] || "",
          notes: cols[8] || "",
        };
      });
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Options Scenario Calculator</h1>
          <p className="text-slate-600 mt-1">Add options and see +{pct}% / -{pct}% premium scenarios and realized gains.</p>
          <Nav route={route} setRoute={setRoute} />
        </header>

        {route === "portfolio" ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white rounded-2xl shadow p-3 flex items-center gap-2">
                <label className="text-sm text-slate-600">Scenario %</label>
                <input
                  type="number"
                  value={pct}
                  min={1}
                  max={95}
                  onChange={(e) => setPct(numberOr(e.target.value, 15))}
                  className="w-20 border rounded-xl px-3 py-2 text-right"
                />
              </div>
              <button onClick={addRow} className="px-4 py-2 rounded-2xl bg-black text-white shadow hover:opacity-90">Add Row</button>
              <button onClick={downloadCSV} className="px-4 py-2 rounded-2xl bg-white border shadow hover:bg-slate-100">Export CSV</button>
              <label className="px-4 py-2 rounded-2xl bg-white border shadow hover:bg-slate-100 cursor-pointer">Import CSV<input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && uploadCSV(e.target.files[0])} /></label>
            </div>

            <SummaryBar pct={pct} totals={computed.totals as any} />

            <div className="overflow-auto rounded-2xl border bg-white shadow">
              <table className="min-w-[1280px] w-full">
                <thead className="bg-slate-100">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="text-left text-sm font-semibold text-slate-700 px-3 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(computed.rows as any[]).map((r) => (
                    <tr key={r.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2"><input className="w-20 border rounded-lg px-2 py-1" value={r.ticker} onChange={(e) => updateRow(r.id, { ticker: e.target.value })} /></td>
                      <td className="px-3 py-2 flex items-center gap-2">
                        <input className="w-72 border rounded-lg px-2 py-1" value={r.contract} onChange={(e) => updateRow(r.id, { contract: e.target.value })} />
                        <button onClick={() => refreshQuote(r.id, r.contract)} className="text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">Sync</button>
                      </td>
                      <td className="px-3 py-2"><input type="date" className="border rounded-lg px-2 py-1" value={r.expiration} onChange={(e) => updateRow(r.id, { expiration: e.target.value })} /></td>
                      <td className="px-3 py-2"><DecimalInput value={r.strike} onChange={(v) => updateRow(r.id, { strike: v })} decimals={2} /></td>
                      <td className="px-3 py-2"><select className="border rounded-lg px-2 py-1" value={r.type} onChange={(e) => updateRow(r.id, { type: e.target.value })}><option value="C">C</option><option value="P">P</option></select></td>
                      <td className="px-3 py-2"><DecimalInput value={r.contracts} onChange={(v) => updateRow(r.id, { contracts: v })} decimals={0} /></td>
                      <td className="px-3 py-2"><DecimalInput value={r.entryPrice} onChange={(v) => updateRow(r.id, { entryPrice: v })} decimals={4} /></td>
                      <td className="px-3 py-2"><DecimalInput value={r.currentPrice} onChange={(v) => updateRow(r.id, { currentPrice: v })} decimals={4} /></td>
                      <td className="px-3 py-2 whitespace-nowrap">{currency(r.plusPrice)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{currency(r.minusPrice)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{currency(r.curValue)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{currency(r.plusValue)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{currency(r.minusValue)}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{currency(r.unrealNow)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-emerald-700 font-medium">{currency(r.realizedPlus)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-rose-700 font-medium">{currency(r.realizedMinus)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{Number.isFinite(r.breakevenStock) ? numberOr(r.breakevenStock).toFixed(2) : "—"}</td>
                      <td className="px-3 py-2"><input className="w-56 border rounded-lg px-2 py-1" value={r.notes} onChange={(e) => updateRow(r.id, { notes: e.target.value })} /></td>
                      <td className="px-3 py-2"><button className="text-rose-600 hover:underline" onClick={() => removeRow(r.id)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <section className="grid lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-2xl shadow p-4 space-y-3">
              <div className="font-semibold">Live Data Settings</div>
              <p className="text-sm text-slate-600">Provide an endpoint that returns <code>{`{ last: 1.23 }`}</code> for a given option <em>contract</em> text.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Endpoint URL</label>
                  <input className="w-full border rounded-xl px-3 py-2" placeholder="https://api.yourprovider.com/optionquote" value={dataFeedUrl} onChange={(e) => setDataFeedUrl(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">API Key (optional)</label>
                  <input className="w-full border rounded-xl px-3 py-2" placeholder="sk_..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={refreshAllQuotes} className="px-4 py-2 rounded-2xl bg-emerald-600 text-white shadow hover:opacity-90">Refresh All</button>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Auto-refresh</label>
                <input type="number" min={5} className="w-20 border rounded-xl px-3 py-2 text-right" value={refreshSec} onChange={(e) => setRefreshSec(numberOr(e.target.value, 15))} /><span className="text-sm text-slate-600">sec</span>
              </div>
              <p className="text-xs text-slate-500">TradingView widgets are great for underlying charts, but they don't expose an options-quote API from the browser. Use a data provider or broker API here.</p>
            </div>

            <div className="bg-white rounded-2xl shadow p-4">
              <div className="text-sm text-slate-600">How it works</div>
              <ul className="list-disc ml-5 text-sm text-slate-600 space-y-1 mt-2">
                <li>We call your endpoint with <code>?contract=</code> plus the Contract text from your table.</li>
                <li>Your endpoint returns <code>{`{ last: number }`}</code>. We place that into <em>Current $</em>.</li>
                <li>Turn on Auto-refresh to update on an interval while the Live Data page is open.</li>
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
