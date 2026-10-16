// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PublicProfile } from './public'

const calls = vi.hoisted(() => ({ information: vi.fn(), navigate: vi.fn() }))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  shellNavigateExternal: (url: string) => calls.navigate(url),
}))

vi.mock('@/api/person', () => ({
  personApi: {
    getInformation: (person: string) => calls.information(person),
  },
}))

describe('PublicProfile', () => {
  it("reads the person's information through the shared call and cache", async () => {
    calls.information = vi.fn().mockResolvedValue({
      id: 'p1',
      fingerprint: 'abcdefghi',
      name: 'Ada Lovelace',
      profile: '',
      style: {},
      avatar: '',
      banner: '',
      favicon: '',
    })
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <PublicProfile fingerprint='abcdefghi' />
        </I18nProvider>
      </QueryClientProvider>
    )
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(calls.information).toHaveBeenCalledWith('abcdefghi')
    expect(
      client.getQueryData(['person', 'information', 'abcdefghi'])
    ).toMatchObject({ name: 'Ada Lovelace' })
  })

  it("links the person's accounts elsewhere with rel=me, web links only", async () => {
    calls.information = vi.fn().mockResolvedValue({
      id: 'p1',
      fingerprint: 'abcdefghi',
      name: 'Ada Lovelace',
      profile: '',
      style: {},
      avatar: '',
      banner: '',
      favicon: '',
      accounts: [
        {
          type: 'mastodon',
          identifier: '@ada@mastodon.social',
          name: 'Ada',
          url: 'https://mastodon.social/@ada',
        },
        {
          type: 'bluesky',
          identifier: 'ada.bsky.social',
          name: 'Ada',
          url: 'javascript:alert(1)',
        },
      ],
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <PublicProfile fingerprint='abcdefghi' />
        </I18nProvider>
      </QueryClientProvider>
    )
    const link = await screen.findByRole('link', {
      name: 'Mastodon · @ada@mastodon.social',
    })
    expect(link).toHaveAttribute('href', 'https://mastodon.social/@ada')
    expect(link.getAttribute('rel')).toContain('me')
    expect(screen.queryByText(/ada\.bsky\.social/)).toBeNull()
  })

  it("lists the person's newest forum posts and comments, each opening in forums", async () => {
    calls.information = vi.fn().mockResolvedValue({
      id: 'p1',
      fingerprint: 'abcdefghi',
      name: 'Ada Lovelace',
      profile: '',
      style: {},
      avatar: '',
      banner: '',
      favicon: '',
      history: [
        {
          kind: 'comment',
          id: 'c1',
          post: 'p9',
          forum: 'f1',
          forum_name: 'Engines',
          fingerprint: 'fffffffff',
          title: 'On the analytical engine',
          body: 'It weaves algebraic patterns',
          created: 1_700_000_100,
          up: 0,
          down: 0,
        },
        {
          kind: 'post',
          id: 'p8',
          post: 'p8',
          forum: 'f1',
          forum_name: 'Engines',
          fingerprint: 'fffffffff',
          title: 'Notes on Menabrea',
          created: 1_700_000_000,
          up: 2,
          down: 0,
          comments: 1,
        },
      ],
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <PublicProfile fingerprint='abcdefghi' />
        </I18nProvider>
      </QueryClientProvider>
    )
    expect(await screen.findByText('Notes on Menabrea')).toBeInTheDocument()
    expect(screen.getByText('It weaves algebraic patterns')).toBeInTheDocument()
    const comment = screen.getByText('On the analytical engine').closest('a')
    expect(comment).toHaveAttribute('href', '/forums/fffffffff/p9')
    fireEvent.click(comment!)
    expect(calls.navigate).toHaveBeenCalledWith('/forums/fffffffff/p9')
  })

  it('shows no forums section for a person with no history', async () => {
    calls.information = vi.fn().mockResolvedValue({
      id: 'p1',
      fingerprint: 'abcdefghi',
      name: 'Ada Lovelace',
      profile: '',
      style: {},
      avatar: '',
      banner: '',
      favicon: '',
      history: [],
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <PublicProfile fingerprint='abcdefghi' />
        </I18nProvider>
      </QueryClientProvider>
    )
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByTestId('profile-history')).toBeNull()
  })
})
