import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Image as ImageIcon, X } from "lucide-react";

const SIZES = ["XS", "S", "M", "L", "XL"];
const CUSTOM_LOC = "__custom__";

export default function CostumeFormDialog({ open, onOpenChange, editing, categories, locations, onSaved }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [locMode, setLocMode] = useState("preset");
  const [presetLocation, setPresetLocation] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [sizes, setSizes] = useState(Object.fromEntries(SIZES.map((s) => [s, 0])));
  const [imageId, setImageId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name || "");
      setCategory(editing.category || "");
      setNewCategory("");
      const presetMatch = locations?.find((l) => l.name === editing.location);
      if (presetMatch) {
        setLocMode("preset");
        setPresetLocation(editing.location);
        setCustomLocation("");
      } else {
        setLocMode("custom");
        setPresetLocation("");
        setCustomLocation(editing.location || "");
      }
      setNotes(editing.notes || "");
      setSizes({ ...Object.fromEntries(SIZES.map((s) => [s, 0])), ...(editing.sizes || {}) });
      setImageId(editing.image_id || null);
    } else {
      setName(""); setCategory(""); setNewCategory("");
      setLocMode("preset"); setPresetLocation(""); setCustomLocation("");
      setNotes("");
      setSizes(Object.fromEntries(SIZES.map((s) => [s, 0])));
      setImageId(null);
    }
  }, [open, editing, locations]);

  const total = SIZES.reduce((acc, s) => acc + (Number(sizes[s]) || 0), 0);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImageId(r.data.image_id);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalCategory = (category === "__new__" ? newCategory : category).trim();
    const finalLocation = (locMode === "custom" ? customLocation : presetLocation).trim();
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!finalCategory) { toast.error("Category is required"); return; }
    if (!finalLocation) { toast.error("Location is required"); return; }

    setSaving(true);
    try {
      // If new category, create it first
      if (category === "__new__" && newCategory.trim()) {
        try { await api.post("/categories", { name: newCategory.trim() }); } catch (err) { /* category may already exist */ }
      }
      const payload = {
        name: name.trim(),
        category: finalCategory,
        location: finalLocation,
        notes: notes.trim(),
        sizes: Object.fromEntries(SIZES.map((s) => [s, Number(sizes[s]) || 0])),
        image_id: imageId,
      };
      if (editing) {
        await api.put(`/costumes/${editing.id}`, payload);
        toast.success("Costume updated");
      } else {
        await api.post("/costumes", payload);
        toast.success("Costume added");
      }
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Save failed");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-none border-[#09090B] max-h-[90vh] overflow-y-auto" data-testid="costume-form-dialog">
        <DialogHeader>
          <div className="eyebrow">{editing ? "EDIT / RECORD" : "NEW / RECORD"}</div>
          <DialogTitle className="font-display text-2xl tracking-tight">
            {editing ? "Edit Costume" : "Add Costume"}
          </DialogTitle>
          <DialogDescription className="text-[#71717A]">
            Fill out costume details, set quantities per size, and optionally upload a photo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-2">
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="c-name" className="eyebrow">NAME *</Label>
              <Input
                id="c-name"
                data-testid="form-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Victorian Ballgown"
                className="rounded-none border-[#E4E4E7] h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">CATEGORY *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="form-category" className="rounded-none border-[#E4E4E7] h-11">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Add new category…</SelectItem>
                </SelectContent>
              </Select>
              {category === "__new__" && (
                <Input
                  data-testid="form-new-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name"
                  className="rounded-none border-[#E4E4E7] h-10 mt-2"
                />
              )}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label className="eyebrow">LOCATION *</Label>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                data-testid="loc-preset-btn"
                onClick={() => setLocMode("preset")}
                className={`text-xs px-3 py-1.5 border ${locMode === "preset" ? "bg-[#09090B] text-white border-[#09090B]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
              >
                Preset
              </button>
              <button
                type="button"
                data-testid="loc-custom-btn"
                onClick={() => setLocMode("custom")}
                className={`text-xs px-3 py-1.5 border ${locMode === "custom" ? "bg-[#09090B] text-white border-[#09090B]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
              >
                Custom
              </button>
            </div>
            {locMode === "preset" ? (
              <Select value={presetLocation} onValueChange={setPresetLocation}>
                <SelectTrigger data-testid="form-location-preset" className="rounded-none border-[#E4E4E7] h-11">
                  <SelectValue placeholder="Select a location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                data-testid="form-location-custom"
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="e.g. Storage Room A, Shelf 3"
                className="rounded-none border-[#E4E4E7] h-11"
              />
            )}
          </div>

          {/* Sizes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="eyebrow">QUANTITY PER SIZE</Label>
              <div className="text-sm text-[#71717A]">
                Total: <span className="font-semibold text-[#09090B] tabular-nums" data-testid="form-total">{total}</span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
              {SIZES.map((s) => (
                <div key={s} className="bg-white p-3">
                  <div className="font-mono-label text-[10px] text-[#71717A] text-center mb-1">{s}</div>
                  <Input
                    data-testid={`form-size-${s}`}
                    type="number"
                    min="0"
                    value={sizes[s]}
                    onChange={(e) => setSizes({ ...sizes, [s]: Math.max(0, Number(e.target.value) || 0) })}
                    className="rounded-none border-[#E4E4E7] h-10 text-center tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Image upload */}
          <div className="space-y-2">
            <Label className="eyebrow">PHOTO</Label>
            <div className="flex items-start gap-4">
              <div className="w-28 h-28 image-empty border border-[#E4E4E7] flex items-center justify-center overflow-hidden shrink-0">
                {imageId ? (
                  <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${imageId}`} alt="" className="w-full h-full object-cover" data-testid="form-image-preview" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-[#A1A1AA]" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" data-testid="form-file-input" />
                <Button
                  type="button"
                  data-testid="form-upload-btn"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="rounded-none border-[#09090B] h-10"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {uploading ? "Uploading…" : imageId ? "Replace photo" : "Upload photo"}
                </Button>
                {imageId && (
                  <Button
                    type="button"
                    data-testid="form-remove-image"
                    variant="ghost"
                    onClick={() => setImageId(null)}
                    className="rounded-none h-10 ml-2 text-[#EF4444]"
                  >
                    <X className="h-4 w-4 mr-1" /> Remove
                  </Button>
                )}
                <p className="text-xs text-[#A1A1AA]">JPG, PNG, WEBP up to 10MB.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="eyebrow">NOTES</Label>
            <Textarea
              data-testid="form-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condition, accessories, special instructions…"
              rows={3}
              className="rounded-none border-[#E4E4E7]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="form-cancel-btn"
              onClick={() => onOpenChange(false)}
              className="rounded-none h-11"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="form-save-btn"
              disabled={saving}
              className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Add Costume"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
