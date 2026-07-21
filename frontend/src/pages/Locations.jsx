import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Flag, Map as MapIcon, Wrench, GripVertical } from "lucide-react";
import { toast } from "sonner";
import LocationTree from "@/components/LocationTree";

export default function Locations() {
  const [locations, setLocations] = useState([]);
  const [counts, setCounts] = useState({});
  const [contents, setContents] = useState({});
  const [selected, setSelected] = useState(null); // location node
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const fetchAll = async () => {
    const [locs, cts] = await Promise.all([
      api.get("/locations"),
      api.get("/locations/costume-counts"),
    ]);
    setLocations(locs.data);
    setCounts(cts.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const loadContents = async (path) => {
    try {
      const [cRes, eRes] = await Promise.all([
        api.get("/costumes", { params: { location: path } }),
        api.get("/equipment", { params: { location: path } }),
      ]);
      const costumes = cRes.data.map((x) => ({ ...x, _type: "costume" }));
      const equipment = eRes.data.map((x) => ({ ...x, _type: "equipment" }));
      setContents((prev) => ({ ...prev, [path]: [...costumes, ...equipment] }));
    } catch {
      toast.error("Failed to load contents");
    }
  };

  const handleSelect = async (node) => {
    setSelected(node);
    if (!contents[node.path]) await loadContents(node.path);
  };

  const handleDrop = async (targetNode) => {
    if (!dragging || !targetNode) return;
    if (dragging.location === targetNode.path) { setDropTarget(null); setDragging(null); return; }
    try {
      await api.post("/locations/move-item", {
        item_id: dragging.id,
        item_type: dragging._type,
        new_location: targetNode.path,
        new_sub_location: "",
      });
      toast.success(`Moved "${dragging.name}" to ${targetNode.path}`);
      // Refresh source and target contents
      const sourcePath = dragging.location;
      setContents((prev) => {
        const next = { ...prev };
        delete next[sourcePath];
        delete next[targetNode.path];
        return next;
      });
      if (selected) await loadContents(selected.path);
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to move");
    }
    setDragging(null);
    setDropTarget(null);
  };

  const list = selected ? contents[selected.path] : null;

  return (
    <div className="space-y-8" data-testid="locations-page">
      <div className="space-y-2">
        <div className="eyebrow">LOCATIONS</div>
        <h1 className="font-display text-4xl sm:text-5xl xl:text-6xl tracking-tight font-bold text-[#09090B] leading-[1.05]">
          Storage Locations
        </h1>
        <p className="text-sm md:text-base text-[#71717A] max-w-2xl">
          Browse the storage tree. Click to view contents. Drag items onto a location to move them.
        </p>
      </div>

      <div className="grid md:grid-cols-12 gap-6">
        <div className="md:col-span-5">
          <div className="eyebrow mb-2">TREE {dragging && <span className="text-[#3B82F6] normal-case tracking-normal ml-2">· drop &quot;{dragging.name}&quot; on a location</span>}</div>
          <LocationTree
            locations={locations}
            counts={counts}
            onSelect={handleSelect}
            dropTarget={dropTarget}
            onNodeDragOver={(node, e) => { if (dragging) { e.preventDefault(); setDropTarget(node.id); } }}
            onNodeDragLeave={() => setDropTarget(null)}
            onNodeDrop={(node, e) => { e.preventDefault(); handleDrop(node); }}
          />
        </div>

        <div className="md:col-span-7">
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <div className="eyebrow">{selected ? "CONTAINED / " + selected.path.toUpperCase() : "CONTAINED"}</div>
            {selected && (
              <Link
                to={`/locations/${selected.id}/map`}
                data-testid="location-view-map"
                className="inline-flex items-center gap-1.5 h-9 px-3 border border-[#09090B] text-[#09090B] hover:bg-[#F4F4F5] text-sm"
              >
                <MapIcon className="h-4 w-4" /> View / edit map
              </Link>
            )}
          </div>
          {!selected ? (
            <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]" data-testid="locations-empty-selection">
              Select a location on the left to view its contents.
            </div>
          ) : list == null ? (
            <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]">Loading…</div>
          ) : list.length === 0 ? (
            <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]" data-testid="locations-contents-list">
              <span data-testid="locations-empty-contents">Nothing stored here.</span>
            </div>
          ) : (
            <ul className="border border-[#E4E4E7] divide-y divide-[#E4E4E7]" data-testid="locations-contents-list">
              {list.map((c) => (
                <li
                  key={`${c._type}-${c.id}`}
                  draggable
                  onDragStart={(e) => { setDragging(c); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", c.id); } catch {/* Firefox needs data */} }}
                  onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                  data-testid={`loc-item-${c._type}-${c.id}`}
                  className={`bg-white ${dragging?.id === c.id ? "opacity-40" : ""}`}
                >
                  <div className="flex items-center gap-3 p-3 hover:bg-[#FAFAFA]">
                    <GripVertical className="h-4 w-4 text-[#A1A1AA] cursor-grab shrink-0" />
                    <Link
                      to={c._type === "costume" ? `/costume/${c.id}` : `/equipment`}
                      data-testid={`loc-costume-${c.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <div className="w-12 h-12 image-empty overflow-hidden border border-[#E4E4E7] shrink-0 flex items-center justify-center">
                        {c.image_id ? (
                          <img
                            src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`}
                            alt={c.name}
                            className="w-full h-full object-cover"
                          />
                        ) : c._type === "equipment" ? (
                          <Wrench className="h-4 w-4 text-[#A1A1AA]" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {c.is_flagged && <Flag className="h-3 w-3 text-[#EF4444]" fill="currentColor" />}
                          <span className="font-medium text-[#09090B] truncate">{c.name}</span>
                          <span className="text-[9px] font-mono-label tracking-widest px-1 bg-[#F4F4F5] text-[#71717A]">{c._type === "costume" ? "COSTUME" : "EQUIP"}</span>
                        </div>
                        <div className="text-xs text-[#71717A] mt-0.5 truncate">
                          {c.category}{c.subcategory ? ` · ${c.subcategory}` : ""}
                          {c.sub_location ? ` · ${c.sub_location}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display text-lg font-bold tabular-nums text-[#09090B]">{c.total_quantity}</div>
                        <div className="eyebrow text-[9px]">UNITS</div>
                      </div>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
