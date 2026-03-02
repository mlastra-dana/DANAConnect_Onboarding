export function Progress({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const width = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div className="w-full" aria-label={label}>
      <div className="h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${width}%` }} />
      </div>
      {label ? <p className="mt-1 text-xs text-slate-500">{label}</p> : null}
    </div>
  );
}
