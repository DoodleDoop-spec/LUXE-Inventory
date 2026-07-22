/**
 * Given a costume and a lookup map of flag categories by id, return the color
 * associated with the costume's primary flag. Falls back to the classic red.
 */
export function getCostumeFlagColor(costume, flagCatById = {}) {
  const flags = costume?.flags || [];
  for (const f of flags) {
    const cat = flagCatById[f?.category_id];
    if (cat?.color) return cat.color;
  }
  return "#EF4444";
}
