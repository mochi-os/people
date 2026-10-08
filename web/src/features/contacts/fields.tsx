// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@mochi/web'
import { Plus, X, type LucideIcon } from 'lucide-react'
import {
  ADDRESS_TYPES,
  type AddressValue,
  type PropertyType,
  type TypedValue,
} from '@/lib/card'

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
