// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  EmptyState,
  EntityAvatar,
  EntityBanner,
  GeneralError,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ScrollArea,
  SearchInput,
  cn,
  getAppPath,
  getErrorMessage,
  markdownUrlTransform,
  toastAction,
  useScreenSize,
} from '@mochi/web'
import {
  ArrowLeft,
  Ban,
  BookUser,
  Check,
  Loader2,
  Search,
  Send,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { personApi } from '@/api/person'
import type { DirectoryPerson } from '@/api/types/contacts'
import type { PersonInformation } from '@/api/types/person'
import { formatFingerprint } from '@/lib/fingerprint'
import {
  useAcceptFriendMutation,
  useContactsQuery,
  useCreateContactMutation,
  useInviteFriendMutation,
  useSearchDirectoryQuery,
} from '@/hooks/useContacts'

type AddContactDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type PreviewState = {
  person: { id: string; name: string }
  info: PersonInformation
  intent: 'invite' | 'accept'
}

function hasProfileContent(info: PersonInformation): boolean {
  return Boolean(
    info.avatar || info.banner || (info.profile && info.profile.trim() !== '')
  )
}

export function AddContactDialog({
  onOpenChange,
  open,
}: AddContactDialogProps) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const { isMobile } = useScreenSize()
  const { data: contactsData } = useContactsQuery()
  const sentPersons = useMemo(
    () => new Set((contactsData?.sent ?? []).map((invite) => invite.id)),
    [contactsData?.sent]
  )

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error, refetch } = useSearchDirectoryQuery(
    debounced,
    { enabled: open && debounced.length > 0 }
  )

  const createMutation = useCreateContactMutation()
  const inviteMutation = useInviteFriendMutation()
  const acceptMutation = useAcceptFriendMutation()

  const results = useMemo(() => data?.results ?? [], [data?.results])

  const addToContacts = async (person: string, name: string) => {
    try {
      await toastAction(
        createMutation.mutateAsync({
          person,
          properties: [{ name: 'FN', params: {}, value: name }],
        }),
        {
          loading: t`Adding contact...`,
          success: t`Contact added`,
          error: (error) => getErrorMessage(error, t`Failed to add contact`),
        }
      )
      setAdded((current) => new Set(current).add(person))
    } catch {
      // toastAction already showed error
    } finally {
      setPending(null)
    }
  }

  const sendInvite = async (person: string, name: string) => {
    try {
      await toastAction(inviteMutation.mutateAsync({ person, name }), {
        loading: t`Sending invitation...`,
        success: t`Invitation sent`,
        successOptions: () => ({
          description: t`A friend invitation has been sent to ${name}.`,
        }),
        error: (error) => getErrorMessage(error, t`Failed to send invitation`),
      })
      setInvited((current) => new Set(current).add(person))
      setPreview(null)
    } catch {
      // toastAction already showed error
    } finally {
      setPending(null)
    }
  }

  const acceptInvite = async (person: string) => {
    try {
      await toastAction(acceptMutation.mutateAsync({ person }), {
        loading: t`Accepting invitation...`,
        success: t`Invitation accepted`,
        error: (error) =>
          getErrorMessage(error, t`Failed to accept invitation`),
      })
      setInvited((current) => new Set(current).add(person))
      setPreview(null)
    } catch {
      // toastAction already showed error
    } finally {
      setPending(null)
    }
  }

  // The profile of someone whose invitation has not been accepted is worth a
  // look before connecting, so a person with one gets a preview step.
  const startConnect = (
    person: { id: string; name: string },
    intent: 'invite' | 'accept'
  ) => {
    setPending(person.id)
    personApi
      .getInformation(person.id)
      .then((info) => {
        if (hasProfileContent(info)) {
          setPreview({ person, info, intent })
          setPending(null)
        } else if (intent === 'accept') {
          void acceptInvite(person.id)
        } else {
          void sendInvite(person.id, person.name)
        }
      })
      .catch(() => {
        if (intent === 'accept') void acceptInvite(person.id)
        else void sendInvite(person.id, person.name)
      })
  }

  const confirmPreview = () => {
    if (!preview) return
    setPending(preview.person.id)
    if (preview.intent === 'accept') void acceptInvite(preview.person.id)
    else void sendInvite(preview.person.id, preview.person.name)
  }

  useEffect(() => {
    if (!open) {
      setSearch('')
      setDebounced('')
      setInvited(new Set())
      setAdded(new Set())
      setPending(null)
      setPreview(null)
    }
  }, [open])

  const hasQuery = debounced.trim().length > 0
  const viewState: 'idle' | 'loading' | 'error' | 'empty' | 'results' = (() => {
    if (!hasQuery) return 'idle'
    if (isLoading) return 'loading'
    if (isError) return 'error'
    if (results.length === 0) return 'empty'
    return 'results'
  })()

  const previewBusy = preview ? pending === preview.person.id : false

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldCloseOnInteractOutside={false}
    >
      <ResponsiveDialogContent className='sm:max-w-160'>
        <ResponsiveDialogHeader className='gap-1.5'>
          <ResponsiveDialogTitle>
            {preview ? preview.person.name : t`Add contact`}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='sr-only'>
            {preview
              ? t`Preview ${preview.person.name}'s profile before sending a friend invitation.`
              : t`Create a contact, or find someone on Mochi.`}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {preview ? (
          <PersonPreview info={preview.info} />
        ) : (
          <div className='space-y-4 px-4 pb-4 sm:px-0 sm:pb-0'>
            <Button
              variant='outline'
              className='w-full justify-start'
              onClick={() => {
                onOpenChange(false)
                void navigate({ to: '/contacts/new' })
              }}
            >
              <BookUser className='size-4' />
              <Trans>New contact</Trans>
            </Button>

            <div className='space-y-2'>
              <p className='text-muted-foreground text-xs font-medium'>
                <Trans>Find on Mochi</Trans>
              </p>
              <SearchInput
                placeholder={t`Enter name to search...`}
                value={search}
                onValueChange={setSearch}
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
              <div
                className={cn('p-3', viewState !== 'results' && 'min-h-full')}
              >
                {viewState === 'idle' && (
                  <EmptyState
                    icon={Search}
                    title={t`Start typing to search for people`}
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
                    className='border-0 bg-transparent px-4 py-5 shadow-none'
                  />
                )}

                {viewState === 'results' && (
                  <div className='space-y-1'>
                    {results.map((person) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        busy={pending === person.id}
                        added={added.has(person.id)}
                        invited={
                          invited.has(person.id) || sentPersons.has(person.id)
                        }
                        onAdd={() => {
                          setPending(person.id)
                          void addToContacts(person.id, person.name)
                        }}
                        onInvite={() =>
                          startConnect(
                            { id: person.id, name: person.name },
                            'invite'
                          )
                        }
                        onAccept={() =>
                          startConnect(
                            { id: person.id, name: person.name },
                            'accept'
                          )
                        }
                      />
                    ))}
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
              <Button
                onClick={confirmPreview}
                loading={previewBusy}
                icon={
                  preview.intent === 'accept' ? (
                    <Check className='h-4 w-4' />
                  ) : (
                    <Send className='h-4 w-4' />
                  )
                }
              >
                {preview.intent === 'accept' ? t`Accept` : t`Send invitation`}
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

type RowAction = {
  key: string
  label: string
  icon?: React.ReactNode
  trailingIcon?: React.ReactNode
  variant: 'default' | 'outline'
  disabled: boolean
  onClick: () => void
}

function PersonRow({
  person,
  busy,
  added,
  invited,
  onAdd,
  onInvite,
  onAccept,
}: {
  person: DirectoryPerson
  busy: boolean
  added: boolean
  invited: boolean
  onAdd: () => void
  onInvite: () => void
  onAccept: () => void
}) {
  const { t } = useLingui()
  const appPath = getAppPath()
  const relationship = person.relationship ?? 'none'
  const inContacts = added || Boolean(person.contact)
  const isInvited = invited || relationship === 'invited'

  const noop = () => {}

  const actions: RowAction[] = (() => {
    if (relationship === 'self') {
      return [
        {
          key: 'self',
          label: t`That's you`,
          trailingIcon: <Ban className='ms-2 h-4 w-4' />,
          variant: 'outline',
          disabled: true,
          onClick: noop,
        },
      ]
    }
    if (relationship === 'friend') {
      return [
        {
          key: 'friend',
          label: t`Friends`,
          trailingIcon: <UserCheck className='ms-2 h-4 w-4' />,
          variant: 'outline',
          disabled: true,
          onClick: noop,
        },
      ]
    }
    if (relationship === 'pending') {
      return [
        {
          key: 'accept',
          label: t`Accept`,
          icon: <Check className='me-2 h-4 w-4' />,
          variant: 'default',
          disabled: false,
          onClick: onAccept,
        },
      ]
    }
    const invite: RowAction = isInvited
      ? {
          key: 'invited',
          label: t`Invited`,
          icon: <Send className='me-2 h-4 w-4' />,
          variant: 'outline',
          disabled: true,
          onClick: noop,
        }
      : {
          key: 'invite',
          label: t`Invite`,
          icon: <Send className='me-2 h-4 w-4' />,
          variant: 'outline',
          disabled: false,
          onClick: onInvite,
        }
    if (inContacts) {
      return [
        {
          key: 'contact',
          label: t`In contacts`,
          icon: <BookUser className='me-2 h-4 w-4' />,
          variant: 'outline',
          disabled: true,
          onClick: noop,
        },
        invite,
      ]
    }
    return [
      {
        key: 'add',
        label: t`Add to contacts`,
        icon: <UserPlus className='me-2 h-4 w-4' />,
        variant: 'default',
        disabled: false,
        onClick: onAdd,
      },
      invite,
    ]
  })()

  return (
    <div className='hover:bg-hover hover:text-hover-foreground group flex items-center justify-between gap-3 rounded-lg p-3 transition-all'>
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        <EntityAvatar
          src={`${appPath}/${person.id}/-/avatar`}
          styleUrl={`${appPath}/${person.id}/-/style`}
          name={person.name}
          size='lg'
        />
        <div className='flex min-w-0 flex-1 flex-col'>
          <span className='truncate text-sm font-medium'>{person.name}</span>
          <span className='text-muted-foreground truncate text-xs'>
            {person.fingerprint_hyphens}
          </span>
        </div>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        {actions.map((action) =>
          action.trailingIcon ? (
            <Button
              key={action.key}
              size='sm'
              variant={action.variant}
              onClick={action.onClick}
              loading={busy && !action.disabled}
              trailingIcon={action.trailingIcon}
              disabled={action.disabled}
            >
              {action.label}
            </Button>
          ) : (
            <Button
              key={action.key}
              size='sm'
              variant={action.variant}
              onClick={action.onClick}
              loading={busy && !action.disabled}
              icon={action.icon}
              disabled={action.disabled}
            >
              {action.label}
            </Button>
          )
        )}
      </div>
    </div>
  )
}

// This preview shows the bio of someone whose request has not been accepted,
// so merely opening it must not fetch anything from a server they chose.
const previewUrlTransform = markdownUrlTransform(defaultUrlTransform)

function PersonPreview({ info }: { info: PersonInformation }) {
  const appPath = getAppPath()
  const avatarUrl = info.avatar
    ? `${appPath}/${info.id}/-/avatar?v=${info.avatar}`
    : null
  const bannerUrl = info.banner
    ? `${appPath}/${info.id}/-/banner?v=${info.banner}`
    : null

  return (
    <ScrollArea className='max-h-[60vh] sm:max-h-[28rem]'>
      <div className='space-y-3 px-4 pb-4 sm:px-0 sm:pb-0'>
        {bannerUrl && <EntityBanner src={bannerUrl} className='rounded-lg' />}
        <div className='flex items-center gap-3'>
          <EntityAvatar
            src={avatarUrl}
            name={info.name}
            size='2xl'
            accent={info.style.accent}
          />
          <div className='min-w-0'>
            <p className='truncate font-medium'>{info.name}</p>
            <p className='text-muted-foreground truncate text-xs'>
              {formatFingerprint(info.fingerprint)}
            </p>
          </div>
        </div>
        {info.profile?.trim() && (
          <div className='markdown-body text-sm leading-relaxed'>
            <Markdown
              remarkPlugins={[remarkGfm]}
              urlTransform={previewUrlTransform}
            >
              {info.profile}
            </Markdown>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
