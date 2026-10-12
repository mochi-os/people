// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  EmptyState,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ScrollArea,
  SearchInput,
  naturalCompare,
  useScreenSize,
} from '@mochi/web'
import { Loader2, Search } from 'lucide-react'
import type { Contact } from '@/api/types/contacts'
import { searchMatches } from '@/lib/search'

/** Choose the contact to merge with the one being edited. */
export function MergeDialog({
  open,
  onOpenChange,
  contacts,
  exclude,
  pending,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: Contact[]
  /** The contact being edited, which is not offered. */
  exclude: string
  /** The contact whose merge is being read, if any. */
  pending: string | null
  onPick: (contact: string) => void
}) {
  const { t } = useLingui()
  const { isMobile } = useScreenSize()
  const [search, setSearch] = useState('')
  const others = contacts
    .filter((contact) => contact.id !== exclude)
    .filter(
      (contact) =>
        searchMatches(contact.name, search) ||
        searchMatches(contact.directory, search)
    )
    .sort((a, b) => naturalCompare(a.name, b.name))

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('')
        onOpenChange(next)
      }}
    >
      <ResponsiveDialogContent className='sm:max-w-120'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t`Merge contacts`}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='sr-only'>
            {t`Merge contacts`}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className='space-y-3'>
          <SearchInput
            placeholder={t`Search...`}
            value={search}
            onValueChange={setSearch}
            clearLabel={t`Clear search`}
            autoFocus={!isMobile}
          />
          <ScrollArea className='h-[18rem] rounded-xl border'>
            <div className='p-2'>
              {others.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title={
                    search.trim()
                      ? t`No results for "${search}"`
                      : t`No contacts yet`
                  }
                  className='border-0 bg-transparent px-4 py-5 shadow-none'
                />
              ) : (
                <ul className='space-y-1'>
                  {others.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type='button'
                        disabled={pending !== null}
                        onClick={() => onPick(contact.id)}
                        className='hover:bg-hover flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start disabled:opacity-50'
                      >
                        <span className='flex min-w-0 flex-col'>
                          <span className='truncate text-sm font-medium'>
                            {contact.name}
                          </span>
                          {contact.directory &&
                            contact.directory !== contact.name && (
                              <span className='text-muted-foreground truncate text-xs'>
                                {contact.directory}
                              </span>
                            )}
                        </span>
                        {pending === contact.id && (
                          <Loader2 className='text-muted-foreground size-4 shrink-0 animate-spin' />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
