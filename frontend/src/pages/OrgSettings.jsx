import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  Building2, UserPlus, Copy, Check, Trash2, RefreshCw, Users as UsersIcon, Mail, Loader2, Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function OrgSettings() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ email: "", role_id: "", expires_days: 14 });
  const [busy, setBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  const [handoffTarget, setHandoffTarget] = useState(null); // user_id to promote

  const isMeDirector = useMemo(() => {
    const me = members.find((m) => m.user_id === user?.user_id);
    return me?.role_slug === "director" || me?.is_superadmin;
  }, [members, user]);

  const load = async () => {
    setLoading(true);
    try {
      const [o, m, r, i] = await Promise.all([
        api.get("/organizations/mine"),
        api.get("/organizations/members"),
        api.get("/roles"),
        api.get("/invites"),
      ]);
      setOrg(o.data);
      setMembers(m.data);
      setRoles(r.data);
      setInvites(i.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load organization");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const activeInvites = useMemo(() => invites.filter((i) => !i.revoked && !i.accepted_at), [invites]);
  const pastInvites = useMemo(() => invites.filter((i) => i.revoked || i.accepted_at), [invites]);

  const openNewInvite = () => {
    setForm({
      email: "",
      role_id: roles.find((r) => r.slug === "parent_volunteer")?.id || roles[0]?.id || "",
      expires_days: 14,
    });
    setInviteOpen(true);
  };

  const createInvite = async () => {
    if (!form.role_id) { toast.error("Pick a role"); return; }
    setBusy(true);
    try {
      await api.post("/invites", {
        role_id: form.role_id,
        email: form.email.trim(),
        expires_days: Number(form.expires_days) || 14,
      });
      toast.success("Invite created — share the link");
      setInviteOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create invite");
    }
    setBusy(false);
  };

  const revokeInvite = async (inv) => {
    const ok = await confirm({
      title: "Revoke invite?",
      description: `Code ${inv.code} will stop working immediately.`,
      confirmLabel: "Revoke",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/invites/${inv.id}`);
      toast.success("Revoked");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  const changeMemberRole = async (m, newRoleId) => {
    try {
      await api.put(`/organizations/members/${m.user_id}/role`, { role_id: newRoleId });
      toast.success(`${m.name || m.email} → new role`);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to change role"); }
  };

  const removeMember = async (m) => {
    const ok = await confirm({
      title: `Remove ${m.name || m.email}?`,
      description: "They'll immediately lose access to this organization.",
      confirmLabel: "Remove member",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/organizations/members/${m.user_id}`);
      toast.success("Member removed");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  const transferDirector = async (m) => {
    const ok = await confirm({
      title: `Transfer Director to ${m.name || m.email}?`,
      description: "They'll become the Director. You'll step down to Assistant Director and keep your access, but you won't be able to change roles or remove users anymore.",
      confirmLabel: "Transfer & step down",
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api.post("/organizations/transfer-director", { new_director_user_id: m.user_id });
      toast.success(`Director transferred to ${r.data.new_director?.name || m.email}`);
      load();
      // Refresh caller's own /me so their UI stops showing Director-only tabs
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to transfer");
    }
  };

  const copyLink = (code) => {
    const link = `${window.location.origin}/onboarding?invite=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedCode(code);
      toast.success("Link copied");
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const inviteBase = typeof window !== "undefined" ? window.location.origin : "";

  if (loading) {
    return (
      <div className="border border-dashed border-[#E4E4E7] p-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#09090B]" />
      </div>
    );
  }

  return (
    <section className="space-y-8" data-testid="org-settings">
      <div className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="eyebrow flex items-center gap-2"><Building2 className="h-3 w-3" /> ORGANIZATION</div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mt-2">{org?.name || "Your organization"}</h2>
          <p className="text-sm text-[#71717A] mt-2">
            Invite people, assign roles, and manage who belongs here.
            {org?.is_default && <span className="block mt-1 text-[10px] font-mono-label text-[#71717A]">DEFAULT ORG — created when the first user signed up</span>}
          </p>
        </div>
        <div className="md:col-span-8 space-y-6">
          {/* Members */}
          <div className="border border-[#E4E4E7] bg-white">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#E4E4E7] bg-[#FAFAFA]">
              <div className="flex items-center gap-2">
                <UsersIcon className="h-3.5 w-3.5" />
                <span className="font-mono-label text-[10px] tracking-widest text-[#71717A]">MEMBERS ({members.length})</span>
              </div>
            </div>
            <ul className="divide-y divide-[#F4F4F5]">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 px-4 py-3" data-testid={`member-${m.user_id}`}>
                  <span className="w-8 h-8 rounded-full bg-[#F4F4F5] flex items-center justify-center overflow-hidden shrink-0">
                    {m.picture ? <img src={m.picture} alt={m.name} className="w-full h-full object-cover" /> : <UsersIcon className="h-4 w-4 text-[#71717A]" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#09090B] truncate flex items-center gap-2">
                      {m.name || m.email}
                      {m.user_id === user?.user_id && <span className="text-[9px] font-mono-label border border-[#E4E4E7] px-1">YOU</span>}
                      {m.is_superadmin && <span className="text-[9px] font-mono-label text-white bg-[#DC2626] px-1">SUPER</span>}
                    </div>
                    <div className="text-xs text-[#71717A] truncate">{m.email}</div>
                  </div>
                  <select
                    value={m.role_id || ""}
                    onChange={(e) => changeMemberRole(m, e.target.value)}
                    disabled={m.user_id === user?.user_id}
                    className="h-8 border border-[#E4E4E7] px-2 text-xs rounded-none bg-white"
                    data-testid={`member-role-${m.user_id}`}
                  >
                    <option value="">— no role —</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {isMeDirector && m.user_id !== user?.user_id && m.role_slug !== "director" && (
                    <button
                      type="button"
                      onClick={() => transferDirector(m)}
                      className="p-1.5 border border-[#E4E4E7] hover:border-[#DC2626] hover:text-[#DC2626]"
                      title="Transfer Director role to this member"
                      data-testid={`member-transfer-${m.user_id}`}
                    >
                      <Crown className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMember(m)}
                    disabled={m.user_id === user?.user_id}
                    className="p-1.5 border border-[#E4E4E7] hover:border-[#EF4444] hover:text-[#EF4444] disabled:opacity-40 disabled:hover:border-[#E4E4E7]"
                    data-testid={`member-remove-${m.user_id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Invites */}
          <div className="border border-[#E4E4E7] bg-white">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#E4E4E7] bg-[#FAFAFA]">
              <div className="flex items-center gap-2">
                <UserPlus className="h-3.5 w-3.5" />
                <span className="font-mono-label text-[10px] tracking-widest text-[#71717A]">ACTIVE INVITES ({activeInvites.length})</span>
              </div>
              <div className="flex items-center gap-1">
                <Button onClick={load} variant="outline" size="sm" className="rounded-none h-8" data-testid="invites-refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button onClick={openNewInvite} className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-8" data-testid="invites-new">
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Create invite
                </Button>
              </div>
            </div>
            {activeInvites.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#71717A]">No active invites yet.</div>
            ) : (
              <ul className="divide-y divide-[#F4F4F5]">
                {activeInvites.map((inv) => (
                  <li key={inv.id} className="px-4 py-3 flex items-center gap-3" data-testid={`invite-${inv.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono uppercase text-sm tracking-widest text-[#09090B]">{inv.code}</span>
                        <span className="text-[10px] font-mono-label border border-[#E4E4E7] px-1 text-[#71717A]">{inv.role_name}</span>
                      </div>
                      <div className="text-xs text-[#71717A] mt-0.5 flex items-center gap-2">
                        {inv.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {inv.email}</span>}
                        <span>expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyLink(inv.code)}
                      className="inline-flex items-center gap-1 border border-[#E4E4E7] hover:border-[#09090B] h-8 px-2 text-xs"
                      data-testid={`invite-copy-${inv.id}`}
                    >
                      {copiedCode === inv.code ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
                      Copy link
                    </button>
                    <button
                      type="button"
                      onClick={() => revokeInvite(inv)}
                      className="p-1.5 border border-[#E4E4E7] hover:border-[#EF4444] hover:text-[#EF4444]"
                      data-testid={`invite-revoke-${inv.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pastInvites.length > 0 && (
            <details className="border border-[#E4E4E7] bg-white">
              <summary className="cursor-pointer px-4 py-2.5 bg-[#FAFAFA] font-mono-label text-[10px] tracking-widest text-[#71717A]">
                PAST INVITES ({pastInvites.length})
              </summary>
              <ul className="divide-y divide-[#F4F4F5]">
                {pastInvites.map((inv) => (
                  <li key={inv.id} className="px-4 py-2 text-xs flex items-center gap-2 text-[#71717A]">
                    <span className="font-mono uppercase tracking-widest">{inv.code}</span>
                    <span className="text-[9px] font-mono-label border border-[#E4E4E7] px-1">{inv.role_name}</span>
                    <span className="ml-auto">
                      {inv.accepted_at ? `Accepted ${new Date(inv.accepted_at).toLocaleDateString()}` : "Revoked"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {/* New Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] rounded-none border-[#09090B]" data-testid="invite-dialog">
          <DialogHeader>
            <div className="eyebrow">NEW / INVITE</div>
            <DialogTitle className="font-display text-2xl tracking-tight">Invite someone</DialogTitle>
            <DialogDescription>
              Generate a one-time code. Share it as a link — anyone with the code joins with the role you pick.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="eyebrow">EMAIL (OPTIONAL)</Label>
              <Input
                data-testid="invite-email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="stagemgr@example.com"
                className="rounded-none border-[#E4E4E7] h-10 mt-1"
              />
            </div>
            <div>
              <Label className="eyebrow">ROLE</Label>
              <select
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                className="w-full h-10 border border-[#E4E4E7] rounded-none px-2 text-sm bg-white mt-1"
                data-testid="invite-role"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="eyebrow">EXPIRES IN (DAYS)</Label>
              <Input
                type="number"
                min="1"
                max="180"
                data-testid="invite-expires"
                value={form.expires_days}
                onChange={(e) => setForm({ ...form, expires_days: e.target.value })}
                className="rounded-none border-[#E4E4E7] h-10 mt-1"
              />
            </div>
            <div className="text-[10px] font-mono-label text-[#71717A]">
              LINK PREVIEW: {inviteBase}/onboarding?invite=<span className="text-[#09090B]">CODE</span>
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)} className="rounded-none h-10">Cancel</Button>
            <Button onClick={createInvite} disabled={busy} className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-10 px-5" data-testid="invite-create-btn">
              {busy ? "Creating…" : "Create invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
