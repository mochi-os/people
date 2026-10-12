// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// One vCard property as the server stores it. Names are protocol tokens
// (FN, EMAIL, ...) and are exempt from the single-word naming rule.
export interface Property {
  name: string
  params: Record<string, string[]>
  value: string
  // The vCard group tying the property to its siblings (item1.EMAIL and
  // item1.X-ABLabel); absent for none.
  group?: string
}

// A contacts-list row: lean, with no card. The editor fetches the card.
export interface Contact {
  id: string
  book: string
  person: string
  friend: boolean
  name: string
  directory: string
  created: number
  updated: number
}

// A single contact with its card, as contacts/get and the write actions
// return it.
export interface ContactFull extends Contact {
  card: Property[]
  etag: string
}

// A row of the invites table; it has no class or created column.
interface Invite {
  identity: string
  id: string
  direction: 'from' | 'to'
  name: string
  updated: number
}

// A received invite also carries what the sender cannot choose for
// themselves: their fingerprint, and the directory's name for them ('' when
// the directory does not list them).
export interface Received extends Invite {
  fingerprint: string
  directory: string
}

export interface GetContactsResponse {
  contacts: Contact[]
  received: Received[]
  sent: Invite[]
}

export interface GetContactResponse {
  contact: ContactFull
  // A merge preview: the contact absorbed into this one, whose card holds
  // both cards' details.
  source?: ContactFull
}

export interface CreateContactRequest {
  properties: Property[]
  person?: string
  book?: string
  // The contact a copy is made from, whose card the copy starts from.
  source?: string
}

export interface UpdateContactRequest {
  contact: string
  etag?: string
  properties?: Property[]
  book?: string
  // The contact merged into this one and deleted, as it was previewed.
  source?: { id: string; etag?: string }
}

export interface Book {
  id: string
  fingerprint: string
  name: string
  count: number
  default: boolean
  version: number
  created: number
  updated: number
}

export interface GetBooksResponse {
  books: Book[]
}

export interface CreateBookResponse {
  book: Book
}

export interface MutationSuccessResponse {
  success: boolean
  message?: string
}

type RelationshipStatus = 'friend' | 'invited' | 'pending' | 'self' | 'none'

// A directory hit from contacts/search, annotated with the caller's
// relationship to it and the id of an existing contact, if any.
export interface DirectoryPerson {
  class: string
  created: number
  data: string
  fingerprint: string
  fingerprint_hyphens: string
  id: string
  location: string
  name: string
  updated: number
  relationship?: RelationshipStatus
  contact?: string
}

export interface SearchDirectoryResponse {
  results: DirectoryPerson[]
}

interface LocalUser {
  id: string
  name: string
}

export interface SearchLocalUsersResponse {
  results: LocalUser[]
}
