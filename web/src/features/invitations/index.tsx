import { useMemo, useState } from 'react'
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
  usePageTitle('Invitations')
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

  const hasReceived = filteredReceived.length > 0
  const hasSent = filteredSent.length > 0
  const hasAny = hasReceived || hasSent

  const searchInput = (
    <Input
      type='text'
      placeholder='Search...'
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className='w-48'
    />
  )

  return (
    <>
      <PageHeader
        title='Invitations'
        icon={<UserPlus className='size-4 md:size-5' />}
        actions={
          <>
            {searchInput}
            <Button variant='outline' size='icon' onClick={() => setSettingsOpen(true)} aria-label='Invite settings'>
              <Settings className='h-4 w-4' />
            </Button>
            <Button onClick={() => setAddFriendDialogOpen(true)}>
              <UserPlus className='h-4 w-4' />
              Add friend
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
            title='No pending invitations'
            description={
              search
                ? 'Try adjusting your search'
                : 'New invitations will appear here'
            }
          />
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
                          Accept
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={declineInviteMutation.isPending}
                          onClick={() =>
                            handleDeclineInvite(invite.id, invite.name)
                          }
                          className='text-muted-foreground hover:text-destructive'
                        >
                          <UserX className='h-3.5 w-3.5' />
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
                            Pending
                          </span>
                        </div>
                      </div>
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={removeMutation.isPending}
                        onClick={() => handleCancelSent(invite.id, invite.name)}
                        className='text-muted-foreground hover:text-destructive'
                      >
                        <X className='h-3.5 w-3.5' />
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
