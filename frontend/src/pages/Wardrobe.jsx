import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { User as UserIcon, Shirt, Filter, Users as UsersIcon, Film, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Wardrobe() {
  const [students, setStudents] = useState([]);
  const [costumes, setCostumes] = useState([]);
  const [shows, setShows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [showFilter, setShowFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [s, c, sh, cats] = await Promise.all([
          api.get("/students"),
          api.get("/costumes"),
          api.get("/shows"),
          api.get("/student-categories"),
        ]);
        setStudents(s.data);
        setCostumes(c.data);
        setShows(sh.data);
        setCategories(cats.data);
      } catch {
        toast.error("Failed to load wardrobe data");
      }
    })();
  }, []);

  // Only in-use costumes count towards the show-night wardrobe board.
  const inUse = useMemo(() => costumes.filter((c) => c.in_use), [costumes]);
  const showsById = useMemo(() => Object.fromEntries(shows.map((s) => [s.id, s])), [shows]);
  const catsById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  // Group assigned in-use costumes by student
  const columns = useMemo(() => {
    const map = new Map(); // student_id -> { student, costumes: [] }
    for (const s of students) map.set(s.id, { student: s, costumes: [] });
    // Extra bucket for "unassigned in-use" costumes
    const unassigned = [];
    for (const c of inUse) {
      const ids = c.assigned_student_ids || [];
      if (ids.length === 0) {
        unassigned.push(c);
        continue;
      }
      for (const sid of ids) {
        if (map.has(sid)) map.get(sid).costumes.push(c);
      }
    }
    const cols = [...map.values()].filter((col) => col.costumes.length > 0);
    // Search / filter
    const needle = q.trim().toLowerCase();
    let filtered = cols;
    if (needle) {
      filtered = filtered.filter((col) => [col.student.first_name, col.student.last_name, col.student.display_name].filter(Boolean).some((v) => v.toLowerCase().includes(needle)));
    }
    if (categoryFilter) {
      filtered = filtered.filter((col) => col.student.category_id === categoryFilter);
    }
    if (showFilter) {
      filtered = filtered.map((col) => ({
        ...col,
        costumes: col.costumes.filter((c) => c.current_show_id === showFilter || (c.shows || []).some((s) => s.show_id === showFilter)),
      })).filter((col) => col.costumes.length > 0);
    }
    filtered.sort((a, b) => (a.student.last_name || "").localeCompare(b.student.last_name || ""));
    return { columns: filtered, unassigned };
  }, [students, inUse, q, categoryFilter, showFilter]);

  const totalAssigned = columns.columns.reduce((n, col) => n + col.costumes.length, 0);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="wardrobe-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2"><Shirt className="h-3 w-3" /> WARDROBE / SHOW NIGHT</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight font-bold text-[#09090B] leading-[1.05] mt-2">Wardrobe</h1>
          <p className="text-[#71717A] mt-2 max-w-2xl text-sm">
            Every in-use costume grouped by the student wearing it. Filter by show or category to prep the right pull.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Filter className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <Input
              data-testid="wardrobe-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search students…"
              className="pl-10 h-11 rounded-none border-[#E4E4E7] w-56"
            />
          </div>
          <select
            data-testid="wardrobe-show-filter"
            value={showFilter}
            onChange={(e) => setShowFilter(e.target.value)}
            className="h-11 border border-[#E4E4E7] rounded-none px-2 text-sm bg-white"
          >
            <option value="">All shows</option>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.year ? ` (${s.year})` : ""}</option>
            ))}
          </select>
          <select
            data-testid="wardrobe-category-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-11 border border-[#E4E4E7] rounded-none px-2 text-sm bg-white"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#E4E4E7] border border-[#E4E4E7] bg-white">
        <Stat label="Students on stage" value={columns.columns.length} icon={<UsersIcon className="h-4 w-4" />} testId="wardrobe-stat-students" />
        <Stat label="Costume assignments" value={totalAssigned} icon={<Shirt className="h-4 w-4" />} testId="wardrobe-stat-assignments" />
        <Stat label="Live shows" value={shows.filter((s) => s.is_live).length} icon={<Film className="h-4 w-4" />} testId="wardrobe-stat-live" />
        <Stat label="Unassigned in-use" value={columns.unassigned.length} icon={<Sparkles className="h-4 w-4" />} testId="wardrobe-stat-unassigned" />
      </div>

      {/* Kanban */}
      {columns.columns.length === 0 ? (
        <div className="border border-dashed border-[#E4E4E7] p-16 text-center" data-testid="wardrobe-empty">
          <Shirt className="h-10 w-10 text-[#A1A1AA] mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-[#71717A]">
            No students currently wearing anything. Mark a costume as in-use and assign a student to see it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="wardrobe-kanban">
          {columns.columns.map((col) => {
            const cat = catsById[col.student.category_id];
            return (
              <div key={col.student.id} className="border border-[#E4E4E7] bg-white flex flex-col" data-testid={`wardrobe-col-${col.student.id}`}>
                <div className="p-3 border-b border-[#E4E4E7] flex items-center gap-2 bg-[#FAFAFA]">
                  <div className="w-9 h-9 rounded-full bg-[#F4F4F5] flex items-center justify-center overflow-hidden shrink-0">
                    {col.student.image_id ? (
                      <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${col.student.image_id}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="h-4 w-4 text-[#71717A]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#09090B] truncate">
                      {[col.student.first_name, col.student.last_name].filter(Boolean).join(" ")}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {cat && (
                        <span className="text-[9px] font-mono-label tracking-widest text-white px-1 py-0.5" style={{ backgroundColor: cat.color }}>{cat.name.toUpperCase()}</span>
                      )}
                      {col.student.grade && <span className="text-[10px] text-[#71717A]">{col.student.grade}</span>}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono-label text-[#09090B] tabular-nums bg-white border border-[#E4E4E7] px-1.5 py-0.5">{col.costumes.length}</span>
                </div>
                <div className="p-2 space-y-1.5 max-h-[500px] overflow-y-auto">
                  {col.costumes.map((c) => (
                    <Link key={c.id} to={`/costume/${c.id}`} data-testid={`wardrobe-cost-${c.id}`} className="block border border-[#E4E4E7] hover:border-[#09090B] p-2 group">
                      <div className="flex items-start gap-2">
                        <div className="w-10 h-10 image-empty overflow-hidden flex items-center justify-center shrink-0">
                          {c.image_id ? (
                            <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Shirt className="h-4 w-4 text-[#A1A1AA]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[#09090B] truncate group-hover:underline">{c.name}</div>
                          <div className="text-[10px] text-[#71717A] truncate">
                            {c.category || "—"}{c.sub_location ? ` · ${c.sub_location}` : c.location ? ` · ${c.location}` : ""}
                          </div>
                          {c.current_show_id && showsById[c.current_show_id] && (
                            <div className="mt-1 text-[9px] font-mono-label text-white bg-[#10B981] px-1 inline-flex items-center gap-1">
                              <Film className="h-2.5 w-2.5" /> {showsById[c.current_show_id].name}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned in-use costumes */}
      {columns.unassigned.length > 0 && !showFilter && !categoryFilter && (
        <div className="border border-dashed border-[#E4E4E7] bg-white" data-testid="wardrobe-unassigned">
          <div className="px-4 py-2 border-b border-[#E4E4E7] bg-[#FAFAFA] eyebrow text-[#71717A]">
            UNASSIGNED IN-USE ({columns.unassigned.length})
          </div>
          <div className="p-3 flex flex-wrap gap-2">
            {columns.unassigned.map((c) => (
              <Link key={c.id} to={`/costume/${c.id}`} className="border border-[#E4E4E7] hover:border-[#09090B] px-2 py-1 text-xs">
                {c.name} <span className="text-[#71717A]">({c.in_use_quantity || 0})</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, testId }) {
  return (
    <div className="p-4" data-testid={testId}>
      <div className="text-[10px] font-mono-label tracking-widest text-[#71717A] flex items-center gap-1.5">{icon} {label.toUpperCase()}</div>
      <div className="font-display text-3xl font-semibold text-[#09090B] tabular-nums mt-1">{value}</div>
    </div>
  );
}
