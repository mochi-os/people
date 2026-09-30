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
  // The group tying the property to its siblings, as item1.EMAIL to the
  // item1.X-ABLabel that names it; empty for none.
  group: string
}

export interface AddressValue {
  street: string
  city: string
  region: string
  postcode: string
  country: string
  type: PropertyType
  params: Record<string, string[]>
  group: string
  // The two leading components of ADR, which the editor does not show.
  pobox: string
  extended: string
}

// A single-valued property as the card held it: its parameters and group, and
// its value as the form writes it back when left alone.
export interface Original {
  params: Record<string, string[]>
  group: string
  value: string
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
  // Every instance past the first of a property the form has one field for,
  // kept for the round trip: a card may hold two URLs or NOTEs, and a save
  // replaces all of them.
  extras: Property[]
  // The first instance of each property the form has one field for, by name,
  // so its parameters and group survive a save (LANGUAGE on FN, SORT-AS on
  // N, Apple's X-APPLE-OMIT-YEAR on a birthday without its year).
  originals: Record<string, Original>
}

// The properties the form shows one instance of.
const SINGLE = ['FN', 'N', 'NICKNAME', 'BDAY', 'ORG', 'TITLE', 'URL', 'NOTE']

// Split a structured vCard value on its unescaped semicolons. Besides "\;",
// the escapes this editor used to write ("\,", "\n", "\\") are undone; any
// other backslash is the text's own and stays.
function split(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let escaped = false
  for (const character of value) {
    if (escaped) {
      if (character === 'n' || character === 'N') current += '\n'
      else if (character === ';' || character === ',' || character === '\\')
        current += character
      else current += '\\' + character
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
  if (escaped) current += '\\'
  parts.push(current)
  return parts
}

// A stored value is what the server's vCard parser gives: commas, newlines and
// backslashes are plain, and only a semicolon inside a component is escaped.
// The server escapes the rest when it writes the card for a client, so doing
// it here too would reach phones as a literal "\," or "\n". Reading still
// decodes those escapes, for cards this editor wrote before.
function escape(value: string): string {
  return value.replace(/;/g, '\\;')
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

// The vCard TYPE value each choice writes. vCard has no "other": an Other
// value is written with no type of its own, and mobile is vCard's CELL.
function token(type: PropertyType): string | null {
  if (type === 'mobile') return 'cell'
  if (type === 'other') return null
  return type
}

// The TYPE values a choice owns: the tokens of the choices offered, and the
// "mobile" and "other" this editor wrote before, which a save corrects. Any
// other value (pref, voice, fax) is the property's own and is kept.
function owned(allowed: PropertyType[]): Set<string> {
  const tokens = new Set(['mobile', 'other'])
  for (const type of allowed) {
    const value = token(type)
    if (value) tokens.add(value)
  }
  return tokens
}

function typeOf(
  params: Record<string, string[]> | undefined,
  allowed: PropertyType[]
): PropertyType {
  for (const value of params?.TYPE ?? []) {
    const folded = value.toLowerCase()
    const mapped = folded === 'cell' ? 'mobile' : folded
    if ((allowed as string[]).includes(mapped)) {
      return mapped as PropertyType
    }
  }
  return 'other'
}

// The parameters with the chosen type in place of the one the property had.
// The owned value is replaced where it stood, and kept as written when it
// already says the chosen type; every other TYPE value stays.
function withType(
  params: Record<string, string[]>,
  type: PropertyType,
  allowed: PropertyType[]
): Record<string, string[]> {
  const tokens = owned(allowed)
  const chosen = token(type)
  const values: string[] = []
  let placed = false
  for (const value of params.TYPE ?? []) {
    const folded = value.toLowerCase()
    if (!tokens.has(folded)) {
      values.push(value)
      continue
    }
    if (placed || !chosen) continue
    values.push(folded === chosen ? value : chosen)
    placed = true
  }
  if (chosen && !placed) values.push(chosen)
  const rest = { ...params }
  delete rest.TYPE
  return values.length > 0 ? { ...rest, TYPE: values } : rest
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
    extras: [],
    originals: {},
  }
}

export function newTypedValue(type: PropertyType): TypedValue {
  return { value: '', type, params: {}, group: '' }
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
    group: '',
    pobox: '',
    extended: '',
  }
}

// A birthday in vCard's basic form, 19850412 as Thunderbird writes it, reads as
// the YYYY-MM-DD the date field takes. Any other form, such as one without its
// year, is kept as written.
function birthday(value: string): string {
  const basic = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  return basic ? `${basic[1]}-${basic[2]}-${basic[3]}` : value
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
    type: typeOf(property.params, EMAIL_TYPES),
    params: property.params ?? {},
    group: property.group ?? '',
  }))

  form.phones = all(card, 'TEL').map((property) => ({
    value: property.value,
    type: typeOf(property.params, PHONE_TYPES),
    params: property.params ?? {},
    group: property.group ?? '',
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
      type: typeOf(property.params, ADDRESS_TYPES),
      params: property.params ?? {},
      group: property.group ?? '',
    }
  })

  form.birthday = birthday(first(card, 'BDAY')?.value ?? '')

  const organisation = first(card, 'ORG')
  if (organisation) {
    const parts = split(organisation.value)
    form.organisation = component(parts, 0)
    form.organisationUnits = parts.slice(1)
  }

  form.title = first(card, 'TITLE')?.value ?? ''
  form.url = first(card, 'URL')?.value ?? ''
  form.note = first(card, 'NOTE')?.value ?? ''

  form.extras = SINGLE.flatMap((name) => all(card, name).slice(1))

  const written = singles(form)
  for (const name of SINGLE) {
    const property = first(card, name)
    if (!property) continue
    form.originals[name] = {
      params: property.params ?? {},
      group: property.group ?? '',
      value: written[name] ?? '',
    }
  }

  return form
}

