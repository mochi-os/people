// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useMemo, useState } from 'react'
import { useMatchRoute, useNavigate } from '@tanstack/react-router'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  AuthenticatedLayout,
  ConfirmDialog,
  CreateEntityDialog,
  EntityAvatar,
  Input,
  Label,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Button,
  useAuthStore,
  getErrorMessage,
  naturalCompare,
  toastAction,
  useFormat,
  type CreateEntityValues,
  type NavItem,
  type NavMenuItem,
  type SidebarData,
} from '@mochi/web'
import {
  BookUser,
  Check,
  CircleUserRound,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  User,
  UsersRound,
} from 'lucide-react'
import endpoints from '@/api/endpoints'
import type { Book } from '@/api/types/contacts'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import {
  useBooksQuery,
  useContactsQuery,
  useCreateBookMutation,
  useDeleteBookMutation,
  useRenameBookMutation,
} from '@/hooks/useContacts'
import { useGroupsQuery } from '@/hooks/useGroups'
import { usePersonInformationQuery } from '@/hooks/usePerson'
import { ConnectDialog } from '@/features/contacts/connect-dialog'
import { GroupDialog } from '@/features/groups/group-dialog'

const profileIconCache = new Map<string, React.FC>()

// The avatar's stamp versions its URL, so an upload shows at once rather than
// once the browser's cached copy expires.
function profileIcon(identityId: string, version = ''): React.FC {
  const key = `${identityId}:${version}`
  let Icon = profileIconCache.get(key)
  if (!Icon) {
    Icon = function ProfileIcon() {
      return (
        <EntityAvatar
          src={endpoints.person.asset(identityId, 'avatar', version)}
          styleUrl={endpoints.person.asset(identityId, 'style')}
          size='xs'
        />
      )
    }
    // eslint-disable-next-line lingui/no-unlocalized-strings -- React displayName, dev tooling only
    Icon.displayName = `ProfileIcon(${identityId})`
    profileIconCache.set(key, Icon)
  }
  return Icon
}

