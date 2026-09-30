// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect } from 'react'
import { useLingui } from '@lingui/react/macro'
import { GeneralError, Skeleton, usePageTitle } from '@mochi/web'
import endpoints from '@/api/endpoints'
import { usePersonInformationQuery } from '@/hooks/usePerson'
import { ProfileView } from './profile-view'

function PublicProfileSkeleton() {
  return (
    <div className='mx-auto w-full max-w-3xl'>
      <Skeleton className='aspect-3/1 w-full rounded-lg' />
      <div className='flex items-center gap-4 p-4'>
        <Skeleton className='size-24 shrink-0 rounded-full' />
        <Skeleton className='h-8 w-48' />
      </div>
      <div className='space-y-2 p-4 pt-0'>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-3/4' />
        <Skeleton className='h-4 w-1/2' />
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
  const { t } = useLingui()
  const { data, isLoading, error, refetch } =
    usePersonInformationQuery(fingerprint)

  usePageTitle(data?.name ?? t`Profile`)

  useEffect(() => {
    if (data?.favicon)
      setFavicon(endpoints.person.asset(fingerprint, 'favicon', data.favicon))
    else if (data?.avatar)
      setFavicon(endpoints.person.asset(fingerprint, 'favicon', data.avatar))
  }, [fingerprint, data?.favicon, data?.avatar])

  if (isLoading) {
    return <PublicProfileSkeleton />
  }

  if (error || !data) {
    return (
      <div className='p-4'>
        <GeneralError
          minimal
          mode='inline'
          error={error}
          reset={() => refetch()}
        />
      </div>
    )
  }

  const avatarUrl = data.avatar
    ? endpoints.person.asset(fingerprint, 'avatar', data.avatar)
    : null
  const bannerUrl = data.banner
    ? endpoints.person.asset(fingerprint, 'banner', data.banner)
    : null

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
