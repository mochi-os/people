// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicProfile, connection } from './public'

const calls = vi.hoisted(() => ({
  information: vi.fn(),
  navigate: vi.fn(),
  invite: vi.fn(),
  accept: vi.fn(),
  // The viewer: '' for an anonymous visitor.
  identity: '',
  contacts: undefined as unknown,
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  shellNavigateExternal: (url: string) => calls.navigate(url),
}))

vi.mock('@/api/person', () => ({
  personApi: {
    getInformation: (person: string) => calls.information(person),
  },
}))
vi.mock('@/hooks/usePerson', async (original) => ({
  ...(await original<typeof import('@/hooks/usePerson')>()),
  useMyIdentity: () => calls.identity,
}))
vi.mock('@/hooks/useContacts', () => ({
  useContactsQuery: () => ({ data: calls.contacts }),
  useInviteFriendMutation: () => ({
    mutateAsync: calls.invite,
    isPending: false,
  }),
  useAcceptFriendMutation: () => ({
    mutateAsync: calls.accept,
    isPending: false,
  }),
}))

const ada = {
  id: 'p1',
  fingerprint: 'abcdefghi',
  name: 'Ada Lovelace',
  profile: '',
  style: {},
  avatar: '',
  banner: '',
  favicon: '',
}

const nobody = { contacts: [], received: [], sent: [] }

function invitation(id: string) {
  return {
    identity: 'me',
    id,
    direction: 'to' as const,
    name: 'Ada Lovelace',
    updated: 0,
  }
}

function page() {
  calls.information = vi.fn().mockResolvedValue(ada)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <PublicProfile fingerprint='abcdefghi' />
      </I18nProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  calls.invite = vi.fn().mockResolvedValue({ success: true })
  calls.accept = vi.fn().mockResolvedValue({ success: true })
  calls.identity = ''
  calls.contacts = undefined
})

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

  it("links the person's accounts elsewhere with rel=me, web and XMPP links only", async () => {
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
        {
          type: 'xmpp',
          identifier: 'ada@example.org',
          name: 'ada',
          url: 'xmpp:ada@example.org',
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
    // THE POINT: an XMPP account is linked by the address a chat client opens.
    expect(
      screen.getByRole('link', { name: 'XMPP · ada@example.org' })
    ).toHaveAttribute('href', 'xmpp:ada@example.org')
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

  it('offers a signed-in stranger an invitation, sent in one tap', async () => {
    // THE POINT: Chat sends someone it refused here, and the request is the
    // button beside the name.
    calls.identity = 'me'
    calls.contacts = nobody
    page()
    fireEvent.click(await screen.findByRole('button', { name: 'Invite' }))
    await waitFor(() =>
      expect(calls.invite).toHaveBeenCalledWith({
        person: 'p1',
        name: 'Ada Lovelace',
      })
    )
  })

  it('shows an invitation already sent as such', async () => {
    calls.identity = 'me'
    calls.contacts = { ...nobody, sent: [invitation('p1')] }
    page()
    expect(
      await screen.findByRole('button', { name: 'Invited' })
    ).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull()
  })

  it("accepts the person's own invitation", async () => {
    calls.identity = 'me'
    calls.contacts = { ...nobody, received: [invitation('p1')] }
    page()
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(calls.accept).toHaveBeenCalledWith({ person: 'p1' })
    )
  })

  it('offers nothing to an anonymous visitor', async () => {
    page()
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers nothing to a friend', async () => {
    calls.identity = 'me'
    calls.contacts = {
      ...nobody,
      contacts: [
        {
          id: 'c1',
          book: 'b1',
          person: 'p1',
          friend: true,
          name: 'Ada Lovelace',
          directory: '',
          created: 0,
          updated: 0,
        },
      ],
    }
    page()
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers nothing on the viewer’s own page', async () => {
    calls.identity = 'p1'
    calls.contacts = nobody
    page()
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('connection', () => {
  const friend = {
    id: 'c1',
    book: 'b1',
    person: 'p1',
    friend: true,
    name: 'Ada Lovelace',
    directory: '',
    created: 0,
    updated: 0,
  }

  it('reads a friend, an invitation either way, or neither', () => {
    expect(connection(undefined, 'p1')).toBeNull()
    expect(connection(nobody, 'p1')).toBe('none')
    expect(connection({ ...nobody, contacts: [friend] }, 'p1')).toBe('friend')
    expect(
      connection({ ...nobody, contacts: [{ ...friend, friend: false }] }, 'p1')
    ).toBe('none')
    expect(connection({ ...nobody, sent: [invitation('p1')] }, 'p1')).toBe(
      'invited'
    )
    expect(
      connection(
        {
          ...nobody,
          received: [{ ...invitation('p1'), fingerprint: '', directory: '' }],
        },
        'p1'
      )
    ).toBe('pending')
    expect(connection({ ...nobody, sent: [invitation('p2')] }, 'p1')).toBe(
      'none'
    )
  })
})
