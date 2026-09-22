// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import type { Property } from '@/api/types/contacts'
import { formFromCard, propertiesFromForm } from './card'

const property = (
  name: string,
  value: string,
  params: Record<string, string[]> = {}
): Property => ({ name, params, value })

describe('formFromCard', () => {
  it('splits N into its components', () => {
    const form = formFromCard([property('N', 'Doe;Jane;Q;Dr;Jr')])
    expect(form.family).toBe('Doe')
    expect(form.given).toBe('Jane')
    expect(form.additional).toBe('Q')
    expect(form.prefix).toBe('Dr')
    expect(form.suffix).toBe('Jr')
  })

  it('splits ADR into its components, skipping the two the editor hides', () => {
    const form = formFromCard([
      property('ADR', ';;12 Long Street;Tallinn;Harju;10115;Estonia'),
    ])
    expect(form.addresses[0]).toMatchObject({
      street: '12 Long Street',
      city: 'Tallinn',
      region: 'Harju',
      postcode: '10115',
      country: 'Estonia',
    })
  })

  it('keeps a semicolon that the value escaped', () => {
    const form = formFromCard([property('N', 'Doe\\; Jane;;;;')])
    expect(form.family).toBe('Doe; Jane')
  })

  it('reads the TYPE parameter and maps CELL onto mobile', () => {
    const form = formFromCard([
      property('TEL', '+372 5555 5555', { TYPE: ['CELL'] }),
      property('EMAIL', 'jane@example.com', { TYPE: ['work'] }),
    ])
    expect(form.phones[0].type).toBe('mobile')
    expect(form.emails[0].type).toBe('work')
  })

  it('falls back to other for a type the editor does not offer', () => {
    const form = formFromCard([property('TEL', '1', { TYPE: ['fax'] })])
    expect(form.phones[0].type).toBe('other')
  })
})

describe('propertiesFromForm', () => {
  it('leaves an empty field out rather than sending it blank', () => {
    const form = formFromCard([property('FN', 'Jane Doe')])
    expect(propertiesFromForm(form)).toEqual([property('FN', 'Jane Doe')])
  })

  it('escapes a semicolon in a structured component', () => {
    const form = formFromCard([])
    form.family = 'Doe; Jane'
    const written = propertiesFromForm(form).find((p) => p.name === 'N')
    expect(written?.value).toBe('Doe\\; Jane;;;;')
  })

  it('writes the type as a TYPE parameter and keeps the others', () => {
    const form = formFromCard([
      property('EMAIL', 'jane@example.com', {
        TYPE: ['home'],
        PREF: ['1'],
      }),
    ])
    form.emails[0].type = 'work'
    const written = propertiesFromForm(form).find((p) => p.name === 'EMAIL')
    expect(written?.params).toEqual({ TYPE: ['work'], PREF: ['1'] })
  })

  it('round-trips a full card', () => {
    const card: Property[] = [
      property('FN', 'Jane Doe'),
      property('N', 'Doe;Jane;;;'),
      property('NICKNAME', 'Janie'),
      property('EMAIL', 'jane@example.com', { TYPE: ['home'] }),
      property('TEL', '+372 5555 5555', { TYPE: ['mobile'] }),
      property('ADR', ';;12 Long Street;Tallinn;Harju;10115;Estonia', {
        TYPE: ['work'],
      }),
      property('BDAY', '1985-04-01'),
      property('ORG', 'Mochisoft'),
      property('TITLE', 'Engineer'),
      property('URL', 'https://example.com'),
      property('NOTE', 'Met at the conference'),
    ]
    expect(propertiesFromForm(formFromCard(card))).toEqual(card)
  })
})
