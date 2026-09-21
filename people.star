# Mochi People app: identities, profiles, groups and directory search.
# Contacts, address books and the friendship handshake are in contacts.star,
# which loads after this file and uses its helpers.
# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# decimal(value) -> bool: whether value is a non-empty ASCII decimal string.
# This is what .isdigit() was reached for, but isdigit() also accepts Unicode
# digit forms (Arabic-Indic "٣", Devanagari "३") that int() rejects,
# which aborts the action as a 500 instead of taking the guard's else branch.
def decimal(value):
    if not value:
        return False
    for c in value.elems():
        if c not in "0123456789":
            return False
    return True
def notify(topic, object="", title="", body="", url="", sender="", event_id=""):
	mochi.service.call("notifications", "send", topic, object, title, body, url, mochi.app.label("notifications.topic." + topic.replace("/", ".")), sender=sender, event=event_id)

def database_upgrade(version):
	if version == 13:
		# A friend's cached avatar: photo is "<extension>:<hash>" for the file
		# at photos/<id>.<extension>, photographed the last fetch attempt.
		if not [c for c in mochi.db.table("contacts") if c["name"] == "photo"]:
			mochi.db.execute("alter table contacts add column photo text not null default ''")
		if not [c for c in mochi.db.table("contacts") if c["name"] == "photographed"]:
			mochi.db.execute("alter table contacts add column photographed integer not null default 0")
	if version == 12:
		# The change log forgets deletions after a retention period; pruned
		# holds how far, so a cursor from before it resyncs from scratch.
		mochi.db.execute("create table if not exists pruned ( identity text not null primary key, change integer not null default 0 )")
	if version == 11:
		# The default book is the one whose slug is "default"; choosing it by
		# creation time tied within a second. The earliest book of every
		# identity without one takes the name.
		for row in mochi.db.rows("select distinct identity from books"):
			if mochi.db.exists("select id from books where identity=? and slug='default'", row["identity"]):
				continue
			first = mochi.db.row("select id from books where identity=? order by created, id limit 1", row["identity"])
			if first:
				mochi.db.execute("update books set slug='default' where id=?", first["id"])
	if version == 10:
		# CardDAV names collections and objects: slug is the name a client chose,
		# or the fingerprint (books) and id (contacts) for rows made here. The
		# change log records every contact write for incremental sync; its row
		# id is the cursor a client keeps.
		if not [c for c in mochi.db.table("books") if c["name"] == "slug"]:
			mochi.db.execute("alter table books add column slug text not null default ''")
		if not [c for c in mochi.db.table("contacts") if c["name"] == "slug"]:
			mochi.db.execute("alter table contacts add column slug text not null default ''")
		for row in mochi.db.rows("select id from books where slug=''"):
			mochi.db.execute("update books set slug=? where id=?", mochi.entity.fingerprint(row["id"]), row["id"])
		mochi.db.execute("update contacts set slug=id where slug=''")
		mochi.db.execute("create unique index if not exists books_identity_slug on books( identity, slug )")
		mochi.db.execute("create unique index if not exists contacts_book_slug on contacts( book, slug )")
		mochi.db.execute("create table if not exists changes ( id integer primary key autoincrement, identity text not null, book text not null, contact text not null, deleted integer not null default 0, created integer not null default 0 )")
		mochi.db.execute("create index if not exists changes_identity on changes( identity, id )")
	if version == 9:
		# Contacts replace friends. An address book is an entity of class book
		# with a row here; a contact holds a vCard property list, may reference a
		# Mochi person, and carries a friend flag. Each friends row becomes a
		# friend contact with an empty book: a migration cannot create an entity,
		# so the identity's first contacts request creates the default book and
		# backfills them (book_default in contacts.star).
		mochi.db.execute("create table if not exists books ( id text not null primary key, identity text not null, version integer not null default 0, created integer not null default 0, updated integer not null default 0 )")
		mochi.db.execute("create index if not exists books_identity on books( identity )")
		mochi.db.execute("create table if not exists contacts ( id text not null primary key, book text not null default '', identity text not null, person text not null default '', friend integer not null default 0, name text not null default '', directory text not null default '', card text not null default '[]', etag text not null default '', created integer not null default 0, updated integer not null default 0, refreshed integer not null default 0 )")
		mochi.db.execute("create index if not exists contacts_identity_person on contacts( identity, person )")
		mochi.db.execute("create index if not exists contacts_book on contacts( book )")
		if mochi.db.table("friends"):
			now = mochi.time.now()
			for row in mochi.db.rows("select * from friends"):  # table-ok: the legacy table this step drops
				if mochi.db.exists("select id from contacts where identity=? and person=?", row["identity"], row["id"]):
					continue
				card = [{"name": "FN", "params": {}, "value": row["name"]}]
				etag = mochi.crypto.hash.sha256(json.encode([card, row["id"], 1]))
				mochi.db.execute("insert into contacts ( id, book, identity, person, friend, name, directory, card, etag, created, updated, refreshed ) values ( ?, '', ?, ?, 1, ?, ?, ?, ?, ?, ?, ? )",
					mochi.uid(), row["identity"], row["id"], row["name"], row["name"], json.encode(card), etag, row["created"], now, row.get("refreshed", 0))
			mochi.db.execute("drop table friends")
	if version == 8:
		# When each friend's name was last reconciled with the directory. Without
		# it action_list had no way to tell a fresh name from a stale one, so it
		# re-resolved every friend on every request.
		present = False
		for column in mochi.db.table("friends"):
			if column["name"] == "refreshed":
				present = True
		if not present:
			mochi.db.execute("alter table friends add column refreshed integer not null default 0")
	if version == 5 or version == 6 or version == 7:
		# Move slot attachments from core's store to "images/<person>/<slot>",
		# aborting without advancing if the store cannot be read yet. Idempotent, so
		# it runs at every version that may have failed mid-way.
		mochi.db.execute("create table if not exists images ( person text not null, slot text not null, content_type text not null default '', size integer not null default 0, updated integer not null default 0, primary key ( person, slot ) )")
		rows = attachment_export()
		for att in rows:
			parts = att.get("object", "").split("/")
			if len(parts) != 2 or parts[1] not in ("avatar", "banner", "favicon"):
				continue
			person, slot = parts[0], parts[1]
			destination = "images/" + person + "/" + slot
			if mochi.file.exists(destination):
				continue
			old = att.get("file", "")
			if old and mochi.file.exists(old):
				mochi.file.move(old, destination)
				mochi.db.execute("insert or replace into images ( person, slot, content_type, size, updated ) values ( ?, ?, ?, ?, ? )",
					person, slot, att.get("content_type", ""), att.get("size", 0), att.get("created", 0) or mochi.time.now())
	if version == 4:
		# Indexes no query can use: each repeats a key prefix or leads with a
		# low-cardinality column.
		for index in ["friends_id", "friends_name", "invites_identity_id", "invites_direction"]:
			mochi.db.execute("drop index if exists " + index)
	if version == 3:
		# Log of invites sent, for the rate limit in action_create. Kept apart
		# from the invites table because that one is the live relationship state:
		# cancelling an invite deletes its row, so counting those would let a
		# sender reset their own budget by cancelling and re-sending.
		mochi.db.execute("create table if not exists sent ( identity text not null, created integer not null )")
		mochi.db.execute("create index if not exists sent_identity_created on sent( identity, created )")
	if version == 2:
		# Drop the broadcast tables left in the app data DB when broadcast state moved
		# to the per-app system DB - stale copies mislead diagnosis.
		for table in ["sequence", "log", "acknowledged", "received"]:
			mochi.db.execute("drop table if exists " + table)

