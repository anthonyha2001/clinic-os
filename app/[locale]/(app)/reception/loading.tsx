import { Skeleton } from "@/components/ui/Skeleton";

export default function ReceptionLoading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48 mt-1" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="rounded-xl border overflow-hidden">
        <div className="border-b px-5 py-4 bg-muted/30">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-5 space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
