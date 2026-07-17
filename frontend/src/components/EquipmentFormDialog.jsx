import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { X, Upload, Image as ImageIcon, Plus, LinkIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function EquipmentFormDialog({
  open, onOpenChange, editing, categories, sortingSystems, locations, onSaved, onCategoriesChanged, onSortingSystemsChanged,
}) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [locationVal, setLocationVal] = useState("");
  const [subLocation, setSubLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [creator, setCreator] = useState("");
  const [buyLink, setBuyLink] = useState("");
  const [systemName, setSystemName] = useState("");
  const [sizes, setSizes] = useState({});
  const [totalOverride, setTotalOverride] = useState(0);
  const [imageId, setImageId] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [kwInput, setKwInput] = useState("");
  const [inUse, setInUse] = useState(false);
  const [inUseNote, setInUseNote] = useState("");
  const [pinned, setPinned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingSortingSystem, setAddingSortingSystem] = useState(false);
  const [newSortingName, setNewSortingName] = useState("");
  const [newSortingSizes, setNewSortingSizes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name || "");
      setCategory(editing.category || "");
      setNewCategory("");
      setSubcategory(editing.subcategory || "");
      setLocationVal(editing.location || "");
      setSubLocation(editing.sub_location || "");
      setNotes(editing.notes || "");
      setCreator(editing.creator || "");
      setBuyLink(editing.buy_link || "");
      setSystemName(editing.sorting_system || "");
      setSizes(editing.sizes || {});
      setTotalOverride(Number(editing.total_quantity || 0));
      setImageId(editing.image_id || null);
      setKeywords(editing.keywords || []);
      setInUse(!!editing.in_use);
      setInUseNote(editing.in_use_note || "");
      setPinned(!!editing.pinned);
    } else {
      setName(""); setCategory(""); setNewCategory(""); setSubcategory("");
      setLocationVal(""); setSubLocation(""); setNotes(""); setCreator("");
      setBuyLink(""); setSystemName(""); setSizes({}); setTotalOverride(0);
      setImageId(null); setKeywords([]); setInUse(false); setInUseNote("");
      setPinned(false);
    }
    setAddingSortingSystem(false); setNewSortingName(""); setNewSortingSizes("");
    setKwInput("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const currentSys = sortingSystems.find((s) => s.name === systemName);
  const sizeKeys = currentSys?.sizes || [];
  const total = systemName ? Object.values(sizes || {}).reduce((a, b) => a + (Number(b) || 0), 0) : Number(totalOverride) || 0;

  const currentCategory = categories.find((c) => c.name === category);
  const subOptions = (currentCategory?.subcategories || []).filter((s) => !s.parent_id);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImageId(r.data.image_id);
      toast.success("Photo uploaded");
    } catch (err) { toast.error(err.response?.data?.detail || "Upload failed"); }
    setUploading(false);
    e.target.value = "";
  };

  const addKeyword = (val) => {
    const v = (val || "").trim();
    if (!v) return;
    if (!keywords.includes(v)) setKeywords([...keywords, v]);
    setKwInput("");
  };

  const createSortingSystemInline = async () => {
    const nm = newSortingName.trim();
    const sz = newSortingSizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!nm) { toast.error("Name required"); return; }
    if (!sz.length) { toast.error("At least one value"); return; }
    try {
      await api.post("/equipment-sorting-systems", { name: nm, sizes: sz });
      toast.success("Sorting system created");
      setSystemName(nm);
      setAddingSortingSystem(false);
      setNewSortingName(""); setNewSortingSizes("");
      onSortingSystemsChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name required"); return; }
    let finalCategory = category;
    if (category === "__new__") {
      const nc = newCategory.trim();
      if (!nc) { toast.error("Enter a category name"); return; }
      try {
        await api.post("/equipment-categories", { name: nc });
      } catch { /* ignore duplicate */ }
      finalCategory = nc;
      onCategoriesChanged?.();
    } else if (!finalCategory) {
      toast.error("Category required"); return;
    }
    if (!locationVal.trim()) { toast.error("Location required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category: finalCategory,
        subcategory: subcategory || "",
        location: locationVal.trim(),
        sub_location: subLocation.trim(),
        notes: notes.trim(),
        sorting_system: systemName || "",
        sizes: systemName ? Object.fromEntries(sizeKeys.map((k) => [k, Number(sizes[k]) || 0])) : {},
        total_quantity_override: systemName ? undefined : Math.max(0, Number(totalOverride) || 0),
        keywords,
        creator: creator.trim(),
        buy_link: buyLink.trim(),
        image_id: imageId,
        in_use: inUse,
        in_use_note: inUse ? inUseNote.trim() : "",
        pinned: !!pinned,
      };
      if (editing) {
        await api.put(`/equipment/${editing.id}`, payload);
        toast.success("Equipment updated");
      } else {
        await api.post("/equipment", payload);
        toast.success("Equipment added");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-none border-[#09090B]" data-testid="equipment-form-dialog">
        <DialogHeader>
          <div className="eyebrow">{editing ? "EDIT / EQUIPMENT" : "NEW / EQUIPMENT"}</div>
          <DialogTitle className="font-display text-2xl tracking-tight">{editing ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
          <DialogDescription className="text-[#71717A]">
            Track a piece of equipment — lights, cables, tools, props, mics, backstage gear.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Photo */}
          <div className="flex items-start gap-4">
            <div className="w-28 h-28 image-empty border border-[#E4E4E7] overflow-hidden flex items-center justify-center shrink-0">
              {imageId ? (
                <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${imageId}`} alt="preview" className="w-full h-full object-cover" />
              ) : <ImageIcon className="h-6 w-6 text-[#A1A1AA]" />}
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="equipment-file-input" data-testid="equipment-file-input" />
              <label htmlFor="equipment-file-input" className="cursor-pointer inline-flex items-center gap-2 border border-[#09090B] text-[#09090B] hover:bg-[#F4F4F5] h-10 px-4 text-sm w-fit">
                <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : (imageId ? "Replace photo" : "Upload photo")}
              </label>
              {imageId && (
                <button type="button" onClick={() => setImageId(null)} className="text-xs text-[#EF4444] hover:underline w-fit">
                  Remove photo
                </button>
              )}
            </div>
          </div>
          {/* Name + Category */}
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="eyebrow">NAME *</Label>
              <Input data-testid="equipment-form-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cable, 25 ft XLR" className="rounded-none border-[#E4E4E7] h-11" />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">CATEGORY *</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(""); }}>
                <SelectTrigger data-testid="equipment-form-category" className="rounded-none border-[#E4E4E7] h-11">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                  <SelectItem value="__new__">+ New category…</SelectItem>
                </SelectContent>
              </Select>
              {category === "__new__" && (
                <Input data-testid="equipment-new-category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name" className="rounded-none border-[#E4E4E7] h-10 mt-2" />
              )}
            </div>
          </div>
          {/* Subcategory */}
          {subOptions.length > 0 && category !== "__new__" && (
            <div className="space-y-2">
              <Label className="eyebrow">SUBCATEGORY</Label>
              <Select value={subcategory || "__none__"} onValueChange={(v) => setSubcategory(v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="equipment-form-subcategory" className="rounded-none border-[#E4E4E7] h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {subOptions.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Location */}
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="eyebrow">LOCATION *</Label>
              <Input data-testid="equipment-form-location" list="equipment-loc-list" value={locationVal} onChange={(e) => setLocationVal(e.target.value)} placeholder="e.g. Backstage / Cable Bin" className="rounded-none border-[#E4E4E7] h-11" />
              <datalist id="equipment-loc-list">
                {(locations || []).map((l) => <option key={l.id} value={l.path} />)}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">SUB-LOCATION</Label>
              <Input data-testid="equipment-form-sublocation" value={subLocation} onChange={(e) => setSubLocation(e.target.value)} placeholder="Shelf 3, Drawer C…" className="rounded-none border-[#E4E4E7] h-11" />
            </div>
          </div>
          {/* Sorting */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Label className="eyebrow">SORTING SYSTEM</Label>
                <Select value={systemName || "__none__"} onValueChange={(v) => {
                  if (v === "__add_new__") { setAddingSortingSystem(true); return; }
                  if (v === "__none__") { setSystemName(""); return; }
                  setSystemName(v);
                }}>
                  <SelectTrigger data-testid="equipment-form-sorting-system" className="rounded-none border-[#E4E4E7] h-9 min-w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None (single total) —</SelectItem>
                    {(sortingSystems || []).map((s) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                    <SelectItem value="__add_new__">+ New sorting system…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-[#71717A]">Total: <span className="font-semibold text-[#09090B] tabular-nums">{total}</span></div>
            </div>
            {addingSortingSystem && (
              <div className="border border-[#E4E4E7] p-3 space-y-2 bg-[#FAFAFA]">
                <div className="grid md:grid-cols-2 gap-2">
                  <Input value={newSortingName} onChange={(e) => setNewSortingName(e.target.value)} placeholder="System name" className="rounded-none border-[#E4E4E7] h-10 bg-white" />
                  <Input value={newSortingSizes} onChange={(e) => setNewSortingSizes(e.target.value)} placeholder="Values (comma-separated)" className="rounded-none border-[#E4E4E7] h-10 bg-white" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" onClick={createSortingSystemInline} className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-9 text-white">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Create &amp; use
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setAddingSortingSystem(false); }} className="rounded-none h-9">Cancel</Button>
                </div>
              </div>
            )}
            {!systemName ? (
              <div className="border border-[#E4E4E7] p-4 bg-white flex items-center gap-4">
                <Label className="eyebrow">TOTAL QUANTITY</Label>
                <Input type="number" min="0" data-testid="equipment-form-total-input" value={totalOverride} onChange={(e) => setTotalOverride(Math.max(0, Number(e.target.value) || 0))} className="rounded-none border-[#E4E4E7] h-10 w-32 text-center tabular-nums" />
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
                {sizeKeys.map((s) => (
                  <div key={s} className="bg-white p-2 text-center">
                    <div className="font-mono-label text-[10px] text-[#71717A]">{s}</div>
                    <Input type="number" min="0" value={sizes[s] || 0} onChange={(e) => setSizes({ ...sizes, [s]: Math.max(0, Number(e.target.value) || 0) })} className="rounded-none border-0 text-center h-8 p-1 tabular-nums" data-testid={`equipment-form-size-${s}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Creator + Buy Link */}
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="eyebrow">CREATOR / VENDOR</Label>
              <Input data-testid="equipment-form-creator" value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="e.g. Sennheiser" className="rounded-none border-[#E4E4E7] h-11" />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">LINK TO BUY</Label>
              <div className="relative">
                <LinkIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                <Input data-testid="equipment-form-buy-link" type="url" value={buyLink} onChange={(e) => setBuyLink(e.target.value)} placeholder="Where to reorder" className="rounded-none border-[#E4E4E7] h-11 pl-10" />
              </div>
            </div>
          </div>
          {/* Notes */}
          <div className="space-y-2">
            <Label className="eyebrow">NOTES</Label>
            <Textarea data-testid="equipment-form-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-none border-[#E4E4E7]" />
          </div>
          {/* Keywords */}
          <div className="space-y-2">
            <Label className="eyebrow">KEYWORDS</Label>
            <div className="border border-[#E4E4E7] p-2 flex flex-wrap gap-1">
              {keywords.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-[#F4F4F5] border border-[#E4E4E7]">
                  {k}
                  <button type="button" onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="hover:text-[#EF4444]">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <Input
                data-testid="equipment-form-keyword-input"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKeyword(kwInput); }
                  else if (e.key === "Backspace" && !kwInput && keywords.length) { setKeywords(keywords.slice(0, -1)); }
                }}
                placeholder="Type + Enter"
                className="rounded-none border-0 h-7 flex-1 min-w-[100px]"
              />
            </div>
          </div>
          {/* In use + Pinned */}
          <div className="border border-[#E4E4E7] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="eyebrow">CURRENTLY IN USE</Label>
                <p className="text-xs text-[#71717A] mt-1">Mark this piece as active/deployed right now.</p>
              </div>
              <Switch data-testid="equipment-form-in-use" checked={inUse} onCheckedChange={setInUse} />
            </div>
            {inUse && (
              <Textarea data-testid="equipment-form-in-use-note" value={inUseNote} onChange={(e) => setInUseNote(e.target.value)} rows={2} placeholder="Notes (optional)" className="rounded-none border-[#E4E4E7]" />
            )}
          </div>
          <div className="border border-[#E4E4E7] p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className={`h-4 w-4 ${pinned ? "text-[#F59E0B]" : "text-[#71717A]"}`} fill={pinned ? "currentColor" : "none"} />
              <div>
                <Label className="eyebrow">PIN TO DASHBOARD</Label>
                <p className="text-[10px] text-[#A1A1AA] font-mono-label mt-1">SHOWS ON THE EQUIPMENT SECTION.</p>
              </div>
            </div>
            <Switch data-testid="equipment-form-pin" checked={pinned} onCheckedChange={setPinned} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-none h-11">Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="equipment-form-save" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6">
              {saving ? "Saving…" : (editing ? "Save changes" : "Add equipment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
