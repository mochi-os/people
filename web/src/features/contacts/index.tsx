// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { APP_ROUTES } from '@/config/app-routes'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  EntityAvatar,
  GeneralError,
  HeaderSearch,
  IconButton,
  ListSkeleton,
  Main,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  getAppPath,
  getErrorMessage,
  naturalCompare,
  shellNavigateExternal,
  toastAction,
  useListAutoAnimate,
  usePageTitle,
} from '@mochi/web'
import {
  BookUser,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  UserPlus,
  UserX,
} from 'lucide-react'
import type { Contact } from '@/api/types/contacts'
import { searchMatches, searchRange } from '@/lib/search'
import {
  useBooksQuery,
  useContactsQuery,
  useDeleteContactMutation,
  useInviteFriendMutation,
  useRemoveFriendMutation,
} from '@/hooks/useContacts'
import { AddContactDialog } from './add-dialog'

type SortBy = 'name' | 'recent'

type ContactDialog = {
  open: boolean
  contact: Contact | null
}

const closedDialog: ContactDialog = { open: false, contact: null }

export function Contacts({
  book,
  autoAdd,
}: { book?: string; autoAdd?: boolean } = {}) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const appPath = getAppPath()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [addDialogOpen, setAddDialogOpen] = useState(autoAdd ?? false)
  const [deleteDialog, setDeleteDialog] = useState<ContactDialog>(closedDialog)
  const [unfriendDialog, setUnfriendDialog] =
    useState<ContactDialog>(closedDialog)

  const { data, contacts, isLoading, error, refetch } = useContactsQuery(book)
  const { data: booksData } = useBooksQuery()
  const bookName = booksData?.books.find((row) => row.id === book)?.name
  const title = book ? (bookName ?? t`Contacts`) : t`All contacts`
  usePageTitle(title)

  const deleteMutation = useDeleteContactMutation()
  const removeFriendMutation = useRemoveFriendMutation()
  const inviteMutation = useInviteFriendMutation()

  const [listRef] = useListAutoAnimate<HTMLDivElement>({
    disabled: (isLoading && !data) || search.trim().length > 0,
  })

  const sentPersons = useMemo(
    () => new Set((data?.sent ?? []).map((invite) => invite.id)),
    [data?.sent]
  )

  const filtered = useMemo(() => {
    const list = contacts ?? []
    return list
      .filter(
        (contact) =>
          searchMatches(contact.name, search) ||
          searchMatches(contact.directory, search)
      )
      .sort((a, b) => {
        if (sortBy === 'recent') {
          return b.created - a.created
        }
        return naturalCompare(a.name, b.name)
      })
  }, [contacts, search, sortBy])

  const confirmDelete = async () => {
    const contact = deleteDialog.contact
    if (!contact) return
    try {
      await toastAction(deleteMutation.mutateAsync({ contact: contact.id }), {
        loading: t`Deleting contact...`,
        success: t`Contact deleted`,
        error: (error) => getErrorMessage(error, t`Failed to delete contact`),
      })
      setDeleteDialog(closedDialog)
    } catch {
      // toastAction already showed error
    }
  }

  const confirmUnfriend = async () => {
    const contact = unfriendDialog.contact
    if (!contact) return
    try {
      await toastAction(
        removeFriendMutation.mutateAsync({ person: contact.person }),
        {
          loading: t`Removing friend...`,
          success: t`Friend removed`,
          error: (error) => getErrorMessage(error, t`Failed to remove friend`),
        }
      )
      setUnfriendDialog(closedDialog)
    } catch {
      // toastAction already showed error
    }
  }

  const invite = async (contact: Contact) => {
    try {
      await toastAction(
        inviteMutation.mutateAsync({
          person: contact.person,
          name: contact.name,
        }),
        {
          loading: t`Sending invitation...`,
          success: t`Invitation sent`,
          error: (error) =>
            getErrorMessage(error, t`Failed to send invitation`),
        }
      )
    } catch {
      // toastAction already showed error
    }
  }

  const startChat = (contact: Contact) => {
    const base = import.meta.env.VITE_APP_CHAT_URL || APP_ROUTES.CHAT.HOME
    const url = `${base}?with=${encodeURIComponent(contact.person)}&name=${encodeURIComponent(contact.name)}`
    shellNavigateExternal(url)
  }

  const edit = (contact: Contact) => {
    void navigate({ to: '/contacts/$id', params: { id: contact.id } })
  }

  return (
    <>
      <PageHeader
        title={title}
        icon={<BookUser className='size-4 md:size-5' />}
        primaryAction={
          <div className='flex items-center gap-1.5 md:gap-2'>
            <HeaderSearch
              value={search}
              onValueChange={setSearch}
              placeholder={t`Search...`}
              label={t`Search contacts`}
            />
            <IconButton
              label={t`Add contact`}
              variant='default'
              className='md:hidden'
              onClick={() => setAddDialogOpen(true)}
            >
              <UserPlus className='h-4 w-4' />
            </IconButton>
            <Button
              className='hidden md:inline-flex'
              onClick={() => setAddDialogOpen(true)}
            >
              <UserPlus className='h-4 w-4' />
              <Trans>Add contact</Trans>
            </Button>
          </div>
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
        {isLoading && !data ? (
          <ListSkeleton count={5} variant='simple' height='h-16' />
        ) : error && !data ? null : filtered.length === 0 ? (
          <EmptyState
            icon={BookUser}
            title={search ? t`No results for "${search}"` : t`No contacts yet`}
            description={
              search ? t`Try a different name` : t`Add someone to get started`
            }
          />
        ) : (
          <div className='space-y-2'>
            <div className='flex justify-end'>
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SortBy)}
              >
                <SelectTrigger className='h-8 w-auto gap-1.5 border-0 bg-transparent text-xs shadow-none focus:ring-0'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align='end'>
                  <SelectItem value='name'>
                    <Trans context='person'>Name</Trans>
                  </SelectItem>
                  <SelectItem value='recent'>
                    <Trans>Recently added</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div
              ref={listRef}
              className='divide-border divide-y rounded-lg border'
            >
              {filtered.map((contact) => {
                const subtitle =
                  contact.directory && contact.directory !== contact.name
                    ? contact.directory
                    : ''
                const invited = sentPersons.has(contact.person)
                return (
                  <div
                    key={contact.id}
                    className='hover:bg-hover flex items-center gap-3 px-4 py-3 transition-colors'
                  >
                    {contact.person ? (
                      <EntityAvatar
                        src={`${appPath}/${contact.person}/-/avatar`}
                        styleUrl={`${appPath}/${contact.person}/-/style`}
                        name={contact.name}
                        size='lg'
                      />
                    ) : (
                      <EntityAvatar name={contact.name} size='lg' />
                    )}
                    <div className='flex min-w-0 flex-1 flex-col'>
                      <span className='flex items-center gap-2 font-medium'>
                        <span className='truncate'>
                          <HighlightText text={contact.name} query={search} />
                        </span>
                        {contact.friend ? (
                          <Badge variant='secondary'>
                            <Trans>Friend</Trans>
                          </Badge>
                        ) : contact.person ? (
                          <Badge variant='outline'>
                            <Trans>On Mochi</Trans>
                          </Badge>
                        ) : null}
                      </span>
                      {subtitle ? (
                        <span className='text-muted-foreground truncate text-xs'>
                          {subtitle}
                        </span>
                      ) : null}
                    </div>
                    <div className='flex items-center gap-2'>
                      {contact.friend ? (
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => startChat(contact)}
                        >
                          <MessageSquare className='h-4 w-4' />
                          <Trans context='verb'>Message</Trans>
                        </Button>
                      ) : null}
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => edit(contact)}
                      >
                        <Pencil className='h-4 w-4' />
                        <Trans>Edit</Trans>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant='ghost'
                            size='sm'
                            aria-label={t`Actions for ${contact.name}`}
                            icon={<MoreHorizontal className='h-4 w-4' />}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          {contact.person && !contact.friend && !invited ? (
                            <DropdownMenuItem onSelect={() => invite(contact)}>
                              <Send className='me-2 size-4' />
                              <Trans>Invite</Trans>
                            </DropdownMenuItem>
                          ) : null}
                          {contact.friend ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                setUnfriendDialog({ open: true, contact })
                              }
                            >
                              <UserX className='me-2 size-4' />
                              <Trans>Unfriend</Trans>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            className='text-destructive focus:text-destructive'
                            onSelect={() =>
                              setDeleteDialog({ open: true, contact })
                            }
                          >
                            <Trash2 className='me-2 size-4' />
                            <Trans>Delete</Trans>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <AddContactDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
        />

        <ConfirmDialog
          open={unfriendDialog.open}
          onOpenChange={(open) =>
            setUnfriendDialog({ ...unfriendDialog, open })
          }
          title={t`Unfriend`}
          desc={
            <Trans>
              End your friendship with{' '}
              <span className='text-foreground font-semibold'>
                {unfriendDialog.contact?.name ?? ''}
              </span>
              ? The contact stays in your address book.
            </Trans>
          }
          confirmText={
            <>
              <UserX className='size-4' />
              <Trans>Unfriend</Trans>
            </>
          }
          destructive
          handleConfirm={confirmUnfriend}
          isLoading={removeFriendMutation.isPending}
        />

        <ConfirmDialog
          open={deleteDialog.open}
          onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
          title={t`Delete contact`}
          desc={
            deleteDialog.contact?.friend ? (
              <Trans>
                Delete{' '}
                <span className='text-foreground font-semibold'>
                  {deleteDialog.contact?.name ?? ''}
                </span>
                ? This also ends your friendship.
              </Trans>
            ) : (
              <Trans>
                Delete{' '}
                <span className='text-foreground font-semibold'>
                  {deleteDialog.contact?.name ?? ''}
                </span>
                ?
              </Trans>
            )
          }
          confirmText={
            <>
              <Trash2 className='size-4' />
              <Trans>Delete</Trans>
            </>
          }
          destructive
          handleConfirm={confirmDelete}
          isLoading={deleteMutation.isPending}
        />
      </Main>
    </>
  )
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  // Found in the same folded space the filter matches in, so a row that
  // matched always shows where it matched.
  const range = searchRange(text, query)
  if (!range) return <>{text}</>
  const [start, end] = range
  return (
    <>
      <span className='text-muted-foreground'>{text.slice(0, start)}</span>
      {text.slice(start, end)}
      <span className='text-muted-foreground'>{text.slice(end)}</span>
    </>
  )
}
