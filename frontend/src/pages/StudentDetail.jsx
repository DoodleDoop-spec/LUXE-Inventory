import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, User as UserIcon, Shirt, Ruler, Film, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [category, setCategory] = useState(null);
  const [costumes, setCostumes] = useState([]);
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, cs, sh, cats] = await Promise.all([
          api.get("/students"),
          api.get("/costumes"),
          api.get("/shows"),
          api.get("/student-categories"),
        ]);
        const st = s.data.find((x) => x.id === id);
        if (!st) { toast.error("Student not found"); navigate("/students"); return; }
        setStudent(st);
        setCostumes(cs.data);
        setShows(sh.data);
        setCategory((cats.data || []).find((c) => c.id === st.category_id) || null);
      } catch {
        toast.error("Failed to load student");
      }
      setLoading(false);
    })();
  }, [id, navigate]);

  const showsById = useMemo(() => Object.fromEntries(shows.map((s) => [s.id, s])), [shows]);

  const assignedGroups = useMemo(() => {
    if (!student) return [];
    // Every costume that lists this student in `assignments`
    const mine = costumes
      .map((c) => {
        const mineAssn = (c.assignments || []).find((a) => a.student_id === student.id);
        if (!mineAssn) return null;
        return { costume: c, assignment: mineAssn };
      })
      .filter(Boolean);
    // Group by show (or "Unassigned to show")
    const byShow = new Map();
    mine.forEach(({ costume, assignment }) => {
      const showKey = costume.current_show_id || "__none__";
      if (!byShow.has(showKey)) byShow.set(showKey, []);
      byShow.get(showKey).push({ costume, assignment });
    });
    // Sort: current live shows first
    return Array.from(byShow.entries())
      .map(([showId, entries]) => ({
        show: showId === "__none__" ? null : showsById[showId] || null,
        entries,
      }))
      .sort((a, b) => {
        const aLive = a.show?.is_live ? 0 : 1;
        const bLive = b.show?.is_live ? 0 : 1;
        return aLive - bLive;
      });
  }, [student, costumes, showsById]);

  if (loading || !student) {
    return <div className="py-20 eyebrow">LOADING…</div>;
  }

  const fullName = [student.first_name, student.last_name].filter(Boolean).join(" ") || student.display_name || "Unnamed student";
  const totalAssignments = assignedGroups.reduce((n, g) => n + g.entries.length, 0);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-8" data-testid="student-detail-page">
      <Link to="/students" data-testid="back-to-students" className="inline-flex items-center text-sm text-[#71717A] hover:text-[#09090B]">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Students
      </Link>

      {/* Header */}
      <div className="grid md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-3">
          <div className="aspect-square image-empty border border-[#E4E4E7] overflow-hidden flex items-center justify-center">
            {student.image_id ? (
              <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${student.image_id}`} alt={fullName} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="h-14 w-14 text-[#A1A1AA]" strokeWidth={1.25} />
            )}
          </div>
        </div>
        <div className="md:col-span-9">
          <div className="eyebrow flex items-center gap-2">
            STUDENT
            {category && (
              <span className="inline-block px-2 py-0.5 text-[10px] font-mono-label" style={{ backgroundColor: `${category.color}20`, color: category.color, border: `1px solid ${category.color}` }}>
                {category.name.toUpperCase()}
              </span>
            )}
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight font-bold text-[#09090B] leading-[1.05] mt-2" data-testid="student-name">
            {fullName}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#52525B] tabular-nums">
            {student.grade && <span>Grade {student.grade}</span>}
            {student.pronouns && <span>{student.pronouns}</span>}
            {student.email && <span>{student.email}</span>}
            <span>
              <b className="text-[#09090B]">{totalAssignments}</b> costume{totalAssignments === 1 ? "" : "s"} assigned
            </span>
          </div>
          {student.notes && (
            <p className="mt-3 text-sm text-[#52525B] max-w-xl">{student.notes}</p>
          )}
        </div>
      </div>

      {/* Sizes + Measurements */}
      {((student.sizes && Object.values(student.sizes).some((v) => (v || "").trim())) ||
        (student.measurements && Object.values(student.measurements).some((v) => (v || "").trim()))) && (
        <section data-testid="student-sizes">
          <div className="eyebrow mb-3 flex items-center gap-1.5"><Ruler className="h-3 w-3" /> SIZES & MEASUREMENTS</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {Object.entries(student.sizes || {})
              .filter(([, v]) => (v || "").trim())
              .map(([k, v]) => (
                <div key={`s-${k}`} className="border border-[#E4E4E7] p-2">
                  <div className="text-[9px] font-mono-label tracking-widest text-[#71717A]">{k.toUpperCase()}</div>
                  <div className="text-sm font-semibold text-[#09090B] mt-1">{v}</div>
                </div>
              ))}
            {Object.entries(student.measurements || {})
              .filter(([, v]) => (v || "").trim())
              .map(([k, v]) => (
                <div key={`m-${k}`} className="border border-dashed border-[#E4E4E7] p-2">
                  <div className="text-[9px] font-mono-label tracking-widest text-[#71717A]">{k.toUpperCase()}</div>
                  <div className="text-sm font-semibold text-[#09090B] mt-1">{v}</div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Assigned costumes, grouped by show */}
      <section data-testid="student-assignments">
        <div className="eyebrow mb-3 flex items-center gap-1.5"><Shirt className="h-3 w-3" /> ASSIGNED COSTUMES</div>
        {assignedGroups.length === 0 ? (
          <div className="border border-dashed border-[#E4E4E7] p-10 text-center text-sm text-[#71717A]">
            No costumes assigned to this student yet.
          </div>
        ) : (
          <div className="space-y-6">
            {assignedGroups.map(({ show, entries }, idx) => (
              <div key={show?.id || `nogroup-${idx}`} className="border border-[#E4E4E7]">
                <div className="px-4 py-2.5 border-b border-[#E4E4E7] bg-[#FAFAFA] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Film className="h-3.5 w-3.5 text-[#71717A]" />
                    <span className="text-sm font-medium text-[#09090B]">
                      {show ? show.name : "Not tagged to a show"}
                    </span>
                    {show?.year && <span className="text-xs text-[#71717A] tabular-nums">({show.year})</span>}
                    {show?.is_live && (
                      <span className="text-[9px] font-mono-label tracking-widest bg-[#10B981] text-white px-1.5 py-0.5">LIVE</span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono-label tracking-widest text-[#71717A]">
                    {entries.length} PIECE{entries.length === 1 ? "" : "S"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px bg-[#E4E4E7]">
                  {entries.map(({ costume, assignment }) => {
                    // Figure out if this student's assigned size mismatches their preferred size
                    const sys = costume.sorting_system || costume.sizing_system || "";
                    const preferred = sys && student.sizes ? (student.sizes[sys] || "") : "";
                    const mismatch = preferred && assignment.size && preferred.toLowerCase() !== assignment.size.toLowerCase();
                    return (
                      <Link
                        key={costume.id}
                        to={`/costume/${costume.id}`}
                        className="bg-white p-3 hover:bg-[#FAFAFA]"
                        data-testid={`student-costume-${costume.id}`}
                      >
                        <div className="aspect-[4/5] image-empty overflow-hidden mb-2 flex items-center justify-center">
                          {costume.image_id ? (
                            <img src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${costume.image_id}`} alt={costume.name} className="w-full h-full object-cover" />
                          ) : (
                            <Shirt className="h-6 w-6 text-[#A1A1AA]" />
                          )}
                        </div>
                        <div className="eyebrow truncate text-[9px]">{costume.category}</div>
                        <div className="text-sm font-semibold text-[#09090B] truncate mt-1">{costume.name}</div>
                        <div className="text-[10px] text-[#71717A] mt-1 flex items-center gap-1 truncate">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          {costume.sub_location || costume.location || "—"}
                        </div>
                        <div className="mt-2 flex items-center gap-1 flex-wrap">
                          {assignment.size ? (
                            <span className={`text-[9px] font-mono-label tracking-widest px-1.5 py-0.5 border ${mismatch ? "border-[#F59E0B] bg-[#FEF3C7] text-[#78350F]" : "border-[#E4E4E7] text-[#09090B]"}`}>
                              SIZE · {assignment.size}
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono-label tracking-widest px-1.5 py-0.5 border border-[#E4E4E7] text-[#A1A1AA]">UNSIZED</span>
                          )}
                          {mismatch && (
                            <span className="text-[9px] font-mono-label text-[#78350F] flex items-center gap-0.5" title={`Prefers size ${preferred}`}>
                              <AlertTriangle className="h-2.5 w-2.5" /> MISMATCH
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
