// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  ConfirmDialog,
  DetailSkeleton,
  GeneralError,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SidePanel,
  SidePanelBody,
  SidePanelFooter,
  SidePanelHeader,
  SidePanelTitle,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  getErrorMessage,
  naturalCompare,
  toast,
  toastAction,
} from '@mochi/web'
import {
  Copy,
  Mail,
  MapPin,
  Merge,
  Phone,
  Plus,
  Trash2,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import type { ContactFull } from '@/api/types/contacts'
import {
  EMAIL_TYPES,
  PHONE_TYPES,
  emptyForm,
  formFromCard,
  newAddress,
  newTypedValue,
  propertiesFromForm,
  type ContactForm,
} from '@/lib/card'
import {
  useBooksQuery,
  useContactQuery,
  useContactsQuery,
  useCreateContactMutation,
  useDeleteContactMutation,
  useInviteFriendMutation,
  useMergePreviewMutation,
  useRemoveFriendMutation,
  useUpdateContactMutation,
} from '@/hooks/useContacts'
import { AddContactDialog } from './add-dialog'
import { BirthdayField } from './birthday'
import { AddButton, AddressRows, Field, Heading, TypedRows } from './fields'
import { MergeDialog } from './merge-dialog'

function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined
}

// The card as the form would write it, which a save is measured against.
const written = (form: ContactForm) => JSON.stringify(propertiesFromForm(form))

// How long typing rests before it is saved.
const PAUSE = 1000

/**
 * A contact in a side panel over the list, as a project's object opens: each
 * field saves once typing rests and again when it is left, and a choice at
 * once. With no id, the panel makes a new contact, which its Create button
 * saves; it then follows as the contact it made.
 */