// The value each single-valued field writes, by property name.
function singles(form: ContactForm): Record<string, string> {
  return {
    FN: form.name.trim(),
    N: join([
      form.family.trim(),
      form.given.trim(),
      form.additional,
      form.prefix,
      form.suffix,
    ]),
    NICKNAME: form.nickname.trim(),
    BDAY: form.birthday.trim(),
    ORG: join([form.organisation.trim(), ...form.organisationUnits]),
    TITLE: form.title.trim(),
    URL: form.url.trim(),
    NOTE: form.note.trim(),
  }
}

// propertiesFromForm(form) -> the full managed set, which replaces whatever the
// card held for these names. Empty fields are left out rather than sent blank.
export function propertiesFromForm(form: ContactForm): Property[] {
  const properties: Property[] = []
  const add = (
    name: string,
    value: string,
    params: Record<string, string[]> = {},
    group = ''
  ) => {
    if (value.trim() === '') return
    properties.push(
      group ? { name, params, value, group } : { name, params, value }
    )
  }

  // A single field keeps the parameters and group its property came with. A
  // changed value drops the two that described the old one: its sort key and
  // its value type, which a date typed into the field no longer is.
  const written = singles(form)
  const single = (name: string) => {
    const value = written[name]
    const original = form.originals[name]
    if (!original) {
      add(name, value)
      return
    }
    const params = { ...original.params }
    if (value !== original.value) {
      delete params['SORT-AS']
      delete params.VALUE
    }
    add(name, value, params, original.group)
  }

  single('FN')
  single('N')
  single('NICKNAME')

  for (const email of form.emails) {
    add(
      'EMAIL',
      email.value.trim(),
      withType(email.params, email.type, EMAIL_TYPES),
      email.group
    )
  }

  for (const phone of form.phones) {
    add(
      'TEL',
      phone.value.trim(),
      withType(phone.params, phone.type, PHONE_TYPES),
      phone.group
    )
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
    add(
      'ADR',
      value,
      withType(address.params, address.type, ADDRESS_TYPES),
      address.group
    )
  }

  single('BDAY')
  single('ORG')
  single('TITLE')
  single('URL')
  single('NOTE')

  properties.push(...form.extras)

  return properties
}
