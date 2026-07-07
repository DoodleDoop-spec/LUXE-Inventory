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
import { toast } from "sonner";
import { Upload, Image as ImageIcon, X, StickyNote, Flag, Plus, LinkIcon, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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
  const [noteImageIds, setNoteImageIds] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingNote, setUploadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flags, setFlags] = useState([]); // array of {id?, category_id, note}
  const [flagCategories, setFlagCategories] = useState([]);
  const [creator, setCreator] = useState("");
  const [buyLink, setBuyLink] = useState("");
  const [originalShowId, setOriginalShowId] = useState("");
  const [additionalShowIds, setAdditionalShowIds] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [kwInput, setKwInput] = useState("");
  const [groupId, setGroupId] = useState("");
  const [variantLabel, setVariantLabel] = useState("");
  const [inUse, setInUse] = useState(false);
  const [inUseNote, setInUseNote] = useState("");
  const [newSubcatName, setNewSubcatName] = useState("");
  const [newLocMode, setNewLocMode] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [newLocParentId, setNewLocParentId] = useState("");
  const [addingShow, setAddingShow] = useState(false);
  const [newShowName, setNewShowName] = useState("");
  const [newShowYear, setNewShowYear] = useState("");
  const [similarCats, setSimilarCats] = useState([]);
  const fileRef = useRef(null);
  const noteFileRef = useRef(null);

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
      setNoteImageIds(editing.note_image_ids || []);
      setSizes(editing.sizes || {});
      setSizeNotes(editing.size_notes || {});
      setImageId(editing.image_id || null);
      setIsFlagged(!!editing.is_flagged);
      setFlagReason(editing.flag_reason || "");
      setFlags(editing.flags ? editing.flags.map((f) => ({ id: f.id, category_id: f.category_id, note: f.note || "", image_ids: f.image_ids || [] })) : []);
      setCreator(editing.creator || "");
      setBuyLink(editing.buy_link || "");
      setOriginalShowId(editing.original_show_id || "");
      setAdditionalShowIds(editing.additional_show_ids || []);
      setKeywords(editing.keywords || []);
      setGroupId(editing.group_id || "");
      setVariantLabel(editing.variant_label || "");
      setInUse(!!editing.in_use);
      setInUseNote(editing.in_use_note || "");
    } else {
      setName(""); setCategory(""); setNewCategory("");
      setSystemName("Letter");
      setLocMode("preset"); setLocPath([]); setSubLocation(""); setCustomLocation("");
      setNotes("");
      setNoteImageIds([]);
      setSizes({});
      setSizeNotes({});
      setImageId(null);
      setIsFlagged(false);
      setFlagReason("");
      setFlags([]);
      setCreator("");
      setBuyLink("");
      setOriginalShowId("");
      setAdditionalShowIds([]);
      setKeywords([]);
      setGroupId("");
      setVariantLabel("");
      setInUse(false);
      setInUseNote("");
    }
    setNewSubcatName("");
    setNewLocMode(false);
    setNewLocName("");
    setNewLocParentId("");
    setAddingShow(false);
    setNewShowName("");
    setNewShowYear("");
    setSimilarCats([]);
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

  // Load flag categories when dialog opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const r = await api.get("/flag-categories");
        setFlagCategories(r.data);
      } catch { /* ignore */ }
    })();
  }, [open]);

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

  const handleNoteImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingNote(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const fd = new FormData();
        fd.append("file", file);
        const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        setNoteImageIds((prev) => [...prev, r.data.image_id]);
      }
      toast.success(`Uploaded ${files.length} image${files.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploadingNote(false);
    if (noteFileRef.current) noteFileRef.current.value = "";
  };

  const uploadFlagImage = async (flagIdx, files) => {
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const fd = new FormData();
        fd.append("file", file);
        const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        setFlags((prev) => prev.map((f, i) => i === flagIdx
          ? { ...f, image_ids: [...(f.image_ids || []), r.data.image_id] }
          : f));
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
  };

  // Similar-category suggestion when adding a new one
  useEffect(() => {
    if (category !== "__new__" || !newCategory.trim() || newCategory.trim().length < 2) {
      setSimilarCats([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.get("/categories/similar", { params: { name: newCategory.trim() } });
        setSimilarCats(r.data || []);
      } catch { setSimilarCats([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [category, newCategory]);

  const createSubcategoryInline = async () => {
    const nm = newSubcatName.trim();
    if (!nm || !currentCategory) return;
    // Determine parent from last selected level (if any)
    const parentId = subcategoryPath.length ? subcategoryPath[subcategoryPath.length - 1] : null;
    try {
      const r = await api.post(`/categories/${currentCategory.id}/subcategories`, { name: nm, parent_id: parentId });
      toast.success("Subcategory created");
      setNewSubcatName("");
      // Append the new id to the path
      setSubcategoryPath((prev) => [...prev, r.data.id]);
      onSaved?.({ refresh_only: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add");
    }
  };

  const createLocationInline = async () => {
    const nm = newLocName.trim();
    if (!nm) return;
    try {
      const r = await api.post("/locations", { name: nm, parent_id: newLocParentId || null });
      toast.success("Location created");
      // Set as the current location (chain based on parent path + new id)
      const chain = [];
      let cur = r.data;
      const map = { ...locById, [r.data.id]: r.data };
      while (cur) {
        chain.unshift(cur.id);
        cur = cur.parent_id ? map[cur.parent_id] : null;
      }
      setLocPath(chain);
      setNewLocMode(false);
      setNewLocName("");
      setNewLocParentId("");
      onSaved?.({ refresh_only: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create location");
    }
  };

  const createShowInline = async () => {
    const nm = newShowName.trim();
    if (!nm) return;
    const yr = newShowYear.trim() ? parseInt(newShowYear, 10) : null;
    if (newShowYear.trim() && (isNaN(yr) || yr < 1800 || yr > 2200)) {
      toast.error("Year must be between 1800 and 2200");
      return;
    }
    try {
      const r = await api.post("/shows", { name: nm, year: yr });
      toast.success("Show created");
      setOriginalShowId(r.data.id);
      setAddingShow(false);
      setNewShowName("");
      setNewShowYear("");
      onSaved?.({ refresh_only: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create show");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalCategory = (category === "__new__" ? newCategory : category).trim();
    const finalLocation = (locMode === "custom" ? customLocation.trim() : chosenLocationPath);
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!finalCategory) { toast.error("Category is required"); return; }
    if (!finalLocation) { toast.error("Location is required"); return; }

    setSaving(true);
    try {
      if (category === "__new__" && newCategory.trim()) {
        try { await api.post("/categories", { name: newCategory.trim() }); } catch (err) { /* ignore */ }
      }
      const cleanedFlags = flags
        .filter((f) => f.category_id)
        .map((f) => ({
          id: f.id,
          category_id: f.category_id,
          note: (f.note || "").trim(),
          image_ids: [...(f.image_ids || [])],
        }));
      const payload = {
        name: name.trim(),
        category: finalCategory,
        subcategory: chosenSubcategoryPath,
        location: finalLocation,
        sub_location: locMode === "preset" ? subLocation.trim() : "",
        notes: notes.trim(),
        note_image_ids: [...noteImageIds],
        sizing_system: systemName,
        sizes: Object.fromEntries(sizeKeys.map((s) => [s, Number(sizes[s]) || 0])),
        size_notes: Object.fromEntries(sizeKeys.map((s) => [s, (sizeNotes[s] || "").trim()])),
        keywords,
        creator: creator.trim(),
        buy_link: buyLink.trim(),
        original_show_id: originalShowId || null,
        additional_show_ids: additionalShowIds.filter((x) => x !== originalShowId),
        image_id: imageId,
        is_flagged: isFlagged || cleanedFlags.length > 0,
        flag_reason: isFlagged ? flagReason.trim() : "",
        flags: cleanedFlags,
        group_id: groupId || null,
        variant_label: variantLabel.trim(),
        in_use: inUse,
        in_use_note: inUse ? inUseNote.trim() : "",
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
                <div className="space-y-2 mt-2">
                  <Input data-testid="form-new-category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name" className="rounded-none border-[#E4E4E7] h-10" />
                  {similarCats.length > 0 && (
                    <div className="border border-[#F59E0B] bg-[#FFFBEB] p-3" data-testid="similar-cats-warning">
                      <div className="eyebrow text-[#78350F] mb-1.5">SIMILAR CATEGORIES ALREADY EXIST</div>
                      <div className="flex flex-wrap gap-2">
                        {similarCats.map((sc) => (
                          <button
                            key={sc.id}
                            type="button"
                            data-testid={`similar-cat-${sc.id}`}
                            onClick={() => { setCategory(sc.name); setNewCategory(""); setSimilarCats([]); }}
                            className="inline-flex items-center gap-1.5 border border-[#78350F] px-2.5 py-1 text-xs bg-white hover:bg-[#FEF3C7]"
                          >
                            <span className="w-2 h-2" style={{ backgroundColor: sc.color }} />
                            Use &ldquo;{sc.name}&rdquo;
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#78350F] mt-2 font-mono-label">CLICK TO REUSE — AVOIDS DUPLICATE CATEGORIES</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {category && category !== "__new__" && currentCategory && (
            <div className="space-y-2">
              <Label className="eyebrow">SUBCATEGORY</Label>
              {subcatNodes.length > 0 && (
                <>
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
                </>
              )}
              <div className="flex gap-2">
                <Input
                  data-testid="form-new-subcategory"
                  value={newSubcatName}
                  onChange={(e) => setNewSubcatName(e.target.value)}
                  placeholder={
                    subcategoryPath.length > 0
                      ? `+ Add nested subcategory under "${subcatById[subcategoryPath[subcategoryPath.length - 1]]?.name || ""}"…`
                      : "+ Add a new subcategory to this category…"
                  }
                  className="rounded-none border-[#E4E4E7] h-10"
                />
                <Button
                  type="button"
                  data-testid="form-new-subcategory-add"
                  onClick={createSubcategoryInline}
                  disabled={!newSubcatName.trim()}
                  variant="outline"
                  className="rounded-none border-[#09090B] h-10"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Location (hierarchical) */}
          <div className="space-y-2">
            <Label className="eyebrow">LOCATION *</Label>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                data-testid="loc-preset-btn"
                onClick={() => { setLocMode("preset"); setNewLocMode(false); }}
                className={`text-xs px-3 py-1.5 border ${locMode === "preset" && !newLocMode ? "bg-[#09090B] text-white border-[#09090B]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
              >
                Preset (nested)
              </button>
              <button
                type="button"
                data-testid="loc-custom-btn"
                onClick={() => { setLocMode("custom"); setNewLocMode(false); }}
                className={`text-xs px-3 py-1.5 border ${locMode === "custom" && !newLocMode ? "bg-[#09090B] text-white border-[#09090B]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
              >
                Free text
              </button>
              <button
                type="button"
                data-testid="loc-new-btn"
                onClick={() => setNewLocMode((v) => !v)}
                className={`text-xs px-3 py-1.5 border ${newLocMode ? "bg-[#09090B] text-white border-[#09090B]" : "bg-white text-[#09090B] border-[#E4E4E7]"}`}
              >
                + New storage location
              </button>
            </div>
            {newLocMode ? (
              <div className="border border-[#E4E4E7] p-3 space-y-2 bg-[#FAFAFA]" data-testid="form-new-location">
                <div className="grid md:grid-cols-2 gap-2">
                  <Input
                    data-testid="form-new-location-name"
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                    placeholder="New location name (e.g. Backstage Rack C)"
                    className="rounded-none border-[#E4E4E7] h-10 bg-white"
                  />
                  <Select value={newLocParentId || "__none__"} onValueChange={(v) => setNewLocParentId(v === "__none__" ? "" : v)}>
                    <SelectTrigger data-testid="form-new-location-parent" className="rounded-none border-[#E4E4E7] h-10 bg-white">
                      <SelectValue placeholder="Nest under (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Top level —</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{"— ".repeat(l.depth || 0)}{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    data-testid="form-new-location-save"
                    onClick={createLocationInline}
                    disabled={!newLocName.trim()}
                    className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-9 text-white"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Create &amp; use
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setNewLocMode(false); setNewLocName(""); setNewLocParentId(""); }}
                    className="rounded-none h-9"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : locMode === "preset" ? (
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

          {/* Creator + Buy Link + Original show + Additional shows + Keywords */}
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
              <Label className="eyebrow">LINK TO BUY (OPTIONAL)</Label>
              <div className="relative">
                <LinkIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                <Input
                  type="url"
                  data-testid="form-buy-link"
                  value={buyLink}
                  onChange={(e) => setBuyLink(e.target.value)}
                  placeholder="Where to buy this piece"
                  className="rounded-none border-[#E4E4E7] h-11 pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">ORIGINAL SHOW</Label>
              {addingShow ? (
                <div className="border border-[#E4E4E7] p-3 space-y-2 bg-[#FAFAFA]" data-testid="form-new-show-inline">
                  <div className="grid md:grid-cols-2 gap-2">
                    <Input
                      data-testid="form-new-show-name"
                      value={newShowName}
                      onChange={(e) => setNewShowName(e.target.value)}
                      placeholder="Show name"
                      className="rounded-none border-[#E4E4E7] h-10 bg-white"
                    />
                    <Input
                      type="number"
                      min="1800"
                      max="2200"
                      data-testid="form-new-show-year"
                      value={newShowYear}
                      onChange={(e) => setNewShowYear(e.target.value)}
                      placeholder="Year (optional)"
                      className="rounded-none border-[#E4E4E7] h-10 bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      data-testid="form-new-show-save"
                      onClick={createShowInline}
                      disabled={!newShowName.trim()}
                      className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-9 text-white"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Create &amp; use
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setAddingShow(false); setNewShowName(""); setNewShowYear(""); }}
                      className="rounded-none h-9"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Select
                  value={originalShowId || "__none__"}
                  onValueChange={(v) => {
                    if (v === "__add_new__") { setAddingShow(true); return; }
                    setOriginalShowId(v === "__none__" ? "" : v);
                  }}
                >
                  <SelectTrigger data-testid="form-original-show" className="rounded-none border-[#E4E4E7] h-11">
                    <SelectValue placeholder="Select a show" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(shows || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}{s.year ? ` (${s.year})` : ""}</SelectItem>
                    ))}
                    <SelectItem value="__add_new__">+ Add new show…</SelectItem>
                  </SelectContent>
                </Select>
              )}
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

          {/* Flags (multi) */}
          <div className="border border-[#E4E4E7] p-4 space-y-3" data-testid="form-flags-section">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Flag className={`h-4 w-4 ${flags.length > 0 ? "text-[#EF4444]" : "text-[#71717A]"}`} fill={flags.length > 0 ? "currentColor" : "none"} />
                <Label className="eyebrow">FLAGS</Label>
                {flags.length > 0 && (
                  <span className="text-xs text-[#71717A] tabular-nums">{flags.length} attached</span>
                )}
              </div>
              <FlagAddSelect
                categories={flagCategories}
                onAdd={(cid) => setFlags((prev) => [...prev, { category_id: cid, note: "" }])}
              />
            </div>
            {flags.length === 0 ? (
              <p className="text-xs text-[#A1A1AA]">
                No flags attached. Use flags to mark states like <em>On Loan</em>, <em>Needs Repair</em>, etc.
                Manage flag types in the Flags tab.
              </p>
            ) : (
              <div className="space-y-2">
                {flags.map((f, idx) => {
                  const cat = flagCategories.find((c) => c.id === f.category_id);
                  return (
                    <div key={idx} className="border border-[#E4E4E7] p-3" data-testid={`form-flag-${idx}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3"
                            style={{ backgroundColor: cat?.color || "#71717A" }}
                            data-testid={`form-flag-color-${idx}`}
                          />
                          <span className="font-medium text-sm text-[#09090B]">{cat?.name || "Unknown flag"}</span>
                        </div>
                        <button
                          type="button"
                          data-testid={`form-flag-remove-${idx}`}
                          onClick={() => setFlags((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-[#EF4444] hover:bg-[#FEF2F2] p-1"
                          aria-label="Remove flag"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <Textarea
                        data-testid={`form-flag-note-${idx}`}
                        value={f.note || ""}
                        onChange={(e) => setFlags((prev) => prev.map((x, i) => i === idx ? { ...x, note: e.target.value } : x))}
                        rows={2}
                        placeholder="Note for this flag (e.g. Loaned to Company X until 15 April)"
                        className="rounded-none border-[#E4E4E7] text-sm"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <label htmlFor={`form-flag-image-input-${idx}`}>
                          <input
                            id={`form-flag-image-input-${idx}`}
                            data-testid={`form-flag-image-input-${idx}`}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; uploadFlagImage(idx, files); }}
                            className="hidden"
                          />
                          <span className="inline-flex items-center gap-1 border border-[#09090B] text-[#09090B] hover:bg-[#F4F4F5] px-2.5 py-1 text-xs cursor-pointer">
                            <Upload className="h-3 w-3" /> Attach image
                          </span>
                        </label>
                        {(f.image_ids || []).length > 0 && (
                          <span className="text-[10px] text-[#71717A] tabular-nums">{f.image_ids.length} attached</span>
                        )}
                      </div>
                      {(f.image_ids || []).length > 0 && (
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2" data-testid={`form-flag-image-grid-${idx}`}>
                          {(f.image_ids || []).map((iid, i2) => (
                            <div key={i2} className="relative group aspect-square border border-[#E4E4E7]">
                              <img
                                src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${iid}`}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                data-testid={`form-flag-image-remove-${idx}-${i2}`}
                                onClick={() => setFlags((prev) => prev.map((x, i) => i === idx
                                  ? { ...x, image_ids: (x.image_ids || []).filter((_, k) => k !== i2) }
                                  : x))}
                                className="absolute top-1 right-1 bg-white/95 border border-[#E4E4E7] p-1 opacity-0 group-hover:opacity-100 hover:border-[#EF4444] hover:text-[#EF4444]"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
            <div className="flex items-center gap-2">
              <input
                ref={noteFileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleNoteImageUpload}
                className="hidden"
                data-testid="form-note-image-input"
              />
              <Button
                type="button"
                variant="outline"
                data-testid="form-note-image-btn"
                onClick={() => noteFileRef.current?.click()}
                disabled={uploadingNote}
                className="rounded-none h-9 border-[#09090B]"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {uploadingNote ? "Uploading…" : "Attach image to notes"}
              </Button>
              {noteImageIds.length > 0 && (
                <span className="text-xs text-[#71717A] tabular-nums">{noteImageIds.length} attached</span>
              )}
            </div>
            {noteImageIds.length > 0 && (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2" data-testid="form-note-image-grid">
                {noteImageIds.map((iid, idx) => (
                  <div key={idx} className="relative group aspect-square border border-[#E4E4E7]" data-testid={`form-note-image-${idx}`}>
                    <img
                      src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${iid}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      data-testid={`form-note-image-remove-${idx}`}
                      onClick={() => setNoteImageIds((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 bg-white/95 border border-[#E4E4E7] p-1 opacity-0 group-hover:opacity-100 hover:border-[#EF4444] hover:text-[#EF4444]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Currently in use */}
          <div className="border border-[#E4E4E7] p-4 space-y-3" data-testid="form-in-use-section">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Sparkles className={`h-4 w-4 ${inUse ? "text-[#10B981]" : "text-[#71717A]"}`} />
                <Label className="eyebrow">CURRENTLY IN USE</Label>
              </div>
              <Switch
                data-testid="form-in-use-switch"
                checked={inUse}
                onCheckedChange={setInUse}
              />
            </div>
            {inUse && (
              <div className="space-y-2">
                <Textarea
                  data-testid="form-in-use-note"
                  value={inUseNote}
                  onChange={(e) => setInUseNote(e.target.value)}
                  rows={2}
                  placeholder="Optional context (e.g. On stage for run of Hairspray, Feb 5–20)"
                  className="rounded-none border-[#E4E4E7]"
                />
                <p className="text-[10px] text-[#A1A1AA] font-mono-label">
                  ITEMS &ldquo;IN USE&rdquo; ARE HIGHLIGHTED ON THE DASHBOARD.
                </p>
              </div>
            )}
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


function FlagAddSelect({ categories, onAdd }) {
  return (
    <Select value="__none__" onValueChange={(v) => { if (v && v !== "__none__") onAdd(v); }}>
      <SelectTrigger data-testid="form-flag-add-select" className="rounded-none border-[#09090B] h-9 w-[220px] text-sm">
        <SelectValue placeholder="+ Attach flag" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__" disabled>+ Attach flag…</SelectItem>
        {(categories || []).map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
          </SelectItem>
        ))}
        {(!categories || categories.length === 0) && (
          <SelectItem value="__empty__" disabled>No flag types — create some in the Flags tab</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
