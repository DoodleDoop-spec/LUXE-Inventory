import { useMemo, useState } from "react";
import { X, Upload, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";

// Minimal RFC-4180 CSV parser (handles quoted commas + doubled quotes)
function parseCSV(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c && c.trim()));
}

// Best-guess auto-mapping: match header to a target field by fuzzy substring.
function autoMap(headers, targetFields, sizeSystems) {
  const mapping = {};
  const usedTargets = new Set();
  const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const targets = targetFields.map((t) => ({ key: t.key, norm: normalize(t.label + " " + t.key), aliases: (t.aliases || []).map(normalize) }));
  headers.forEach((h, idx) => {
    const nh = normalize(h);
    // Size prefixes (size:M, size:S/M/L…) — always map to sizes bucket
    if (h.toLowerCase().startsWith("size:") || h.toLowerCase().startsWith("qty:")) {
      mapping[idx] = `__size__:${h.split(":").slice(1).join(":").trim()}`;
      return;
    }
    // Direct exact hits first
    let hit = targets.find((t) => !usedTargets.has(t.key) && (t.norm === nh || t.key === nh || t.aliases.includes(nh)));
    if (!hit) {
      // Substring match
      hit = targets.find((t) => !usedTargets.has(t.key) && (t.norm.includes(nh) || nh.includes(t.key)));
    }
    if (hit) {
      mapping[idx] = hit.key;
      usedTargets.add(hit.key);
    } else {
      mapping[idx] = "__skip__";
    }
  });
  return mapping;
}

/**
 * Column-mapping CSV import wizard.
 * @param entity  "costumes" | "equipment"
 * @param targetFields  array of {key,label,required?,aliases?}
 * @param sizeSystems  optional list of sizing systems (used for "size:XXX" columns)
 * @param onClose  called after close
 * @param onDone   called after a successful real import
 */
