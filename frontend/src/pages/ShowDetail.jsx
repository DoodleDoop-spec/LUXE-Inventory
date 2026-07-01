import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, Film, Flag, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function ShowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [costumes, setCostumes] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [shows, cs] = await Promise.all([
          api.get("/shows"),
          api.get("/costumes", { params: { show_id: id } }),
        ]);
        const s = shows.data.find((x) => x.id === id);
        if (!s) { toast.error("Show not found"); navigate("/shows"); return; }
        setShow(s);
        setCostumes(cs.data);
      } catch {
        toast.error("Failed to load show");
        navigate("/shows");
      }
    })();
  }, [id, navigate]);

  const originals = useMemo(() => costumes.filter((c) => c.original_show_id === id), [costumes, id]);
  const additionals = useMemo(() => costumes.filter((c) => c.original_show_id !== id && (c.additional_show_ids || []).includes(id)), [costumes, id]);

  if (!show) return <div className="py-20 eyebrow">LOADING…</div>;

  return (
    <div className="space-y-10" data-testid="show-detail-page">
      <Link to="/shows" data-testid="back-to-shows" className="inline-flex items-center text-sm text-[#71717A] hover:text-[#09090B]">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Shows
      </Link>

      <div className="grid md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-5">
          <div className="aspect-video image-empty border border-[#E4E4E7] overflow-hidden">
            {show.image_id ? (
              <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${show.image_id}`} alt={show.name} className="w-full h-full object-cover" data-testid="show-image" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="h-12 w-12 text-[#A1A1AA]" />
              </div>
            )}
          </div>
        </div>
        <div className="md:col-span-7">
          <div className="eyebrow">SHOW</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B] mt-2" data-testid="show-name">
            {show.name}
          </h1>
          {show.year != null && (
            <div className="flex items-center gap-2 mt-3 text-[#52525B]" data-testid="show-year">
              <Calendar className="h-4 w-4" />
              <span className="tabular-nums text-xl font-mono-label">{show.year}</span>
            </div>
          )}
          {show.notes && (
            <p className="text-sm text-[#27272A] mt-4 whitespace-pre-wrap">{show.notes}</p>
          )}
          <div className="text-sm text-[#71717A] mt-6 tabular-nums">
            {originals.length} original · {additionals.length} additional · {costumes.length} total costumes
          </div>
        </div>
      </div>

      {[{ title: "Originals", items: originals, testId: "originals-section" }, { title: "Also used in this show", items: additionals, testId: "additionals-section" }].map(({ title, items, testId }) => (
        items.length > 0 && (
          <section key={title} data-testid={testId}>
            <div className="eyebrow mb-4">{title.toUpperCase()}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
              {items.map((c) => (
                <Link
                  key={c.id}
                  to={`/costume/${c.id}`}
                  data-testid={`show-costume-${c.id}`}
                  className="bg-white p-5 hover:bg-[#FAFAFA] transition-colors"
                >
                  <div className="aspect-[4/5] image-empty overflow-hidden mb-3 relative">
                    {c.image_id ? (
                      <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`} alt={c.name} className="w-full h-full object-cover" />
                    ) : null}
                    {c.is_flagged && (
                      <div className="absolute top-2 right-2 bg-[#EF4444] text-white p-1">
                        <Flag className="h-3 w-3" fill="currentColor" />
                      </div>
                    )}
                  </div>
                  <div className="eyebrow truncate">{c.category}</div>
                  <div className="font-display font-semibold text-[#09090B] truncate mt-1">{c.name}</div>
                  <div className="text-xs text-[#71717A] mt-1 truncate">{c.location}</div>
                </Link>
              ))}
            </div>
          </section>
        )
      ))}

      {originals.length === 0 && additionals.length === 0 && (
        <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]" data-testid="show-empty">
          No costumes have been assigned to this show yet.
        </div>
      )}
    </div>
  );
}
