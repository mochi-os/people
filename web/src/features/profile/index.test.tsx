// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Profile } from './index'

const idle = vi.hoisted(() => () => ({
  mutateAsync: vi.fn(),
  mutate: vi.fn(),
  isPending: false,
}))

vi.mock('@/hooks/usePerson', () => ({
  useMyIdentity: () => 'me',
  usePersonInformationQuery: () => ({
    data: {
      id: 'me',
      fingerprint: 'abcdefghi',
      name: 'Ada',
      privacy: 'public',
      profile: 'Hello',
      style: { accent: '' },
      avatar: '',
      banner: '',
      favicon: '',
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSetAccentMutation: idle,
  useSetNameMutation: idle,
  useSetPrivacyMutation: idle,
  useSetProfileMutation: idle,
  useUploadImageMutation: idle,
}))

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <Profile />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('Profile', () => {
  it('leads each Save with the Check icon', () => {
    show()
    const saves = screen.getAllByRole('button', { name: /^Save$/ })
    expect(saves.length).toBeGreaterThan(0)
    for (const save of saves) {
      expect(save.querySelector('svg.lucide-check')).not.toBeNull()
      expect(save.querySelector('svg.lucide-save')).toBeNull()
    }
  })

  it('names the profile field by its label alone', () => {
    show()
    const field = document.getElementById('profile-markdown')
    expect(field).not.toBeNull()
    expect(field).not.toHaveAttribute('placeholder')
  })
})
