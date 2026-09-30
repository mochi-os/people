// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PublicProfile } from './public'

const calls = vi.hoisted(() => ({ information: vi.fn() }))

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
})
