// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InviteSettingsDialog } from './invite-settings-dialog'

vi.mock('@/hooks/useContacts', () => ({
  usePreferencesQuery: () => ({
    data: { policy: 'notify' },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useSetPreferencesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function dialog(open: boolean) {
  return (
    <I18nProvider i18n={i18n}>
      <InviteSettingsDialog open={open} onOpenChange={vi.fn()} />
    </I18nProvider>
  )
}

describe('InviteSettingsDialog', () => {
  it('reopens on the saved policy, not a choice left by Cancel', () => {
    const { rerender } = render(dialog(true))
    fireEvent.click(screen.getByRole('radio', { name: 'Reject all' }))
    expect(screen.getByRole('radio', { name: 'Reject all' })).toBeChecked()
    rerender(dialog(false))
    rerender(dialog(true))
    expect(screen.getByRole('radio', { name: 'Notify me' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Reject all' })).not.toBeChecked()
  })

  it('labels each choice once, with no label inside another', () => {
    render(dialog(true))
    const labels = document.querySelectorAll('label')
    expect(labels).toHaveLength(4)
    for (const label of labels) expect(label.querySelector('label')).toBeNull()
    expect(
      screen.getByRole('radio', { name: 'Accept automatically' })
    ).toBeInTheDocument()
  })
})
