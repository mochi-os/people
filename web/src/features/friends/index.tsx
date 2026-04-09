import { useMemo, useState } from 'react'
import { APP_ROUTES } from '@/config/app-routes'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Main,
  usePageTitle,
  PageHeader,
  PageUtilityBar,
  ListSkeleton,
  GeneralError,
  toast,
  getErrorMessage,
  shellNavigateExternal
} from '@mochi/web'
import { UserPlus, Users, MessageSquare, UserX } from 'lucide-react'
import { useFriendsQuery, useRemoveFriendMutation } from '@/hooks/useFriends'
import { AddFriendDialog } from './components/add-friend-dialog'
import { FRIENDS_STRINGS } from './constants'

export function Friends() {
  usePageTitle('Friends')
  const [search, setSearch] = useState('')
  const [addFriendDialogOpen, setAddFriendDialogOpen] = useState(false)
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
    return list.filter((friend) =>
      friend.name.toLowerCase().includes(search.toLowerCase())
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
          toast.error(getErrorMessage(error, 'Failed to remove friend'))
        },
      }
    )
  }

  const handleStartChat = () => {
    const chatUrl = import.meta.env.VITE_APP_CHAT_URL ?? APP_ROUTES.CHAT.HOME
    shellNavigateExternal(chatUrl)
  }

  return (
    <>
      <PageHeader
        title='Friends'
        icon={<Users className='size-4 md:size-5' />}
        showSidebarTrigger
      />
      <PageUtilityBar>
        <Input
          type='text'
          placeholder='Search...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='min-w-0 flex-1 md:w-56 md:flex-none'
        />
        <Button
          onClick={() => setAddFriendDialogOpen(true)}
        >
          <UserPlus className='h-4 w-4' />
          Add friend
        </Button>
      </PageUtilityBar>
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
            title='No friends found'
            description={
              search
                ? 'Try adjusting your search'
                : 'Add friends to start connecting'
            }
          />
        ) : (
          <div className='divide-border divide-y rounded-lg border'>
            {filteredFriends.map((friend) => (
              <div
                key={friend.id}
                className='hover:bg-muted/50 flex items-center justify-between px-4 py-3 transition-colors'
              >
                <span className='truncate font-medium'>{friend.name}</span>
                <div className='flex items-center gap-1'>
                  <Button
                    variant='ghost'
                    size='sm'
                    aria-label={`Start chat with ${friend.name}`}
                    onClick={handleStartChat}
                  >
                    <MessageSquare className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    aria-label={`Remove ${friend.name}`}
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
          title={FRIENDS_STRINGS.REMOVE_FRIEND_DIALOG_TITLE}
          desc={
            <>
              {FRIENDS_STRINGS.REMOVE_FRIEND_CONFIRM_PRE}{' '}
              <span className='text-foreground font-semibold'>
                {removeFriendDialog.friendName}
              </span>{' '}
              {FRIENDS_STRINGS.REMOVE_FRIEND_CONFIRM_POST}
            </>
          }
          confirmText={removeFriendMutation.isPending ? FRIENDS_STRINGS.REMOVING : FRIENDS_STRINGS.REMOVE_FRIEND}
          destructive
          handleConfirm={confirmRemoveFriend}
          isLoading={removeFriendMutation.isPending}
        />
      </Main>
    </>
  )
}
