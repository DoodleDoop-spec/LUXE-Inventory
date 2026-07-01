import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Plus, Search, LayoutGrid, List, X, MapPin, ChevronRight, Flag, StickyNote, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import CostumeFormDialog from "@/components/CostumeFormDialog";
import { toast } from "sonner";

const ALL = "__all__";

export default function Inventory() {
  const location = useLocation();
  const navigate = useNavigate();
  const [costumes, setCostumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [sizingSystems, setSizingSystems] = useState([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ALL);
  const [subcategory, setSubcategory] = useState(ALL);
  const [systemFilter, setSystemFilter] = useState(ALL);
  const [loc, setLoc] = useState(ALL);
  const [size, setSize] = useState(ALL);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sort, setSort] = useState("updated_desc");
  const [view, setView] = useState("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/settings");
        if (r.data?.default_view === "list") setView("list");
      } catch { /* ignore */ }
    })();
  }, []);

  // Sync q from URL (from header global search or Dashboard link)
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const urlQ = sp.get("q") || "";
    setQ(urlQ);
    if (sp.get("new") === "1") {
      setEditing(null);
      setDialogOpen(true);
      // strip params
      navigate("/inventory" + (urlQ ? `?q=${encodeURIComponent(urlQ)}` : ""), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const currentCategory = useMemo(
    () => categories.find((c) => c.name === category),
    [categories, category]
  );
  const currentSystem = useMemo(
    () => sizingSystems.find((s) => s.name === systemFilter),
    [sizingSystems, systemFilter]
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (category !== ALL) params.category = category;
      if (subcategory !== ALL) params.subcategory = subcategory;
      if (loc !== ALL) params.location = loc;
      if (size !== ALL) params.size = size;
      if (systemFilter !== ALL) params.sizing_system = systemFilter;
      if (flaggedOnly) params.flagged = true;
      if (sort && sort !== "updated_desc") params.sort = sort;
      const [c, cats, locs, systems] = await Promise.all([
        api.get("/costumes", { params }),
        api.get("/categories"),
        api.get("/locations"),
        api.get("/sizing-systems"),
      ]);
      setCostumes(c.data);
      setCategories(cats.data);
      setLocations(locs.data);
      setSizingSystems(systems.data);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load inventory");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, subcategory, loc, size, systemFilter, flaggedOnly, sort]);

  useEffect(() => {
    const t = setTimeout(() => fetchAll(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const handleNew = () => { setEditing(null); setDialogOpen(true); };
  const handleEdit = (c) => { setEditing(c); setDialogOpen(true); };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this costume? This cannot be undone.")) return;
    try {
      await api.delete(`/costumes/${id}`);
      toast.success("Costume deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleSaved = () => { setDialogOpen(false); fetchAll(); };

  const filterCount = useMemo(() => {
    return (q ? 1 : 0) + (category !== ALL ? 1 : 0) + (subcategory !== ALL ? 1 : 0)
      + (loc !== ALL ? 1 : 0) + (size !== ALL ? 1 : 0) + (systemFilter !== ALL ? 1 : 0)
      + (flaggedOnly ? 1 : 0);
  }, [q, category, subcategory, loc, size, systemFilter, flaggedOnly]);

  const clearFilters = () => {
    setQ(""); setCategory(ALL); setSubcategory(ALL); setSystemFilter(ALL);
    setLoc(ALL); setSize(ALL); setFlaggedOnly(false); setSort("updated_desc");
  };

  // When system filter changes, restrict size list to that system's sizes
  const sizeOptions = currentSystem?.sizes || [
    ...new Set(sizingSystems.flatMap((s) => s.sizes)),
  ];

  return (
    <div className="space-y-8" data-testid="inventory-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="eyebrow">INDEX 02 / INVENTORY</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
            All Costumes
          </h1>
          <p className="text-sm text-[#71717A]">{costumes.length} {costumes.length === 1 ? "item" : "items"} found</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[#E4E4E7]">
            <button
              data-testid="view-grid-btn"
              onClick={() => setView("grid")}
              className={`p-2.5 ${view === "grid" ? "bg-[#09090B] text-white" : "bg-white text-[#09090B]"}`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              data-testid="view-list-btn"
              onClick={() => setView("list")}
              className={`p-2.5 ${view === "list" ? "bg-[#09090B] text-white" : "bg-white text-[#09090B]"}`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button data-testid="add-costume-btn" onClick={handleNew} className="bg-[#09090B] hover:bg-[#27272A] rounded-none text-white h-10">
            <Plus className="h-4 w-4 mr-1" />Add Costume
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="border border-[#E4E4E7] p-4 md:p-5 space-y-3">
        <div className="grid md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <Input
              data-testid="search-input"
              placeholder="Search by name, category, keywords…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 h-11 rounded-none border-[#E4E4E7]"
            />
          </div>
          <div className="md:col-span-2">
            <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(ALL); }}>
              <SelectTrigger data-testid="filter-category" className="h-11 rounded-none border-[#E4E4E7]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={subcategory} onValueChange={setSubcategory} disabled={!currentCategory?.subcategories?.length}>
              <SelectTrigger data-testid="filter-subcategory" className="h-11 rounded-none border-[#E4E4E7]">
                <SelectValue placeholder="Subcategory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All subcategories</SelectItem>
                {(currentCategory?.subcategories || []).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={loc} onValueChange={setLoc}>
              <SelectTrigger data-testid="filter-location" className="h-11 rounded-none border-[#E4E4E7]">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={systemFilter} onValueChange={(v) => { setSystemFilter(v); setSize(ALL); }}>
              <SelectTrigger data-testid="filter-sizing-system" className="h-11 rounded-none border-[#E4E4E7]">
                <SelectValue placeholder="Sizing system" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All systems</SelectItem>
                {sizingSystems.map((s) => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid md:grid-cols-12 gap-3">
          <div className="md:col-span-3">
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger data-testid="filter-size" className="h-10 rounded-none border-[#E4E4E7]">
                <SelectValue placeholder="Size available" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any size</SelectItem>
                {sizeOptions.map((s) => (
                  <SelectItem key={s} value={s}>Size {s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger data-testid="sort-select" className="h-10 rounded-none border-[#E4E4E7]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_desc">Recently updated</SelectItem>
                <SelectItem value="last_used_asc">Last year used ↑ (oldest first)</SelectItem>
                <SelectItem value="last_used_desc">Last year used ↓ (newest first)</SelectItem>
                <SelectItem value="name_asc">Name A → Z</SelectItem>
                <SelectItem value="total_desc">Total qty ↓</SelectItem>
                <SelectItem value="system_size">Sizing system, then name</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-6 flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              data-testid="filter-flagged-btn"
              onClick={() => setFlaggedOnly(!flaggedOnly)}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border ${flaggedOnly ? "bg-[#EF4444] text-white border-[#EF4444]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
            >
              <Flag className="h-3 w-3" fill={flaggedOnly ? "currentColor" : "none"} />
              Flagged only
            </button>
            {filterCount > 0 && (
              <button
                data-testid="clear-filters-btn"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B]"
              >
                <X className="h-3 w-3" /> Clear {filterCount} filter{filterCount > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="py-20 text-center eyebrow">LOADING…</div>
      ) : costumes.length === 0 ? (
        <div className="border border-[#E4E4E7] p-12 text-center" data-testid="empty-state">
          <p className="text-[#71717A] mb-4">No costumes match your filters.</p>
          {filterCount > 0 ? (
            <Button onClick={clearFilters} variant="outline" className="rounded-none">Clear filters</Button>
          ) : (
            <Button onClick={handleNew} className="bg-[#09090B] text-white rounded-none">
              <Plus className="h-4 w-4 mr-1" />Add your first costume
            </Button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
          {costumes.map((c) => (
            <CostumeCard key={c.id} costume={c} onEdit={handleEdit} onDelete={handleDelete} sizingSystems={sizingSystems} />
          ))}
        </div>
      ) : (
        <CostumeTable costumes={costumes} onEdit={handleEdit} onDelete={handleDelete} sizingSystems={sizingSystems} />
      )}

      <CostumeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        categories={categories}
        locations={locations}
        sizingSystems={sizingSystems}
        onSaved={handleSaved}
      />
    </div>
  );
}

function sizeSummary(costume, sizingSystems) {
  const sys = sizingSystems.find((s) => s.name === (costume.sizing_system || "Letter"));
  const keys = sys?.sizes || Object.keys(costume.sizes || {});
  return keys.filter((k) => (costume.sizes?.[k] || 0) > 0).map((k) => `${k}·${costume.sizes[k]}`).join("  ");
}

function CostumeCard({ costume, onEdit, onDelete, sizingSystems }) {
  const sys = sizingSystems.find((s) => s.name === (costume.sizing_system || "Letter"));
  const sizeKeys = sys?.sizes || Object.keys(costume.sizes || {});
  const anySizeNote = sizeKeys.some((s) => (costume.size_notes?.[s] || "").trim());
  return (
    <div className="bg-white p-5 group hover:bg-[#FAFAFA] transition-colors flex flex-col" data-testid={`costume-card-${costume.id}`}>
      <Link to={`/costume/${costume.id}`} className="block">
        <div className="aspect-[4/5] image-empty overflow-hidden mb-4 relative">
          {costume.image_id ? (
            <img
              src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${costume.image_id}`}
              alt={costume.name}
              className="w-full h-full object-cover"
            />
          ) : null}
          {costume.is_flagged && (
            <div className="absolute top-2 right-2 bg-[#EF4444] text-white px-2 py-1 flex items-center gap-1" data-testid={`flag-badge-${costume.id}`}>
              <Flag className="h-3 w-3" fill="currentColor" />
              <span className="text-[10px] font-mono-label">FLAGGED</span>
            </div>
          )}
          {costume.last_year_used && (
            <div className="absolute bottom-2 left-2 bg-white/95 border border-[#E4E4E7] px-2 py-0.5 flex items-center gap-1" data-testid={`year-badge-${costume.id}`}>
              <Calendar className="h-3 w-3 text-[#09090B]" />
              <span className="text-[10px] font-mono-label text-[#09090B]">{costume.last_year_used}</span>
            </div>
          )}
        </div>
      </Link>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="eyebrow truncate">
            {costume.category}
            {costume.subcategory ? <span className="text-[#09090B] normal-case tracking-normal"> · {costume.subcategory}</span> : null}
          </div>
          <Link to={`/costume/${costume.id}`}>
            <h3 className="font-display font-semibold text-lg text-[#09090B] truncate mt-1 hover:underline">
              {costume.name}
            </h3>
          </Link>
          <div className="flex items-center text-xs text-[#71717A] mt-1.5 gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {costume.location}{costume.sub_location ? ` · ${costume.sub_location}` : ""}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-2xl font-bold tabular-nums text-[#09090B]">{costume.total_quantity}</div>
          <div className="eyebrow text-[9px]">UNITS</div>
        </div>
      </div>
      {(costume.keywords || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3" data-testid={`kw-list-${costume.id}`}>
          {costume.keywords.slice(0, 6).map((k) => (
            <span key={k} className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F5] text-[#52525B] border border-[#E4E4E7]">
              {k}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3">
        <div className="eyebrow text-[9px] mb-1.5">{costume.sizing_system || "Letter"}</div>
        <div className="flex gap-1 flex-wrap">
          {sizeKeys.map((s) => {
            const qty = costume.sizes?.[s] || 0;
            const hasNote = (costume.size_notes?.[s] || "").trim().length > 0;
            return (
              <Badge key={s} variant="outline" className={`rounded-none border ${qty > 0 ? "border-[#09090B] text-[#09090B]" : "border-[#E4E4E7] text-[#A1A1AA]"}`}>
                <span className="font-mono-label text-[10px]">{s}</span>
                <span className="tabular-nums text-[10px] ml-1">{qty}</span>
                {hasNote && <StickyNote className="h-2.5 w-2.5 ml-0.5" />}
              </Badge>
            );
          })}
        </div>
      </div>
      {anySizeNote && (
        <div className="text-[10px] font-mono-label text-[#71717A] mt-2 flex items-center gap-1">
          <StickyNote className="h-3 w-3" /> HAS SIZE NOTES
        </div>
      )}
      <div className="flex gap-2 mt-4 pt-4 border-t border-[#E4E4E7]">
        <button
          data-testid={`edit-${costume.id}`}
          onClick={() => onEdit(costume)}
          className="text-xs font-medium text-[#09090B] hover:underline"
        >
          Edit
        </button>
        <span className="text-[#E4E4E7]">|</span>
        <button
          data-testid={`delete-${costume.id}`}
          onClick={() => onDelete(costume.id)}
          className="text-xs font-medium text-[#EF4444] hover:underline"
        >
          Delete
        </button>
        <Link
          to={`/costume/${costume.id}`}
          data-testid={`view-${costume.id}`}
          className="ml-auto text-xs font-medium text-[#09090B] hover:underline inline-flex items-center"
        >
          View <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function CostumeTable({ costumes, onEdit, onDelete, sizingSystems }) {
  return (
    <div className="border border-[#E4E4E7] overflow-x-auto" data-testid="costume-table">
      <table className="w-full text-sm">
        <thead className="bg-[#FAFAFA] border-b border-[#E4E4E7]">
          <tr className="text-left">
            <th className="px-4 py-3 eyebrow">Name</th>
            <th className="px-4 py-3 eyebrow">Category</th>
            <th className="px-4 py-3 eyebrow">Location</th>
            <th className="px-4 py-3 eyebrow">System</th>
            <th className="px-4 py-3 eyebrow">Sizes</th>
            <th className="px-4 py-3 eyebrow text-center">Last used</th>
            <th className="px-4 py-3 eyebrow text-right">Total</th>
            <th className="px-4 py-3 eyebrow text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {costumes.map((c) => (
            <tr key={c.id} className="border-b border-[#E4E4E7] hover:bg-[#FAFAFA]" data-testid={`row-${c.id}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {c.is_flagged && <Flag className="h-3 w-3 text-[#EF4444] shrink-0" fill="currentColor" />}
                  <Link to={`/costume/${c.id}`} className="font-medium text-[#09090B] hover:underline truncate">{c.name}</Link>
                </div>
              </td>
              <td className="px-4 py-3 text-[#52525B]">
                {c.category}{c.subcategory ? ` · ${c.subcategory}` : ""}
              </td>
              <td className="px-4 py-3 text-[#52525B]">
                {c.location}{c.sub_location ? ` · ${c.sub_location}` : ""}
              </td>
              <td className="px-4 py-3 text-[#52525B]">{c.sizing_system || "Letter"}</td>
              <td className="px-4 py-3 text-[#52525B] font-mono-label text-xs whitespace-nowrap">{sizeSummary(c, sizingSystems) || "—"}</td>
              <td className="px-4 py-3 text-center tabular-nums text-[#52525B]" data-testid={`row-year-${c.id}`}>{c.last_year_used || "—"}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{c.total_quantity}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onEdit(c)} data-testid={`row-edit-${c.id}`} className="text-xs font-medium text-[#09090B] hover:underline mr-3">Edit</button>
                <button onClick={() => onDelete(c.id)} data-testid={`row-delete-${c.id}`} className="text-xs font-medium text-[#EF4444] hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
