// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  Button,
  GeneralError,
  Skeleton,
  getErrorMessage,
  toastAction,
  usePageTitle,
} from '@mochi/web'
import { Check, Send } from 'lucide-react'
import endpoints from '@/api/endpoints'
import type { GetContactsResponse } from '@/api/types/contacts'
import type { PersonInformation } from '@/api/types/person'
import {
  useAcceptFriendMutation,
  useContactsQuery,
  useInviteFriendMutation,
} from '@/hooks/useContacts'
import { useMyIdentity, usePersonInformationQuery } from '@/hooks/usePerson'
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

// Where the viewer stands with a person, read off the viewer's own contacts: a
// friend, an invitation either way, or neither. Their invitation comes first,
// since accepting it is all there is to do. Null until the contacts load.
export function connection(
  contacts: GetContactsResponse | undefined,
  person: string
): 'friend' | 'pending' | 'invited' | 'none' | null {
  if (!contacts) return null
  if (contacts.contacts.some((row) => row.person === person && row.friend))
    return 'friend'
  if (contacts.received.some((invite) => invite.id === person)) return 'pending'
  if (contacts.sent.some((invite) => invite.id === person)) return 'invited'
  return 'none'
}

// The friend invitation the person's page offers a signed-in visitor, as the
// add dialog's row does: Invite, Invited once sent, or Accept theirs.
function Connect({ person }: { person: PersonInformation }) {
  const { t } = useLingui()
  const { data } = useContactsQuery()
  const invite = useInviteFriendMutation()
  const accept = useAcceptFriendMutation()
  const state = connection(data, person.id)

  const sendInvite = async () => {
    const name = person.name
    try {
      await toastAction(invite.mutateAsync({ person: person.id, name }), {
        loading: t`Sending invitation...`,
        success: t`Invitation sent`,
        successOptions: () => ({
          description: t`A friend invitation has been sent to ${name}.`,
        }),
        error: (error) => getErrorMessage(error, t`Failed to send invitation`),
      })
    } catch {
      // toastAction already showed error
    }
  }

  const acceptInvite = async () => {
    try {
      await toastAction(accept.mutateAsync({ person: person.id }), {
        loading: t`Accepting invitation...`,
        success: t`Invitation accepted`,
        error: (error) =>
          getErrorMessage(error, t`Failed to accept invitation`),
      })
    } catch {
      // toastAction already showed error
    }
  }

  if (state === 'none')
    return (
      <Button
        onClick={sendInvite}
        loading={invite.isPending}
        icon={<Send className='size-4' />}
      >
        {t`Invite`}
      </Button>
    )
  if (state === 'invited')
    return (
      <Button variant='outline' disabled icon={<Send className='size-4' />}>
        {t`Invited`}
      </Button>
    )
  if (state === 'pending')
    return (
      <Button
        onClick={acceptInvite}
        loading={accept.isPending}
        icon={<Check className='size-4' />}
      >
        {t`Accept`}
      </Button>
    )
  return null
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
  // Empty for an anonymous visitor, who has no one to invite from.
  const identity = useMyIdentity()
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
      accounts={data.accounts}
      history={data.history}
      action={
        identity && identity !== data.id ? <Connect person={data} /> : null
      }
    />
  )
}
