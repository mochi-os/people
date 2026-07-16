// Copyright © 2026 Mochisoft OÜ
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
  toastAction,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  useListAutoAnimate,
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
  const suppressListAnimation =
    (isLoading && !friendsData) || search.trim().length > 0
  const [receivedListRef] = useListAutoAnimate<HTMLDivElement>({
    disabled: suppressListAnimation,
  })
  const [sentListRef] = useListAutoAnimate<HTMLDivElement>({
    disabled: suppressListAnimation,
  })

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

  const handleAcceptInvite = async (friendId: string) => {
    try {
      await toastAction(
        acceptInviteMutation.mutateAsync({ friendId }),
        {
          loading: t`Accepting invitation...`,
          success: t`Invitation accepted`,
          error: (error) =>
            getErrorMessage(error, t`Failed to accept invitation`),
        }
      )
    } catch {
      // toastAction already showed error
    }
  }

  const handleDeclineInvite = async (friendId: string) => {
    try {
      await toastAction(
        declineInviteMutation.mutateAsync({ friendId }),
        {
          loading: t`Declining invitation...`,
          success: t`Invitation declined`,
          error: (error) =>
            getErrorMessage(error, t`Failed to decline invitation`),
        }
      )
    } catch {
      // toastAction already showed error
    }
  }

  const handleCancelSent = async (friendId: string) => {
    try {
      await toastAction(
        removeMutation.mutateAsync({ friendId }),
        {
          loading: t`Cancelling invitation...`,
          success: t`Invitation cancelled`,
          error: (error) =>
            getErrorMessage(error, t`Failed to cancel invitation`),
        }
      )
    } catch {
      // toastAction already showed error
    }
  }

  const [acceptingAll, setAcceptingAll] = useState(false)
  const [decliningAll, setDecliningAll] = useState(false)
  const [cancellingAll, setCancellingAll] = useState(false)

  const handleAcceptAll = async () => {
    setAcceptingAll(true)
    try {
      const results = await toastAction(
        Promise.allSettled(
          (friendsData?.received ?? []).map(({ id }) =>
            acceptInviteMutation.mutateAsync({ friendId: id })
          )
        ),
        {
          loading: t`Accepting invitations...`,
          success: false,
          error: (e) =>
            getErrorMessage(e, t`Failed to accept invitations`),
        }
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) {
        toast.error(t`Some invitations could not be accepted`)
      } else {
        toast.success(t`All invitations accepted`)
      }
    } catch {
      // toastAction already showed error
    } finally {
      setAcceptingAll(false)
    }
  }

  const handleDeclineAll = async () => {
    setDecliningAll(true)
    try {
      const results = await toastAction(
        Promise.allSettled(
          (friendsData?.received ?? []).map(({ id }) =>
            declineInviteMutation.mutateAsync({ friendId: id })
          )
        ),
        {
          loading: t`Declining invitations...`,
          success: false,
          error: (e) =>
            getErrorMessage(e, t`Failed to decline invitations`),
        }
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) {
        toast.error(t`Some invitations could not be declined`)
      } else {
        toast.success(t`All invitations declined`)
      }
    } catch {
      // toastAction already showed error
    } finally {
      setDecliningAll(false)
    }
  }

  const handleCancelAll = async () => {
    setCancellingAll(true)
    try {
      const results = await toastAction(
        Promise.allSettled(
          (friendsData?.sent ?? []).map(({ id }) =>
            removeMutation.mutateAsync({ friendId: id })
          )
        ),
        {
          loading: t`Cancelling invitations...`,
          success: false,
          error: (e) =>
            getErrorMessage(e, t`Failed to cancel invitations`),
        }
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) {
        toast.error(t`Some invitations could not be cancelled`)
      } else {
        toast.success(t`All invitations cancelled`)
      }
    } catch {
      // toastAction already showed error
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
                <div
                  ref={receivedListRef}
                  className='divide-border divide-y rounded-md border'
                >
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
                          onClick={() => handleAcceptInvite(invite.id)}
                        >
                          <Check className='h-3.5 w-3.5' />
                          <Trans>Accept</Trans>
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={declineInviteMutation.isPending}
                          onClick={() => handleDeclineInvite(invite.id)}
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
                <div
                  ref={sentListRef}
                  className='divide-border divide-y rounded-md border'
                >
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
                        onClick={() => handleCancelSent(invite.id)}
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
