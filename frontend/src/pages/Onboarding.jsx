import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Building2, Ticket, ArrowRight, Loader2, Sparkles, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, refresh, logout } = useAuth();
  const [mode, setMode] = useState(params.get("invite") ? "invite" : null);
  const [busy, setBusy] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [code, setCode] = useState(params.get("invite") || "");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (user?.org_id) navigate("/", { replace: true });
  }, [user, navigate]);

  // Preview invite when code changes (debounced-ish)
  useEffect(() => {
    const c = code.trim().toUpperCase();
    if (c.length < 6) { setPreview(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/invites/preview/${encodeURIComponent(c)}`);
        if (!cancelled) setPreview(r.data);
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const createOrg = async () => {
    if (!orgName.trim()) { toast.error("Organization name required"); return; }
    setBusy(true);
    try {
      await api.post("/organizations", { name: orgName.trim() });
      await refresh();
      toast.success("Organization created — you're the Director");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create organization");
    }
    setBusy(false);
  };

  const redeem = async () => {
    if (!code.trim()) { toast.error("Enter an invite code"); return; }
    setBusy(true);
    try {
      await api.post("/invites/redeem", { code: code.trim().toUpperCase() });
      await refresh();
      toast.success(`Joined ${preview?.org_name || "the organization"}`);
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to redeem invite");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4 py-10" data-testid="onboarding-page">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="eyebrow flex items-center justify-center gap-2 mb-2">
            <Sparkles className="h-3 w-3" /> WELCOME
          </div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
            Almost there, {user?.name?.split(" ")[0] || "friend"}
          </h1>
          <p className="text-[#71717A] mt-2">
            Pick how you want to get set up. You can invite others as soon as you're in.
          </p>
        </div>

        {!mode && (
          <div className="grid md:grid-cols-2 gap-px bg-[#E4E4E7] border border-[#E4E4E7]" data-testid="onboarding-choice">
            <button
              type="button"
              onClick={() => setMode("create")}
              data-testid="onboarding-create-btn"
              className="bg-white p-8 text-left hover:bg-[#FAFAFA] group"
            >
              <Building2 className="h-8 w-8 text-[#09090B]" strokeWidth={1.5} />
              <div className="font-display text-xl font-semibold text-[#09090B] mt-4">Create a new organization</div>
              <p className="text-sm text-[#71717A] mt-2">
                Start fresh. You'll become the Director and can invite everyone else in.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-sm text-[#09090B] font-medium group-hover:gap-2 transition-all">
                Create org <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("invite")}
              data-testid="onboarding-invite-btn"
              className="bg-white p-8 text-left hover:bg-[#FAFAFA] group"
            >
              <Ticket className="h-8 w-8 text-[#09090B]" strokeWidth={1.5} />
              <div className="font-display text-xl font-semibold text-[#09090B] mt-4">Join with an invite code</div>
              <p className="text-sm text-[#71717A] mt-2">
                Your director sent you a code. Paste it here and we'll drop you into the right role.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-sm text-[#09090B] font-medium group-hover:gap-2 transition-all">
                Redeem code <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="border border-[#E4E4E7] bg-white p-6" data-testid="onboarding-create-form">
            <div className="eyebrow flex items-center gap-2 mb-3"><Building2 className="h-3 w-3" /> NEW ORGANIZATION</div>
            <Label className="eyebrow">NAME</Label>
            <Input
              data-testid="onboarding-org-name"
              autoFocus
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Riverdale Drama Society"
              className="rounded-none border-[#E4E4E7] h-11 mt-1"
            />
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setMode(null)} className="rounded-none h-11">Back</Button>
              <Button disabled={busy} onClick={createOrg} data-testid="onboarding-create-submit" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6 ml-auto">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create organization"}
              </Button>
            </div>
          </div>
        )}

        {mode === "invite" && (
          <div className="border border-[#E4E4E7] bg-white p-6" data-testid="onboarding-invite-form">
            <div className="eyebrow flex items-center gap-2 mb-3"><Ticket className="h-3 w-3" /> REDEEM INVITE</div>
            <Label className="eyebrow">CODE</Label>
            <Input
              data-testid="onboarding-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. T7ZKDBT9QD"
              className="rounded-none border-[#E4E4E7] h-11 mt-1 tracking-widest font-mono uppercase"
            />
            {preview && (
              <div className="mt-3 border border-[#10B981]/40 bg-[#10B981]/5 p-3 text-sm" data-testid="onboarding-invite-preview">
                <div className="font-medium text-[#09090B]">Joining <span className="underline">{preview.org_name}</span></div>
                <div className="text-[#52525B] text-xs mt-0.5">as {preview.role_name}</div>
              </div>
            )}
            {code.trim().length >= 6 && !preview && (
              <div className="mt-3 text-sm text-[#EF4444]">Code not recognised or expired.</div>
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setMode(null)} className="rounded-none h-11">Back</Button>
              <Button disabled={busy || !preview} onClick={redeem} data-testid="onboarding-redeem-submit" className="bg-[#09090B] hover:bg-[#27272A] text-white rounded-none h-11 px-6 ml-auto">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join organization"}
              </Button>
            </div>
          </div>
        )}

        <div className="text-center mt-6">
          <button
            type="button"
            onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
            className="text-xs text-[#71717A] hover:text-[#09090B] inline-flex items-center gap-1"
            data-testid="onboarding-sign-out"
          >
            <LogOut className="h-3 w-3" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
