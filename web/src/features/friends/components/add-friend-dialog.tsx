import { useEffect, useState, useMemo } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Search, Loader2, UserPlus, UserCheck, Check, Send, Ban, ArrowLeft } from 'lucide-react'
import { cn, toast, getAppPath, getErrorMessage, GeneralError, Button, EntityAvatar, EntityBanner, ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogFooter, ResponsiveDialogHeader, ResponsiveDialogTitle, SearchInput, EmptyState, ScrollArea, useScreenSize } from '@mochi/web'
import { useSearchUsersQuery, useCreateFriendMutation, useAcceptFriendInviteMutation, useFriendsQuery } from '@/hooks/useFriends'
import { personApi } from '@/api/person'
import type { PersonInformation } from '@/api/types/person'

type AddFriendDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type PreviewState = {
  user: { id: string; name: string }
  info: PersonInformation
  intent: 'invite' | 'accept'
}

function hasProfileContent(info: PersonInformation): boolean {
  return Boolean(info.avatar || info.banner || (info.profile && info.profile.trim() !== ''))
}

export function AddFriendDialog({ onOpenChange, open }: AddFriendDialogProps) {
  const { t } = useLingui()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set())
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const { isMobile } = useScreenSize()
  const { data: friendsData } = useFriendsQuery()
  const sentUserIds = useMemo(
    () => new Set((friendsData?.sent ?? []).map((s) => s.id)),
    [friendsData?.sent]
  )


  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data, isLoading, isError, error, refetch } = useSearchUsersQuery(debouncedQuery, {
    enabled: open && debouncedQuery.length > 0,
  })

  const createFriendMutation = useCreateFriendMutation({
    onSuccess: (_, variables) => {
      setInvitedUserIds((prev) => new Set(prev).add(variables.id))
      setPendingUserId(null)
      setPreview(null)
      toast.success(t`Invitation sent`, {
        description: t`A friend invitation has been sent to ${variables.name}.`,
      })
    },
    onError: (error) => {
      setPendingUserId(null)
      toast.error(getErrorMessage(error, t`Failed to add friend`))
    },
  })

  const acceptFriendMutation = useAcceptFriendInviteMutation({
    onSuccess: (_, variables) => {
      setInvitedUserIds((prev) => new Set(prev).add(variables.friendId))
      setPendingUserId(null)
      setPreview(null)
      toast.success(t`Already friends`, {
        description: t`You are now friends!`,
      })
    },
    onError: (error) => {
      setPendingUserId(null)
      toast.error(getErrorMessage(error, t`Failed to add friend`))
    },
  })

  const users = useMemo(
    () => data?.results ?? [],
    [data?.results]
  )

  const sendInvite = (userId: string, userName: string) => {
    createFriendMutation.mutate({ id: userId, name: userName })
  }

  const acceptInvite = (userId: string) => {
    acceptFriendMutation.mutate({ friendId: userId })
  }

  const startConnect = (user: { id: string; name: string }, intent: 'invite' | 'accept') => {
    setPendingUserId(user.id)
    personApi
      .getInformation(user.id)
      .then((info) => {
        if (hasProfileContent(info)) {
          setPreview({ user, info, intent })
          setPendingUserId(null)
        } else if (intent === 'accept') {
          acceptInvite(user.id)
        } else {
          sendInvite(user.id, user.name)
        }
      })
      .catch(() => {
        // Profile fetch failed — fall back to direct connect
        if (intent === 'accept') acceptInvite(user.id)
        else sendInvite(user.id, user.name)
      })
  }

  const handleConfirmFromPreview = () => {
    if (!preview) return
    setPendingUserId(preview.user.id)
    if (preview.intent === 'accept') acceptInvite(preview.user.id)
    else sendInvite(preview.user.id, preview.user.name)
  }

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setDebouncedQuery('')
      setInvitedUserIds(new Set())
      setPendingUserId(null)
      setPreview(null)
    }
  }, [open])

  const hasQuery = debouncedQuery.trim().length > 0
  const viewState: 'idle' | 'loading' | 'error' | 'empty' | 'results' = (() => {
    if (!hasQuery) {
      return 'idle'
    }
    if (isLoading) {
      return 'loading'
    }
    if (isError) {
      return 'error'
    }
    if (users.length === 0) {
      return 'empty'
    }
    return 'results'
  })()

  const previewBusy = preview ? pendingUserId === preview.user.id : false
  const previewConfirmLabel = preview?.intent === 'accept'
    ? t`Accept`
    : t`Send invitation`

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldCloseOnInteractOutside={false}
    >
      <ResponsiveDialogContent className='sm:max-w-160'>
        <ResponsiveDialogHeader className='gap-1.5'>
          <ResponsiveDialogTitle>
            {preview ? preview.user.name : t`Add friend`}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='sr-only'>
            {preview
              ? t`Preview ${preview.user.name}'s profile before sending a friend request.`
              : t`Search for people and send a friend request.`}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {preview ? (
            <FriendPreview info={preview.info} />
        ) : (
          <div className='space-y-4 px-4 pb-4 sm:px-0 sm:pb-0'>
            <div className='space-y-2'>
              <SearchInput
                placeholder={t`Enter name to search...`}
                value={searchQuery}
                onValueChange={setSearchQuery}
                clearLabel={t`Clear search`}
                autoFocus={!isMobile}
              />
            </div>

            <ScrollArea
              className={cn(
                'overflow-hidden rounded-xl border',
                viewState === 'results' ? 'max-h-[18rem]' : 'h-[13rem]'
              )}
            >
              <div className={cn('p-3', viewState !== 'results' && 'min-h-full')}>
                {viewState === 'idle' && (
                  <EmptyState
                    icon={Search}
                    title={t`Start typing to search for users`}
                    description={t`Enter a name to find people you want to add`}
                    className='border-0 bg-transparent px-4 py-5 shadow-none'
                  />
                )}

                {viewState === 'loading' && (
                  <div className='flex items-center justify-center py-12'>
                    <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
                  </div>
                )}

                {viewState === 'error' && (
                  <GeneralError
                    error={error}
                    minimal
                    mode='inline'
                    reset={refetch}
                    className='border-0 bg-transparent px-4 py-5 shadow-none'
                  />
                )}

                {viewState === 'empty' && (
                  <EmptyState
                    icon={Search}
                    title={t`No people found`}
                    description={t`Try a different search term`}
                    className='border-0 bg-transparent px-4 py-5 shadow-none'
                  />
                )}

                {viewState === 'results' && (
                  <div className='space-y-1'>
                    {users.map((user) => {
                      const sessionInvited = invitedUserIds.has(user.id) || sentUserIds.has(user.id)
                      const isPendingForThisUser = pendingUserId === user.id

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
                        return 'outline'
                      }

                      // Determine button action
                      const handleClick = () => {
                        if (status === 'pending') {
                          startConnect({ id: user.id, name: user.name }, 'accept')
                        } else {
                          startConnect({ id: user.id, name: user.name }, 'invite')
                        }
                      }

                      // Render button content based on status
                      const renderButtonContent = () => {
                        if (isPendingForThisUser) {
                          return (
                            <>
                              {t`Adding...`}
                              <Loader2 className='ms-2 h-4 w-4 animate-spin' />
                            </>
                          )
                        }

                        switch (status) {
                          case 'self':
                            return (
                              <>
                                {t`That's you`}
                                <Ban className='ms-2 h-4 w-4' />
                              </>
                            )
                          case 'friend':
                            return (
                              <>
                                {t`Already friends`}
                                <UserCheck className='ms-2 h-4 w-4' />
                              </>
                            )
                          case 'invited':
                            return (
                              <>
                                <Send className='me-2 h-4 w-4' />
                                {t`Invitation sent`}
                              </>
                            )
                          case 'pending':
                            return (
                              <>
                                {t`Accept invite`}
                                <Check className='ms-2 h-4 w-4' />
                              </>
                            )
                          default:
                            return (
                              <>
                                <UserPlus className='me-2 h-4 w-4' />
                                {t`Add friend`}
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
                            <EntityAvatar
                              src={`${getAppPath()}/${user.id}/-/avatar`}
                              styleUrl={`${getAppPath()}/${user.id}/-/style`}
                              name={user.name}
                              size="lg"
                            />
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
        )}

        <ResponsiveDialogFooter className='gap-2'>
          {preview ? (
            <>
              <Button
                variant='outline'
                onClick={() => setPreview(null)}
                disabled={previewBusy}
              >
                <ArrowLeft className='h-4 w-4 rtl:rotate-180' />
                <Trans>Back</Trans>
              </Button>
              <Button onClick={handleConfirmFromPreview} disabled={previewBusy}>
                {previewBusy ? (
                  <>
                    {t`Adding...`}
                    <Loader2 className='ms-2 h-4 w-4 animate-spin' />
                  </>
                ) : (
                  <>
                    {preview.intent === 'accept' ? (
                      <Check className='h-4 w-4' />
                    ) : (
                      <Send className='h-4 w-4' />
                    )}
                    {previewConfirmLabel}
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              <Trans>Close</Trans>
            </Button>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

function FriendPreview({ info }: { info: PersonInformation }) {
  const appPath = getAppPath()
  const avatarUrl = info.avatar ? `${appPath}/${info.id}/-/avatar?v=${info.avatar}` : null
  const bannerUrl = info.banner ? `${appPath}/${info.id}/-/banner?v=${info.banner}` : null
  const accent = info.style.accent

  return (
    <ScrollArea className='max-h-[60vh] sm:max-h-[28rem]'>
      <div className='space-y-3 px-4 pb-4 sm:px-0 sm:pb-0'>
        {bannerUrl && <EntityBanner src={bannerUrl} className='rounded-lg' />}
        <div className='flex items-center gap-3'>
          <EntityAvatar src={avatarUrl} name={info.name} size="2xl" accent={accent} />
          <div className='min-w-0'>
            <p className='truncate font-medium'>{info.name}</p>
            <p className='text-muted-foreground truncate text-xs'>
              {formatFingerprint(info.fingerprint)}
            </p>
          </div>
        </div>
        {info.profile?.trim() && (
          <div className='markdown-body text-sm leading-relaxed'>
            <Markdown remarkPlugins={[remarkGfm]}>{info.profile}</Markdown>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

function formatFingerprint(fingerprint: string): string {
  if (!fingerprint || fingerprint.length !== 9) return fingerprint
  return `${fingerprint.slice(0, 3)}-${fingerprint.slice(3, 6)}-${fingerprint.slice(6)}`
}
