import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  Users, Plus, Search, Upload, Mail, MailCheck, X, Trash2, Pencil, User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const emptyForm = {
  first_name: "",
  last_name: "",
  display_name: "",
  email: "",
  phone: "",
  grade: "",
  pronouns: "",
  notes: "",
  image_id: null,
  measurements: {},
  sizes: {},
};

export default function Students() {
  const confirm = useConfirm();
  const [students, setStudents] = useState([]);
  const [config, setConfig] = useState({ measurement_keys: [], size_keys: [] });
  const [stats, setStats] = useState({ total: 0, invited: 0, with_email: 0, size_distribution: {} });
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // student id or null
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  const load = async () => {
    try {
      const [ls, cf, st] = await Promise.all([
        api.get("/students"),
        api.get("/students/config"),
        api.get("/students/stats"),
      ]);
      setStudents(ls.data);
      setConfig(cf.data);
      setStats(st.data);
    } catch {
      toast.error("Failed to load students");
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return students;
    return students.filter((s) =>
      [s.first_name, s.last_name, s.display_name, s.email, s.grade]
        .filter(Boolean).some((v) => v.toLowerCase().includes(needle))
    );
  }, [students, q]);

  const openNew = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      measurements: Object.fromEntries(config.measurement_keys.map((k) => [k, ""])),
      sizes: Object.fromEntries(config.size_keys.map((k) => [k, ""])),
    });
    setDialogOpen(true);
  };
  const openEdit = (s) => {
    setEditing(s.id);
    // Merge existing measurements/sizes with default keys so every field renders.
    const measurements = { ...Object.fromEntries(config.measurement_keys.map((k) => [k, ""])), ...(s.measurements || {}) };
    const sizes = { ...Object.fromEntries(config.size_keys.map((k) => [k, ""])), ...(s.sizes || {}) };
    setForm({
      first_name: s.first_name || "",
      last_name: s.last_name || "",
      display_name: s.display_name || "",
      email: s.email || "",
      phone: s.phone || "",
      grade: s.grade || "",
      pronouns: s.pronouns || "",
      notes: s.notes || "",
      image_id: s.image_id || null,
      measurements,
      sizes,
    });
    setDialogOpen(true);
  };

  const setMeasurement = (k, v) => setForm((prev) => ({ ...prev, measurements: { ...prev.measurements, [k]: v } }));
  const setSize = (k, v) => setForm((prev) => ({ ...prev, sizes: { ...prev.sizes, [k]: v } }));
  const addCustomField = (kind) => {
    const label = window.prompt(kind === "measurement" ? "Measurement name (e.g. Bicep)" : "Size name (e.g. Bra)");
    if (!label) return;
    const clean = label.trim();
    if (!clean) return;
    if (kind === "measurement") {
      setForm((prev) => ({ ...prev, measurements: { ...prev.measurements, [clean]: "" } }));
    } else {
      setForm((prev) => ({ ...prev, sizes: { ...prev.sizes, [clean]: "" } }));
    }
  };
  const removeField = (kind, key) => {
    setForm((prev) => {
      const next = { ...(kind === "measurement" ? prev.measurements : prev.sizes) };
      delete next[key];
      return kind === "measurement" ? { ...prev, measurements: next } : { ...prev, sizes: next };
    });
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image"); return; }
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
    if (!form.first_name.trim()) { toast.error("First name required"); return; }
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        grade: form.grade.trim(),
        pronouns: form.pronouns.trim(),
        notes: form.notes.trim(),
        image_id: form.image_id,
        measurements: form.measurements,
        sizes: form.sizes,
      };
      if (editing) {
        await api.put(`/students/${editing}`, payload);
        toast.success("Student updated");
      } else {
        await api.post("/students", payload);
        toast.success("Student added");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save");
    }
    setSaving(false);
  };

  const removeStudent = async (s) => {
    const ok = await confirm({
      title: `Delete "${fullName(s)}"?`,
      description: "Their measurements and notes will be permanently removed.",
      confirmLabel: "Delete student",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/students/${s.id}`);
      toast.success("Deleted");
      load();
    } catch { toast.error("Failed to delete"); }
  };

  const sendInvite = async (s) => {
    if (!s.email) { toast.error("Add an email first"); return; }
    setInviteBusy(true);
    try {
      const r = await api.post(`/students/${s.id}/invite`);
      toast.success(r.data.message || "Invite queued");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send invite");
    }
    setInviteBusy(false);
  };

  // Overview: build a compact "roster grid" of student × size type
  const rosterSizeCols = useMemo(() => {
    // union of all size keys actually used, ordered by config.size_keys first
    const used = new Set();
    for (const s of students) for (const k of Object.keys(s.sizes || {})) if ((s.sizes[k] || "").trim()) used.add(k);
    const cfgFirst = (config.size_keys || []).filter((k) => used.has(k));
    const extras = [...used].filter((k) => !cfgFirst.includes(k));
    return [...cfgFirst, ...extras];
  }, [students, config.size_keys]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8" data-testid="students-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2"><Users className="h-3 w-3" /> STUDENTS / ROSTER</div>
          <h1 className="font-display text-4xl sm:text-5xl xl:text-6xl tracking-tight font-bold text-[#09090B] leading-[1.05] mt-2">
            Students
          </h1>
          <p className="text-[#71717A] mt-3 max-w-xl">
            Keep sizing, measurements and notes for every performer in one place. Optionally invite them by email
            once accounts are enabled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <Input
              data-testid="students-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search students…"
              className="pl-10 h-11 rounded-none border-[#E4E4E7] w-64"
            />
          </div>
          <Button onClick={openNew} data-testid="students-new-btn" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-5">
            <Plus className="h-4 w-4 mr-1" /> Add student
          </Button>
        </div>
      </div>

      {/* Overview */}
      <div className="border border-[#E4E4E7] bg-white" data-testid="students-overview">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#E4E4E7] border-b border-[#E4E4E7]">
          <Stat label="Total students" value={stats.total} testId="stat-total" />
          <Stat label="With email" value={stats.with_email} testId="stat-with-email" />
          <Stat label="Invites sent" value={stats.invited} testId="stat-invited" />
          <Stat label="Size categories" value={Object.keys(stats.size_distribution || {}).length} testId="stat-sizes" />
        </div>
        {/* Roster grid */}
        {rosterSizeCols.length > 0 && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="students-roster-table">
              <thead className="bg-[#FAFAFA]">
                <tr className="text-left border-b border-[#E4E4E7]">
                  <th className="px-4 py-2 font-mono-label text-[10px] tracking-widest text-[#71717A]">STUDENT</th>
                  {rosterSizeCols.map((k) => (
                    <th key={k} className="px-3 py-2 font-mono-label text-[10px] tracking-widest text-[#71717A]">
                      {k.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-[#F4F4F5] hover:bg-[#FAFAFA]">
                    <td className="px-4 py-2">
                      <button onClick={() => openEdit(s)} className="text-[#09090B] hover:underline font-medium text-left">
                        {fullName(s)}
                      </button>
                      {s.grade && <span className="ml-2 text-[10px] text-[#71717A]">· {s.grade}</span>}
                    </td>
                    {rosterSizeCols.map((k) => (
                      <td key={k} className="px-3 py-2 tabular-nums text-[#09090B]">
                        {(s.sizes && s.sizes[k]) || <span className="text-[#D4D4D8]">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-[#E4E4E7] p-16 text-center" data-testid="students-empty">
          <UserIcon className="h-10 w-10 text-[#A1A1AA] mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-[#71717A]">
            {students.length === 0 ? "No students yet. Add your first one." : "No matches for that search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-[#E4E4E7] border border-[#E4E4E7]" data-testid="students-grid">
          {filtered.map((s) => (
            <StudentCard
              key={s.id}
              student={s}
              onEdit={() => openEdit(s)}
              onDelete={() => removeStudent(s)}
              onInvite={() => sendInvite(s)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] rounded-none border-[#09090B] p-0 flex flex-col overflow-hidden"
          data-testid="student-dialog"
        >
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <div className="eyebrow">{editing ? "EDIT / STUDENT" : "NEW / STUDENT"}</div>
            <DialogTitle className="font-display text-2xl tracking-tight">
              {editing ? "Edit student" : "Add student"}
            </DialogTitle>
            <DialogDescription className="text-[#71717A]">
              Store measurements, sizes and notes. Photo and email are optional.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-2 space-y-5">
              {/* Photo + Name row */}
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 image-empty border border-[#E4E4E7] overflow-hidden flex items-center justify-center shrink-0">
                  {form.image_id ? (
                    <img
                      src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${form.image_id}`}
                      alt="Student"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="h-8 w-8 text-[#A1A1AA]" strokeWidth={1.5} />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input type="file" accept="image/*" onChange={uploadPhoto} className="hidden" id="student-photo" data-testid="student-photo-file" />
                    <label htmlFor="student-photo" className="cursor-pointer inline-flex items-center gap-2 border border-[#09090B] text-[#09090B] hover:bg-[#F4F4F5] h-9 px-3 text-xs">
                      <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : (form.image_id ? "Replace photo" : "Upload photo")}
                    </label>
                    {form.image_id && (
                      <button type="button" onClick={() => setForm({ ...form, image_id: null })} className="text-xs text-[#EF4444] hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="eyebrow">FIRST NAME *</Label>
                      <Input data-testid="student-first-name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="rounded-none border-[#E4E4E7] h-10 mt-1" />
                    </div>
                    <div>
                      <Label className="eyebrow">LAST NAME</Label>
                      <Input data-testid="student-last-name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="rounded-none border-[#E4E4E7] h-10 mt-1" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact + basic */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="eyebrow">EMAIL (OPTIONAL — FOR INVITE)</Label>
                  <Input type="email" data-testid="student-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="student@example.com" className="rounded-none border-[#E4E4E7] h-10 mt-1" />
                </div>
                <div>
                  <Label className="eyebrow">PHONE</Label>
                  <Input data-testid="student-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-none border-[#E4E4E7] h-10 mt-1" />
                </div>
                <div>
                  <Label className="eyebrow">GRADE / YEAR</Label>
                  <Input data-testid="student-grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="e.g. 10th, Senior" className="rounded-none border-[#E4E4E7] h-10 mt-1" />
                </div>
                <div>
                  <Label className="eyebrow">PRONOUNS</Label>
                  <Input data-testid="student-pronouns" value={form.pronouns} onChange={(e) => setForm({ ...form, pronouns: e.target.value })} placeholder="e.g. she/her" className="rounded-none border-[#E4E4E7] h-10 mt-1" />
                </div>
              </div>

              {/* Measurements */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="eyebrow">MEASUREMENTS</Label>
                  <button type="button" onClick={() => addCustomField("measurement")} className="text-xs text-[#09090B] hover:underline flex items-center gap-1" data-testid="add-measurement-btn">
                    <Plus className="h-3 w-3" /> Add measurement
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(form.measurements).map(([k, v]) => (
                    <div key={k} className="relative">
                      <Label className="text-[10px] font-mono-label text-[#71717A]">{k.toUpperCase()}</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          data-testid={`student-m-${k.replace(/\W+/g, "-")}`}
                          value={v}
                          onChange={(e) => setMeasurement(k, e.target.value)}
                          className="rounded-none border-[#E4E4E7] h-9 mt-1 flex-1"
                        />
                        {!config.measurement_keys.includes(k) && (
                          <button type="button" onClick={() => removeField("measurement", k)} className="text-[#71717A] hover:text-[#EF4444] mt-1" title="Remove field">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sizes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="eyebrow">SIZES</Label>
                  <button type="button" onClick={() => addCustomField("size")} className="text-xs text-[#09090B] hover:underline flex items-center gap-1" data-testid="add-size-btn">
                    <Plus className="h-3 w-3" /> Add size
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(form.sizes).map(([k, v]) => (
                    <div key={k}>
                      <Label className="text-[10px] font-mono-label text-[#71717A]">{k.toUpperCase()}</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          data-testid={`student-s-${k.replace(/\W+/g, "-")}`}
                          value={v}
                          onChange={(e) => setSize(k, e.target.value)}
                          className="rounded-none border-[#E4E4E7] h-9 mt-1 flex-1"
                        />
                        {!config.size_keys.includes(k) && (
                          <button type="button" onClick={() => removeField("size", k)} className="text-[#71717A] hover:text-[#EF4444] mt-1" title="Remove field">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label className="eyebrow">NOTES</Label>
                <Textarea
                  data-testid="student-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Fabric sensitivities, injuries, quick-change notes…"
                  className="rounded-none border-[#E4E4E7] mt-1"
                />
              </div>

              {editing && (
                <div className="border border-[#E4E4E7] p-3 bg-[#FAFAFA] flex items-center gap-3">
                  {students.find((x) => x.id === editing)?.invited ? (
                    <>
                      <MailCheck className="h-4 w-4 text-[#10B981]" />
                      <div className="flex-1 text-xs text-[#52525B]">
                        Invite queued. Delivery activates when authentication is enabled.
                      </div>
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 text-[#71717A]" />
                      <div className="flex-1 text-xs text-[#52525B]">
                        Send this student a sign-up invite email (works once accounts are turned on).
                      </div>
                      <Button
                        type="button"
                        disabled={inviteBusy || !form.email}
                        onClick={() => sendInvite({ id: editing, email: form.email })}
                        variant="outline"
                        data-testid="student-invite-btn"
                        className="rounded-none h-9"
                      >
                        {inviteBusy ? "Sending…" : "Send invite"}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 px-6 py-4 border-t border-[#E4E4E7] bg-white shrink-0 flex items-center justify-between">
              {editing ? (
                <button
                  type="button"
                  onClick={async () => {
                    setDialogOpen(false);
                    await new Promise((r) => setTimeout(r, 60));
                    removeStudent({ id: editing, first_name: form.first_name, last_name: form.last_name });
                  }}
                  className="inline-flex items-center gap-1 text-[#EF4444] hover:underline text-sm"
                  data-testid="student-delete-btn"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="rounded-none h-11">Cancel</Button>
                <Button type="submit" disabled={saving} data-testid="student-save-btn" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6">
                  {saving ? "Saving…" : (editing ? "Save changes" : "Add student")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fullName(s) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || s.display_name || "Unnamed";
}

function Stat({ label, value, testId }) {
  return (
    <div className="p-4" data-testid={testId}>
      <div className="text-[10px] font-mono-label tracking-widest text-[#71717A]">{label.toUpperCase()}</div>
      <div className="font-display text-3xl font-semibold text-[#09090B] tabular-nums mt-1">{value}</div>
    </div>
  );
}

function StudentCard({ student, onEdit, onDelete, onInvite }) {
  const s = student;
  return (
    <div className="bg-white p-4 hover:bg-[#FAFAFA] transition-colors group relative" data-testid={`student-card-${s.id}`}>
      <button
        type="button"
        onClick={onEdit}
        className="block w-full text-left"
      >
        <div className="aspect-square image-empty overflow-hidden mb-3 flex items-center justify-center">
          {s.image_id ? (
            <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${s.image_id}`} alt={fullName(s)} className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="h-10 w-10 text-[#A1A1AA]" strokeWidth={1.5} />
          )}
        </div>
        <div className="font-display font-semibold text-[#09090B] truncate">{fullName(s)}</div>
        <div className="text-xs text-[#71717A] truncate">
          {s.grade || s.pronouns || "—"}
        </div>
        {/* Key sizes preview */}
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(s.sizes || {}).filter(([, v]) => (v || "").trim()).slice(0, 4).map(([k, v]) => (
            <span key={k} className="text-[10px] font-mono-label text-[#52525B] bg-[#F4F4F5] px-1.5 py-0.5">
              {k}: {v}
            </span>
          ))}
        </div>
      </button>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="bg-white/95 border border-[#E4E4E7] hover:border-[#09090B] p-1.5 shadow-sm"
          title="Edit"
          data-testid={`student-edit-${s.id}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="bg-white/95 border border-[#E4E4E7] hover:border-[#EF4444] hover:text-[#EF4444] p-1.5 shadow-sm"
          title="Delete"
          data-testid={`student-delete-inline-${s.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {s.email && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-[#71717A]">
          {s.invited ? <MailCheck className="h-3 w-3 text-[#10B981]" /> : <Mail className="h-3 w-3" />}
          <span className="truncate">{s.email}</span>
          {s.invited && <span className="ml-auto text-[#10B981]">invited</span>}
        </div>
      )}
    </div>
  );
}
