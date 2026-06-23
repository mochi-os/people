// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { APP_ROUTES } from '@/config/app-routes'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  EntityAvatar,
  HeaderSearch,
  IconButton,
  Main,
  usePageTitle,
  PageHeader,
  ListSkeleton,
  GeneralError,
  getAppPath,
  toast,
  getErrorMessage,
  shellNavigateExternal,
  naturalCompare,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@mochi/web'
import { UserPlus, Users, MessageSquare, UserX } from 'lucide-react'
import { useFriendsQuery, useRemoveFriendMutation } from '@/hooks/useFriends'
import { AddFriendDialog } from './components/add-friend-dialog'

type SortBy = 'name' | 'recent'

export function Friends({ autoAdd }: { autoAdd?: boolean } = {}) {
  const { t } = useLingui()
  usePageTitle(t`Friends`)
  const appPath = getAppPath()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [addFriendDialogOpen, setAddFriendDialogOpen] = useState(autoAdd ?? false)

  const [removeFriendDialog, setRemoveFriendDialog] = useState<{
    open: boolean
    friendId: string
    friendName: string
  }>({ open: false, friendId: '', friendName: '' })

  const {
    data: friendsData,
    isLoading,
    error,
    refetch,
  } = useFriendsQuery()
  const removeFriendMutation = useRemoveFriendMutation()

  const filteredFriends = useMemo(() => {
    const list = friendsData?.friends ?? []
    return list
      .filter((friend) =>
        friend.name.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        if (sortBy === 'recent') {
          return ((b.created as number) ?? 0) - ((a.created as number) ?? 0)
        }
        return naturalCompare(a.name, b.name)
      })
  }, [friendsData?.friends, search, sortBy])

  const handleRemoveFriend = (friendId: string, friendName: string) => {
    setRemoveFriendDialog({ open: true, friendId, friendName })
  }

  const confirmRemoveFriend = () => {
    removeFriendMutation.mutate(
      { friendId: removeFriendDialog.friendId },
      {
        onSuccess: () => {
          setRemoveFriendDialog({ open: false, friendId: '', friendName: '' })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, t`Failed to remove friend`))
        },
      }
    )
  }

  const handleStartChat = (friendId: string, friendName: string) => {
    const base = import.meta.env.VITE_APP_CHAT_URL || APP_ROUTES.CHAT.HOME
    if (!base) {
      toast.error(t`Chat is not configured`)
      return
    }
    const url = `${base}?with=${encodeURIComponent(friendId)}&name=${encodeURIComponent(friendName)}`
    shellNavigateExternal(url)
  }

  return (
    <>
      <PageHeader
        title={t`Friends`}
        icon={<Users className='size-4 md:size-5' />}
        showSidebarTrigger
        primaryAction={
          <div className='flex items-center gap-1.5 md:gap-2'>
            <HeaderSearch
              value={search}
              onValueChange={setSearch}
              placeholder={t`Search...`}
              label={t`Search friends`}
            />
            <IconButton
              label={t`Add friend`}
              variant='default'
              className='md:hidden'
              onClick={() => setAddFriendDialogOpen(true)}
            >
              <UserPlus className='h-4 w-4' />
            </IconButton>
            <Button
              className='hidden md:inline-flex'
              onClick={() => setAddFriendDialogOpen(true)}
            >
              <UserPlus className='h-4 w-4' />
              <Trans>Add friend</Trans>
            </Button>
          </div>
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
        {isLoading && !friendsData ? (
          <ListSkeleton count={5} variant='simple' height='h-16' />
        ) : error && !friendsData ? null : filteredFriends.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? t`No results for "${search}"` : t`No friends yet`}
            description={
              search
                ? t`Try a different name`
                : t`Add friends to start connecting`
            }
          />
        ) : (
          <div className='space-y-2'>
            <div className='flex justify-end'>
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as SortBy)}
              >
                <SelectTrigger className='h-8 w-auto gap-1.5 border-0 bg-transparent text-xs shadow-none focus:ring-0'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align='end'>
                  <SelectItem value='name'>
                    <Trans>Name (A–Z)</Trans>
                  </SelectItem>
                  <SelectItem value='recent'>
                    <Trans>Recently added</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='divide-border divide-y rounded-lg border'>
              {filteredFriends.map((friend) => (
                <div
                  key={friend.id}
                  className='hover:bg-hover flex items-center gap-3 px-4 py-3 transition-colors'
                >
                  <EntityAvatar
                    src={`${appPath}/${friend.id}/-/avatar`}
                    styleUrl={`${appPath}/${friend.id}/-/style`}
                    name={friend.name}
                    size='lg'
                  />
                  <span className='flex-1 truncate font-medium'>
                    <HighlightText text={friend.name} query={search} />
                  </span>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => handleStartChat(friend.id, friend.name)}
                    >
                      <MessageSquare className='h-4 w-4' />
                      <Trans>Chat</Trans>
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant='ghost'
                          size='sm'
                          aria-label={t`Remove ${friend.name}`}
                          disabled={removeFriendMutation.isPending}
                          onClick={() =>
                            handleRemoveFriend(friend.id, friend.name)
                          }
                        >
                          <UserX className='h-4 w-4' />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t`Remove ${friend.name}`}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <AddFriendDialog
          open={addFriendDialogOpen}
          onOpenChange={setAddFriendDialogOpen}
        />

        <ConfirmDialog
          open={removeFriendDialog.open}
          onOpenChange={(open) =>
            setRemoveFriendDialog({ ...removeFriendDialog, open })
          }
          title={t`Remove friend`}
          desc={
            <Trans>
              Are you sure you want to remove{' '}
              <span className='text-foreground font-semibold'>
                {removeFriendDialog.friendName}
              </span>{' '}
              from your friends list? This action cannot be undone.
            </Trans>
          }
          confirmText={
            removeFriendMutation.isPending ? t`Removing...` : t`Remove friend`
          }
          destructive
          handleConfirm={confirmRemoveFriend}
          isLoading={removeFriendMutation.isPending}
        />
      </Main>
    </>
  )
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i === -1) return <>{text}</>
  return (
    <>
      <span className='text-muted-foreground'>{text.slice(0, i)}</span>
      {text.slice(i, i + query.length)}
      <span className='text-muted-foreground'>{text.slice(i + query.length)}</span>
    </>
  )
}
