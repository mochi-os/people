// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
  getErrorMessage,
  toastAction,
} from '@mochi/web'
import { Check } from 'lucide-react'
import type { InvitePolicy } from '@/api/contacts'
import {
  usePreferencesQuery,
  useSetPreferencesMutation,
} from '@/hooks/useContacts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useLingui()
  const options: { value: InvitePolicy; label: string }[] = [
    { value: 'notify', label: t`Notify me` },
    { value: 'silent', label: t`Store silently` },
    { value: 'reject', label: t`Reject all` },
    { value: 'accept', label: t`Accept automatically` },
  ]
  // The load error matters more than most: without it a failed load left the
  // radio on its 'notify' default, which looks like the user's real setting,
  // and saving then overwrote whatever they actually had.
  const { data, isLoading, isError, error } = usePreferencesQuery()
  const setPolicy = useSetPreferencesMutation()
  const [value, setValue] = useState<InvitePolicy>('notify')

  useEffect(() => {
    if (data?.policy) setValue(data.policy)
  }, [data?.policy])

  const handleSave = async () => {
    if (data?.policy && value === data.policy) {
      onOpenChange(false)
      return
    }
    try {
      await toastAction(setPolicy.mutateAsync(value), {
        loading: t`Saving...`,
        success: t`Invite policy updated`,
        error: (error) => getErrorMessage(error, t`Failed to save`),
      })
      onOpenChange(false)
    } catch {
      // toastAction already showed error
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='sm:max-w-md'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            <Trans>Incoming invitations</Trans>
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        {isLoading ? (
          <div className='space-y-3 py-2'>
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
          </div>
        ) : isError ? (
          <p className='text-destructive py-2 text-sm'>
            {getErrorMessage(error, t`Failed to load your invite policy`)}
          </p>
        ) : (
          <RadioGroup
            value={value}
            onValueChange={(v) => setValue(v as InvitePolicy)}
            className='py-2'
          >
            {options.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`invite-policy-${opt.value}`}
                className='hover:bg-hover flex cursor-pointer items-center gap-3 rounded-md border p-3'
              >
                <RadioGroupItem
                  value={opt.value}
                  id={`invite-policy-${opt.value}`}
                />
                <Label
                  htmlFor={`invite-policy-${opt.value}`}
                  className='cursor-pointer font-medium'
                >
                  {opt.label}
                </Label>
              </label>
            ))}
          </RadioGroup>
        )}
        <ResponsiveDialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={setPolicy.isPending}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={handleSave}
            loading={setPolicy.isPending}
            icon={<Check className='size-4' />}
            disabled={
              isLoading || isError || (!!data?.policy && value === data.policy)
            }
          >
            <Trans>Save</Trans>
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
