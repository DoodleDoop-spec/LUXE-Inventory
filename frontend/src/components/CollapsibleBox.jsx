import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

/**
 * A boxed, collapsible row inspired by the Flags list.
 * Left color bar (accentColor), leading icon, title + count, right-side action buttons,
 * body collapsed by default.
 *
 * Props:
 *   accentColor: string (hex or CSS color) — the left bar color
 *   icon: ReactNode (rendered as a small badge)
 *   title: ReactNode
 *   subtitle: ReactNode (small secondary text after title)
 *   actions: ReactNode (edit/delete buttons on the right)
 *   defaultOpen: boolean (default false)
 *   testId: string
 *   children: expanded body
 */
export default function CollapsibleBox({
  accentColor = "#71717A",
  icon = null,
  title,
  subtitle = null,
  actions = null,
  defaultOpen = false,
  testId,
  children,
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="bg-white border border-[#E4E4E7] flex overflow-hidden" data-testid={testId}>
      <div className="w-1 shrink-0" style={{ backgroundColor: accentColor }} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 p-3 md:p-4">
          <button
            type="button"
            data-testid={testId ? `${testId}-toggle` : undefined}
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            {open
              ? <ChevronDown className="h-4 w-4 text-[#09090B] shrink-0" />
              : <ChevronRight className="h-4 w-4 text-[#09090B] shrink-0" />}
            {icon}
            <div className="min-w-0 flex-1">
              <div className="font-display font-semibold text-[#09090B] truncate">{title}</div>
              {subtitle && (
                <div className="text-xs text-[#71717A] truncate mt-0.5">{subtitle}</div>
              )}
            </div>
          </button>
          {actions && (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </div>
        {open && (
          <div className="border-t border-[#E4E4E7] p-4 bg-[#FAFAFA]" data-testid={testId ? `${testId}-body` : undefined}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
