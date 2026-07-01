import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Plus, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import LocationTree from "@/components/LocationTree";

export default function Locations() {
  const [locations, setLocations] = useState([]);
  const [counts, setCounts] = useState({});
  const [contents, setContents] = useState({}); // path -> list
  const [newName, setNewName] = useState("");
  const [expandedContents, setExpandedContents] = useState({}); // path -> bool

  const fetchAll = async () => {
    const [locs, cts] = await Promise.all([
      api.get("/locations"),
      api.get("/locations/costume-counts"),
    ]);
    setLocations(locs.data);
    setCounts(cts.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const addRoot = async (e) => {
    e?.preventDefault?.();
    const name = newName.trim();
    if (!name) return;
    try {
      await api.post("/locations", { name });
      setNewName("");
      toast.success("Location added");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const addChild = async (parentId, name) => {
    try {
      await api.post("/locations", { name, parent_id: parentId });
      toast.success("Nested location added");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const renameLoc = async (id, name) => {
    try {
      await api.put(`/locations/${id}`, { name });
      toast.success("Renamed");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const removeLoc = async (id, name, kidCount) => {
    if (kidCount > 0) {
      toast.error("Delete nested locations first");
      return;
    }
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/locations/${id}`);
      toast.success("Removed");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const toggleContents = async (loc) => {
    const isOpen = expandedContents[loc.path];
    setExpandedContents({ ...expandedContents, [loc.path]: !isOpen });
    if (!isOpen && !contents[loc.path]) {
      try {
        const r = await api.get("/costumes", { params: { location: loc.path } });
        setContents({ ...contents, [loc.path]: r.data });
      } catch {
        toast.error("Failed to load contents");
      }
    }
  };

  const renderExtras = (node, { isOpen }) => {
    if (!isOpen) return null;
    const list = contents[node.path];
    const hasCostumes = counts[node.path]?.count > 0;
    if (!hasCostumes) return null;
    return (
      <div
        className="bg-[#FAFAFA] border-b border-[#E4E4E7] px-3 py-2 space-y-1"
        style={{ paddingLeft: `${(node.depth + 1) * 22 + 12}px` }}
      >
        <button
          type="button"
          onClick={() => toggleContents(node)}
          className="text-xs eyebrow text-[#09090B] hover:underline"
          data-testid={`show-costumes-${node.id}`}
        >
          {expandedContents[node.path] ? "▾" : "▸"} Costumes here ({counts[node.path].count})
        </button>
        {expandedContents[node.path] && (
          list ? (
            <ul className="space-y-1 pt-1">
              {list.length === 0 ? <li className="text-xs text-[#71717A]">No costumes.</li> : list.map((c) => (
                <li key={c.id} className="flex items-center justify-between bg-white border border-[#E4E4E7] px-3 py-1.5 text-xs">
                  <Link to={`/costume/${c.id}`} className="font-medium text-[#09090B] hover:underline flex items-center gap-1.5 truncate" data-testid={`location-costume-${c.id}`}>
                    {c.is_flagged && <Flag className="h-3 w-3 text-[#EF4444]" fill="currentColor" />}
                    {c.name}
                  </Link>
                  <span className="tabular-nums text-[#52525B] shrink-0 ml-2">{c.total_quantity} units</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-[#71717A]">Loading…</div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="space-y-10" data-testid="locations-page">
      <div className="space-y-2">
        <div className="eyebrow">INDEX 03 / LOCATIONS</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
          Storage Locations
        </h1>
        <p className="text-sm text-[#71717A] max-w-2xl">
          Locations can be nested indefinitely. Add a root location, then use the + button on any
          row to add locations inside it (e.g. Costume Closet A → A → 1).
        </p>
      </div>

      <form onSubmit={addRoot} className="flex gap-3 max-w-xl">
        <Input
          data-testid="new-location-input"
          placeholder="Root location, e.g. Costume Closet A"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-11 rounded-none border-[#E4E4E7]"
        />
        <Button data-testid="add-location-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-11 px-5">
          <Plus className="h-4 w-4 mr-1" /> Add root
        </Button>
      </form>

      <LocationTree
        locations={locations}
        counts={counts}
        onAdd={addChild}
        onRename={renameLoc}
        onDelete={removeLoc}
        renderExtras={renderExtras}
      />
    </div>
  );
}
