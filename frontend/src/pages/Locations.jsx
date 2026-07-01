import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import LocationTree from "@/components/LocationTree";

export default function Locations() {
  const [locations, setLocations] = useState([]);
  const [counts, setCounts] = useState({});
  const [contents, setContents] = useState({});
  const [selected, setSelected] = useState(null); // location node

  const fetchAll = async () => {
    const [locs, cts] = await Promise.all([
      api.get("/locations"),
      api.get("/locations/costume-counts"),
    ]);
    setLocations(locs.data);
    setCounts(cts.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSelect = async (node) => {
    setSelected(node);
    if (!contents[node.path]) {
      try {
        const r = await api.get("/costumes", { params: { location: node.path } });
        setContents((prev) => ({ ...prev, [node.path]: r.data }));
      } catch {
        toast.error("Failed to load contents");
      }
    }
  };

  const list = selected ? contents[selected.path] : null;

  return (
    <div className="space-y-8" data-testid="locations-page">
      <div className="space-y-2">
        <div className="eyebrow">INDEX 03 / LOCATIONS</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
          Storage Locations
        </h1>
        <p className="text-sm text-[#71717A] max-w-2xl">
          Browse the storage tree. Click a location to see what&apos;s stored inside.
          Manage or nest locations in Settings.
        </p>
      </div>

      <div className="grid md:grid-cols-12 gap-6">
        <div className="md:col-span-5">
          <div className="eyebrow mb-2">TREE</div>
          <LocationTree
            locations={locations}
            counts={counts}
            onSelect={handleSelect}
          />
        </div>

        <div className="md:col-span-7">
          <div className="eyebrow mb-2">{selected ? "CONTAINED / " + selected.path.toUpperCase() : "CONTAINED"}</div>
          {!selected ? (
            <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]" data-testid="locations-empty-selection">
              Select a location on the left to view its contents.
            </div>
          ) : list == null ? (
            <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]">Loading…</div>
          ) : list.length === 0 ? (
            <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]" data-testid="locations-contents-list">
              <span data-testid="locations-empty-contents">No costumes stored here.</span>
            </div>
          ) : (
            <ul className="border border-[#E4E4E7] divide-y divide-[#E4E4E7]" data-testid="locations-contents-list">
              {list.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/costume/${c.id}`}
                    data-testid={`loc-costume-${c.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-[#FAFAFA]"
                  >
                    <div className="w-12 h-12 image-empty overflow-hidden border border-[#E4E4E7] shrink-0">
                      {c.image_id ? (
                        <img
                          src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`}
                          alt={c.name}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {c.is_flagged && <Flag className="h-3 w-3 text-[#EF4444]" fill="currentColor" />}
                        <span className="font-medium text-[#09090B] truncate">{c.name}</span>
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
