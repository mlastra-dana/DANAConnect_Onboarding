export function Progress({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const width = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div className="w-full" aria-label={label}>
      <div className="h-2 rounded-full bg-[#EFEFEF]">
        <div className="h-2 rounded-full bg-primary transition-all duration-300" style={{ width: `${width}%` }} />
      </div>
      {label ? <p className="mt-1 text-xs text-grayText">{label}</p> : null}
    </div>
  );
}
