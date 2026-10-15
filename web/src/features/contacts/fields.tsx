// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import {
  Button,
  EntityAvatar,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  providerName,
  requestHelpers,
  useDebounce,
} from '@mochi/web'
import { AtSign, Plus, X, type LucideIcon } from 'lucide-react'
import endpoints from '@/api/endpoints'
import {
  ADDRESS_TYPES,
  HANDLE_NETWORKS,
  type AddressValue,
  type HandleNetwork,
  type HandleValue,
  type PropertyType,
  type TypedValue,
} from '@/lib/card'

// Example handles, shown as placeholders.
const HANDLE_EXAMPLES = { fediverse: '@name@server.example', bluesky: 'name.bsky.social' }

// The label column, which the type of an email, telephone or address also
// sits in, so every value starts on the same line.
const COLUMNS = 'grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4'
// A typed row keeps its type beside the value on a narrow screen too.
const TYPED =
  'flex items-center gap-2 sm:grid sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4'

/** A section's heading line. */
export function Heading({ title }: { title: string }) {
  return (
    <div className='flex min-h-8 items-center justify-between gap-3'>
      <h2 className='text-sm font-semibold'>{title}</h2>
    </div>
  )
}

/** One field: its label beside it, above it on a narrow screen. */
export function Field({
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

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
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
export function TypedRows({
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
            label={t({ message: 'Type', context: 'kind' })}
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
export function AddressRows({
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
              label={t({ message: 'Type', context: 'kind' })}
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

/**
 * A handle on another network per row (phase 17): the network in the label
 * column, the handle, and what the network shows of the person once the
 * handle resolves, so a typo is seen before the card is saved.
 */
export function HandleRows({
  values,
  onChange,
}: {
  values: HandleValue[]
  onChange: (values: HandleValue[]) => void
}) {
  const { t } = useLingui()
  const replace = (index: number, changes: Partial<HandleValue>) =>
    onChange(
      values.map((row, position) =>
        position === index ? { ...row, ...changes } : row
      )
    )
  return (
    <>
      {values.map((row, index) => (
        <div key={index} className='space-y-1'>
          <div className={TYPED}>
            <div className='flex items-center gap-2'>
              <AtSign
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
              <Select
                value={row.network}
                onValueChange={(next) =>
                  replace(index, { network: next as HandleNetwork })
                }
              >
                <SelectTrigger className='w-28 shrink-0' aria-label={t`Network`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HANDLE_NETWORKS.map((network) => (
                    <SelectItem key={network} value={network}>
                      {providerName(network)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-1 items-center gap-2'>
              <Input
                className='flex-1'
                aria-label={t`Handle`}
                placeholder={
                  row.network === 'bluesky'
                    ? HANDLE_EXAMPLES.bluesky
                    : HANDLE_EXAMPLES.fediverse
                }
                value={row.value}
                onChange={(event) =>
                  replace(index, { value: event.target.value })
                }
              />
              <RemoveButton
                label={t`Remove handle`}
                onClick={() =>
                  onChange(values.filter((_, position) => position !== index))
                }
              />
            </div>
          </div>
          <HandlePreview handle={row.value} />
        </div>
      ))}
    </>
  )
}

/** What the network shows of a handle: the person's avatar, name and address. */
function HandlePreview({ handle }: { handle: string }) {
  const debounced = useDebounce(handle.trim(), 600)
  const { data } = useQuery({
    queryKey: ['contacts', 'handle', debounced],
    queryFn: () =>
      requestHelpers.get<{
        name?: string
        avatar?: string
        page?: string
        address?: string
      }>(endpoints.contacts.handleLookup, { params: { handle: debounced } }),
    enabled: debounced.length > 3 && !debounced.includes(' '),
    retry: false,
    staleTime: 10 * 60 * 1000,
  })
  if (!data?.name && !data?.address) return null
  return (
    <div className='text-muted-foreground flex items-center gap-2 text-xs sm:ps-[calc(9rem+1rem)]'>
      <EntityAvatar src={data.avatar || null} name={data.name || ''} size='xs' />
      <span className='truncate'>
        {[data.name, data.address].filter(Boolean).join(' · ')}
      </span>
    </div>
  )
}
