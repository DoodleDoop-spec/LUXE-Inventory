import { Outlet, NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { LayoutDashboard, Package, MapPin, Settings as SettingsIcon, Search, X, Film, Flag, Menu, Wrench } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/inventory", label: "Inventory", icon: Package, testId: "nav-inventory" },
  { to: "/equipment", label: "Equipment", icon: Wrench, testId: "nav-equipment" },
  { to: "/shows", label: "Shows", icon: Film, testId: "nav-shows" },
  { to: "/locations", label: "Storage", icon: MapPin, testId: "nav-locations" },
  { to: "/flags", label: "Flags", icon: Flag, testId: "nav-flags" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testId: "nav-settings" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [globalQ, setGlobalQ] = useState("");
  const [settings, setSettings] = useState({ org_name: "LUXE", logo_image_id: null });
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/settings");
        setSettings(r.data);
      } catch { /* ignore */ }
    })();
    const onFocus = async () => {
      try { const r = await api.get("/settings"); setSettings(r.data); } catch { /* ignore */ }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (location.pathname === "/inventory") {
      const sp = new URLSearchParams(location.search);
      const q = sp.get("q") || "";
      setGlobalQ(q);
      if (q) setSearchOpen(true);
    }
    setMobileNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = globalQ.trim();
    navigate(q ? `/inventory?q=${encodeURIComponent(q)}` : "/inventory");
  };

  const clearAndCloseSearch = () => {
    setGlobalQ("");
    setSearchOpen(false);
    if (location.pathname === "/inventory") navigate("/inventory");
  };

  const orgName = (settings.org_name || "LUXE").trim() || "LUXE";
  const logoUrl = settings.logo_image_id
    ? `${process.env.REACT_APP_BACKEND_URL}/api/images/${settings.logo_image_id}`
    : null;

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky-header">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10">
          <div className="flex items-center justify-between h-16 gap-3">
            <Link to="/" data-testid="brand-link" className="flex items-center gap-3 group shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt={orgName} className="h-11 w-11 object-cover rounded-full ring-1 ring-[#E4E4E7]" data-testid="brand-logo" />
              ) : (
                <div className="h-11 w-11 rounded-full ring-1 ring-[#E4E4E7] bg-[#09090B] text-white flex items-center justify-center font-display font-bold text-sm tracking-tight" data-testid="brand-logo-fallback">
                  {orgName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="hidden sm:flex flex-col leading-none">
                <span className="font-display font-bold text-[15px] text-[#09090B]" data-testid="brand-org-name">{orgName}</span>
                <span className="eyebrow text-[10px] mt-0.5">Inventory Management</span>
              </div>
            </Link>

            <div className="flex-1 flex items-center justify-end gap-2">
              {searchOpen ? (
                <form onSubmit={submitSearch} className="flex-1 max-w-md" data-testid="global-search-form">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                    <input
                      ref={searchInputRef}
                      data-testid="global-search-input"
                      type="text"
                      value={globalQ}
                      onChange={(e) => setGlobalQ(e.target.value)}
                      placeholder="Search costumes / accessories…"
                      className="w-full pl-10 pr-9 h-10 border border-[#E4E4E7] bg-white text-sm focus:outline-none focus:border-[#09090B]"
                      onBlur={() => { if (!globalQ.trim()) setSearchOpen(false); }}
                    />
                    <button
                      type="button"
                      onClick={clearAndCloseSearch}
                      data-testid="global-search-close"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#71717A] hover:text-[#09090B]"
                      aria-label="Close search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  data-testid="global-search-open"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Open search"
                  className="p-2.5 border border-[#E4E4E7] hover:border-[#09090B] text-[#09090B]"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}

              <nav className="hidden md:flex items-center gap-1" data-testid="main-nav">
                {navItems.map(({ to, label, icon: Icon, testId }) => {
                  const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      data-testid={testId}
                      className={`flex items-center gap-2 px-3 lg:px-4 py-2 text-sm font-medium border ${
                        active
                          ? "bg-[#09090B] text-white border-[#09090B]"
                          : "bg-white text-[#09090B] border-transparent hover:border-[#E4E4E7]"
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                      <span className="hidden lg:inline">{label}</span>
                    </NavLink>
                  );
                })}
              </nav>

              {/* Mobile hamburger */}
              <button
                type="button"
                data-testid="mobile-nav-toggle"
                onClick={() => setMobileNavOpen((v) => !v)}
                aria-label="Toggle navigation"
                className="md:hidden p-2.5 border border-[#E4E4E7] hover:border-[#09090B] text-[#09090B]"
              >
                {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Mobile nav drawer */}
          {mobileNavOpen && (
            <nav className="md:hidden border-t border-[#E4E4E7] py-2 grid grid-cols-4 gap-1" data-testid="mobile-nav">
              {navItems.map(({ to, label, icon: Icon, testId }) => {
                const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    data-testid={`mobile-${testId}`}
                    className={`flex flex-col items-center gap-1 p-2 text-xs font-medium border ${
                      active ? "bg-[#09090B] text-white border-[#09090B]" : "text-[#09090B] border-[#E4E4E7]"
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    <span>{label}</span>
                  </NavLink>
                );
              })}
            </nav>
          )}
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 py-8 md:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-[#E4E4E7] mt-16">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 py-6 flex items-center justify-between">
          <span className="eyebrow" data-testid="footer-org-name">{orgName} — INVENTORY MANAGEMENT</span>
          <span className="eyebrow">v 1.5</span>
        </div>
      </footer>
    </div>
  );
}
