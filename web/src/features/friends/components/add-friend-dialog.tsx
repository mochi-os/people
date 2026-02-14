import { useEffect, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Loader2, UserPlus, UserCheck, Check, Send, Ban } from 'lucide-react'
import { cn, toast, SubscribeDialog, requestHelpers, getAppPath, getErrorMessage } from '@mochi/common'
import { useSearchUsersQuery, useCreateFriendMutation, useAcceptFriendInviteMutation } from '@/hooks/useFriends'
import { Avatar, AvatarFallback, AvatarImage } from '@mochi/common'
import { Button } from '@mochi/common'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@mochi/common'
import { Input } from '@mochi/common'
import { EmptyState } from '@mochi/common'
// import { Label } from '@mochi/common'
import { ScrollArea } from '@mochi/common'
import { buildAvatarUrl } from '../utils/avatar'
import { FRIENDS_STRINGS } from '../constants'

type AddFriendDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SubscriptionCheckResponse {
  exists: boolean
}

export function AddFriendDialog({ onOpenChange, open }: AddFriendDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set())
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [subscribeOpen, setSubscribeOpen] = useState(false)

  // Check if user already has a subscription for people notifications
  const { data: subscriptionData, refetch: refetchSubscription } = useQuery({
    queryKey: ['subscription-check', 'people'],
    queryFn: async () => {
      return await requestHelpers.get<SubscriptionCheckResponse>(
        `${getAppPath()}/-/notifications/check`
      )
    },
    staleTime: Infinity,
  })

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 500) // 500ms debounce

    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data, isLoading, isError, error } = useSearchUsersQuery(debouncedQuery, {
    enabled: open && debouncedQuery.length > 0,
  })

  const createFriendMutation = useCreateFriendMutation({
    onSuccess: (_, variables) => {
      // Add user to invited set
      setInvitedUserIds((prev) => new Set(prev).add(variables.id))
      setPendingUserId(null)
      toast.success(FRIENDS_STRINGS.SUCCESS_INVITATION_SENT, {
        description: `${FRIENDS_STRINGS.SUCCESS_INVITATION_SENT_DESC} ${variables.name}.`,
      })
      // Prompt for notifications if user hasn't subscribed yet
      if (!subscriptionData?.exists) {
        setSubscribeOpen(true)
      }
    },
    onError: (error) => {
      setPendingUserId(null)
      toast.error(getErrorMessage(error, FRIENDS_STRINGS.ERR_ADD_FRIEND))
    },
  })

  const acceptFriendMutation = useAcceptFriendInviteMutation({
    onSuccess: (_, variables) => {
      // Mark as accepted by adding to invitedUserIds (which we'll repurpose for tracking processed users)
      setInvitedUserIds((prev) => new Set(prev).add(variables.friendId))
      setPendingUserId(null)
      toast.success(FRIENDS_STRINGS.ALREADY_FRIENDS, {
        description: 'You are now friends!',
      })
    },
    onError: (error) => {
      setPendingUserId(null)
      toast.error(getErrorMessage(error, FRIENDS_STRINGS.ERR_ADD_FRIEND))
    },
  })

  const users = useMemo(
    () => data?.results ?? [],
    [data?.results]
  )

  const handleAddFriend = (userId: string, userName: string) => {
    setPendingUserId(userId)
    createFriendMutation.mutate({
      id: userId,
      name: userName,
    })
  }

  const handleAcceptInvite = (userId: string) => {
    setPendingUserId(userId)
    acceptFriendMutation.mutate({
      friendId: userId,
    })
  }

  useEffect(() => {
    if (open) {
      // Refetch subscription status when dialog opens in case user deleted subscriptions
      refetchSubscription()
    } else {
      setSearchQuery('')
      setDebouncedQuery('')
      setInvitedUserIds(new Set())
      setPendingUserId(null)
    }
  }, [open, refetchSubscription])

  const showResults = debouncedQuery.length > 0
  const showLoading = isLoading && debouncedQuery.length > 0
  const showEmpty = !isLoading && users.length === 0 && debouncedQuery.length > 0

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldCloseOnInteractOutside={false}
    >
      <ResponsiveDialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[600px]'>
        <ResponsiveDialogHeader className='border-b px-6 pt-6 pb-4'>
          <ResponsiveDialogTitle className='text-2xl font-semibold'>
            {FRIENDS_STRINGS.ADD_FRIEND_DIALOG_TITLE}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className='flex min-h-0 flex-1 flex-col gap-4 px-6 py-4'>
          {/* Search Input */}
          <div className='space-y-2'>
            {/* <Label className='flex items-center gap-1.5 text-sm font-medium'>
              <Search className='h-4 w-4' />
              Search Users
            </Label> */}
            <div className='relative'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform' />
              <Input
                placeholder={FRIENDS_STRINGS.SEARCH_USERS_PLACEHOLDER}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='h-10 pl-9'
                autoFocus
              />
            </div>
          </div>

          {/* Results List */}
          <ScrollArea className='max-h-[300px] flex-1 rounded-lg border'>
            <div className='p-2 h-[16rem]'>
              {!showResults && !showLoading && (
                <div className='flex items-center justify-center py-12'>
                  <Search className='text-muted-foreground/30 h-12 w-12' />
                </div>
              )}

              {showLoading && (
                <div className='flex items-center justify-center py-12'>
                  <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
                </div>
              )}

              {isError && showResults && (
                <EmptyState
                  icon={Ban}
                  title={FRIENDS_STRINGS.ERR_SEARCH_FAILED}
                  description={getErrorMessage(error, FRIENDS_STRINGS.ERR_UNKNOWN)}
                  className="bg-transparent border-0 shadow-none pt-12 pb-12"
                />
              )}

              {showEmpty && (
                <EmptyState
                  icon={Search}
                  title={FRIENDS_STRINGS.NO_USERS_FOUND}
                  className="bg-transparent border-0 shadow-none pt-12 pb-12"
                />
              )}

              {!isLoading && users.length > 0 && (
                <div className='space-y-1'>
                  {users.map((user) => {
                    const sessionInvited = invitedUserIds.has(user.id)
                    const isPendingForThisUser = pendingUserId === user.id
                    
                    // Determine the effective status considering both API response and session state
                    const status = sessionInvited ? 'invited' : (user.relationshipStatus ?? 'none')
                    
                    // Determine if button should be disabled
                    const isDisabled = 
                      isPendingForThisUser ||
                      status === 'friend' ||
                      status === 'invited' ||
                      status === 'self'
                    
                    // Determine button variant
                    const getButtonVariant = () => {
                      if (status === 'pending') return 'default'
                      if (status === 'none') return 'default'
                      return 'secondary'
                    }
                    
                    // Determine button action
                    const handleClick = () => {
                      if (status === 'pending') {
                        handleAcceptInvite(user.id)
                      } else {
                        handleAddFriend(user.id, user.name)
                      }
                    }
                    
                    // Render button content based on status
                    const renderButtonContent = () => {
                      if (isPendingForThisUser) {
                        return (
                          <>
                            {FRIENDS_STRINGS.ADDING}
                            <Loader2 className='ml-2 h-4 w-4 animate-spin' />
                          </>
                        )
                      }
                      
                      switch (status) {
                        case 'self':
                          return (
                            <>
                              {FRIENDS_STRINGS.THATS_YOU}
                              <Ban className='ml-2 h-4 w-4' />
                            </>
                          )
                        case 'friend':
                          return (
                            <>
                              {FRIENDS_STRINGS.ALREADY_FRIENDS}
                              <UserCheck className='ml-2 h-4 w-4' />
                            </>
                          )
                        case 'invited':
                          return (
                            <>
                              <Send className='mr-2 h-4 w-4' />
                              {FRIENDS_STRINGS.INVITATION_SENT}
                            </>
                          )
                        case 'pending':
                          return (
                            <>
                              {FRIENDS_STRINGS.PENDING_INVITE}
                              <Check className='ml-2 h-4 w-4' />
                            </>
                          )
                        default:
                          return (
                            <>
                              <UserPlus className='mr-2 h-4 w-4' />
                              {FRIENDS_STRINGS.ADD_FRIEND}
                            </>
                          )
                      }
                    }
                    
                    return (
                      <div
                        key={user.id}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-lg p-3 transition-all',
                          status !== 'self' && 'hover:bg-accent hover:text-accent-foreground',
                          'group'
                        )}
                      >
                        <div className='flex min-w-0 flex-1 items-center gap-3'>
                          <Avatar className='h-10 w-10 shrink-0'>
                            <AvatarImage
                              src={buildAvatarUrl(user.id)}
                              alt={`${user.name} avatar`}
                            />
                            <AvatarFallback className='from-primary to-primary/60 text-primary-foreground bg-gradient-to-br font-semibold'>
                              {user.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className='flex min-w-0 flex-1 flex-col'>
                            <span className='truncate text-sm font-medium'>
                              {user.name}
                            </span>
                            <span className='text-muted-foreground truncate text-xs'>
                              {user.fingerprint_hyphens}
                            </span>
                          </div>
                        </div>
                        <Button
                          size='sm'
                          variant={getButtonVariant()}
                          onClick={handleClick}
                          disabled={isDisabled}
                        >
                          {renderButtonContent()}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className='bg-muted/30 flex items-center justify-between gap-3 border-t px-6 py-4'>
          <div className='text-muted-foreground text-sm'>
            {users.length > 0 && (
              <span>
                <span className='text-foreground font-medium'>
                  {users.length}
                </span>{' '}
                {users.length === 1 ? FRIENDS_STRINGS.USER : FRIENDS_STRINGS.USERS} {FRIENDS_STRINGS.FOUND}
              </span>
            )}
          </div>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {FRIENDS_STRINGS.CLOSE}
          </Button>
        </div>
      </ResponsiveDialogContent>

      <SubscribeDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        app="people"
        label="Friend requests and updates"
        appBase={getAppPath()}
        onResult={() => refetchSubscription()}
      />
    </ResponsiveDialog>
  )
}

