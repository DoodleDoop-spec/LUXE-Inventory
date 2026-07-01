import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Tag, Save, Ruler, ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function Settings() {
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState("");
  const [expandedCat, setExpandedCat] = useState({});
  const [newSubcat, setNewSubcat] = useState({});
  const [sizingSystems, setSizingSystems] = useState([]);
  const [newSysName, setNewSysName] = useState("");
  const [newSysSizes, setNewSysSizes] = useState("");
  const [editingSys, setEditingSys] = useState(null);
  const [editSysName, setEditSysName] = useState("");
  const [editSysSizes, setEditSysSizes] = useState("");
  const [settings, setSettings] = useState({ org_name: "", default_view: "grid", show_flag_banner: true });
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchAll = async () => {
    const [c, s, sys] = await Promise.all([
      api.get("/categories"),
      api.get("/settings"),
      api.get("/sizing-systems"),
    ]);
    setCategories(c.data);
    setSettings(s.data);
    setSizingSystems(sys.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const addCategory = async (e) => {
    e?.preventDefault?.();
    const name = newCat.trim();
    if (!name) return;
    try {
      await api.post("/categories", { name });
      setNewCat("");
      toast.success("Category added");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add");
    }
  };

  const removeCategory = async (id, name) => {
    if (!window.confirm(`Delete category "${name}"?`)) return;
    try {
      await api.delete(`/categories/${id}`);
      toast.success("Category removed");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Cannot delete");
    }
  };

  const addSubcategory = async (catId) => {
    const name = (newSubcat[catId] || "").trim();
    if (!name) return;
    try {
      await api.post(`/categories/${catId}/subcategories`, { name });
      setNewSubcat({ ...newSubcat, [catId]: "" });
      toast.success("Subcategory added");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add");
    }
  };

  const removeSubcategory = async (catId, name) => {
    if (!window.confirm(`Remove subcategory "${name}"?`)) return;
    try {
      await api.delete(`/categories/${catId}/subcategories/${encodeURIComponent(name)}`);
      toast.success("Subcategory removed");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const addSizingSystem = async (e) => {
    e?.preventDefault?.();
    const name = newSysName.trim();
    const sizes = newSysSizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!name || !sizes.length) {
      toast.error("Name and at least one size required");
      return;
    }
    try {
      await api.post("/sizing-systems", { name, sizes });
      setNewSysName(""); setNewSysSizes("");
      toast.success("Sizing system added");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const startEditSys = (s) => {
    setEditingSys(s.id);
    setEditSysName(s.name);
    setEditSysSizes(s.sizes.join(", "));
  };

  const saveEditSys = async () => {
    const name = editSysName.trim();
    const sizes = editSysSizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!name || !sizes.length) {
      toast.error("Name and at least one size required");
      return;
    }
    try {
      await api.put(`/sizing-systems/${editingSys}`, { name, sizes });
      setEditingSys(null);
      toast.success("Sizing system updated");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const removeSizingSystem = async (id, name) => {
    if (!window.confirm(`Delete sizing system "${name}"?`)) return;
    try {
      await api.delete(`/sizing-systems/${id}`);
      toast.success("Removed");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Cannot delete");
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put("/settings", settings);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save");
    }
    setSavingSettings(false);
  };

  return (
    <div className="space-y-12" data-testid="settings-page">
      <div className="space-y-2">
        <div className="eyebrow">INDEX 04 / SETTINGS</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
          Settings
        </h1>
        <p className="text-sm text-[#71717A] max-w-2xl">
          Manage categories, subcategories, sizing systems, and preferences.
          Locations are managed on the dedicated Locations page.
        </p>
      </div>

      {/* General */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">GENERAL</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Preferences</h2>
          <p className="text-sm text-[#71717A] mt-2">Basic configuration for how the app behaves.</p>
        </div>
        <div className="md:col-span-8 border border-[#E4E4E7] divide-y divide-[#E4E4E7]">
          <div className="p-5">
            <Label className="eyebrow">ORGANIZATION NAME</Label>
            <Input
              data-testid="settings-org-name"
              value={settings.org_name || ""}
              onChange={(e) => setSettings({ ...settings, org_name: e.target.value })}
              placeholder="e.g. Broadway Costume Dept."
              className="rounded-none border-[#E4E4E7] h-11 mt-2"
            />
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
            <Switch
              data-testid="settings-flag-banner"
              checked={!!settings.show_flag_banner}
              onCheckedChange={(v) => setSettings({ ...settings, show_flag_banner: v })}
            />
          </div>
          <div className="p-5 flex justify-end">
            <Button
              data-testid="settings-save-btn"
              onClick={saveSettings}
              disabled={savingSettings}
              className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-10"
            >
              <Save className="h-4 w-4 mr-1" />
              {savingSettings ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">TAXONOMY</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Categories &amp; subcategories</h2>
          <p className="text-sm text-[#71717A] mt-2">
            Expand a category to manage its subcategories. Categories in use cannot be deleted.
          </p>
        </div>
        <div className="md:col-span-8 space-y-4">
          <form onSubmit={addCategory} className="flex gap-3">
            <Input
              data-testid="settings-new-cat-input"
              placeholder="e.g. Sci-Fi"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              className="h-11 rounded-none border-[#E4E4E7]"
            />
            <Button data-testid="settings-add-cat-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-11 px-5">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </form>
          <div className="border border-[#E4E4E7]">
            {categories.length === 0 ? (
              <div className="p-8 text-center text-[#71717A]">No categories yet.</div>
            ) : (
              categories.map((c, idx) => {
                const isOpen = !!expandedCat[c.id];
                const subs = c.subcategories || [];
                return (
                  <div key={c.id} data-testid={`cat-row-${c.id}`} className={`${idx !== categories.length - 1 ? "border-b border-[#E4E4E7]" : ""}`}>
                    <div className="flex items-center justify-between px-5 py-3 hover:bg-[#FAFAFA]">
                      <button
                        type="button"
                        data-testid={`toggle-cat-${c.id}`}
                        onClick={() => setExpandedCat({ ...expandedCat, [c.id]: !isOpen })}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4 text-[#71717A]" /> : <ChevronRight className="h-4 w-4 text-[#71717A]" />}
                        <Tag className="h-4 w-4 text-[#71717A]" />
                        <span className="font-medium text-[#09090B]">{c.name}</span>
                        <span className="text-xs text-[#71717A] ml-2">{subs.length} subcategor{subs.length === 1 ? "y" : "ies"}</span>
                      </button>
                      <button
                        data-testid={`delete-cat-${c.id}`}
                        onClick={() => removeCategory(c.id, c.name)}
                        className="text-[#EF4444] hover:bg-[#FEF2F2] p-2"
                        aria-label="Delete category"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="bg-[#FAFAFA] border-t border-[#E4E4E7] p-4 space-y-3">
                        <div className="flex gap-2 flex-wrap">
                          {subs.length === 0 ? (
                            <span className="text-xs text-[#71717A]">No subcategories yet.</span>
                          ) : subs.map((s) => (
                            <span key={s} data-testid={`subcat-chip-${c.id}-${s}`} className="inline-flex items-center gap-1 bg-white border border-[#E4E4E7] px-2 py-1 text-xs">
                              {s}
                              <button
                                type="button"
                                data-testid={`delete-subcat-${c.id}-${s}`}
                                onClick={() => removeSubcategory(c.id, s)}
                                className="text-[#71717A] hover:text-[#EF4444]"
                                aria-label={`Remove ${s}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <form
                          onSubmit={(e) => { e.preventDefault(); addSubcategory(c.id); }}
                          className="flex gap-2"
                        >
                          <Input
                            data-testid={`new-subcat-input-${c.id}`}
                            value={newSubcat[c.id] || ""}
                            onChange={(e) => setNewSubcat({ ...newSubcat, [c.id]: e.target.value })}
                            placeholder="Add subcategory (e.g. Dresses)"
                            className="h-9 rounded-none border-[#E4E4E7]"
                          />
                          <Button
                            data-testid={`add-subcat-btn-${c.id}`}
                            type="submit"
                            className="bg-[#09090B] text-white rounded-none h-9 px-3"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Sizing Systems */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">SIZING</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Sizing systems</h2>
          <p className="text-sm text-[#71717A] mt-2">
            Each costume uses one sizing system. Add or edit systems here. Systems in use cannot be deleted.
          </p>
        </div>
        <div className="md:col-span-8 space-y-4">
          <form onSubmit={addSizingSystem} className="border border-[#E4E4E7] p-4 grid md:grid-cols-2 gap-3">
            <Input
              data-testid="settings-new-sys-name"
              placeholder="System name (e.g. Youth Number)"
              value={newSysName}
              onChange={(e) => setNewSysName(e.target.value)}
              className="h-11 rounded-none border-[#E4E4E7]"
            />
            <Input
              data-testid="settings-new-sys-sizes"
              placeholder="Sizes, comma-separated (e.g. 6, 8, 10)"
              value={newSysSizes}
              onChange={(e) => setNewSysSizes(e.target.value)}
              className="h-11 rounded-none border-[#E4E4E7]"
            />
            <div className="md:col-span-2 flex justify-end">
              <Button data-testid="settings-add-sys-btn" type="submit" className="bg-[#09090B] text-white hover:bg-[#27272A] rounded-none h-10 px-4">
                <Plus className="h-4 w-4 mr-1" /> Add sizing system
              </Button>
            </div>
          </form>
          <div className="border border-[#E4E4E7]">
            {sizingSystems.length === 0 ? (
              <div className="p-8 text-center text-[#71717A]">No sizing systems yet.</div>
            ) : sizingSystems.map((s, idx) => (
              <div key={s.id} data-testid={`sys-row-${s.id}`} className={`${idx !== sizingSystems.length - 1 ? "border-b border-[#E4E4E7]" : ""}`}>
                {editingSys === s.id ? (
                  <div className="p-4 bg-[#FAFAFA] space-y-2">
                    <Input
                      data-testid={`edit-sys-name-${s.id}`}
                      value={editSysName}
                      onChange={(e) => setEditSysName(e.target.value)}
                      className="h-10 rounded-none border-[#E4E4E7]"
                    />
                    <Input
                      data-testid={`edit-sys-sizes-${s.id}`}
                      value={editSysSizes}
                      onChange={(e) => setEditSysSizes(e.target.value)}
                      className="h-10 rounded-none border-[#E4E4E7]"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => setEditingSys(null)}
                        className="rounded-none h-9"
                        data-testid={`cancel-edit-sys-${s.id}`}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={saveEditSys}
                        className="bg-[#09090B] text-white rounded-none h-9"
                        data-testid={`save-edit-sys-${s.id}`}
                      >
                        <Save className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-5 py-3 hover:bg-[#FAFAFA]">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Ruler className="h-4 w-4 text-[#71717A] shrink-0" />
                      <span className="font-medium text-[#09090B] shrink-0">{s.name}</span>
                      <span className="font-mono-label text-xs text-[#71717A] truncate">{s.sizes.join(", ")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        data-testid={`edit-sys-${s.id}`}
                        onClick={() => startEditSys(s)}
                        className="text-xs font-medium text-[#09090B] hover:underline px-2 py-1"
                      >
                        Edit
                      </button>
                      <button
                        data-testid={`delete-sys-${s.id}`}
                        onClick={() => removeSizingSystem(s.id, s.name)}
                        className="text-[#EF4444] hover:bg-[#FEF2F2] p-2"
                        aria-label="Delete sizing system"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
