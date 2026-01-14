import { useMemo, useState } from 'react'
import { UserPlus, UserX, Send, Clock, X, Check } from 'lucide-react'
import { toast } from '@mochi/common'
import {
  useFriendsQuery,
  useAcceptFriendInviteMutation,
  useDeclineFriendInviteMutation,
  useRemoveFriendMutation,
} from '@/hooks/useFriends'
import { Button, Card, CardContent, Main, usePageTitle, getErrorMessage, useScreenSize, PageHeader } from '@mochi/common'
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
          <div className='text-destructive font-medium'>Failed to load invitations</div>
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
        <div className='flex h-64 items-center justify-center'>
          <div className='text-muted-foreground'>Loading invitations...</div>
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
        <div className='text-muted-foreground py-8 text-center'>
          <UserPlus className='mx-auto mb-4 h-12 w-12 opacity-50' />
          <p>No pending invitations</p>
          {search && (
            <p className='mt-2 text-sm'>Try adjusting your search</p>
          )}
        </div>
      ) : (
        <div className='space-y-8'>
          {/* Received Invitations */}
          {hasReceived && (
            <div>
              <h2 className='text-muted-foreground mb-4 flex items-center gap-2 text-sm font-medium'>
                <UserPlus className='h-4 w-4' />
                Received ({filteredReceived.length})
              </h2>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                {filteredReceived.map((invite) => (
                  <Card
                    key={invite.id}
                    className='group transition-shadow hover:shadow-md'
                  >
                    <CardContent className='p-4'>
                      <div className='flex flex-col items-center space-y-3 text-center'>
                        <div className='w-full'>
                          <p className='truncate font-medium'>
                            {invite.name}
                          </p>
                        </div>
                        <div className='flex w-full flex-col gap-2'>
                          <Button
                            size='sm'
                            disabled={acceptInviteMutation.isPending}
                            onClick={() => handleAcceptInvite(invite.id, invite.name)}
                            className='w-full'
                          >
                            <Check className='mr-1 h-4 w-4' />
                            Accept
                          </Button>
                          <Button
                            variant='outline'
                            size='sm'
                            disabled={declineInviteMutation.isPending}
                            onClick={() => handleDeclineInvite(invite.id, invite.name)}
                            className='w-full'
                          >
                            <UserX className='mr-1 h-4 w-4' />
                            Decline
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Sent Invitations */}
          {hasSent && (
            <div>
              <h2 className='text-muted-foreground mb-4 flex items-center gap-2 text-sm font-medium'>
                <Send className='h-4 w-4' />
                Sent ({filteredSent.length})
              </h2>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                {filteredSent.map((invite) => (
                  <Card
                    key={invite.id}
                    className='group transition-shadow hover:shadow-md'
                  >
                    <CardContent className='p-4'>
                      <div className='flex flex-col items-center space-y-3 text-center'>
                        <div className='w-full'>
                          <p className='truncate font-medium'>
                            {invite.name}
                          </p>
                          <p className='text-muted-foreground flex items-center justify-center gap-1 text-xs'>
                            <Clock className='h-3 w-3' />
                            Pending
                          </p>
                        </div>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={removeMutation.isPending}
                          onClick={() => handleCancelSent(invite.id, invite.name)}
                          className='w-full'
                        >
                          <X className='mr-1 h-4 w-4' />
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
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
