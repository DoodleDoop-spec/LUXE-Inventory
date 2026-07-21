import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  ShieldCheck, Plus, Trash2, RotateCcw, Copy, Check, X as XIcon, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function RolesSettings() {
  const confirm = useConfirm();
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [draftPerms, setDraftPerms] = useState({}); // by roleId -> { perm_key: bool }
  const [saving, setSaving] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", description: "", clone_from: "" });

  const load = async () => {
    try {
      const [r, c] = await Promise.all([api.get("/roles"), api.get("/permissions/catalog")]);
      setRoles(r.data);
      setCatalog(c.data.catalog || {});
      if (!selectedRoleId && r.data.length) setSelectedRoleId(r.data[0].id);
    } catch { toast.error("Failed to load roles"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const selectedRole = useMemo(() => roles.find((r) => r.id === selectedRoleId) || null, [roles, selectedRoleId]);
  const currentPerms = useMemo(() => {
    if (!selectedRole) return {};
    return { ...(selectedRole.permissions || {}), ...(draftPerms[selectedRole.id] || {}) };
  }, [selectedRole, draftPerms]);
  const dirty = selectedRole && Object.keys(draftPerms[selectedRole.id] || {}).length > 0;

  const togglePerm = (key) => {
    if (!selectedRole) return;
    setDraftPerms((prev) => {
      const roleDraft = { ...(prev[selectedRole.id] || {}) };
      const current = currentPerms[key];
      const original = selectedRole.permissions?.[key] ?? false;
      const next = !current;
      if (next === original) {
        // reverting a pending change
        delete roleDraft[key];
      } else {
        roleDraft[key] = next;
      }
      return { ...prev, [selectedRole.id]: roleDraft };
    });
  };

  const bulkSet = (groupKeys, value) => {
    if (!selectedRole) return;
    setDraftPerms((prev) => {
      const roleDraft = { ...(prev[selectedRole.id] || {}) };
      for (const k of groupKeys) {
        const original = selectedRole.permissions?.[k] ?? false;
        if (value === original) delete roleDraft[k];
        else roleDraft[k] = value;
      }
      return { ...prev, [selectedRole.id]: roleDraft };
    });
  };

  const saveRole = async () => {
    if (!selectedRole || !dirty) return;
    setSaving(true);
    try {
      const patch = draftPerms[selectedRole.id] || {};
      await api.put(`/roles/${selectedRole.id}`, { permissions: patch });
      toast.success(`Saved permissions for ${selectedRole.name}`);
      setDraftPerms((prev) => { const p = { ...prev }; delete p[selectedRole.id]; return p; });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save");
    }
    setSaving(false);
  };

  const discardChanges = () => {
    if (!selectedRole) return;
    setDraftPerms((prev) => { const p = { ...prev }; delete p[selectedRole.id]; return p; });
  };

  const createRole = async () => {
    const name = newRole.name.trim();
    if (!name) { toast.error("Role name required"); return; }
    try {
      const r = await api.post("/roles", {
        name,
        description: newRole.description.trim(),
        clone_from: newRole.clone_from || null,
      });
      toast.success(`Created role ${r.data.name}`);
      setNewDialogOpen(false);
      setNewRole({ name: "", description: "", clone_from: "" });
      setSelectedRoleId(r.data.id);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create role");
    }
  };

  const deleteRole = async (r) => {
    if (r.is_system) { toast.error("Built-in roles cannot be deleted"); return; }
    const ok = await confirm({
      title: `Delete role "${r.name}"?`,
      description: "Any user with this role will need a new role assignment when accounts ship.",
      confirmLabel: "Delete role",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/roles/${r.id}`);
      toast.success("Role deleted");
      if (selectedRoleId === r.id) setSelectedRoleId(null);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to delete"); }
  };

  const resetDefaults = async () => {
    const ok = await confirm({
      title: "Reset every role to defaults?",
      description: "All custom roles will be deleted and the built-in presets restored.",
      confirmLabel: "Reset roles",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post("/roles/reset-defaults");
      toast.success("Roles reset to defaults");
      setDraftPerms({});
      setSelectedRoleId(null);
      load();
    } catch { toast.error("Failed to reset"); }
  };

  return (
    <section className="grid md:grid-cols-12 gap-8" data-testid="roles-settings">
      <div className="md:col-span-4">
        <div className="eyebrow flex items-center gap-2">
          <ShieldCheck className="h-3 w-3" /> ROLES
        </div>
        <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">Roles &amp; permissions</h2>
        <p className="text-sm text-[#71717A] mt-2">
          Ten role presets ship out-of-the-box. Toggle any permission and the change applies the next time
          that role's holder loads a page — once accounts are enabled.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={() => setNewDialogOpen(true)} data-testid="roles-new-btn" className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-10">
            <Plus className="h-4 w-4 mr-1" /> New custom role
          </Button>
          <Button onClick={resetDefaults} variant="outline" data-testid="roles-reset-btn" className="rounded-none h-10">
            <RotateCcw className="h-4 w-4 mr-1" /> Reset to defaults
          </Button>
        </div>
        <div className="mt-4 border border-[#E4E4E7] divide-y divide-[#E4E4E7] max-h-[520px] overflow-y-auto">
          {roles.map((r) => {
            const active = r.id === selectedRoleId;
            const grantedCount = Object.values(r.permissions || {}).filter(Boolean).length;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                data-testid={`role-item-${r.id}`}
                className={`w-full text-left px-3 py-2.5 hover:bg-[#FAFAFA] flex items-start gap-2 ${active ? "bg-[#F4F4F5]" : "bg-white"}`}
              >
                <span className="w-2 h-2 mt-2 rounded-full shrink-0" style={{ backgroundColor: r.color || "#71717A" }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[#09090B] text-sm truncate flex items-center gap-1.5">
                    {r.name}
                    {r.is_system && <span className="text-[9px] font-mono-label text-[#71717A] border border-[#E4E4E7] px-1">BUILT-IN</span>}
                  </div>
                  {r.description && <div className="text-xs text-[#71717A] mt-0.5 line-clamp-2">{r.description}</div>}
                  <div className="text-[10px] font-mono-label text-[#71717A] mt-1 tabular-nums">
                    {grantedCount} permission{grantedCount === 1 ? "" : "s"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="md:col-span-8">
        {!selectedRole ? (
          <div className="border border-dashed border-[#E4E4E7] p-12 text-center text-sm text-[#71717A]">
            Select a role to edit its permissions.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="eyebrow">EDITING</div>
                <h3 className="font-display text-2xl font-semibold text-[#09090B] mt-1 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedRole.color || "#71717A" }} />
                  {selectedRole.name}
                </h3>
                {selectedRole.description && <p className="text-sm text-[#71717A] mt-1 max-w-xl">{selectedRole.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                {dirty && (
                  <>
                    <Button onClick={discardChanges} variant="outline" data-testid="role-discard" className="rounded-none h-9">
                      Discard
                    </Button>
                    <Button onClick={saveRole} disabled={saving} data-testid="role-save" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-9 px-5">
                      <Check className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save"}
                    </Button>
                  </>
                )}
                {!selectedRole.is_system && (
                  <Button onClick={() => deleteRole(selectedRole)} variant="outline" data-testid="role-delete" className="rounded-none h-9 border-[#EF4444] text-[#EF4444] hover:bg-[#FEF2F2]">
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                )}
              </div>
            </div>

            {!selectedRole.is_system && (
              <div className="border border-[#E4E4E7] p-3 flex items-center gap-2 text-xs text-[#52525B] bg-[#FAFAFA]">
                <Info className="h-3.5 w-3.5" />
                Custom role — you can also rename, recolor and delete this role.
              </div>
            )}

            {Object.entries(catalog).map(([group, perms]) => {
              const groupKeys = perms.map((p) => p.key);
              const allOn = groupKeys.every((k) => currentPerms[k]);
              const noneOn = groupKeys.every((k) => !currentPerms[k]);
              return (
                <div key={group} className="border border-[#E4E4E7] bg-white" data-testid={`perm-group-${group.replace(/\W+/g, "-")}`}>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-[#E4E4E7] bg-[#FAFAFA]">
                    <div className="font-mono-label text-[10px] tracking-widest text-[#71717A]">{group.toUpperCase()}</div>
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => bulkSet(groupKeys, true)}
                        disabled={allOn}
                        className={`px-2 h-7 border ${allOn ? "border-[#E4E4E7] text-[#D4D4D8] cursor-not-allowed" : "border-[#09090B] text-[#09090B] hover:bg-[#F4F4F5]"}`}
                      >
                        Grant all
                      </button>
                      <button
                        type="button"
                        onClick={() => bulkSet(groupKeys, false)}
                        disabled={noneOn}
                        className={`px-2 h-7 border ${noneOn ? "border-[#E4E4E7] text-[#D4D4D8] cursor-not-allowed" : "border-[#E4E4E7] text-[#52525B] hover:border-[#EF4444] hover:text-[#EF4444]"}`}
                      >
                        Revoke all
                      </button>
                    </div>
                  </div>
                  <ul className="divide-y divide-[#F4F4F5]">
                    {perms.map((p) => {
                      const on = !!currentPerms[p.key];
                      const changed = draftPerms[selectedRole.id]?.[p.key] !== undefined;
                      return (
                        <li key={p.key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#FAFAFA]">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            onClick={() => togglePerm(p.key)}
                            data-testid={`perm-toggle-${p.key}`}
                            className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? "bg-[#10B981]" : "bg-[#D4D4D8]"}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-[#09090B]">{p.label}</div>
                            <div className="text-[10px] font-mono-label text-[#A1A1AA]">{p.key}</div>
                          </div>
                          {changed && <span className="text-[9px] font-mono-label text-[#EA580C] border border-[#EA580C] px-1">CHANGED</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New role dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] rounded-none border-[#09090B]" data-testid="new-role-dialog">
          <DialogHeader>
            <div className="eyebrow">NEW / ROLE</div>
            <DialogTitle className="font-display text-2xl tracking-tight">Create custom role</DialogTitle>
            <DialogDescription>Clone permissions from an existing role or start blank.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="eyebrow">NAME</Label>
              <Input
                data-testid="new-role-name"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                placeholder="e.g. Wardrobe Lead"
                className="rounded-none border-[#E4E4E7] h-10 mt-1"
              />
            </div>
            <div>
              <Label className="eyebrow">DESCRIPTION</Label>
              <Textarea
                data-testid="new-role-desc"
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                rows={2}
                className="rounded-none border-[#E4E4E7] mt-1"
              />
            </div>
            <div>
              <Label className="eyebrow">CLONE FROM (OPTIONAL)</Label>
              <select
                value={newRole.clone_from}
                onChange={(e) => setNewRole({ ...newRole, clone_from: e.target.value })}
                className="w-full h-10 border border-[#E4E4E7] rounded-none px-2 text-sm mt-1 bg-white"
                data-testid="new-role-clone"
              >
                <option value="">— start blank —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setNewDialogOpen(false)} className="rounded-none h-10">Cancel</Button>
            <Button onClick={createRole} data-testid="new-role-create" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-10 px-5">
              Create role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