def database_create():
	# Address books are entities of class book; the row carries the version that
	# serves as the book's change token. Contacts hold a vCard property list in
	# card (see contacts.star); person and friend are server-owned columns.
	mochi.db.execute("create table if not exists books ( id text not null primary key, identity text not null, slug text not null default '', version integer not null default 0, created integer not null default 0, updated integer not null default 0 )")
	mochi.db.execute("create index if not exists books_identity on books( identity )")
	mochi.db.execute("create unique index if not exists books_identity_slug on books( identity, slug )")
	mochi.db.execute("create table if not exists contacts ( id text not null primary key, book text not null default '', identity text not null, person text not null default '', friend integer not null default 0, name text not null default '', directory text not null default '', card text not null default '[]', etag text not null default '', slug text not null default '', photo text not null default '', photographed integer not null default 0, created integer not null default 0, updated integer not null default 0, refreshed integer not null default 0 )")
	mochi.db.execute("create index if not exists contacts_identity_person on contacts( identity, person )")
	mochi.db.execute("create index if not exists contacts_book on contacts( book )")
	mochi.db.execute("create unique index if not exists contacts_book_slug on contacts( book, slug )")
	# Every contact write, latest per contact, for -/contacts/changes.
	mochi.db.execute("create table if not exists changes ( id integer primary key autoincrement, identity text not null, book text not null, contact text not null, deleted integer not null default 0, created integer not null default 0 )")
	mochi.db.execute("create index if not exists changes_identity on changes( identity, id )")
	mochi.db.execute("create table if not exists pruned ( identity text not null primary key, change integer not null default 0 )")
	mochi.db.execute("create table if not exists invites ( identity text not null, id text not null, direction text not null, name text not null default '', updated integer not null default 0, primary key ( identity, id, direction ) )")
	mochi.db.execute("create table if not exists sent ( identity text not null, created integer not null )")
	mochi.db.execute("create index if not exists sent_identity_created on sent( identity, created )")
	mochi.db.execute("create table if not exists profiles ( person text not null primary key, profile text not null default '', accent text not null default '', updated integer not null default 0 )")

	# Per-slot image metadata (avatar/banner/favicon). The bytes live in file
	# storage at "images/<person>/<slot>"; this holds the content type and size.
	# One row per person and slot, so an upload replaces rather than accumulates.
	mochi.db.execute("create table if not exists images ( person text not null, slot text not null, content_type text not null default '', size integer not null default 0, updated integer not null default 0, primary key ( person, slot ) )")

