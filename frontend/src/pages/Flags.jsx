import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Plus, Trash2, Pencil, Flag, ChevronDown, ChevronRight, Save, X, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const PRESET_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
  "#10B981", "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#F43F5E", "#71717A",
];

export default function Flags() {
  const [categories, setCategories] = useState([]);
  const [costumesByFc, setCostumesByFc] = useState({});
  const [expanded, setExpanded] = useState({});
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#EF4444");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#EF4444");
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const r = await api.get("/flag-categories");
      setCategories(r.data);
      const map = {};
      for (const fc of r.data) {
        const cr = await api.get(`/flag-categories/${fc.id}/costumes`);
        map[fc.id] = cr.data;
      }
      setCostumesByFc(map);
    } catch (err) {
      toast.error("Failed to load flags");
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const totalFlagged = useMemo(
    () => Object.values(costumesByFc).reduce((acc, list) => acc + list.length, 0),
    [costumesByFc]
  );

  const addCategory = async (e) => {
    e?.preventDefault?.();
    const name = newName.trim();
    if (!name) return;
    try {
      await api.post("/flag-categories", { name, color: newColor });
      setNewName("");
      setNewColor("#EF4444");
      toast.success("Flag added");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add flag");
    }
  };

  const startEdit = (fc) => {
    setEditingId(fc.id);
    setEditName(fc.name);
    setEditColor(fc.color);
  };

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) { toast.error("Name required"); return; }
    try {
      await api.put(`/flag-categories/${editingId}`, { name, color: editColor });
      setEditingId(null);
      toast.success("Flag updated");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update");
    }
  };

  const removeCategory = async (fc) => {
    const count = costumesByFc[fc.id]?.length || 0;
    const msg = count > 0
      ? `Delete flag "${fc.name}"? It will be removed from ${count} costume(s).`
      : `Delete flag "${fc.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/flag-categories/${fc.id}`);
      toast.success("Flag deleted");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Cannot delete");
    }
  };

  return (
    <div className="space-y-10" data-testid="flags-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="eyebrow">FLAGS</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
            Flags
          </h1>
          <p className="text-sm text-[#71717A] max-w-2xl">
            Create flag types (e.g. On Loan, Needs Repair) and attach them to costumes with a specific note.
            {totalFlagged > 0 && (
              <> Currently <span className="font-medium text-[#09090B] tabular-nums">{totalFlagged}</span> flag{totalFlagged === 1 ? "" : "s"} attached across your inventory.</>
            )}
          </p>
        </div>
      </div>

      {/* New flag form */}
      <section className="border border-[#E4E4E7] p-5" data-testid="new-flag-form">
        <form onSubmit={addCategory} className="grid md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <Label className="eyebrow">FLAG NAME</Label>
            <Input
              data-testid="new-flag-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. On Loan, Needs Repair, In Cleaning"
              className="rounded-none border-[#E4E4E7] h-11 mt-2"
            />
          </div>
          <div className="md:col-span-5">
            <Label className="eyebrow">COLOR</Label>
            <ColorSwatchGrid value={newColor} onChange={setNewColor} testIdPrefix="new-flag" />
          </div>
          <div className="md:col-span-2">
            <Button data-testid="new-flag-add-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-11 w-full">
              <Plus className="h-4 w-4 mr-1" /> Add flag
            </Button>
          </div>
        </form>
      </section>

      {/* Categories with attached costumes */}
      {loading ? (
        <div className="py-20 text-center eyebrow">LOADING…</div>
      ) : categories.length === 0 ? (
        <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]" data-testid="flags-empty">
          No flag types yet. Create one above to start tagging costumes.
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((fc) => {
            const list = costumesByFc[fc.id] || [];
            const open = expanded[fc.id] !== false; // default open
            const isEditing = editingId === fc.id;
            return (
              <section key={fc.id} className="border border-[#E4E4E7]" data-testid={`flag-cat-${fc.id}`}>
                <div className="flex items-stretch">
                  <div className="w-1.5 shrink-0" style={{ backgroundColor: fc.color }} />
                  <button
                    type="button"
                    data-testid={`toggle-flag-${fc.id}`}
                    onClick={() => setExpanded({ ...expanded, [fc.id]: !open })}
                    className="flex-1 flex items-center gap-3 px-5 py-4 text-left hover:bg-[#FAFAFA]"
                  >
                    {open ? <ChevronDown className="h-4 w-4 text-[#71717A]" /> : <ChevronRight className="h-4 w-4 text-[#71717A]" />}
                    <Flag className="h-4 w-4" style={{ color: fc.color }} fill={fc.color} />
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                        <Input
                          data-testid={`edit-flag-name-${fc.id}`}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-9 rounded-none border-[#E4E4E7] max-w-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : (
                      <>
                        <span className="font-display font-semibold text-lg text-[#09090B]">{fc.name}</span>
                        <span className="text-xs text-[#71717A] tabular-nums">
                          {list.length} costume{list.length === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                  </button>
                  <div className="flex items-center gap-1 px-3">
                    {isEditing ? (
                      <>
                        <div onClick={(e) => e.stopPropagation()}>
                          <ColorSwatchGrid value={editColor} onChange={setEditColor} testIdPrefix={`edit-flag-${fc.id}`} compact />
                        </div>
                        <Button data-testid={`save-flag-${fc.id}`} onClick={saveEdit} className="bg-[#09090B] text-white rounded-none h-9">
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button data-testid={`cancel-flag-${fc.id}`} variant="outline" onClick={() => setEditingId(null)} className="rounded-none h-9">
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          data-testid={`edit-flag-btn-${fc.id}`}
                          onClick={(e) => { e.stopPropagation(); startEdit(fc); }}
                          className="p-2 text-[#09090B] hover:bg-[#F4F4F5]"
                          aria-label="Edit flag"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          data-testid={`delete-flag-btn-${fc.id}`}
                          onClick={(e) => { e.stopPropagation(); removeCategory(fc); }}
                          className="p-2 text-[#EF4444] hover:bg-[#FEF2F2]"
                          aria-label="Delete flag"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="border-t border-[#E4E4E7]" data-testid={`flag-costumes-${fc.id}`}>
                    {list.length === 0 ? (
                      <div className="p-6 text-center text-sm text-[#71717A]">
                        No costumes have this flag attached yet.
                      </div>
                    ) : (
                      <ul className="divide-y divide-[#E4E4E7]">
                        {list.map((c) => {
                          const attached = (c.flags || []).find((f) => f.category_id === fc.id);
                          return (
                            <li key={c.id}>
                              <Link
                                to={`/costume/${c.id}`}
                                data-testid={`flag-costume-${fc.id}-${c.id}`}
                                className="flex items-start gap-4 p-4 hover:bg-[#FAFAFA]"
                              >
                                <div className="w-14 h-14 image-empty overflow-hidden border border-[#E4E4E7] shrink-0 flex items-center justify-center">
                                  {c.image_id ? (
                                    <img
                                      src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`}
                                      alt={c.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Flag className="h-4 w-4 text-[#A1A1AA]" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-[#09090B] truncate">{c.name}</span>
                                    <span className="eyebrow text-[10px]">{c.category}</span>
                                  </div>
                                  <div className="text-xs text-[#71717A] mt-0.5 truncate">
                                    {c.location}{c.sub_location ? ` · ${c.sub_location}` : ""}
                                  </div>
                                  {attached?.note && (
                                    <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[#27272A] bg-[#FAFAFA] border border-[#E4E4E7] px-2 py-1">
                                      <StickyNote className="h-3 w-3 shrink-0 mt-0.5" />
                                      <span className="whitespace-pre-wrap">{attached.note}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-display text-lg font-bold tabular-nums text-[#09090B]">{c.total_quantity}</div>
                                  <div className="eyebrow text-[9px]">UNITS</div>
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColorSwatchGrid({ value, onChange, testIdPrefix, compact = false }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-2"}`} data-testid={`${testIdPrefix}-color-grid`}>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          data-testid={`${testIdPrefix}-color-${c.replace("#", "")}`}
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-none border-2 transition-transform ${
            value === c ? "border-[#09090B] scale-110" : "border-transparent hover:border-[#71717A]"
          }`}
          style={{ backgroundColor: c }}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  );
}
