interface ABCBadgeProps {
  abc: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Badge component for displaying ABC classification with appropriate colors
 *
 * Color scheme:
 * - A: Green (Alta prioridad)
 * - B: Yellow (Prioridad media)
 * - C: Gray (Prioridad baja)
 * - D: Red (Muy baja prioridad)
 */
export function ABCBadge({ abc, size = "sm" }: ABCBadgeProps) {
  // Color classes for each ABC classification
  const colorClasses: Record<string, string> = {
    'A': 'bg-green-100 text-green-700 border-green-200',
    'B': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    'C': 'bg-gray-100 text-gray-600 border-gray-200',
    'D': 'bg-red-100 text-red-700 border-red-200',
  };

  // Size classes
  const sizeClasses: Record<string, string> = {
    'sm': 'px-1.5 py-0.5 text-[10px] min-w-[24px]',
    'md': 'px-2 py-1 text-xs min-w-[28px]',
    'lg': 'px-2.5 py-1.5 text-sm min-w-[32px]',
  };

  const colorClass = colorClasses[abc] || colorClasses['D'];
  const sizeClass = sizeClasses[size] || sizeClasses['sm'];

  return (
    <span
      className={`inline-flex items-center justify-center font-bold rounded border ${colorClass} ${sizeClass}`}
    >
      {abc}
    </span>
  );
}
