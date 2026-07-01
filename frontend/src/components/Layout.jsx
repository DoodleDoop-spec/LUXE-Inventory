import { Outlet, NavLink, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Shirt, MapPin, Sparkles, Settings as SettingsIcon } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/inventory", label: "Inventory", icon: Shirt, testId: "nav-inventory" },
  { to: "/locations", label: "Locations", icon: MapPin, testId: "nav-locations" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testId: "nav-settings" },
];

export default function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky-header">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="flex items-center justify-between h-16">
            <Link to="/" data-testid="brand-link" className="flex items-center gap-3 group">
              <div className="h-8 w-8 bg-[#09090B] flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-display font-bold text-[15px] text-[#09090B]">WARDROBE/OS</span>
                <span className="eyebrow text-[10px] mt-0.5">Costume Inventory</span>
              </div>
            </Link>
            <nav className="flex items-center gap-1" data-testid="main-nav">
              {navItems.map(({ to, label, icon: Icon, testId }) => {
                const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    data-testid={testId}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border ${
                      active
                        ? "bg-[#09090B] text-white border-[#09090B]"
                        : "bg-white text-[#09090B] border-transparent hover:border-[#E4E4E7]"
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    <span className="hidden sm:inline">{label}</span>
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
          <span className="eyebrow">v 1.1</span>
        </div>
      </footer>
    </div>
  );
}
