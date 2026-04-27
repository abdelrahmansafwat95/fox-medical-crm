"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Users,
  Building2,
  Pill,
  Trash2,
  RefreshCw
} from "lucide-react";

// =====================================================================
// Schema definitions per import type
// =====================================================================

interface FieldDef {
  name: string;        // DB column name
  label: string;       // user-facing label (also the template header)
  required?: boolean;
  type: "text" | "number" | "boolean" | "enum";
  enumValues?: string[];
  example?: string;
  /** Custom transform from raw cell value to DB value */
  transform?: (raw: unknown) => unknown;
}

interface SchemaDef {
  key: "hcps" | "institutions" | "products";
  label: string;
  icon: typeof Users;
  table: string;
  fields: FieldDef[];
  /** Sample rows for the template */
  examples: Record<string, unknown>[];
  /** Required default values added to every row on insert */
  defaults?: Record<string, unknown>;
  /** Function to detect probable in-DB duplicates by some natural key */
  dedupeBy?: (row: Record<string, unknown>) => string;
}

const SCHEMAS: SchemaDef[] = [
  {
    key: "hcps",
    label: "HCPs (doctors / pharmacists)",
    icon: Users,
    table: "hcps",
    defaults: { is_active: true, is_kol: false },
    dedupeBy: (r) => `${(r.full_name as string)?.toLowerCase().trim()}|${(r.mobile as string ?? "")}`,
    fields: [
      { name: "full_name", label: "Full Name", required: true, type: "text", example: "Mostafa Hassan" },
      { name: "title", label: "Title", type: "text", example: "Dr." },
      { name: "specialty", label: "Specialty", type: "text", example: "Cardiology" },
      { name: "sub_specialty", label: "Sub-specialty", type: "text", example: "Interventional" },
      { name: "phone", label: "Phone", type: "text", example: "+201001234567" },
      { name: "mobile", label: "Mobile", type: "text", example: "+201001234567" },
      { name: "whatsapp", label: "WhatsApp", type: "text", example: "+201001234567" },
      { name: "email", label: "Email", type: "text", example: "mostafa@example.com" },
      {
        name: "segment",
        label: "Segment",
        type: "enum",
        enumValues: ["A", "B", "C", "D", "KOL"],
        example: "A"
      },
      {
        name: "is_kol",
        label: "Is KOL",
        type: "boolean",
        example: "false",
        transform: parseBool
      },
      { name: "notes", label: "Notes", type: "text", example: "" }
    ],
    examples: [
      {
        "Full Name": "Mostafa Hassan",
        Title: "Dr.",
        Specialty: "Cardiology",
        "Sub-specialty": "Interventional",
        Phone: "+201001234567",
        Mobile: "+201001234567",
        WhatsApp: "+201001234567",
        Email: "mostafa@example.com",
        Segment: "A",
        "Is KOL": "false",
        Notes: ""
      },
      {
        "Full Name": "Sara Mahmoud",
        Title: "Dr.",
        Specialty: "Endocrinology",
        "Sub-specialty": "",
        Phone: "",
        Mobile: "+201007654321",
        WhatsApp: "",
        Email: "",
        Segment: "B",
        "Is KOL": "false",
        Notes: "Met at Cardio symposium 2024"
      }
    ]
  },
  {
    key: "institutions",
    label: "Institutions (clinics / hospitals / pharmacies)",
    icon: Building2,
    table: "institutions",
    defaults: { is_active: true, geofence_radius_m: 100 },
    dedupeBy: (r) => `${(r.name as string)?.toLowerCase().trim()}|${(r.district as string ?? "")}`,
    fields: [
      { name: "name", label: "Name", required: true, type: "text", example: "Cleopatra Hospital" },
      {
        name: "type",
        label: "Type",
        required: true,
        type: "enum",
        enumValues: [
          "private_clinic",
          "polyclinic",
          "hospital_govt",
          "hospital_private",
          "hospital_university",
          "hospital_military",
          "pharmacy_independent",
          "pharmacy_chain",
          "distributor",
          "wholesaler",
          "lab",
          "warehouse"
        ],
        example: "hospital_private"
      },
      { name: "latitude", label: "Latitude", required: true, type: "number", example: "30.0626" },
      { name: "longitude", label: "Longitude", required: true, type: "number", example: "31.2200" },
      { name: "geofence_radius_m", label: "Geofence Radius (m)", type: "number", example: "100" },
      { name: "address", label: "Address", type: "text", example: "39 Cleopatra St" },
      { name: "city", label: "City", type: "text", example: "Cairo" },
      { name: "district", label: "District", type: "text", example: "Heliopolis" },
      { name: "governorate", label: "Governorate", type: "text", example: "Cairo" },
      { name: "phone", label: "Phone", type: "text", example: "+20226356000" }
    ],
    examples: [
      {
        Name: "Cleopatra Hospital",
        Type: "hospital_private",
        Latitude: "30.0626",
        Longitude: "31.2200",
        "Geofence Radius (m)": "100",
        Address: "39 Cleopatra St",
        City: "Cairo",
        District: "Heliopolis",
        Governorate: "Cairo",
        Phone: "+20226356000"
      },
      {
        Name: "Maadi Polyclinic",
        Type: "polyclinic",
        Latitude: "29.9602",
        Longitude: "31.2569",
        "Geofence Radius (m)": "75",
        Address: "12 Road 9",
        City: "Cairo",
        District: "Maadi",
        Governorate: "Cairo",
        Phone: ""
      }
    ]
  },
  {
    key: "products",
    label: "Products (drug & device catalog)",
    icon: Pill,
    table: "products",
    defaults: { is_active: true, currency: "EGP" },
    dedupeBy: (r) =>
      `${(r.brand_name as string ?? r.name as string)?.toLowerCase().trim()}|${(r.strength as string ?? "")}`,
    fields: [
      { name: "name", label: "Name", required: true, type: "text", example: "Cardia 5mg" },
      { name: "brand_name", label: "Brand Name", type: "text", example: "Cardia" },
      { name: "generic_name", label: "Generic Name", type: "text", example: "amlodipine" },
      { name: "name_ar", label: "Name (Arabic)", type: "text", example: "كارديا" },
      {
        name: "category",
        label: "Category",
        required: true,
        type: "enum",
        enumValues: ["Rx", "OTC", "OTX", "medical_device", "consumable"],
        example: "Rx"
      },
      { name: "therapy_area", label: "Therapy Area", type: "text", example: "Cardiovascular" },
      { name: "product_line", label: "Product Line", type: "text", example: "Cardio" },
      { name: "dosage_form", label: "Dosage Form", type: "text", example: "Tablet" },
      { name: "strength", label: "Strength", type: "text", example: "5mg" },
      { name: "pack_size", label: "Pack Size", type: "text", example: "30 tabs" },
      { name: "list_price", label: "List Price (EGP)", type: "number", example: "85" },
      { name: "sample_pack_size", label: "Sample Pack Size", type: "text", example: "7 tabs" }
    ],
    examples: [
      {
        Name: "Cardia 5mg",
        "Brand Name": "Cardia",
        "Generic Name": "amlodipine",
        "Name (Arabic)": "كارديا",
        Category: "Rx",
        "Therapy Area": "Cardiovascular",
        "Product Line": "Cardio",
        "Dosage Form": "Tablet",
        Strength: "5mg",
        "Pack Size": "30 tabs",
        "List Price (EGP)": "85",
        "Sample Pack Size": "7 tabs"
      },
      {
        Name: "Glucova 1g",
        "Brand Name": "Glucova",
        "Generic Name": "metformin",
        "Name (Arabic)": "",
        Category: "Rx",
        "Therapy Area": "Diabetes",
        "Product Line": "Endo",
        "Dosage Form": "Tablet",
        Strength: "1g",
        "Pack Size": "60 tabs",
        "List Price (EGP)": "120",
        "Sample Pack Size": ""
      }
    ]
  }
];

