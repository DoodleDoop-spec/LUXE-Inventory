import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { ArrowLeft, Film, Flag, Calendar, Plus, Search, X, ExternalLink, Pencil, Upload, Image as ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function ShowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [show, setShow] = useState(null);
  const [costumes, setCostumes] = useState([]);
  const [allCostumes, setAllCostumes] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerSelected, setPickerSelected] = useState({});
  const [pickerSaving, setPickerSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", year: "", notes: "", show_link: "", image_id: null, is_live: false });
  const [editSaving, setEditSaving] = useState(false);
  const [editUploading, setEditUploading] = useState(false);

  const load = async () => {
    try {
      const [shows, cs, all] = await Promise.all([
        api.get("/shows"),
        api.get("/costumes", { params: { show_id: id } }),
        api.get("/costumes"),
      ]);
      const s = shows.data.find((x) => x.id === id);
      if (!s) { toast.error("Show not found"); navigate("/shows"); return; }
      setShow(s);
      setCostumes(cs.data);
      setAllCostumes(all.data);
    } catch {
      toast.error("Failed to load show");
      navigate("/shows");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const attachedIds = useMemo(() => new Set(costumes.map((c) => c.id)), [costumes]);
  // With the new per-costume shows list, all attached costumes are shown together.
  // We keep two buckets for backward compat: costumes whose FIRST show is this one, vs others.
  const showsFor = (c) => (c.shows && c.shows.length ? c.shows : ((c.original_show_id ? [{ show_id: c.original_show_id, timestamp: "" }] : []).concat((c.additional_show_ids || []).map((sid) => ({ show_id: sid, timestamp: "" })))));
  const originals = useMemo(
    () => costumes.filter((c) => {
      const ss = showsFor(c);
      return ss.length > 0 && ss[0].show_id === id;
    }),
    [costumes, id]
  );
  const additionals = useMemo(
    () => costumes.filter((c) => {
      const ss = showsFor(c);
      return ss.length > 0 && ss[0].show_id !== id && ss.some((s) => s.show_id === id);
    }),
    [costumes, id]
  );

  const pickerCandidates = useMemo(() => {
    const q = pickerQ.trim().toLowerCase();
    return allCostumes
      .filter((c) => !attachedIds.has(c.id))
      .filter((c) => {
        if (!q) return true;
        return (
          (c.name || "").toLowerCase().includes(q) ||
          (c.category || "").toLowerCase().includes(q) ||
          (c.location || "").toLowerCase().includes(q) ||
          (c.keywords || []).some((k) => k.toLowerCase().includes(q))
        );
      });
  }, [allCostumes, attachedIds, pickerQ]);

  const openPicker = () => {
    setPickerSelected({});
    setPickerQ("");
    setPickerOpen(true);
  };

  const togglePick = (cid) => setPickerSelected((prev) => ({ ...prev, [cid]: !prev[cid] }));

  const attachSelected = async () => {
    const ids = Object.entries(pickerSelected).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) { toast.error("Select at least one costume"); return; }
    setPickerSaving(true);
    try {
      let attached = 0;
      for (const cid of ids) {
        const c = allCostumes.find((x) => x.id === cid);
        if (!c) continue;
        const current = (c.shows && c.shows.length ? c.shows : (c.original_show_id ? [{ show_id: c.original_show_id, timestamp: "" }] : []).concat((c.additional_show_ids || []).map((sid) => ({ show_id: sid, timestamp: "" }))));
        if (current.some((s) => s.show_id === id)) continue;
        const next = [...current, { show_id: id, timestamp: "" }];
        await api.put(`/costumes/${cid}`, { shows: next });
        attached += 1;
      }
      toast.success(`Attached ${attached} costume${attached === 1 ? "" : "s"} to this show`);
      setPickerOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to attach");
    }
    setPickerSaving(false);
  };

  const detachCostume = async (c) => {
    const ok = await confirm({
      title: `Remove "${c.name}" from ${show?.name || "this show"}?`,
      description: "The costume itself stays in your inventory. This only unlinks it from this show.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    const current = (c.shows && c.shows.length ? c.shows : (c.original_show_id ? [{ show_id: c.original_show_id, timestamp: "" }] : []).concat((c.additional_show_ids || []).map((sid) => ({ show_id: sid, timestamp: "" }))));
    const next = current.filter((s) => s.show_id !== id);
    try {
      await api.put(`/costumes/${c.id}`, { shows: next });
      toast.success("Removed from this show");
      load();
    } catch { toast.error("Failed to remove"); }
  };

  const openEdit = () => {
    if (!show) return;
    setEditForm({
      name: show.name || "",
      year: show.year != null ? String(show.year) : "",
      notes: show.notes || "",
      show_link: show.show_link || "",
      image_id: show.image_id || null,
      is_live: !!show.is_live,
    });
    setEditOpen(true);
  };

  const uploadEditImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image"); return; }
    setEditUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setEditForm((prev) => ({ ...prev, image_id: r.data.image_id }));
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setEditUploading(false);
    e.target.value = "";
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    const name = editForm.name.trim();
    if (!name) { toast.error("Show name required"); return; }
    const year = editForm.year.trim() ? parseInt(editForm.year, 10) : null;
    if (editForm.year.trim() && (isNaN(year) || year < 1800 || year > 2200)) {
      toast.error("Year must be between 1800 and 2200"); return;
    }
    setEditSaving(true);
    try {
      await api.put(`/shows/${id}`, {
        name,
        year,
        notes: editForm.notes.trim(),
        show_link: editForm.show_link.trim(),
        image_id: editForm.image_id,
        is_live: !!editForm.is_live,
      });
      toast.success("Show updated");
      setEditOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update");
    }
    setEditSaving(false);
  };

  const deleteShow = async () => {
    if (!show) return;
    const ok = await confirm({
      title: `Delete "${show.name}"?`,
      description: "This can only be done if no costumes are attached to this show.",
      confirmLabel: "Delete show",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/shows/${id}`);
      toast.success("Show deleted");
      navigate("/shows");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    }
  };

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
          <div className="eyebrow flex items-center gap-2">
            SHOW
            {show.is_live && (
              <span className="inline-flex items-center gap-1 bg-[#10B981] text-white px-2 py-0.5 text-[10px] font-mono-label tracking-widest normal-case" data-testid="show-live-badge">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <h1 className="font-display text-4xl sm:text-5xl xl:text-6xl tracking-tight font-bold text-[#09090B] leading-[1.05] mt-2" data-testid="show-name">
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
          <div className="flex items-center gap-3 flex-wrap mt-5">
            {show.show_link && (
              <a
                href={show.show_link}
                target="_blank"
                rel="noreferrer"
                data-testid="show-watch-link"
                className="inline-flex items-center gap-1.5 h-10 px-4 border border-[#09090B] text-[#09090B] text-sm hover:bg-[#F4F4F5]"
              >
                <ExternalLink className="h-4 w-4" /> Watch this show
              </a>
            )}
            <Button
              onClick={openPicker}
              data-testid="show-add-costumes-btn"
              className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-10"
            >
              <Plus className="h-4 w-4 mr-1" /> Add costumes / accessories
            </Button>
            <Button
              type="button"
              onClick={openEdit}
              variant="outline"
              data-testid="show-edit-btn"
              className="rounded-none border-[#09090B] h-10"
            >
              <Pencil className="h-4 w-4 mr-1" /> Edit show
            </Button>
            <Button
              type="button"
              onClick={deleteShow}
              variant="ghost"
              data-testid="show-delete-btn"
              className="rounded-none h-10 text-[#EF4444] hover:bg-[#FEF2F2]"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
          <div className="text-sm text-[#71717A] mt-4 tabular-nums">
            {originals.length} original · {additionals.length} additional · {costumes.length} total pieces
          </div>
        </div>
      </div>

      {[
        { title: "Originals", items: originals, testId: "originals-section" },
        { title: "Also used in this show", items: additionals, testId: "additionals-section" },
      ].map(({ title, items, testId }) => (
        items.length > 0 && (
          <section key={title} data-testid={testId}>
            <div className="eyebrow mb-4">{title.toUpperCase()}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
              {items.map((c) => (
                <div key={c.id} data-testid={`show-costume-${c.id}`} className="bg-white p-5 hover:bg-[#FAFAFA] transition-colors group relative">
                  <Link to={`/costume/${c.id}`}>
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
                  <button
                    type="button"
                    data-testid={`show-detach-${c.id}`}
                    onClick={() => detachCostume(c)}
                    className="absolute top-3 left-3 bg-white/95 border border-[#E4E4E7] hover:border-[#EF4444] hover:text-[#EF4444] p-1.5 shadow-sm z-10"
                    aria-label="Remove from show"
                    title="Remove from this show"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )
      ))}

      {originals.length === 0 && additionals.length === 0 && (
        <div className="border border-[#E4E4E7] p-10 text-center" data-testid="show-empty">
          <p className="text-[#71717A] mb-4">No costumes / accessories have been assigned to this show yet.</p>
          <Button onClick={openPicker} className="bg-[#09090B] hover:bg-[#27272A] rounded-none text-white" data-testid="show-empty-add-btn">
            <Plus className="h-4 w-4 mr-1" /> Add costumes / accessories
          </Button>
        </div>
      )}

      {/* Costume picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl rounded-none border-[#09090B] max-h-[85vh] flex flex-col" data-testid="show-picker-dialog">
          <DialogHeader>
            <div className="eyebrow">ATTACH / TO SHOW</div>
            <DialogTitle className="font-display text-2xl tracking-tight">Add costumes / accessories to {show.name}</DialogTitle>
            <DialogDescription className="text-[#71717A]">
              Select items already in your inventory to attach to this show. They&apos;ll be added as additional appearances.
            </DialogDescription>
          </DialogHeader>
          <div className="relative mt-2">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <Input
              data-testid="show-picker-search"
              value={pickerQ}
              onChange={(e) => setPickerQ(e.target.value)}
              placeholder="Search by name, category, keyword…"
              className="pl-10 h-11 rounded-none border-[#E4E4E7]"
            />
          </div>
          <div className="flex-1 min-h-[200px] overflow-y-auto border border-[#E4E4E7] mt-3" data-testid="show-picker-list">
            {pickerCandidates.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#71717A]">
                {allCostumes.length === attachedIds.size
                  ? "Every costume is already attached."
                  : "No matches."}
              </div>
            ) : (
              <ul className="divide-y divide-[#E4E4E7]">
                {pickerCandidates.map((c) => {
                  const selected = !!pickerSelected[c.id];
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        data-testid={`show-picker-item-${c.id}`}
                        onClick={() => togglePick(c.id)}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-[#FAFAFA] ${selected ? "bg-[#F4F4F5]" : ""}`}
                      >
                        <div className={`w-4 h-4 border ${selected ? "bg-[#09090B] border-[#09090B]" : "border-[#71717A]"} flex items-center justify-center shrink-0`}>
                          {selected && <div className="w-1.5 h-1.5 bg-white" />}
                        </div>
                        <div className="w-10 h-10 image-empty border border-[#E4E4E7] overflow-hidden shrink-0 flex items-center justify-center">
                          {c.image_id ? (
                            <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`} alt={c.name} className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[#09090B] truncate">{c.name}</div>
                          <div className="text-xs text-[#71717A] truncate">
                            {c.category}{c.subcategory ? ` · ${c.subcategory}` : ""}
                          </div>
                        </div>
                        <div className="text-right shrink-0 text-xs text-[#71717A] tabular-nums">
                          {c.total_quantity} units
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter className="gap-2 mt-3">
            <Button type="button" variant="outline" data-testid="show-picker-cancel" onClick={() => setPickerOpen(false)} className="rounded-none h-11">
              Cancel
            </Button>
            <Button
              onClick={attachSelected}
              disabled={pickerSaving}
              data-testid="show-picker-attach"
              className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6"
            >
              {pickerSaving ? "Attaching…" : `Attach ${Object.values(pickerSelected).filter(Boolean).length || ""}`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit show dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] rounded-none border-[#09090B] p-0 flex flex-col overflow-hidden"
          data-testid="show-edit-dialog"
        >
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <div className="eyebrow">EDIT / SHOW</div>
            <DialogTitle className="font-display text-2xl tracking-tight">Edit show</DialogTitle>
            <DialogDescription className="text-[#71717A]">
              Update this show&apos;s details. Timestamps stay on each costume, not on the show.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
            <div className="space-y-2">
              <Label className="eyebrow">NAME</Label>
              <Input
                data-testid="show-edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Show name"
                className="rounded-none border-[#E4E4E7] h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">YEAR</Label>
              <Input
                type="number"
                min="1800"
                max="2200"
                data-testid="show-edit-year"
                value={editForm.year}
                onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                placeholder="e.g. 2024"
                className="rounded-none border-[#E4E4E7] h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">LINK TO WATCH (OPTIONAL)</Label>
              <Input
                type="url"
                data-testid="show-edit-link"
                value={editForm.show_link}
                onChange={(e) => setEditForm({ ...editForm, show_link: e.target.value })}
                placeholder="e.g. YouTube or Vimeo URL"
                className="rounded-none border-[#E4E4E7] h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">NOTES</Label>
              <Textarea
                data-testid="show-edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2}
                className="rounded-none border-[#E4E4E7]"
              />
            </div>
            <div className="border border-[#E4E4E7] p-3 flex items-start gap-3 bg-[#FAFAFA]">
              <button
                type="button"
                role="switch"
                aria-checked={editForm.is_live}
                data-testid="show-edit-live"
                onClick={() => setEditForm({ ...editForm, is_live: !editForm.is_live })}
                className={`shrink-0 mt-0.5 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.is_live ? "bg-[#10B981]" : "bg-[#D4D4D8]"}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${editForm.is_live ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#09090B] flex items-center gap-2">
                  Show is Live
                  {editForm.is_live && (
                    <span className="inline-flex items-center gap-1 bg-[#10B981] text-white px-1.5 py-0.5 text-[9px] font-mono-label tracking-widest">
                      <span className="w-1 h-1 bg-white rounded-full animate-pulse" /> LIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#71717A] mt-0.5">
                  When ON, every costume attached to this show is auto-tagged as in-use for this show. Turn OFF to release them.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">COVER PHOTO</Label>
              <div className="flex items-start gap-3">
                <div className="w-20 h-20 image-empty border border-[#E4E4E7] overflow-hidden flex items-center justify-center shrink-0">
                  {editForm.image_id ? (
                    <img
                      src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${editForm.image_id}`}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-[#A1A1AA]" />
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <input type="file" accept="image/*" onChange={uploadEditImage} className="hidden" id="show-edit-file" data-testid="show-edit-file" />
                  <label htmlFor="show-edit-file" className="cursor-pointer inline-flex items-center gap-2 border border-[#09090B] text-[#09090B] hover:bg-[#F4F4F5] h-10 px-4 text-sm w-fit">
                    <Upload className="h-4 w-4" /> {editUploading ? "Uploading…" : (editForm.image_id ? "Replace photo" : "Upload photo")}
                  </label>
                  {editForm.image_id && (
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, image_id: null })}
                      className="text-xs text-[#EF4444] hover:underline w-fit"
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>
            </div>
            <DialogFooter className="gap-2 px-6 py-4 border-t border-[#E4E4E7] bg-white shrink-0">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="rounded-none h-11">Cancel</Button>
              <Button type="submit" disabled={editSaving} data-testid="show-edit-save" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6">
                {editSaving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
