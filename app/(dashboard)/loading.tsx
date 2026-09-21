import { Skeleton } from '@/components/ui/primitives'

export default function DashboardLoading() {
  return (
    <div>
      <div className="border-b border-border bg-background px-3 pt-4 sm:px-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-3 w-64" />
        <div className="mt-4 h-4" />
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}