// =====================================================================
// Helpers
// =====================================================================

function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    return s === "true" || s === "yes" || s === "1" || s === "y";
  }
  return false;
}

interface ParsedRow {
  rowNum: number;
  raw: Record<string, unknown>;
  data: Record<string, unknown>;
  errors: string[];
  isDupeInFile: boolean;
}

// =====================================================================
// Page
// =====================================================================

export default function ImportPage() {
  const [schemaKey, setSchemaKey] = useState<SchemaDef["key"]>("hcps");
  const schema = useMemo(() => SCHEMAS.find((s) => s.key === schemaKey)!, [schemaKey]);

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ ok: number; skipped: number } | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ----- Template download --------------------------------------------

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet(schema.examples);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, schema.label.slice(0, 30));
    XLSX.writeFile(wb, `${schema.key}-import-template.xlsx`);
  }

  // ----- File parse --------------------------------------------------

  async function handleFile(f: File) {
    setTopError(null);
    setFilename(f.name);
    setResult(null);

    // Read existing rows from DB once for dedupe check
    const dbCheck = await supabase.from(schema.table).select(getDedupeColumns(schema));
    const dbKeys = new Set<string>();
    if (schema.dedupeBy && dbCheck.data) {
      dbCheck.data.forEach((r) => {
        const key = schema.dedupeBy!(r as Record<string, unknown>);
        if (key) dbKeys.add(key);
      });
    }
    setExistingKeys(dbKeys);

    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];

      if (json.length === 0) {
        setTopError("No rows found in the file.");
        setRows([]);
        return;
      }

      // Build label → fieldName map (case-insensitive, trim whitespace)
      const labelToField = new Map<string, FieldDef>();
      schema.fields.forEach((f) => {
        labelToField.set(f.label.toLowerCase().trim(), f);
        labelToField.set(f.name.toLowerCase().trim(), f);
      });

      const seenInFile = new Set<string>();
      const parsed: ParsedRow[] = json.map((raw, i) => {
        const data: Record<string, unknown> = {};
        const errors: string[] = [];

        // Map each input column to a known field
        for (const [inHeader, inValue] of Object.entries(raw)) {
          const field = labelToField.get(inHeader.toLowerCase().trim());
          if (!field) continue; // ignore unknown columns silently

          const cellEmpty = inValue === "" || inValue === null || inValue === undefined;

          if (field.required && cellEmpty) {
            errors.push(`${field.label} is required`);
            continue;
          }
          if (cellEmpty) {
            data[field.name] = null;
            continue;
          }

          // Type-specific validation
          if (field.type === "number") {
            const n = parseFloat(String(inValue).replace(",", "."));
            if (isNaN(n)) {
              errors.push(`${field.label} not a number: "${inValue}"`);
              continue;
            }
            data[field.name] = n;
          } else if (field.type === "boolean") {
            data[field.name] = parseBool(inValue);
          } else if (field.type === "enum") {
            const v = String(inValue).trim();
            if (!field.enumValues!.includes(v)) {
              errors.push(
                `${field.label} must be one of: ${field.enumValues!.join(", ")} (got "${v}")`
              );
              continue;
            }
            data[field.name] = v;
          } else {
            data[field.name] = String(inValue).trim();
          }
        }

        // Required-field check for fields not in input
        schema.fields.forEach((f) => {
          if (f.required && (data[f.name] === undefined || data[f.name] === null || data[f.name] === "")) {
            if (!errors.some((e) => e.startsWith(f.label))) {
              errors.push(`${f.label} is required`);
            }
          }
        });

        // Dedupe within file
        let isDupeInFile = false;
        if (schema.dedupeBy) {
          const key = schema.dedupeBy(data);
          if (key && key !== "|" && seenInFile.has(key)) {
            isDupeInFile = true;
            errors.push("Duplicate of an earlier row in this file");
          }
          if (key && key !== "|") seenInFile.add(key);
        }

        // Dedupe vs DB
        if (schema.dedupeBy && errors.length === 0) {
          const key = schema.dedupeBy(data);
          if (key && key !== "|" && dbKeys.has(key)) {
            errors.push("Already exists in database");
          }
        }

        return {
          rowNum: i + 2, // +2 because Excel is 1-indexed and we have a header row
          raw,
          data,
          errors,
          isDupeInFile
        };
      });

      setRows(parsed);
    } catch (err) {
      setTopError("Could not parse file: " + (err instanceof Error ? err.message : "unknown"));
    }
  }

  // ----- Import ------------------------------------------------------

  async function runImport() {
    const valid = rows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) {
      setTopError("No valid rows to import. Fix the errors below first.");
      return;
    }

    setImporting(true);
    setProgress({ done: 0, total: valid.length });
    setTopError(null);

    let ok = 0;
    const failed: { row: number; reason: string }[] = [];

    // Insert in chunks of 100
    const chunkSize = 100;
    for (let i = 0; i < valid.length; i += chunkSize) {
      const chunk = valid.slice(i, i + chunkSize);
      const payload = chunk.map((r) => ({ ...(schema.defaults ?? {}), ...r.data }));
      const { error } = await supabase.from(schema.table).insert(payload);
      if (error) {
        // If the chunk fails, retry one-by-one to identify which row(s) are bad
        for (const r of chunk) {
          const { error: rowErr } = await supabase
            .from(schema.table)
            .insert([{ ...(schema.defaults ?? {}), ...r.data }]);
          if (rowErr) {
            failed.push({ row: r.rowNum, reason: rowErr.message });
          } else {
            ok++;
          }
          setProgress({ done: i + (r.rowNum - chunk[0].rowNum) + 1, total: valid.length });
        }
      } else {
        ok += chunk.length;
        setProgress({ done: i + chunk.length, total: valid.length });
      }
    }

    setImporting(false);
    setResult({ ok, skipped: rows.length - ok });

    if (failed.length > 0) {
      setTopError(
        `${failed.length} rows failed to insert. First few: ` +
          failed
            .slice(0, 3)
            .map((f) => `Row ${f.row}: ${f.reason}`)
            .join(" · ")
      );
    }
  }

  function reset() {
    setRows([]);
    setFilename("");
    setResult(null);
    setTopError(null);
    setProgress({ done: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ----- Render ------------------------------------------------------

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const errorCount = rows.length - validCount;

  return (
    <div className="max-w-6xl mx-auto pb-24">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-cyan-50 text-cyan-700">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Bulk Import</h1>
      </div>
      <p className="text-slate-500 mb-6">
        Onboard a new pharma customer in 5 minutes. Upload Excel files for HCPs, institutions, or products.
      </p>

      {/* Type picker */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {SCHEMAS.map((s) => {
          const Icon = s.icon;
          const active = s.key === schemaKey;
          return (
            <button
              key={s.key}
              onClick={() => {
                setSchemaKey(s.key);
                reset();
              }}
              className={`p-4 rounded-xl border-2 transition text-left ${
                active
                  ? "bg-brand-50 border-brand-500 shadow-sm"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div
                className={`p-2 rounded-lg w-fit ${
                  active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="font-semibold text-slate-900 mt-2">{s.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {s.fields.length} columns · {s.fields.filter((f) => f.required).length} required
              </div>
            </button>
          );
        })}
      </div>

      {/* Step 1: Download template */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0">
            1
          </div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900">Download template</div>
            <p className="text-xs text-slate-500 mt-0.5">
              Get an Excel file with the right columns + 2 example rows. Fill it in, then upload.
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Template
          </button>
        </div>
        <details className="mt-3">
          <summary className="text-xs text-slate-500 cursor-pointer">
            View column reference for {schema.label}
          </summary>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
            {schema.fields.map((f) => (
              <div key={f.name} className="p-2 bg-slate-50 rounded border border-slate-200">
                <div className="font-semibold text-slate-700">
                  {f.label}
                  {f.required && <span className="text-red-600 ml-0.5">*</span>}
                </div>
                <div className="text-slate-500 mt-0.5">
                  {f.type}
                  {f.enumValues && ` (${f.enumValues.join(" / ")})`}
                </div>
                {f.example && (
                  <div className="text-slate-400 italic mt-0.5">e.g. {f.example}</div>
                )}
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Step 2: Upload */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0">
            2
          </div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900">Upload your file</div>
            <p className="text-xs text-slate-500 mt-0.5">
              .xlsx, .xls, or .csv — first sheet only. Header row required.
            </p>
          </div>
        </div>

        {!filename && (
          <label className="mt-4 block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-slate-50 transition">
            <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-medium text-slate-700">Click to choose file</p>
            <p className="text-xs text-slate-500 mt-0.5">or drag and drop</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
        )}

        {filename && (
          <div className="mt-4 flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900 truncate">{filename}</div>
              <div className="text-xs text-slate-500">
                {rows.length} rows · {validCount} ready · {errorCount} with issues
              </div>
            </div>
            <button
              onClick={reset}
              disabled={importing}
              className="text-xs px-3 py-1.5 rounded text-slate-600 hover:bg-white border border-slate-300 inline-flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        )}
      </div>

      {topError && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{topError}</span>
        </div>
      )}

      {/* Step 3: Preview */}
      {rows.length > 0 && !result && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-3">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div>
                <div className="font-semibold text-slate-900">Preview & validate</div>
                <div className="text-xs text-slate-500">
                  <span className="text-emerald-700 font-medium">{validCount}</span> ready ·{" "}
                  <span className="text-red-700 font-medium">{errorCount}</span> need fixes
                </div>
              </div>
            </div>
            <button
              onClick={runImport}
              disabled={importing || validCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-bold inline-flex items-center gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Importing… ({progress.done}/{progress.total})
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Import {validCount} rows
                </>
              )}
            </button>
          </div>

          {importing && progress.total > 0 && (
            <div className="px-3 pt-3">
              <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-2 font-semibold text-slate-600 w-10">#</th>
                  <th className="text-left px-2 py-2 font-semibold text-slate-600 w-20">Status</th>
                  {schema.fields.slice(0, 6).map((f) => (
                    <th key={f.name} className="text-left px-2 py-2 font-semibold text-slate-600">
                      {f.label}
                    </th>
                  ))}
                  <th className="text-left px-2 py-2 font-semibold text-slate-600">Issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.rowNum}
                    className={`border-t border-slate-100 ${
                      r.errors.length > 0 ? "bg-red-50/40" : ""
                    }`}
                  >
                    <td className="px-2 py-1.5 text-slate-400">{r.rowNum}</td>
                    <td className="px-2 py-1.5">
                      {r.errors.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700">
                          <AlertTriangle className="w-3 h-3" /> Fix
                        </span>
                      )}
                    </td>
                    {schema.fields.slice(0, 6).map((f) => (
                      <td key={f.name} className="px-2 py-1.5 text-slate-700 max-w-[150px] truncate">
                        {String(r.data[f.name] ?? "")}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-red-700 max-w-xs">
                      {r.errors.slice(0, 2).join(" · ")}
                      {r.errors.length > 2 && ` (+${r.errors.length - 2} more)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <div className="text-5xl mb-2">🎉</div>
          <h2 className="font-bold text-emerald-900">Import complete</h2>
          <p className="text-sm text-emerald-700 mt-1">
            <strong>{result.ok}</strong> rows imported successfully
            {result.skipped > 0 && <>, {result.skipped} skipped</>}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg font-medium inline-flex items-center gap-2 hover:bg-emerald-50"
            >
              <RefreshCw className="w-4 h-4" /> Import more
            </button>
            <Link
              href={`/dashboard/${schema.key}`}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
            >
              View imported {schema.key}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function getDedupeColumns(schema: SchemaDef): string {
  // For each schema, return the columns we need to fetch from DB to do dedup checking
  if (schema.key === "hcps") return "full_name, mobile";
  if (schema.key === "institutions") return "name, district";
  if (schema.key === "products") return "name, brand_name, strength";
  return "id";
}
