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
      {/* Hook */}
      <path d="M12 6a2 2 0 1 1 2-2" />
      {/* Bar */}
      <path d="M21 17H3l9-6 9 6z" />
    </svg>
  );
}
