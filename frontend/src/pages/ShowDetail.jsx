import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { ArrowLeft, Film, Flag, Calendar, Plus, Search, X, ExternalLink, Pencil, Upload, Image as ImageIcon, Trash2, Printer, Users as UsersIcon, User as UserIcon, ArrowLeftRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function ShowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { hasPerm } = useAuth();
  const [show, setShow] = useState(null);
  const [costumes, setCostumes] = useState([]);
  const [allCostumes, setAllCostumes] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentCategories, setStudentCategories] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerSelected, setPickerSelected] = useState({});
  const [pickerSaving, setPickerSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", year: "", notes: "", show_link: "", image_id: null, is_live: false });
  const [editSaving, setEditSaving] = useState(false);
  const [editUploading, setEditUploading] = useState(false);
  const [swapModal, setSwapModal] = useState(null);       // { liveShows }
  const [cleanupModal, setCleanupModal] = useState(null); // { showName, released, picked }

  const load = async () => {
    try {
      const [shows, cs, all, st, cats] = await Promise.all([
        api.get("/shows"),
        api.get("/costumes", { params: { show_id: id } }),
        api.get("/costumes"),
        api.get("/students").catch(() => ({ data: [] })),
        api.get("/student-categories").catch(() => ({ data: [] })),
      ]);
      const s = shows.data.find((x) => x.id === id);
      if (!s) { toast.error("Show not found"); navigate("/shows"); return; }
      setShow(s);
      setCostumes(cs.data);
      setAllCostumes(all.data);
      setStudents(st.data);
      setStudentCategories(cats.data);
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

  // Build per-student kanban columns from attached in-use costumes (must live BEFORE the early return)
  const catsById = useMemo(() => Object.fromEntries((studentCategories || []).map((c) => [c.id, c])), [studentCategories]);
  const kanban = useMemo(() => {
    const perStudent = new Map();
    for (const c of costumes) {
      for (const a of (c.assignments || [])) {
        if (!perStudent.has(a.student_id)) perStudent.set(a.student_id, []);
        perStudent.get(a.student_id).push({ costume: c, assignment: a });
      }
    }
    const columns = [];
    for (const st of students) {
      if (!perStudent.has(st.id)) continue;
      columns.push({ student: st, entries: perStudent.get(st.id) });
    }
    columns.sort((a, b) => (a.student.last_name || "").localeCompare(b.student.last_name || ""));
    return columns;
  }, [costumes, students]);

  if (!show) return <div className="py-20 eyebrow">LOADING…</div>;

  const printManifest = () => {
    document.documentElement.classList.add("printing-manifest");
    setTimeout(() => {
      window.print();
      document.documentElement.classList.remove("printing-manifest");
    }, 50);
  };

  const printRunSheet = () => {
    document.documentElement.classList.add("printing-run-sheet");
    setTimeout(() => {
      window.print();
      document.documentElement.classList.remove("printing-run-sheet");
    }, 50);
  };

  const toggleLive = async (next, swapShowId = null) => {
    try {
      const r = await api.post(`/shows/${id}/toggle-live`, { is_live: next, swap_show_id: swapShowId });
      toast.success(next ? "Show is live" : "Show archived");
      const released = r.data.released_costumes || [];
      await load();
      if (released.length > 0) {
        setCleanupModal({ showName: show?.name, released, picked: new Set() });
      }
      setSwapModal(null);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.reason === "live_cap_reached") {
        setSwapModal({ liveShows: detail.live_shows || [] });
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
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Delete failed");
    }
    setCleanupModal(null);
  };

  // Build per-student kanban columns from attached in-use costumes
  const shortages = costumes.filter((c) => c.shortage);

  return (
    <div className="space-y-10 show-detail-screen" data-testid="show-detail-page">
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
            {hasPerm("costumes.view") && costumes.length > 0 && (
              <Button
                type="button"
                onClick={printManifest}
                variant="outline"
                data-testid="show-print-manifest-btn"
                className="rounded-none border-[#09090B] h-10"
              >
                <Printer className="h-4 w-4 mr-1" /> Print manifest
              </Button>
            )}
            {hasPerm("students.view") && kanban.length > 0 && (
              <Button
                type="button"
                onClick={printRunSheet}
                variant="outline"
                data-testid="show-print-run-sheet-btn"
                className="rounded-none border-[#09090B] h-10"
              >
                <Printer className="h-4 w-4 mr-1" /> Print run sheet
              </Button>
            )}
            {hasPerm("shows.toggle_live") && (
              show.is_live ? (
                <Button
                  type="button"
                  onClick={() => toggleLive(false)}
                  data-testid="show-end-live-btn"
                  className="bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-none h-10"
                >
                  End live
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => toggleLive(true)}
                  data-testid="show-go-live-btn"
                  className="bg-[#10B981] hover:bg-[#059669] text-white rounded-none h-10"
                >
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse mr-2" /> Go live
                </Button>
              )
            )}
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
            {originals.length} original · {additionals.length} additional · {costumes.length} total pieces · {kanban.length} student{kanban.length === 1 ? "" : "s"} assigned
          </div>
        </div>
      </div>

      {/* Shortage banner (per-show) */}
      {shortages.length > 0 && (
        <div className="border border-[#EF4444] bg-[#FEF2F2] p-4" data-testid="show-shortage-banner">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#EF4444] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="eyebrow text-[#7F1D1D]">ASSIGNMENT ALERT · {shortages.length} SHORTAGE{shortages.length === 1 ? "" : "S"}</div>
              <p className="text-sm text-[#7F1D1D] mt-1">
                One or more costumes have more students assigned than pieces on hand. Add stock, reassign, or duplicate before showtime.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {shortages.map((c) => (
                  <Link key={c.id} to={`/costume/${c.id}`} data-testid={`show-shortage-${c.id}`} className="inline-flex items-center gap-1 bg-white border border-[#EF4444] text-[#7F1D1D] px-2 py-0.5 text-xs hover:bg-[#FEE2E2]">
                    <span className="font-medium">{c.name}</span>
                    {(c.shortage_details || []).map((d, i) => (
                      <span key={i} className="text-[10px] tabular-nums">
                        {d.size} {d.assigned}/{d.available}
                      </span>
                    ))}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wardrobe Kanban (per-show) */}
      {kanban.length > 0 && (
        <section data-testid="show-wardrobe-kanban">
          <div className="eyebrow mb-4 flex items-center gap-2">
            <UsersIcon className="h-3 w-3" /> WARDROBE · STUDENTS ({kanban.length})
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {kanban.map(({ student, entries }) => {
              const cat = catsById[student.category_id];
              return (
                <div key={student.id} className="w-72 shrink-0 border border-[#E4E4E7] bg-white" data-testid={`kanban-col-${student.id}`}>
                  <Link to={`/student/${student.id}`} className="block p-3 border-b border-[#E4E4E7] bg-[#FAFAFA] hover:bg-[#F4F4F5]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 image-empty overflow-hidden shrink-0 flex items-center justify-center">
                        {student.image_id ? (
                          <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${student.image_id}`} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="h-4 w-4 text-[#A1A1AA]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[#09090B] truncate">
                          {[student.first_name, student.last_name].filter(Boolean).join(" ")}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {cat && (
                            <span className="text-[9px] font-mono-label tracking-widest px-1" style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                              {cat.name}
                            </span>
                          )}
                          <span className="text-[9px] font-mono-label tracking-widest text-[#71717A]">{entries.length} PIECE{entries.length === 1 ? "" : "S"}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                  <div className="p-2 space-y-1.5">
                    {entries.map(({ costume, assignment }) => {
                      const sys = costume.sorting_system || costume.sizing_system || "";
                      const preferred = sys && student.sizes ? (student.sizes[sys] || "") : "";
                      const mismatch = preferred && assignment.size && preferred.toLowerCase() !== assignment.size.toLowerCase();
                      return (
                        <Link
                          to={`/costume/${costume.id}`}
                          key={costume.id + assignment.size}
                          data-testid={`kanban-piece-${student.id}-${costume.id}`}
                          className={`block border p-2 hover:border-[#09090B] ${costume.shortage ? "border-[#EF4444] bg-[#FEF2F2]" : (mismatch ? "border-[#F59E0B] bg-[#FEF3C7]" : "border-[#E4E4E7] bg-white")}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="w-9 h-9 image-empty overflow-hidden shrink-0 flex items-center justify-center">
                              {costume.image_id ? (
                                <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${costume.image_id}`} alt="" className="w-full h-full object-cover" />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-[#09090B] truncate">{costume.name}</div>
                              <div className="text-[10px] text-[#71717A] truncate">{costume.category}</div>
                              <div className="mt-1 flex items-center gap-1 flex-wrap">
                                <span className={`text-[9px] font-mono-label tracking-widest px-1 border ${mismatch ? "border-[#F59E0B] text-[#78350F]" : "border-[#E4E4E7] text-[#52525B]"}`}>
                                  {assignment.size ? `SIZE · ${assignment.size}` : "UNSIZED"}
                                </span>
                                {mismatch && (
                                  <span className="text-[9px] font-mono-label text-[#78350F]" title={`Prefers ${preferred}`}>
                                    ⚠ MISMATCH
                                  </span>
                                )}
                                {costume.shortage && (
                                  <span className="text-[9px] font-mono-label bg-[#EF4444] text-white px-1">SHORT</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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

      {/* Printable show manifest — hidden on screen, only shown when window.print is triggered from Print manifest */}
      <ShowManifestSheet show={show} costumes={costumes} originals={originals} />

      {/* Printable Wardrobe run sheet — one page per student */}
      <PrintableRunSheet columns={kanban} show={show} catsById={catsById} />

      {/* Live-cap swap modal */}
      {swapModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="show-live-swap-overlay">
          <div className="bg-white w-full max-w-lg border border-[#09090B]">
            <div className="p-5 border-b border-[#E4E4E7]">
              <div className="eyebrow">MAX 3 LIVE SHOWS</div>
              <h3 className="font-display text-xl font-semibold mt-1">Swap out a live show?</h3>
              <p className="text-sm text-[#71717A] mt-2">
                <b>{show?.name}</b> can't go live because 3 shows are already live. Pick one to end.
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {swapModal.liveShows.map((ls) => (
                <button key={ls.id} type="button" data-testid={`show-swap-choose-${ls.id}`}
                  onClick={() => toggleLive(true, ls.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 border-b border-[#E4E4E7] hover:bg-[#FAFAFA] text-left">
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
              <Button variant="outline" onClick={() => setSwapModal(null)} className="rounded-none h-9">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* End-of-live cleanup modal */}
      {cleanupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="show-cleanup-overlay">
          <div className="bg-white w-full max-w-2xl max-h-[85vh] flex flex-col border border-[#09090B]">
            <div className="p-5 border-b border-[#E4E4E7]">
              <div className="eyebrow">SHOW ENDED · {cleanupModal.showName?.toUpperCase()}</div>
              <h3 className="font-display text-xl font-semibold mt-1">Any costumes to remove from inventory?</h3>
              <p className="text-sm text-[#71717A] mt-2">
                These pieces are no longer in use. Check any that walked with a student (e.g. custom boots) and we'll delete them.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {cleanupModal.released.map((c) => {
                const on = cleanupModal.picked.has(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-[#E4E4E7] cursor-pointer hover:bg-[#FAFAFA]" data-testid={`show-cleanup-item-${c.id}`}>
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
              <span className="text-xs text-[#71717A] tabular-nums">{cleanupModal.picked.size} of {cleanupModal.released.length} selected</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCleanupModal(null)} className="rounded-none h-9">Keep all</Button>
                <Button onClick={runCleanupDelete} disabled={cleanupModal.picked.size === 0} className="rounded-none h-9 bg-[#EF4444] hover:bg-[#DC2626] text-white disabled:opacity-40">
                  Delete {cleanupModal.picked.size || ""}
                </Button>
              </div>
            </div>
          </div>
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

function ShowManifestSheet({ show, costumes, originals }) {
  const printedAt = new Date().toLocaleString();
  const originalIds = new Set(originals.map((c) => c.id));
  return (
    <div className="show-manifest-only" data-testid="show-manifest-sheet" aria-hidden="true">
      <header className="show-manifest-header">
        <div className="show-manifest-eyebrow">WARDROBE MANIFEST</div>
        <h1 className="show-manifest-title">{show.name}</h1>
        <div className="show-manifest-meta">
          {show.year && <span>{show.year}</span>}
          <span>{costumes.length} costume{costumes.length === 1 ? "" : "s"}</span>
          <span className="show-manifest-print-at">Printed {printedAt}</span>
        </div>
        {show.notes && <p className="show-manifest-notes">{show.notes}</p>}
      </header>
      <table className="show-manifest-table">
        <thead>
          <tr>
            <th className="col-img"></th>
            <th className="col-name">Costume</th>
            <th className="col-cat">Category</th>
            <th className="col-loc">Location</th>
            <th className="col-qty">Qty</th>
            <th className="col-check">✓</th>
          </tr>
        </thead>
        <tbody>
          {costumes.map((c) => (
            <tr key={c.id} data-testid={`manifest-row-${c.id}`}>
              <td className="col-img">
                {c.image_id ? (
                  <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`} alt="" />
                ) : null}
              </td>
              <td className="col-name">
                <div className="manifest-name">{c.name}</div>
                {originalIds.has(c.id) && <div className="manifest-orig">ORIGINAL</div>}
                {c.subcategory && <div className="manifest-sub">{c.subcategory}</div>}
              </td>
              <td className="col-cat">{c.category || "—"}</td>
              <td className="col-loc">
                {c.location || "—"}
                {c.sub_location ? <div className="manifest-subloc">{c.sub_location}</div> : null}
              </td>
              <td className="col-qty">{c.total_quantity ?? 0}</td>
              <td className="col-check">☐</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function PrintableRunSheet({ columns, show, catsById }) {
  const printedAt = new Date().toLocaleString();
  return (
    <div className="wardrobe-print-only" data-testid="show-run-sheet" aria-hidden="true">
      {columns.map(({ student, entries }) => {
        const cat = catsById[student.category_id];
        const fullName = [student.first_name, student.last_name].filter(Boolean).join(" ") || student.display_name || "Unnamed";
        return (
          <section key={student.id} className="run-sheet-page" data-testid={`show-run-sheet-page-${student.id}`}>
            <header className="run-sheet-header">
              <div className="run-sheet-eyebrow">
                WARDROBE RUN SHEET · {(show?.name || "").toUpperCase()}{show?.year ? ` · ${show.year}` : ""}
              </div>
              <h1 className="run-sheet-title">{fullName}</h1>
              <div className="run-sheet-meta">
                {cat && <span className="run-sheet-tag" style={{ borderColor: cat.color, color: cat.color }}>{cat.name}</span>}
                {student.grade && <span>Grade {student.grade}</span>}
                {student.pronouns && <span>{student.pronouns}</span>}
                <span className="run-sheet-count">{entries.length} PIECE{entries.length === 1 ? "" : "S"}</span>
              </div>
            </header>

            {(student.sizes && Object.keys(student.sizes).some((k) => (student.sizes[k] || "").trim())) && (
              <div className="run-sheet-sizes">
                <div className="run-sheet-subtitle">SIZES</div>
                <div className="run-sheet-size-grid">
                  {Object.entries(student.sizes || {}).filter(([, v]) => (v || "").trim()).map(([k, v]) => (
                    <div key={`s-${k}`} className="run-sheet-size-cell">
                      <div className="run-sheet-size-label">{k}</div>
                      <div className="run-sheet-size-val">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="run-sheet-costumes">
              <div className="run-sheet-subtitle">ASSIGNED COSTUMES</div>
              {entries.map(({ costume, assignment }) => {
                const sys = costume.sorting_system || costume.sizing_system || "";
                const preferred = sys && student.sizes ? (student.sizes[sys] || "") : "";
                const mismatch = preferred && assignment.size && preferred.toLowerCase() !== assignment.size.toLowerCase();
                return (
                  <div key={costume.id + assignment.size} className="run-sheet-costume">
                    <div className="run-sheet-costume-img">
                      {costume.image_id ? (
                        <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${costume.image_id}`} alt="" />
                      ) : null}
                    </div>
                    <div className="run-sheet-costume-body">
                      <div className="run-sheet-costume-name">
                        {costume.name}
                        {assignment.size ? <span className="run-sheet-size-badge">{assignment.size}</span> : null}
                        {mismatch ? <span className="run-sheet-mismatch">⚠ mismatch · prefers {preferred}</span> : null}
                      </div>
                      <div className="run-sheet-costume-meta">
                        {costume.category || "—"}
                        {costume.subcategory ? ` · ${costume.subcategory}` : ""}
                      </div>
                      <div className="run-sheet-costume-loc">
                        <b>Location:</b> {costume.location || "—"}{costume.sub_location ? ` · ${costume.sub_location}` : ""}
                      </div>
                      {costume.in_use_note && (
                        <div className="run-sheet-costume-notes"><b>Notes:</b> {costume.in_use_note}</div>
                      )}
                    </div>
                    <div className="run-sheet-costume-check">☐</div>
                  </div>
                );
              })}
            </div>

            {student.notes && (
              <div className="run-sheet-student-notes">
                <div className="run-sheet-subtitle">STUDENT NOTES</div>
                <p>{student.notes}</p>
              </div>
            )}

            <footer className="run-sheet-footer">
              Printed {printedAt} · Dresser signature: _______________________
            </footer>
          </section>
        );
      })}
    </div>
  );
}
