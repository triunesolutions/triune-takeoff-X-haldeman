"use client";

import { useMemo, useState } from "react";
import {
  BOLD_COLUMNS_DEFAULT,
  CUSTOMER_ABBR,
  DEFAULT_COLORS,
  MAPPABLE_COLUMNS,
  TRIUNE_COLUMNS,
  normKey,
} from "@/lib/constants";
import { CROSSREF_BRANDS } from "@/lib/crossref-data";
import { downloadBase64, fileToBase64 } from "@/lib/download";

type Mapping = Record<string, string>;
type Row = Record<string, string>;

interface ParseResult {
  columns: string[];
  mapping: Mapping;
  preview: Row[];
  total_rows: number;
}

interface GenerateResult {
  filename: string;
  content_b64: string;
  mime: string;
  preview_rows: Row[];
  preview_columns: string[];
}

export default function TakeoffTab() {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [manualProductsText, setManualProductsText] = useState("");
  const [perProductTagsText, setPerProductTagsText] = useState<Record<string, string>>({});
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [boldColsText, setBoldColsText] = useState(BOLD_COLUMNS_DEFAULT);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [customer, setCustomer] = useState("(None)");
  const [projectName, setProjectName] = useState("");
  const [targetBrand, setTargetBrand] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");

  // Per-product cross-ref overrides (key = "<normBrand>|<normModel>")
  // shape: { target_brand?: string; xmodel?: string }
  //   target_brand present → user picked a different XBRAND
  //   xmodel present       → user picked a specific model from a multi-list
  type Override = { target_brand?: string; xmodel?: string };
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  // Cached candidate models per row (from live lookup when XBRAND changed)
  const [xmodelCandidates, setXmodelCandidates] = useState<Record<string, string[]>>({});
  const [overrideLoading, setOverrideLoading] = useState<Record<string, boolean>>({});

  const mappedRows = useMemo<Row[]>(() => {
    if (!parsed) return [];
    return parsed.preview.map((r) => {
      const out: Row = {};
      for (const c of MAPPABLE_COLUMNS) {
        const src = mapping[c];
        out[c] = src && r[src] !== undefined ? String(r[src]) : "";
      }
      return out;
    });
  }, [parsed, mapping]);

  const detectedProducts = useMemo<string[]>(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of mappedRows) {
      const p = r["PRODUCT"] || "";
      if (p && !seen.has(p)) {
        seen.add(p);
        list.push(p);
      }
    }
    return list;
  }, [mappedRows]);

  const productsOrdered = useMemo<string[]>(() => {
    const manualLines = manualProductsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (manualLines.length === 0) return detectedProducts;
    const byNorm = new Map(detectedProducts.map((p) => [normKey(p), p]));
    const ordered: string[] = [];
    const usedNorms = new Set<string>();
    for (const line of manualLines) {
      const n = normKey(line);
      const orig = byNorm.get(n);
      if (orig && !usedNorms.has(n)) {
        ordered.push(orig);
        usedNorms.add(n);
      }
    }
    for (const p of detectedProducts) {
      if (!usedNorms.has(normKey(p))) ordered.push(p);
    }
    return ordered;
  }, [detectedProducts, manualProductsText]);

  const tagsForSelected = useMemo<string[]>(() => {
    if (!selectedProduct) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of mappedRows) {
      if ((r["PRODUCT"] || "") !== selectedProduct) continue;
      const t = r["TAG"] || "";
      if (t && !seen.has(t)) {
        seen.add(t);
        list.push(t);
      }
    }
    return list;
  }, [mappedRows, selectedProduct]);

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
      setManualProductsText("");
      setPerProductTagsText({});
      setSelectedProduct("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  // Unique source (BRAND, MODEL) combos from the generated preview, with their product label
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

  function effectiveXBrand(key: string): string {
    return overrides[key]?.target_brand ?? targetBrand;
  }

  function getCandidates(key: string, originalXModel: string): string[] {
    const brandOv = overrides[key]?.target_brand;
    if (brandOv !== undefined && brandOv !== targetBrand) {
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
    // Same as global default → clear override entirely
    if (newBrand === targetBrand) {
      setOverrides((prev) => deleteKey(prev, row.key));
      setXmodelCandidates((prev) => deleteKey(prev, row.key));
      return;
    }
    // "(none)" explicitly selected — blank XBRAND and XMODEL for this row
    if (!newBrand) {
      setOverrides((prev) => ({
        ...prev,
        [row.key]: { target_brand: "", xmodel: "" },
      }));
      setXmodelCandidates((prev) => ({ ...prev, [row.key]: [] }));
      return;
    }
    // Different brand → look up candidates
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
      // If row has no differences from the global default, drop the entry
      if (next.target_brand === undefined && next.xmodel === undefined) {
        return deleteKey(prev, row.key);
      }
      return { ...prev, [row.key]: next };
    });
  }

  async function onRegenerateWithOverrides() {
    if (!file || !parsed) return;
    setGenerating(true);
    setError("");
    try {
      const b64 = await fileToBase64(file);
      const manualProducts = manualProductsText
        .split("\n").map((s) => s.trim()).filter(Boolean);
      const manual_tags_by_product: Record<string, string[]> = {};
      for (const [pnorm, txt] of Object.entries(perProductTagsText)) {
        const lines = txt.split("\n").map((s) => s.trim()).filter(Boolean);
        if (lines.length) manual_tags_by_product[pnorm] = lines;
      }
      let baseName = "";
      if (customer !== "(None)" && projectName.trim()) {
        baseName = `Takeoff_${CUSTOMER_ABBR[customer]}-${projectName.trim()}`;
      }
      const boldCols = boldColsText.split(",").map((s) => s.trim()).filter(Boolean);

      const res = await fetch("/api/generate-takeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          data_b64: b64,
          mapping,
          manual_products: manualProducts.length ? manualProducts : null,
          manual_tags_by_product,
          bold_cols: boldCols,
          colors,
          base_name: baseName,
          target_brand: targetBrand || "",
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
    // Reset overrides on fresh generation
    setOverrides({});
    setXmodelCandidates({});
    try {
      const b64 = await fileToBase64(file);

      const manualProducts = manualProductsText
        .split("\n").map((s) => s.trim()).filter(Boolean);

      const manual_tags_by_product: Record<string, string[]> = {};
      for (const [pnorm, txt] of Object.entries(perProductTagsText)) {
        const lines = txt.split("\n").map((s) => s.trim()).filter(Boolean);
        if (lines.length) manual_tags_by_product[pnorm] = lines;
      }

      let baseName = "";
      if (customer !== "(None)" && projectName.trim()) {
        baseName = `Takeoff_${CUSTOMER_ABBR[customer]}-${projectName.trim()}`;
      }

      const boldCols = boldColsText.split(",").map((s) => s.trim()).filter(Boolean);

      const res = await fetch("/api/generate-takeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          data_b64: b64,
          mapping,
          manual_products: manualProducts.length ? manualProducts : null,
          manual_tags_by_product,
          bold_cols: boldCols,
          colors,
          base_name: baseName,
          target_brand: targetBrand || "",
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

  function updatePerProductTags(productNormKey: string, value: string) {
    setPerProductTagsText((prev) => ({ ...prev, [productNormKey]: value }));
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
                  <label className="block text-xs font-medium text-slate-600 mb-1">{c}</label>
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
              3. Manual PRODUCT ordering <span className="text-xs text-slate-500 font-normal">(one per line — leave empty for auto)</span>
            </h2>
            <textarea
              value={manualProductsText}
              onChange={(e) => setManualProductsText(e.target.value)}
              placeholder={detectedProducts.join("\n")}
              rows={Math.min(Math.max(detectedProducts.length, 4), 12)}
              className="w-full text-sm border border-slate-300 rounded p-2 font-mono"
            />
            <p className="text-xs text-slate-500 mt-2">
              Detected {detectedProducts.length} unique products.
              Preview order: {productsOrdered.slice(0, 5).join(" → ")}
              {productsOrdered.length > 5 ? " → ..." : ""}
            </p>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-semibold mb-3">4. Per-product TAG ordering</h2>
            {productsOrdered.length > 0 ? (
              <>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Select product
                  </label>
                  <select
                    value={selectedProduct || productsOrdered[0]}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="w-full md:w-96 text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                  >
                    {productsOrdered.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                {(() => {
                  const activeProduct = selectedProduct || productsOrdered[0];
                  const activeNorm = normKey(activeProduct);
                  const value = perProductTagsText[activeNorm] ?? "";
                  return (
                    <>
                      <textarea
                        value={value}
                        onChange={(e) => updatePerProductTags(activeNorm, e.target.value)}
                        placeholder={tagsForSelected.join("\n")}
                        rows={Math.min(Math.max(tagsForSelected.length, 4), 10)}
                        className="w-full text-sm border border-slate-300 rounded p-2 font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        {tagsForSelected.length} tags detected for this product.
                      </p>
                    </>
                  );
                })()}
              </>
            ) : (
              <p className="text-sm text-slate-500">Map PRODUCT and TAG columns to see products.</p>
            )}
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-semibold mb-3">
              5. Cross-reference brand <span className="text-xs text-slate-500 font-normal">(optional — fills XBRAND / XMODEL)</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="text-xs text-slate-500 pt-6">
                XMODEL is looked up per row from the embedded HVAC cross-reference database
                ({CROSSREF_BRANDS.length} brands, 1,174 equivalency groups). Unmatched rows
                leave XMODEL blank.
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-semibold mb-3">6. Styling & output</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Bold columns (comma-separated)
                </label>
                <input
                  type="text"
                  value={boldColsText}
                  onChange={(e) => setBoldColsText(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(["header", "product", "zebra", "qtygold"] as const).map((k) => (
                  <div key={k}>
                    <label className="block text-xs font-medium text-slate-600 mb-1 capitalize">
                      {k}
                    </label>
                    <input
                      type="color"
                      value={colors[k]}
                      onChange={(e) => setColors({ ...colors, [k]: e.target.value })}
                      className="h-8 w-full rounded border border-slate-300 cursor-pointer"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Customer (optional)</label>
                <select
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                >
                  <option value="(None)">(None)</option>
                  {Object.keys(CUSTOMER_ABBR).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Project name (optional)</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                />
              </div>
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
                            {c}
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
                7. Convert to X cross-reference (per-product)
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Default target brand for every row is{" "}
                <span className="font-medium">{targetBrand || "(none)"}</span>.
                Change any row below to pick a different XBRAND — XMODEL auto-fills from the
                cross-reference database. Click{" "}
                <span className="font-medium">Re-generate with overrides</span> to rebuild
                the Excel with your selections.
              </p>

              <div className="overflow-x-auto border border-slate-200 rounded mb-4">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Product</th>
                      <th className="px-2 py-1.5 text-left font-medium">Source BRAND</th>
                      <th className="px-2 py-1.5 text-left font-medium">Source MODEL</th>
                      <th className="px-2 py-1.5 text-left font-medium">XBRAND (target)</th>
                      <th className="px-2 py-1.5 text-left font-medium">XMODEL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueXProducts.map((row, i) => {
                      const currentXBrand = effectiveXBrand(row.key);
                      // Original XMODEL for this (BRAND, MODEL) from the last generated preview
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
                      return (
                        <tr key={row.key} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="px-2 py-1 whitespace-nowrap">{row.product}</td>
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
                              {CROSSREF_BRANDS.map((b) => (
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
