import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Plus, Trash2, MapPin, ChevronDown, ChevronRight, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Locations() {
  const [locations, setLocations] = useState([]);
  const [counts, setCounts] = useState({});
  const [expanded, setExpanded] = useState({});
  const [contents, setContents] = useState({});
  const [newName, setNewName] = useState("");

  const fetchAll = async () => {
    const [locs, cts] = await Promise.all([
      api.get("/locations"),
      api.get("/locations/costume-counts"),
    ]);
    setLocations(locs.data);
    setCounts(cts.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const toggle = async (locName) => {
    const isOpen = expanded[locName];
    setExpanded({ ...expanded, [locName]: !isOpen });
    if (!isOpen && !contents[locName]) {
      try {
        const r = await api.get("/costumes", { params: { location: locName } });
        setContents({ ...contents, [locName]: r.data });
      } catch {
        toast.error("Failed to load contents");
      }
    }
  };

  const add = async (e) => {
    e?.preventDefault?.();
    const name = newName.trim();
    if (!name) return;
    try {
      await api.post("/locations", { name });
      setNewName("");
      toast.success("Location added");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this location? Existing costumes keep their location text.")) return;
    await api.delete(`/locations/${id}`);
    toast.success("Removed");
    fetchAll();
  };

  // Extra locations that appear in costumes but aren't in the preset list
  const presetNames = new Set(locations.map((l) => l.name));
  const orphanNames = Object.keys(counts).filter((n) => !presetNames.has(n));

  return (
    <div className="space-y-10" data-testid="locations-page">
      <div className="space-y-2">
        <div className="eyebrow">INDEX 03 / LOCATIONS</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
          Storage Locations
        </h1>
        <p className="text-sm text-[#71717A] max-w-2xl">
          Manage predefined storage locations and see what&apos;s contained in each. Team members can
          also select a preset and add a sub-location (e.g. &ldquo;Costume Closet A · B2&rdquo;).
        </p>
      </div>

      <form onSubmit={add} className="flex gap-3 max-w-xl">
        <Input
          data-testid="new-location-input"
          placeholder="e.g. Backstage Storage, Shelf B3"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-11 rounded-none border-[#E4E4E7]"
        />
        <Button data-testid="add-location-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-11 px-5">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </form>

      <div className="border border-[#E4E4E7]">
        {locations.length === 0 && orphanNames.length === 0 ? (
          <div className="p-10 text-center text-[#71717A]">No locations yet.</div>
        ) : (
          <>
            {locations.map((l, idx) => (
              <LocationRow
                key={l.id}
                name={l.name}
                count={counts[l.name]}
                expanded={!!expanded[l.name]}
                contents={contents[l.name]}
                onToggle={() => toggle(l.name)}
                onDelete={() => remove(l.id)}
                isLast={idx === locations.length - 1 && orphanNames.length === 0}
                testId={`location-row-${l.id}`}
                deleteTestId={`delete-location-${l.id}`}
              />
            ))}
            {orphanNames.length > 0 && (
              <div className="border-t border-[#E4E4E7] bg-[#FAFAFA] px-5 py-2 eyebrow">
                CUSTOM / FREE-TEXT LOCATIONS
              </div>
            )}
            {orphanNames.map((n, idx) => (
              <LocationRow
                key={n}
                name={n}
                count={counts[n]}
                expanded={!!expanded[n]}
                contents={contents[n]}
                onToggle={() => toggle(n)}
                custom
                isLast={idx === orphanNames.length - 1}
                testId={`orphan-row-${n}`}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function LocationRow({ name, count, expanded, contents, onToggle, onDelete, custom, isLast, testId, deleteTestId }) {
  return (
    <div data-testid={testId} className={!isLast ? "border-b border-[#E4E4E7]" : ""}>
      <div className="flex items-center justify-between px-5 py-4 hover:bg-[#FAFAFA]">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 text-left min-w-0"
          data-testid={`toggle-${testId}`}
        >
          {expanded ? <ChevronDown className="h-4 w-4 text-[#71717A] shrink-0" /> : <ChevronRight className="h-4 w-4 text-[#71717A] shrink-0" />}
          <MapPin className="h-4 w-4 text-[#71717A] shrink-0" />
          <span className="font-medium text-[#09090B] truncate">{name}</span>
          {custom && (
            <span className="eyebrow text-[9px] text-[#71717A] border border-[#E4E4E7] px-1.5 py-0.5">CUSTOM</span>
          )}
          <span className="ml-auto text-xs text-[#71717A] tabular-nums">
            {count ? `${count.count} costume${count.count === 1 ? "" : "s"} · ${count.items} items` : "empty"}
          </span>
        </button>
        {onDelete && (
          <button
            data-testid={deleteTestId}
            onClick={onDelete}
            className="text-[#EF4444] hover:bg-[#FEF2F2] p-2 ml-2"
            aria-label="Delete location"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {expanded && (
        <div className="bg-[#FAFAFA] border-t border-[#E4E4E7] px-5 py-4">
          {!contents ? (
            <div className="text-sm text-[#71717A]">Loading…</div>
          ) : contents.length === 0 ? (
            <div className="text-sm text-[#71717A]">No costumes in this location yet.</div>
          ) : (
            <ul className="space-y-2">
              {contents.map((c) => (
                <li key={c.id} className="flex items-center justify-between bg-white border border-[#E4E4E7] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/costume/${c.id}`} className="font-medium text-[#09090B] hover:underline flex items-center gap-2" data-testid={`location-costume-${c.id}`}>
                      {c.is_flagged && <Flag className="h-3 w-3 text-[#EF4444]" fill="currentColor" />}
                      {c.name}
                    </Link>
                    <div className="text-xs text-[#71717A] mt-0.5">
                      {c.category}{c.sub_location ? ` · ${c.sub_location}` : ""}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-[#09090B] ml-4">
                    {c.total_quantity}
                    <span className="eyebrow text-[9px] ml-1">UNITS</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
