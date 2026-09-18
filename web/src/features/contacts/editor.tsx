// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  ConfirmDialog,
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
  getErrorMessage,
  naturalCompare,
  toastAction,
  usePageTitle,
} from '@mochi/web'
import { BookUser, Check, Plus, Trash2, X } from 'lucide-react'
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
  useCreateContactMutation,
  useDeleteContactMutation,
  useUpdateContactMutation,
} from '@/hooks/useContacts'

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

  const query = useContactQuery(id ?? '', { enabled: Boolean(id) })
  const contact = query.data?.contact
  const { data: booksData } = useBooksQuery()
  const books = [...(booksData?.books ?? [])].sort((a, b) =>
    naturalCompare(a.name, b.name)
  )

  const createMutation = useCreateContactMutation()
  const updateMutation = useUpdateContactMutation()
  const deleteMutation = useDeleteContactMutation()
  const saving = createMutation.isPending || updateMutation.isPending

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
      />
      <Main>
        <form
          className='mx-auto w-full max-w-2xl space-y-6 p-3 sm:p-4'
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='contact-name'>
                <Trans>Name</Trans>
              </Label>
              <Input
                id='contact-name'
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
              />
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='contact-given'>
                  <Trans>Given name</Trans>
                </Label>
                <Input
                  id='contact-given'
                  value={form.given}
                  onChange={(event) => update({ given: event.target.value })}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='contact-family'>
                  <Trans>Family name</Trans>
                </Label>
                <Input
                  id='contact-family'
                  value={form.family}
                  onChange={(event) => update({ family: event.target.value })}
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='contact-nickname'>
                <Trans>Nickname</Trans>
              </Label>
              <Input
                id='contact-nickname'
                value={form.nickname}
                onChange={(event) => update({ nickname: event.target.value })}
              />
            </div>
          </div>

          <TypedSection
            legend={t`Emails`}
            addLabel={t`Add email`}
            inputType='email'
            removeLabel={t`Remove email`}
            types={EMAIL_TYPES}
            values={form.emails}
            onChange={(emails) => update({ emails })}
            defaultType='home'
          />

          <TypedSection
            legend={t`Phones`}
            addLabel={t`Add phone`}
            inputType='tel'
            removeLabel={t`Remove phone`}
            types={PHONE_TYPES}
            values={form.phones}
            onChange={(phones) => update({ phones })}
            defaultType='mobile'
          />

          <AddressSection
            values={form.addresses}
            onChange={(addresses) => update({ addresses })}
          />

          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='contact-birthday'>
                <Trans>Birthday</Trans>
              </Label>
              <Input
                id='contact-birthday'
                type='date'
                className='h-9'
                value={form.birthday}
                onChange={(event) => update({ birthday: event.target.value })}
              />
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='contact-organisation'>
                  <Trans>Organisation</Trans>
                </Label>
                <Input
                  id='contact-organisation'
                  value={form.organisation}
                  onChange={(event) =>
                    update({ organisation: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='contact-title'>
                  <Trans context='job title'>Title</Trans>
                </Label>
                <Input
                  id='contact-title'
                  value={form.title}
                  onChange={(event) => update({ title: event.target.value })}
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='contact-url'>
                <Trans>URL</Trans>
              </Label>
              <Input
                id='contact-url'
                type='url'
                value={form.url}
                onChange={(event) => update({ url: event.target.value })}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='contact-note'>
                <Trans>Note</Trans>
              </Label>
              <Textarea
                id='contact-note'
                rows={4}
                value={form.note}
                onChange={(event) => update({ note: event.target.value })}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='contact-book'>
                <Trans>Address book</Trans>
              </Label>
              <Select value={book} onValueChange={setBook}>
                <SelectTrigger id='contact-book' className='w-full'>
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
            </div>
          </div>

          <div className='flex flex-wrap items-center justify-end gap-2 border-t pt-4'>
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
      <SelectTrigger className='w-32 shrink-0' aria-label={label}>
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

function TypedSection({
  legend,
  addLabel,
  removeLabel,
  inputType,
  types,
  values,
  onChange,
  defaultType,
}: {
  legend: string
  addLabel: string
  removeLabel: string
  inputType: 'email' | 'tel'
  types: PropertyType[]
  values: TypedValue[]
  onChange: (values: TypedValue[]) => void
  defaultType: PropertyType
}) {
  const { t } = useLingui()
  const replace = (index: number, changes: Partial<TypedValue>) =>
    onChange(
      values.map((row, position) =>
        position === index ? { ...row, ...changes } : row
      )
    )

  return (
    <div className='space-y-2'>
      <Label>{legend}</Label>
      {values.map((row, index) => (
        <div key={index} className='flex items-center gap-2'>
          <Input
            type={inputType}
            className='flex-1'
            aria-label={legend}
            value={row.value}
            onChange={(event) => replace(index, { value: event.target.value })}
          />
          <TypeSelect
            label={t`Type`}
            types={types}
            value={row.type}
            onChange={(type) => replace(index, { type })}
          />
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={removeLabel}
            onClick={() =>
              onChange(values.filter((_, position) => position !== index))
            }
          >
            <X className='size-4' />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => onChange([...values, newTypedValue(defaultType)])}
      >
        <Plus className='size-4' />
        {addLabel}
      </Button>
    </div>
  )
}

function AddressSection({
  values,
  onChange,
}: {
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

  return (
    <div className='space-y-2'>
      <Label>
        <Trans>Addresses</Trans>
      </Label>
      {values.map((row, index) => (
        <div key={index} className='space-y-2 rounded-lg border p-3'>
          <div className='flex items-center gap-2'>
            <TypeSelect
              label={t`Type`}
              types={ADDRESS_TYPES}
              value={row.type}
              onChange={(type) => replace(index, { type })}
            />
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='ms-auto'
              aria-label={t`Remove address`}
              onClick={() =>
                onChange(values.filter((_, position) => position !== index))
              }
            >
              <X className='size-4' />
            </Button>
          </div>
          <div className='space-y-2'>
            <Label htmlFor={`address-street-${index}`}>
              <Trans>Street</Trans>
            </Label>
            <Input
              id={`address-street-${index}`}
              value={row.street}
              onChange={(event) =>
                replace(index, { street: event.target.value })
              }
            />
          </div>
          <div className='grid gap-2 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor={`address-city-${index}`}>
                <Trans>City</Trans>
              </Label>
              <Input
                id={`address-city-${index}`}
                value={row.city}
                onChange={(event) =>
                  replace(index, { city: event.target.value })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor={`address-region-${index}`}>
                <Trans>Region</Trans>
              </Label>
              <Input
                id={`address-region-${index}`}
                value={row.region}
                onChange={(event) =>
                  replace(index, { region: event.target.value })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor={`address-postcode-${index}`}>
                <Trans>Postcode</Trans>
              </Label>
              <Input
                id={`address-postcode-${index}`}
                value={row.postcode}
                onChange={(event) =>
                  replace(index, { postcode: event.target.value })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor={`address-country-${index}`}>
                <Trans>Country</Trans>
              </Label>
              <Input
                id={`address-country-${index}`}
                value={row.country}
                onChange={(event) =>
                  replace(index, { country: event.target.value })
                }
              />
            </div>
          </div>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => onChange([...values, newAddress('home')])}
      >
        <Plus className='size-4' />
        <Trans>Add address</Trans>
      </Button>
    </div>
  )
}
