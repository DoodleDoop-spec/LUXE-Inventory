import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { Wrench, Plus, Search, X, ChevronDown, ChevronRight, Flag, Sparkles, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import EquipmentFormDialog from "@/components/EquipmentFormDialog";
import { toast } from "sonner";

export default function Equipment() {
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [sortingSystems, setSortingSystems] = useState([]);
  const [q, setQ] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [it, cats, locs, sys] = await Promise.all([
        api.get("/equipment", { params: q ? { q } : {} }),
        api.get("/equipment-categories"),
        api.get("/locations"),
        api.get("/equipment-sorting-systems"),
      ]);
      setItems(it.data);
      setCategories(cats.data);
      setLocations(locs.data);
      setSortingSystems(sys.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const refreshCategories = async () => {
    const r = await api.get("/equipment-categories");
    setCategories(r.data);
  };

  const refreshSortingSystems = async () => {
    const r = await api.get("/equipment-sorting-systems");
    setSortingSystems(r.data);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [q]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get("new") === "1") {
      setEditingItem(null);
      setDialogOpen(true);
      const newParams = new URLSearchParams(location.search);
      newParams.delete("new");
      navigate({ pathname: location.pathname, search: newParams.toString() }, { replace: true });
    }
    // eslint-disable-next-line
  }, [location.search]);

  const handleNew = () => { setEditingItem(null); setDialogOpen(true); };
  const handleEdit = (item) => { setEditingItem(item); setDialogOpen(true); };

  const handleDelete = async (item) => {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/equipment/${item.id}`);
      toast.success("Equipment deleted");
      fetchAll();
    } catch { toast.error("Failed to delete"); }
  };

  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = it.category || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <div className="space-y-8" data-testid="equipment-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="eyebrow">EQUIPMENT</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
            Equipment Inventory
          </h1>
          <p className="text-sm text-[#71717A]">
            Track hardware, tools, cables, mics, and other backstage gear.
          </p>
        </div>
        <Button data-testid="add-equipment-btn" onClick={handleNew} className="bg-[#09090B] hover:bg-[#27272A] rounded-none text-white h-10">
          <Plus className="h-4 w-4 mr-1" />Add Equipment
        </Button>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
        <Input
          data-testid="equipment-search"
          placeholder="Search equipment by name, keyword, vendor…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10 rounded-none border-[#E4E4E7] h-11"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#09090B]">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="text-sm text-[#71717A]">
        {loading ? "Loading…" : `${items.length} item${items.length === 1 ? "" : "s"} found`}
      </div>

      {items.length === 0 && !loading ? (
        <div className="border border-[#E4E4E7] bg-[#FAFAFA] p-12 text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white border border-[#E4E4E7] flex items-center justify-center">
            <Wrench className="h-7 w-7 text-[#71717A]" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-[#09090B] mb-1">No equipment yet</h2>
            <p className="text-sm text-[#71717A] mb-4">Start tracking backstage gear and hardware.</p>
            <Button data-testid="equipment-empty-add" onClick={handleNew} className="bg-[#09090B] hover:bg-[#27272A] rounded-none text-white">
              <Plus className="h-4 w-4 mr-1" /> Add first equipment
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="equipment-categories">
          {grouped.map(([catName, list]) => {
            const catMeta = categories.find((c) => c.name === catName);
            const color = catMeta?.color || "#71717A";
            const collapsed = !expandedCategories[catName];
            return (
              <section key={catName} data-testid={`equip-cat-${catName}`} className="border border-[#E4E4E7]">
                <button
                  type="button"
                  data-testid={`equip-cat-toggle-${catName}`}
                  onClick={() => setExpandedCategories((p) => ({ ...p, [catName]: !p[catName] }))}
                  className="w-full flex items-center gap-3 p-4 md:p-5 hover:bg-[#FAFAFA]"
                >
                  {collapsed ? <ChevronRight className="h-5 w-5 text-[#09090B]" /> : <ChevronDown className="h-5 w-5 text-[#09090B]" />}
                  <div className="w-3 h-3 shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-display text-lg font-semibold text-[#09090B]">{catName}</span>
                  <span className="text-xs text-[#71717A] tabular-nums">
                    {list.length} {list.length === 1 ? "piece" : "pieces"} · {list.reduce((a, x) => a + (x.total_quantity || 0), 0)} units
                  </span>
                </button>
                {!collapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-[#E4E4E7] border-t border-[#E4E4E7]">
                    {list.map((it) => (
                      <EquipmentCard
                        key={it.id}
                        item={it}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        sortingSystems={sortingSystems}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <EquipmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editingItem}
        categories={categories}
        sortingSystems={sortingSystems}
        locations={locations}
        onSaved={fetchAll}
        onCategoriesChanged={refreshCategories}
        onSortingSystemsChanged={refreshSortingSystems}
      />
    </div>
  );
}

function EquipmentCard({ item, onEdit, onDelete, sortingSystems }) {
  const effectiveSys = item.sorting_system || "";
  const sys = effectiveSys ? sortingSystems.find((s) => s.name === effectiveSys) : null;
  const sizeKeys = sys?.sizes || Object.keys(item.sizes || {});
  return (
    <div className="bg-white p-4 relative hover:bg-[#FAFAFA]" data-testid={`equipment-card-${item.id}`}>
      <div className="aspect-square mb-3 image-empty overflow-hidden relative">
        {item.image_id ? (
          <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${item.image_id}`} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Wrench className="h-6 w-6 text-[#A1A1AA]" />
          </div>
        )}
        {item.is_flagged && (
          <div className="absolute top-2 right-2 bg-[#EF4444] text-white p-1"><Flag className="h-3 w-3" fill="currentColor" /></div>
        )}
        {item.pinned && (
          <div className="absolute top-2 left-2 bg-[#F59E0B] text-white p-1"><Sparkles className="h-3 w-3" fill="currentColor" /></div>
        )}
        {item.in_use && (
          <div className="absolute bottom-2 left-2 right-2 bg-[#10B981]/90 text-white text-[10px] font-mono-label tracking-widest text-center py-0.5">IN USE</div>
        )}
      </div>
      <div className="eyebrow truncate">{item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}</div>
      <div className="font-display font-semibold text-[#09090B] truncate mt-1">{item.name}</div>
      <div className="text-xs text-[#71717A] mt-1 truncate">{item.location}{item.sub_location ? ` · ${item.sub_location}` : ""}</div>
      <div className="mt-3">
        {effectiveSys ? (
          <>
            <div className="eyebrow text-[9px] mb-1.5">{effectiveSys}</div>
            <div className="flex gap-1 flex-wrap">
              {sizeKeys.map((s) => {
                const qty = item.sizes?.[s] || 0;
                return (
                  <Badge key={s} variant="outline" className={`rounded-none border ${qty > 0 ? "border-[#09090B] text-[#09090B]" : "border-[#E4E4E7] text-[#A1A1AA]"}`}>
                    <span className="font-mono-label text-[10px]">{s}</span>
                    <span className="tabular-nums text-[10px] ml-1">{qty}</span>
                  </Badge>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="eyebrow text-[9px] mb-1.5">QUANTITY</div>
            <div className="font-display text-2xl font-bold text-[#09090B] tabular-nums">{item.total_quantity ?? 0}</div>
          </>
        )}
      </div>
      <div className="flex gap-2 mt-4 pt-4 border-t border-[#E4E4E7]">
        <button data-testid={`edit-equip-${item.id}`} onClick={() => onEdit(item)} className="text-xs font-medium text-[#09090B] hover:underline inline-flex items-center gap-1">
          <Pencil className="h-3 w-3" /> Edit
        </button>
        <span className="text-[#E4E4E7]">|</span>
        <button data-testid={`delete-equip-${item.id}`} onClick={() => onDelete(item)} className="text-xs font-medium text-[#EF4444] hover:underline inline-flex items-center gap-1">
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>
    </div>
  );
}
