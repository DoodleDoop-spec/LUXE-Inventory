import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Locations() {
  const [locations, setLocations] = useState([]);
  const [newName, setNewName] = useState("");

  const fetchLocations = async () => {
    const r = await api.get("/locations");
    setLocations(r.data);
  };

  useEffect(() => { fetchLocations(); }, []);

  const add = async (e) => {
    e?.preventDefault?.();
    const name = newName.trim();
    if (!name) return;
    try {
      await api.post("/locations", { name });
      setNewName("");
      toast.success("Location added");
      fetchLocations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this location? Existing costumes keep their location text.")) return;
    await api.delete(`/locations/${id}`);
    toast.success("Removed");
    fetchLocations();
  };

  return (
    <div className="space-y-10" data-testid="locations-page">
      <div className="space-y-2">
        <div className="eyebrow">INDEX 03 / LOCATIONS</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
          Storage Locations
        </h1>
        <p className="text-sm text-[#71717A] max-w-2xl">
          Manage the predefined list of storage locations. These appear in the costume form for quick selection,
          but team members can still enter custom free-text locations.
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
        {locations.length === 0 ? (
          <div className="p-10 text-center text-[#71717A]">No locations yet.</div>
        ) : (
          locations.map((l, idx) => (
            <div
              key={l.id}
              data-testid={`location-row-${l.id}`}
              className={`flex items-center justify-between px-5 py-4 ${idx !== locations.length - 1 ? "border-b border-[#E4E4E7]" : ""} hover:bg-[#FAFAFA]`}
            >
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-[#71717A]" />
                <span className="font-medium text-[#09090B]">{l.name}</span>
              </div>
              <button
                data-testid={`delete-location-${l.id}`}
                onClick={() => remove(l.id)}
                className="text-[#EF4444] hover:bg-[#FEF2F2] p-2"
                aria-label="Delete location"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
