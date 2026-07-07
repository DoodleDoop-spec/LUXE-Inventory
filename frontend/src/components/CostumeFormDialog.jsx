import { useEffect, useRef, useState, useMemo } from "react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Upload, Image as ImageIcon, X, StickyNote, Flag, Plus } from "lucide-react";

export default function CostumeFormDialog({
  open, onOpenChange, editing, categories, locations, sizingSystems, shows, groups, onSaved,
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [subcategoryPath, setSubcategoryPath] = useState([]); // array of subcategory ids
  const [systemName, setSystemName] = useState("Letter");
  const [locMode, setLocMode] = useState("preset");
  const [locPath, setLocPath] = useState([]); // array of location ids representing chosen path
  const [subLocation, setSubLocation] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [sizes, setSizes] = useState({});
  const [sizeNotes, setSizeNotes] = useState({});
  const [openSizeNote, setOpenSizeNote] = useState(null);
  const [imageId, setImageId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [creator, setCreator] = useState("");
  const [originalShowId, setOriginalShowId] = useState("");
  const [additionalShowIds, setAdditionalShowIds] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [kwInput, setKwInput] = useState("");
  const [groupId, setGroupId] = useState("");
  const [variantLabel, setVariantLabel] = useState("");
  const fileRef = useRef(null);

  const currentSystem = useMemo(
    () => (sizingSystems || []).find((s) => s.name === systemName),
    [sizingSystems, systemName]
  );
  const sizeKeys = currentSystem?.sizes || [];
  const total = sizeKeys.reduce((acc, s) => acc + (Number(sizes[s]) || 0), 0);

  const currentCategory = useMemo(
    () => (categories || []).find((c) => c.name === category),
    [categories, category]
  );
  const subcatNodes = currentCategory?.subcategories || [];
  const subcatById = useMemo(() => {
    const m = {};
    for (const s of subcatNodes) m[s.id] = s;
    return m;
  }, [subcatNodes]);
  const subcatChildrenOf = (parentId) => subcatNodes.filter((s) => (s.parent_id || null) === parentId);
  const subcatLevels = useMemo(() => {
    const arr = [];
    let parentId = null;
    for (let i = 0; i <= subcategoryPath.length; i++) {
      const opts = subcatChildrenOf(parentId);
      if (opts.length === 0) break;
      arr.push({ parentId, options: opts, selected: subcategoryPath[i] || "" });
      parentId = subcategoryPath[i] || null;
      if (!parentId) break;
    }
    return arr;
  }, [subcategoryPath, subcatNodes]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosenSubcategoryPath = subcategoryPath.length
    ? subcategoryPath.map((id) => subcatById[id]?.name).filter(Boolean).join(" / ")
    : "";
  const selectSubcatLevel = (level, value) => {
    const next = subcategoryPath.slice(0, level);
    if (value) next.push(value);
    setSubcategoryPath(next);
  };

  // Location tree helpers
  const locById = useMemo(() => {
    const m = {};
    for (const l of (locations || [])) m[l.id] = l;
    return m;
  }, [locations]);
  const childrenOf = (parentId) => (locations || []).filter((l) => (l.parent_id || null) === parentId);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name || "");
      setCategory(editing.category || "");
      setNewCategory("");
      setSubcategoryPath([]);
      setSystemName(editing.sizing_system || "Letter");
      // Try to reconstruct locPath from stored location path
      const match = (locations || []).find((l) => l.path === editing.location);
      if (match) {
        setLocMode("preset");
        const chain = [];
        let cur = match;
        while (cur) {
          chain.unshift(cur.id);
          cur = cur.parent_id ? locById[cur.parent_id] : null;
        }
        setLocPath(chain);
        setCustomLocation("");
      } else {
        setLocMode("custom");
        setLocPath([]);
        setCustomLocation(editing.location || "");
      }
      setSubLocation(editing.sub_location || "");
      setNotes(editing.notes || "");
      setSizes(editing.sizes || {});
      setSizeNotes(editing.size_notes || {});
      setImageId(editing.image_id || null);
      setIsFlagged(!!editing.is_flagged);
      setFlagReason(editing.flag_reason || "");
      setCreator(editing.creator || "");
      setOriginalShowId(editing.original_show_id || "");
      setAdditionalShowIds(editing.additional_show_ids || []);
      setKeywords(editing.keywords || []);
      setGroupId(editing.group_id || "");
      setVariantLabel(editing.variant_label || "");
    } else {
      setName(""); setCategory(""); setNewCategory("");
      setSystemName("Letter");
      setLocMode("preset"); setLocPath([]); setSubLocation(""); setCustomLocation("");
      setNotes("");
      setSizes({});
      setSizeNotes({});
      setImageId(null);
      setIsFlagged(false);
      setFlagReason("");
      setCreator("");
      setOriginalShowId("");
      setAdditionalShowIds([]);
      setKeywords([]);
      setGroupId("");
      setVariantLabel("");
    }
    setOpenSizeNote(null);
    setKwInput("");
  }, [open, editing, locations, locById]);

  useEffect(() => {
    if (!sizeKeys.length) return;
    setSizes((prev) => {
      const next = {};
      for (const k of sizeKeys) next[k] = Number(prev?.[k] || 0);
      return next;
    });
    setSizeNotes((prev) => {
      const next = {};
      for (const k of sizeKeys) next[k] = prev?.[k] || "";
      return next;
    });
  }, [systemName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconstruct subcategoryPath from editing.subcategory (string like "Formal / Long")
  useEffect(() => {
    if (!open || !editing?.subcategory || subcatNodes.length === 0) return;
    const parts = editing.subcategory.split(" / ").map((p) => p.trim());
    const ids = [];
    let parentId = null;
    for (const partName of parts) {
      const match = subcatNodes.find((s) => (s.parent_id || null) === parentId && s.name === partName);
      if (!match) break;
      ids.push(match.id);
      parentId = match.id;
    }
    if (ids.length) setSubcategoryPath(ids);
  }, [open, editing, subcatNodes]);

  // Hierarchical location select
  const selectAtLevel = (level, value) => {
    const nextPath = locPath.slice(0, level);
    if (value) nextPath.push(value);
    setLocPath(nextPath);
  };

  const levels = useMemo(() => {
    const arr = [];
    let parentId = null;
    for (let i = 0; i <= locPath.length; i++) {
      const opts = childrenOf(parentId);
      if (opts.length === 0) break;
      arr.push({ parentId, options: opts, selected: locPath[i] || "" });
      parentId = locPath[i] || null;
      if (!parentId) break;
    }
    return arr;
  }, [locPath, locations]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosenLocationPath = locPath.length
    ? locPath.map((id) => locById[id]?.name).filter(Boolean).join(" / ")
    : "";

  const addKeyword = (raw) => {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    setKeywords((prev) => {
      const seen = new Set(prev.map((p) => p.toLowerCase()));
      const merged = [...prev];
      for (const p of parts) {
        if (!seen.has(p.toLowerCase())) { merged.push(p); seen.add(p.toLowerCase()); }
      }
      return merged;
    });
    setKwInput("");
  };
  const removeKeyword = (kw) => setKeywords((prev) => prev.filter((k) => k !== kw));

  const toggleAdditionalShow = (id) => {
    setAdditionalShowIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
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
    const finalLocation = (locMode === "custom" ? customLocation.trim() : chosenLocationPath);
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!finalCategory) { toast.error("Category is required"); return; }
    if (!finalLocation) { toast.error("Location is required"); return; }
    if (isFlagged && !flagReason.trim()) { toast.error("Flag reason is required"); return; }

    setSaving(true);
    try {
      if (category === "__new__" && newCategory.trim()) {
        try { await api.post("/categories", { name: newCategory.trim() }); } catch (err) { /* ignore */ }
      }
      const payload = {
        name: name.trim(),
        category: finalCategory,
        subcategory: chosenSubcategoryPath,
        location: finalLocation,
        sub_location: locMode === "preset" ? subLocation.trim() : "",
        notes: notes.trim(),
        sizing_system: systemName,
        sizes: Object.fromEntries(sizeKeys.map((s) => [s, Number(sizes[s]) || 0])),
        size_notes: Object.fromEntries(sizeKeys.map((s) => [s, (sizeNotes[s] || "").trim()])),
        keywords,
        creator: creator.trim(),
        original_show_id: originalShowId || null,
        additional_show_ids: additionalShowIds.filter((x) => x !== originalShowId),
        image_id: imageId,
        is_flagged: isFlagged,
        flag_reason: isFlagged ? flagReason.trim() : "",
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
            Fill out costume details, choose a location and sizing system.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-2">
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="c-name" className="eyebrow">NAME *</Label>
              <Input id="c-name" data-testid="form-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Victorian Ballgown" className="rounded-none border-[#E4E4E7] h-11" required />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">CATEGORY *</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategoryPath([]); }}>
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
                <Input data-testid="form-new-category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name" className="rounded-none border-[#E4E4E7] h-10 mt-2" />
              )}
            </div>
          </div>

          {category && category !== "__new__" && subcatNodes.length > 0 && (
            <div className="space-y-2">
              <Label className="eyebrow">SUBCATEGORY</Label>
              <div className="grid md:grid-cols-3 gap-2">
                {subcatLevels.map((lvl, i) => (
                  <Select
                    key={i}
                    value={lvl.selected || "__none__"}
                    onValueChange={(v) => selectSubcatLevel(i, v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger data-testid={`form-subcategory-level-${i}`} className="rounded-none border-[#E4E4E7] h-11">
                      <SelectValue placeholder={i === 0 ? "Choose subcategory" : "Nested (optional)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— {i === 0 ? "none" : "stop here"} —</SelectItem>
                      {lvl.options.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              </div>
              {chosenSubcategoryPath && (
                <p className="text-xs text-[#71717A]">Selected: <span className="font-medium text-[#09090B]">{chosenSubcategoryPath}</span></p>
              )}
            </div>
          )}

          {/* Location (hierarchical) */}
          <div className="space-y-2">
            <Label className="eyebrow">LOCATION *</Label>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                data-testid="loc-preset-btn"
                onClick={() => setLocMode("preset")}
                className={`text-xs px-3 py-1.5 border ${locMode === "preset" ? "bg-[#09090B] text-white border-[#09090B]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
              >
                Preset (nested)
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
              <div className="space-y-2">
                <div className="grid md:grid-cols-3 gap-2">
                  {levels.map((lvl, i) => (
                    <Select
                      key={i}
                      value={lvl.selected || "__none__"}
                      onValueChange={(v) => selectAtLevel(i, v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger data-testid={`form-location-level-${i}`} className="rounded-none border-[#E4E4E7] h-11">
                        <SelectValue placeholder={i === 0 ? "Choose location" : "Nested location (optional)"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— {i === 0 ? "none" : "stop here"} —</SelectItem>
                        {lvl.options.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
                <Input
                  data-testid="form-sub-location"
                  value={subLocation}
                  onChange={(e) => setSubLocation(e.target.value)}
                  placeholder="Extra sub-location text (optional)"
                  className="rounded-none border-[#E4E4E7] h-10"
                />
                {chosenLocationPath && (
                  <p className="text-xs text-[#71717A]">
                    Will be stored as: <span className="font-medium text-[#09090B]">{chosenLocationPath}{subLocation ? ` · ${subLocation}` : ""}</span>
                  </p>
                )}
              </div>
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

          {/* Sizing system + sizes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Label className="eyebrow">SIZING SYSTEM</Label>
                <Select value={systemName} onValueChange={setSystemName}>
                  <SelectTrigger data-testid="form-sizing-system" className="rounded-none border-[#E4E4E7] h-9 min-w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(sizingSystems || []).map((s) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-[#71717A]">
                Total: <span className="font-semibold text-[#09090B] tabular-nums" data-testid="form-total">{total}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
              {sizeKeys.length === 0 ? (
                <div className="bg-white p-4 col-span-full text-center text-sm text-[#71717A]">Select a sizing system.</div>
              ) : sizeKeys.map((s) => {
                const hasNote = (sizeNotes[s] || "").trim().length > 0;
                return (
                  <div key={s} className="bg-white p-3">
                    <div className="font-mono-label text-[10px] text-[#71717A] text-center mb-1">{s}</div>
                    <Input
                      data-testid={`form-size-${s}`}
                      type="number"
                      min="0"
                      value={sizes[s] ?? 0}
                      onChange={(e) => setSizes({ ...sizes, [s]: Math.max(0, Number(e.target.value) || 0) })}
                      className="rounded-none border-[#E4E4E7] h-10 text-center tabular-nums"
                    />
                    <button
                      type="button"
                      data-testid={`form-size-note-btn-${s}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenSizeNote((prev) => (prev === s ? null : s));
                      }}
                      className={`mt-1.5 w-full text-[10px] flex items-center justify-center gap-1 py-1 border ${hasNote ? "border-[#09090B] text-[#09090B] bg-[#F4F4F5]" : "border-[#E4E4E7] text-[#71717A]"} hover:border-[#09090B]`}
                    >
                      <StickyNote className="h-3 w-3" />
                      {hasNote ? "Note" : "+ Note"}
                    </button>
                  </div>
                );
              })}
            </div>
            {openSizeNote && (
              <div className="border border-[#09090B] p-3 bg-[#FAFAFA]" data-testid={`size-note-panel-${openSizeNote}`}>
                <div className="flex items-center justify-between mb-2">
                  <Label className="eyebrow">NOTE FOR SIZE {openSizeNote}</Label>
                  <button type="button" onClick={() => setOpenSizeNote(null)} className="text-[#71717A] hover:text-[#09090B]" aria-label="Close">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Textarea
                  data-testid={`form-size-note-${openSizeNote}`}
                  value={sizeNotes[openSizeNote] || ""}
                  onChange={(e) => setSizeNotes({ ...sizeNotes, [openSizeNote]: e.target.value })}
                  rows={2}
                  className="rounded-none border-[#E4E4E7]"
                />
              </div>
            )}
          </div>

          {/* Creator + Original show + Additional shows + Keywords */}
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="eyebrow">CREATOR</Label>
              <Input
                data-testid="form-creator"
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="rounded-none border-[#E4E4E7] h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">ORIGINAL SHOW</Label>
              <Select value={originalShowId || "__none__"} onValueChange={(v) => setOriginalShowId(v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="form-original-show" className="rounded-none border-[#E4E4E7] h-11">
                  <SelectValue placeholder="Select a show" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {(shows || []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}{s.year ? ` (${s.year})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(shows || []).length > 0 && (
            <div className="space-y-2">
              <Label className="eyebrow">ADDITIONAL SHOWS</Label>
              <div className="border border-[#E4E4E7] p-3 flex flex-wrap gap-2 max-h-40 overflow-y-auto" data-testid="form-additional-shows">
                {shows.filter((s) => s.id !== originalShowId).map((s) => {
                  const checked = additionalShowIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      data-testid={`form-add-show-${s.id}`}
                      onClick={() => toggleAdditionalShow(s.id)}
                      className={`text-xs px-2 py-1 border ${checked ? "bg-[#09090B] text-white border-[#09090B]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
                    >
                      {s.name}{s.year ? ` · ${s.year}` : ""}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[#A1A1AA]">Click to toggle. Selected shows are highlighted.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="eyebrow">KEYWORDS</Label>
            <div className="border border-[#E4E4E7] min-h-11 flex items-center flex-wrap gap-1 px-2 py-1.5">
              {keywords.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 bg-[#F4F4F5] border border-[#E4E4E7] px-2 py-0.5 text-xs" data-testid={`form-kw-chip-${kw}`}>
                  {kw}
                  <button type="button" onClick={() => removeKeyword(kw)} className="text-[#71717A] hover:text-[#09090B]" aria-label={`Remove ${kw}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                data-testid="form-kw-input"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKeyword(kwInput); }
                  else if (e.key === "Backspace" && !kwInput && keywords.length) setKeywords(keywords.slice(0, -1));
                }}
                onBlur={() => kwInput.trim() && addKeyword(kwInput)}
                placeholder={keywords.length ? "" : "e.g. red, sequin"}
                className="flex-1 min-w-[100px] text-sm focus:outline-none py-1"
              />
            </div>
            <p className="text-xs text-[#A1A1AA]">Press Enter or comma to add. Backspace removes last.</p>
          </div>

          {/* Group assignment */}
          <div className="border border-[#E4E4E7] p-4 space-y-2">
            <Label className="eyebrow">INVENTORY GROUP</Label>
            <div className="grid md:grid-cols-2 gap-2">
              <Select value={groupId || "__none__"} onValueChange={(v) => setGroupId(v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="form-group" className="rounded-none border-[#E4E4E7] h-11">
                  <SelectValue placeholder="No group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No group —</SelectItem>
                  {(groups || []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                data-testid="form-variant-label"
                value={variantLabel}
                onChange={(e) => setVariantLabel(e.target.value)}
                placeholder="Variant label (e.g. Red, Blue)"
                disabled={!groupId}
                className="rounded-none border-[#E4E4E7] h-11"
              />
            </div>
            <p className="text-xs text-[#A1A1AA]">Assign this piece to a group of variants (same item, different colors, etc.).</p>
          </div>

          {/* Flag */}
          <div className="border border-[#E4E4E7] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flag className={`h-4 w-4 ${isFlagged ? "text-[#EF4444]" : "text-[#71717A]"}`} fill={isFlagged ? "currentColor" : "none"} />
                <Label className="eyebrow">FLAG THIS COSTUME</Label>
              </div>
              <Switch data-testid="form-flag-switch" checked={isFlagged} onCheckedChange={setIsFlagged} />
            </div>
            {isFlagged && (
              <Textarea data-testid="form-flag-reason" value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder="Reason (e.g. Loaned to Company X until 15 April)" rows={2} required className="rounded-none border-[#E4E4E7]" />
            )}
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
                <Button type="button" data-testid="form-upload-btn" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-none border-[#09090B] h-10">
                  <Upload className="h-4 w-4 mr-1" />
                  {uploading ? "Uploading…" : imageId ? "Replace photo" : "Upload photo"}
                </Button>
                {imageId && (
                  <Button type="button" data-testid="form-remove-image" variant="ghost" onClick={() => setImageId(null)} className="rounded-none h-10 ml-2 text-[#EF4444]">
                    <X className="h-4 w-4 mr-1" /> Remove
                  </Button>
                )}
                <p className="text-xs text-[#A1A1AA]">JPG, PNG, WEBP up to 10MB.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="eyebrow">GENERAL NOTES</Label>
            <Textarea data-testid="form-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition, accessories, special instructions…" rows={3} className="rounded-none border-[#E4E4E7]" />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" data-testid="form-cancel-btn" onClick={() => onOpenChange(false)} className="rounded-none h-11">Cancel</Button>
            <Button type="submit" data-testid="form-save-btn" disabled={saving} className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6">
              {saving ? "Saving…" : editing ? "Save changes" : "Add Costume"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
