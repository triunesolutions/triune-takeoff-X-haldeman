TRIUNE_COLUMNS = [
    "PRODUCT", "BRAND", "MODEL", "XBRAND", "XMODEL", "QTY", "TAG",
    "NECK SIZE", "MODULE SIZE", "DUCT SIZE", "TYPE", "MOUNTING",
    "ACCESSORIES1", "ACCESSORIES2", "REMARK",
]

# Display labels for TRIUNE_COLUMNS (used for Excel header row + UI preview
# headers + column-mapping labels). Internal code keeps using the raw names.
COLUMN_LABELS = {
    "BRAND": "SCHEDULE BRAND",
    "MODEL": "SCHEDULE MODEL",
    "XBRAND": "BRAND",
    "XMODEL": "MODEL",
}


def label(col: str) -> str:
    return COLUMN_LABELS.get(col, col)

# Columns the user maps from the source file. XBRAND/XMODEL are derived via
# cross-reference, not mapped.
MAPPABLE_COLUMNS = [c for c in TRIUNE_COLUMNS if c not in ("XBRAND", "XMODEL")]

DEFAULT_COLORS = {
    "header": "#ECF3FA",
    "model":  "#F4B084",
    "product": "#92D050",
    "zebra":  "#F7F7F7",
    "qtygold": "#FFF2CC",
}

BOLD_COLUMNS_DEFAULT = ["PRODUCT", "BRAND", "TAG", "MODULE SIZE", "TYPE", "ACCESSORIES1"]

STRICT_KEYS = [
    "PRODUCT", "BRAND", "MODEL", "TAG",
    "NECK SIZE", "MODULE SIZE", "DUCT SIZE", "TYPE", "MOUNTING",
]

CUSTOMER_ABBR = {
    "Gustave Larson": "GAL",
    "Southvac Systems": "SS",
    "Midwest Mechanical Solutions": "MMS",
    "Haldeman": "HM",
    "Knape Associates": "KA",
    "Knape Dallas": "KAD",
    "Knape Houston": "KAH",
    "Applied Product Solutions": "APS",
}
