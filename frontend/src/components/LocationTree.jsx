import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, MapPin, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function LocationTree(props) {
  const { locations, onAdd, onRename, onDelete, onSelect, renderExtras, counts } = props;
  const countsMap = counts || {};
  const [expanded, setExpanded] = useState({});
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [addingChildId, setAddingChildId] = useState(null);
  const [newChildName, setNewChildName] = useState("");

  const childrenMap = useMemo(() => {
    const m = {};
    for (const l of (locations || [])) {
      const p = l.parent_id || "__root__";
      if (!m[p]) m[p] = [];
      m[p].push(l);
    }
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => a.name.localeCompare(b.name));
    }
    return m;
  }, [locations]);

  const flat = useMemo(() => {
    const out = [];
    const walk = (parentKey, depth) => {
      const kids = childrenMap[parentKey] || [];
      for (const node of kids) {
        const hasKids = (childrenMap[node.id] || []).length > 0;
        out.push({ node, depth, hasKids });
        if (expanded[node.id] && hasKids) {
          walk(node.id, depth + 1);
        }
      }
    };
    walk("__root__", 0);
    return out;
  }, [childrenMap, expanded]);

  const toggle = (id) => setExpanded({ ...expanded, [id]: !expanded[id] });

  const submitRename = async (node) => {
    const v = renameValue.trim();
    if (!v || v === node.name) {
      setRenamingId(null);
      return;
    }
    await onRename(node.id, v);
    setRenamingId(null);
  };

  const submitAddChild = async (parentNode) => {
    const v = newChildName.trim();
    if (!v) { setAddingChildId(null); return; }
    await onAdd(parentNode.id, v);
    setNewChildName("");
    setAddingChildId(null);
    setExpanded((prev) => ({ ...prev, [parentNode.id]: true }));
  };

  const roots = childrenMap["__root__"] || [];

  return (
    <div className="border border-[#E4E4E7]" data-testid="location-tree">
      {roots.length === 0 ? (
        <div className="p-8 text-center text-[#71717A]">No locations yet.</div>
      ) : flat.map(({ node, depth, hasKids }) => {
        const isOpen = !!expanded[node.id];
        const isRenaming = renamingId === node.id;
        const isAddingHere = addingChildId === node.id;
        const countInfo = countsMap[node.path];
        return (
          <div key={node.id}>
            <div
              className="flex items-center px-3 py-2 hover:bg-[#FAFAFA] border-b border-[#E4E4E7] last:border-b-0"
              style={{ paddingLeft: (depth * 22 + 12) + "px" }}
              data-testid={"tree-row-" + node.id}
            >
              <button
                type="button"
                onClick={() => hasKids && toggle(node.id)}
                className="w-5 h-5 flex items-center justify-center text-[#71717A] shrink-0"
                data-testid={"tree-toggle-" + node.id}
                aria-label={isOpen ? "Collapse" : "Expand"}
              >
                {hasKids ? (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
              </button>
              <MapPin className="h-4 w-4 text-[#71717A] mx-2 shrink-0" />
              {isRenaming ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    data-testid={"tree-rename-input-" + node.id}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); submitRename(node); }
                      else if (e.key === "Escape") { setRenamingId(null); }
                    }}
                    className="h-8 rounded-none border-[#09090B] max-w-xs"
                    autoFocus
                  />
                  <button type="button" onClick={() => submitRename(node)} className="p-1 text-[#09090B] hover:bg-[#F4F4F5]" data-testid={"tree-rename-save-" + node.id}>
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setRenamingId(null)} className="p-1 text-[#71717A] hover:bg-[#F4F4F5]" data-testid={"tree-rename-cancel-" + node.id}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect ? onSelect(node) : (hasKids && toggle(node.id))}
                  className="flex-1 text-left font-medium text-[#09090B] hover:underline min-w-0 truncate"
                  data-testid={"tree-name-" + node.id}
                >
                  {node.name}
                </button>
              )}
              {countInfo && !isRenaming && (
                <span className="text-xs text-[#71717A] mr-2 tabular-nums shrink-0">
                  {countInfo.count} · {countInfo.items} items
                </span>
              )}
              {!isRenaming && (
                <div className="flex items-center gap-0.5 shrink-0">
                  {onAdd && depth < 6 && (
                    <button
                      type="button"
                      onClick={() => { setAddingChildId(isAddingHere ? null : node.id); setNewChildName(""); }}
                      className="p-1.5 text-[#71717A] hover:text-[#09090B] hover:bg-[#F4F4F5]"
                      aria-label="Add child"
                      data-testid={"tree-add-child-btn-" + node.id}
                      title="Add nested location"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                  {onRename && (
                    <button
                      type="button"
                      onClick={() => { setRenamingId(node.id); setRenameValue(node.name); }}
                      className="p-1.5 text-[#71717A] hover:text-[#09090B] hover:bg-[#F4F4F5]"
                      aria-label="Rename"
                      data-testid={"tree-rename-btn-" + node.id}
                      title="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(node.id, node.name, (childrenMap[node.id] || []).length)}
                      className="p-1.5 text-[#EF4444] hover:bg-[#FEF2F2]"
                      aria-label="Delete"
                      data-testid={"tree-delete-btn-" + node.id}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {isAddingHere && (
              <div
                className="flex items-center gap-2 px-3 py-2 bg-[#FAFAFA] border-b border-[#E4E4E7]"
                style={{ paddingLeft: ((depth + 1) * 22 + 12) + "px" }}
              >
                <Input
                  data-testid={"tree-new-child-input-" + node.id}
                  value={newChildName}
                  onChange={(e) => setNewChildName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); submitAddChild(node); }
                    else if (e.key === "Escape") { setAddingChildId(null); setNewChildName(""); }
                  }}
                  placeholder={'Add under "' + node.name + '"'}
                  className="h-8 rounded-none border-[#09090B] max-w-xs"
                  autoFocus
                />
                <button type="button" onClick={() => submitAddChild(node)} className="p-1 text-[#09090B] hover:bg-[#F4F4F5]" data-testid={"tree-new-child-save-" + node.id}>
                  <Check className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => { setAddingChildId(null); setNewChildName(""); }} className="p-1 text-[#71717A]" data-testid={"tree-new-child-cancel-" + node.id}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {renderExtras && renderExtras(node, { countInfo, isOpen, depth })}
          </div>
        );
      })}
    </div>
  );
}
