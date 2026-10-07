// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useRef, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  formatMonthName,
  useLocale,
} from '@mochi/web'
import { X } from 'lucide-react'
import {
  NO_BIRTHDAY,
  birthdayOrder,
  birthdayParts,
  birthdayValue,
  type BirthdayPart,
  type BirthdayParts,
} from '@/lib/birthday'

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

/**
 * A birthday as a day, a month and an optional year, in the order the user's
 * date format writes them, so a birthday whose year is unknown can be entered
 * as one. A stored value the fields cannot show, such as text, stands as
 * written until it is cleared.
 */
export function BirthdayField({
  id,
  value,
  onChange,
  onInvalid,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  /** Whether the fields hold something that is not a day of the year. */
  onInvalid: (invalid: boolean) => void
}) {
  const { t } = useLingui()
  const { dateFormat } = useLocale().locale
  const [parts, setParts] = useState(() => birthdayParts(value) ?? NO_BIRTHDAY)
  const [invalid, setInvalid] = useState(false)
  // The value these fields last reported: a different one arriving means the
  // contact changed underneath, and the fields follow it.
  const reported = useRef(value)

  useEffect(() => {
    if (value === reported.current) return
    reported.current = value
    setParts(birthdayParts(value) ?? NO_BIRTHDAY)
    setInvalid(false)
    onInvalid(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const change = (next: BirthdayParts) => {
    setParts(next)
    const written = birthdayValue(next)
    setInvalid(written === null)
    onInvalid(written === null)
    if (written === null || written === value) return
    reported.current = written
    onChange(written)
  }

  const clear = () => change(NO_BIRTHDAY)
  const empty = !parts.day && !parts.month && !parts.year

  if (value && birthdayParts(value) === null && empty) {
    return (
      <div className='flex items-center gap-2'>
        <Input id={id} className='w-48' value={value} readOnly />
        <ClearButton label={t`Clear`} onClick={() => onChange('')} />
      </div>
    )
  }

  const order = birthdayOrder(dateFormat)
  const field = (part: BirthdayPart, first: boolean) => {
    if (part === 'month') {
      return (
        // A select inside a form mirrors its value into a hidden native select,
        // which answers a value set before its item has mounted with an empty
        // change. No month is ever chosen empty, so drop it; Clear empties the
        // fields.
        <Select
          key={part}
          value={parts.month}
          onValueChange={(month) => {
            if (month) change({ ...parts, month })
          }}
        >
          <SelectTrigger
            id={first ? id : undefined}
            className='w-40'
            aria-label={t`Month`}
            aria-invalid={invalid || undefined}
          >
            <SelectValue placeholder={t`Month`} />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((month) => (
              <SelectItem key={month} value={String(month)}>
                {formatMonthName(
                  new Date(Date.UTC(2000, month - 1, 15)),
                  'UTC'
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    const year = part === 'year'
    const name = year ? t`Year` : t({ message: 'Day', context: 'date part' })
    return (
      <Input
        key={part}
        id={first ? id : undefined}
        className={year ? 'w-20' : 'w-16'}
        inputMode='numeric'
        autoComplete='off'
        maxLength={year ? 4 : 2}
        aria-label={name}
        placeholder={name}
        aria-invalid={invalid || undefined}
        value={parts[part]}
        onChange={(event) => change({ ...parts, [part]: event.target.value })}
      />
    )
  }

  return (
    <div
      role='group'
      aria-label={t`Birthday`}
      className='flex flex-wrap items-center gap-2'
    >
      {order.map((part, index) => field(part, index === 0))}
      {!empty && <ClearButton label={t`Clear`} onClick={clear} />}
    </div>
  )
}

function ClearButton({
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
