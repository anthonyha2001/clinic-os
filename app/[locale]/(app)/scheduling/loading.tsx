import { Skeleton } from "@/components/ui/Skeleton";

export default function SchedulingLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-2 border-b pb-2">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-14 rounded-lg" />
        ))}
      </div>
      <div className="h-[500px] bg-muted rounded-xl" />
    </div>
  );
}
