import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Film, ChevronDown, ChevronRight, Plus, Upload, X, Image as ImageIcon, LinkIcon, Users, AlertTriangle, User as UserIcon, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function Shows() {
  const [shows, setShows] = useState([]);
  const [costumes, setCostumes] = useState([]);
  const [students, setStudents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expandedYear, setExpandedYear] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", year: "", notes: "", show_link: "", image_id: null });
  const [uploading, setUploading] = useState(false);
  // Live-toggle swap modal state
  const [swapModal, setSwapModal] = useState(null); // { targetShowId, liveShows }
  // End-of-live cleanup modal state
  const [cleanupModal, setCleanupModal] = useState(null); // { showName, released: [], picked: Set<id> }

  const fetchAll = async () => {
    const [s, c, st, cats] = await Promise.all([
      api.get("/shows"),
      api.get("/costumes"),
      api.get("/students").catch(() => ({ data: [] })),
      api.get("/student-categories").catch(() => ({ data: [] })),
    ]);
    setShows(s.data);
    setCostumes(c.data);
    setStudents(st.data);
    setCategories(cats.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const showsByYear = useMemo(() => {
    // Exclude live shows from the year grid — they render in their own section
    const nonLive = shows.filter((s) => !s.is_live);
    const groups = {};
    for (const s of nonLive) {
      const y = s.year == null ? "Unknown" : String(s.year);
      if (!groups[y]) groups[y] = [];
      groups[y].push(s);
    }
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return parseInt(b, 10) - parseInt(a, 10);
    });
    return keys.map((y) => ({ year: y, shows: groups[y].sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [shows]);

  const liveShows = useMemo(() => shows.filter((s) => s.is_live), [shows]);

  const countsByShow = useMemo(() => {
    const m = {};
    for (const c of costumes) {
      const ids = new Set();
      if (c.original_show_id) ids.add(c.original_show_id);
      for (const x of c.additional_show_ids || []) ids.add(x);
      for (const s of c.shows || []) if (s?.show_id) ids.add(s.show_id);
      for (const id of ids) m[id] = (m[id] || 0) + 1;
    }
    return m;
  }, [costumes]);

  const liveShowIds = useMemo(() => {
    const s = new Set();
    for (const sh of shows) if (sh?.is_live) s.add(sh.id);
    for (const c of costumes) {
      if (c.in_use && c.current_show_id) s.add(c.current_show_id);
    }
    return s;
  }, [costumes, shows]);

  const openNew = () => {
    setForm({ name: "", year: "", notes: "", show_link: "", image_id: null });
    setDialogOpen(true);
  };

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((prev) => ({ ...prev, image_id: r.data.image_id }));
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
    e.target.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { toast.error("Show name required"); return; }
    const year = form.year.trim() ? parseInt(form.year, 10) : null;
    if (form.year.trim() && (isNaN(year) || year < 1800 || year > 2200)) { toast.error("Year must be between 1800 and 2200"); return; }
    setSaving(true);
    try {
      await api.post("/shows", {
        name,
        year,
        notes: form.notes.trim(),
        show_link: form.show_link.trim(),
        image_id: form.image_id,
      });
      toast.success("Show added");
      setDialogOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add show");
    }
    setSaving(false);
  };

  const setLive = async (show, next, swapShowId = null) => {
    try {
      const r = await api.post(`/shows/${show.id}/toggle-live`, {
        is_live: next,
        swap_show_id: swapShowId,
      });
      if (next) {
        toast.success(`${show.name} is live`);
      } else {
        toast.success(`${show.name} archived`);
      }
      const released = r.data.released_costumes || [];
      await fetchAll();
      // If we released costumes, prompt for optional cleanup
      if (!next && released.length > 0) {
        setCleanupModal({ showName: show.name, released, picked: new Set() });
      } else if (next && released.length > 0) {
        // Swapped-out show released costumes too — offer cleanup
        setCleanupModal({ showName: released[0].released_from_show || "archived show", released, picked: new Set() });
      }
      setSwapModal(null);
    } catch (err) {
      const detail = err.response?.data?.detail;
      // Detail can be a dict when live_cap_reached
      if (detail && typeof detail === "object" && detail.reason === "live_cap_reached") {
        setSwapModal({ targetShow: show, liveShows: detail.live_shows || [] });
      } else {
        toast.error((typeof detail === "string" && detail) || "Failed to update live status");
      }
    }
  };

  const runCleanupDelete = async () => {
    const ids = Array.from(cleanupModal?.picked || []);
    if (ids.length === 0) { setCleanupModal(null); return; }
    try {
      const r = await api.post("/costumes/bulk-delete", { ids });
      toast.success(`Deleted ${r.data.deleted} costume${r.data.deleted === 1 ? "" : "s"}`);
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Delete failed");
    }
    setCleanupModal(null);
  };

  return (
    <div className="space-y-10" data-testid="shows-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="eyebrow">SHOWS</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B] leading-[1.05]">
            Shows
          </h1>
          <p className="text-sm text-[#71717A]">
            Every show that costumes / accessories have appeared in, grouped by year.
            Click a show to see the pieces used in it.
          </p>
        </div>
        <Button
          data-testid="shows-add-btn"
          onClick={openNew}
          className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-11 px-5 text-white shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" /> Add Show
        </Button>
      </div>

      {shows.length === 0 ? (
        <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]" data-testid="shows-empty">
          No shows yet. Click <span className="font-semibold text-[#09090B]">Add Show</span> to create your first one.
        </div>
      ) : (
        <div className="space-y-10">
          {/* LIVE section — up to 3 pinned at top */}
          {liveShows.length > 0 && (
            <section data-testid="live-shows-section">
              <div className="flex items-center justify-between border-b-2 border-[#10B981] pb-2 mb-5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse" />
                  <span className="font-display text-2xl font-bold text-[#09090B]">Live now</span>
                  <span className="text-xs text-[#71717A] tabular-nums">{liveShows.length} of 3</span>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {liveShows.map((s) => (
                  <LiveShowCard
                    key={s.id}
                    show={s}
                    costumes={costumes}
                    students={students}
                    categories={categories}
                    onEndLive={() => setLive(s, false)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Archive (non-live) shows, grouped by year, collapsed by default */}
          {showsByYear.map(({ year, shows: ys }) => {
            const isOpen = expandedYear[year] === true; // default COLLAPSED
            return (
              <section key={year} data-testid={`year-section-${year}`}>
                <button
                  type="button"
                  data-testid={`toggle-year-${year}`}
                  onClick={() => setExpandedYear({ ...expandedYear, [year]: !isOpen })}
                  className="flex items-center gap-2 w-full text-left border-b border-[#09090B] pb-2 mb-4"
                >
                  {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  <span className="font-display text-2xl font-bold text-[#09090B] tabular-nums">{year}</span>
                  <span className="text-xs text-[#71717A]">{ys.length} show{ys.length === 1 ? "" : "s"}</span>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {ys.map((s) => (
                      <div key={s.id} className="relative">
                        <Link
                          to={`/shows/${s.id}`}
                          data-testid={`show-card-${s.id}`}
                          className="block bg-white border border-[#E4E4E7] p-5 hover:border-[#09090B] transition-colors"
                        >
                          <div className="aspect-video image-empty overflow-hidden mb-4 relative">
                            {s.image_id ? (
                              <img
                                src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${s.image_id}`}
                                alt={s.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Film className="h-8 w-8 text-[#A1A1AA]" />
                              </div>
                            )}
                            {s.show_link && (
                              <div className="absolute top-2 right-2 bg-white/95 border border-[#E4E4E7] p-1" title="Has watch link">
                                <LinkIcon className="h-3 w-3 text-[#09090B]" />
                              </div>
                            )}
                          </div>
                          <div className="font-display font-semibold text-lg text-[#09090B] truncate">{s.name}</div>
                          <div className="text-xs text-[#71717A] mt-1 flex items-center justify-between">
                            <span>{s.year != null ? s.year : "—"}</span>
                            <span className="tabular-nums">{countsByShow[s.id] || 0} costume{(countsByShow[s.id] || 0) === 1 ? "" : "s"}</span>
                          </div>
                        </Link>
                        <button
                          type="button"
                          data-testid={`go-live-${s.id}`}
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setLive(s, true); }}
                          className="absolute top-3 left-3 bg-white/95 border border-[#10B981] text-[#059669] hover:bg-[#10B981] hover:text-white px-2 py-0.5 text-[10px] font-mono-label tracking-widest transition-colors"
                          title="Set Live"
                        >
                          GO LIVE
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg rounded-none border-[#09090B]" data-testid="show-form-dialog">
          <DialogHeader>
            <div className="eyebrow">NEW / SHOW</div>
            <DialogTitle className="font-display text-2xl tracking-tight">Add Show</DialogTitle>
            <DialogDescription className="text-[#71717A]">
              Create a new show. You can attach costumes / accessories after saving.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="eyebrow">NAME *</Label>
              <Input
                data-testid="show-form-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Hairspray"
                className="rounded-none border-[#E4E4E7] h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">YEAR</Label>
              <Input
                type="number"
                min="1800"
                max="2200"
                data-testid="show-form-year"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder="e.g. 2024"
                className="rounded-none border-[#E4E4E7] h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">LINK TO WATCH (OPTIONAL)</Label>
              <Input
                type="url"
                data-testid="show-form-link"
                value={form.show_link}
                onChange={(e) => setForm({ ...form, show_link: e.target.value })}
                placeholder="e.g. YouTube or Vimeo URL"
                className="rounded-none border-[#E4E4E7] h-11"
              />
              <p className="text-[10px] text-[#A1A1AA] font-mono-label">TIMESTAMPS ARE SET PER-COSTUME ON EACH COSTUME&apos;S PAGE</p>
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">NOTES</Label>
              <Textarea
                data-testid="show-form-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Director, venue, or anything memorable"
                className="rounded-none border-[#E4E4E7]"
              />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">COVER PHOTO</Label>
              <div className="flex items-start gap-3">
                <div className="w-20 h-20 image-empty border border-[#E4E4E7] overflow-hidden flex items-center justify-center shrink-0">
                  {form.image_id ? (
                    <img
                      src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${form.image_id}`}
                      alt=""
                      className="w-full h-full object-cover"
                      data-testid="show-form-image"
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-[#A1A1AA]" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <label htmlFor="show-form-file">
                    <input id="show-form-file" data-testid="show-form-file" type="file" accept="image/*" onChange={uploadImage} className="hidden" />
                    <span className="inline-flex items-center gap-1 border border-[#09090B] text-[#09090B] px-3 py-1.5 text-sm cursor-pointer hover:bg-[#F4F4F5]">
                      <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : (form.image_id ? "Replace photo" : "Upload photo")}
                    </span>
                  </label>
                  {form.image_id && (
                    <button
                      type="button"
                      data-testid="show-form-remove-image"
                      onClick={() => setForm({ ...form, image_id: null })}
                      className="text-xs text-[#EF4444] hover:underline ml-2"
                    >
                      <X className="h-3 w-3 inline" /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" data-testid="show-form-cancel" onClick={() => setDialogOpen(false)} className="rounded-none h-11">
                Cancel
              </Button>
              <Button type="submit" data-testid="show-form-save" disabled={saving} className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6">
                {saving ? "Saving…" : "Add Show"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Live-cap swap modal */}
      {swapModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="live-swap-overlay">
          <div className="bg-white w-full max-w-lg border border-[#09090B]">
            <div className="p-5 border-b border-[#E4E4E7]">
              <div className="eyebrow">MAX 3 LIVE SHOWS</div>
              <h3 className="font-display text-xl font-semibold mt-1">Swap out a live show?</h3>
              <p className="text-sm text-[#71717A] mt-2">
                <b>{swapModal.targetShow?.name}</b> can't go live because 3 shows are already live.
                Pick one to end so this one can take its place.
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {swapModal.liveShows.map((ls) => (
                <button
                  key={ls.id}
                  type="button"
                  data-testid={`swap-choose-${ls.id}`}
                  onClick={() => setLive(swapModal.targetShow, true, ls.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 border-b border-[#E4E4E7] hover:bg-[#FAFAFA] text-left"
                >
                  <ArrowLeftRight className="h-4 w-4 text-[#71717A] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#09090B] truncate">{ls.name}</div>
                    <div className="text-xs text-[#71717A]">{ls.year ?? "—"}</div>
                  </div>
                  <span className="text-[9px] font-mono-label tracking-widest bg-[#EF4444] text-white px-1.5 py-0.5">END</span>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-[#E4E4E7] bg-[#FAFAFA] flex justify-end">
              <Button variant="outline" onClick={() => setSwapModal(null)} className="rounded-none h-9" data-testid="swap-cancel">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* End-of-live cleanup modal */}
      {cleanupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="cleanup-overlay">
          <div className="bg-white w-full max-w-2xl max-h-[85vh] flex flex-col border border-[#09090B]">
            <div className="p-5 border-b border-[#E4E4E7]">
              <div className="eyebrow">SHOW ENDED · {cleanupModal.showName?.toUpperCase()}</div>
              <h3 className="font-display text-xl font-semibold mt-1">
                Any costumes to remove from inventory?
              </h3>
              <p className="text-sm text-[#71717A] mt-2">
                These pieces are no longer in use. Check any that walked with a student (e.g. custom boots) and we'll delete them.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {cleanupModal.released.map((c) => {
                const on = cleanupModal.picked.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-5 py-2.5 border-b border-[#E4E4E7] cursor-pointer hover:bg-[#FAFAFA]"
                    data-testid={`cleanup-item-${c.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = new Set(cleanupModal.picked);
                        if (e.target.checked) next.add(c.id); else next.delete(c.id);
                        setCleanupModal({ ...cleanupModal, picked: next });
                      }}
                      className="shrink-0"
                    />
                    <div className="w-8 h-8 image-empty overflow-hidden shrink-0 flex items-center justify-center">
                      {c.image_id ? (
                        <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`} alt="" className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#09090B] truncate">{c.name}</div>
                      <div className="text-[11px] text-[#71717A] truncate">
                        {c.category || "—"}{c.location ? ` · ${c.location}` : ""}{c.sub_location ? ` · ${c.sub_location}` : ""}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="p-3 border-t border-[#E4E4E7] bg-[#FAFAFA] flex justify-between items-center">
              <span className="text-xs text-[#71717A] tabular-nums">
                {cleanupModal.picked.size} of {cleanupModal.released.length} selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCleanupModal(null)} className="rounded-none h-9" data-testid="cleanup-skip">Keep all</Button>
                <Button
                  onClick={runCleanupDelete}
                  disabled={cleanupModal.picked.size === 0}
                  className="rounded-none h-9 bg-[#EF4444] hover:bg-[#DC2626] text-white disabled:opacity-40"
                  data-testid="cleanup-delete"
                >
                  Delete {cleanupModal.picked.size || ""}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveShowCard({ show, costumes, students, categories, onEndLive }) {
  const catsById = useMemo(() => Object.fromEntries((categories || []).map((c) => [c.id, c])), [categories]);
  const attached = useMemo(
    () => costumes.filter((c) => c.current_show_id === show.id),
    [costumes, show.id],
  );
  const shortages = attached.filter((c) => c.shortage);
  const assignedStudentIds = new Set();
  attached.forEach((c) => (c.assigned_student_ids || []).forEach((sid) => assignedStudentIds.add(sid)));
  const studentsHere = students.filter((s) => assignedStudentIds.has(s.id));

  return (
    <div className="border-2 border-[#10B981] bg-white" data-testid={`live-show-card-${show.id}`}>
      <div className="p-4 border-b border-[#D1FAE5] bg-[#ECFDF5]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse" />
              <span className="text-[9px] font-mono-label tracking-widest text-[#059669]">LIVE {show.year ? `· ${show.year}` : ""}</span>
            </div>
            <Link to={`/shows/${show.id}`} className="block mt-1">
              <h3 className="font-display text-xl font-semibold text-[#064E3B] truncate hover:underline">{show.name}</h3>
            </Link>
          </div>
          <button
            type="button"
            data-testid={`end-live-${show.id}`}
            onClick={onEndLive}
            className="border border-[#7F1D1D] text-[#7F1D1D] hover:bg-[#EF4444] hover:text-white px-2 py-1 text-[10px] font-mono-label tracking-widest shrink-0"
            title="End live"
          >
            END
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs tabular-nums text-[#065F46]">
          <span><b>{attached.length}</b> costume{attached.length === 1 ? "" : "s"}</span>
          <span><b>{studentsHere.length}</b> student{studentsHere.length === 1 ? "" : "s"}</span>
          {shortages.length > 0 && (
            <span className="text-[#7F1D1D] flex items-center gap-1"><AlertTriangle className="h-3 w-3" /><b>{shortages.length}</b> shortage{shortages.length === 1 ? "" : "s"}</span>
          )}
        </div>
      </div>
      <div className="p-4">
        {studentsHere.length === 0 ? (
          <div className="text-xs text-[#71717A] italic">No students assigned yet — <Link to={`/shows/${show.id}`} className="underline">open the show</Link> to add costumes.</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {studentsHere.slice(0, 8).map((st) => {
              const cat = catsById[st.category_id];
              const mine = attached.filter((c) => (c.assigned_student_ids || []).includes(st.id));
              return (
                <Link
                  to={`/student/${st.id}`}
                  key={st.id}
                  className="w-32 shrink-0 border border-[#E4E4E7] hover:border-[#09090B] p-2"
                  data-testid={`live-student-${show.id}-${st.id}`}
                >
                  <div className="w-full aspect-square image-empty overflow-hidden flex items-center justify-center">
                    {st.image_id ? (
                      <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${st.image_id}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="h-6 w-6 text-[#A1A1AA]" />
                    )}
                  </div>
                  <div className="text-[11px] font-medium text-[#09090B] truncate mt-1">
                    {[st.first_name, st.last_name].filter(Boolean).join(" ")}
                  </div>
                  {cat && (
                    <div className="text-[9px] font-mono-label tracking-widest inline-block mt-1 px-1" style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                      {cat.name}
                    </div>
                  )}
                  <div className="text-[10px] text-[#71717A] tabular-nums mt-1">{mine.length} piece{mine.length === 1 ? "" : "s"}</div>
                </Link>
              );
            })}
            {studentsHere.length > 8 && (
              <Link to={`/shows/${show.id}`} className="shrink-0 border border-dashed border-[#E4E4E7] hover:border-[#09090B] w-32 flex items-center justify-center text-xs text-[#71717A]">
                +{studentsHere.length - 8} more
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
