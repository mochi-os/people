import { useMemo, useState } from 'react'
import {
  Button,
  EmptyState,
  Main,
  usePageTitle,
  getErrorMessage,
  useScreenSize,
  PageHeader,
  Skeleton,
  toast,
} from '@mochi/common'
import { UserPlus, UserX, Send, X, Check } from 'lucide-react'
import {
  useFriendsQuery,
  useAcceptFriendInviteMutation,
  useDeclineFriendInviteMutation,
  useRemoveFriendMutation,
} from '@/hooks/useFriends'
import { AddFriendDialog } from '@/features/friends/components/add-friend-dialog'

export function Invitations() {
  usePageTitle('Invitations')
  const { isMobile } = useScreenSize()
  const [search, setSearch] = useState('')
  const [addFriendDialogOpen, setAddFriendDialogOpen] = useState(false)
  const { data: friendsData, isLoading, isError, error } = useFriendsQuery()
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
          toast.success('Invitation accepted', {
            description: `You are now friends with ${friendName}.`,
          })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, 'Failed to accept invitation'))
        },
      }
    )
  }

  const handleDeclineInvite = (friendId: string, friendName: string) => {
    declineInviteMutation.mutate(
      { friendId },
      {
        onSuccess: () => {
          toast.success('Invitation declined', {
            description: `Declined invitation from ${friendName}.`,
          })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, 'Failed to decline invitation'))
        },
      }
    )
  }

  const handleCancelSent = (friendId: string, friendName: string) => {
    removeMutation.mutate(
      { friendId },
      {
        onSuccess: () => {
          toast.success('Invitation cancelled', {
            description: `Cancelled invitation to ${friendName}.`,
          })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, 'Failed to cancel invitation'))
        },
      }
    )
  }

  if (isError) {
    return (
      <Main>
        <div className='flex h-64 flex-col items-center justify-center gap-2'>
          <div className='text-destructive font-medium'>
            Failed to load invitations
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
      </Main>
    )
  }

  const hasReceived = filteredReceived.length > 0
  const hasSent = filteredSent.length > 0
  const hasAny = hasReceived || hasSent

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
        title='Invitations'
        icon={<UserPlus className='size-4 md:size-5' />}
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
        <AddFriendDialog
          open={addFriendDialogOpen}
          onOpenChange={setAddFriendDialogOpen}
        />

        {!hasAny ? (
          search ? (
            <EmptyState
              icon={UserPlus}
              title='No results found'
              description='Try adjusting your search terms'
            />
          ) : (
            <EmptyState
              icon={UserPlus}
              title='No invitations yet'
              description="You're all caught up. Why not make the first move?"
            >
              <Button onClick={() => setAddFriendDialogOpen(true)}>
                Find People
              </Button>
            </EmptyState>
          )
        ) : (
          <div className='space-y-8'>
            {/* Received Invitations */}
            {hasReceived && (
              <div className='space-y-3'>
                <h2 className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
                  <UserPlus className='h-4 w-4' />
                  Received ({filteredReceived.length})
                </h2>
                <div className='divide-border divide-y rounded-md border'>
                  {filteredReceived.map((invite) => (
                    <div
                      key={invite.id}
                      className='hover:bg-muted/50 flex items-center justify-between px-4 py-3 transition-colors'
                    >
                      <div className='flex items-center gap-3'>
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
                          className='h-8'
                        >
                          <Check className='mr-2 h-3.5 w-3.5' />
                          Accept
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={declineInviteMutation.isPending}
                          onClick={() =>
                            handleDeclineInvite(invite.id, invite.name)
                          }
                          className='text-muted-foreground hover:text-destructive h-8'
                        >
                          <UserX className='mr-2 h-3.5 w-3.5' />
                          Decline
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
                <h2 className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
                  <Send className='h-4 w-4' />
                  Sent ({filteredSent.length})
                </h2>
                <div className='divide-border divide-y rounded-md border'>
                  {filteredSent.map((invite) => (
                    <div
                      key={invite.id}
                      className='hover:bg-muted/50 flex items-center justify-between px-4 py-3 transition-colors'
                    >
                      <div className='flex items-center gap-3'>
                        <div className='flex flex-col'>
                          <span className='truncate font-medium'>
                            {invite.name}
                          </span>
                          <span className='text-muted-foreground text-xs'>
                            Pending
                          </span>
                        </div>
                      </div>
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={removeMutation.isPending}
                        onClick={() => handleCancelSent(invite.id, invite.name)}
                        className='text-muted-foreground hover:text-destructive h-8'
                      >
                        <X className='mr-2 h-3.5 w-3.5' />
                        Cancel
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
