// Customer → per-category target-brand rules. Keys are master-sheet Category names.
// Must stay in sync with api/_lib/customers.py. Names use '/' not '-' as separators.
// A rule value may be a single brand or a fallback chain (preferred → fallback).

export type BrandRule = string | string[];

const ADGRD = [
  "GRD",
  "Diffusers",
  "Critical Environments",
  "Chilled Beams",
  "Displacement/Underfloor",
];
const LOUVERS = ["Louvers and Penthouses"];
const DAMPERS = ["Fire Damper", "Smoke Damper", "Fire/Smoke Damper"];
const FANS = [
  "Bathroom / Ceiling Fan",
  "Centrifugal Blower – Double Width",
  "Centrifugal Blower – Single Width",
  "Centrifugal Roof Exhauster",
  "Gravity / Relief Ventilator",
  "Hooded Propeller – Roof",
  "Inline / Axial Fan",
  "Kitchen Exhaust – Downblast",
  "Kitchen Exhaust – Upblast",
  "Kitchen Supply",
  "Lab Exhaust",
  "Plenum / Plug Fan",
  "Power Roof Ventilator",
  "Propeller / Wall Fan",
  "Propeller Upblast",
  "Tunnel / High Temp Fan",
  "Utility / Cabinet Fan",
  "Utility Exhaust Set",
];

const HALDEMAN_RULES: Record<string, BrandRule> = {
  ...Object.fromEntries(ADGRD.map((c) => [c, "Krueger"])),
  ...Object.fromEntries(LOUVERS.map((c) => [c, "Ruskin"])),
  ...Object.fromEntries(FANS.map((c) => [c, "Loren Cook"])),
};

const MMS_RULES: Record<string, BrandRule> = {
  ...Object.fromEntries(ADGRD.map((c) => [c, ["Tuttle & Bailey", "Krueger"]])),
  ...Object.fromEntries(DAMPERS.map((c) => [c, "POTTORFF"])),
  ...Object.fromEntries(FANS.map((c) => [c, "Twin City Fan"])),
};

export const CUSTOMER_RULES: Record<string, Record<string, BrandRule>> = {
  Haldeman: HALDEMAN_RULES,
  MMS: MMS_RULES,
};

export const CUSTOMER_OPTIONS = ["None", "Haldeman", "MMS"] as const;
export type CustomerOption = (typeof CUSTOMER_OPTIONS)[number];

export function brandForCategory(customer: string, category: string): string {
  if (!customer || customer === "None") return "";
  const rule = CUSTOMER_RULES[customer]?.[category];
  if (!rule) return "";
  // For fallback chains, the preferred brand drives the UI default.
  return Array.isArray(rule) ? (rule[0] ?? "") : rule;
}
