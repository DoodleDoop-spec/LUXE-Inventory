import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, LogIn, UserPlus, Mail, Lock, Loader2 } from "lucide-react";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);
  const nextPath = new URLSearchParams(location.search).get("next") || "/";

  const startGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password) { toast.error("Email and password required"); return; }
    if (mode === "register" && form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(form.email.trim().toLowerCase(), form.password);
        toast.success("Welcome back");
      } else {
        await register(form.email.trim().toLowerCase(), form.password, form.name.trim());
        toast.success("Account created");
      }
      navigate(nextPath, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || (typeof err.response?.data === "string" ? err.response.data : "Sign-in failed"));
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4" data-testid="login-page">
      <div className="w-full max-w-md bg-white border border-[#E4E4E7] shadow-sm">
        <div className="border-b border-[#E4E4E7] px-6 py-5">
          <div className="eyebrow flex items-center gap-2">
            <Sparkles className="h-3 w-3" /> LUXE / INVENTORY MANAGEMENT
          </div>
          <h1 className="font-display text-3xl tracking-tight font-bold text-[#09090B] mt-2">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="text-sm text-[#71717A] mt-1">
            {mode === "login"
              ? "Welcome back — pick a sign-in method below."
              : "First user in the org becomes Director automatically."}
          </p>
        </div>
        <div className="px-6 py-6 space-y-4">
          <button
            type="button"
            onClick={startGoogle}
            data-testid="login-google-btn"
            className="w-full h-11 border border-[#09090B] text-[#09090B] hover:bg-[#F4F4F5] inline-flex items-center justify-center gap-2 font-medium"
          >
            <GoogleG /> Continue with Google
          </button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#E4E4E7]" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-[#71717A] font-mono-label tracking-widest">or with email</span>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-3" data-testid="login-form">
            {mode === "register" && (
              <div>
                <Label className="eyebrow">NAME (OPTIONAL)</Label>
                <Input
                  data-testid="login-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="rounded-none border-[#E4E4E7] h-11 mt-1"
                  placeholder="Jane Doe"
                />
              </div>
            )}
            <div>
              <Label className="eyebrow">EMAIL</Label>
              <div className="relative mt-1">
                <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                <Input
                  data-testid="login-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="rounded-none border-[#E4E4E7] h-11 pl-10"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <Label className="eyebrow">PASSWORD</Label>
              <div className="relative mt-1">
                <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                <Input
                  data-testid="login-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="rounded-none border-[#E4E4E7] h-11 pl-10"
                  placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={busy}
              data-testid="login-submit"
              className="w-full h-11 bg-[#09090B] hover:bg-[#27272A] text-white rounded-none"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "login" ? <><LogIn className="h-4 w-4 mr-1" /> Sign in</> : <><UserPlus className="h-4 w-4 mr-1" /> Create account</>)}
            </Button>
          </form>
          <div className="text-sm text-center text-[#71717A]">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button type="button" onClick={() => setMode("register")} className="text-[#09090B] underline hover:no-underline" data-testid="login-toggle-register">
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-[#09090B] underline hover:no-underline" data-testid="login-toggle-login">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.9 0 6.6 1.7 8.1 3.1l6-5.8C34.3 3.4 29.6 1.5 24 1.5 14.6 1.5 6.5 6.9 2.6 14.7l7 5.4C11.5 14.4 17.2 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.6c-.5 3-2.2 5.6-4.7 7.3l7.2 5.6c4.2-3.9 6.4-9.6 6.4-17.4z" />
      <path fill="#FBBC05" d="M9.6 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7-5.4C1.1 17.6 0 20.7 0 24s1.1 6.4 2.6 10l7-5.4z" />
      <path fill="#34A853" d="M24 46.5c6.5 0 11.9-2.1 15.8-5.8l-7.2-5.6c-2 1.4-4.6 2.2-8.6 2.2-6.8 0-12.5-4.9-14.4-11.5l-7 5.4C6.5 41.1 14.6 46.5 24 46.5z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