# Find person entities matching a term: a full entity id, a fingerprint (hyphens
# optional), a profile URL carrying the id, or the display name. Results are
# deduped by id and are full directory entries.
# Most results any one search returns. mochi.directory.search takes no limit and
# core applies none, so a one-character query is `name like '%a%'` across the whole
# directory; every caller below then walks the result to annotate and sort it.
_SEARCH_RESULTS_MAXIMUM = 200

def people_search(search):
	seen = {}
	results = []

	def add(entry):
		if not entry or entry.get("class") != "person":
			return
		if len(results) >= _SEARCH_RESULTS_MAXIMUM:
			return
		id = entry.get("id")
		if not id or id in seen:
			return
		seen[id] = True
		results.append(entry)

	if mochi.text.valid(search, "entity"):
		add(mochi.directory.get(search))

	fingerprint = search.replace("-", "")
	if mochi.text.valid(fingerprint, "fingerprint"):
		for entry in mochi.directory.search("person", "", False, fingerprint=fingerprint):
			add(entry)

	# A profile URL: take the last path segment that looks like an entity id.
	if search.startswith("http://") or search.startswith("https://"):
		for part in reversed(search.rstrip("/").split("/")):
			if mochi.text.valid(part, "entity"):
				add(mochi.directory.get(part))
				break

	for entry in mochi.directory.search("person", search, False):
		add(entry)

	return results

# Search for users (for group membership)
# Supports searching by name, entity ID, fingerprint (with or without hyphens), or URL
def action_users_search(a):
	search = a.input("search", "").strip()
	if len(search) > 200:
		a.error.label(400, "errors.search_query_too_long")
		return
	if len(search) < 1:
		return {"data": {"results": []}}

	results = [{"id": entry["id"], "name": entry["name"]} for entry in people_search(search)]
	return {"data": {"results": results}}

# Service function for user search
# Supports searching by name, entity ID, fingerprint (with or without hyphens), or URL
def function_users_search(context, query):
	if not query or len(query) > 200:
		return []

	return [{"id": entry["id"], "name": entry["name"]} for entry in people_search(query.strip())]

# Service function for groups list
def function_groups_list(context):
	return mochi.group.list()

# Group management actions

def action_groups(a):
	groups = mochi.group.list()
	return {"data": {"groups": groups}}

def action_group_get(a):
	id = a.input("id")
	if not id:
		a.error.label(400, "errors.missing_group_id")
		return

	group = mochi.group.get(id)
	if not group:
		a.error.label(404, "errors.group_not_found")
		return

	members = mochi.group.members(id)

	# Enrich members with names
	enriched_members = []
	for member in members:
		name = member["member"]
		member_id = member["member"]
		if member["type"] == "user":
			# mochi.entity.name, not mochi.user.get - the latter is administrator-only
			# and raises.
			if mochi.text.valid(member_id, "entity"):
				resolved = mochi.entity.name(member_id)
				if resolved:
					name = resolved
		elif member["type"] == "group":
			g = mochi.group.get(member_id)
			if g:
				name = g["name"]
		enriched_members.append({
			"member": member_id,
			"type": member["type"],
			"name": name,
		})

	return {"data": {"group": group, "members": enriched_members}}