export function ContactPanel({
  id,
  book: start,
  onOpen,
  onClose,
}: {
  id?: string
  /** The address book a new contact goes in, else the default. */
  book?: string
  /** Show another contact in the panel: one made, copied or merged into. */
  onOpen: (id: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  const [form, setForm] = useState<ContactForm>(emptyForm)
  const [book, setBook] = useState('')
  const [unreadable, setUnreadable] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [unfriendOpen, setUnfriendOpen] = useState(false)

  const query = useContactQuery(id ?? '', { enabled: Boolean(id) })
  const contact = query.data?.contact
  const { data: booksData } = useBooksQuery()
  const books = [...(booksData?.books ?? [])].sort((a, b) =>
    naturalCompare(a.name, b.name)
  )

  const createMutation = useCreateContactMutation()
  const updateMutation = useUpdateContactMutation()
  const deleteMutation = useDeleteContactMutation()
  const previewMutation = useMergePreviewMutation()
  const inviteMutation = useInviteFriendMutation()
  const removeFriendMutation = useRemoveFriendMutation()

  // The friend switch shows the handshake: a friend, an invitation the other
  // side has not answered, or neither. A pending invitation is known only
  // from the sent list, since the row's flag flips on accept.
  const { data: contactsData } = useContactsQuery()
  const invited = Boolean(
    contact?.person &&
    contactsData?.sent.some((invite) => invite.id === contact.person)
  )
  const friendState = contact?.friend ? 'friend' : invited ? 'invited' : 'none'
  const toggling = inviteMutation.isPending || removeFriendMutation.isPending

  // The form as last rendered, which a save started by a timer, a blur or
  // the panel closing reads.
  const latest = useRef({ form, book })
  latest.current = { form, book }

  // What the server holds, as the form would write it, and its etag, which
  // every save sends so a change made elsewhere is refused, not overwritten.
  const stored = useRef<{ etag: string; card: string; book: string } | null>(
    null
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The save under way, and whether another was asked for meanwhile: saves
  // go one at a time, each sending the etag the one before it was answered
  // with.
  const running = useRef<Promise<void> | null>(null)
  const again = useRef(false)

  const dirty = useCallback(() => {
    const base = stored.current
    if (!base) return false
    return (
      written(latest.current.form) !== base.card ||
      latest.current.book !== base.book
    )
  }, [])

  const apply = useCallback((row: ContactFull) => {
    const next = formFromCard(row.card)
    stored.current = { etag: row.etag, card: written(next), book: row.book }
    latest.current = { ...latest.current, form: next, book: row.book }
    setForm(next)
    setBook(row.book)
  }, [])

  // A card arriving with a new etag: the same editable properties under a new
  // etag (the friend switch moved, or a save of this panel's came back) only
  // take the etag. A card changed elsewhere replaces the form while it holds
  // nothing unsaved; an edit waits, its save is refused, and the reload that
  // follows reads the card.
  useEffect(() => {
    if (!contact) return
    const base = stored.current
    if (base?.etag === contact.etag) return
    if (base) {
      const card = written(formFromCard(contact.card))
      if (card === base.card && contact.book === base.book) {
        stored.current = { ...base, etag: contact.etag }
        return
      }
      if (dirty()) return
    }
    apply(contact)
  }, [contact, dirty, apply])

  // A new contact goes in the book it was started from, else the default.
  useEffect(() => {
    if (id || book) return
    const rows = booksData?.books ?? []
    const chosen =
      rows.find((row) => row.id === start) ?? rows.find((row) => row.default)
    if (chosen) setBook(chosen.id)
  }, [id, book, start, booksData?.books])

  const send = async () => {
    const base = stored.current
    if (!id || !base || !dirty()) return
    const current = latest.current
    // A contact keeps its name. A birthday that is not yet a day never
    // reaches the form, so the birthday it had stands until it is one.
    if (!current.form.name.trim()) return
    const properties = propertiesFromForm(current.form)
    try {
      const data = await updateMutation.mutateAsync({
        contact: id,
        etag: base.etag,
        properties,
        book: current.book,
      })
      stored.current = {
        etag: data.contact.etag,
        card: JSON.stringify(properties),
        book: current.book,
      }
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to save contact`))
      if (statusOf(error) === 412) {
        again.current = false
        const fresh = await query.refetch()
        if (fresh.data) apply(fresh.data.contact)
      }
    }
  }

  // Save what the form holds now, after any save already under way.
  const save = (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (running.current) {
      again.current = true
      return running.current
    }
    const run = send().finally(() => {
      running.current = null
      if (again.current) {
        again.current = false
        void save()
      }
    })
    running.current = run
    return run
  }

  // Everything still under way, including a save asked for during one.
  const settle = async () => {
    await save()
    while (running.current) await running.current
  }

  // Leaving saves what was typed, however the panel goes: closed, or
  // replaced by the next contact.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => () => void saveRef.current(), [])

  const later = () => {
    if (!id) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void saveRef.current(), PAUSE)
  }

  const update = (changes: Partial<ContactForm>) => {
    setForm((current) => ({ ...current, ...changes }))
    later()
  }

  // A select inside a form mirrors its value into a hidden native select, and
  // a value set before its item has mounted has no option there, so the
  // mirror answers with an empty change. No book is ever empty: drop it.
  const chooseBook = (value: string) => {
    if (!value || value === latest.current.book) return
    setBook(value)
    latest.current = { ...latest.current, book: value }
    if (id) void save()
  }

  const close = () => {
    void save()
    onClose()
  }

  const blocked = form.name.trim() === '' || unreadable

  const create = async () => {
    if (blocked) return
    const current = latest.current
    try {
      const data = await toastAction(
        createMutation.mutateAsync({
          properties: propertiesFromForm(current.form),
          book: current.book,
        }),
        {
          loading: t`Creating contact...`,
          success: t`Contact created`,
          error: (error) => getErrorMessage(error, t`Failed to create contact`),
        }
      )
      onOpen(data.contact.id)
    } catch {
      // toastAction already showed the error
    }
  }

  // A copy is made at once from this card as it stands, so what the form does
  // not show comes with it, and opens in the panel.
  const copy = async () => {
    if (!id || blocked) return
    await settle()
    const current = latest.current
    try {
      const data = await toastAction(
        createMutation.mutateAsync({
          properties: propertiesFromForm(current.form),
          book: current.book,
          source: id,
        }),
        {
          loading: t`Creating contact...`,
          success: t`Contact copied`,
          error: (error) => getErrorMessage(error, t`Failed to create contact`),
        }
      )
      onOpen(data.contact.id)
    } catch {
      // toastAction already showed the error
    }
  }

  // The chosen contact is merged in as soon as it is picked. The server
  // combines the two cards; the survivor is whichever is linked to a Mochi
  // person, so the panel may move to the other contact.
  const pickMerge = async (source: string) => {
    if (!id) return
    await settle()
    let preview
    try {
      preview = await previewMutation.mutateAsync({ contact: id, source })
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to merge contacts`))
      return
    }
    if (!preview.source) return
    try {
      await toastAction(
        updateMutation.mutateAsync({
          contact: preview.contact.id,
          etag: preview.contact.etag,
          source: { id: preview.source.id, etag: preview.source.etag },
        }),
        {
          loading: t`Merging contacts...`,
          success: t`Contacts merged`,
          error: (error) => getErrorMessage(error, t`Failed to merge contacts`),
        }
      )
      setMergeOpen(false)
      if (preview.contact.id !== id) onOpen(preview.contact.id)
    } catch {
      // toastAction already showed the error
    }
  }

  const toggleFriend = async (on: boolean) => {
    if (!contact) return
    if (on) {
      if (!contact.person) {
        setLinkOpen(true)
        return
      }
      const name = contact.directory || contact.name
      await toastAction(
        inviteMutation.mutateAsync({ person: contact.person, name }),
        {
          loading: t`Sending invitation...`,
          success: t`Invitation sent`,
          error: (error) =>
            getErrorMessage(error, t`Failed to send invitation`),
        }
      ).catch(() => {})
      return
    }
    if (contact.friend) {
      setUnfriendOpen(true)
      return
    }
    if (invited) {
      await toastAction(
        removeFriendMutation.mutateAsync({ person: contact.person }),
        {
          loading: t`Cancelling invitation...`,
          success: t`Invitation cancelled`,
          error: (error) =>
            getErrorMessage(error, t`Failed to cancel invitation`),
        }
      ).catch(() => {})
    }
  }

  // A failed unfriend leaves the dialog open, so it can be tried again.
  const confirmUnfriend = async () => {
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
      setUnfriendOpen(false)
    } catch {
      // toastAction already showed the error
    }
  }

  const confirmDelete = async () => {
    if (!id) return
    try {
      await toastAction(deleteMutation.mutateAsync({ contact: id }), {
        loading: t`Deleting contact...`,
        success: t`Contact deleted`,
        error: (error) => getErrorMessage(error, t`Failed to delete contact`),
      })
      setDeleteOpen(false)
      // Nothing is left to save.
      stored.current = null
      onClose()
    } catch {
      // toastAction already showed the error
    }
  }

  const frame = (
    title: ReactNode,
    body: ReactNode,
    actions?: ReactNode,
    footer?: ReactNode
  ) => (
    <SidePanel
      open={true}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      size='xl'
      dismissOnOutsideClick
      onOpenAutoFocus={(event) => {
        // A new contact starts at its name; an open one takes no focus, so a
        // phone's keyboard does not cover it.
        event.preventDefault()
        if (!id) document.getElementById('contact-name')?.focus()
      }}
    >
      <SidePanelHeader actions={actions}>
        <SidePanelTitle>{title}</SidePanelTitle>
      </SidePanelHeader>
      <SidePanelBody>{body}</SidePanelBody>
      {footer && <SidePanelFooter>{footer}</SidePanelFooter>}
    </SidePanel>
  )

  // Until the card arrives, the name the list already holds.
  const listed =
    contactsData?.contacts.find((row) => row.id === id)?.name || t`Contacts`

  if (id && query.isLoading && !contact) {
    return frame(listed, <DetailSkeleton />)
  }

  if (id && query.error && !contact) {
    return frame(
      listed,
      <GeneralError
        error={query.error}
        minimal
        mode='inline'
        reset={() => query.refetch()}
      />
    )
  }

  const action = (
    label: string,
    icon: LucideIcon,
    onClick: () => void,
    disabled = false
  ) => {
    const Icon = icon
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-8'
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            <Icon className='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )
  }

  const actions = id ? (
    <>
      {action(t`Copy`, Copy, () => void copy(), blocked)}
      {action(
        t({ message: 'Merge', context: 'combine' }),
        Merge,
        () => setMergeOpen(true)
      )}
      {action(t`Delete contact`, Trash2, () => setDeleteOpen(true))}
    </>
  ) : undefined

  const body = (
    <>
    {/* Leaving a field saves it. The browser's own checks would refuse a URL
        a phone stored without its scheme, in words the page cannot translate. */}
    <form
      noValidate
      className='divide-y'
      onBlur={() => {
        if (id) void save()
      }}
      onSubmit={(event) => {
        event.preventDefault()
        if (id) void save()
        else void create()
      }}
    >
      {contact && (
        <section className='pb-4'>
          <Field id='contact-friend' label={t`Mochi friend`}>
            <div className='flex items-center gap-3'>
              <Switch
                id='contact-friend'
                checked={friendState !== 'none'}
                disabled={toggling}
                onCheckedChange={(on) => void toggleFriend(on)}
              />
              {friendState === 'invited' && (
                <span className='text-muted-foreground text-xs'>
                  <Trans>Invited</Trans>
                </span>
              )}
            </div>
          </Field>
        </section>
      )}

      <section className={contact ? 'space-y-2 py-4' : 'space-y-2 pb-4'}>
        <Field id='contact-name' label={t({ message: 'Name', context: 'person' })}>
          <Input
            id='contact-name'
            value={form.name}
            aria-invalid={form.name.trim() === '' && Boolean(id)}
            onChange={(event) => update({ name: event.target.value })}
          />
          {form.name.trim() === '' && id && (
            <p className='text-destructive mt-1 text-xs'>
              <Trans>Name is required</Trans>
            </p>
          )}
        </Field>
        <Field id='contact-given' label={t`Forename`}>
          <Input
            id='contact-given'
            value={form.given}
            onChange={(event) => update({ given: event.target.value })}
          />
        </Field>
        <Field id='contact-family' label={t`Surname`}>
          <Input
            id='contact-family'
            value={form.family}
            onChange={(event) => update({ family: event.target.value })}
          />
        </Field>
        <Field id='contact-nickname' label={t`Nickname`}>
          <Input
            id='contact-nickname'
            value={form.nickname}
            onChange={(event) => update({ nickname: event.target.value })}
          />
        </Field>
      </section>

      <section className='space-y-4 py-4'>
        <div className='flex flex-wrap justify-end gap-2'>
          <AddButton
            label={t`Add email`}
            onClick={() =>
              update({ emails: [...form.emails, newTypedValue('home')] })
            }
          />
          <AddButton
            label={t`Add telephone`}
            onClick={() =>
              update({ phones: [...form.phones, newTypedValue('mobile')] })
            }
          />
          <AddButton
            label={t`Add address`}
            onClick={() =>
              update({ addresses: [...form.addresses, newAddress('home')] })
            }
          />
        </div>
        {form.emails.length > 0 && (
          <div className='space-y-2'>
            <TypedRows
              icon={Mail}
              label={t`Emails`}
              inputType='email'
              removeLabel={t`Remove email`}
              types={EMAIL_TYPES}
              values={form.emails}
              onChange={(emails) => update({ emails })}
            />
          </div>
        )}
        {form.phones.length > 0 && (
          <div className='space-y-2'>
            <TypedRows
              icon={Phone}
              label={t`Telephones`}
              inputType='tel'
              removeLabel={t`Remove telephone`}
              types={PHONE_TYPES}
              values={form.phones}
              onChange={(phones) => update({ phones })}
            />
          </div>
        )}
        {form.addresses.length > 0 && (
          <div className='space-y-2'>
            <AddressRows
              icon={MapPin}
              values={form.addresses}
              onChange={(addresses) => update({ addresses })}
            />
          </div>
        )}
      </section>

      <section className='space-y-2 pt-4'>
        <Heading title={t`Details`} />
        <Field id='contact-book' label={t`Address book`}>
          <Select value={book} onValueChange={chooseBook}>
            <SelectTrigger id='contact-book' className='w-full sm:w-72'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {books.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id='contact-birthday' label={t`Birthday`}>
          <BirthdayField
            id='contact-birthday'
            value={form.birthday}
            onChange={(birthday) => update({ birthday })}
            onInvalid={setUnreadable}
          />
        </Field>
        <Field id='contact-organisation' label={t`Organisation`}>
          <Input
            id='contact-organisation'
            value={form.organisation}
            onChange={(event) => update({ organisation: event.target.value })}
          />
        </Field>
        <Field
          id='contact-title'
          label={t({ message: 'Title', context: 'job title' })}
        >
          <Input
            id='contact-title'
            value={form.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </Field>
        <Field id='contact-url' label={t`URL`}>
          <Input
            id='contact-url'
            type='url'
            value={form.url}
            onChange={(event) => update({ url: event.target.value })}
          />
        </Field>
        <Field id='contact-note' label={t`Note`} top>
          <Textarea
            id='contact-note'
            rows={3}
            value={form.note}
            onChange={(event) => update({ note: event.target.value })}
          />
        </Field>
      </section>
    </form>

      {id && (
        <MergeDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          contacts={contactsData?.contacts ?? []}
          exclude={id}
          pending={
            previewMutation.isPending || updateMutation.isPending
              ? (previewMutation.variables?.source ?? null)
              : null
          }
          onPick={(source) => void pickMerge(source)}
        />
      )}

      {contact && !contact.person && (
        <AddContactDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          link={{ contact: contact.id, name: contact.name }}
        />
      )}

      <ConfirmDialog
        open={unfriendOpen}
        onOpenChange={setUnfriendOpen}
        title={t`Unfriend`}
        desc={
          <Trans>
            End your friendship with{' '}
            <span className='text-foreground font-semibold'>
              {contact?.name ?? ''}
            </span>
            ? The contact stays in your address book.
          </Trans>
        }
        confirmText={<Trans>Unfriend</Trans>}
        icon={<UserX className='size-4' />}
        destructive
        handleConfirm={confirmUnfriend}
        isLoading={removeFriendMutation.isPending}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t`Delete contact`}
        desc={
          contact?.friend ? (
            <Trans>
              Delete{' '}
              <span className='text-foreground font-semibold'>
                {contact?.name ?? ''}
              </span>
              ? This also ends your friendship.
            </Trans>
          ) : (
            <Trans>
              Delete{' '}
              <span className='text-foreground font-semibold'>
                {contact?.name ?? ''}
              </span>
              ?
            </Trans>
          )
        }
        confirmText={<Trans>Delete</Trans>}
        icon={<Trash2 className='size-4' />}
        destructive
        handleConfirm={confirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </>
  )

  const footer = id ? undefined : (
    <div className='flex justify-end'>
      <Button
        type='button'
        disabled={blocked}
        loading={createMutation.isPending}
        icon={<Plus className='size-4' />}
        onClick={() => void create()}
      >
        <Trans>Create</Trans>
      </Button>
    </div>
  )

  return frame(contact?.name || t`New contact`, body, actions, footer)
}
