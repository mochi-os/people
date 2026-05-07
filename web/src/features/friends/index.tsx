import { useEffect, useMemo, useState } from 'react'
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
  shellNavigateExternal, naturalCompare} from '@mochi/web'
import { UserPlus, Users, MessageSquare, UserX } from 'lucide-react'
import { useFriendsQuery, useRemoveFriendMutation } from '@/hooks/useFriends'
import { AddFriendDialog } from './components/add-friend-dialog'

export function Friends({ autoAdd }: { autoAdd?: boolean } = {}) {
  const { t } = useLingui()
  usePageTitle(t`Friends`)
  const appPath = getAppPath()
  const [search, setSearch] = useState('')
  const [addFriendDialogOpen, setAddFriendDialogOpen] = useState(false)

  useEffect(() => {
    if (autoAdd) setAddFriendDialogOpen(true)
  }, [autoAdd])
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
      .sort((a, b) =>
        naturalCompare(a.name, b.name)
      )
  }, [friendsData?.friends, search])

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
    const base = import.meta.env.VITE_APP_CHAT_URL ?? APP_ROUTES.CHAT.HOME
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
          <ListSkeleton count={5} variant="simple" height="h-16" />
        ) : error && !friendsData ? null : filteredFriends.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t`No friends found`}
            description={
              search
                ? t`Try adjusting your search` : t`Add friends to start connecting`
            }
          />
        ) : (
          <div className='divide-border divide-y rounded-lg border'>
            {filteredFriends.map((friend) => (
              <div
                key={friend.id}
                className='hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors'
              >
                <EntityAvatar
                  src={`${appPath}/${friend.id}/-/avatar`}
                  styleUrl={`${appPath}/${friend.id}/-/style`}
                  name={friend.name}
                  size="lg"
                />
                <span className='flex-1 truncate font-medium'>{friend.name}</span>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => handleStartChat(friend.id, friend.name)}
                  >
                    <MessageSquare className='h-4 w-4' />
                    <Trans>Chat</Trans>
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    aria-label={t`Remove ${friend.name}`}
                    disabled={removeFriendMutation.isPending}
                    onClick={() => handleRemoveFriend(friend.id, friend.name)}
                  >
                    <UserX className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <AddFriendDialog
          open={addFriendDialogOpen}
          onOpenChange={setAddFriendDialogOpen}
        />

        {/* Remove Friend Confirmation Dialog */}
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
          confirmText={removeFriendMutation.isPending ? t`Removing...` : t`Remove friend`}
          destructive
          handleConfirm={confirmRemoveFriend}
          isLoading={removeFriendMutation.isPending}
        />
      </Main>
    </>
  )
}
