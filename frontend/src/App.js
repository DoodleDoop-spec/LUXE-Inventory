import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import CostumeDetail from "@/pages/CostumeDetail";
import Locations from "@/pages/Locations";
import Settings from "@/pages/Settings";
import Shows from "@/pages/Shows";
import ShowDetail from "@/pages/ShowDetail";
import GroupDetail from "@/pages/GroupDetail";
import Flags from "@/pages/Flags";
import Equipment from "@/pages/Equipment";
import LocationMap from "@/pages/LocationMap";
import Students from "@/pages/Students";
import Wardrobe from "@/pages/Wardrobe";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import { SettingsProvider } from "@/context/SettingsContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { PromptProvider } from "@/components/PromptDialog";
import ScrollToTop from "@/components/ScrollToTop";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children, requireOrg = true }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]" data-testid="auth-loading">
        <Loader2 className="h-8 w-8 animate-spin text-[#09090B]" />
      </div>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (requireOrg && !user.org_id && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

function AppRouter() {
  const location = useLocation();
  // Synchronous check for Google OAuth callback fragment.
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireOrg={false}>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/students" element={<Students />} />
        <Route path="/wardrobe" element={<Wardrobe />} />
        <Route path="/costume/:id" element={<CostumeDetail />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/locations/:id/map" element={<LocationMap />} />
        <Route path="/shows" element={<Shows />} />
        <Route path="/shows/:id" element={<ShowDetail />} />
        <Route path="/group/:id" element={<GroupDetail />} />
        <Route path="/flags" element={<Flags />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <SettingsProvider>
          <ConfirmProvider>
            <PromptProvider>
              <BrowserRouter>
                <ScrollToTop />
                <AppRouter />
              </BrowserRouter>
              <Toaster position="top-right" richColors />
            </PromptProvider>
          </ConfirmProvider>
        </SettingsProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
