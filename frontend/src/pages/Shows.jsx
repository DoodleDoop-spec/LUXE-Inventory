import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Film, ChevronDown, ChevronRight, Plus, Upload, X, Image as ImageIcon, LinkIcon } from "lucide-react";
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
  const [expandedYear, setExpandedYear] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", year: "", notes: "", show_link: "", image_id: null });
  const [uploading, setUploading] = useState(false);

  const fetchAll = async () => {
    const [s, c] = await Promise.all([
      api.get("/shows"),
      api.get("/costumes"),
    ]);
    setShows(s.data);
    setCostumes(c.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const showsByYear = useMemo(() => {
    const groups = {};
    for (const s of shows) {
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
        <div className="space-y-6">
          {showsByYear.map(({ year, shows: ys }) => {
            const isOpen = expandedYear[year] !== false; // default open
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
                      <Link
                        key={s.id}
                        to={`/shows/${s.id}`}
                        data-testid={`show-card-${s.id}`}
                        className="bg-white border border-[#E4E4E7] p-5 hover:border-[#09090B] transition-colors"
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
                          {liveShowIds.has(s.id) && (
                            <div className="absolute top-2 left-2 bg-[#10B981] text-white px-2 py-0.5 text-[10px] font-mono-label tracking-widest flex items-center gap-1" data-testid={`show-live-${s.id}`}>
                              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
                            </div>
                          )}
                        </div>
                        <div className="font-display font-semibold text-lg text-[#09090B] truncate">{s.name}</div>
                        <div className="text-xs text-[#71717A] mt-1 flex items-center justify-between">
                          <span>{s.year != null ? s.year : "—"}</span>
                          <span className="tabular-nums">{countsByShow[s.id] || 0} costume{(countsByShow[s.id] || 0) === 1 ? "" : "s"}</span>
                        </div>
                      </Link>
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
    </div>
  );
}
