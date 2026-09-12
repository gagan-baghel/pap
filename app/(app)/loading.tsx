export default function Loading() {
  return (
    <div className="space-y-3 px-4 pt-[calc(1.25rem+var(--sat))]">
      <div className="skeleton h-8 w-40" />
      <div className="skeleton h-11 w-full rounded-full" />
      <div className="flex gap-2">
        <div className="skeleton h-9 w-24 rounded-full" />
        <div className="skeleton h-9 w-20 rounded-full" />
        <div className="skeleton h-9 w-28 rounded-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card flex gap-3 p-4">
          <div className="skeleton size-14 rounded-2xl" />
          <div className="flex-1 space-y-2 py-1">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
