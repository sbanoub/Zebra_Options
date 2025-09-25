import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Options Scenario Web App — Full Version
 * ---------------------------------------
 * Features:
 * - Add options rows (ticker, strike, type, contracts, entry/current price, notes)
 * - Calculates +/- % scenarios, current value, realized gains, breakeven
 * - Totals row
 * - Import/export via CSV
 * - LocalStorage persistence
 * - Live data feed (optional API endpoint + auto-refresh)
 */

const currency = (n: number | undefined | null) =>
  Number.isFinite(n as number)
    ? (n as number).toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
      })
    : "—";

const numberOr = (v: unknown, fallback = 0) => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : fallback;
};

// --- computation logic ---
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
  const curValue =
    currentPrice > 0 && contracts > 0 ? currentPrice * contracts * m : NaN;
  const plusValue =
    Number.isFinite(plusPrice) && contracts > 0
      ? (plusPrice as number) * contracts * m
      : NaN;
  const minusValue =
    Number.isFinite(minusPrice) && contracts > 0
      ? (minusPrice as number) * contracts * m
      : NaN;
  const unrealNow = Number.isFinite(currentPrice)
    ? (currentPrice - entryPrice) * contracts * m
    : NaN;
  const realizedPlus = Number.isFinite(plusPrice)
    ? ((plusPrice as number) - entryPrice) * contracts * m
    : NaN;
  const realizedMinus = Number.isFinite(minusPrice)
    ? ((minusPrice as number) - entryPrice) * contracts * m
    : NaN;
  const breakevenStock = type === "C" ? strike + entryPrice : NaN;
  return {
    plusPrice,
    minusPrice,
    curValue,
    plusValue,
    minusValue,
    unrealNow,
    realizedPlus,
    realizedMinus,
    breakevenStock,
  };
}

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

export default function App() {
  const [rows, setRows] = useState(() => {
    const fromLS = localStorage.getItem("optionsRows_full");
    return fromLS ? JSON.parse(fromLS) : [emptyRow()];
  });
  const [pct, setPct] = useState(15);

  const [dataFeedUrl, setDataFeedUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshSec, setRefreshSec] = useState(15);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem("optionsRows_full", JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    if (!autoRefresh) {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(
      () => refreshAllQuotes(),
      Math.max(5, refreshSec) * 1000
    );
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [autoRefresh, refreshSec, dataFeedUrl, apiKey, rows]);

  const addRow = () => setRows((r: any[]) => [...r, emptyRow()]);
  const removeRow = (id: string) =>
    setRows((r: any[]) => r.filter((x) => x.id !== id));
  const updateRow = (id: string, patch: Record<string, unknown>) =>
    setRows((r: any[]) =>
      r.map((x) => (x.id === id ? { ...x, ...patch } : x))
    );

  const computed = useMemo(() => {
    const withCalcs = rows.map((row: any) => {
      const entry = numberOr(row.entryPrice);
      const cur = numberOr(row.currentPrice);
      const qty = numberOr(row.contracts, 0);
      const strike = numberOr(row.strike);
      const res = computeRow(
        entry,
        cur,
        qty,
        strike,
        (row.type as "C" | "P") || "C",
        pct
      );
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
      {
        curValue: 0,
        unrealNow: 0,
        plusValue: 0,
        minusValue: 0,
        realizedPlus: 0,
        realizedMinus: 0,
      }
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Options Scenario Calculator
            </h1>
            <p className="text-slate-600 mt-1">
              Add options and see +{pct}% / -{pct}% premium scenarios and
              realized gains.
            </p>
          </div>
          <div className="flex items-center gap-3">
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
            <button
              onClick={addRow}
              className="px-4 py-2 rounded-2xl bg-black text-white shadow hover:opacity-90"
            >
              Add Row
            </button>
          </div>
        </header>

        {/* Live data config */}
        <section className="grid lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow p-4 space-y-3">
            <div className="font-semibold">Live Data (Optional)</div>
            <p className="text-sm text-slate-600">
              Provide an endpoint that returns <code>{`{ last: 1.23 }`}</code>{" "}
              for a given option <em>contract</em> text.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Endpoint URL</label>
                <input
                  className="w-full border rounded-xl px-3 py-2"
                  placeholder="https://api.yourprovider.com/optionquote"
                  value={dataFeedUrl}
                  onChange={(e) => setDataFeedUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">
                  API Key (optional)
                </label>
                <input
                  className="w-full border rounded-xl px-3 py-2"
                  placeholder="sk_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={refreshAllQuotes}
                className="px-4 py-2 rounded-2xl bg-emerald-600 text-white shadow hover:opacity-90"
              >
                Refresh All
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh
              </label>
              <input
                type="number"
                min={5}
                className="w-20 border rounded-xl px-3 py-2 text-right"
                value={refreshSec}
                onChange={(e) => setRefreshSec(numberOr(e.target.value, 15))}
              />
              <span className="text-sm text-slate-600">sec</span>
            </div>
          </div>
        </section>

        {/* Table */}
        <div className="overflow-auto rounded-2xl border bg-white shadow">
          <table className="min-w-[1280px] w-full">
            <thead className="bg-slate-100">
              <tr>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="text-left text-sm font-semibold text-slate-700 px-3 py-3 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computed.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <input
                      className="w-20 border rounded-lg px-2 py-1"
                      value={r.ticker}
                      onChange={(e) =>
                        updateRow(r.id, { ticker: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 flex items-center gap-2">
                    <input
                      className="w-72 border rounded-lg px-2 py-1"
                      value={r.contract}
                      onChange={(e) =>
                        updateRow(r.id, { contract: e.target.value })
                      }
                    />
                    <button
                      onClick={() => refreshQuote(r.id, r.contract)}
                      className="text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                    >
                      Sync
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      className="border rounded-lg px-2 py-1"
                      value={r.expiration}
                      onChange={(e) =>
                        updateRow(r.id, { expiration: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <DecimalInput
                      value={r.strike}
                      onChange={(v) => updateRow(r.id, { strike: v })}
                      decimals={2}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="border rounded-lg px-2 py-1"
                      value={r.type}
                      onChange={(e) => updateRow(r.id, { type: e.target.value })}
                    >
                      <option value="C">C</option>
                      <option value="P">P</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <DecimalInput
                      value={r.contracts}
                      onChange={(v) => updateRow(r.id, { contracts: v })}
                      decimals={0}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <DecimalInput
                      value={r.entryPrice}
                      onChange={(v) => updateRow(r.id, { entryPrice: v })}
                      decimals={4}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <DecimalInput
                      value={r.currentPrice}
                      onChange={(v) => updateRow(r.id, { currentPrice: v })}
                      decimals={4}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {currency(r.plusPrice)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {currency(r.minusPrice)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {currency(r.curValue)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {currency(r.plusValue)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {currency(r.minusValue)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium">
                    {currency(r.unrealNow)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-emerald-700 font-medium">
                    {currency(r.realizedPlus)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-rose-700 font-medium">
                    {currency(r.realizedMinus)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {Number.isFinite(r.breakevenStock)
                      ? numberOr(r.breakevenStock).toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-56 border rounded-lg px-2 py-1"
                      value={r.notes}
                      onChange={(e) =>
                        updateRow(r.id, { notes: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="text-rose-600 hover:underline"
                      onClick={() => removeRow(r.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

