import { useEffect, useState, useMemo } from 'react'
import { Search, Loader2, UserPlus, UserCheck, Send, Ban } from 'lucide-react'
import { cn, toast, getErrorMessage } from '@mochi/common'
import { useSearchUsersQuery, useCreateFriendMutation, useAcceptFriendInviteMutation } from '@/hooks/useFriends'
import { Avatar, AvatarFallback, AvatarImage } from '@mochi/common'
import { Button } from '@mochi/common'
import { Input } from '@mochi/common'
import { buildAvatarUrl } from '../utils/avatar'
import { FRIENDS_STRINGS } from '../constants'

export function InlineFriendSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set())
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data, isLoading } = useSearchUsersQuery(debouncedQuery, {
    enabled: debouncedQuery.length > 0,
  })

  const createFriendMutation = useCreateFriendMutation({
    onSuccess: (_, variables) => {
      setInvitedUserIds((prev) => new Set(prev).add(variables.id))
      setPendingUserId(null)
      toast.success(FRIENDS_STRINGS.SUCCESS_INVITATION_SENT, {
        description: `${FRIENDS_STRINGS.SUCCESS_INVITATION_SENT_DESC} ${variables.name}.`,
      })
    },
    onError: (error) => {
      setPendingUserId(null)
      toast.error(getErrorMessage(error, FRIENDS_STRINGS.ERR_ADD_FRIEND))
    },
  })

  const acceptFriendMutation = useAcceptFriendInviteMutation({
    onSuccess: (_, variables) => {
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

  const users = useMemo(() => data?.results ?? [], [data?.results])

  const handleAddFriend = (userId: string, userName: string) => {
    setPendingUserId(userId)
    createFriendMutation.mutate({ id: userId, name: userName })
  }

  const handleAcceptInvite = (userId: string) => {
    setPendingUserId(userId)
    acceptFriendMutation.mutate({ friendId: userId })
  }

  const showResults = debouncedQuery.length > 0
  const showLoading = isLoading && debouncedQuery.length > 0

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder={FRIENDS_STRINGS.SEARCH_USERS_PLACEHOLDER}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 pl-9"
          autoFocus
        />
      </div>

      {/* Results */}
      {showLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      )}

      {!isLoading && showResults && users.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-4">
          {FRIENDS_STRINGS.NO_USERS_FOUND}
        </p>
      )}

      {!isLoading && users.length > 0 && (
        <div className="divide-border divide-y rounded-lg border">
          {users.map((user) => {
            const sessionInvited = invitedUserIds.has(user.id)
            const isPendingForThisUser = pendingUserId === user.id
            const status = sessionInvited ? 'invited' : (user.relationshipStatus ?? 'none')

            const isDisabled =
              isPendingForThisUser ||
              status === 'friend' ||
              status === 'invited' ||
              status === 'self'

            const handleClick = () => {
              if (status === 'pending') {
                handleAcceptInvite(user.id)
              } else {
                handleAddFriend(user.id, user.name)
              }
            }

            const renderButtonContent = () => {
              if (isPendingForThisUser) {
                return <Loader2 className="h-4 w-4 animate-spin" />
              }

              switch (status) {
                case 'self':
                  return <Ban className="h-4 w-4" />
                case 'friend':
                  return <UserCheck className="h-4 w-4" />
                case 'invited':
                  return <Send className="h-4 w-4" />
                case 'pending':
                  return <UserCheck className="h-4 w-4" />
                default:
                  return <UserPlus className="h-4 w-4" />
              }
            }

            return (
              <div
                key={user.id}
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-3 transition-colors',
                  status !== 'self' && 'hover:bg-muted/50'
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage
                      src={buildAvatarUrl(user.id)}
                      alt={`${user.name} avatar`}
                    />
                    <AvatarFallback className="from-primary to-primary/60 text-primary-foreground bg-gradient-to-br text-xs font-semibold">
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate text-sm font-medium">{user.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {user.fingerprint_hyphens}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={status === 'none' || status === 'pending' ? 'default' : 'secondary'}
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
  )
}
