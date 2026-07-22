import { Outlet, NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useSettings } from "@/context/SettingsContext";
import { LayoutDashboard, Package, MapPin, Settings as SettingsIcon, Search, X, Film, Flag, Menu, Wrench, Users, LogOut, User as UserIcon } from "lucide-react";
import HangerIcon from "@/components/HangerIcon";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { to: "/", label: "Dash", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/inventory", label: "Costumes", icon: HangerIcon, testId: "nav-inventory" },
  { to: "/equipment", label: "Equipment", icon: Wrench, testId: "nav-equipment" },
  { to: "/students", label: "Students", icon: Users, testId: "nav-students" },
  { to: "/shows", label: "Shows", icon: Film, testId: "nav-shows" },
  { to: "/locations", label: "Storage", icon: MapPin, testId: "nav-locations" },
  { to: "/flags", label: "Flags", icon: Flag, testId: "nav-flags" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testId: "nav-settings" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [globalQ, setGlobalQ] = useState("");
  const { settings } = useSettings();
  const { user, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchInputRef = useRef(null);

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

              <nav className="hidden md:flex items-center gap-0.5" data-testid="main-nav">
                {navItems.map(({ to, label, icon: Icon, testId }) => {
                  const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      data-testid={testId}
                      className={`flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 text-[13px] font-medium border ${
                        active
                          ? "bg-[#09090B] text-white border-[#09090B]"
                          : "bg-white text-[#09090B] border-transparent hover:border-[#E4E4E7]"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
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

              {/* User chip */}
              {user && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((v) => !v)}
                    data-testid="user-menu-toggle"
                    className="flex items-center gap-2 h-9 pl-1.5 pr-3 border border-[#E4E4E7] hover:border-[#09090B]"
                    aria-label="Account menu"
                  >
                    <span className="w-6 h-6 rounded-full bg-[#F4F4F5] flex items-center justify-center overflow-hidden shrink-0">
                      {user.picture ? (
                        <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="h-3.5 w-3.5 text-[#71717A]" />
                      )}
                    </span>
                    <span className="hidden sm:inline text-xs font-medium text-[#09090B] truncate max-w-[120px]">
                      {user.name || user.email}
                    </span>
                  </button>
                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-64 bg-white border border-[#E4E4E7] shadow-md z-40" data-testid="user-menu">
                        <div className="px-4 py-3 border-b border-[#E4E4E7]">
                          <div className="text-xs font-mono-label text-[#71717A]">SIGNED IN AS</div>
                          <div className="text-sm font-medium text-[#09090B] mt-1 truncate">{user.name}</div>
                          <div className="text-xs text-[#71717A] truncate">{user.email}</div>
                          {user.role?.name && (
                            <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono-label tracking-widest bg-[#F4F4F5] px-2 py-0.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: user.role?.color || "#71717A" }} />
                              {user.role.name.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={async () => { setUserMenuOpen(false); await logout(); navigate("/login", { replace: true }); }}
                          data-testid="logout-btn"
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#FAFAFA] flex items-center gap-2 text-[#EF4444]"
                        >
                          <LogOut className="h-4 w-4" /> Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
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
