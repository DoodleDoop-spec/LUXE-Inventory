import { useEffect, useState } from "react";
import { X, RotateCcw, Undo2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";

function relative(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

export default function ImportHistoryDialog({ open, onClose, entityFilter, onChanged }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/imports");
      setBatches(r.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load import history");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const undo = async (b) => {
    if (!window.confirm(`Undo import from ${new Date(b.created_at).toLocaleString()}? ${b.created_count} ${b.entity} will be deleted.`)) return;
    setBusyId(b.id);
    try {
      const r = await api.post(`/imports/${b.id}/undo`);
      toast.success(`Reverted ${r.data.deleted} ${b.entity}`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Undo failed");
    }
    setBusyId(null);
  };

  const filtered = entityFilter ? batches.filter((b) => b.entity === entityFilter) : batches;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="import-history-overlay">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] flex flex-col border border-[#09090B]">
        <div className="p-4 border-b border-[#E4E4E7] flex items-center justify-between">
          <div>
            <div className="eyebrow">IMPORT HISTORY{entityFilter ? ` · ${entityFilter.toUpperCase()}` : ""}</div>
            <h2 className="font-display text-xl font-semibold text-[#09090B]">Recent CSV batches</h2>
          </div>
          <div className="flex items-center gap-2">
            <button data-testid="import-history-refresh" onClick={load} className="p-2 hover:bg-[#F4F4F5]" title="Refresh">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button data-testid="import-history-close" onClick={onClose} className="p-2 hover:bg-[#F4F4F5]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-8 text-center text-sm text-[#71717A]">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-[#71717A]" data-testid="import-history-empty">
              No imports yet. When you upload a CSV it will show up here — with a one-click undo.
            </div>
          )}
          {!loading && filtered.map((b) => (
            <div key={b.id} className="p-4 border-b border-[#E4E4E7] flex items-start gap-4" data-testid={`import-batch-${b.id}`}>
              <div className="w-8 h-8 flex items-center justify-center border border-[#E4E4E7] shrink-0 mt-0.5">
                {b.undone ? <Undo2 className="h-4 w-4 text-[#71717A]" /> : <CheckCircle2 className="h-4 w-4 text-[#10B981]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[#09090B]">
                    {b.entity === "equipment" ? "Equipment" : "Costumes"} · {b.created_count} row{b.created_count === 1 ? "" : "s"}
                  </span>
                  {b.undone && (
                    <span className="text-[9px] font-mono-label tracking-widest bg-[#F4F4F5] text-[#71717A] px-1.5 py-0.5">UNDONE</span>
                  )}
                </div>
                <div className="text-[11px] text-[#71717A] mt-1 tabular-nums">
                  {b.user_email || "unknown"} · {relative(b.created_at)}
                  {b.duplicates > 0 ? ` · ${b.duplicates} dupe${b.duplicates === 1 ? "" : "s"} skipped` : ""}
                  {b.invalid > 0 ? ` · ${b.invalid} invalid` : ""}
                </div>
              </div>
              <Button
                data-testid={`import-batch-undo-${b.id}`}
                variant="outline"
                disabled={b.undone || busyId === b.id}
                onClick={() => undo(b)}
                className="rounded-none h-9 border-[#E4E4E7] text-xs disabled:opacity-40"
              >
                <Undo2 className="h-3 w-3 mr-1" /> {b.undone ? "Undone" : (busyId === b.id ? "Undoing…" : "Undo batch")}
              </Button>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-[#E4E4E7] bg-[#FAFAFA] text-[10px] font-mono-label tracking-widest text-[#71717A]">
          UNDO REMOVES ROWS INSERTED BY THAT BATCH. AUTO-CREATED CATEGORIES/LOCATIONS ARE KEPT.
        </div>
      </div>
    </div>
  );
}