# uid(id) -> bool: whether id has the shape mochi.uid() produces - a UUIDv7 with
# its hyphens stripped, so 32 hex characters.
def uid(id):
	if len(id) != 32:
		return False
	for c in id.elems():
		if c not in "0123456789abcdef":
			return False
	return True

# mochi.text.valid(..., "text") admits just under 1 MB, so without this a group
# description could be four thousand times the length of the name beside it.
_GROUP_DESCRIPTION_MAXIMUM = 4096

def action_group_create(a):
	# A supplied id (imports restoring groups) must have the uid shape: core leaves
	# mochi.group.get ungated on the assumption that a group id cannot be guessed.
	id = a.input("id", "")
	if id and not uid(id):
		a.error.label(400, "errors.invalid_group_id")
		return
	# mochi.group.create writes by primary key, so an existing id would be silently
	# overwritten.
	if id and mochi.group.get(id):
		a.error.label(409, "errors.group_exists")
		return
	if not id:
		id = mochi.uid()

	name = a.input("name")
	if not name:
		a.error.label(400, "errors.missing_group_name")
		return
	if not mochi.text.valid(name, "line"):
		a.error.label(400, "errors.invalid_group_name")
		return
	if len(name) > 255:
		a.error.label(400, "errors.group_name_too_long")
		return

	description = a.input("description", "")
	if description and not mochi.text.valid(description, "text"):
		a.error.label(400, "errors.invalid_description")
		return
	if len(description) > _GROUP_DESCRIPTION_MAXIMUM:
		a.error.label(400, "errors.group_description_too_long")
		return

	mochi.group.create(id, name, description)
	return {"data": {"id": id}}

def action_group_update(a):
	id = a.input("id")
	if not id:
		a.error.label(400, "errors.missing_group_id")
		return

	group = mochi.group.get(id)
	if not group:
		a.error.label(404, "errors.group_not_found")
		return

	# a.input() reads JSON (where "" survives) but over a form reads sent-empty as
	# None; a.inputs() tells [""] from [] but ignores JSON. Checking both covers
	# either encoding.
	def sent(field):
		return len(a.inputs(field)) > 0 or a.input(field) != None

	sent_name = sent("name")
	sent_description = sent("description")

	if not sent_name and not sent_description:
		a.error.label(400, "errors.no_fields_to_update")
		return

	name = a.input("name", "")
	description = a.input("description", "")

	if sent_name:
		if not name:
			a.error.label(400, "errors.missing_group_name")
			return
		if not mochi.text.valid(name, "line"):
			a.error.label(400, "errors.invalid_group_name")
			return
		if len(name) > 255:
			a.error.label(400, "errors.group_name_too_long")
			return

	if description and not mochi.text.valid(description, "text"):
		a.error.label(400, "errors.invalid_description")
		return
	if len(description) > _GROUP_DESCRIPTION_MAXIMUM:
		a.error.label(400, "errors.group_description_too_long")
		return

	kwargs = {}
	if sent_name:
		kwargs["name"] = name
	if sent_description:
		kwargs["description"] = description
	mochi.group.update(id, **kwargs)
	return {"data": {}}

def action_group_delete(a):
	id = a.input("id")
	if not id:
		a.error.label(400, "errors.missing_group_id")
		return

	group = mochi.group.get(id)
	if not group:
		a.error.label(404, "errors.group_not_found")
		return

	mochi.group.delete(id)
	return {"data": {}}

# Whether an entity id belongs to a person, wherever that person lives. Local
# first, because a person whose profile is private is deliberately absent from
# the directory; then the directory, which is what -/users/search offers and so
# covers people hosted on other servers.
def person_exists(id):
	local = mochi.entity.info(id)
	if local:
		return local.get("class") == "person"
	entry = mochi.directory.get(id)
	return entry != None and entry.get("class") == "person"

