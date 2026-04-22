"use client";

import { useState } from "react";
import { downloadBase64, fileToBase64 } from "@/lib/download";

type Row = Record<string, string>;

interface InspectResult {
  raw_columns: string[];
  unit_columns: string[];
  raw_unit_col: string;
  matrix_unit_col: string;
  multiplier_col: string;
  units_list: string[];
  raw_preview: Row[];
}

interface GenerateResult {
  filename: string;
  content_b64: string;
  mime: string;
  preview_rows: Row[];
  preview_columns: string[];
}

export default function DataUnitTab() {
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [unitFile, setUnitFile] = useState<File | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspected, setInspected] = useState<InspectResult | null>(null);
  const [error, setError] = useState("");

  const [rawUnitCol, setRawUnitCol] = useState("");
  const [matrixUnitCol, setMatrixUnitCol] = useState("");
  const [multiplierCol, setMultiplierCol] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeEmpty, setIncludeEmpty] = useState(true);
  const [splitByUnit, setSplitByUnit] = useState(false);
  const [outBase, setOutBase] = useState("Data_Unit_Sheet");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function onInspect() {
    if (!rawFile || !unitFile) {
      setError("Please upload both files.");
      return;
    }
    setInspecting(true);
    setError("");
    setResult(null);
    try {
      const [rawB64, unitB64] = await Promise.all([
        fileToBase64(rawFile),
        fileToBase64(unitFile),
      ]);
      const res = await fetch("/api/generate-data-unit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "inspect",
          raw_filename: rawFile.name,
          raw_b64: rawB64,
          unit_filename: unitFile.name,
          unit_b64: unitB64,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Inspect failed");
      setInspected(data);
      setRawUnitCol(data.raw_unit_col || "");
      setMatrixUnitCol(data.matrix_unit_col || "");
      setMultiplierCol(data.multiplier_col || "");
      setSelected(new Set(data.units_list));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInspecting(false);
    }
  }

  async function onGenerate() {
    if (!rawFile || !unitFile) return;
    setGenerating(true);
    setError("");
    try {
      const [rawB64, unitB64] = await Promise.all([
        fileToBase64(rawFile),
        fileToBase64(unitFile),
      ]);
      const res = await fetch("/api/generate-data-unit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          raw_filename: rawFile.name,
          raw_b64: rawB64,
          unit_filename: unitFile.name,
          unit_b64: unitB64,
          raw_unit_col: rawUnitCol,
          matrix_unit_col: matrixUnitCol,
          multiplier_col: multiplierCol || null,
          selected_units: Array.from(selected),
          include_empty: includeEmpty,
          split_by_unit: splitByUnit,
          out_base: outBase,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generate failed");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function onDownload() {
    if (!result) return;
    downloadBase64(result.content_b64, result.filename, result.mime);
  }

  function toggleUnit(u: string) {
    const next = new Set(selected);
    next.has(u) ? next.delete(u) : next.add(u);
    setSelected(next);
  }
  function toggleAll() {
    if (!inspected) return;
    if (selected.size === inspected.units_list.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(inspected.units_list));
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="text-base font-semibold mb-3">1. Upload files</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Raw Takeoff (CSV or Excel)
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setRawFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {rawFile && <p className="text-xs text-slate-500 mt-1">{rawFile.name}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Unit Matrix (CSV or Excel)
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setUnitFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {unitFile && <p className="text-xs text-slate-500 mt-1">{unitFile.name}</p>}
          </div>
        </div>
        <button
          onClick={onInspect}
          disabled={!rawFile || !unitFile || inspecting}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300"
        >
          {inspecting ? "Inspecting..." : "Inspect files"}
        </button>
        {error && (
          <p className="text-sm text-red-700 mt-3 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
      </section>

      {inspected && (
        <>
          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-semibold mb-3">2. Confirm columns</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Raw unit column
                </label>
                <select
                  value={rawUnitCol}
                  onChange={(e) => setRawUnitCol(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                >
                  {inspected.raw_columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Matrix unit column
                </label>
                <select
                  value={matrixUnitCol}
                  onChange={(e) => setMatrixUnitCol(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                >
                  {inspected.unit_columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Multiplier column
                </label>
                <select
                  value={multiplierCol}
                  onChange={(e) => setMultiplierCol(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                >
                  <option value="">(none — default multiplier 1)</option>
                  {inspected.unit_columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">
                3. Select units ({selected.size} / {inspected.units_list.length})
              </h2>
              <button
                onClick={toggleAll}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {selected.size === inspected.units_list.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-80 overflow-y-auto">
              {inspected.units_list.map((u) => (
                <label key={u} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={selected.has(u)}
                    onChange={() => toggleUnit(u)}
                  />
                  <span className="truncate">{u}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-semibold mb-3">4. Output options</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Output filename (without extension)
                </label>
                <input
                  type="text"
                  value={outBase}
                  onChange={(e) => setOutBase(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                />
              </div>
              <label className="flex items-center gap-2 text-sm pt-6">
                <input
                  type="checkbox"
                  checked={includeEmpty}
                  onChange={(e) => setIncludeEmpty(e.target.checked)}
                />
                Include empty-unit rows
              </label>
              <label className="flex items-center gap-2 text-sm pt-6">
                <input
                  type="checkbox"
                  checked={splitByUnit}
                  onChange={(e) => setSplitByUnit(e.target.checked)}
                />
                Split into separate Excel per unit (ZIP)
              </label>
            </div>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <button
              onClick={onGenerate}
              disabled={generating}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-md font-medium hover:bg-blue-700 disabled:bg-blue-300"
            >
              {generating ? "Generating..." : "🔁 Generate Data Unit Sheet"}
            </button>

            {result && (
              <div className="mt-5">
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={onDownload}
                    className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700"
                  >
                    📥 Download {result.filename}
                  </button>
                  <span className="text-xs text-slate-500">
                    Preview: first 200 rows
                  </span>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        {result.preview_columns.slice(0, 15).map((c) => (
                          <th key={c} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.preview_rows.slice(0, 50).map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          {result.preview_columns.slice(0, 15).map((c) => (
                            <td key={c} className="px-2 py-1 whitespace-nowrap">
                              {r[c]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
