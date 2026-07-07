import { Outlet, NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { LayoutDashboard, Package, MapPin, Settings as SettingsIcon, Search, X, Film } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/inventory", label: "Inventory", icon: Package, testId: "nav-inventory" },
  { to: "/shows", label: "Shows", icon: Film, testId: "nav-shows" },
  { to: "/locations", label: "Storage", icon: MapPin, testId: "nav-locations" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testId: "nav-settings" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [globalQ, setGlobalQ] = useState("");

  useEffect(() => {
    if (location.pathname === "/inventory") {
      const sp = new URLSearchParams(location.search);
      setGlobalQ(sp.get("q") || "");
    }
  }, [location.pathname, location.search]);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = globalQ.trim();
    navigate(q ? `/inventory?q=${encodeURIComponent(q)}` : "/inventory");
  };

  const clearSearch = () => {
    setGlobalQ("");
    if (location.pathname === "/inventory") navigate("/inventory");
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky-header">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link to="/" data-testid="brand-link" className="flex items-center gap-3 group shrink-0">
              <img
                src="/assets/logo.webp"
                alt="LUXE"
                className="h-11 w-11 object-cover rounded-full ring-1 ring-[#E4E4E7]"
                data-testid="brand-logo"
              />
              <div className="hidden sm:flex flex-col leading-none">
                <span className="font-display font-bold text-[15px] text-[#09090B]">LUXE</span>
                <span className="eyebrow text-[10px] mt-0.5">Inventory Management</span>
              </div>
            </Link>

            <form onSubmit={submitSearch} className="flex-1 max-w-md" data-testid="global-search-form">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                <input
                  data-testid="global-search-input"
                  type="text"
                  value={globalQ}
                  onChange={(e) => setGlobalQ(e.target.value)}
                  placeholder="Search costumes, keywords…"
                  className="w-full pl-10 pr-9 h-10 border border-[#E4E4E7] bg-white text-sm focus:outline-none focus:border-[#09090B]"
                />
                {globalQ && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    data-testid="global-search-clear"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#71717A] hover:text-[#09090B]"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>

            <nav className="flex items-center gap-1" data-testid="main-nav">
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
          </div>
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto px-6 md:px-10 py-8 md:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-[#E4E4E7] mt-16">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-6 flex items-center justify-between">
          <span className="eyebrow">LUXE — INVENTORY MANAGEMENT</span>
          <span className="eyebrow">v 1.3</span>
        </div>
      </footer>
    </div>
  );
}
