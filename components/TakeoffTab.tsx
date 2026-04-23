"use client";

import { useMemo, useState } from "react";
import {
  BOLD_COLUMNS_DEFAULT,
  CUSTOMER_ABBR,
  DEFAULT_COLORS,
  MAPPABLE_COLUMNS,
  columnLabel,
  normKey,
} from "@/lib/constants";
import { CROSSREF_BRANDS } from "@/lib/crossref-data";
import {
  CUSTOMER_OPTIONS,
  CustomerOption,
  brandForCategory,
} from "@/lib/customers";
import { downloadBase64, fileToBase64 } from "@/lib/download";

type Mapping = Record<string, string>;
type Row = Record<string, string>;

interface ParseResult {
  columns: string[];
  mapping: Mapping;
  preview: Row[];
  total_rows: number;
}

interface RowCategoryInfo {
  category: string;
  brands_in_category: string[];
}

interface GenerateResult {
  filename: string;
  content_b64: string;
  mime: string;
  preview_rows: Row[];
  preview_columns: string[];
  row_categories: Record<string, RowCategoryInfo>;
}

export default function TakeoffTab() {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [customer, setCustomer] = useState<CustomerOption>("None");
  const [targetBrand, setTargetBrand] = useState("");
  const boldColsText = BOLD_COLUMNS_DEFAULT;
  const colors = DEFAULT_COLORS;
  const projectName = "";
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");

  type Override = { target_brand?: string; xmodel?: string };
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [xmodelCandidates, setXmodelCandidates] = useState<Record<string, string[]>>({});
  const [overrideLoading, setOverrideLoading] = useState<Record<string, boolean>>({});

  async function onUpload(f: File) {
    setFile(f);
    setParsing(true);
    setError("");
    setResult(null);
    try {
      const b64 = await fileToBase64(f);
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: f.name, data_b64: b64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      setParsed(data);
      setMapping(data.mapping);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  type XProduct = { key: string; product: string; brand: string; model: string };
  const uniqueXProducts = useMemo<XProduct[]>(() => {
    if (!result) return [];
    const seen = new Map<string, XProduct>();
    let currentProduct = "";
    for (const r of result.preview_rows) {
      const p = (r["PRODUCT"] || "").trim();
      if (p && !p.endsWith(" Total") && p !== "Grand Total") {
        currentProduct = p;
      }
      const b = (r["BRAND"] || "").trim();
      const m = (r["MODEL"] || "").trim();
      if (!b && !m) continue;
      const key = `${normKey(b)}|${normKey(m)}`;
      if (!seen.has(key)) {
        seen.set(key, { key, product: currentProduct, brand: b, model: m });
      }
    }
    return Array.from(seen.values());
  }, [result]);

  function splitModels(s: string): string[] {
    return (s || "").split(",").map((x) => x.trim()).filter(Boolean);
  }

  function defaultBrandFor(key: string): string {
    if (customer !== "None" && result) {
      const cat = result.row_categories?.[key]?.category || "";
      return brandForCategory(customer, cat);
    }
    return targetBrand;
  }

  function brandsForRow(key: string): string[] {
    const info = result?.row_categories?.[key];
    const fromCat = info?.brands_in_category;
    if (fromCat && fromCat.length > 0) return fromCat;
    // Fallback: unknown category → show full brand list
    return CROSSREF_BRANDS;
  }

  function effectiveXBrand(key: string): string {
    const o = overrides[key];
    if (o && "target_brand" in o) return o.target_brand ?? "";
    return defaultBrandFor(key);
  }

  function getCandidates(key: string, originalXModel: string): string[] {
    const o = overrides[key];
    const def = defaultBrandFor(key);
    if (o && "target_brand" in o && o.target_brand !== def) {
      return xmodelCandidates[key] ?? [];
    }
    return splitModels(originalXModel);
  }

  function effectiveXModel(key: string, originalXModel: string): string {
    const pick = overrides[key]?.xmodel;
    if (pick !== undefined) return pick;
    return getCandidates(key, originalXModel).join(", ");
  }

  function deleteKey<T>(rec: Record<string, T>, key: string): Record<string, T> {
    const out = { ...rec };
    delete out[key];
    return out;
  }

  async function onBrandChange(row: XProduct, newBrand: string) {
    const def = defaultBrandFor(row.key);
    if (newBrand === def) {
      setOverrides((prev) => deleteKey(prev, row.key));
      setXmodelCandidates((prev) => deleteKey(prev, row.key));
      return;
    }
    if (!newBrand) {
      setOverrides((prev) => ({
        ...prev,
        [row.key]: { target_brand: "", xmodel: "" },
      }));
      setXmodelCandidates((prev) => ({ ...prev, [row.key]: [] }));
      return;
    }
    setOverrides((prev) => ({
      ...prev,
      [row.key]: { target_brand: newBrand },
    }));
    setOverrideLoading((p) => ({ ...p, [row.key]: true }));
    try {
      const res = await fetch("/api/crossref-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          src_brand: row.brand,
          src_model: row.model,
          target_brand: newBrand,
        }),
      });
      const data = await res.json();
      setXmodelCandidates((prev) => ({
        ...prev,
        [row.key]: splitModels(data.xmodel || ""),
      }));
    } finally {
      setOverrideLoading((p) => ({ ...p, [row.key]: false }));
    }
  }

  function onModelPick(row: XProduct, pickedModel: string) {
    setOverrides((prev) => {
      const cur = prev[row.key] ?? {};
      const next: Override = { ...cur };
      if (pickedModel) {
        next.xmodel = pickedModel;
      } else {
        delete next.xmodel;
      }
      if (next.target_brand === undefined && next.xmodel === undefined) {
        return deleteKey(prev, row.key);
      }
      return { ...prev, [row.key]: next };
    });
  }

  function buildGeneratePayload(b64: string) {
    let baseName = "";
    if (customer !== "None" && projectName.trim()) {
      baseName = `Takeoff_${CUSTOMER_ABBR[customer] ?? customer}-${projectName.trim()}`;
    }
    const boldCols = boldColsText.split(",").map((s) => s.trim()).filter(Boolean);
    return {
      filename: file!.name,
      data_b64: b64,
      mapping,
      manual_products: null,
      manual_tags_by_product: {},
      bold_cols: boldCols,
      colors,
      base_name: baseName,
      target_brand: customer === "None" ? (targetBrand || "") : "",
      customer: customer === "None" ? "" : customer,
    };
  }

  async function onRegenerateWithOverrides() {
    if (!file || !parsed) return;
    setGenerating(true);
    setError("");
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch("/api/generate-takeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildGeneratePayload(b64),
          crossref_overrides: overrides,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regenerate failed");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function onGenerate() {
    if (!file || !parsed) return;
    setGenerating(true);
    setError("");
    setOverrides({});
    setXmodelCandidates({});
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch("/api/generate-takeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGeneratePayload(b64)),
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

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="text-base font-semibold mb-3">1. Upload raw takeoff</h2>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {parsing && <p className="text-sm text-slate-500 mt-2">Parsing...</p>}
        {parsed && (
          <p className="text-sm text-green-700 mt-2">
            Parsed {parsed.total_rows} rows, {parsed.columns.length} columns.
          </p>
        )}
        {error && (
          <p className="text-sm text-red-700 mt-2 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}
      </section>

      {parsed && (
        <>
          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-semibold mb-3">2. Column mapping (target → source)</h2>
            <p className="text-xs text-slate-500 mb-3">
              XBRAND / XMODEL are derived from the Cross-reference selection below and don&apos;t need mapping.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {MAPPABLE_COLUMNS.map((c) => (
                <div key={c}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{columnLabel(c)}</label>
                  <select
                    value={mapping[c] || ""}
                    onChange={(e) => setMapping({ ...mapping, [c]: e.target.value })}
                    className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                  >
                    <option value="">(none)</option>
                    {parsed.columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-semibold mb-3">
              3. Customer&apos;s Cross-reference brand{" "}
              <span className="text-xs text-slate-500 font-normal">
                (optional — fills XBRAND / XMODEL)
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Customer</label>
                <select
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value as CustomerOption)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                >
                  {CUSTOMER_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {customer === "Haldeman" && (
                  <p className="text-xs text-slate-500 mt-2">
                    Auto-fills XBRAND per product category: grilles/registers/diffusers →{" "}
                    <span className="font-medium">Krueger</span>, louvers →{" "}
                    <span className="font-medium">Ruskin</span>, fans →{" "}
                    <span className="font-medium">Loren Cook</span>.
                  </p>
                )}
              </div>
              {customer === "None" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Target brand (XBRAND)
                  </label>
                  <select
                    value={targetBrand}
                    onChange={(e) => setTargetBrand(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                  >
                    <option value="">(none — leave XBRAND/XMODEL empty)</option>
                    {CROSSREF_BRANDS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <button
              onClick={onGenerate}
              disabled={generating}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-md font-medium hover:bg-blue-700 disabled:bg-blue-300"
            >
              {generating ? "Generating..." : "Generate Triune Takeoff Haldeman"}
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
                    Preview: first 500 rows ({result.preview_rows.length} shown)
                  </span>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        {result.preview_columns.map((c) => (
                          <th key={c} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                            {columnLabel(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.preview_rows.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          {result.preview_columns.map((c) => (
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

          {result && uniqueXProducts.length > 0 && (
            <section className="bg-white rounded-lg border border-slate-200 p-5">
              <h2 className="text-base font-semibold mb-1">
                4. Convert to X cross-reference (per-product)
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                {customer === "None" ? (
                  <>
                    Default target brand for every row is{" "}
                    <span className="font-medium">{targetBrand || "(none)"}</span>.
                  </>
                ) : (
                  <>
                    Target brand per row is chosen automatically from the{" "}
                    <span className="font-medium">{customer}</span> rules based on each row&apos;s
                    category.
                  </>
                )}{" "}
                The XBRAND dropdown below only lists brands available in the row&apos;s category.
                Click <span className="font-medium">Re-generate with overrides</span> to rebuild
                the Excel with your selections.
              </p>

              <div className="overflow-x-auto border border-slate-200 rounded mb-4">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Product</th>
                      <th className="px-2 py-1.5 text-left font-medium">Category</th>
                      <th className="px-2 py-1.5 text-left font-medium">SCHEDULE BRAND</th>
                      <th className="px-2 py-1.5 text-left font-medium">SCHEDULE MODEL</th>
                      <th className="px-2 py-1.5 text-left font-medium">BRAND (target)</th>
                      <th className="px-2 py-1.5 text-left font-medium">MODEL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueXProducts.map((row, i) => {
                      const currentXBrand = effectiveXBrand(row.key);
                      const originalXModel =
                        result.preview_rows.find(
                          (r) =>
                            normKey(r["BRAND"] || "") === normKey(row.brand) &&
                            normKey(r["MODEL"] || "") === normKey(row.model)
                        )?.["XMODEL"] || "";
                      const candidates = getCandidates(row.key, originalXModel);
                      const pickedModel = overrides[row.key]?.xmodel;
                      const effective = effectiveXModel(row.key, originalXModel);
                      const loading = !!overrideLoading[row.key];
                      const brandOverridden =
                        overrides[row.key]?.target_brand !== undefined;
                      const modelOverridden = pickedModel !== undefined;
                      const rowCat = result.row_categories?.[row.key]?.category || "";
                      const brandOptions = brandsForRow(row.key);
                      return (
                        <tr key={row.key} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="px-2 py-1 whitespace-nowrap">{row.product}</td>
                          <td className="px-2 py-1 whitespace-nowrap text-slate-500">
                            {rowCat || <span className="italic">—</span>}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap font-medium">{row.brand}</td>
                          <td className="px-2 py-1 whitespace-nowrap font-mono">{row.model}</td>
                          <td className="px-2 py-1">
                            <select
                              value={currentXBrand}
                              onChange={(e) => onBrandChange(row, e.target.value)}
                              className={`text-xs border rounded px-2 py-1 bg-white ${
                                brandOverridden
                                  ? "border-blue-500 ring-1 ring-blue-200"
                                  : "border-slate-300"
                              }`}
                            >
                              <option value="">(none)</option>
                              {brandOptions.map((b) => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1 font-mono">
                            {loading ? (
                              <span className="text-slate-400">looking up...</span>
                            ) : candidates.length === 0 ? (
                              <span className="text-slate-400 italic">no equivalent</span>
                            ) : candidates.length === 1 ? (
                              <span>{effective}</span>
                            ) : (
                              <select
                                value={pickedModel ?? ""}
                                onChange={(e) => onModelPick(row, e.target.value)}
                                className={`text-xs border rounded px-2 py-1 bg-white font-mono ${
                                  modelOverridden
                                    ? "border-blue-500 ring-1 ring-blue-200"
                                    : "border-slate-300"
                                }`}
                              >
                                <option value="">
                                  All ({candidates.length}): {candidates.join(", ")}
                                </option>
                                {candidates.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onRegenerateWithOverrides}
                  disabled={generating}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {generating
                    ? "Re-generating..."
                    : `🔄 Re-generate with overrides${
                        Object.keys(overrides).length > 0
                          ? ` (${Object.keys(overrides).length})`
                          : ""
                      }`}
                </button>
                {Object.keys(overrides).length > 0 && (
                  <button
                    onClick={() => {
                      setOverrides({});
                      setXmodelCandidates({});
                    }}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Clear overrides
                  </button>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