def action_group_member_add(a):
	group = a.input("group")
	if not group:
		a.error.label(400, "errors.missing_group_id")
		return

	g = mochi.group.get(group)
	if not g:
		a.error.label(404, "errors.group_not_found")
		return

	member = a.input("member", "").strip()
	if not member or len(member) > 256:
		a.error.label(400, "errors.invalid_member_id")
		return

	type = a.input("type", "user")
	if type not in ["user", "group"]:
		a.error.label(400, "errors.invalid_member_type")
		return

	# Group "user" members are person entity ids, as -/users/search returns.
	if type == "user":
		if not mochi.text.valid(member, "entity"):
			a.error.label(400, "errors.invalid_user_id")
			return
		# Must be a PERSON, not merely something with a name. Any entity has a
		# name - a project, a wiki, a forum - so an existence check alone let a
		# container be stored as a user member and rendered as one.
		if not person_exists(member):
			a.error.label(404, "errors.person_not_found")
			return
	elif not mochi.group.get(member):
		# Nested groups are the caller's own, so an unknown one is a mistake
		# rather than a remote lookup that might legitimately miss.
		a.error.label(404, "errors.group_not_found")
		return

	if not mochi.group.add(group, member, type):
		a.error.label(400, "errors.group_cycle")
		return
	return {"data": {}}

def action_group_member_remove(a):
	group = a.input("group")
	if not group:
		a.error.label(400, "errors.missing_group_id")
		return

	g = mochi.group.get(group)
	if not g:
		a.error.label(404, "errors.group_not_found")
		return

	member = a.input("member")
	if not member:
		a.error.label(400, "errors.missing_member_id")
		return

	mochi.group.remove(group, member)
	return {"data": {}}

# Preferences: incoming friend invite policy
_VALID_INVITE_POLICIES = ("silent", "notify", "reject", "accept")

def action_preferences_get(a):
	return {"data": {"policy": a.user.preference.get("invite_policy") or "notify"}}

def action_preferences_set(a):
	policy = a.input("policy", "").strip()
	if policy not in _VALID_INVITE_POLICIES:
		a.error.label(400, "errors.invalid_invite_policy")
		return
	a.user.preference.set("invite_policy", policy)
	return {"data": {}}

# Welcome banner on the friends list, shown until dismissed. Read only by the
# Android client.
def action_welcome(a):
	return {"data": {"seen": a.user.preference.get("people_welcome_seen") == "true"}}

def action_welcome_seen(a):
	a.user.preference.set("people_welcome_seen", "true")
	return {"data": {}}

# ---------------------------------------------------------------------------
# Person profiles: avatar / banner / favicon / markdown / style. Served as
# public :person/-/* actions and matching P2P events; other apps read them with
# mochi.remote.request(person, "people", "<event>", {}).

_AVATAR_MAX = 2 * 1024 * 1024
_BANNER_MAX = 10 * 1024 * 1024
_FAVICON_MAX = 64 * 1024
_PROFILE_MAX = 100 * 1024

_IMAGE_SLOTS = ("avatar", "banner", "favicon")
_SLOT_CAPS = {"avatar": _AVATAR_MAX, "banner": _BANNER_MAX, "favicon": _FAVICON_MAX}

# Image types a profile slot may hold. An explicit list rather than an
# "image/" prefix test, because the prefix admits any subtype a client cares to
# invent and the browser decides what to do with the ones it recognises. SVG is
# allowed: core sanitizes it and serves it under a script-blocking CSP.
_IMAGE_TYPES = (
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/avif",
	"image/svg+xml",
	"image/x-icon",
	"image/vnd.microsoft.icon",
)

def is_person_owner(a, person):
	# a.owner answers for the routed entity, and core seeds the person input from
	# the same route (restoring it over any body value), so the two always name
	# one entity; the comparison keeps that a property of this handler rather
	# than of core. The class check stays because the route resolves any entity
	# by id.
	if not a.user or not a.user.identity:
		return False
	if a.entity == None or a.entity["class"] != "person":
		return False
	if person != a.entity["id"]:
		return False
	return a.owner

def slot_path(person_id, slot):
	return "images/" + person_id + "/" + slot

# slot_attachment returns a person's slot image as {id, content_type, size}, or
# None. `id` is the update timestamp - a non-empty presence-and-cache-bust
# marker, since the image URL is built from the person id, not this value.
def slot_attachment(person_id, slot):
	row = mochi.db.row("select content_type, size, updated from images where person=? and slot=?", person_id, slot)
	if not row:
		return None
	return {"id": str(row["updated"]), "content_type": row.get("content_type", ""), "size": row.get("size", 0)}

