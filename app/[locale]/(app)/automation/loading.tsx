import { Skeleton } from "@/components/ui/Skeleton";

export default function AutomationLoading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-64 mt-1" />
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="grid gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
