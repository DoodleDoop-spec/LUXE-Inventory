import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Film, ChevronDown, ChevronRight } from "lucide-react";

export default function Shows() {
  const [shows, setShows] = useState([]);
  const [costumes, setCostumes] = useState([]);
  const [expandedYear, setExpandedYear] = useState({});

  useEffect(() => {
    (async () => {
      const [s, c] = await Promise.all([
        api.get("/shows"),
        api.get("/costumes"),
      ]);
      setShows(s.data);
      setCostumes(c.data);
    })();
  }, []);

  const showsByYear = useMemo(() => {
    const groups = {};
    for (const s of shows) {
      const y = s.year == null ? "Unknown" : String(s.year);
      if (!groups[y]) groups[y] = [];
      groups[y].push(s);
    }
    // Sort keys: numbers descending (newest first), Unknown last
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return parseInt(b, 10) - parseInt(a, 10);
    });
    return keys.map((y) => ({ year: y, shows: groups[y].sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [shows]);

  const countsByShow = useMemo(() => {
    const m = {};
    for (const c of costumes) {
      const ids = new Set();
      if (c.original_show_id) ids.add(c.original_show_id);
      for (const x of c.additional_show_ids || []) ids.add(x);
      for (const id of ids) m[id] = (m[id] || 0) + 1;
    }
    return m;
  }, [costumes]);

  return (
    <div className="space-y-10" data-testid="shows-page">
      <div className="space-y-2">
        <div className="eyebrow">INDEX 05 / SHOWS</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B]">
          Shows
        </h1>
        <p className="text-sm text-[#71717A] max-w-2xl">
          Every show that costumes have appeared in, grouped by year. Click a show to see the
          costumes used in it.
        </p>
      </div>

      {shows.length === 0 ? (
        <div className="border border-[#E4E4E7] p-10 text-center text-[#71717A]">
          No shows yet. Add shows in Settings.
        </div>
      ) : (
        <div className="space-y-6">
          {showsByYear.map(({ year, shows: ys }) => {
            const isOpen = expandedYear[year] !== false; // default open
            return (
              <section key={year} data-testid={`year-section-${year}`}>
                <button
                  type="button"
                  data-testid={`toggle-year-${year}`}
                  onClick={() => setExpandedYear({ ...expandedYear, [year]: !isOpen })}
                  className="flex items-center gap-2 w-full text-left border-b border-[#09090B] pb-2 mb-4"
                >
                  {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  <span className="font-display text-2xl font-bold text-[#09090B] tabular-nums">{year}</span>
                  <span className="text-xs text-[#71717A]">{ys.length} show{ys.length === 1 ? "" : "s"}</span>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#E4E4E7] border border-[#E4E4E7]">
                    {ys.map((s) => (
                      <Link
                        key={s.id}
                        to={`/shows/${s.id}`}
                        data-testid={`show-card-${s.id}`}
                        className="bg-white p-5 hover:bg-[#FAFAFA] transition-colors"
                      >
                        <div className="aspect-video image-empty overflow-hidden mb-4 relative">
                          {s.image_id ? (
                            <img
                              src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${s.image_id}`}
                              alt={s.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film className="h-8 w-8 text-[#A1A1AA]" />
                            </div>
                          )}
                        </div>
                        <div className="font-display font-semibold text-lg text-[#09090B] truncate">{s.name}</div>
                        <div className="text-xs text-[#71717A] mt-1 flex items-center justify-between">
                          <span>{s.year != null ? s.year : "—"}</span>
                          <span className="tabular-nums">{countsByShow[s.id] || 0} costume{(countsByShow[s.id] || 0) === 1 ? "" : "s"}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
