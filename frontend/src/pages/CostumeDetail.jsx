import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, MapPin, Pencil, Trash2, Flag, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import CostumeFormDialog from "@/components/CostumeFormDialog";
import { toast } from "sonner";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export default function CostumeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [costume, setCostume] = useState(null);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editOpen, setEditOpen] = useState(false);

  const fetchAll = async () => {
    try {
      const [c, cats, locs] = await Promise.all([
        api.get(`/costumes/${id}`),
        api.get("/categories"),
        api.get("/locations"),
      ]);
      setCostume(c.data);
      setCategories(cats.data);
      setLocations(locs.data);
    } catch (e) {
      toast.error("Could not load costume");
      navigate("/inventory");
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [id]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this costume?")) return;
    await api.delete(`/costumes/${id}`);
    toast.success("Deleted");
    navigate("/inventory");
  };

  const handleUnflag = async () => {
    try {
      await api.post(`/costumes/${id}/unflag`);
      toast.success("Flag removed");
      fetchAll();
    } catch {
      toast.error("Failed to unflag");
    }
  };

  if (!costume) return <div className="py-20 eyebrow">LOADING…</div>;

  return (
    <div className="space-y-10" data-testid="costume-detail-page">
      <Link to="/inventory" data-testid="back-link" className="inline-flex items-center text-sm text-[#71717A] hover:text-[#09090B]">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Inventory
      </Link>

      {costume.is_flagged && (
        <div className="border border-[#EF4444] bg-[#FEF2F2] p-5" data-testid="detail-flag-banner">
          <div className="flex items-start gap-3">
            <Flag className="h-5 w-5 text-[#EF4444] mt-0.5 shrink-0" fill="currentColor" />
            <div className="flex-1">
              <div className="eyebrow text-[#B91C1C]">FLAGGED</div>
              <p className="text-sm text-[#7F1D1D] mt-1 whitespace-pre-wrap">{costume.flag_reason || "No reason provided"}</p>
              {costume.flagged_at && (
                <p className="text-xs text-[#B91C1C] mt-1">Flagged on {new Date(costume.flagged_at).toLocaleString()}</p>
              )}
            </div>
            <Button
              data-testid="detail-unflag-btn"
              variant="outline"
              onClick={handleUnflag}
              className="rounded-none border-[#EF4444] text-[#B91C1C] hover:bg-[#FEE2E2] h-9"
            >
              Remove flag
            </Button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-12 gap-10">
        <div className="md:col-span-5">
          <div className="aspect-[4/5] image-empty border border-[#E4E4E7] overflow-hidden">
            {costume.image_id ? (
              <img
                src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${costume.image_id}`}
                alt={costume.name}
                className="w-full h-full object-cover"
                data-testid="detail-image"
              />
            ) : null}
          </div>
        </div>
        <div className="md:col-span-7 space-y-8">
          <div>
            <div className="eyebrow">{costume.category}</div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B] mt-2" data-testid="detail-name">
              {costume.name}
            </h1>
            <div className="flex items-center gap-2 mt-3 text-[#52525B]">
              <MapPin className="h-4 w-4" />
              <span data-testid="detail-location">
                {costume.location}
                {costume.sub_location ? <span className="text-[#71717A]"> · {costume.sub_location}</span> : null}
              </span>
            </div>
          </div>

          <div className="border border-[#E4E4E7] p-6 md:p-8">
            <div className="flex items-baseline justify-between">
              <div className="eyebrow">TOTAL QUANTITY</div>
              <div className="font-display text-6xl font-bold tabular-nums text-[#09090B]" data-testid="detail-total">
                {costume.total_quantity}
              </div>
            </div>
            <div className="divider-thick my-6" />
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
              {SIZES.map((s) => {
                const qty = costume.sizes?.[s] || 0;
                const note = costume.size_notes?.[s] || "";
                return (
                  <div key={s} className="bg-white p-3 text-center" data-testid={`detail-size-${s}`}>
                    <div className="font-mono-label text-[10px] text-[#71717A]">{s}</div>
                    <div className="font-display text-xl font-bold tabular-nums text-[#09090B] mt-1">{qty}</div>
                    {note && (
                      <div title={note} className="mt-1 inline-flex" data-testid={`detail-size-note-indicator-${s}`}>
                        <StickyNote className="h-3 w-3 text-[#09090B]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Expanded size notes list */}
            {SIZES.some((s) => (costume.size_notes?.[s] || "").trim()) && (
              <div className="mt-6 space-y-2" data-testid="detail-size-notes-list">
                <div className="eyebrow">SIZE-SPECIFIC NOTES</div>
                {SIZES.filter((s) => (costume.size_notes?.[s] || "").trim()).map((s) => (
                  <div key={s} className="flex gap-3 border border-[#E4E4E7] px-3 py-2 bg-[#FAFAFA]">
                    <div className="font-mono-label text-xs w-10 shrink-0 text-[#09090B] pt-0.5">{s}</div>
                    <p className="text-sm text-[#27272A] whitespace-pre-wrap">{costume.size_notes[s]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {costume.notes ? (
            <div>
              <div className="eyebrow mb-2">GENERAL NOTES</div>
              <p className="text-sm text-[#27272A] leading-relaxed whitespace-pre-wrap" data-testid="detail-notes">{costume.notes}</p>
            </div>
          ) : null}

          <div className="flex gap-3">
            <Button data-testid="detail-edit-btn" onClick={() => setEditOpen(true)} className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11">
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button data-testid="detail-delete-btn" onClick={handleDelete} variant="outline" className="rounded-none border-[#EF4444] text-[#EF4444] hover:bg-[#FEF2F2] h-11">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>

          <div className="text-xs text-[#A1A1AA] pt-4 border-t border-[#E4E4E7] grid grid-cols-2 gap-2">
            <div>Created: {new Date(costume.created_at).toLocaleString()}</div>
            <div>Updated: {new Date(costume.updated_at).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <CostumeFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={costume}
        categories={categories}
        locations={locations}
        onSaved={() => { setEditOpen(false); fetchAll(); }}
      />
    </div>
  );
}
