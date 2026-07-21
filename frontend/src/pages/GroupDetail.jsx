import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, Package, Pencil, Trash2, MapPin, Tag, Flag, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);

  const fetchGroup = async () => {
    try {
      const r = await api.get(`/groups/${id}`);
      setGroup(r.data);
    } catch (err) {
      toast.error("Group not found");
      navigate("/inventory");
    }
  };

  useEffect(() => { fetchGroup(); /* eslint-disable-next-line */ }, [id]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this group? Variants will be un-grouped, not deleted.")) return;
    await api.delete(`/groups/${id}`);
    toast.success("Group deleted");
    navigate("/inventory");
  };

  if (!group) return <div className="py-20 eyebrow">LOADING…</div>;

  return (
    <div className="space-y-10" data-testid="group-detail-page">
      <button type="button" data-testid="back-link" onClick={() => navigate(-1)} className="inline-flex items-center text-sm text-[#71717A] hover:text-[#09090B]">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </button>

      <div className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-5">
          <div className="aspect-square image-empty border border-[#E4E4E7] overflow-hidden flex items-center justify-center">
            {group.image_id ? (
              <img
                src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${group.image_id}`}
                alt={group.name}
                className="w-full h-full object-cover"
                data-testid="group-image"
              />
            ) : (
              <Package className="h-12 w-12 text-[#A1A1AA]" />
            )}
          </div>
        </div>
        <div className="md:col-span-7 space-y-6">
          <div>
            <div className="eyebrow">
              GROUP · {group.category}
              {group.subcategory ? ` · ${group.subcategory}` : ""}
            </div>
            <h1 className="font-display text-4xl sm:text-5xl xl:text-6xl tracking-tight font-bold text-[#09090B] leading-[1.05] mt-2" data-testid="group-name">
              {group.name}
            </h1>
            {group.location && (
              <div className="flex items-center gap-2 mt-3 text-[#52525B]">
                <MapPin className="h-4 w-4" />
                <span>{group.location}{group.sub_location ? ` · ${group.sub_location}` : ""}</span>
              </div>
            )}
            {(group.keywords || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {group.keywords.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-[#F4F4F5] text-[#27272A] border border-[#E4E4E7]">
                    <Tag className="h-3 w-3" />
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
            <div className="bg-white p-4">
              <div className="eyebrow">VARIANTS</div>
              <div className="font-display text-3xl font-bold tabular-nums text-[#09090B] mt-2" data-testid="group-variant-count">{group.variant_count}</div>
            </div>
            <div className="bg-white p-4">
              <div className="eyebrow">TOTAL ITEMS</div>
              <div className="font-display text-3xl font-bold tabular-nums text-[#09090B] mt-2" data-testid="group-total-items">{group.total_items}</div>
            </div>
          </div>

          {group.notes && (
            <div>
              <div className="eyebrow mb-2">GENERAL NOTES</div>
              <p className="text-sm text-[#27272A] whitespace-pre-wrap">{group.notes}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Link to={`/inventory?new=1&group_id=${group.id}`}>
              <Button data-testid="group-add-variant-btn" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11">
                <Plus className="h-4 w-4 mr-1" /> Add variant
              </Button>
            </Link>
            <Button data-testid="group-delete-btn" onClick={handleDelete} variant="outline" className="rounded-none border-[#EF4444] text-[#EF4444] hover:bg-[#FEF2F2] h-11">
              <Trash2 className="h-4 w-4 mr-1" /> Delete group
            </Button>
          </div>
        </div>
      </div>

      <section>
        <div className="eyebrow mb-4">VARIANTS ({group.variants.length})</div>
        {group.variants.length === 0 ? (
          <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]" data-testid="group-empty-variants">
            No variants yet. Add one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {group.variants.map((v) => (
              <Link
                key={v.id}
                to={`/costume/${v.id}`}
                data-testid={`variant-${v.id}`}
                className="bg-white border border-[#E4E4E7] p-4 hover:border-[#09090B] transition-colors"
              >
                <div className="aspect-square image-empty overflow-hidden mb-3 relative">
                  {v.image_id ? (
                    <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${v.image_id}`} alt={v.name} className="w-full h-full object-cover" />
                  ) : null}
                  {v.is_flagged && (
                    <div className="absolute top-2 right-2 bg-[#EF4444] text-white p-1">
                      <Flag className="h-3 w-3" fill="currentColor" />
                    </div>
                  )}
                </div>
                {v.variant_label && (
                  <div className="eyebrow text-[10px]">{v.variant_label}</div>
                )}
                <div className="font-display font-semibold text-[#09090B] truncate mt-0.5">{v.name}</div>
                <div className="text-xs text-[#71717A] mt-1 tabular-nums">{v.total_quantity} units</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