def get_profile_row(person_id):
	row = mochi.db.row("select * from profiles where person=?", person_id)
	if row:
		return row
	return {"profile": "", "accent": ""}

def upsert_profile(person_id, profile=None, accent=None):
	existing = mochi.db.row("select profile, accent from profiles where person=?", person_id) or {}
	new_profile = profile if profile != None else existing.get("profile", "")
	new_accent = accent if accent != None else existing.get("accent", "")
	mochi.db.execute("insert into profiles ( person, profile, accent, updated ) values ( ?, ?, ?, ? ) on conflict ( person ) do update set profile=excluded.profile, accent=excluded.accent, updated=excluded.updated", person_id, new_profile, new_accent, mochi.time.now())

# What every reader of a person - local, remote peer, proxying app - is allowed
# to see. privacy is deliberately absent: it is the owner's own setting, and this
# dict is written straight to an anonymous P2P event, so emitting it here made
# every consumer responsible for stripping it and two of them forgot. The owner's
# own view adds it back from the local entity in action_information.
def build_information(person_id, entity):
	profile = get_profile_row(person_id)
	# Not an .get() default: Starlark evaluates arguments before the call, so the
	# fingerprint would be computed on every read and discarded whenever the
	# entity already carries one.
	fingerprint = entity.get("fingerprint")
	if not fingerprint:
		fingerprint = mochi.entity.fingerprint(person_id)
	style = {}
	if profile.get("accent"):
		style["accent"] = profile["accent"]
	out = {
		"id": entity["id"],
		"fingerprint": fingerprint,
		"name": entity.get("name", ""),
		"profile": profile.get("profile", ""),
		"style": style,
		"avatar": "",
		"banner": "",
		"favicon": "",
	}
	for slot in _IMAGE_SLOTS:
		att = slot_attachment(person_id, slot)
		if att:
			out[slot] = att.get("id", "")
	return out

def get_person_entity(person_id):
	if not person_id:
		return None
	entity = mochi.entity.info(person_id)
	if not entity or entity.get("class") != "person":
		return None
	return entity

# Hex colour: #RGB or #RRGGBB
def valid_hex_colour(s):
	if not s.startswith("#"):
		return False
	rest = s[1:]
	if len(rest) != 3 and len(rest) != 6:
		return False
	for c in rest.elems():
		if c not in "0123456789abcdefABCDEF":
			return False
	return True

# === HTTP actions ===

# Stream a person asset from its owning peer.
# Location-transparent: mochi.remote.stream() loops back in-process when the
# entity lives on this server, or goes over P2P otherwise. Handles both binary
# assets (avatar/banner/favicon) and JSON assets (information/style).
def stream_person_asset(a, person_id, asset):
	if not person_id:
		a.error.label(404, "errors.person_not_found")
		return None
	# mochi.remote.stream aborts the action with a 500 on a malformed id; both
	# forms are valid.
	if not mochi.text.valid(person_id, "entity") and not mochi.text.valid(person_id, "fingerprint"):
		a.error.label(404, "errors.person_not_found")
		return None
	s = mochi.remote.stream(person_id, "people", asset, {})
	if not s:
		a.error.label(502, "errors.person_unavailable")
		return None
	header = s.read()
	if not header or header.get("status") != "200":
		# The status is the far end's claim: int() aborts on a non-decimal and a value
		# outside 100-999 panics net/http, so only a decimal 4xx or 5xx is adopted - a
		# non-200 reply claiming 2xx or 3xx is malformed.
		code = 404
		remote = header.get("status") if header else None
		if type(remote) == "string" and decimal(remote):
			status = int(remote)
			if status >= 400 and status <= 599:
				code = status
		# Worded from the asset we asked for: the remote error field is the far end's
		# diagnostic, and resolving it as a label key let another server pick our
		# strings.
		if asset in _IMAGE_SLOTS:
			a.error.label(code, "errors.asset_not_set", asset=asset)
		else:
			a.error.label(code, "errors.person_not_found")
		return None
	if "data" in header:
		return {"data": header["data"]}
	# Only the image slots stream bytes; information and style answer with data in
	# the header and returned above. Anything else asking to be streamed is not a
	# slot we have a size for, so there is nothing to bound it with.
	cap = _SLOT_CAPS.get(asset)
	if cap == None:
		a.error.label(404, "errors.person_not_found")
		return None
	# Check the declared size before streaming: once a.write.stream starts, the 200
	# and headers are sent and cannot be retracted. The maximum below still stops
	# an under-declaring peer.
	declared = header.get("size", 0)
	if type(declared) in ("int", "float") and declared > cap:
		a.error.label(502, "errors.asset_too_large", slot=asset)
		return None
	a.header("Cache-Control", "private, max-age=300")
	# The content type is the remote host's claim; anything not an image is served
	# as an opaque download.
	content_type = header.get("content_type", "")
	if content_type not in _IMAGE_TYPES:
		content_type = "application/octet-stream"
	a.header("Content-Type", content_type)
	# The slot's own cap, not core's 1GB backstop: this is a profile image, and the
	# size we accept on upload is the size we should relay. A peer that ignores it
	# gets cut off mid-transfer rather than being allowed to stream indefinitely
	# through a route any anonymous caller can trigger.
	a.write.stream(s, maximum=cap)
	return None

