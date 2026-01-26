import { useMemo, useState } from 'react'
import { Check, Loader2, UserPlus, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage, Button, Card, toast } from '@mochi/common'
import { useSearchUsersQuery, useCreateFriendMutation, useAcceptFriendInviteMutation } from '@/hooks/useFriends'
import { buildAvatarUrl } from '../utils/avatar'
import { FRIENDS_STRINGS } from '../constants'

export function SuggestedFriendsList() {
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set())
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  // We search for a generic term to get some users. 
  // Ideally this would be a "getRecommendations" endpoint.
  // Using '.' or 'a' often returns broad results depending on backend implementation.
  // We'll try a single letter 'a' which is very common, or just rely on backend behavior.
  const { data, isLoading, isError } = useSearchUsersQuery('a', {
    // We want this to run immediately
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
      toast.error(FRIENDS_STRINGS.ERR_ADD_FRIEND, {
        description:
          error instanceof Error ? error.message : FRIENDS_STRINGS.ERR_GENERIC,
      })
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
      toast.error(FRIENDS_STRINGS.ERR_ADD_FRIEND, {
        description:
          error instanceof Error ? error.message : FRIENDS_STRINGS.ERR_GENERIC,
      })
    },
  })

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

  const users = useMemo(() => {
    if (!data?.results) return []
    // Filter out users who are already friends or self if not filtered by backend
    // And limit to 6 for a nice grid
    return data.results
      .filter(u => u.relationshipStatus !== 'friend' && u.relationshipStatus !== 'self')
      .slice(0, 6)
  }, [data?.results])

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || users.length === 0) {
    return null
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((user) => {
        const sessionInvited = invitedUserIds.has(user.id)
        const isPendingForThisUser = pendingUserId === user.id
        const status = sessionInvited ? 'invited' : (user.relationshipStatus ?? 'none')

        const isDisabled = 
          isPendingForThisUser ||
          status === 'friend' ||
          status === 'invited' ||
          status === 'self'

        const getButtonVariant = () => {
           if (status === 'pending') return 'default'
           return 'secondary'
        }

        const handleClick = () => {
          if (status === 'pending') {
            handleAcceptInvite(user.id)
          } else {
            handleAddFriend(user.id, user.name)
          }
        }

        return (
          <Card key={user.id} className="flex flex-col items-center p-4 text-center space-y-3">
            <Avatar className="h-16 w-16">
              <AvatarImage src={buildAvatarUrl(user.id)} alt={user.name} />
              <AvatarFallback className="text-lg bg-gradient-to-br from-primary/10 to-primary/30 text-primary font-semibold">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="space-y-1 w-full">
              <h3 className="font-medium truncate" title={user.name}>{user.name}</h3>
              <p className="text-xs text-muted-foreground truncate">{user.fingerprint_hyphens}</p>
            </div>

            <Button 
                variant={getButtonVariant()} 
                size="sm" 
                className="w-full"
                onClick={handleClick}
                disabled={isDisabled}
            >
              {isPendingForThisUser ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
              ) : status === 'invited' ? (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Sent
                  </>
              ) : status === 'pending' ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Accept
                  </>
              ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add
                  </>
              )}
            </Button>
          </Card>
        )
      })}
    </div>
  )
}
