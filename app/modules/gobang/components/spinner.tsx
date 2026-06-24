export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block w-[14px] h-[14px] border-2 border-[rgba(255,250,235,0.2)] border-t-[rgba(229,173,61,0.9)] rounded-full animate-spin ${className}`}
      aria-label="加载中"
    />
  );
}
