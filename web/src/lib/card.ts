// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { Property } from '@/api/types/contacts'

// The vCard property names the editor owns. Submitting them replaces every one
// of them on the server, so the editor always sends the full set it shows;
// every other property on the card survives untouched.
export type PropertyType = 'home' | 'work' | 'mobile' | 'other'

export const EMAIL_TYPES: PropertyType[] = ['home', 'work', 'other']
export const PHONE_TYPES: PropertyType[] = ['mobile', 'home', 'work', 'other']
export const ADDRESS_TYPES: PropertyType[] = ['home', 'work', 'other']

export interface TypedValue {
  value: string
  type: PropertyType
  // Whatever else the property carried (PREF and friends), kept so a round
  // trip through the editor does not drop it.
  params: Record<string, string[]>
}

export interface AddressValue {
  street: string
  city: string
  region: string
  postcode: string
  country: string
  type: PropertyType
  params: Record<string, string[]>
  // The two leading components of ADR, which the editor does not show.
  pobox: string
  extended: string
}

export interface ContactForm {
  name: string
  given: string
  family: string
  nickname: string
  emails: TypedValue[]
  phones: TypedValue[]
  addresses: AddressValue[]
  birthday: string
  organisation: string
  title: string
  url: string
  note: string
  // The N components the editor does not show, kept for the round trip.
  additional: string
  prefix: string
  suffix: string
  // The ORG components past the first, kept for the round trip.
  organisationUnits: string[]
}

// Split a structured vCard value on its unescaped semicolons.
function split(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let escaped = false
  for (const character of value) {
    if (escaped) {
      current += character === 'n' || character === 'N' ? '\n' : character
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === ';') {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)
  return parts
}

function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// Join structured components, keeping every one of them so N always carries
// its five fields and ADR its seven, as vCard specifies. A property whose
// components are all empty is not written at all.
function join(parts: string[]): string {
  if (parts.every((part) => part === '')) return ''
  return parts.map(escape).join(';')
}

function component(parts: string[], index: number): string {
  return parts[index] ?? ''
}

function first(card: Property[], name: string): Property | undefined {
  return card.find((property) => property.name === name)
}

function all(card: Property[], name: string): Property[] {
  return card.filter((property) => property.name === name)
}

function typeOf(property: Property, allowed: PropertyType[]): PropertyType {
  const values = property.params?.TYPE ?? []
  for (const value of values) {
    const folded = value.toLowerCase()
    // Clients that predate this editor label mobile numbers CELL.
    const mapped = folded === 'cell' ? 'mobile' : folded
    if ((allowed as string[]).includes(mapped)) {
      return mapped as PropertyType
    }
  }
  return 'other'
}

function withType(
  params: Record<string, string[]>,
  type: PropertyType
): Record<string, string[]> {
  return { ...params, TYPE: [type] }
}

export function emptyForm(): ContactForm {
  return {
    name: '',
    given: '',
    family: '',
    nickname: '',
    emails: [],
    phones: [],
    addresses: [],
    birthday: '',
    organisation: '',
    title: '',
    url: '',
    note: '',
    additional: '',
    prefix: '',
    suffix: '',
    organisationUnits: [],
  }
}

export function newTypedValue(type: PropertyType): TypedValue {
  return { value: '', type, params: {} }
}

export function newAddress(type: PropertyType): AddressValue {
  return {
    street: '',
    city: '',
    region: '',
    postcode: '',
    country: '',
    type,
    params: {},
    pobox: '',
    extended: '',
  }
}

// formFromCard(card) -> the editor's view of the managed properties.
export function formFromCard(card: Property[]): ContactForm {
  const form = emptyForm()

  form.name = first(card, 'FN')?.value ?? ''

  const name = first(card, 'N')
  if (name) {
    const parts = split(name.value)
    form.family = component(parts, 0)
    form.given = component(parts, 1)
    form.additional = component(parts, 2)
    form.prefix = component(parts, 3)
    form.suffix = component(parts, 4)
  }

  form.nickname = first(card, 'NICKNAME')?.value ?? ''

  form.emails = all(card, 'EMAIL').map((property) => ({
    value: property.value,
    type: typeOf(property, EMAIL_TYPES),
    params: property.params ?? {},
  }))

  form.phones = all(card, 'TEL').map((property) => ({
    value: property.value,
    type: typeOf(property, PHONE_TYPES),
    params: property.params ?? {},
  }))

  form.addresses = all(card, 'ADR').map((property) => {
    const parts = split(property.value)
    return {
      pobox: component(parts, 0),
      extended: component(parts, 1),
      street: component(parts, 2),
      city: component(parts, 3),
      region: component(parts, 4),
      postcode: component(parts, 5),
      country: component(parts, 6),
      type: typeOf(property, ADDRESS_TYPES),
      params: property.params ?? {},
    }
  })

  form.birthday = first(card, 'BDAY')?.value ?? ''

  const organisation = first(card, 'ORG')
  if (organisation) {
    const parts = split(organisation.value)
    form.organisation = component(parts, 0)
    form.organisationUnits = parts.slice(1)
  }

  form.title = first(card, 'TITLE')?.value ?? ''
  form.url = first(card, 'URL')?.value ?? ''
  form.note = first(card, 'NOTE')?.value ?? ''

  return form
}

// propertiesFromForm(form) -> the full managed set, which replaces whatever the
// card held for these names. Empty fields are left out rather than sent blank.
export function propertiesFromForm(form: ContactForm): Property[] {
  const properties: Property[] = []
  const add = (
    name: string,
    value: string,
    params: Record<string, string[]> = {}
  ) => {
    if (value.trim() === '') return
    properties.push({ name, params, value })
  }

  add('FN', form.name.trim())

  const name = join([
    form.family.trim(),
    form.given.trim(),
    form.additional,
    form.prefix,
    form.suffix,
  ])
  add('N', name)

  add('NICKNAME', form.nickname.trim())

  for (const email of form.emails) {
    add('EMAIL', email.value.trim(), withType(email.params, email.type))
  }

  for (const phone of form.phones) {
    add('TEL', phone.value.trim(), withType(phone.params, phone.type))
  }

  for (const address of form.addresses) {
    const value = join([
      address.pobox,
      address.extended,
      address.street.trim(),
      address.city.trim(),
      address.region.trim(),
      address.postcode.trim(),
      address.country.trim(),
    ])
    add('ADR', value, withType(address.params, address.type))
  }

  add('BDAY', form.birthday.trim())
  add('ORG', join([form.organisation.trim(), ...form.organisationUnits]))
  add('TITLE', form.title.trim())
  add('URL', form.url.trim())
  add('NOTE', form.note.trim())

  return properties
}
