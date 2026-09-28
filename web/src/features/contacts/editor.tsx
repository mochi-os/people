// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  DatePicker,
  Button,
  ConfirmDialog,
  Switch,
  DetailSkeleton,
  GeneralError,
  Input,
  Label,
  Main,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
  getErrorMessage,
  naturalCompare,
  toastAction,
  usePageTitle,
} from '@mochi/web'
import {
  BookUser,
  Check,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  ADDRESS_TYPES,
  EMAIL_TYPES,
  PHONE_TYPES,
  emptyForm,
  formFromCard,
  newAddress,
  newTypedValue,
  propertiesFromForm,
  type AddressValue,
  type ContactForm,
  type PropertyType,
  type TypedValue,
} from '@/lib/card'
import {
  useBooksQuery,
  useContactQuery,
  useContactsQuery,
  useInviteFriendMutation,
  useRemoveFriendMutation,
  useCreateContactMutation,
  useDeleteContactMutation,
  useUpdateContactMutation,
} from '@/hooks/useContacts'
import { AddContactDialog } from './add-dialog'

function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined
}

export function ContactEditor({ id }: { id?: string } = {}) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const heading = id ? t`Edit contact` : t`New contact`
  usePageTitle(heading)

  const [form, setForm] = useState<ContactForm>(emptyForm)
  const [book, setBook] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
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
  const inviteMutation = useInviteFriendMutation()
  const removeFriendMutation = useRemoveFriendMutation()
  const saving = createMutation.isPending || updateMutation.isPending

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

  const confirmUnfriend = async () => {
    if (!contact) return
    await toastAction(
      removeFriendMutation.mutateAsync({ person: contact.person }),
      {
        loading: t`Removing friend...`,
        success: t`Friend removed`,
        error: (error) => getErrorMessage(error, t`Failed to remove friend`),
      }
    ).catch(() => {})
    setUnfriendOpen(false)
  }

  // The etag the form was built from. A refetch that brings a different card -
  // the reload a 412 asks for - rebuilds the form; an identical one leaves the
  // user's typing alone.
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (!contact) return
    if (applied.current === contact.etag) return
    applied.current = contact.etag
    setForm(formFromCard(contact.card))
    setBook(contact.book)
  }, [contact])

  // A new contact lands in the default book unless the user picks another.
  useEffect(() => {
    if (id || book) return
    const fallback = booksData?.books.find((row) => row.default)
    if (fallback) setBook(fallback.id)
  }, [id, book, booksData?.books])

  const update = (changes: Partial<ContactForm>) =>
    setForm((current) => ({ ...current, ...changes }))

  const save = async () => {
    const properties = propertiesFromForm(form)
    try {
      if (id) {
        await toastAction(
          updateMutation.mutateAsync({
            contact: id,
            etag: contact?.etag,
            properties,
            book,
          }),
          {
            loading: t`Saving contact...`,
            success: t`Contact saved`,
            error: (error) => getErrorMessage(error, t`Failed to save contact`),
          }
        )
      } else {
        await toastAction(createMutation.mutateAsync({ properties, book }), {
          loading: t`Creating contact...`,
          success: t`Contact created`,
          error: (error) => getErrorMessage(error, t`Failed to create contact`),
        })
      }
      void navigate({ to: '/' })
    } catch (error) {
      // The card moved under us: show the server's own wording and reload the
      // contact so the form reflects what is actually stored.
      if (statusOf(error) === 412) {
        void query.refetch()
      }
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
      void navigate({ to: '/' })
    } catch {
      // toastAction already showed error
    }
  }

  // A select inside a form mirrors its value into a hidden native select, and
  // a value set before its item has mounted has no option there, so the
  // mirror answers with an empty change. No book is ever empty: drop it.
  const chooseBook = (value: string) => {
    if (value) setBook(value)
  }

  if (id && query.isLoading && !contact) {
    return (
      <>
        <PageHeader
          title={heading}
          icon={<BookUser className='size-4 md:size-5' />}
        />
        <Main>
          <div className='mx-auto w-full max-w-2xl p-3 sm:p-4'>
            <DetailSkeleton />
          </div>
        </Main>
      </>
    )
  }

  if (id && query.error) {
    return (
      <>
        <PageHeader
          title={heading}
          icon={<BookUser className='size-4 md:size-5' />}
        />
        <Main>
          <div className='mx-auto w-full max-w-2xl p-3 sm:p-4'>
            <GeneralError
              error={query.error}
              minimal
              mode='inline'
              reset={() => query.refetch()}
            />
          </div>
        </Main>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={heading}
        icon={<BookUser className='size-4 md:size-5' />}
        actions={
          // The header renders its actions twice, one copy per breakpoint,
          // so the switch is named by the label around it, not by an id.
          contact ? (
            <Label className='flex items-center gap-3'>
              <span className='text-end'>
                <Trans>Mochi friend</Trans>
                {friendState === 'invited' && (
                  <span className='text-muted-foreground block text-xs font-normal'>
                    <Trans>Invited</Trans>
                  </span>
                )}
              </span>
              <Switch
                checked={friendState !== 'none'}
                disabled={toggling}
                onCheckedChange={(on) => void toggleFriend(on)}
              />
            </Label>
          ) : undefined
        }
      />
      <Main>
        <form
          className='mx-auto w-full max-w-3xl divide-y p-3 sm:p-4'
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <section className='space-y-2 pb-4'>
            <Field
              id='contact-name'
              label={t({ message: 'Name', context: 'person' })}
            >
              <Input
                id='contact-name'
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
              />
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

          <section className='space-y-2 py-4'>
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
              <DatePicker
                id='contact-birthday'
                className='w-48'
                value={form.birthday}
                onChange={(day) => update({ birthday: day })}
              />
            </Field>
            <Field id='contact-organisation' label={t`Organisation`}>
              <Input
                id='contact-organisation'
                value={form.organisation}
                onChange={(event) =>
                  update({ organisation: event.target.value })
                }
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

          <div className='flex flex-wrap items-center justify-end gap-2 pt-4'>
            {id ? (
              <Button
                type='button'
                variant='outline'
                className='me-auto'
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className='size-4' />
                <Trans>Delete</Trans>
              </Button>
            ) : null}
            <Button
              type='button'
              variant='outline'
              onClick={() => void navigate({ to: '/' })}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              type='submit'
              loading={saving}
              disabled={form.name.trim() === ''}
              icon={<Check className='size-4' />}
            >
              <Trans>Save</Trans>
            </Button>
          </div>
        </form>

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

// The label column, which the type of an email, telephone or address also
// sits in, so every value starts on the same line.
const COLUMNS = 'grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4'
// A typed row keeps its type beside the value on a narrow screen too.
const TYPED =
  'flex items-center gap-2 sm:grid sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4'

/** A section's heading line, with the section's action at its end. */
function Heading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className='flex min-h-8 items-center justify-between gap-3'>
      <h2 className='text-sm font-semibold'>{title}</h2>
      {action}
    </div>
  )
}

