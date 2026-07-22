import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { useSettings } from "@/context/SettingsContext";
import { Plus, Search, LayoutGrid, List, X, MapPin, ChevronRight, ChevronDown, Flag, StickyNote, SlidersHorizontal, ArrowUpDown, Calendar, Image as ImageIcon, Package, Tag as TagIcon, Sparkles, AlertTriangle, FileUp } from "lucide-react";
import { getCostumeFlagColor } from "@/lib/flagColor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import CostumeFormDialog from "@/components/CostumeFormDialog";
import ImportWizard from "@/components/ImportWizard";
import ImportHistoryDialog from "@/components/ImportHistoryDialog";
import { useAuth } from "@/context/AuthContext";
import { History } from "lucide-react";
import { toast } from "sonner";

const ALL = "__all__";
const DEFAULT_SORT = "origin_year_desc";

// Given a flat list of {id, name, parent_id} nodes, return list of {id, path} in tree order.
function subcategoryPathOptions(subs) {
  const byId = {};
  for (const s of subs || []) byId[s.id] = s;
  const pathOf = (id) => {
    const parts = [];
    let cur = byId[id];
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.push(cur.name);
      cur = cur.parent_id ? byId[cur.parent_id] : null;
    }
    return parts.reverse().join(" / ");
  };
  return (subs || [])
    .map((s) => ({ id: s.id, path: pathOf(s.id) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export default function Inventory() {
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { settings } = useSettings();
  const showInUseMarker = (settings.hide_in_use_mode || "full") === "full";
  const hideInUseAll = (settings.hide_in_use_mode || "full") === "hide_all";
  const [costumes, setCostumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [flagCatById, setFlagCatById] = useState({});
  const [locations, setLocations] = useState([]);
  const [sizingSystems, setSizingSystems] = useState([]);
  const [shows, setShows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ALL);
  const [subcategory, setSubcategory] = useState(ALL);
  const [loc, setLoc] = useState(ALL);
  const [yearFilter, setYearFilter] = useState("");
  const [showFilter, setShowFilter] = useState(ALL);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [view, setView] = useState("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [dragging, setDragging] = useState(null); // costume being dragged
  const [dragOverTarget, setDragOverTarget] = useState(null); // "cat:<name>" or "loc:<path>"
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { hasPerm } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/settings");
        if (r.data?.default_view === "list") setView("list");
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const urlQ = sp.get("q") || "";
    setQ(urlQ);
    if (sp.get("new") === "1") {
      setEditing(null);
      setDialogOpen(true);
      navigate("/inventory" + (urlQ ? `?q=${encodeURIComponent(urlQ)}` : ""), { replace: true });
    }
  }, [location.search, navigate]);

  const currentCategory = useMemo(
    () => categories.find((c) => c.name === category),
    [categories, category]
  );

  const showsById = useMemo(() => {
    const m = {};
    for (const s of shows) m[s.id] = s;
    return m;
  }, [shows]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (category !== ALL) params.category = category;
      if (subcategory !== ALL) params.subcategory = subcategory;
      if (loc !== ALL) params.location = loc;
      if (yearFilter.trim()) {
        const y = parseInt(yearFilter, 10);
        if (!isNaN(y)) params.year = y;
      }
      if (showFilter !== ALL) params.show_id = showFilter;
      if (flaggedOnly) params.flagged = true;
      params.sort = sort;
      const [c, cats, locs, systems, sh, grs, fc] = await Promise.all([
        api.get("/costumes", { params }),
        api.get("/categories"),
        api.get("/locations"),
        api.get("/sizing-systems"),
        api.get("/shows"),
        api.get("/groups"),
        api.get("/flag-categories"),
      ]);
      setCostumes(c.data);
      setCategories(cats.data);
      setLocations(locs.data);
      setSizingSystems(systems.data);
      setShows(sh.data);
      setGroups(grs.data);
      const fcm = {};
      for (const cat of fc.data) fcm[cat.id] = cat;
      setFlagCatById(fcm);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load inventory");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, subcategory, loc, yearFilter, showFilter, flaggedOnly, sort]);

  useEffect(() => {
    const t = setTimeout(() => fetchAll(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const handleNew = () => { setEditing(null); setDialogOpen(true); };
  const handleEdit = (c) => { setEditing(c); setDialogOpen(true); };

  const handleDelete = async (id, name) => {
    const ok = await confirm({
      title: `Delete "${name || "this costume"}"?`,
      description: "This cannot be undone. The costume's photos and notes will be gone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/costumes/${id}`);
      toast.success("Costume deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleSaved = (opts) => {
    if (opts && opts.refresh_only) { fetchAll(); return; }
    setDialogOpen(false);
    fetchAll();
  };

  const handleDropOnCategory = async (categoryName) => {
    if (!dragging || dragging.category === categoryName) return;
    try {
      await api.put(`/costumes/${dragging.id}`, { category: categoryName, subcategory: "" });
      toast.success(`Moved "${dragging.name}" to ${categoryName}`);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to move");
    }
  };

  const handleDropOnLocation = async (locationPath) => {
    if (!dragging || dragging.location === locationPath) return;
    try {
      await api.put(`/costumes/${dragging.id}`, { location: locationPath, sub_location: "" });
      toast.success(`Moved "${dragging.name}" to ${locationPath}`);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to move");
    }
  };

  const filterCount = useMemo(() => {
    return (category !== ALL ? 1 : 0) + (subcategory !== ALL ? 1 : 0)
      + (loc !== ALL ? 1 : 0) + (yearFilter.trim() ? 1 : 0) + (showFilter !== ALL ? 1 : 0) + (flaggedOnly ? 1 : 0);
  }, [category, subcategory, loc, yearFilter, showFilter, flaggedOnly]);

  const clearFilters = () => {
    setCategory(ALL); setSubcategory(ALL); setLoc(ALL);
    setYearFilter(""); setShowFilter(ALL); setFlaggedOnly(false);
  };

  const clearSearch = () => setQ("");

  const sortLabel = {
    origin_year_desc: "Most recently used",
    origin_year_asc: "Oldest first",
    updated_desc: "Recently updated",
    name_asc: "Name A → Z",
    total_desc: "Total qty ↓",
  }[sort] || sort;

  return (
    <div className="space-y-8" data-testid="inventory-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="eyebrow">COSTUMES</div>
          <h1 className="font-display text-4xl sm:text-5xl xl:text-6xl tracking-tight font-bold text-[#09090B] leading-[1.05]">
            Costume Inventory
          </h1>
          <p className="text-sm md:text-base text-[#71717A] max-w-xl">{costumes.length} {costumes.length === 1 ? "item" : "items"} found</p>
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
          {hasPerm("costumes.create") && (
            <>
              <Button
                data-testid="import-costumes-btn"
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="rounded-none h-10 border-[#E4E4E7]"
              >
                <FileUp className="h-4 w-4 mr-1" />Import CSV
              </Button>
              <Button
                data-testid="import-history-btn"
                variant="outline"
                onClick={() => setHistoryOpen(true)}
                className="rounded-none h-10 border-[#E4E4E7]"
                title="Import history"
              >
                <History className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search + Filters/Sort toggles */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <Input
              data-testid="search-input"
              placeholder="Search by name, keywords, creator…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 pr-9 h-11 rounded-none border-[#E4E4E7]"
            />
            {q && (
              <button
                type="button"
                onClick={clearSearch}
                data-testid="search-clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#71717A] hover:text-[#09090B]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            data-testid="toggle-filters-btn"
            onClick={() => { setFiltersOpen(!filtersOpen); setSortOpen(false); }}
            className={`inline-flex items-center gap-2 h-11 px-4 border text-sm ${filtersOpen || filterCount ? "bg-[#09090B] text-white border-[#09090B]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters{filterCount ? ` · ${filterCount}` : ""}
          </button>
          <button
            type="button"
            data-testid="toggle-sort-btn"
            onClick={() => { setSortOpen(!sortOpen); setFiltersOpen(false); }}
            className={`inline-flex items-center gap-2 h-11 px-4 border text-sm ${sortOpen ? "bg-[#09090B] text-white border-[#09090B]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
          >
            <ArrowUpDown className="h-4 w-4" />
            <span className="hidden sm:inline">Sort:</span> {sortLabel}
          </button>
        </div>

        {filtersOpen && (
          <div className="border border-[#E4E4E7] p-4 md:p-5 space-y-3" data-testid="filters-panel">
            <div className="grid md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(ALL); }}>
                  <SelectTrigger data-testid="filter-category" className="h-11 rounded-none border-[#E4E4E7]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All categories</SelectItem>
                    {Array.from(new Map(categories.map((c) => [c.name, c])).values()).map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3">
                <Select value={subcategory} onValueChange={setSubcategory} disabled={!currentCategory?.subcategories?.length}>
                  <SelectTrigger data-testid="filter-subcategory" className="h-11 rounded-none border-[#E4E4E7]">
                    <SelectValue placeholder="Subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All subcategories</SelectItem>
                    {subcategoryPathOptions(currentCategory?.subcategories || []).map((s) => (
                      <SelectItem key={s.id} value={s.path}>{s.path}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-4">
                <Select value={loc} onValueChange={setLoc}>
                  <SelectTrigger data-testid="filter-location" className="h-11 rounded-none border-[#E4E4E7]">
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All locations</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.path}>{l.path}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex items-center">
                <button
                  type="button"
                  data-testid="filter-flagged-btn"
                  onClick={() => setFlaggedOnly(!flaggedOnly)}
                  className={`w-full inline-flex items-center justify-center gap-1.5 text-xs px-3 h-11 border ${flaggedOnly ? "bg-[#EF4444] text-white border-[#EF4444]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
                >
                  <Flag className="h-3 w-3" fill={flaggedOnly ? "currentColor" : "none"} />
                  Flagged only
                </button>
              </div>
            </div>
            <div className="grid md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <Input
                  type="number"
                  data-testid="filter-year"
                  placeholder="Origin year (e.g. 2023)"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="h-11 rounded-none border-[#E4E4E7]"
                />
              </div>
              <div className="md:col-span-4">
                <Select value={showFilter} onValueChange={setShowFilter}>
                  <SelectTrigger data-testid="filter-show" className="h-11 rounded-none border-[#E4E4E7]">
                    <SelectValue placeholder="Show" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All shows</SelectItem>
                    {shows.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}{s.year != null ? ` (${s.year})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
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
        )}

        {sortOpen && (
          <div className="border border-[#E4E4E7] p-4 md:p-5" data-testid="sort-panel">
            <Select value={sort} onValueChange={(v) => { setSort(v); setSortOpen(false); }}>
              <SelectTrigger data-testid="sort-select" className="h-11 rounded-none border-[#E4E4E7] max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="origin_year_desc">Most recently used</SelectItem>
                <SelectItem value="origin_year_asc">Oldest first</SelectItem>
                <SelectItem value="updated_desc">Recently updated</SelectItem>
                <SelectItem value="name_asc">Name A → Z</SelectItem>
                <SelectItem value="total_desc">Total qty ↓</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Groups strip removed — groups have been merged into categories */}
      {false && groups.length > 0 && (
        <section className="space-y-3" data-testid="groups-strip">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[#71717A]" />
            <span className="eyebrow">GROUPS ({groups.length})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {groups.map((g) => (
              <Link
                key={g.id}
                to={`/group/${g.id}`}
                data-testid={`group-card-${g.id}`}
                className="bg-white border border-[#E4E4E7] p-4 hover:border-[#09090B] transition-colors"
              >
                <div className="aspect-square image-empty overflow-hidden mb-3 flex items-center justify-center relative">
                  {g.image_id ? (
                    <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${g.image_id}`} alt={g.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-8 w-8 text-[#A1A1AA]" />
                  )}
                  <div className="absolute top-1.5 left-1.5 bg-[#09090B] text-white px-1.5 py-0.5 text-[9px] font-mono-label">GROUP</div>
                </div>
                <div className="eyebrow text-[10px] truncate">{g.category || "—"}</div>
                <div className="font-display font-semibold text-sm text-[#09090B] truncate mt-0.5">{g.name}</div>
                <div className="text-xs text-[#71717A] mt-1 tabular-nums">{g.variant_count || 0} variant{g.variant_count === 1 ? "" : "s"}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
      {loading ? (
        <div className="py-20 text-center eyebrow">LOADING…</div>
      ) : costumes.length === 0 ? (
        <div className="border border-[#E4E4E7] p-12 text-center" data-testid="empty-state">
          <p className="text-[#71717A] mb-4">No costumes match your filters.</p>
          {filterCount > 0 || q ? (
            <Button onClick={() => { clearFilters(); clearSearch(); }} variant="outline" className="rounded-none">Clear filters &amp; search</Button>
          ) : (
            <Button onClick={handleNew} className="bg-[#09090B] text-white rounded-none">
              <Plus className="h-4 w-4 mr-1" />Add your first costume
            </Button>
          )}
        </div>
      ) : view === "grid" ? (
        (() => {
          // Group costumes by category (accordion style)
          const groupsByCat = new Map();
          for (const c of costumes) {
            const key = c.category || "Uncategorized";
            if (!groupsByCat.has(key)) groupsByCat.set(key, []);
            groupsByCat.get(key).push(c);
          }
          const entries = Array.from(groupsByCat.entries()).sort((a, b) => a[0].localeCompare(b[0]));
          return (
            <div className="space-y-4" data-testid="inventory-categories">
              {entries.map(([catName, items]) => {
                const catMeta = (categories || []).find((c) => c.name === catName);
                const color = catMeta?.color || "#71717A";
                const isCollapsed = !expandedCategories[catName];
                return (
                  <section key={catName} data-testid={`inv-cat-${catName}`} className="border border-[#E4E4E7]">
                    <button
                      type="button"
                      data-testid={`inv-cat-toggle-${catName}`}
                      onClick={() => setExpandedCategories((prev) => ({ ...prev, [catName]: !prev[catName] }))}
                      onDragOver={(e) => { e.preventDefault(); setDragOverTarget(`cat:${catName}`); }}
                      onDragLeave={() => setDragOverTarget(null)}
                      onDrop={(e) => { e.preventDefault(); handleDropOnCategory(catName); setDragOverTarget(null); }}
                      className={`w-full flex items-center gap-3 p-4 md:p-5 hover:bg-[#FAFAFA] transition-colors ${
                        dragOverTarget === `cat:${catName}` ? "bg-[#F4F4F5] outline outline-2 outline-[#09090B]" : ""
                      }`}
                    >
                      {isCollapsed ? <ChevronRight className="h-5 w-5 text-[#09090B]" /> : <ChevronDown className="h-5 w-5 text-[#09090B]" />}
                      <div className="w-3 h-3 shrink-0" style={{ backgroundColor: color }} />
                      <span className="font-display text-lg font-semibold text-[#09090B]">{catName}</span>
                      <span className="text-xs text-[#71717A] tabular-nums">{items.length} {items.length === 1 ? "piece" : "pieces"} · {items.reduce((a, c) => a + (c.total_quantity || 0), 0)} units</span>
                    </button>
                    {!isCollapsed && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-[#E4E4E7] border-t border-[#E4E4E7]">
                        {items.filter((c) => !(hideInUseAll && c.in_use)).map((c) => (
                          <CostumeCard
                            key={c.id}
                            costume={c}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            sizingSystems={sizingSystems}
                            showsById={showsById}
                            categories={categories}
                            flagCatById={flagCatById}
                            showInUseMarker={showInUseMarker}
                            onDragStart={() => setDragging(c)}
                            onDragEnd={() => { setDragging(null); setDragOverTarget(null); }}
                            isDragging={dragging?.id === c.id}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          );
        })()
      ) : (
        <CostumeTable costumes={costumes} onEdit={handleEdit} onDelete={handleDelete} showsById={showsById} categories={categories} flagCatById={flagCatById} />
      )}

      {/* Drag & drop dock */}
      {dragging && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-[#09090B] shadow-2xl" data-testid="dnd-dock">
          <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="eyebrow">MOVING</span>{" "}
                <span className="font-semibold text-[#09090B]">{dragging.name}</span>{" "}
                <span className="text-[#71717A]">— drop on a category or storage location</span>
              </div>
              <button
                type="button"
                data-testid="dnd-cancel"
                onClick={() => { setDragging(null); setDragOverTarget(null); }}
                className="text-xs text-[#71717A] hover:text-[#09090B] px-2 py-1 border border-[#E4E4E7]"
              >
                Cancel
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="eyebrow mb-2 flex items-center gap-1.5"><TagIcon className="h-3 w-3" /> CATEGORIES</div>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => {
                    const isOver = dragOverTarget === `cat:${cat.name}`;
                    const isCurrent = dragging.category === cat.name;
                    return (
                      <div
                        key={cat.id}
                        data-testid={`dnd-drop-cat-${cat.id}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverTarget(`cat:${cat.name}`); }}
                        onDragLeave={() => setDragOverTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDropOnCategory(cat.name); setDragOverTarget(null); }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs cursor-pointer transition-all ${
                          isOver ? "border-[#09090B] bg-[#09090B] text-white scale-105" :
                          isCurrent ? "border-[#E4E4E7] text-[#A1A1AA] bg-[#FAFAFA]" :
                          "border-[#E4E4E7] text-[#09090B] hover:border-[#09090B]"
                        }`}
                      >
                        <span className="w-2.5 h-2.5" style={{ backgroundColor: cat.color || "#71717A" }} />
                        {cat.name}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="eyebrow mb-2 flex items-center gap-1.5"><MapPin className="h-3 w-3" /> STORAGE LOCATIONS</div>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  {locations.map((l) => {
                    const isOver = dragOverTarget === `loc:${l.path}`;
                    const isCurrent = dragging.location === l.path;
                    return (
                      <div
                        key={l.id}
                        data-testid={`dnd-drop-loc-${l.id}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverTarget(`loc:${l.path}`); }}
                        onDragLeave={() => setDragOverTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDropOnLocation(l.path); setDragOverTarget(null); }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs cursor-pointer transition-all ${
                          isOver ? "border-[#09090B] bg-[#09090B] text-white scale-105" :
                          isCurrent ? "border-[#E4E4E7] text-[#A1A1AA] bg-[#FAFAFA]" :
                          "border-[#E4E4E7] text-[#09090B] hover:border-[#09090B]"
                        }`}
                        style={{ paddingLeft: `${12 + (l.depth || 0) * 8}px` }}
                      >
                        <MapPin className="h-3 w-3" />
                        {l.name}{l.depth > 0 ? <span className="text-[#A1A1AA]"> · {l.path}</span> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <CostumeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        categories={categories}
        locations={locations}
        sizingSystems={sizingSystems}
        shows={shows}
        groups={groups}
        onSaved={handleSaved}
      />

      <ImportWizard
        entity="costumes"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => fetchAll()}
        sizeSystems={sizingSystems}
        targetFields={[
          { key: "name", label: "Name", required: true, aliases: ["title", "costume"] },
          { key: "category", label: "Category", aliases: ["cat", "type"] },
          { key: "subcategory", label: "Subcategory", aliases: ["subcat"] },
          { key: "location", label: "Location", aliases: ["storage", "loc", "where"] },
          { key: "sub_location", label: "Sub-location", aliases: ["sublocation", "rack", "shelf", "bin"] },
          { key: "notes", label: "Notes", aliases: ["note", "description", "desc"] },
          { key: "creator", label: "Creator", aliases: ["maker", "designer", "made by"] },
          { key: "keywords", label: "Keywords (comma-sep)", aliases: ["tags", "keyword"] },
          { key: "total_quantity", label: "Total quantity", aliases: ["quantity", "qty", "count", "total"] },
          { key: "origin_year", label: "Origin year", aliases: ["year"] },
          { key: "buy_link", label: "Buy link", aliases: ["url", "link", "purchase"] },
          { key: "sorting_system", label: "Sorting system", aliases: ["sizingsystem", "sortingsystem", "system"] },
        ]}
      />

      <ImportHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        entityFilter="costumes"
        onChanged={() => fetchAll()}
      />
    </div>
  );
}

function CostumeCard({ costume, onEdit, onDelete, sizingSystems, showsById, categories, flagCatById = {}, showInUseMarker = true, onDragStart, onDragEnd, isDragging }) {
  const flagColor = getCostumeFlagColor(costume, flagCatById);
  const effectiveSys = costume.sorting_system || costume.sizing_system || "";
  const sys = effectiveSys ? sizingSystems.find((s) => s.name === effectiveSys) : null;
  const sizeKeys = sys?.sizes || Object.keys(costume.sizes || {});
  const anySizeNote = sizeKeys.some((s) => (costume.size_notes?.[s] || "").trim());
  const originShow = costume.original_show_id ? showsById?.[costume.original_show_id] : null;
  const cat = (categories || []).find((c) => c.name === costume.category);
  const catColor = cat?.color || "#71717A";
  return (
    <div
      className={`bg-white p-5 group hover:bg-[#FAFAFA] transition-colors flex flex-col ${isDragging ? "opacity-50" : ""}`}
      data-testid={`costume-card-${costume.id}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart?.(); }}
      onDragEnd={() => onDragEnd?.()}
    >
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
            <div className="absolute top-2 right-2 text-white px-2 py-1 flex items-center gap-1" style={{ backgroundColor: flagColor }} data-testid={`flag-badge-${costume.id}`}>
              <Flag className="h-3 w-3" fill="currentColor" />
              <span className="text-[10px] font-mono-label">FLAGGED</span>
            </div>
          )}
          {showInUseMarker && costume.in_use && (
            <div className="absolute top-2 left-2 bg-[#10B981] text-white px-2 py-1 flex items-center gap-1" data-testid={`in-use-badge-${costume.id}`}>
              <Sparkles className="h-3 w-3" />
              <span className="text-[10px] font-mono-label">IN USE</span>
            </div>
          )}
          {costume.origin_year && (
            <div className="absolute bottom-2 left-2 bg-white/95 border border-[#E4E4E7] px-2 py-0.5 flex items-center gap-1" data-testid={`year-badge-${costume.id}`}>
              <Calendar className="h-3 w-3 text-[#09090B]" />
              <span className="text-[10px] font-mono-label text-[#09090B]">{costume.origin_year}</span>
            </div>
          )}
        </div>
      </Link>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="eyebrow truncate flex items-center gap-1.5">
            <span className="w-2 h-2 shrink-0" style={{ backgroundColor: catColor }} data-testid={`card-cat-color-${costume.id}`} />
            {costume.category}
            {costume.subcategory ? <span className="text-[#09090B] normal-case tracking-normal"> · {costume.subcategory}</span> : null}
          </div>
          <Link to={`/costume/${costume.id}`}>
            <h3 className="font-display font-semibold text-lg text-[#09090B] truncate mt-1 hover:underline">
              {costume.name}
            </h3>
          </Link>
          {originShow && (
            <div className="text-xs text-[#52525B] mt-1 truncate italic">
              {originShow.name}{originShow.year ? ` · ${originShow.year}` : ""}
            </div>
          )}
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
          {costume.in_use && (costume.total_quantity || 0) > 0 && (
            <div className="mt-1 text-[10px] font-mono-label tabular-nums text-[#71717A]" data-testid={`in-use-count-${costume.id}`}>
              <span className="text-[#10B981]">{costume.in_use_quantity || 0}</span> in-use ·
              <span className="text-[#09090B] ml-1">{Math.max(0, (costume.total_quantity || 0) - (costume.in_use_quantity || 0))}</span> free
            </div>
          )}
          {costume.shortage && (
            <div className="mt-1 inline-flex items-center gap-1 bg-[#FEF2F2] border border-[#EF4444] text-[#7F1D1D] px-1.5 py-0.5 text-[9px] font-mono-label tracking-widest" data-testid={`shortage-badge-${costume.id}`} title={`${(costume.assigned_student_ids || []).length} students assigned but only ${costume.in_use_quantity || 0} piece(s) available`}>
              <AlertTriangle className="h-2.5 w-2.5" /> SHORT · {(costume.assigned_student_ids || []).length - (costume.in_use_quantity || 0)}
            </div>
          )}
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
        {effectiveSys ? (
          <>
            <div className="eyebrow text-[9px] mb-1.5">{effectiveSys}</div>
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
          </>
        ) : (
          <>
            <div className="eyebrow text-[9px] mb-1.5">QUANTITY</div>
            <div className="font-display text-2xl font-bold text-[#09090B] tabular-nums">{costume.total_quantity ?? 0}</div>
          </>
        )}
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
          onClick={() => onDelete(costume.id, costume.name)}
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

function CostumeTable({ costumes, onEdit, onDelete, showsById, categories, flagCatById = {} }) {
  const catById = useMemo(() => {
    const m = {};
    for (const c of (categories || [])) m[c.name] = c;
    return m;
  }, [categories]);
  return (
    <div className="border border-[#E4E4E7] overflow-x-auto" data-testid="costume-table">
      <table className="w-full text-sm">
        <thead className="bg-[#FAFAFA] border-b border-[#E4E4E7]">
          <tr className="text-left">
            <th className="px-4 py-3 eyebrow"></th>
            <th className="px-4 py-3 eyebrow">Name</th>
            <th className="px-4 py-3 eyebrow">Category</th>
            <th className="px-4 py-3 eyebrow">Location</th>
            <th className="px-4 py-3 eyebrow">Original show</th>
            <th className="px-4 py-3 eyebrow">Creator</th>
            <th className="px-4 py-3 eyebrow text-center">Origin year</th>
            <th className="px-4 py-3 eyebrow text-right">Total</th>
            <th className="px-4 py-3 eyebrow text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {costumes.map((c) => {
            const originShow = c.original_show_id ? showsById?.[c.original_show_id] : null;
            return (
              <tr key={c.id} className="border-b border-[#E4E4E7] hover:bg-[#FAFAFA]" data-testid={`row-${c.id}`}>
                <td className="px-2 py-2">
                  <Link to={`/costume/${c.id}`} className="block w-12 h-12 image-empty overflow-hidden border border-[#E4E4E7] flex items-center justify-center" data-testid={`row-thumb-${c.id}`}>
                    {c.image_id ? (
                      <img
                        src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`}
                        alt={c.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-[#A1A1AA]" />
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {c.is_flagged && <Flag className="h-3 w-3 shrink-0" fill="currentColor" style={{ color: getCostumeFlagColor(c, flagCatById) }} />}
                    <Link to={`/costume/${c.id}`} className="font-medium text-[#09090B] hover:underline truncate">{c.name}</Link>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#52525B]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 shrink-0" style={{ backgroundColor: catById[c.category]?.color || "#71717A" }} />
                    {c.category}{c.subcategory ? ` · ${c.subcategory}` : ""}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#52525B]">
                  {c.location}{c.sub_location ? ` · ${c.sub_location}` : ""}
                </td>
                <td className="px-4 py-3 text-[#52525B]">
                  {originShow ? `${originShow.name}${originShow.year ? ` (${originShow.year})` : ""}` : "—"}
                </td>
                <td className="px-4 py-3 text-[#52525B]">{c.creator || "—"}</td>
                <td className="px-4 py-3 text-center tabular-nums text-[#52525B]" data-testid={`row-year-${c.id}`}>{c.origin_year || "—"}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{c.total_quantity}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(c)} data-testid={`row-edit-${c.id}`} className="text-xs font-medium text-[#09090B] hover:underline mr-3">Edit</button>
                  <button onClick={() => onDelete(c.id, c.name)} data-testid={`row-delete-${c.id}`} className="text-xs font-medium text-[#EF4444] hover:underline">Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
