// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Profile } from './index'

// The profile as the server answers it; a test gives it accounts.
const info = vi.hoisted(() => ({ data: {} as Record<string, unknown> }))
const opened = vi.hoisted(() => [] as string[])

vi.mock('@mochi/web', async (actual) => ({
  ...(await actual<typeof import('@mochi/web')>()),
  shellNavigateExternal: (url: string) => opened.push(url),
}))

const idle = vi.hoisted(() => () => ({
  mutateAsync: vi.fn(),
  mutate: vi.fn(),
  isPending: false,
}))

vi.mock('@/hooks/usePerson', () => ({
  useMyIdentity: () => 'me',
  usePersonInformationQuery: () => ({
    data: info.data,
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

beforeEach(() => {
  opened.length = 0
  info.data = {
    id: 'me',
    fingerprint: 'abcdefghi',
    name: 'Ada',
    privacy: 'public',
    profile: 'Hello',
    style: { accent: '' },
    avatar: '',
    banner: '',
    favicon: '',
  }
})

describe('Profile', () => {
  it('lists the accounts the profile shows, and opens Settings › Networks to change them', () => {
    info.data.accounts = [
      {
        type: 'mastodon',
        identifier: '@ada@mastodon.social',
        name: 'Ada',
        url: 'https://mastodon.social/@ada',
      },
      {
        type: 'bluesky',
        identifier: 'ada.example',
        name: 'Ada',
        url: 'javascript:alert(1)',
      },
    ]
    show()
    // THE POINT: what Show on profile turns on is seen where the profile is edited.
    const link = screen.getByRole('link', {
      name: 'Mastodon · @ada@mastodon.social',
    })
    expect(link).toHaveAttribute('href', 'https://mastodon.social/@ada')
    expect(screen.queryByText(/ada\.example/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(opened).toEqual(['/settings/user/networks'])
  })

  it('has no Networks section when the profile shows no account', () => {
    show()
    expect(screen.queryByText('Networks')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
  })

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
