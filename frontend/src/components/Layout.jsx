import { Outlet, NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { LayoutDashboard, Shirt, MapPin, Sparkles, Settings as SettingsIcon, Search } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/inventory", label: "Inventory", icon: Shirt, testId: "nav-inventory" },
  { to: "/locations", label: "Locations", icon: MapPin, testId: "nav-locations" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testId: "nav-settings" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [globalQ, setGlobalQ] = useState("");

  // Sync input with ?q= when on inventory
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

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky-header">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link to="/" data-testid="brand-link" className="flex items-center gap-3 group shrink-0">
              <div className="h-8 w-8 bg-[#09090B] flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="font-display font-bold text-[15px] text-[#09090B]">WARDROBE/OS</span>
                <span className="eyebrow text-[10px] mt-0.5">Costume Inventory</span>
              </div>
            </Link>

            {/* Global search — leftmost tab */}
            <form onSubmit={submitSearch} className="flex-1 max-w-md" data-testid="global-search-form">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                <input
                  data-testid="global-search-input"
                  type="text"
                  value={globalQ}
                  onChange={(e) => setGlobalQ(e.target.value)}
                  placeholder="Search costumes, keywords…"
                  className="w-full pl-10 pr-3 h-10 border border-[#E4E4E7] bg-white text-sm focus:outline-none focus:border-[#09090B]"
                />
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
          <span className="eyebrow">WARDROBE/OS — INTERNAL TOOL</span>
          <span className="eyebrow">v 1.2</span>
        </div>
      </footer>
    </div>
  );
}
