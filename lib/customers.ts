// Customer → per-category target-brand rules. Keys are master-sheet Category names.
// Must stay in sync with api/_lib/customers.py. Names use '/' not '-' as separators.

const ADGRD = [
  "GRD",
  "Diffusers",
  "Critical Environments",
  "Chilled Beams",
  "Displacement/Underfloor",
];
const LOUVERS = ["Louvers and Penthouses"];
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

const HALDEMAN_RULES: Record<string, string> = {
  ...Object.fromEntries(ADGRD.map((c) => [c, "Krueger"])),
  ...Object.fromEntries(LOUVERS.map((c) => [c, "Ruskin"])),
  ...Object.fromEntries(FANS.map((c) => [c, "Loren Cook"])),
};

export const CUSTOMER_RULES: Record<string, Record<string, string>> = {
  Haldeman: HALDEMAN_RULES,
};

export const CUSTOMER_OPTIONS = ["None", "Haldeman"] as const;
export type CustomerOption = (typeof CUSTOMER_OPTIONS)[number];

export function brandForCategory(customer: string, category: string): string {
  if (!customer || customer === "None") return "";
  return CUSTOMER_RULES[customer]?.[category] ?? "";
}
