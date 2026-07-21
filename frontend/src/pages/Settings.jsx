import { useEffect, useState, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { Plus, Trash2, Tag, Save, Ruler, ChevronDown, ChevronRight, X, Film, Upload, Image as ImageIcon, LinkIcon, Settings as SettingsIcon, MapPin, Pencil, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import LocationTree from "@/components/LocationTree";
import CollapsibleBox from "@/components/CollapsibleBox";

export default function Settings() {
  const { settings: globalSettings, updateSettings: pushSettings, refreshSettings } = useSettings();
  const confirm = useConfirm();
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState("");
  const [expandedCat, setExpandedCat] = useState({});
  const [sizingSystems, setSizingSystems] = useState([]);
  const [newSysName, setNewSysName] = useState("");
  const [newSysSizes, setNewSysSizes] = useState("");
  const [editingSys, setEditingSys] = useState(null);
  const [editSysName, setEditSysName] = useState("");
  const [editSysSizes, setEditSysSizes] = useState("");
  const [shows, setShows] = useState([]);
  const [newShowName, setNewShowName] = useState("");
  const [newShowYear, setNewShowYear] = useState("");
  const [editingShow, setEditingShow] = useState(null);
  const [editShowName, setEditShowName] = useState("");
  const [editShowYear, setEditShowYear] = useState("");
  const [editShowImageId, setEditShowImageId] = useState(null);
  const [expandedYear, setExpandedYear] = useState({});
  const [locations, setLocations] = useState([]);
  const [newLocRoot, setNewLocRoot] = useState("");
  const [settings, setSettings] = useState({ org_name: "", logo_image_id: null, default_view: "grid", show_flag_banner: true, hide_in_use_mode: "full" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);
  const [editShowLink, setEditShowLink] = useState("");
  const [editShowTimestamp, setEditShowTimestamp] = useState("");

  const fetchAll = async () => {
    const [c, s, sys, sh, locs] = await Promise.all([
      api.get("/categories"),
      api.get("/settings"),
      api.get("/sizing-systems"),
      api.get("/shows"),
      api.get("/locations"),
    ]);
    setCategories(c.data);
    setSettings(s.data);
    setSizingSystems(sys.data);
    setShows(sh.data);
    setLocations(locs.data);
  };

  useEffect(() => { fetchAll(); }, []);

  // Categories
  const addCategory = async (e) => {
    e?.preventDefault?.();
    const name = newCat.trim();
    if (!name) return;
    try { await api.post("/categories", { name }); setNewCat(""); toast.success("Category added"); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed to add"); }
  };
  const removeCategory = async (id, name) => {
    const ok = await confirm({ title: `Delete category "${name}"?`, description: "You can only delete categories that no costume uses.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try { await api.delete(`/categories/${id}`); toast.success("Category removed"); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || "Cannot delete"); }
  };

  // Subcategories (per category)
  const addSubcat = async (catId, parentId, name) => {
    try {
      await api.post(`/categories/${catId}/subcategories`, { name, parent_id: parentId });
      toast.success("Subcategory added");
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const renameSubcat = async (catId, subId, name) => {
    try {
      await api.put(`/categories/${catId}/subcategories/${subId}`, { name });
      toast.success("Renamed");
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const removeSubcat = async (catId, subId, name, kidCount) => {
    if (kidCount > 0) { toast.error("Delete nested subcategories first"); return; }
    if (!(await confirm({ title: `Remove subcategory "${name}"?`, confirmLabel: "Remove", danger: true }))) return;
    try {
      await api.delete(`/categories/${catId}/subcategories/${subId}`);
      toast.success("Subcategory removed");
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  // Sizing systems
  const addSizingSystem = async (e) => {
    e?.preventDefault?.();
    const name = newSysName.trim();
    const sizes = newSysSizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!name || !sizes.length) { toast.error("Name and at least one size required"); return; }
    try {
      await api.post("/sizing-systems", { name, sizes });
      setNewSysName(""); setNewSysSizes("");
      toast.success("Sizing system added");
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const startEditSys = (s) => { setEditingSys(s.id); setEditSysName(s.name); setEditSysSizes(s.sizes.join(", ")); };
  const saveEditSys = async () => {
    const name = editSysName.trim();
    const sizes = editSysSizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!name || !sizes.length) { toast.error("Name and sizes required"); return; }
    try {
      await api.put(`/sizing-systems/${editingSys}`, { name, sizes });
      setEditingSys(null);
      toast.success("Sizing system updated");
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const removeSizingSystem = async (id, name) => {
    if (!(await confirm({ title: `Delete sorting system "${name}"?`, description: "You can only delete systems that no costume uses.", confirmLabel: "Delete", danger: true }))) return;
    try { await api.delete(`/sizing-systems/${id}`); toast.success("Removed"); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || "Cannot delete"); }
  };

  // Shows
  const addShow = async (e) => {
    e?.preventDefault?.();
    const name = newShowName.trim();
    if (!name) return;
    const year = newShowYear.trim() ? parseInt(newShowYear, 10) : null;
    if (newShowYear.trim() && (isNaN(year) || year < 1800 || year > 2200)) { toast.error("Year invalid"); return; }
    try {
      await api.post("/shows", { name, year });
      setNewShowName(""); setNewShowYear("");
      toast.success("Show added");
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const startEditShow = (s) => {
    setEditingShow(s.id);
    setEditShowName(s.name);
    setEditShowYear(s.year != null ? String(s.year) : "");
    setEditShowImageId(s.image_id || null);
    setEditShowLink(s.show_link || "");
    setEditShowTimestamp(s.link_timestamp || "");
  };
  const saveEditShow = async () => {
    const name = editShowName.trim();
    const year = editShowYear.trim() ? parseInt(editShowYear, 10) : null;
    if (!name) { toast.error("Name required"); return; }
    if (editShowYear.trim() && (isNaN(year) || year < 1800 || year > 2200)) { toast.error("Year invalid"); return; }
    try {
      await api.put(`/shows/${editingShow}`, {
        name, year, image_id: editShowImageId,
        show_link: editShowLink.trim(),
        link_timestamp: editShowTimestamp.trim(),
      });
      setEditingShow(null);
      toast.success("Show updated");
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const removeShow = async (id, name) => {
    if (!(await confirm({ title: `Delete show "${name}"?`, description: "This is only allowed if no costume references this show.", confirmLabel: "Delete", danger: true }))) return;
    try { await api.delete(`/shows/${id}`); toast.success("Removed"); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || "Cannot delete"); }
  };
  const uploadShowImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image"); return; }
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setEditShowImageId(r.data.image_id);
      toast.success("Image uploaded");
    } catch (err) { toast.error(err.response?.data?.detail || "Upload failed"); }
    e.target.value = "";
  };

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

  // Locations (tree editor here now)
  const addRootLocation = async (e) => {
    e?.preventDefault?.();
    const name = newLocRoot.trim();
    if (!name) return;
    try { await api.post("/locations", { name }); setNewLocRoot(""); toast.success("Location added"); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const addChildLocation = async (parentId, name) => {
    try { await api.post("/locations", { name, parent_id: parentId }); toast.success("Nested location added"); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const renameLocation = async (id, name) => {
    try { await api.put(`/locations/${id}`, { name }); toast.success("Renamed"); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const removeLocation = async (id, name, kidCount) => {
    if (kidCount > 0) { toast.error("Delete nested locations first"); return; }
    if (!(await confirm({ title: `Delete "${name}"?`, confirmLabel: "Delete", danger: true }))) return;
    try { await api.delete(`/locations/${id}`); toast.success("Removed"); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try { await pushSettings(settings); toast.success("Settings saved"); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed to save"); }
    setSavingSettings(false);
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image"); return; }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const next = { ...settings, logo_image_id: r.data.image_id };
      setSettings(next);
      await pushSettings({ logo_image_id: r.data.image_id });
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    }
    setUploadingLogo(false);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const removeLogo = async () => {
    setSettings({ ...settings, logo_image_id: null });
    try {
      await pushSettings({ logo_image_id: "" });
      toast.success("Logo removed");
    } catch (err) {
      toast.error("Failed to remove logo");
    }
  };

  const saveCategoryColor = async (categoryId, color) => {
    try {
      await api.put(`/categories/${categoryId}`, { color });
      setCategories((prev) => prev.map((c) => c.id === categoryId ? { ...c, color } : c));
      toast.success("Color saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save color");
    }
  };

  return (
    <div className="space-y-12" data-testid="settings-page">
      <div className="space-y-2">
        <div className="eyebrow">SETTINGS</div>
        <h1 className="font-display text-4xl sm:text-5xl xl:text-6xl tracking-tight font-bold text-[#09090B] leading-[1.05]">Settings</h1>
        <p className="text-sm text-[#71717A] max-w-2xl">
          Manage locations, categories &amp; subcategories, sizing systems, shows, and preferences.
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full" data-testid="settings-tabs">
        <TabsList className="rounded-none border border-[#E4E4E7] p-0 h-auto bg-white flex flex-wrap justify-start w-full">
          <TabsTrigger value="general" data-testid="settings-tab-general" className="rounded-none data-[state=active]:bg-[#09090B] data-[state=active]:text-white h-11 px-5 gap-1.5">
            <SettingsIcon className="h-3.5 w-3.5" /> General
          </TabsTrigger>
          <TabsTrigger value="storage" data-testid="settings-tab-storage" className="rounded-none data-[state=active]:bg-[#09090B] data-[state=active]:text-white h-11 px-5 gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Storage
          </TabsTrigger>
          <TabsTrigger value="taxonomy" data-testid="settings-tab-taxonomy" className="rounded-none data-[state=active]:bg-[#09090B] data-[state=active]:text-white h-11 px-5 gap-1.5">
            <Tag className="h-3.5 w-3.5" /> Categories
          </TabsTrigger>
          <TabsTrigger value="sorting" data-testid="settings-tab-sorting" className="rounded-none data-[state=active]:bg-[#09090B] data-[state=active]:text-white h-11 px-5 gap-1.5">
            <Ruler className="h-3.5 w-3.5" /> Sorting Systems
          </TabsTrigger>
          <TabsTrigger value="equipment" data-testid="settings-tab-equipment" className="rounded-none data-[state=active]:bg-[#09090B] data-[state=active]:text-white h-11 px-5 gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Equipment
          </TabsTrigger>
          <TabsTrigger value="shows" data-testid="settings-tab-shows" className="rounded-none data-[state=active]:bg-[#09090B] data-[state=active]:text-white h-11 px-5 gap-1.5">
            <Film className="h-3.5 w-3.5" /> Shows
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6" data-testid="settings-content-general">
      {/* General */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">GENERAL</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Preferences</h2>
        </div>
        <div className="md:col-span-8 border border-[#E4E4E7] divide-y divide-[#E4E4E7]">
          <div className="p-5">
            <Label className="eyebrow">ORGANIZATION NAME</Label>
            <Input data-testid="settings-org-name" value={settings.org_name || ""} onChange={(e) => setSettings({ ...settings, org_name: e.target.value })} placeholder="e.g. LUXE Show Choir" className="rounded-none border-[#E4E4E7] h-11 mt-2" />
            <p className="text-xs text-[#A1A1AA] mt-1.5">Shown in the top-left corner of the app.</p>
          </div>
          <div className="p-5">
            <Label className="eyebrow">ORGANIZATION LOGO</Label>
            <div className="flex items-center gap-4 mt-2">
              <div className="w-16 h-16 image-empty border border-[#E4E4E7] overflow-hidden flex items-center justify-center rounded-full shrink-0">
                {settings.logo_image_id ? (
                  <img
                    src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${settings.logo_image_id}`}
                    alt="Logo"
                    className="w-full h-full object-cover"
                    data-testid="settings-logo-preview"
                  />
                ) : (
                  <ImageIcon className="h-5 w-5 text-[#A1A1AA]" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <input ref={logoInputRef} type="file" accept="image/*" onChange={uploadLogo} className="hidden" data-testid="settings-logo-input" />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="settings-logo-upload-btn"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="rounded-none border-[#09090B] h-10"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {uploadingLogo ? "Uploading…" : (settings.logo_image_id ? "Replace logo" : "Upload logo")}
                  </Button>
                  {settings.logo_image_id && (
                    <Button
                      type="button"
                      variant="ghost"
                      data-testid="settings-logo-remove-btn"
                      onClick={removeLogo}
                      className="rounded-none h-10 text-[#EF4444]"
                    >
                      <X className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-[#A1A1AA]">Square PNG or JPG works best. Falls back to the first two letters of the org name.</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <Label className="eyebrow">DEFAULT INVENTORY VIEW</Label>
            <div className="mt-2">
              <Select value={settings.default_view || "grid"} onValueChange={(v) => setSettings({ ...settings, default_view: v })}>
                <SelectTrigger data-testid="settings-default-view" className="rounded-none border-[#E4E4E7] h-11 max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Grid</SelectItem>
                  <SelectItem value="list">List (table)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="p-5 flex items-center justify-between">
            <div>
              <Label className="eyebrow">SHOW FLAG BANNER ON DASHBOARD</Label>
              <p className="text-xs text-[#71717A] mt-1">Show a prominent list of flagged costumes on the home page.</p>
            </div>
            <Switch data-testid="settings-flag-banner" checked={!!settings.show_flag_banner} onCheckedChange={(v) => setSettings({ ...settings, show_flag_banner: v })} />
          </div>
          <div className="p-5 space-y-2">
            <div>
              <Label className="eyebrow">CURRENTLY IN-USE VISIBILITY</Label>
              <p className="text-xs text-[#71717A] mt-1">Control how &quot;in use&quot; costumes appear on the dashboard.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              {[
                { v: "full", label: "Show everything", desc: "Section + IN USE badges" },
                { v: "hide_marker", label: "Hide markers only", desc: "Keep section, drop the green tags" },
                { v: "hide_all", label: "Don't spoil the surprise!", desc: "Hide the whole section 🤫" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  data-testid={`settings-in-use-mode-${opt.v}`}
                  onClick={() => setSettings({ ...settings, hide_in_use_mode: opt.v })}
                  className={`text-left p-3 border transition-colors ${
                    settings.hide_in_use_mode === opt.v
                      ? "border-[#09090B] bg-[#09090B] text-white"
                      : "border-[#E4E4E7] bg-white text-[#09090B] hover:border-[#09090B]"
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className={`text-[10px] font-mono-label mt-1 ${settings.hide_in_use_mode === opt.v ? "text-white/70" : "text-[#71717A]"}`}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="p-5 flex justify-end">
            <Button data-testid="settings-save-btn" onClick={saveSettings} disabled={savingSettings} className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-10">
              <Save className="h-4 w-4 mr-1" />{savingSettings ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </section>
        </TabsContent>

        <TabsContent value="storage" className="mt-6" data-testid="settings-content-storage">
      {/* Locations (nested tree) */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">STORAGE</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Locations</h2>
          <p className="text-sm text-[#71717A] mt-2">
            Nest locations indefinitely (e.g. Costume Closet A → A → 1).
          </p>
        </div>
        <div className="md:col-span-8 space-y-4">
          <form onSubmit={addRootLocation} className="flex gap-3">
            <Input data-testid="settings-new-root-loc" placeholder="Location (e.g. Costume Closet A)" value={newLocRoot} onChange={(e) => setNewLocRoot(e.target.value)} className="h-11 rounded-none border-[#E4E4E7]" />
            <Button data-testid="settings-add-root-loc-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-11 px-5">
              <Plus className="h-4 w-4 mr-1" /> Add location
            </Button>
          </form>
          <LocationTree locations={locations} onAdd={addChildLocation} onRename={renameLocation} onDelete={removeLocation} />
        </div>
      </section>
        </TabsContent>

        <TabsContent value="taxonomy" className="mt-6" data-testid="settings-content-taxonomy">
      {/* Categories with nested subcategories */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">TAXONOMY</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Categories &amp; subcategories</h2>
          <p className="text-sm text-[#71717A] mt-2">
            Subcategories can be nested indefinitely (e.g. Dresses → Formal → Long).
          </p>
        </div>
        <div className="md:col-span-8 space-y-4">
          <form onSubmit={addCategory} className="flex gap-3">
            <Input data-testid="settings-new-cat-input" placeholder="e.g. Sci-Fi" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="h-11 rounded-none border-[#E4E4E7]" />
            <Button data-testid="settings-add-cat-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-11 px-5">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </form>
          <div className="space-y-2">
            {categories.length === 0 ? (
              <div className="p-8 text-center text-[#71717A] border border-[#E4E4E7] bg-white">No categories yet.</div>
            ) : categories.map((c) => {
              const subs = c.subcategories || [];
              const color = c.color || "#71717A";
              return (
                <CollapsibleBox
                  key={c.id}
                  testId={`cat-row-${c.id}`}
                  accentColor={color}
                  icon={<Tag className="h-4 w-4" style={{ color }} />}
                  title={c.name}
                  subtitle={`${subs.length} subcategor${subs.length === 1 ? "y" : "ies"}`}
                  actions={
                    <button data-testid={`delete-cat-${c.id}`} onClick={() => removeCategory(c.id, c.name)} className="text-[#EF4444] hover:bg-[#FEF2F2] p-2" aria-label="Delete category">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  }
                >
                  <div className="space-y-4">
                    <div>
                      <Label className="eyebrow">CATEGORY COLOR</Label>
                      <div className="flex flex-wrap items-center gap-2 mt-2" data-testid={`cat-color-picker-${c.id}`}>
                        {["#EF4444","#F97316","#F59E0B","#EAB308","#84CC16","#10B981","#14B8A6","#06B6D4","#3B82F6","#6366F1","#8B5CF6","#A855F7","#EC4899","#F43F5E","#71717A"].map((col) => (
                          <button
                            key={col}
                            type="button"
                            data-testid={`cat-color-${c.id}-${col.replace("#","")}`}
                            onClick={() => saveCategoryColor(c.id, col)}
                            className={`w-6 h-6 border-2 ${c.color === col ? "border-[#09090B] scale-110" : "border-transparent hover:border-[#71717A]"}`}
                            style={{ backgroundColor: col }}
                            aria-label={`Set color ${col}`}
                          />
                        ))}
                        <input
                          type="color"
                          data-testid={`cat-color-picker-input-${c.id}`}
                          value={c.color || "#71717A"}
                          onChange={(e) => saveCategoryColor(c.id, e.target.value)}
                          className="w-8 h-8 border border-[#E4E4E7] cursor-pointer p-0"
                          aria-label="Custom color"
                        />
                      </div>
                      <p className="text-xs text-[#A1A1AA] mt-1.5">Subcategories inherit lighter variations of this color automatically.</p>
                    </div>
                    <div>
                      <Label className="eyebrow">SUBCATEGORIES</Label>
                      <div className="mt-2 space-y-3">
                        <AddSubcategoryForm catId={c.id} onAdd={(name) => addSubcat(c.id, null, name)} />
                        <SubcategoryTree
                          catId={c.id}
                          nodes={subs}
                          onAdd={(parentId, name) => addSubcat(c.id, parentId, name)}
                          onRename={(id, name) => renameSubcat(c.id, id, name)}
                          onDelete={(id, name, kids) => removeSubcat(c.id, id, name, kids)}
                        />
                      </div>
                    </div>
                  </div>
                </CollapsibleBox>
              );
            })}
          </div>
          <CategoryMergeCard categories={categories} onMerged={fetchAll} />
        </div>
      </section>
        </TabsContent>

        <TabsContent value="equipment" className="mt-6" data-testid="settings-content-equipment">
          <EquipmentTaxonomySection />
        </TabsContent>

        <TabsContent value="shows" className="mt-6" data-testid="settings-content-shows">

      {/* Shows grouped by year */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">PROGRAMMING</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Shows (by year)</h2>
          <p className="text-sm text-[#71717A] mt-2">
            Shows are organized by year. Edit a show to attach a photo used across the app.
          </p>
        </div>
        <div className="md:col-span-8 space-y-4">
          <form onSubmit={addShow} className="border border-[#E4E4E7] p-4 grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Input data-testid="settings-new-show-name" placeholder="Show name (e.g. Hairspray)" value={newShowName} onChange={(e) => setNewShowName(e.target.value)} className="h-11 rounded-none border-[#E4E4E7]" />
            </div>
            <Input data-testid="settings-new-show-year" type="number" min="1800" max="2200" placeholder="Year (e.g. 2023)" value={newShowYear} onChange={(e) => setNewShowYear(e.target.value)} className="h-11 rounded-none border-[#E4E4E7]" />
            <div className="md:col-span-3 flex justify-end">
              <Button data-testid="settings-add-show-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-10 px-4">
                <Plus className="h-4 w-4 mr-1" /> Add show
              </Button>
            </div>
          </form>
          {showsByYear.length === 0 ? (
            <div className="border border-[#E4E4E7] p-8 text-center text-[#71717A]">No shows yet.</div>
          ) : showsByYear.map(({ year, shows: ys }) => {
            const yopen = expandedYear[year] === true; // default collapsed
            return (
              <div key={year} className="border border-[#E4E4E7]" data-testid={`year-block-${year}`}>
                <button
                  type="button"
                  data-testid={`toggle-year-${year}`}
                  onClick={() => setExpandedYear({ ...expandedYear, [year]: !yopen })}
                  className="w-full flex items-center gap-3 px-5 py-3 bg-[#FAFAFA] hover:bg-[#F4F4F5] border-b border-[#E4E4E7]"
                >
                  {yopen ? <ChevronDown className="h-4 w-4 text-[#71717A]" /> : <ChevronRight className="h-4 w-4 text-[#71717A]" />}
                  <span className="font-display text-lg font-semibold text-[#09090B] tabular-nums">{year}</span>
                  <span className="text-xs text-[#71717A]">{ys.length} show{ys.length === 1 ? "" : "s"}</span>
                </button>
                {yopen && ys.map((s, idx) => (
                  <div key={s.id} data-testid={`show-row-${s.id}`} className={`${idx !== ys.length - 1 ? "border-b border-[#E4E4E7]" : ""}`}>
                    {editingShow === s.id ? (
                      <div className="p-4 bg-[#FAFAFA] space-y-3">
                        <div className="grid md:grid-cols-3 gap-2">
                          <div className="md:col-span-2">
                            <Input data-testid={`edit-show-name-${s.id}`} value={editShowName} onChange={(e) => setEditShowName(e.target.value)} className="h-10 rounded-none border-[#E4E4E7]" />
                          </div>
                          <Input data-testid={`edit-show-year-${s.id}`} type="number" value={editShowYear} onChange={(e) => setEditShowYear(e.target.value)} className="h-10 rounded-none border-[#E4E4E7]" />
                        </div>
                        <div className="relative">
                          <LinkIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                          <Input
                            data-testid={`edit-show-link-${s.id}`}
                            type="url"
                            value={editShowLink}
                            onChange={(e) => setEditShowLink(e.target.value)}
                            placeholder="Link to watch (YouTube, Vimeo…)"
                            className="pl-10 h-10 rounded-none border-[#E4E4E7]"
                          />
                        </div>
                        <Input
                          data-testid={`edit-show-timestamp-${s.id}`}
                          value={editShowTimestamp}
                          onChange={(e) => setEditShowTimestamp(e.target.value)}
                          placeholder="Timestamp (e.g. 1:23 or 1:23:45)"
                          className="h-10 rounded-none border-[#E4E4E7]"
                        />
                        <div className="flex items-start gap-3">
                          <div className="w-24 h-24 image-empty border border-[#E4E4E7] overflow-hidden shrink-0 flex items-center justify-center">
                            {editShowImageId ? (
                              <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${editShowImageId}`} alt="" className="w-full h-full object-cover" data-testid={`edit-show-image-${s.id}`} />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-[#A1A1AA]" />
                            )}
                          </div>
                          <div className="flex-1 space-y-2">
                            <label htmlFor={`show-file-${s.id}`}>
                              <input id={`show-file-${s.id}`} data-testid={`show-file-input-${s.id}`} type="file" accept="image/*" onChange={uploadShowImage} className="hidden" />
                              <span className="inline-flex items-center gap-1 border border-[#09090B] text-[#09090B] px-3 py-1.5 text-sm cursor-pointer hover:bg-[#F4F4F5]">
                                <Upload className="h-4 w-4" /> {editShowImageId ? "Replace photo" : "Upload photo"}
                              </span>
                            </label>
                            {editShowImageId && (
                              <button type="button" onClick={() => setEditShowImageId(null)} data-testid={`show-remove-image-${s.id}`} className="text-xs text-[#EF4444] hover:underline ml-2">
                                Remove photo
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" onClick={() => setEditingShow(null)} className="rounded-none h-9" data-testid={`cancel-edit-show-${s.id}`}>Cancel</Button>
                          <Button onClick={saveEditShow} className="bg-[#09090B] text-white rounded-none h-9" data-testid={`save-edit-show-${s.id}`}>
                            <Save className="h-4 w-4 mr-1" /> Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-[#FAFAFA]">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 image-empty border border-[#E4E4E7] overflow-hidden shrink-0 flex items-center justify-center">
                            {s.image_id ? (
                              <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${s.image_id}`} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Film className="h-4 w-4 text-[#A1A1AA]" />
                            )}
                          </div>
                          <span className="font-medium text-[#09090B] truncate">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button data-testid={`edit-show-${s.id}`} onClick={() => startEditShow(s)} className="text-xs font-medium text-[#09090B] hover:underline px-2 py-1">Edit</button>
                          <button data-testid={`delete-show-${s.id}`} onClick={() => removeShow(s.id, s.name)} className="text-[#EF4444] hover:bg-[#FEF2F2] p-2" aria-label="Delete show">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>
        </TabsContent>

        <TabsContent value="sorting" className="mt-6" data-testid="settings-content-sorting">
      {/* Sorting Systems */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">SORTING</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Sorting systems</h2>
          <p className="text-sm text-[#71717A] mt-2">
            Any set of values you use to break costumes down — sizes (XS/S/M), colors, positions, whatever.
          </p>
        </div>
        <div className="md:col-span-8 space-y-4">
          <form onSubmit={addSizingSystem} className="border border-[#E4E4E7] p-4 grid md:grid-cols-2 gap-3">
            <Input data-testid="settings-new-sys-name" placeholder="System name" value={newSysName} onChange={(e) => setNewSysName(e.target.value)} className="h-11 rounded-none border-[#E4E4E7]" />
            <Input data-testid="settings-new-sys-sizes" placeholder="Values, comma-separated" value={newSysSizes} onChange={(e) => setNewSysSizes(e.target.value)} className="h-11 rounded-none border-[#E4E4E7]" />
            <div className="md:col-span-2 flex justify-end">
              <Button data-testid="settings-add-sys-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-10 px-4">
                <Plus className="h-4 w-4 mr-1" /> Add sorting system
              </Button>
            </div>
          </form>
          <div className="space-y-2">
            {sizingSystems.length === 0 ? (
              <div className="p-8 text-center text-[#71717A] border border-[#E4E4E7] bg-white">No sorting systems yet.</div>
            ) : sizingSystems.map((s) => (
              <CollapsibleBox
                key={s.id}
                testId={`sys-row-${s.id}`}
                accentColor="#3B82F6"
                icon={<Ruler className="h-4 w-4 text-[#3B82F6]" />}
                title={s.name}
                subtitle={`${s.sizes.length} value${s.sizes.length === 1 ? "" : "s"} · ${s.sizes.join(", ")}`}
                actions={
                  <>
                    <button data-testid={`edit-sys-${s.id}`} onClick={() => startEditSys(s)} className="text-[#09090B] hover:bg-[#F4F4F5] p-2" aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button data-testid={`delete-sys-${s.id}`} onClick={() => removeSizingSystem(s.id, s.name)} className="text-[#EF4444] hover:bg-[#FEF2F2] p-2" aria-label="Delete sorting system">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                }
              >
                {editingSys === s.id ? (
                  <div className="space-y-2">
                    <Input data-testid={`edit-sys-name-${s.id}`} value={editSysName} onChange={(e) => setEditSysName(e.target.value)} className="h-10 rounded-none border-[#E4E4E7] bg-white" placeholder="System name" />
                    <Input data-testid={`edit-sys-sizes-${s.id}`} value={editSysSizes} onChange={(e) => setEditSysSizes(e.target.value)} className="h-10 rounded-none border-[#E4E4E7] bg-white" placeholder="Values (comma-separated)" />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setEditingSys(null)} className="rounded-none h-9" data-testid={`cancel-edit-sys-${s.id}`}>Cancel</Button>
                      <Button onClick={saveEditSys} className="bg-[#09090B] text-white rounded-none h-9" data-testid={`save-edit-sys-${s.id}`}>
                        <Save className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {s.sizes.map((v) => (
                      <span key={v} className="text-xs px-2 py-1 border border-[#E4E4E7] bg-white font-mono-label">{v}</span>
                    ))}
                  </div>
                )}
              </CollapsibleBox>
            ))}
          </div>
        </div>
      </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AddSubcategoryForm({ catId, onAdd }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const v = value.trim(); if (v) { onAdd(v); setValue(""); } }}
      className="flex gap-2"
    >
      <Input
        data-testid={`new-subcat-input-${catId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add root subcategory (e.g. Dresses)"
        className="h-9 rounded-none border-[#E4E4E7]"
      />
      <Button data-testid={`add-subcat-btn-${catId}`} type="submit" className="bg-[#09090B] text-white rounded-none h-9 px-3">
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  );
}

function SubcategoryTree({ catId, nodes, onAdd, onRename, onDelete }) {
  return (
    <LocationTree
      locations={nodes || []}
      icon={Tag}
      addChildTitle="Add nested subcategory"
      onAdd={onAdd}
      onRename={onRename}
      onDelete={onDelete}
    />
  );
}


function CategoryMergeCard({ categories, onMerged }) {
  const confirm = useConfirm();
  const [keeperId, setKeeperId] = useState("");
  const [discardId, setDiscardId] = useState("");
  const [busy, setBusy] = useState(false);
  const keeper = categories.find((c) => c.id === keeperId);
  const discard = categories.find((c) => c.id === discardId);
  const disabled = !keeper || !discard || keeper.id === discard.id;
  const submit = async () => {
    if (disabled) return;
    const ok = await confirm({
      title: `Merge "${discard.name}" into "${keeper.name}"?`,
      description: `All costumes currently under "${discard.name}" will be reassigned to "${keeper.name}" (their subcategories will be cleared). The "${discard.name}" category will be deleted.`,
      confirmLabel: "Merge",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post("/categories/merge", { keeper_id: keeper.id, discard_id: discard.id });
      toast.success(`Merged ${r.data.moved} costume(s) into ${r.data.keeper}`);
      setKeeperId("");
      setDiscardId("");
      onMerged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Merge failed");
    }
    setBusy(false);
  };
  return (
    <div className="border border-[#E4E4E7] p-4 mt-2 space-y-3" data-testid="merge-cat-card">
      <div>
        <div className="font-display font-semibold text-[#09090B]">Merge categories</div>
        <p className="text-xs text-[#71717A] mt-1">
          Combine two categories into one. Choose the category to <span className="font-semibold text-[#09090B]">keep</span> — the other will be deleted and its costumes moved over.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label className="eyebrow">KEEP THIS CATEGORY</Label>
          <Select value={keeperId || "__none__"} onValueChange={(v) => setKeeperId(v === "__none__" ? "" : v)}>
            <SelectTrigger data-testid="merge-keeper-select" className="rounded-none h-10 border-[#E4E4E7] mt-2">
              <SelectValue placeholder="Select the winning category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Select —</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5" style={{ backgroundColor: c.color || "#71717A" }} />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="eyebrow">MERGE FROM (will be deleted)</Label>
          <Select value={discardId || "__none__"} onValueChange={(v) => setDiscardId(v === "__none__" ? "" : v)}>
            <SelectTrigger data-testid="merge-discard-select" className="rounded-none h-10 border-[#E4E4E7] mt-2">
              <SelectValue placeholder="Select the category to absorb" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Select —</SelectItem>
              {categories.filter((c) => c.id !== keeperId).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5" style={{ backgroundColor: c.color || "#71717A" }} />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        onClick={submit}
        disabled={disabled || busy}
        data-testid="merge-cat-btn"
        className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-10 text-white w-full md:w-auto"
      >
        {busy ? "Merging…" : "Merge categories"}
      </Button>
    </div>
  );
}

function MigrateLegacyButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post("/admin/migrate-legacy-flags");
      setResult(r.data);
      toast.success(`Migrated ${r.data.migrated} costume(s)`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Migration failed");
    }
    setBusy(false);
  };
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <Button
        onClick={submit}
        disabled={busy}
        data-testid="migrate-legacy-btn"
        className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-10 text-white"
      >
        {busy ? "Migrating…" : "Migrate now"}
      </Button>
      {result && (
        <span className="text-xs text-[#52525B] font-mono-label" data-testid="migrate-legacy-result">
          MIGRATED {result.migrated} COSTUME(S)
        </span>
      )}
    </div>
  );
}

function EquipmentTaxonomySection() {
  const confirmDlg = useConfirm();
  const [cats, setCats] = useState([]);
  const [sys, setSys] = useState([]);
  const [newCat, setNewCat] = useState("");
  const [newSysName, setNewSysName] = useState("");
  const [newSysSizes, setNewSysSizes] = useState("");
  const [editSysId, setEditSysId] = useState(null);
  const [editSysName, setEditSysName] = useState("");
  const [editSysSizes, setEditSysSizes] = useState("");

  const load = async () => {
    const [c, s] = await Promise.all([
      api.get("/equipment-categories"),
      api.get("/equipment-sorting-systems"),
    ]);
    setCats(c.data);
    setSys(s.data);
  };
  useEffect(() => { load(); }, []);

  const addCat = async (e) => {
    e.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    try { await api.post("/equipment-categories", { name }); toast.success("Category added"); setNewCat(""); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const delCat = async (c) => {
    if (!(await confirmDlg({ title: `Delete equipment category "${c.name}"?`, danger: true, confirmLabel: "Delete" }))) return;
    try { await api.delete(`/equipment-categories/${c.id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  const addSys = async (e) => {
    e.preventDefault();
    const name = newSysName.trim();
    const sizes = newSysSizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!name || !sizes.length) { toast.error("Name + at least one value"); return; }
    try { await api.post("/equipment-sorting-systems", { name, sizes }); toast.success("Sorting system added"); setNewSysName(""); setNewSysSizes(""); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const startEditSys = (s) => { setEditSysId(s.id); setEditSysName(s.name); setEditSysSizes(s.sizes.join(", ")); };
  const saveEditSys = async () => {
    const sizes = editSysSizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!editSysName.trim() || !sizes.length) { toast.error("Invalid"); return; }
    try { await api.put(`/equipment-sorting-systems/${editSysId}`, { name: editSysName.trim(), sizes }); toast.success("Saved"); setEditSysId(null); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };
  const delSys = async (s) => {
    if (!(await confirmDlg({ title: `Delete sorting system "${s.name}"?`, danger: true, confirmLabel: "Delete" }))) return;
    try { await api.delete(`/equipment-sorting-systems/${s.id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-10" data-testid="equipment-taxonomy">
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">EQUIPMENT / TAXONOMY</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Equipment categories</h2>
          <p className="text-sm text-[#71717A] mt-2">A separate list of categories for hardware, cables, mics, tools, etc.</p>
        </div>
        <div className="md:col-span-8 space-y-4">
          <form onSubmit={addCat} className="border border-[#E4E4E7] p-4 flex gap-3">
            <Input data-testid="settings-eq-new-category" placeholder="New equipment category" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="h-11 rounded-none border-[#E4E4E7]" />
            <Button data-testid="settings-eq-add-category-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-10 px-4">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </form>
          <div className="space-y-2">
            {cats.length === 0 ? (
              <div className="p-8 text-center text-[#71717A] border border-[#E4E4E7] bg-white">No equipment categories yet.</div>
            ) : cats.map((c) => (
              <CollapsibleBox
                key={c.id}
                testId={`eq-cat-row-${c.id}`}
                accentColor={c.color || "#71717A"}
                icon={<Wrench className="h-4 w-4" style={{ color: c.color || "#71717A" }} />}
                title={c.name}
                subtitle="Equipment"
                actions={
                  <button data-testid={`delete-eq-cat-${c.id}`} onClick={() => delCat(c)} className="text-[#EF4444] hover:bg-[#FEF2F2] p-2" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                }
              >
                <p className="text-xs text-[#71717A]">Equipment subcategories aren&apos;t supported yet — this list is flat.</p>
              </CollapsibleBox>
            ))}
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">EQUIPMENT / SORTING</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Equipment sorting systems</h2>
          <p className="text-sm text-[#71717A] mt-2">Break equipment down by lengths, sizes, colors, positions — anything.</p>
        </div>
        <div className="md:col-span-8 space-y-4">
          <form onSubmit={addSys} className="border border-[#E4E4E7] p-4 grid md:grid-cols-2 gap-3">
            <Input data-testid="settings-eq-new-sys-name" placeholder="System name" value={newSysName} onChange={(e) => setNewSysName(e.target.value)} className="h-11 rounded-none border-[#E4E4E7]" />
            <Input data-testid="settings-eq-new-sys-sizes" placeholder="Values, comma-separated" value={newSysSizes} onChange={(e) => setNewSysSizes(e.target.value)} className="h-11 rounded-none border-[#E4E4E7]" />
            <div className="md:col-span-2 flex justify-end">
              <Button data-testid="settings-eq-add-sys-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-10 px-4">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </form>
          <div className="space-y-2">
            {sys.length === 0 ? (
              <div className="p-8 text-center text-[#71717A] border border-[#E4E4E7] bg-white">No sorting systems yet.</div>
            ) : sys.map((s) => (
              <CollapsibleBox
                key={s.id}
                testId={`eq-sys-row-${s.id}`}
                accentColor="#3B82F6"
                icon={<Ruler className="h-4 w-4 text-[#3B82F6]" />}
                title={s.name}
                subtitle={`${s.sizes.length} value${s.sizes.length === 1 ? "" : "s"} · ${s.sizes.join(", ")}`}
                actions={
                  <>
                    <button data-testid={`edit-eq-sys-${s.id}`} onClick={() => startEditSys(s)} className="text-[#09090B] hover:bg-[#F4F4F5] p-2" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    <button data-testid={`delete-eq-sys-${s.id}`} onClick={() => delSys(s)} className="text-[#EF4444] hover:bg-[#FEF2F2] p-2" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </>
                }
              >
                {editSysId === s.id ? (
                  <div className="space-y-2">
                    <Input value={editSysName} onChange={(e) => setEditSysName(e.target.value)} className="h-10 rounded-none border-[#E4E4E7] bg-white" placeholder="System name" />
                    <Input value={editSysSizes} onChange={(e) => setEditSysSizes(e.target.value)} className="h-10 rounded-none border-[#E4E4E7] bg-white" placeholder="Values (comma-separated)" />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setEditSysId(null)} className="rounded-none h-9">Cancel</Button>
                      <Button onClick={saveEditSys} className="bg-[#09090B] text-white rounded-none h-9">
                        <Save className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {s.sizes.map((v) => (
                      <span key={v} className="text-xs px-2 py-1 border border-[#E4E4E7] bg-white font-mono-label">{v}</span>
                    ))}
                  </div>
                )}
              </CollapsibleBox>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