def action_information(a):
	person = a.input("person")
	out = stream_person_asset(a, person, "information")
	# privacy never crosses the wire (see build_information), so the owner's own
	# view reads it from the local entity instead. Rebuilt rather than assigned
	# into: a decoded response dict may be frozen.
	if out and "data" in out and is_person_owner(a, person):
		entity = get_person_entity(person) or {}
		data = {key: value for key, value in out["data"].items()}
		data["privacy"] = entity.get("privacy", "")
		return {"data": data}
	return out

def action_avatar(a):
	return stream_person_asset(a, a.input("person"), "avatar")

def action_banner(a):
	return stream_person_asset(a, a.input("person"), "banner")

def action_favicon(a):
	return stream_person_asset(a, a.input("person"), "favicon")

def set_image(a, slot):
	person_id = a.input("person")
	if not get_person_entity(person_id):
		a.error.label(404, "errors.person_not_found")
		return
	if not is_person_owner(a, person_id):
		a.error.label(403, "errors.not_the_owner")
		return
	# Check size and type from a.file() before anything is written; it carries the
	# same Content-Type the attachment would.
	file = a.file("file")
	if not file:
		a.error.label(400, "errors.no_file_uploaded")
		return
	if file.get("size", 0) > _SLOT_CAPS[slot]:
		a.error.label(400, "errors.asset_too_large", slot=slot)
		return
	if file.get("content_type", "") not in _IMAGE_TYPES:
		a.error.label(400, "errors.asset_must_be_image", slot=slot)
		return
	# One image per slot: stream the bytes to file storage at a fixed per-slot
	# path (so an upload overwrites the previous one, no accumulation) and upsert
	# its metadata. No attachment machinery - a slot holds exactly one file.
	size = a.upload("file", slot_path(person_id, slot))
	if not size:
		a.error.label(400, "errors.no_file_uploaded")
		return
	now = mochi.time.now()
	mochi.db.execute("insert or replace into images ( person, slot, content_type, size, updated ) values ( ?, ?, ?, ?, ? )",
		person_id, slot, file.get("content_type", ""), size, now)
	return {"data": {"id": str(now)}}

def action_avatar_set(a):
	return set_image(a, "avatar")

def action_banner_set(a):
	return set_image(a, "banner")

def action_favicon_set(a):
	return set_image(a, "favicon")

def action_style(a):
	return stream_person_asset(a, a.input("person"), "style")

def action_style_set(a):
	person_id = a.input("person")
	if not get_person_entity(person_id):
		a.error.label(404, "errors.person_not_found")
		return
	if not is_person_owner(a, person_id):
		a.error.label(403, "errors.not_the_owner")
		return
	accent = a.input("accent", "").strip()
	if accent and not valid_hex_colour(accent):
		a.error.label(400, "errors.invalid_accent_colour")
		return
	upsert_profile(person_id, accent=accent)
	return {"data": {}}

def action_profile_set(a):
	person_id = a.input("person")
	if not get_person_entity(person_id):
		a.error.label(404, "errors.person_not_found")
		return
	if not is_person_owner(a, person_id):
		a.error.label(403, "errors.not_the_owner")
		return
	profile = a.input("profile", "")
	if len(profile) > _PROFILE_MAX:
		a.error.label(400, "errors.profile_too_long")
		return
	if profile and not mochi.text.valid(profile, "text"):
		a.error.label(400, "errors.invalid_profile")
		return
	upsert_profile(person_id, profile=profile)
	return {"data": {}}

