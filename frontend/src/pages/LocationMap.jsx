import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { ArrowLeft, Upload, Trash2, Save, X, Square, Circle as CircleIcon, Minus, Type, MousePointer2, Image as ImageIcon, MapPin as MapPinIcon, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const uuid = () => `${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

export default function LocationMap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [loc, setLoc] = useState(null);
  const [allLocations, setAllLocations] = useState([]);
  const [mode, setMode] = useState("none");
  const [imageId, setImageId] = useState(null);
  const [pins, setPins] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [tool, setTool] = useState("select");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const load = async () => {
    try {
      const [r, la] = await Promise.all([
        api.get(`/locations/${id}`),
        api.get("/locations"),
      ]);
      setLoc(r.data);
      setAllLocations(la.data);
      setMode(r.data.map_mode || "none");
      setImageId(r.data.map_image_id || null);
      setPins(r.data.map_pins || []);
      setShapes(r.data.floorplan_shapes || []);
      setDirty(false);
    } catch { toast.error("Location not found"); navigate("/locations"); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const markDirty = () => setDirty(true);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/locations/${id}/map`, {
        map_mode: mode,
        map_image_id: imageId,
        map_pins: pins,
        floorplan_shapes: shapes,
      });
      toast.success("Map saved");
      setDirty(false);
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to save"); }
    setSaving(false);
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImageId(r.data.image_id);
      markDirty();
      toast.success("Photo uploaded");
    } catch (err) { toast.error(err.response?.data?.detail || "Upload failed"); }
    setUploading(false);
    e.target.value = "";
  };

  if (!loc) return <div className="p-8 text-center text-[#71717A]">Loading…</div>;

  const parentLoc = loc.parent_id ? allLocations.find((l) => l.id === loc.parent_id) : null;
  const backTarget = parentLoc ? `/locations/${parentLoc.id}/map` : "/locations";
  const backLabel = parentLoc ? `Back to ${parentLoc.name}` : "Back to storage";

  return (
    <div className="space-y-6" data-testid="location-map-page">
      <div className="flex items-center gap-3 text-sm">
        <Link to={backTarget} data-testid="map-back-link" className="text-[#71717A] hover:text-[#09090B] inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
      </div>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">STORAGE MAP{editMode ? " · EDITING" : ""}</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-[#09090B] mt-2">{loc.path}</h1>
          <p className="text-sm text-[#71717A] mt-1">
            {editMode
              ? "Drag shapes, click a tool, add pins. Save when done."
              : (mode === "none"
                  ? "No map set up yet. Click Edit to add one."
                  : "Click any linked area to open its sublocation map.")}
          </p>
        </div>
        <div className="flex gap-2">
          {editMode ? (
            <>
              <Button onClick={save} disabled={!dirty || saving} data-testid="map-save-btn" className="bg-[#09090B] hover:bg-[#27272A] rounded-none text-white h-10">
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={async () => {
                if (dirty) {
                  const ok = await confirm({ title: "Discard unsaved changes?", confirmLabel: "Discard", danger: true });
                  if (!ok) return;
                  await load();
                }
                setEditMode(false);
              }} data-testid="map-done-btn" className="rounded-none border-[#09090B] h-10">
                Done
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditMode(true)} data-testid="map-edit-btn" className="bg-[#09090B] hover:bg-[#27272A] rounded-none text-white h-10">
              <Pencil className="h-4 w-4 mr-1" /> Edit map
            </Button>
          )}
        </div>
      </div>

      {/* Mode selector — only in edit mode */}
      {editMode && (
      <div className="grid sm:grid-cols-3 gap-2">
        {[
          { v: "none", label: "No map", desc: "Nothing to see here", icon: X },
          { v: "photo", label: "Photo + pins", desc: "Best for a rack or shelf — a photo with labeled pins.", icon: ImageIcon },
          { v: "floorplan", label: "Top-down floor plan", desc: "Best for a whole room — drop labeled shapes.", icon: Square },
        ].map(({ v, label, desc, icon: Icon }) => (
          <button
            key={v}
            data-testid={`map-mode-${v}`}
            onClick={() => { setMode(v); markDirty(); }}
            className={`p-4 border text-left transition ${
              mode === v ? "border-[#09090B] bg-[#09090B] text-white" : "border-[#E4E4E7] bg-white text-[#09090B] hover:border-[#09090B]"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-4 w-4" />
              <div className="font-medium">{label}</div>
            </div>
            <p className={`text-xs ${mode === v ? "text-white/70" : "text-[#71717A]"}`}>{desc}</p>
          </button>
        ))}
      </div>
      )}

      {mode === "photo" && (
        <PhotoPinEditor
          imageId={imageId}
          setImageId={(v) => { setImageId(v); markDirty(); }}
          pins={pins}
          setPins={(v) => { setPins(v); markDirty(); }}
          onUpload={uploadPhoto}
          uploading={uploading}
          childLocations={allLocations.filter((l) => l.parent_id === id)}
          navigate={navigate}
          editMode={editMode}
        />
      )}

      {mode === "floorplan" && (
        <FloorplanEditor
          shapes={shapes}
          setShapes={(v) => { setShapes(v); markDirty(); }}
          tool={tool}
          setTool={setTool}
          childLocations={allLocations.filter((l) => l.parent_id === id)}
          navigate={navigate}
          editMode={editMode}
        />
      )}
    </div>
  );
}

/* ============= PHOTO + PINS EDITOR ============= */
function PhotoPinEditor({ imageId, setImageId, pins, setPins, onUpload, uploading, childLocations = [], navigate, editMode = true }) {
  const imgRef = useRef(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [dragging, setDragging] = useState(null);

  const handleAddPin = (e) => {
    if (!editMode) return;
    if (!imgRef.current) return;
    if (e.target.closest("[data-pin-marker]")) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100;
    const y_pct = ((e.clientY - rect.top) / rect.height) * 100;
    if (x_pct < 0 || y_pct < 0 || x_pct > 100 || y_pct > 100) return;
    const newPin = { id: uuid(), x_pct, y_pct, label: `Pin ${pins.length + 1}`, color: "#EF4444" };
    setPins([...pins, newPin]);
    setSelectedPin(newPin.id);
  };

  const startDrag = (pinId, e) => {
    e.stopPropagation();
    if (!editMode) {
      // In view mode: clicking a linked pin navigates to that sublocation
      const p = pins.find((x) => x.id === pinId);
      if (p?.location_id) navigate(`/locations/${p.location_id}/map`);
      return;
    }
    setDragging(pinId);
    setSelectedPin(pinId);
  };

  const onMove = (e) => {
    if (!dragging || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x_pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y_pct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setPins(pins.map((p) => (p.id === dragging ? { ...p, x_pct, y_pct } : p)));
  };

  const stopDrag = () => setDragging(null);

  const updatePin = (id, patch) => setPins(pins.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const deletePin = (id) => {
    setPins(pins.filter((p) => p.id !== id));
    if (selectedPin === id) setSelectedPin(null);
  };

  const active = pins.find((p) => p.id === selectedPin);

  if (!imageId) {
    if (!editMode) {
      return (
        <div className="border border-[#E4E4E7] bg-[#FAFAFA] p-12 text-center flex flex-col items-center gap-4" data-testid="photo-empty-viewer">
          <ImageIcon className="h-10 w-10 text-[#71717A]" strokeWidth={1.5} />
          <p className="text-sm text-[#71717A]">No photo has been uploaded for this location yet. Click Edit map above to add one.</p>
        </div>
      );
    }
    return (
      <div className="border border-[#E4E4E7] bg-[#FAFAFA] p-12 text-center flex flex-col items-center gap-4" data-testid="photo-empty">
        <ImageIcon className="h-10 w-10 text-[#71717A]" strokeWidth={1.5} />
        <div>
          <h2 className="font-display text-xl font-semibold text-[#09090B] mb-1">Upload a photo</h2>
          <p className="text-sm text-[#71717A] mb-4">A photo of your rack, shelf, or drawer works best.</p>
          <input type="file" accept="image/*" onChange={onUpload} className="hidden" id="map-photo-file" data-testid="map-photo-file" />
          <label htmlFor="map-photo-file" className="cursor-pointer inline-flex items-center gap-2 border border-[#09090B] bg-[#09090B] text-white hover:bg-[#27272A] h-11 px-5 text-sm">
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload photo"}
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-4 gap-4" data-testid="photo-editor">
      <div className={editMode ? "lg:col-span-3 space-y-3" : "lg:col-span-4 space-y-3"}>
        {editMode && (
        <div className="flex items-center gap-2 flex-wrap">
          <input type="file" accept="image/*" onChange={onUpload} className="hidden" id="map-photo-replace" data-testid="map-photo-replace" />
          <label htmlFor="map-photo-replace" className="cursor-pointer inline-flex items-center gap-2 border border-[#E4E4E7] text-[#09090B] hover:bg-[#F4F4F5] h-9 px-3 text-xs">
            <Upload className="h-3.5 w-3.5" /> Replace photo
          </label>
          <button
            type="button"
            onClick={() => setImageId(null)}
            className="inline-flex items-center gap-2 border border-[#E4E4E7] text-[#EF4444] hover:bg-[#FEF2F2] h-9 px-3 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear photo
          </button>
          <span className="text-xs text-[#71717A] ml-2">Click anywhere on the photo to drop a pin. Drag pins to move them.</span>
        </div>
        )}
        <div
          onMouseMove={onMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onClick={handleAddPin}
          className={`relative border border-[#E4E4E7] bg-[#FAFAFA] select-none ${editMode ? "cursor-crosshair" : "cursor-default"}`}
          data-testid="photo-canvas"
        >
          <img
            ref={imgRef}
            src={`${process.env.REACT_APP_BACKEND_URL}/api/images/${imageId}`}
            alt="Storage"
            className="w-full h-auto block pointer-events-none"
            draggable={false}
          />
          {pins.map((p, i) => (
            <div
              key={p.id}
              data-pin-marker
              data-testid={`pin-${p.id}`}
              onMouseDown={(e) => startDrag(p.id, e)}
              onClick={(e) => { e.stopPropagation(); setSelectedPin(p.id); }}
              className={`absolute -translate-x-1/2 -translate-y-full cursor-move ${selectedPin === p.id ? "z-20" : "z-10"}`}
              style={{ left: `${p.x_pct}%`, top: `${p.y_pct}%` }}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center border-2 shadow-lg ${
                    selectedPin === p.id ? "border-white ring-2 ring-[#09090B]" : "border-white"
                  }`}
                  style={{ backgroundColor: p.color || "#EF4444" }}
                >
                  {i + 1}
                </div>
                <div className="w-0.5 h-2" style={{ backgroundColor: p.color || "#EF4444" }} />
                {(p.label || "").trim() && (
                  <div className="bg-white border border-[#E4E4E7] px-1.5 py-0.5 text-[10px] font-mono-label text-[#09090B] max-w-[140px] truncate mt-0.5">
                    {p.label}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editMode && (
      <div className="lg:col-span-1 space-y-3">
        <div className="eyebrow">PINS ({pins.length})</div>
        {pins.length === 0 && (
          <p className="text-xs text-[#71717A]">Click on the photo to add your first pin.</p>
        )}
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {pins.map((p, i) => (
            <div key={p.id} onClick={() => setSelectedPin(p.id)} className={`border p-2 cursor-pointer ${selectedPin === p.id ? "border-[#09090B] bg-[#FAFAFA]" : "border-[#E4E4E7] bg-white hover:border-[#71717A]"}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: p.color || "#EF4444" }}>{i + 1}</div>
                <button type="button" onClick={(e) => { e.stopPropagation(); deletePin(p.id); }} className="ml-auto text-[#71717A] hover:text-[#EF4444]" data-testid={`pin-delete-${p.id}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                data-testid={`pin-label-${p.id}`}
                value={p.label || ""}
                onChange={(e) => updatePin(p.id, { label: e.target.value })}
                placeholder="Label"
                className="rounded-none border-[#E4E4E7] h-8 text-xs"
              />
              {selectedPin === p.id && (
                <>
                  <div className="flex gap-1 mt-1">
                    {["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#71717A"].map((c) => (
                      <button key={c} type="button" onClick={() => updatePin(p.id, { color: c })} className={`w-5 h-5 rounded-full border ${p.color === c ? "border-[#09090B] scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  {childLocations.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="text-[10px] font-mono-label text-[#71717A]">LINK TO SUBLOCATION</div>
                      <select
                        data-testid={`pin-location-${p.id}`}
                        value={p.location_id || ""}
                        onChange={(e) => {
                          const newId = e.target.value || null;
                          const patch = { location_id: newId };
                          if (newId) {
                            const cl = childLocations.find((l) => l.id === newId);
                            const currentLabel = (p.label || "").trim();
                            const isDefault = !currentLabel || /^Pin \d+$/.test(currentLabel);
                            if (cl && isDefault) patch.label = cl.name;
                          }
                          updatePin(p.id, patch);
                        }}
                        className="w-full border border-[#E4E4E7] h-7 text-xs px-1 rounded-none bg-white"
                      >
                        <option value="">— none —</option>
                        {childLocations.map((cl) => (
                          <option key={cl.id} value={cl.id}>{cl.name}</option>
                        ))}
                      </select>
                      {p.location_id && (
                        <button
                          type="button"
                          onClick={() => navigate(`/locations/${p.location_id}/map`)}
                          className="text-[11px] text-[#09090B] underline hover:text-[#3B82F6]"
                          data-testid={`pin-open-${p.id}`}
                        >
                          → Open this sublocation&apos;s map
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

/* ============= FLOORPLAN EDITOR ============= */
function FloorplanEditor({ shapes, setShapes, tool, setTool, childLocations = [], navigate, editMode = true }) {
  const svgRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drag, setDrag] = useState(null); // { id, kind: "move"|"resize", startX, startY, ox, oy, ow, oh }
  const CANVAS_W = 1200;
  const CANVAS_H = 800;

  const relCoords = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const addAt = (x, y) => {
    let shape;
    const idv = uuid();
    if (tool === "rect") shape = { id: idv, type: "rect", x: x - 60, y: y - 30, width: 120, height: 60, label: "Rack", fill_color: "#DBEAFE", stroke_color: "#1D4ED8" };
    else if (tool === "circle") shape = { id: idv, type: "circle", x: x - 30, y: y - 30, width: 60, height: 60, label: "", fill_color: "#FEE2E2", stroke_color: "#B91C1C" };
    else if (tool === "line") shape = { id: idv, type: "line", x, y, width: 120, height: 0, label: "", fill_color: "transparent", stroke_color: "#09090B" };
    else if (tool === "text") shape = { id: idv, type: "text", x, y, width: 120, height: 24, label: "Room label", fill_color: "transparent", stroke_color: "#09090B" };
    else return;
    setShapes([...shapes, shape]);
    setSelectedId(shape.id);
    setTool("select");
  };

  const canvasClick = (e) => {
    if (!editMode) return;
    if (tool === "select") return;
    const { x, y } = relCoords(e);
    addAt(x, y);
  };

  const startShapeDrag = (s, kind, e) => {
    e.stopPropagation();
    if (!editMode) {
      // In view mode: linked shape → navigate to sublocation
      if (s.location_id) navigate(`/locations/${s.location_id}/map`);
      return;
    }
    const { x, y } = relCoords(e);
    setSelectedId(s.id);
    setDrag({ id: s.id, kind, startX: x, startY: y, ox: s.x, oy: s.y, ow: s.width, oh: s.height });
  };

  const SNAP_ANGLE_DEG = 5; // snap when within 5° of straight
  const SNAP_DISTANCE = 12; // snap to another endpoint within 12 units

  const snapLineEndpoint = (fromX, fromY, toX, toY, ignoreId) => {
    // 1) Endpoint-to-endpoint snap: find nearby line endpoints
    for (const other of shapes) {
      if (other.id === ignoreId || other.type !== "line") continue;
      const candidates = [
        { x: other.x, y: other.y },
        { x: other.x + other.width, y: other.y + other.height },
      ];
      for (const c of candidates) {
        const d = Math.hypot(toX - c.x, toY - c.y);
        if (d < SNAP_DISTANCE) return { x: c.x, y: c.y };
      }
    }
    // 2) Straight-angle snap: 0°, 45°, 90°, 135°, 180°…
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: toX, y: toY };
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const snapAngles = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
    for (const sa of snapAngles) {
      if (Math.abs(angle - sa) < SNAP_ANGLE_DEG) {
        const rad = sa * Math.PI / 180;
        return { x: fromX + Math.cos(rad) * len, y: fromY + Math.sin(rad) * len };
      }
    }
    return { x: toX, y: toY };
  };

  const onSvgMove = (e) => {
    if (!drag) return;
    const { x, y } = relCoords(e);
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    setShapes(shapes.map((s) => {
      if (s.id !== drag.id) return s;
      if (drag.kind === "move") return { ...s, x: drag.ox + dx, y: drag.oy + dy };
      if (drag.kind === "resize") {
        if (s.type === "line") {
          // apply snap on the endpoint that is being resized (endpoint2)
          const p1 = { x: s.x, y: s.y };
          const raw = { x: drag.ox + drag.ow + dx, y: drag.oy + drag.oh + dy };
          const snapped = snapLineEndpoint(p1.x, p1.y, raw.x, raw.y, s.id);
          return { ...s, width: snapped.x - s.x, height: snapped.y - s.y };
        }
        return { ...s, width: Math.max(10, drag.ow + dx), height: Math.max(10, drag.oh + dy) };
      }
      if (drag.kind === "endpoint1") {
        // Anchor is endpoint2 = (ox + ow, oy + oh). Snap new endpoint1 relative to it.
        const anchor = { x: drag.ox + drag.ow, y: drag.oy + drag.oh };
        const raw = { x: drag.ox + dx, y: drag.oy + dy };
        const snapped = snapLineEndpoint(anchor.x, anchor.y, raw.x, raw.y, s.id);
        return { ...s, x: snapped.x, y: snapped.y, width: anchor.x - snapped.x, height: anchor.y - snapped.y };
      }
      if (drag.kind === "endpoint2") {
        // Anchor is endpoint1 = (ox, oy). Snap new endpoint2.
        const anchor = { x: drag.ox, y: drag.oy };
        const raw = { x: drag.ox + drag.ow + dx, y: drag.oy + drag.oh + dy };
        const snapped = snapLineEndpoint(anchor.x, anchor.y, raw.x, raw.y, s.id);
        return { ...s, width: snapped.x - anchor.x, height: snapped.y - anchor.y };
      }
      return s;
    }));
  };

  const endDrag = () => setDrag(null);

  const selected = useMemo(() => shapes.find((s) => s.id === selectedId), [shapes, selectedId]);

  const updateSelected = (patch) => setShapes(shapes.map((s) => (s.id === selectedId ? { ...s, ...patch } : s)));
  const deleteSelected = () => {
    if (!selectedId) return;
    setShapes(shapes.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  };

  return (
    <div className="space-y-3" data-testid="floorplan-editor">
      {editMode && (
      <div className="border border-[#E4E4E7] bg-white p-2 flex items-center gap-1 flex-wrap">
        {[
          { v: "select", label: "Select", icon: MousePointer2 },
          { v: "rect", label: "Rectangle (racks, shelves, tables)", icon: Square },
          { v: "circle", label: "Circle (round tables, columns)", icon: CircleIcon },
          { v: "line", label: "Line (walls, dividers)", icon: Minus },
          { v: "text", label: "Text label", icon: Type },
        ].map(({ v, label, icon: Icon }) => (
          <button
            key={v}
            type="button"
            data-testid={`floorplan-tool-${v}`}
            onClick={() => setTool(v)}
            title={label}
            className={`flex items-center gap-1.5 h-9 px-3 text-sm border ${tool === v ? "border-[#09090B] bg-[#09090B] text-white" : "border-[#E4E4E7] hover:border-[#09090B]"}`}
          >
            <Icon className="h-4 w-4" /> {v}
          </button>
        ))}
        <div className="ml-auto text-xs text-[#71717A]">
          {tool === "select" ? "Click a shape to select. Drag to move. Drag corner to resize." : `Click on canvas to place a ${tool}.`}
        </div>
      </div>
      )}

      <div className="grid lg:grid-cols-4 gap-3">
        <div className={editMode ? "lg:col-span-3" : "lg:col-span-4"}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            className={`w-full h-auto border border-[#E4E4E7] bg-[#FAFAFA] ${editMode ? (tool === "select" ? "cursor-default" : "cursor-crosshair") : "cursor-pointer"}`}
            onClick={canvasClick}
            onMouseMove={onSvgMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            data-testid="floorplan-canvas"
          >
            {/* Grid */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E4E4E7" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={CANVAS_W} height={CANVAS_H} fill="url(#grid)" />

            {shapes.map((s) => {
              const isSel = s.id === selectedId;
              const strokeW = isSel ? 3 : 2;
              const strokeCol = isSel ? "#09090B" : (s.stroke_color || "#09090B");
              if (s.type === "rect") {
                return (
                  <g key={s.id} onMouseDown={(e) => startShapeDrag(s, "move", e)} data-testid={`shape-${s.id}`}
                     onDoubleClick={() => { if (s.location_id) navigate(`/locations/${s.location_id}/map`); }}>
                    <rect x={s.x} y={s.y} width={s.width} height={s.height} fill={s.fill_color || "#DBEAFE"} stroke={strokeCol} strokeWidth={strokeW} />
                    {s.label && (
                      <text x={s.x + s.width / 2} y={s.y + s.height / 2 + 5} textAnchor="middle" fill="#09090B" fontSize="14" fontWeight="500">{s.label}</text>
                    )}
                    {s.location_id && (
                      <text x={s.x + s.width - 8} y={s.y + 14} textAnchor="end" fill="#3B82F6" fontSize="10" fontWeight="700">🔗</text>
                    )}
                    {isSel && (
                      <rect x={s.x + s.width - 8} y={s.y + s.height - 8} width={16} height={16} fill="#09090B" style={{ cursor: "nwse-resize" }} onMouseDown={(e) => startShapeDrag(s, "resize", e)} />
                    )}
                  </g>
                );
              }
              if (s.type === "circle") {
                const cx = s.x + s.width / 2;
                const cy = s.y + s.height / 2;
                const rx = s.width / 2;
                const ry = s.height / 2;
                return (
                  <g key={s.id} onMouseDown={(e) => startShapeDrag(s, "move", e)} data-testid={`shape-${s.id}`}
                     onDoubleClick={() => { if (s.location_id) navigate(`/locations/${s.location_id}/map`); }}>
                    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={s.fill_color || "#FEE2E2"} stroke={strokeCol} strokeWidth={strokeW} />
                    {s.label && <text x={cx} y={cy + 5} textAnchor="middle" fill="#09090B" fontSize="14">{s.label}</text>}
                    {s.location_id && (
                      <text x={s.x + s.width - 8} y={s.y + 14} textAnchor="end" fill="#3B82F6" fontSize="10" fontWeight="700">🔗</text>
                    )}
                    {isSel && (
                      <rect x={s.x + s.width - 8} y={s.y + s.height - 8} width={16} height={16} fill="#09090B" style={{ cursor: "nwse-resize" }} onMouseDown={(e) => startShapeDrag(s, "resize", e)} />
                    )}
                  </g>
                );
              }
              if (s.type === "line") {
                const x2 = s.x + s.width;
                const y2 = s.y + s.height;
                return (
                  <g key={s.id} data-testid={`shape-${s.id}`}
                     onDoubleClick={() => { if (s.location_id) navigate(`/locations/${s.location_id}/map`); }}>
                    {/* Invisible thick hitbox for easier clicking */}
                    <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke="transparent" strokeWidth={20} onMouseDown={(e) => startShapeDrag(s, "move", e)} style={{ cursor: "move" }} />
                    <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={4} pointerEvents="none" />
                    {s.label && (
                      <text x={(s.x + x2) / 2} y={(s.y + y2) / 2 - 8} textAnchor="middle" fill="#09090B" fontSize="12" pointerEvents="none">{s.label}</text>
                    )}
                    {isSel && (
                      <>
                        <circle cx={s.x} cy={s.y} r={8} fill="#09090B" stroke="white" strokeWidth={2} style={{ cursor: "move" }} onMouseDown={(e) => startShapeDrag(s, "endpoint1", e)} data-testid={`shape-endpoint1-${s.id}`} />
                        <circle cx={x2} cy={y2} r={8} fill="#09090B" stroke="white" strokeWidth={2} style={{ cursor: "move" }} onMouseDown={(e) => startShapeDrag(s, "endpoint2", e)} data-testid={`shape-endpoint2-${s.id}`} />
                      </>
                    )}
                  </g>
                );
              }
              if (s.type === "text") {
                return (
                  <g key={s.id} onMouseDown={(e) => startShapeDrag(s, "move", e)} data-testid={`shape-${s.id}`}>
                    <text x={s.x} y={s.y} fill="#09090B" fontSize="20" fontWeight="600">{s.label || "Label"}</text>
                    {isSel && (
                      <rect x={s.x - 4} y={s.y - 22} width={Math.max(120, (s.label || "Label").length * 12)} height={28} fill="none" stroke="#09090B" strokeDasharray="4 4" />
                    )}
                  </g>
                );
              }
              return null;
            })}
          </svg>
        </div>

        {/* Properties panel */}
        {editMode && (
        <div className="lg:col-span-1 space-y-3">
          <div className="eyebrow">SHAPES ({shapes.length})</div>
          {!selected ? (
            <p className="text-xs text-[#71717A]">Select a shape to edit its label &amp; color.</p>
          ) : (
            <div className="border border-[#E4E4E7] p-3 space-y-2 bg-[#FAFAFA]">
              <div className="text-[10px] font-mono-label text-[#71717A]">{(selected.type || "").toUpperCase()}</div>
              <Input
                data-testid="floorplan-selected-label"
                value={selected.label || ""}
                onChange={(e) => updateSelected({ label: e.target.value })}
                placeholder="Label"
                className="rounded-none border-[#E4E4E7] h-9 bg-white"
              />
              {(selected.type === "rect" || selected.type === "circle") && (
                <div>
                  <div className="text-[10px] font-mono-label text-[#71717A] mb-1">FILL</div>
                  <div className="flex gap-1 flex-wrap">
                    {["#DBEAFE", "#FEE2E2", "#FEF3C7", "#DCFCE7", "#F5F3FF", "#F3F4F6", "transparent"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSelected({ fill_color: c })}
                        className={`w-6 h-6 border-2 ${selected.fill_color === c ? "border-[#09090B]" : "border-[#E4E4E7]"}`}
                        style={{ backgroundColor: c === "transparent" ? "white" : c, backgroundImage: c === "transparent" ? "linear-gradient(45deg, #F4F4F5 25%, transparent 25%, transparent 75%, #F4F4F5 75%)" : undefined, backgroundSize: c === "transparent" ? "8px 8px" : undefined }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              )}
              {childLocations.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono-label text-[#71717A] mb-1">LINK TO SUBLOCATION</div>
                  <select
                    data-testid="floorplan-selected-location"
                    value={selected.location_id || ""}
                    onChange={(e) => {
                      const newId = e.target.value || null;
                      const patch = { location_id: newId };
                      if (newId) {
                        // Auto-fill the shape's label with the sublocation name
                        // when the user hasn't set a custom label yet.
                        const cl = childLocations.find((l) => l.id === newId);
                        const currentLabel = (selected.label || "").trim();
                        const isDefault = !currentLabel || currentLabel === "Rack" || currentLabel === "Room label" || /^Pin \d+$/.test(currentLabel);
                        if (cl && isDefault) patch.label = cl.name;
                      }
                      updateSelected(patch);
                    }}
                    className="w-full border border-[#E4E4E7] h-8 text-xs px-1 rounded-none bg-white"
                  >
                    <option value="">— none —</option>
                    {childLocations.map((cl) => (
                      <option key={cl.id} value={cl.id}>{cl.name}</option>
                    ))}
                  </select>
                  {selected.location_id && (
                    <button
                      type="button"
                      data-testid="floorplan-open-sublocation"
                      onClick={() => navigate(`/locations/${selected.location_id}/map`)}
                      className="text-[11px] text-[#09090B] underline hover:text-[#3B82F6] mt-1"
                    >
                      → Open sublocation map
                    </button>
                  )}
                  <p className="text-[10px] text-[#A1A1AA] mt-1">Double-click a shape to jump.</p>
                </div>
              )}
              <button
                type="button"
                data-testid="floorplan-delete-selected"
                onClick={deleteSelected}
                className="inline-flex items-center gap-1 border border-[#EF4444] text-[#EF4444] hover:bg-[#FEF2F2] h-8 px-3 text-xs w-full justify-center"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete shape
              </button>
            </div>
          )}
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {shapes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left px-2 py-1.5 text-xs border ${selectedId === s.id ? "border-[#09090B] bg-[#FAFAFA]" : "border-[#E4E4E7] bg-white hover:border-[#71717A]"}`}
              >
                <span className="font-mono-label text-[9px] text-[#71717A]">{(s.type || "").toUpperCase()}</span>
                <span className="ml-2 text-[#09090B]">{s.label || <em className="text-[#A1A1AA]">no label</em>}</span>
              </button>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
