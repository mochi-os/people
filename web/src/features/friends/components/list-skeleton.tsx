import { Skeleton } from '@mochi/common'

export function FriendListSkeleton() {
  return (
    <div className='divide-border divide-y rounded-lg border'>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className='flex items-center justify-between px-4 py-3'>
          <Skeleton className='h-5 w-32' />
          <div className='flex items-center gap-1'>
            <Skeleton className='h-8 w-8' />
            <Skeleton className='h-8 w-8' />
          </div>
        </div>
      ))}
    </div>
  )
}