def action_name_set(a):
	person_id = a.input("person")
	if not get_person_entity(person_id):
		a.error.label(404, "errors.person_not_found")
		return
	if not is_person_owner(a, person_id):
		a.error.label(403, "errors.not_the_owner")
		return
	name = a.input("name", "").strip()
	if not name:
		a.error.label(400, "errors.name_cannot_be_empty")
		return
	if not mochi.text.valid(name, "name"):
		a.error.label(400, "errors.invalid_name")
		return
	mochi.entity.update(person_id, name=name)
	return {"data": {}}

def action_privacy_set(a):
	person_id = a.input("person")
	if not get_person_entity(person_id):
		a.error.label(404, "errors.person_not_found")
		return
	if not is_person_owner(a, person_id):
		a.error.label(403, "errors.not_the_owner")
		return
	privacy = a.input("privacy", "")
	if privacy != "public" and privacy != "private":
		a.error.label(400, "errors.invalid_privacy")
		return
	mochi.entity.update(person_id, privacy=privacy)
	return {"data": {}}

# === Open Graph (rendered profile page) ===

def opengraph_person(params):
	person_id = params.get("entity", "") or params.get("person", "")
	og = {
		"title": mochi.app.label("opengraph.fallback.title"),
		"description": mochi.app.label("opengraph.fallback.description"),
		"type": "profile",
	}
	entity = get_person_entity(person_id)
	if not entity:
		return og
	# privacy is the right gate here, and this is the one site in the app where
	# that is true. OpenGraph meta tags ARE the indexing surface, which is
	# exactly what privacy controls - whether the entity is published to be
	# found. It is NOT an access gate: the profile itself stays readable, and
	# every other reader below is gated on ownership or on nothing at all.
	# Person entities have no mochi.access grant model, so do not "convert"
	# this to check_event_access the way feeds, forums and wikis were: with no
	# creation-time "*" view grant, that check is False for every profile and
	# every public link preview loses its name and bio. Matches opengraph_feed.
	if entity.get("privacy", "public") == "private":
		return og
	og["title"] = entity.get("name") or mochi.app.label("opengraph.fallback.title")
	profile = get_profile_row(person_id)
	if profile.get("profile"):
		# Flatten whitespace so multi-line markdown doesn't break meta attributes
		excerpt = " ".join(profile["profile"].split()).strip()
		if len(excerpt) > 200:
			excerpt = excerpt[:197] + "..."
		og["description"] = excerpt
	if slot_attachment(person_id, "avatar"):
		og["image"] = "-/avatar"
	return og

# === P2P events (cross-server reads) === The `error` field is a diagnostic for
# the requesting server, never shown to a user: the bridge words its own
# message. Keep these stable and English.

def event_information(e):
	person_id = e.header("to")
	entity = get_person_entity(person_id)
	if not entity:
		e.stream.write({"status": "404", "error": "Person not found"})
		return
	e.stream.write({"status": "200", "data": build_information(person_id, entity)})

def serve_image_event(e, slot, fallback_slot=""):
	person_id = e.header("to")
	if not get_person_entity(person_id):
		e.stream.write({"status": "404", "error": "Person not found"})
		return
	resolved = slot
	att = slot_attachment(person_id, slot)
	if not att and fallback_slot:
		att = slot_attachment(person_id, fallback_slot)
		resolved = fallback_slot
	if not att:
		e.stream.write({"status": "404", "error": slot + " not set"})
		return
	e.stream.write({"status": "200", "content_type": att.get("content_type", "application/octet-stream"), "size": att.get("size", 0)})
	e.write.file(slot_path(person_id, resolved))

def event_avatar(e):
	serve_image_event(e, "avatar")

def event_banner(e):
	serve_image_event(e, "banner")

def event_favicon(e):
	serve_image_event(e, "favicon", "avatar")

def event_style(e):
	person_id = e.header("to")
	if not get_person_entity(person_id):
		e.stream.write({"status": "404", "error": "Person not found"})
		return
	profile = get_profile_row(person_id)
	style = {}
	if profile.get("accent"):
		style["accent"] = profile["accent"]
	e.stream.write({"status": "200", "data": style})
