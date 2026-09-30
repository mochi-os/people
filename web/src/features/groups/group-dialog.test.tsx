// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupDialog } from './group-dialog'

const calls = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }))

beforeEach(() => {
  calls.create = vi.fn().mockResolvedValue({ success: true })
  calls.update = vi.fn().mockResolvedValue({ success: true })
})

vi.mock('@/hooks/useGroups', () => ({
  useCreateGroupMutation: () => ({
    mutateAsync: calls.create,
    isPending: false,
  }),
  useUpdateGroupMutation: () => ({
    mutateAsync: calls.update,
    isPending: false,
  }),
}))

const group = { id: 'g1', name: 'Family', description: '', created: 0 }

function show(existing: typeof group | null) {
  render(
    <I18nProvider i18n={i18n}>
      <GroupDialog open onOpenChange={vi.fn()} group={existing} />
    </I18nProvider>
  )
}

describe('GroupDialog', () => {
  it('updates the group it was opened on', async () => {
    show(group)
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Kin' },
    })
    fireEvent.submit(screen.getByLabelText('Name').closest('form')!)
    await waitFor(() => expect(calls.update).toHaveBeenCalledTimes(1))
    expect(calls.update.mock.calls[0][0]).toEqual({
      id: 'g1',
      name: 'Kin',
      description: '',
    })
    expect(calls.create).not.toHaveBeenCalled()
  })

  it('creates a group with no id of its own', async () => {
    show(null)
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Band' },
    })
    fireEvent.submit(screen.getByLabelText('Name').closest('form')!)
    await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1))
    expect(calls.create.mock.calls[0][0]).toEqual({
      name: 'Band',
      description: '',
    })
  })

  it('names its fields by their labels alone', () => {
    show(null)
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('placeholder')
    expect(screen.getByLabelText('Description')).not.toHaveAttribute(
      'placeholder'
    )
  })
})
