import React, { useEffect, useMemo, useRef, useState } from "react";
import { computeRow, numberOr, currency } from "./helpers"; // reuse your helper functions

export default function App() {
  const [rows, setRows] = useState<any[]>([
    {
      id: "1",
      ticker: "CIFR",
      contract: "CIFR Dec 19 2025 15C",
      expiration: "2025-12-19",
      strike: "15",
      type: "C",
      contracts: "1",
      entryPrice: "1.00",
      currentPrice: "1.72",
      notes: "",
    },
  ]);
  const [pct, setPct] = useState(15);

  const computed = useMemo(() => {
    const withCalcs = rows.map((row: any) => {
      const entry = numberOr(row.entryPrice);
      const cur = numberOr(row.currentPrice);
      const qty = numberOr(row.contracts);
      const strike = numberOr(row.strike);
      const res = computeRow(entry, cur, qty, strike, row.type, pct);
      return { ...row, ...res };
    });

    const totals = withCalcs.reduce(
      (acc: any, r: any) => {
        acc.curValue += numberOr(r.curValue, 0);
        acc.unrealNow += numberOr(r.unrealNow, 0);
        acc.realizedPlus += numberOr(r.realizedPlus, 0);
        acc.realizedMinus += numberOr(r.realizedMinus, 0);
        return acc;
      },
      { curValue: 0, unrealNow: 0, realizedPlus: 0, realizedMinus: 0 }
    );

    return { rows: withCalcs, totals };
  }, [rows, pct]);

  const addRow = () =>
    setRows((r) => [
      ...r,
      {
        id: crypto.randomUUID(),
        ticker: "",
        contract: "",
        expiration: "",
        strike: "",
        type: "C",
        contracts: "1",
        entryPrice: "0.00",
        currentPrice: "0.00",
        notes: "",
      },
    ]);

  const removeRow = (id: string) =>
    setRows((r) => r.filter((x) => x.id !== id));

  const updateRow = (id: string, patch: Record<string, any>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 p-4 sm:p-8">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl p-6 shadow-lg mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            📈 Options Scenario Calculator
          </h1>
          <p className="text-indigo-100 mt-2">
            Manage your contracts with instant gain/loss scenarios.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white text-slate-800 rounded-lg shadow px-3 py-2 flex items-center gap-2">
            <label className="text-sm font-medium">Scenario %</label>
            <input
              type="number"
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-20 border rounded-md px-2 py-1 text-right focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <button
            onClick={addRow}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow"
          >
            ➕ Add Row
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <h2 className="text-sm font-medium text-slate-500">Portfolio Value</h2>
          <p className="text-2xl font-bold text-slate-800">
            {currency(computed.totals.curValue)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <h2 className="text-sm font-medium text-slate-500">Unrealized P/L</h2>
          <p className="text-2xl font-bold text-emerald-600">
            {currency(computed.totals.unrealNow)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <h2 className="text-sm font-medium text-slate-500">
            Realized @ +{pct}%
          </h2>
          <p className="text-2xl font-bold text-emerald-600">
            {currency(computed.totals.realizedPlus)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <h2 className="text-sm font-medium text-slate-500">
            Realized @ -{pct}%
          </h2>
          <p className="text-2xl font-bold text-rose-600">
            {currency(computed.totals.realizedMinus)}
          </p>
        </div>
      </section>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-white shadow">
        <table className="min-w-full">
          <thead className="bg-slate-100">
            <tr>
              {[
                "Contract",
                "Entry",
                "Current",
                `+${pct}%`,
                `-${pct}%`,
                "Unrealized P/L",
                "Notes",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-sm font-semibold text-slate-700 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {computed.rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-3">{r.contract}</td>
                <td className="px-4 py-3">{currency(r.entryPrice)}</td>
                <td className="px-4 py-3">{currency(r.currentPrice)}</td>
                <td className="px-4 py-3 text-emerald-600">
                  {currency(r.plusPrice)}
                </td>
                <td className="px-4 py-3 text-rose-600">
                  {currency(r.minusPrice)}
                </td>
                <td className="px-4 py-3 font-medium">
                  {currency(r.unrealNow)}
                </td>
                <td className="px-4 py-3">
                  <input
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    value={r.notes}
                    onChange={(e) =>
                      updateRow(r.id, { notes: e.target.value })
                    }
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="text-rose-600 hover:underline text-sm"
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
  );
}
