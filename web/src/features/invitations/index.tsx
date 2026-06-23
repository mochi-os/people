// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  EmptyState,
  EntityAvatar,
  GeneralError,
  Input,
  Main,
  usePageTitle,
  getAppPath,
  getErrorMessage,
  PageHeader,
  Skeleton,
  toast,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@mochi/web'
import { UserPlus, UserX, Send, X, Check, Settings } from 'lucide-react'
import {
  useFriendsQuery,
  useAcceptFriendInviteMutation,
  useDeclineFriendInviteMutation,
  useRemoveFriendMutation,
} from '@/hooks/useFriends'
import { AddFriendDialog } from '@/features/friends/components/add-friend-dialog'
import { InviteSettingsDialog } from './invite-settings-dialog'

export function Invitations() {
  const { t } = useLingui()
  usePageTitle(t`Invitations`)
  const appPath = getAppPath()
  const [search, setSearch] = useState('')
  const [addFriendDialogOpen, setAddFriendDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data: friendsData, isLoading, error, refetch } = useFriendsQuery()
  const acceptInviteMutation = useAcceptFriendInviteMutation()
  const declineInviteMutation = useDeclineFriendInviteMutation()
  const removeMutation = useRemoveFriendMutation()

  const filteredReceived = useMemo(() => {
    const list = friendsData?.received ?? []
    return list.filter((invite) =>
      invite.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [friendsData?.received, search])

  const filteredSent = useMemo(() => {
    const list = friendsData?.sent ?? []
    return list.filter((invite) =>
      invite.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [friendsData?.sent, search])

  const handleAcceptInvite = (friendId: string, friendName: string) => {
    acceptInviteMutation.mutate(
      { friendId },
      {
        onSuccess: () => {
          toast.success(t`Invitation accepted`, {
            description: t`You are now friends with ${friendName}.`,
          })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, t`Failed to accept invitation`))
        },
      }
    )
  }

  const handleDeclineInvite = (friendId: string, friendName: string) => {
    declineInviteMutation.mutate(
      { friendId },
      {
        onSuccess: () => {
          toast.success(t`Invitation declined`, {
            description: t`Declined invitation from ${friendName}.`,
          })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, t`Failed to decline invitation`))
        },
      }
    )
  }

  const handleCancelSent = (friendId: string, friendName: string) => {
    removeMutation.mutate(
      { friendId },
      {
        onSuccess: () => {
          toast.success(t`Invitation cancelled`, {
            description: t`Cancelled invitation to ${friendName}.`,
          })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, t`Failed to cancel invitation`))
        },
      }
    )
  }

  const [acceptingAll, setAcceptingAll] = useState(false)
  const [decliningAll, setDecliningAll] = useState(false)
  const [cancellingAll, setCancellingAll] = useState(false)

  const handleAcceptAll = async () => {
    setAcceptingAll(true)
    try {
      const results = await Promise.allSettled(
        (friendsData?.received ?? []).map(({ id }) =>
          acceptInviteMutation.mutateAsync({ friendId: id })
        )
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) {
        toast.error(t`Some invitations could not be accepted`)
      } else {
        toast.success(t`All invitations accepted`)
      }
    } finally {
      setAcceptingAll(false)
    }
  }

  const handleDeclineAll = async () => {
    setDecliningAll(true)
    try {
      const results = await Promise.allSettled(
        (friendsData?.received ?? []).map(({ id }) =>
          declineInviteMutation.mutateAsync({ friendId: id })
        )
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) {
        toast.error(t`Some invitations could not be declined`)
      } else {
        toast.success(t`All invitations declined`)
      }
    } finally {
      setDecliningAll(false)
    }
  }

  const handleCancelAll = async () => {
    setCancellingAll(true)
    try {
      const results = await Promise.allSettled(
        (friendsData?.sent ?? []).map(({ id }) =>
          removeMutation.mutateAsync({ friendId: id })
        )
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) {
        toast.error(t`Some invitations could not be cancelled`)
      } else {
        toast.success(t`All invitations cancelled`)
      }
    } finally {
      setCancellingAll(false)
    }
  }

  const hasReceived = filteredReceived.length > 0
  const hasSent = filteredSent.length > 0
  const hasAny = hasReceived || hasSent

  const searchInput = (
    <Input
      type='text'
      placeholder={t`Search...`}
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className='w-48'
    />
  )

  return (
    <>
      <PageHeader
        title={t`Invitations`}
        icon={<UserPlus className='size-4 md:size-5' />}
        actions={
          <>
            {searchInput}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='outline' size='icon' onClick={() => setSettingsOpen(true)} aria-label={t`Invite settings`}>
                  <Settings className='h-4 w-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t`Invite settings`}</TooltipContent>
            </Tooltip>
            <Button onClick={() => setAddFriendDialogOpen(true)}>
              <UserPlus className='h-4 w-4' />
              <Trans>Add friend</Trans>
            </Button>
          </>
        }
      />
      <Main>
        {error ? (
          <GeneralError
            error={error}
            minimal
            mode='inline'
            reset={refetch}
            className='mb-4'
          />
        ) : null}
        <AddFriendDialog
          open={addFriendDialogOpen}
          onOpenChange={setAddFriendDialogOpen}
        />
        <InviteSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
        {isLoading && !friendsData ? (
          <div className='divide-border divide-y rounded-lg border'>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className='flex items-center justify-between px-4 py-3'
              >
                <div className='flex items-center gap-3'>
                  <div className='flex flex-col gap-1'>
                    <Skeleton className='h-5 w-32' />
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Skeleton className='h-8 w-20' />
                  <Skeleton className='h-8 w-20' />
                </div>
              </div>
            ))}
          </div>
        ) : error && !friendsData ? null : !hasAny ? (
          <EmptyState
            icon={UserPlus}
            title={t`No pending invitations`}
            description={
              search
                ? t`Try adjusting your search` : t`New invitations will appear here`
            }
          />
        ) : (
          <div className='space-y-8'>
            {/* Received Invitations */}
            {hasReceived && (
              <div className='space-y-3'>
                <div className='flex items-center justify-between'>
                  <h2 className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
                    <UserPlus className='h-4 w-4' />
                    {t`Received (${filteredReceived.length})`}
                  </h2>
                  {filteredReceived.length > 1 && (
                    <div className='flex items-center gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={decliningAll || acceptingAll}
                        onClick={handleDeclineAll}
                      >
                        <UserX className='h-3.5 w-3.5' />
                        <Trans>Decline all</Trans>
                      </Button>
                      <Button
                        size='sm'
                        disabled={acceptingAll || decliningAll}
                        onClick={handleAcceptAll}
                      >
                        <Check className='h-3.5 w-3.5' />
                        <Trans>Accept all</Trans>
                      </Button>
                    </div>
                  )}
                </div>
                <div className='divide-border divide-y rounded-md border'>
                  {filteredReceived.map((invite) => (
                    <div
                      key={invite.id}
                      className='hover:bg-hover flex items-center justify-between px-4 py-3 transition-colors'
                    >
                      <div className='flex items-center gap-3'>
                        <EntityAvatar
                          src={`${appPath}/${invite.id}/-/avatar`}
                          styleUrl={`${appPath}/${invite.id}/-/style`}
                          name={invite.name}
                          size="md"
                        />
                        <div className='flex flex-col'>
                          <span className='truncate font-medium'>
                            {invite.name}
                          </span>
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Button
                          size='sm'
                          variant='default'
                          disabled={acceptInviteMutation.isPending}
                          onClick={() =>
                            handleAcceptInvite(invite.id, invite.name)
                          }
                        >
                          <Check className='h-3.5 w-3.5' />
                          <Trans>Accept</Trans>
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={declineInviteMutation.isPending}
                          onClick={() =>
                            handleDeclineInvite(invite.id, invite.name)
                          }
                        >
                          <UserX className='h-3.5 w-3.5' />
                          <Trans>Decline</Trans>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sent Invitations */}
            {hasSent && (
              <div className='space-y-3'>
                <div className='flex items-center justify-between'>
                  <h2 className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
                    <Send className='h-4 w-4' />
                    {t`Sent (${filteredSent.length})`}
                  </h2>
                  {filteredSent.length > 1 && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={cancellingAll}
                      onClick={handleCancelAll}
                    >
                      <X className='h-3.5 w-3.5' />
                      <Trans>Cancel all</Trans>
                    </Button>
                  )}
                </div>
                <div className='divide-border divide-y rounded-md border'>
                  {filteredSent.map((invite) => (
                    <div
                      key={invite.id}
                      className='hover:bg-hover flex items-center justify-between px-4 py-3 transition-colors'
                    >
                      <div className='flex items-center gap-3'>
                        <EntityAvatar
                          src={`${appPath}/${invite.id}/-/avatar`}
                          styleUrl={`${appPath}/${invite.id}/-/style`}
                          name={invite.name}
                          size="md"
                        />
                        <div className='flex flex-col'>
                          <span className='truncate font-medium'>
                            {invite.name}
                          </span>
                          <span className='text-muted-foreground text-xs'>
                            <Trans>Pending</Trans>
                          </span>
                        </div>
                      </div>
                      <Button
                        variant='outline'
                        size='sm'
                        disabled={removeMutation.isPending}
                        onClick={() => handleCancelSent(invite.id, invite.name)}
                      >
                        <X className='h-3.5 w-3.5' />
                        <Trans>Cancel</Trans>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Main>
    </>
  )
}
