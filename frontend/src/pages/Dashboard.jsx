import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Boxes, Shirt, Tag, ArrowUpRight, Plus, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [flagged, setFlagged] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, r, f] = await Promise.all([
          api.get("/stats"),
          api.get("/costumes", { params: { sort: "updated_desc" } }),
          api.get("/flagged"),
        ]);
        setStats(s.data);
        setRecent(r.data.slice(0, 8));
        setFlagged(f.data);
      } catch (e) { console.error(e); }
    })();
  }, []);

  const tiles = [
    { label: "Total Costumes", value: stats?.total_costumes ?? "—", icon: Shirt, testId: "stat-total-costumes" },
    { label: "Total Items", value: stats?.total_items ?? "—", icon: Boxes, testId: "stat-total-items" },
    { label: "Categories", value: stats?.category_count ?? "—", icon: Tag, testId: "stat-categories" },
    { label: "Flagged", value: stats?.flagged_count ?? 0, icon: Flag, testId: "stat-flagged" },
  ];

  return (
    <div className="space-y-12" data-testid="dashboard-page">
      <section className="grid md:grid-cols-12 gap-6 items-end">
        <div className="md:col-span-8 space-y-4">
          <div className="eyebrow">OVERVIEW / INDEX 01</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight font-bold text-[#09090B] leading-[1.05]" data-testid="dashboard-title">
            LUXE Inventory Management System
          </h1>
        </div>
        <div className="md:col-span-4 flex md:justify-end gap-3">
          <Link to="/inventory">
            <Button data-testid="hero-view-inventory" variant="outline" className="border-[#09090B] rounded-none h-11 px-5">
              View Inventory
              <ArrowUpRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
          <Link to="/inventory?new=1">
            <Button data-testid="hero-add-costume" className="bg-[#09090B] hover:bg-[#27272A] rounded-none h-11 px-5 text-white">
              <Plus className="h-4 w-4 mr-1" />
              Add Costume
            </Button>
          </Link>
        </div>
      </section>

      <div className="divider-thick" />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
        {tiles.map(({ label, value, icon: Icon, testId }) => (
          <div key={label} data-testid={testId} className="bg-white p-6 md:p-8 flex flex-col justify-between min-h-[160px]">
            <div className="flex items-center justify-between">
              <span className="eyebrow">{label}</span>
              <Icon className="h-4 w-4 text-[#71717A]" strokeWidth={2} />
            </div>
            <div className="font-display text-5xl font-bold tracking-tight tabular-nums text-[#09090B] mt-6">
              {value}
            </div>
          </div>
        ))}
      </section>

      {flagged.length > 0 && (
        <section data-testid="flagged-section" className="border border-[#EF4444] bg-[#FEF2F2]">
          <div className="p-5 md:p-6 border-b border-[#FCA5A5] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Flag className="h-5 w-5 text-[#EF4444]" fill="currentColor" />
              <div>
                <div className="eyebrow text-[#B91C1C]">FLAGGED / ATTENTION</div>
                <h2 className="font-display text-lg font-semibold text-[#7F1D1D] mt-1">
                  {flagged.length} flagged {flagged.length === 1 ? "costume" : "costumes"}
                </h2>
              </div>
            </div>
          </div>
          <div className="divide-y divide-[#FCA5A5]">
            {flagged.map((c) => (
              <Link
                key={c.id}
                to={`/costume/${c.id}`}
                data-testid={`flagged-${c.id}`}
                className="flex items-center justify-between px-5 md:px-6 py-3 hover:bg-[#FEE2E2]"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[#7F1D1D] truncate">{c.name}</div>
                  <div className="text-xs text-[#B91C1C] truncate">{c.flag_reason || "No reason given"}</div>
                </div>
                <div className="text-xs text-[#B91C1C] shrink-0 ml-4 hidden sm:block">
                  {c.location}{c.sub_location ? ` · ${c.sub_location}` : ""}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="eyebrow">RECENT / UPDATED</div>
            <h2 className="font-display text-2xl sm:text-3xl tracking-tight font-semibold text-[#09090B] mt-2">
              Recently updated
            </h2>
          </div>
          <Link to="/inventory" className="text-sm font-medium text-[#09090B] hover:underline" data-testid="link-view-all">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="border border-[#E4E4E7] p-10 text-center">
            <p className="text-[#71717A] mb-4">No costumes yet. Get started by adding your first costume.</p>
            <Link to="/inventory?new=1">
              <Button data-testid="empty-add-first" className="bg-[#09090B] hover:bg-[#27272A] rounded-none text-white">
                <Plus className="h-4 w-4 mr-1" /> Add your first costume
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
            {recent.map((c) => (
              <Link
                key={c.id}
                to={`/costume/${c.id}`}
                data-testid={`recent-costume-${c.id}`}
                className="bg-white p-5 hover:bg-[#FAFAFA] transition-colors"
              >
                <div className="aspect-square mb-4 image-empty overflow-hidden relative">
                  {c.image_id ? (
                    <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`} alt={c.name} className="w-full h-full object-cover" />
                  ) : null}
                  {c.is_flagged && (
                    <div className="absolute top-2 right-2 bg-[#EF4444] text-white p-1">
                      <Flag className="h-3 w-3" fill="currentColor" />
                    </div>
                  )}
                </div>
                <div className="eyebrow truncate">{c.category}</div>
                <div className="font-display font-semibold text-[#09090B] truncate mt-1">{c.name}</div>
                <div className="text-xs text-[#71717A] mt-1 truncate">
                  {c.location}{c.sub_location ? ` · ${c.sub_location}` : ""}
                </div>
                <div className="mt-2 text-xs tabular-nums text-[#09090B] font-medium">{c.total_quantity} units</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
