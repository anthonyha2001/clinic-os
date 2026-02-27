import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function PatientsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-24 mt-2" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 max-w-sm rounded-lg" />
        <Skeleton className="h-10 w-20 rounded-lg" />
      </div>
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}
