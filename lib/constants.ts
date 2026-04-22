export const TRIUNE_COLUMNS = [
  "PRODUCT", "BRAND", "MODEL", "XBRAND", "XMODEL", "QTY", "TAG",
  "NECK SIZE", "MODULE SIZE", "DUCT SIZE", "TYPE", "MOUNTING",
  "ACCESSORIES1", "ACCESSORIES2", "REMARK",
] as const;

export type TriuneColumn = typeof TRIUNE_COLUMNS[number];

// XBRAND/XMODEL are derived via cross-reference, not mapped from the source.
export const MAPPABLE_COLUMNS = TRIUNE_COLUMNS.filter(
  (c) => c !== "XBRAND" && c !== "XMODEL"
);

export const DEFAULT_COLORS = {
  header: "#ECF3FA",
  product: "#92D050",
  zebra: "#F7F7F7",
  qtygold: "#FFF2CC",
};

export const BOLD_COLUMNS_DEFAULT = "PRODUCT,BRAND,TAG,MODULE SIZE,TYPE,ACCESSORIES1";

export const CUSTOMER_ABBR: Record<string, string> = {
  "Gustave Larson": "GAL",
  "Southvac Systems": "SS",
  "Midwest Mechanical Solutions": "MMS",
  "Haldeman": "HM",
  "Knape Associates": "KA",
  "Knape Dallas": "KAD",
  "Knape Houston": "KAH",
  "Applied Product Solutions": "APS",
};

export function normKey(s: string): string {
  return (s || "").trim().toLowerCase();
}
