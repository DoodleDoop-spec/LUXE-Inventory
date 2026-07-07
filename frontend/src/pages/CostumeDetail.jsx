import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, MapPin, Pencil, Trash2, Flag, StickyNote, Calendar, Tag, Sparkles, Users, ExternalLink, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import CostumeFormDialog from "@/components/CostumeFormDialog";
import { toast } from "sonner";

export default function CostumeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [costume, setCostume] = useState(null);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [sizingSystems, setSizingSystems] = useState([]);
  const [shows, setShows] = useState([]);
  const [flagCategories, setFlagCategories] = useState([]);
  const [editOpen, setEditOpen] = useState(false);

  const fetchAll = async () => {
    try {
      const [c, cats, locs, systems, sh, fcs] = await Promise.all([
        api.get(`/costumes/${id}`),
        api.get("/categories"),
        api.get("/locations"),
        api.get("/sizing-systems"),
        api.get("/shows"),
        api.get("/flag-categories"),
      ]);
      setCostume(c.data);
      setCategories(cats.data);
      setLocations(locs.data);
      setSizingSystems(systems.data);
      setShows(sh.data);
      setFlagCategories(fcs.data);
    } catch (e) {
      toast.error("Could not load costume");
      navigate("/inventory");
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [id]);

  const showsById = useMemo(() => {
    const m = {};
    for (const s of shows) m[s.id] = s;
    return m;
  }, [shows]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this costume?")) return;
    await api.delete(`/costumes/${id}`);
    toast.success("Deleted");
    navigate("/inventory");
  };

  const handleUnflagOne = async (flagId) => {
    try {
      await api.delete(`/costumes/${id}/flags/${flagId}`);
      toast.success("Flag removed");
      fetchAll();
    } catch { toast.error("Failed to remove flag"); }
  };

  if (!costume) return <div className="py-20 eyebrow">LOADING…</div>;

  const sys = sizingSystems.find((s) => s.name === (costume.sizing_system || "Letter"));
  const sizeKeys = sys?.sizes || Object.keys(costume.sizes || {});
  const originShow = costume.original_show_id ? showsById[costume.original_show_id] : null;
  const additionalShows = (costume.additional_show_ids || []).map((sid) => showsById[sid]).filter(Boolean);
  const flagCatById = {};
  for (const fc of flagCategories) flagCatById[fc.id] = fc;
  const attachedFlags = costume.flags || [];
  const currentCategory = categories.find((c) => c.name === costume.category);
  const catColor = currentCategory?.color || "#71717A";

  return (
    <div className="space-y-10" data-testid="costume-detail-page">
      <button type="button" data-testid="back-link" onClick={() => navigate(-1)} className="inline-flex items-center text-sm text-[#71717A] hover:text-[#09090B]">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </button>

      {(costume.is_flagged || attachedFlags.length > 0) && (
        <div className="border border-[#EF4444] bg-[#FEF2F2] p-5" data-testid="detail-flag-banner">
          <div className="flex items-start gap-3">
            <Flag className="h-5 w-5 text-[#EF4444] mt-0.5 shrink-0" fill="currentColor" />
            <div className="flex-1">
              <div className="eyebrow text-[#B91C1C]">FLAGGED</div>
              {attachedFlags.length > 0 ? (
                <ul className="mt-2 space-y-2" data-testid="detail-flag-list">
                  {attachedFlags.map((f) => {
                    const cat = flagCatById[f.category_id];
                    return (
                      <li key={f.id} className="flex items-start gap-2 border border-[#FCA5A5] bg-white/60 px-3 py-2" data-testid={`detail-flag-${f.id}`}>
                        <span className="w-2.5 h-2.5 mt-1.5 shrink-0" style={{ backgroundColor: cat?.color || "#EF4444" }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[#7F1D1D]">{cat?.name || "Unknown flag"}</div>
                          {f.note && <p className="text-sm text-[#7F1D1D] whitespace-pre-wrap mt-0.5">{f.note}</p>}
                          {(f.image_ids || []).length > 0 && (
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mt-2" data-testid={`detail-flag-images-${f.id}`}>
                              {f.image_ids.map((iid, idx) => (
                                <a
                                  key={idx}
                                  href={`${process.env.REACT_APP_BACKEND_URL}/api/images/${iid}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aspect-square border border-[#FCA5A5] overflow-hidden hover:border-[#B91C1C]"
                                >
                                  <img
                                    src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${iid}`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                          {f.created_at && (
                            <p className="text-[10px] text-[#B91C1C] font-mono-label mt-0.5">
                              {new Date(f.created_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          data-testid={`detail-flag-remove-${f.id}`}
                          onClick={() => handleUnflagOne(f.id)}
                          className="text-xs text-[#B91C1C] hover:underline shrink-0"
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-[#7F1D1D] mt-1 whitespace-pre-wrap">{costume.flag_reason || "No reason provided"}</p>
              )}
              {costume.flagged_at && attachedFlags.length === 0 && (
                <p className="text-xs text-[#B91C1C] mt-1">Flagged on {new Date(costume.flagged_at).toLocaleString()}</p>
              )}
            </div>
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
            <div className="eyebrow flex items-center gap-1.5">
              <span className="w-2 h-2 shrink-0" style={{ backgroundColor: catColor }} data-testid="detail-cat-color" />
              {costume.category}
              {costume.subcategory ? <span className="text-[#09090B] normal-case tracking-normal"> · {costume.subcategory}</span> : null}
            </div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B] mt-2" data-testid="detail-name">
              {costume.name}
            </h1>
            <div className="flex items-center flex-wrap gap-4 mt-3 text-[#52525B]">
              <div className="flex items-center gap-2" data-testid="detail-location">
                <MapPin className="h-4 w-4" />
                <span>
                  {costume.location}
                  {costume.sub_location ? <span className="text-[#71717A]"> · {costume.sub_location}</span> : null}
                </span>
              </div>
              {costume.creator && (
                <div className="flex items-center gap-2" data-testid="detail-creator">
                  <Sparkles className="h-4 w-4" />
                  <span>Creator: <span className="font-medium text-[#09090B]">{costume.creator}</span></span>
                </div>
              )}
              {costume.origin_year && (
                <div className="flex items-center gap-2" data-testid="detail-origin-year">
                  <Calendar className="h-4 w-4" />
                  <span>Origin: <span className="font-medium text-[#09090B]">{costume.origin_year}</span></span>
                </div>
              )}
              {costume.buy_link && (
                <a
                  href={costume.buy_link}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="detail-buy-link"
                  className="inline-flex items-center gap-1.5 border border-[#09090B] text-[#09090B] hover:bg-[#F4F4F5] px-3 py-1.5 text-xs"
                >
                  <ShoppingBag className="h-3.5 w-3.5" /> Link to buy <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {(originShow || additionalShows.length > 0) && (
              <div className="border-l-2 border-[#09090B] pl-4 mt-5 space-y-2" data-testid="detail-shows">
                {originShow && (
                  <div>
                    <div className="eyebrow">ORIGINAL SHOW</div>
                    <div className="font-medium text-[#09090B]">{originShow.name}{originShow.year ? ` · ${originShow.year}` : ""}</div>
                  </div>
                )}
                {additionalShows.length > 0 && (
                  <div>
                    <div className="eyebrow flex items-center gap-1">
                      <Users className="h-3 w-3" /> ADDITIONAL SHOWS
                    </div>
                    <ul className="mt-1 space-y-0.5 text-sm text-[#27272A]">
                      {additionalShows.map((s) => (
                        <li key={s.id}>{s.name}{s.year ? ` · ${s.year}` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {(costume.keywords || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4" data-testid="detail-keywords">
                {costume.keywords.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-[#F4F4F5] text-[#27272A] border border-[#E4E4E7]">
                    <Tag className="h-3 w-3" />
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="border border-[#E4E4E7] p-6 md:p-8">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <div>
                <div className="eyebrow">TOTAL QUANTITY</div>
                <div className="text-xs text-[#71717A] mt-1 font-mono-label">SYSTEM · {costume.sizing_system || "Letter"}</div>
              </div>
              <div className="font-display text-6xl font-bold tabular-nums text-[#09090B]" data-testid="detail-total">
                {costume.total_quantity}
              </div>
            </div>
            <div className="divider-thick my-6" />
            <div className={`grid gap-px bg-[#E4E4E7] border border-[#E4E4E7] ${sizeKeys.length > 7 ? "grid-cols-4 sm:grid-cols-6 md:grid-cols-8" : "grid-cols-4 sm:grid-cols-7"}`}>
              {sizeKeys.map((s) => {
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
            {sizeKeys.some((s) => (costume.size_notes?.[s] || "").trim()) && (
              <div className="mt-6 space-y-2" data-testid="detail-size-notes-list">
                <div className="eyebrow">SIZE-SPECIFIC NOTES</div>
                {sizeKeys.filter((s) => (costume.size_notes?.[s] || "").trim()).map((s) => (
                  <div key={s} className="flex gap-3 border border-[#E4E4E7] px-3 py-2 bg-[#FAFAFA]">
                    <div className="font-mono-label text-xs w-10 shrink-0 text-[#09090B] pt-0.5">{s}</div>
                    <p className="text-sm text-[#27272A] whitespace-pre-wrap">{costume.size_notes[s]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {costume.in_use && (
            <div className="border border-[#10B981] bg-[#ECFDF5] p-5" data-testid="detail-in-use-banner">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-[#059669] mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="eyebrow text-[#065F46]">CURRENTLY IN USE</div>
                  {costume.in_use_note ? (
                    <p className="text-sm text-[#064E3B] whitespace-pre-wrap mt-1">{costume.in_use_note}</p>
                  ) : (
                    <p className="text-sm text-[#064E3B] mt-1">This piece is checked out for a live production.</p>
                  )}
                  {costume.in_use_since && (
                    <p className="text-[10px] font-mono-label text-[#059669] mt-1.5">IN USE SINCE {new Date(costume.in_use_since).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {costume.notes ? (
            <div>
              <div className="eyebrow mb-2">GENERAL NOTES</div>
              <p className="text-sm text-[#27272A] leading-relaxed whitespace-pre-wrap" data-testid="detail-notes">{costume.notes}</p>
            </div>
          ) : null}

          {(costume.note_image_ids || []).length > 0 && (
            <div data-testid="detail-note-images">
              <div className="eyebrow mb-2">ATTACHED IMAGES</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {costume.note_image_ids.map((iid, idx) => (
                  <a
                    key={idx}
                    href={`${process.env.REACT_APP_BACKEND_URL}/api/images/${iid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square border border-[#E4E4E7] overflow-hidden hover:border-[#09090B]"
                    data-testid={`detail-note-image-${idx}`}
                  >
                    <img
                      src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${iid}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

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
        sizingSystems={sizingSystems}
        shows={shows}
        onSaved={(opts) => { if (!opts?.refresh_only) setEditOpen(false); fetchAll(); }}
      />
    </div>
  );
}
