import { useEffect } from 'react'
import {
  GeneralError,
  requestHelpers,
  usePageTitle,
} from '@mochi/web'
import { useQuery } from '@tanstack/react-query'
import type { PersonInformation } from '@/api/types/person'
import { ProfileView } from './profile-view'

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
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>
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

  return (
    <ProfileView
      name={data.name}
      profile={data.profile}
      accent={data.style.accent}
      avatarUrl={avatarUrl}
      bannerUrl={bannerUrl}
    />
  )
}
