/**
 * Simple coat-hanger icon used for the Costumes nav item.
 * Matches Lucide's stroke style so it fits with the rest of the navigation.
 */
export default function HangerIcon({ className = "", strokeWidth = 2, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Hook — a small loop that sits centred above the bar */}
      <path d="M12 10.5V8a2.5 2.5 0 1 1 3-2.45" />
      {/* Bar — spans nearly the full width so the icon reads at any size */}
      <path d="M22 19H2l10-7 10 7z" />
    </svg>
  );
}