function PeopleLayoutInner() {
  const { t } = useLingui()
  const { formatNumber } = useFormat()
  const { data: groups, isLoading: groupsLoading } = useGroupsQuery()
  const { data: contactsData } = useContactsQuery()
  const { data: booksData } = useBooksQuery()
  const myIdentity = useAuthStore((s) => s.identity)
  const { data: myInformation } = usePersonInformationQuery(myIdentity)
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()
  const {
    createDialogOpen: createGroupDialogOpen,
    closeCreateDialog: closeCreateGroupDialog,
    openCreateDialog: openCreateGroupDialog,
  } = useSidebarContext()

  const [createBookOpen, setCreateBookOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [renameBook, setRenameBook] = useState<Book | null>(null)
  const [deleteBook, setDeleteBook] = useState<Book | null>(null)

  const createBookMutation = useCreateBookMutation()
  const deleteBookMutation = useDeleteBookMutation()

  const createBook = async (values: CreateEntityValues) => {
    await toastAction(createBookMutation.mutateAsync(values.name), {
      loading: t`Creating address book...`,
      success: t`Address book created`,
      error: (error) =>
        getErrorMessage(error, t`Failed to create address book`),
    })
  }

  const confirmDeleteBook = async () => {
    if (!deleteBook) return
    try {
      await toastAction(deleteBookMutation.mutateAsync(deleteBook.id), {
        loading: t`Deleting address book...`,
        success: t`Address book deleted`,
        error: (error) =>
          getErrorMessage(error, t`Failed to delete address book`),
      })
      // The page of a deleted book has nothing left to show.
      if (matchRoute({ to: '/books/$id', params: { id: deleteBook.id } })) {
        void navigate({ to: '/' })
      }
      setDeleteBook(null)
    } catch {
      // toastAction already showed error
    }
  }

  const sidebarData: SidebarData = useMemo(() => {
    const sortedGroups = [...(groups || [])].sort((a, b) =>
      naturalCompare(a.name, b.name)
    )

    const groupItems: NavItem[] = sortedGroups.map((group) => ({
      id: group.id,
      title: group.name,
      url: `/groups/${group.id}` as const,
      icon: UsersRound,
    }))

    const sortedBooks = [...(booksData?.books ?? [])].sort((a, b) =>
      naturalCompare(a.name, b.name)
    )

    const bookItems: NavItem[] = sortedBooks.map((book) => {
      // The default book is the fallback every contact without a book lands
      // in, so it can be renamed but never deleted.
      const menu: NavMenuItem[] = [
        {
          title: t`Rename`,
          icon: Pencil,
          onClick: () => setRenameBook(book),
        },
      ]
      if (!book.default) {
        menu.push({
          title: t`Delete`,
          icon: Trash2,
          destructive: true,
          onClick: () => setDeleteBook(book),
        })
      }
      return {
        id: book.id,
        title: book.name,
        url: `/books/${book.id}` as const,
        icon: BookUser,
        menu,
      }
    })

    const pendingInvites = contactsData?.received?.length ?? 0

    const navGroups: SidebarData['navGroups'] = [
      {
        title: t`People`,
        items: [
          {
            title: t`Profile`,
            url: '/profile',
            icon: myIdentity
              ? profileIcon(myIdentity, myInformation?.avatar)
              : CircleUserRound,
          },
          { title: t`All contacts`, url: '/', icon: BookUser, aggregate: true },
          ...bookItems,
          {
            id: 'create-book',
            title: t`Create address book`,
            icon: Plus,
            onClick: () => setCreateBookOpen(true),
          },
          {
            title: t`Invitations`,
            url: '/invitations',
            icon: User,
            badge:
              pendingInvites > 0 ? formatNumber(pendingInvites) : undefined,
          },
          {
            id: 'connect-device',
            title: t`Connected devices`,
            icon: Smartphone,
            onClick: () => setConnectOpen(true),
          },
        ],
      },
      {
        title: t`Groups`,
        separator: true,
        animateList: true,
        items: [
          ...groupItems,
          {
            id: 'create-group',
            title: t`Create group`,
            icon: Plus,
            onClick: openCreateGroupDialog,
          },
        ],
      },
    ]

    return { navGroups }
  }, [
    groups,
    booksData?.books,
    contactsData,
    myIdentity,
    myInformation?.avatar,
    openCreateGroupDialog,
    formatNumber,
    t,
  ])

  return (
    <>
      <AuthenticatedLayout
        sidebarData={sidebarData}
        isLoadingSidebar={groupsLoading && !groups}
      />

      <GroupDialog
        open={createGroupDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateGroupDialog()
        }}
        group={null}
      />

      <CreateEntityDialog
        open={createBookOpen}
        onOpenChange={setCreateBookOpen}
        hideTrigger
        icon={BookUser}
        title={t`Create address book`}
        entityLabel={t`address book`}
        showDescription={false}
        onSubmit={createBook}
        isPending={createBookMutation.isPending}
      />

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />

      <RenameBookDialog book={renameBook} onClose={() => setRenameBook(null)} />

      <ConfirmDialog
        open={deleteBook !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteBook(null)
        }}
        title={t`Delete address book`}
        desc={
          <>
            <Trans>
              Delete{' '}
              <span className='text-foreground font-semibold'>
                {deleteBook?.name ?? ''}
              </span>
              ?
            </Trans>{' '}
            {plural(deleteBook?.count ?? 0, {
              one: '# contact is deleted with it.',
              other: '# contacts are deleted with it.',
            })}
          </>
        }
        confirmText={<Trans>Delete</Trans>}
        icon={<Trash2 className='size-4' />}
        destructive
        handleConfirm={confirmDeleteBook}
        isLoading={deleteBookMutation.isPending}
      />
    </>
  )
}

function RenameBookDialog({
  book,
  onClose,
}: {
  book: Book | null
  onClose: () => void
}) {
  const { t } = useLingui()
  const [name, setName] = useState('')
  const renameMutation = useRenameBookMutation()

  // The dialog is opened by the parent setting `book`, so there is no open
  // event to seed the field from.
  useEffect(() => {
    if (book) setName(book.name)
  }, [book])

  const submit = async () => {
    if (!book) return
    try {
      await toastAction(
        renameMutation.mutateAsync({ book: book.id, name: name.trim() }),
        {
          loading: t`Renaming address book...`,
          success: t`Address book renamed`,
          error: (error) =>
            getErrorMessage(error, t`Failed to rename address book`),
        }
      )
      onClose()
    } catch {
      // toastAction already showed error
    }
  }

  return (
    <ResponsiveDialog
      open={book !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      shouldCloseOnInteractOutside={false}
    >
      <ResponsiveDialogContent className='sm:max-w-[420px]'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            <Trans>Rename address book</Trans>
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className='space-y-2'>
          <Label htmlFor='book-name'>
            <Trans>Name</Trans>
          </Label>
          <Input
            id='book-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <ResponsiveDialogFooter className='gap-2'>
          <Button variant='outline' onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={() => void submit()}
            loading={renameMutation.isPending}
            disabled={name.trim() === ''}
            icon={<Check className='size-4' />}
          >
            <Trans>Save</Trans>
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

export function PeopleLayout() {
  return (
    <SidebarProvider>
      <PeopleLayoutInner />
    </SidebarProvider>
  )
}
