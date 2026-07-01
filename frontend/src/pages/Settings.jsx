import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Tag, Save } from "lucide-react";
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
  const [settings, setSettings] = useState({ org_name: "", default_view: "grid", show_flag_banner: true });
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchAll = async () => {
    const [c, s] = await Promise.all([
      api.get("/categories"),
      api.get("/settings"),
    ]);
    setCategories(c.data);
    setSettings(s.data);
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
          Manage categories, default preferences, and organization info. Locations are managed
          on the dedicated Locations page.
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
            <p className="text-xs text-[#A1A1AA] mt-2">Displayed in the app header (reserved for future use).</p>
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
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Categories</h2>
          <p className="text-sm text-[#71717A] mt-2">
            Categories help organize costumes. You can only delete categories that aren&apos;t in use.
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
              categories.map((c, idx) => (
                <div
                  key={c.id}
                  data-testid={`cat-row-${c.id}`}
                  className={`flex items-center justify-between px-5 py-3 ${idx !== categories.length - 1 ? "border-b border-[#E4E4E7]" : ""} hover:bg-[#FAFAFA]`}
                >
                  <div className="flex items-center gap-3">
                    <Tag className="h-4 w-4 text-[#71717A]" />
                    <span className="font-medium text-[#09090B]">{c.name}</span>
                  </div>
                  <button
                    data-testid={`delete-cat-${c.id}`}
                    onClick={() => removeCategory(c.id, c.name)}
                    className="text-[#EF4444] hover:bg-[#FEF2F2] p-2"
                    aria-label="Delete category"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Sizes info */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow">SIZING</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Supported sizes</h2>
          <p className="text-sm text-[#71717A] mt-2">
            The following sizes are tracked for every costume.
          </p>
        </div>
        <div className="md:col-span-8">
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
            {["XS","S","M","L","XL","XXL","XXXL"].map((s) => (
              <div key={s} className="bg-white p-4 text-center">
                <div className="font-mono-label text-xs text-[#71717A]">SIZE</div>
                <div className="font-display font-bold text-lg mt-1">{s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