/** One field: its label beside it, above it on a narrow screen. */
function Field({
  id,
  label,
  top,
  children,
}: {
  id: string
  label: string
  /** Align the label with the top of a tall control. */
  top?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn(COLUMNS, top ? 'sm:items-start' : 'sm:items-center')}>
      <Label htmlFor={id} className={cn(top && 'sm:pt-2.5')}>
        {label}
      </Label>
      <div className='min-w-0'>{children}</div>
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type='button' variant='outline' size='sm' onClick={onClick}>
      <Plus className='size-4' />
      {label}
    </Button>
  )
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      aria-label={label}
      onClick={onClick}
    >
      <X className='size-4' />
    </Button>
  )
}

function TypeSelect({
  label,
  types,
  value,
  onChange,
}: {
  label: string
  types: PropertyType[]
  value: PropertyType
  onChange: (value: PropertyType) => void
}) {
  const { t } = useLingui()
  const names: Record<PropertyType, string> = {
    // Contexts, because "Home" alone is the home page everywhere else in the
    // repository and a translation memory fills it with that word.
    home: t({ message: 'Home', context: 'contact type' }),
    work: t({ message: 'Work', context: 'contact type' }),
    mobile: t({ message: 'Mobile', context: 'contact type' }),
    other: t({ message: 'Other', context: 'contact type' }),
  }
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as PropertyType)}
    >
      <SelectTrigger className='w-28 shrink-0' aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {types.map((type) => (
          <SelectItem key={type} value={type}>
            {names[type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A kind's glyph before its type select, which together fill the label column. */
function Kind({
  icon: Icon,
  label,
  types,
  value,
  onChange,
}: {
  icon: LucideIcon
  label: string
  types: PropertyType[]
  value: PropertyType
  onChange: (value: PropertyType) => void
}) {
  return (
    <div className='flex items-center gap-2'>
      <Icon
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
      <TypeSelect
        label={label}
        types={types}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

/** One value per row, its kind and type in the label column and a remove button at the end. */
function TypedRows({
  icon,
  label,
  removeLabel,
  inputType,
  types,
  values,
  onChange,
}: {
  icon: LucideIcon
  label: string
  removeLabel: string
  inputType: 'email' | 'tel'
  types: PropertyType[]
  values: TypedValue[]
  onChange: (values: TypedValue[]) => void
}) {
  const { t } = useLingui()
  const replace = (index: number, changes: Partial<TypedValue>) =>
    onChange(
      values.map((row, position) =>
        position === index ? { ...row, ...changes } : row
      )
    )

  return (
    <>
      {values.map((row, index) => (
        <div key={index} className={TYPED}>
          <Kind
            icon={icon}
            label={t`Type`}
            types={types}
            value={row.type}
            onChange={(type) => replace(index, { type })}
          />
          <div className='flex flex-1 items-center gap-2'>
            <Input
              type={inputType}
              className='flex-1'
              aria-label={label}
              value={row.value}
              onChange={(event) =>
                replace(index, { value: event.target.value })
              }
            />
            <RemoveButton
              label={removeLabel}
              onClick={() =>
                onChange(values.filter((_, position) => position !== index))
              }
            />
          </div>
        </div>
      ))}
    </>
  )
}

type AddressPart = 'city' | 'region' | 'postcode' | 'country'

/**
 * One address per block: the street with the address's kind and type in the
 * label column and its remove button at the end, then the other parts labelled.
 */
function AddressRows({
  icon,
  values,
  onChange,
}: {
  icon: LucideIcon
  values: AddressValue[]
  onChange: (values: AddressValue[]) => void
}) {
  const { t } = useLingui()
  const replace = (index: number, changes: Partial<AddressValue>) =>
    onChange(
      values.map((row, position) =>
        position === index ? { ...row, ...changes } : row
      )
    )
  const parts: [AddressPart, string][] = [
    ['city', t`City`],
    ['region', t`Region`],
    ['postcode', t`Postcode`],
    ['country', t`Country`],
  ]

  return (
    <>
      {values.map((row, index) => (
        <div key={index} className='space-y-2 [&+&]:pt-3'>
          <div className={TYPED}>
            <Kind
              icon={icon}
              label={t`Type`}
              types={ADDRESS_TYPES}
              value={row.type}
              onChange={(type) => replace(index, { type })}
            />
            <div className='flex flex-1 items-center gap-2'>
              <Input
                id={`address-street-${index}`}
                className='flex-1'
                aria-label={t`Street`}
                value={row.street}
                onChange={(event) =>
                  replace(index, { street: event.target.value })
                }
              />
              <RemoveButton
                label={t`Remove address`}
                onClick={() =>
                  onChange(values.filter((_, position) => position !== index))
                }
              />
            </div>
          </div>
          {parts.map(([part, label]) => (
            <Field key={part} id={`address-${part}-${index}`} label={label}>
              <Input
                id={`address-${part}-${index}`}
                value={row[part]}
                onChange={(event) =>
                  replace(index, { [part]: event.target.value })
                }
              />
            </Field>
          ))}
        </div>
      ))}
    </>
  )
}
