import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { User as UserIcon, Shirt, Filter, Users as UsersIcon, Film, Sparkles, AlertTriangle, Printer, MapPin as MapPinIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Wardrobe() {
  const [students, setStudents] = useState([]);
  const [costumes, setCostumes] = useState([]);
  const [shows, setShows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [showFilter, setShowFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [org, setOrg] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, c, sh, cats, settings] = await Promise.all([
          api.get("/students"),
          api.get("/costumes"),
          api.get("/shows"),
          api.get("/student-categories"),
          api.get("/settings").catch(() => ({ data: {} })),
        ]);
        setStudents(s.data);
        setCostumes(c.data);
        setShows(sh.data);
        setCategories(cats.data);
        setOrg(settings.data || {});
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
  const shortages = useMemo(() => inUse.filter((c) => c.shortage), [inUse]);
  const currentShow = showFilter ? shows.find((s) => s.id === showFilter) : null;

  const handlePrint = () => {
    // Add class so global @media print rules kick in
    document.documentElement.classList.add("printing-run-sheet");
    // Give React a tick to render the print-only DOM (already static here), then print
    setTimeout(() => {
      window.print();
      document.documentElement.classList.remove("printing-run-sheet");
    }, 50);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 space-y-6 wardrobe-screen" data-testid="wardrobe-page">
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
          <Button
            data-testid="wardrobe-print-btn"
            onClick={handlePrint}
            disabled={columns.columns.length === 0}
            className="bg-[#09090B] hover:bg-[#27272A] rounded-none text-white h-11"
          >
            <Printer className="h-4 w-4 mr-1" /> Print Run Sheet
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#E4E4E7] border border-[#E4E4E7] bg-white">
        <Stat label="Students on stage" value={columns.columns.length} icon={<UsersIcon className="h-4 w-4" />} testId="wardrobe-stat-students" />
        <Stat label="Costume assignments" value={totalAssigned} icon={<Shirt className="h-4 w-4" />} testId="wardrobe-stat-assignments" />
        <Stat label="Live shows" value={shows.filter((s) => s.is_live).length} icon={<Film className="h-4 w-4" />} testId="wardrobe-stat-live" />
        <Stat label="Unassigned in-use" value={columns.unassigned.length} icon={<Sparkles className="h-4 w-4" />} testId="wardrobe-stat-unassigned" />
      </div>

      {/* Shortage alert banner */}
      {shortages.length > 0 && (
        <div className="border border-[#EF4444] bg-[#FEF2F2] p-4" data-testid="wardrobe-shortage-banner">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#EF4444] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="eyebrow text-[#7F1D1D]">ASSIGNMENT ALERT · {shortages.length} SHORTAGE{shortages.length === 1 ? "" : "S"}</div>
              <p className="text-sm text-[#7F1D1D] mt-1">
                These in-use costumes have more assigned students than pieces available. Add stock, reassign, or duplicate before showtime.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {shortages.map((c) => (
                  <Link
                    key={c.id}
                    to={`/costume/${c.id}`}
                    data-testid={`wardrobe-shortage-${c.id}`}
                    className="inline-flex items-center gap-1 bg-white border border-[#EF4444] text-[#7F1D1D] px-2 py-0.5 text-xs hover:bg-[#FEE2E2]"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-[10px] tabular-nums">
                      {c.in_use_quantity || 0}/{(c.assigned_student_ids || []).length}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
                    <Link key={c.id} to={`/costume/${c.id}`} data-testid={`wardrobe-cost-${c.id}`} className={`block border p-2 group ${c.shortage ? "border-[#EF4444] bg-[#FEF2F2] hover:border-[#7F1D1D]" : "border-[#E4E4E7] hover:border-[#09090B]"}`}>
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
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {c.current_show_id && showsById[c.current_show_id] && (
                              <div className="text-[9px] font-mono-label text-white bg-[#10B981] px-1 inline-flex items-center gap-1">
                                <Film className="h-2.5 w-2.5" /> {showsById[c.current_show_id].name}
                              </div>
                            )}
                            {c.shortage && (
                              <div className="text-[9px] font-mono-label text-white bg-[#EF4444] px-1 inline-flex items-center gap-1" data-testid={`wardrobe-cost-shortage-${c.id}`}>
                                <AlertTriangle className="h-2.5 w-2.5" /> SHORT
                              </div>
                            )}
                          </div>
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

      {/* Printable run sheet — hidden on screen, shown one page per student when printing */}
      <PrintableRunSheet
        columns={columns.columns}
        showsById={showsById}
        catsById={catsById}
        currentShow={currentShow}
        org={org || {}}
      />
    </div>
  );
}

function PrintableRunSheet({ columns, showsById, catsById, currentShow, org }) {
  const printedAt = new Date().toLocaleString();
  return (
    <div className="wardrobe-print-only" data-testid="wardrobe-print-sheet" aria-hidden="true">
      {columns.map((col) => {
        const student = col.student;
        const cat = catsById[student.category_id];
        const fullName = [student.first_name, student.last_name].filter(Boolean).join(" ") || student.display_name || "Unnamed";
        return (
          <section key={student.id} className="run-sheet-page" data-testid={`run-sheet-page-${student.id}`}>
            <header className="run-sheet-header">
              <div className="run-sheet-eyebrow">
                {(org.org_name || "WARDROBE RUN SHEET").toUpperCase()} {currentShow ? `· ${currentShow.name.toUpperCase()}` : ""}
              </div>
              <h1 className="run-sheet-title">{fullName}</h1>
              <div className="run-sheet-meta">
                {cat && <span className="run-sheet-tag" style={{ borderColor: cat.color }}>{cat.name}</span>}
                {student.grade && <span>Grade {student.grade}</span>}
                {student.pronouns && <span>{student.pronouns}</span>}
                <span className="run-sheet-count">{col.costumes.length} costume{col.costumes.length === 1 ? "" : "s"}</span>
              </div>
            </header>

            {(student.sizes && Object.keys(student.sizes).some((k) => (student.sizes[k] || "").trim())) ||
             (student.measurements && Object.keys(student.measurements).some((k) => (student.measurements[k] || "").trim())) ? (
              <div className="run-sheet-sizes">
                <div className="run-sheet-subtitle">SIZES &amp; MEASUREMENTS</div>
                <div className="run-sheet-size-grid">
                  {Object.entries(student.sizes || {}).filter(([, v]) => (v || "").trim()).map(([k, v]) => (
                    <div key={`s-${k}`} className="run-sheet-size-cell">
                      <div className="run-sheet-size-label">{k}</div>
                      <div className="run-sheet-size-val">{v}</div>
                    </div>
                  ))}
                  {Object.entries(student.measurements || {}).filter(([, v]) => (v || "").trim()).map(([k, v]) => (
                    <div key={`m-${k}`} className="run-sheet-size-cell">
                      <div className="run-sheet-size-label">{k}</div>
                      <div className="run-sheet-size-val">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="run-sheet-costumes">
              <div className="run-sheet-subtitle">ASSIGNED COSTUMES</div>
              {col.costumes.map((c) => {
                const show = c.current_show_id ? showsById[c.current_show_id] : null;
                return (
                  <div key={c.id} className="run-sheet-costume" data-testid={`run-sheet-costume-${c.id}`}>
                    <div className="run-sheet-costume-img">
                      {c.image_id ? (
                        <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${c.image_id}`} alt="" />
                      ) : null}
                    </div>
                    <div className="run-sheet-costume-body">
                      <div className="run-sheet-costume-name">{c.name}</div>
                      <div className="run-sheet-costume-meta">
                        {c.category || "—"}
                        {c.subcategory ? ` · ${c.subcategory}` : ""}
                      </div>
                      <div className="run-sheet-costume-loc">
                        <b>Location:</b> {c.location || "—"}{c.sub_location ? ` · ${c.sub_location}` : ""}
                      </div>
                      {show && (
                        <div className="run-sheet-costume-show">
                          <b>Show:</b> {show.name}{show.year ? ` (${show.year})` : ""}
                        </div>
                      )}
                      {c.in_use_note && (
                        <div className="run-sheet-costume-notes"><b>Notes:</b> {c.in_use_note}</div>
                      )}
                      {c.notes && !c.in_use_note && (
                        <div className="run-sheet-costume-notes"><b>Notes:</b> {c.notes}</div>
                      )}
                    </div>
                    <div className="run-sheet-costume-check">☐</div>
                  </div>
                );
              })}
              {col.costumes.length === 0 && (
                <div className="run-sheet-empty">No assignments</div>
              )}
            </div>

            {student.notes && (
              <div className="run-sheet-student-notes">
                <div className="run-sheet-subtitle">STUDENT NOTES</div>
                <p>{student.notes}</p>
              </div>
            )}

            <footer className="run-sheet-footer">
              Printed {printedAt} · Dresser signature: _______________________
            </footer>
          </section>
        );
      })}
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
