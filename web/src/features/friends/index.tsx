import { useMemo, useState } from 'react'
import { APP_ROUTES } from '@/config/app-routes'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  EmptyState,
  Main,
  usePageTitle,
  useScreenSize,
  PageHeader,
  Skeleton,
  toast,
} from '@mochi/common'
import { UserPlus, Users, MessageSquare, UserX, Minus } from 'lucide-react'
import type { Friend } from '@/api/types/friends'
import { useCreateChatMutation } from '@/hooks/useChats'
import { useFriendsQuery, useRemoveFriendMutation } from '@/hooks/useFriends'
import { AddFriendDialog } from './components/add-friend-dialog'
import { SuggestedFriendsList } from './components/suggested-friends-list'
import { FRIENDS_STRINGS } from './constants'

export function Friends() {
  usePageTitle('Friends')
  const { isMobile } = useScreenSize()
  const [search, setSearch] = useState('')
  const [addFriendDialogOpen, setAddFriendDialogOpen] = useState(false)
  const [removeFriendDialog, setRemoveFriendDialog] = useState<{
    open: boolean
    friendId: string
    friendName: string
  }>({ open: false, friendId: '', friendName: '' })
  const [pendingChatFriendId, setPendingChatFriendId] = useState<string | null>(
    null
  )
  const { data: friendsData, isLoading, isError, error } = useFriendsQuery()
  const removeFriendMutation = useRemoveFriendMutation()
  const startChatMutation = useCreateChatMutation({
    onSuccess: (data) => {
      setPendingChatFriendId(null)
      toast.success(FRIENDS_STRINGS.SUCCESS_CHAT_READY, {
        description: FRIENDS_STRINGS.SUCCESS_REDIRECTING,
      })
      const chatId = data.id
      if (!chatId) {
        return
      }
      let chatBaseUrl =
        import.meta.env.VITE_APP_CHAT_URL ?? APP_ROUTES.CHAT.HOME

      // Ensure chatBaseUrl ends with a slash before appending search params
      if (!chatBaseUrl.endsWith('/')) {
        chatBaseUrl = chatBaseUrl + '/'
      }

      const chatUrl = chatBaseUrl.startsWith('http')
        ? new URL(chatBaseUrl, undefined)
        : new URL(chatBaseUrl, window.location.origin)

      // Append chatId to the path
      chatUrl.pathname = chatUrl.pathname + chatId
      /**
       * NOTE: Chat lives in a separate micro-app. Use full-page navigation so the chat app
       * can bootstrap with the selected chat ID.
       */
      window.location.assign(chatUrl.toString())
    },
    onError: (error) => {
      setPendingChatFriendId(null)
      const description =
        error instanceof Error ? error.message : FRIENDS_STRINGS.ERR_GENERIC
      toast.error(FRIENDS_STRINGS.ERR_START_CHAT, { description })
    },
  })

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
      }
    )
  }

  const handleStartChat = (friend: Friend) => {
    if (startChatMutation.isPending) {
      return
    }

    const chatName = friend.name?.trim()
    if (!chatName) {
      toast.error(FRIENDS_STRINGS.ERR_START_CHAT, {
        description: FRIENDS_STRINGS.ERR_MISSING_NAME,
      })
      return
    }

    // TODO: Reuse an existing DM once chat-to-friend mapping is available.
    setPendingChatFriendId(friend.id)
    startChatMutation.mutate({ participantIds: [friend.id], name: chatName })
  }

  if (isError) {
    return (
      <Main>
        <div className='flex h-64 flex-col items-center justify-center gap-2'>
          <div className='text-destructive font-medium'>
            Failed to load friends
          </div>
          <div className='text-muted-foreground text-sm'>
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </div>
      </Main>
    )
  }

  if (isLoading && !friendsData) {
    return (
      <Main>
        <div className='divide-border divide-y rounded-lg border'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className='flex items-center justify-between px-4 py-3'
            >
              <Skeleton className='h-5 w-32' />
              <div className='flex items-center gap-1'>
                <Skeleton className='h-8 w-8' />
                <Skeleton className='h-8 w-8' />
              </div>
            </div>
          ))}
        </div>
      </Main>
    )
  }

  const searchInput = (
    <input
      type='text'
      placeholder='Search...'
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className='border-border bg-background focus:ring-ring w-48 rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none'
    />
  )

  return (
    <>
      <PageHeader
        title='Friends'
        icon={<Users className='size-4 md:size-5' />}
        searchBar={searchInput}
        actions={
          <>
            {!isMobile && searchInput}
            <Button onClick={() => setAddFriendDialogOpen(true)}>
              <UserPlus className='mr-2 h-4 w-4' />
              Add friend
            </Button>
          </>
        }
      />
      <Main>
        {filteredFriends.length === 0 ? (
          search ? (
            <EmptyState
              icon={Users}
              title='No friends found'
              description='Try adjusting your search terms'
            />
          ) : (
            <div className="flex flex-col gap-8">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="bg-primary/10 mb-4 flex h-20 w-20 items-center justify-center rounded-full">
                  <Users className="text-primary h-10 w-10" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">Build your circle</h2>
                <p className="text-muted-foreground mt-2 max-w-sm text-balance">
                  Connect with others to start chatting and sharing. 
                  Add friends to get started.
                </p>
                <div className="mt-8">
                  <Button size="lg" onClick={() => setAddFriendDialogOpen(true)}>
                    <UserPlus className="mr-2 h-5 w-5" />
                    Add Friend
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold tracking-tight">Suggested People</h3>
                </div>
                <SuggestedFriendsList />
              </div>
            </div>
          )
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
                    disabled={
                      startChatMutation.isPending &&
                      pendingChatFriendId === friend.id
                    }
                    onClick={() => handleStartChat(friend)}
                  >
                    <MessageSquare className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
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
        <AlertDialog
          open={removeFriendDialog.open}
          onOpenChange={(open) =>
            setRemoveFriendDialog({ ...removeFriendDialog, open })
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {FRIENDS_STRINGS.REMOVE_FRIEND_DIALOG_TITLE}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {FRIENDS_STRINGS.REMOVE_FRIEND_CONFIRM_PRE}{' '}
                <span className='text-foreground font-semibold'>
                  {removeFriendDialog.friendName}
                </span>{' '}
                {FRIENDS_STRINGS.REMOVE_FRIEND_CONFIRM_POST}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removeFriendMutation.isPending}>
                {FRIENDS_STRINGS.CANCEL}
              </AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                onClick={confirmRemoveFriend}
                disabled={removeFriendMutation.isPending}
              >
                <Minus className='mr-2 h-4 w-4' />
                {removeFriendMutation.isPending
                  ? FRIENDS_STRINGS.REMOVING
                  : FRIENDS_STRINGS.REMOVE_FRIEND}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Main>
    </>
  )
}
