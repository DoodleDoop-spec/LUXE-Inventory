import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const sessionId = params.get("session_id");
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    (async () => {
      try {
        const r = await api.post("/auth/session", { session_id: sessionId });
        setUser(r.data.user);
        // Remove the hash and land on the dashboard
        window.history.replaceState({}, "", window.location.pathname);
        navigate("/", { replace: true });
      } catch (err) {
        toast.error(err.response?.data?.detail || "Google sign-in failed");
        navigate("/login", { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center" data-testid="auth-callback">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#09090B] mx-auto" />
        <p className="mt-3 text-sm text-[#71717A] font-mono-label tracking-widest">SIGNING YOU IN…</p>
      </div>
    </div>
  );
}
