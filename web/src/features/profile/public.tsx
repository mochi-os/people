import { useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  EntityAvatar,
  EntityBanner,
  GeneralError,
  Skeleton,
  requestHelpers,
  usePageTitle,
} from '@mochi/web'
import { useQuery } from '@tanstack/react-query'
import type { PersonInformation } from '@/api/types/person'

function PublicProfileSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Skeleton className="aspect-3/1 w-full rounded-lg" />
      <div className="flex items-center gap-4 p-4">
        <Skeleton className="size-24 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="space-y-2 p-4 pt-0">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

function setFavicon(href: string) {
  const existing = document.querySelectorAll('link[rel~="icon"]')
  existing.forEach((n) => n.remove())
  const link = document.createElement('link')
  link.rel = 'icon'
  link.href = href
  document.head.appendChild(link)
}

export function PublicProfile({ fingerprint }: { fingerprint: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['person', 'public-information', fingerprint],
    queryFn: () => requestHelpers.get<PersonInformation>('information'),
  })

  usePageTitle(data?.name ?? 'Profile')

  useEffect(() => {
    if (data?.favicon) setFavicon(`/${fingerprint}/-/favicon?v=${data.favicon}`)
    else if (data?.avatar) setFavicon(`/${fingerprint}/-/favicon?v=${data.avatar}`)
  }, [fingerprint, data?.favicon, data?.avatar])

  if (isLoading) {
    return <PublicProfileSkeleton />
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <GeneralError minimal mode="inline" error={error} reset={() => refetch()} />
      </div>
    )
  }

  const avatarUrl = data.avatar ? `/${fingerprint}/-/avatar?v=${data.avatar}` : null
  const bannerUrl = data.banner ? `/${fingerprint}/-/banner?v=${data.banner}` : null
  const accent = data.style.accent

  const styleVars = accent
    ? ({ '--accent-colour': accent } as React.CSSProperties)
    : undefined

  return (
    <div className="mx-auto w-full max-w-3xl" style={styleVars}>
      {bannerUrl && <EntityBanner src={bannerUrl} className="rounded-lg" />}
      <div className="flex items-center gap-4 p-4">
        <EntityAvatar src={avatarUrl} name={data.name} size={96} />
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--accent-colour, inherit)' }}>
          {data.name}
        </h1>
      </div>
      {data.profile && (
        <div className="markdown-body p-4 text-sm leading-relaxed">
          <Markdown remarkPlugins={[remarkGfm]}>{data.profile}</Markdown>
        </div>
      )}
    </div>
  )
}