export default function ImportWizard({ entity, targetFields, sizeSystems = [], open, onClose, onDone }) {
  const [step, setStep] = useState(1); // 1=upload, 2=map, 3=preview, 4=done
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]); // array-of-arrays
  const [mapping, setMapping] = useState({}); // colIndex -> targetKey | "__skip__" | "__size__:XX"
  const [dryRun, setDryRun] = useState(null); // {would_create,duplicates,invalid,preview}
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null); // final import result

  const reset = () => {
    setStep(1); setFileName(""); setHeaders([]); setRawRows([]);
    setMapping({}); setDryRun(null); setBusy(false); setSummary(null);
  };
  const close = () => { reset(); onClose?.(); };

  const targetOptions = useMemo(() => {
    const base = [
      { value: "__skip__", label: "— Skip this column —" },
      ...targetFields.map((t) => ({ value: t.key, label: t.label + (t.required ? " *" : "") })),
    ];
    for (const sys of sizeSystems || []) {
      for (const sz of (sys.sizes || [])) {
        base.push({ value: `__size__:${sz}`, label: `Size · ${sys.name} · ${sz}` });
      }
    }
    return base;
  }, [targetFields, sizeSystems]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) { toast.error("CSV is empty or missing rows"); return; }
      const hdrs = rows[0].map((h) => (h || "").trim());
      setHeaders(hdrs);
      setRawRows(rows.slice(1));
      setFileName(file.name);
      setMapping(autoMap(hdrs, targetFields, sizeSystems));
      setStep(2);
    } catch (err) {
      toast.error(err.message || "Failed to read CSV");
    }
  };

  const buildRows = () => rawRows.map((cells) => {
    const rec = { sizes: {} };
    headers.forEach((_h, idx) => {
      const target = mapping[idx];
      const val = (cells[idx] || "").trim();
      if (!target || target === "__skip__") return;
      if (target.startsWith("__size__:")) {
        rec.sizes[target.slice(9)] = val;
      } else {
        rec[target] = val;
      }
    });
    return rec;
  });

  const runDry = async () => {
    setBusy(true);
    try {
      const rows = buildRows();
      const endpoint = entity === "equipment" ? "/equipment/import" : "/costumes/import";
      const r = await api.post(endpoint, { rows, dry_run: true });
      setDryRun(r.data);
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Preview failed");
    }
    setBusy(false);
  };

  const runReal = async () => {
    setBusy(true);
    try {
      const rows = buildRows();
      const endpoint = entity === "equipment" ? "/equipment/import" : "/costumes/import";
      const r = await api.post(endpoint, { rows, dry_run: false });
      setSummary(r.data);
      setStep(4);
      toast.success(`Imported ${r.data.created} ${entity}`);
      onDone?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Import failed");
    }
    setBusy(false);
  };

  const requiredMissing = useMemo(() => {
    const mappedTargets = new Set(Object.values(mapping));
    return (targetFields || []).filter((f) => f.required && !mappedTargets.has(f.key));
  }, [mapping, targetFields]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="import-wizard-overlay">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col border border-[#09090B]">
        <div className="p-4 border-b border-[#E4E4E7] flex items-center justify-between">
          <div>
            <div className="eyebrow">IMPORT · {entity.toUpperCase()}</div>
            <h2 className="font-display text-xl font-semibold text-[#09090B]">
              {step === 1 && "Upload spreadsheet"}
              {step === 2 && "Map your columns"}
              {step === 3 && "Review before import"}
              {step === 4 && "Import complete"}
            </h2>
          </div>
          <button data-testid="import-wizard-close" onClick={close} className="p-2 hover:bg-[#F4F4F5]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && (
            <div className="text-center py-10" data-testid="import-step-upload">
              <Upload className="h-10 w-10 text-[#A1A1AA] mx-auto mb-4" strokeWidth={1.5} />
              <p className="text-sm text-[#71717A] mb-6">
                Pick a CSV exported from Excel, Google Sheets, or any inventory spreadsheet.
                The wizard will auto-detect columns; you can adjust the mapping in the next step.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="hidden"
                id="import-wizard-file"
                data-testid="import-wizard-file"
              />
              <label
                htmlFor="import-wizard-file"
                className="cursor-pointer inline-flex items-center gap-2 bg-[#09090B] hover:bg-[#27272A] text-white h-11 px-6 text-sm"
              >
                <Upload className="h-4 w-4" /> Choose CSV
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="import-step-map">
              <div className="text-xs text-[#71717A]">
                <b className="text-[#09090B]">{fileName}</b> · {rawRows.length} data row{rawRows.length === 1 ? "" : "s"} detected
              </div>
              {requiredMissing.length > 0 && (
                <div className="border border-[#F59E0B] bg-[#FEF3C7] p-3 text-xs text-[#78350F] flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Please map required fields: {requiredMissing.map((f) => f.label).join(", ")}
                </div>
              )}
              <div className="overflow-x-auto border border-[#E4E4E7]">
                <table className="w-full text-xs">
                  <thead className="bg-[#FAFAFA]">
                    <tr>
                      <th className="p-2 text-left eyebrow border-b border-[#E4E4E7]">CSV Column</th>
                      <th className="p-2 text-left eyebrow border-b border-[#E4E4E7]">Sample</th>
                      <th className="p-2 text-left eyebrow border-b border-[#E4E4E7]">→ Map to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, idx) => (
                      <tr key={idx} className="border-b border-[#E4E4E7]" data-testid={`import-map-row-${idx}`}>
                        <td className="p-2 font-medium text-[#09090B]">{h || <span className="text-[#A1A1AA]">(unnamed)</span>}</td>
                        <td className="p-2 text-[#71717A] truncate max-w-[240px]">
                          {(rawRows[0] || [])[idx] || "—"}
                        </td>
                        <td className="p-2">
                          <select
                            data-testid={`import-map-select-${idx}`}
                            value={mapping[idx] || "__skip__"}
                            onChange={(e) => setMapping((prev) => ({ ...prev, [idx]: e.target.value }))}
                            className="h-9 border border-[#E4E4E7] px-2 text-xs bg-white min-w-[220px]"
                          >
                            {targetOptions.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && dryRun && (
            <div className="space-y-4" data-testid="import-step-preview">
              <div className="grid grid-cols-3 gap-3">
                <StatBox label="Will create" value={dryRun.would_create} tone="green" testId="import-would-create" />
                <StatBox label="Duplicates (skipped)" value={dryRun.duplicates} tone="amber" testId="import-duplicates" />
                <StatBox label="Invalid rows" value={dryRun.invalid} tone="red" testId="import-invalid" />
              </div>
              {dryRun.preview?.length > 0 && (
                <div className="border border-[#E4E4E7] max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#FAFAFA] sticky top-0">
                      <tr>
                        <th className="p-2 text-left eyebrow">Name</th>
                        <th className="p-2 text-left eyebrow">Category</th>
                        <th className="p-2 text-left eyebrow">Location</th>
                        <th className="p-2 text-right eyebrow">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRun.preview.slice(0, 40).map((r, i) => (
                        <tr key={i} className="border-b border-[#E4E4E7]" data-testid={`import-preview-row-${i}`}>
                          <td className="p-2 font-medium text-[#09090B]">{r.name}</td>
                          <td className="p-2 text-[#52525B]">{r.category}</td>
                          <td className="p-2 text-[#52525B]">{r.location}</td>
                          <td className="p-2 text-right tabular-nums">{r.total_quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {dryRun.preview.length > 40 && (
                    <div className="p-2 text-[10px] text-[#71717A] border-t border-[#E4E4E7]">…and {dryRun.preview.length - 40} more</div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 4 && summary && (
            <div className="text-center py-10" data-testid="import-step-done">
              <CheckCircle2 className="h-12 w-12 text-[#10B981] mx-auto mb-4" strokeWidth={1.5} />
              <p className="text-lg font-display font-semibold text-[#09090B]">
                Imported {summary.created} {entity}
              </p>
              <p className="text-sm text-[#71717A] mt-2">
                {summary.duplicates} duplicate{summary.duplicates === 1 ? "" : "s"} skipped · {summary.invalid} invalid row{summary.invalid === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#E4E4E7] flex items-center justify-between bg-[#FAFAFA]">
          <div className="text-xs text-[#71717A]">Step {step} of 4</div>
          <div className="flex items-center gap-2">
            {step === 2 && (
              <>
                <Button variant="outline" onClick={() => setStep(1)} className="rounded-none h-9">Back</Button>
                <Button
                  data-testid="import-wizard-next"
                  onClick={runDry}
                  disabled={busy || requiredMissing.length > 0}
                  className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-9 text-white"
                >
                  Preview <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                <Button variant="outline" onClick={() => setStep(2)} className="rounded-none h-9">Back to mapping</Button>
                <Button
                  data-testid="import-wizard-confirm"
                  onClick={runReal}
                  disabled={busy || (dryRun?.would_create || 0) === 0}
                  className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-9 text-white"
                >
                  Import {dryRun?.would_create || 0} row{(dryRun?.would_create || 0) === 1 ? "" : "s"}
                </Button>
              </>
            )}
            {step === 4 && (
              <Button data-testid="import-wizard-done" onClick={close} className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-9 text-white">Done</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, tone, testId }) {
  const toneClasses = {
    green: "border-[#10B981] bg-[#ECFDF5] text-[#065F46]",
    amber: "border-[#F59E0B] bg-[#FEF3C7] text-[#78350F]",
    red: "border-[#EF4444] bg-[#FEF2F2] text-[#7F1D1D]",
  }[tone] || "border-[#E4E4E7] text-[#09090B]";
  return (
    <div className={`border ${toneClasses} p-3`} data-testid={testId}>
      <div className="eyebrow text-[9px]">{label}</div>
      <div className="font-display text-3xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}
