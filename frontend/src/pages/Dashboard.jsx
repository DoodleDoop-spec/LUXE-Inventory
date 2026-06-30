import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Boxes, Shirt, Tag, MapPin, ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const SIZES = ["XS", "S", "M", "L", "XL"];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, r] = await Promise.all([
          api.get("/stats"),
          api.get("/costumes"),
        ]);
        setStats(s.data);
        setRecent(r.data.slice(0, 5));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const tiles = [
    { label: "Total Costumes", value: stats?.total_costumes ?? "—", icon: Shirt, testId: "stat-total-costumes" },
    { label: "Total Items", value: stats?.total_items ?? "—", icon: Boxes, testId: "stat-total-items" },
    { label: "Categories", value: stats?.category_count ?? "—", icon: Tag, testId: "stat-categories" },
    { label: "Locations in Use", value: stats?.locations_in_use?.length ?? "—", icon: MapPin, testId: "stat-locations" },
  ];

  return (
    <div className="space-y-12" data-testid="dashboard-page">
      {/* Hero */}
      <section className="grid md:grid-cols-12 gap-6 items-end">
        <div className="md:col-span-8 space-y-4">
          <div className="eyebrow">OVERVIEW / INDEX 01</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight font-bold text-[#09090B] leading-[1.05]">
            The wardrobe,<br />measured precisely.
          </h1>
          <p className="text-base text-[#52525B] max-w-xl leading-relaxed">
            Track every costume by location, total quantity, and size. Search the entire inventory
            in seconds — no spreadsheets, no guesswork.
          </p>
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

      {/* Stat tiles */}
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

      {/* Size breakdown */}
      <section className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-5 space-y-3">
          <div className="eyebrow">DISTRIBUTION / SIZE</div>
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight font-semibold text-[#09090B]">
            Items by size
          </h2>
          <p className="text-sm text-[#71717A] max-w-sm">
            Total count of items across all costumes, broken down by size.
          </p>
        </div>
        <div className="md:col-span-7">
          <div className="border border-[#E4E4E7]">
            {SIZES.map((s, idx) => {
              const value = stats?.by_size?.[s] ?? 0;
              const max = Math.max(...SIZES.map((k) => stats?.by_size?.[k] ?? 0), 1);
              const pct = Math.round((value / max) * 100);
              return (
                <div
                  key={s}
                  data-testid={`size-bar-${s}`}
                  className={`flex items-center px-5 py-4 ${idx !== SIZES.length - 1 ? "border-b border-[#E4E4E7]" : ""}`}
                >
                  <span className="font-mono-label text-sm w-12 text-[#09090B]">{s}</span>
                  <div className="flex-1 mx-4 h-2 bg-[#F4F4F5] relative">
                    <div className="absolute left-0 top-0 h-full bg-[#09090B]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="tabular-nums text-sm font-semibold w-12 text-right text-[#09090B]">{value}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Recent costumes */}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
            {recent.map((c) => (
              <Link
                key={c.id}
                to={`/costume/${c.id}`}
                data-testid={`recent-costume-${c.id}`}
                className="bg-white p-5 hover:bg-[#FAFAFA] transition-colors"
              >
                <div className="aspect-square mb-4 image-empty overflow-hidden">
                  {c.image_id ? (
                    <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`} alt={c.name} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="eyebrow truncate">{c.category}</div>
                <div className="font-display font-semibold text-[#09090B] truncate mt-1">{c.name}</div>
                <div className="text-xs text-[#71717A] mt-1 truncate">{c.location}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
