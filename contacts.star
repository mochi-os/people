# Mochi People app: contacts, address books and friendship
# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# Loaded after people.star: notify, people_search and person_exists come from
# there. A contact is an address-book entry whose data is a lossless vCard
# property list; a contact may reference a Mochi person, and a boolean says
# whether that person is a friend. The friendship handshake keeps its name and
# its P2P events; only the container is called contacts.

# How long a friend's cached directory name is trusted before the list
# re-resolves it into the directory column. The user's own label for the
# contact is never overwritten.
_FRIEND_NAME_INTERVAL = 86400

# How many invites one identity may send per window. A person adding everyone
# they know in one sitting stays well under this; a script spraying strangers or
# walking entity ids to see which are real does not.
_INVITE_LIMIT = 30
_INVITE_WINDOW = 3600

# Pending invites received per identity. A stranger can mint a sender per
# message, so without a ceiling the table grows at core's stream rate for as
# long as a hostile peer cares to send. An invite never creates a contact until
# it is accepted, which is what keeps this cap meaningful.
_INVITE_PENDING_MAXIMUM = 200

# Bounds on a card. No photos in this release, so a card is text.
_CARD_MAXIMUM = 262144
_PROPERTIES_MAXIMUM = 200
_VALUE_MAXIMUM = 8192
_PARAMETER_MAXIMUM = 64

# Properties the editor manages. A submission replaces all of these and leaves
# every other property in the card untouched, so whatever a phone stores
# survives an edit made here.
_MANAGED = ["FN", "N", "NICKNAME", "EMAIL", "TEL", "ADR", "BDAY", "ORG", "TITLE", "URL", "NOTE"]

# Properties the server owns. Never accepted from a client; regenerated on read.
_RESERVED = ["UID", "X-MOCHI-PERSON", "X-MOCHI-FRIEND"]

# === Invites ===

def invites_recent(identity):
	# Prunes as it counts, so the log stays proportional to the window rather
	# than growing for the life of the account.
	mochi.db.execute("delete from sent where created < ?", mochi.time.now() - _INVITE_WINDOW)
	row = mochi.db.row("select count(*) as sent from sent where identity=?", identity)
	return row["sent"] if row else 0

def invites_pending(identity):
	row = mochi.db.row("select count(*) as pending from invites where identity=? and direction='from'", identity)
	return row["pending"] if row else 0

def invite_set(identity, id, direction, name):
	mochi.db.execute("insert into invites ( identity, id, direction, name, updated ) values ( ?, ?, ?, ?, ? ) on conflict ( identity, id, direction ) do update set name=excluded.name, updated=excluded.updated", identity, id, direction, name, mochi.time.now())

def invite_remove(identity, id, direction=None):
	# Remove the invite(s) between identity and id. direction=None removes both.
	if direction:
		mochi.db.execute("delete from invites where identity=? and id=? and direction=?", identity, id, direction)
		return
	mochi.db.execute("delete from invites where identity=? and id=?", identity, id)

def invites_received(identity):
	return mochi.db.rows("select * from invites where identity=? and direction='from' order by updated desc", identity)

def invites_sent(identity):
	return mochi.db.rows("select * from invites where identity=? and direction='to' order by updated desc", identity)

# === Address books ===

def book_touch(book):
	mochi.db.execute("update books set version=version+1, updated=? where id=?", mochi.time.now(), book)

def book_get(identity, id):
	if not id or not mochi.text.valid(id, "entity"):
		return None
	return mochi.db.row("select * from books where identity=? and id=?", identity, id)

# The identity's default book: the earliest created. Created on first use
# together with its entity, which is why the migration leaves migrated
# contacts with an empty book and this backfills them.
def book_default(identity):
	row = mochi.db.row("select id from books where identity=? order by created, id limit 1", identity)
	if row:
		id = row["id"]
	else:
		id = mochi.entity.create("book", mochi.app.label("book.default"), "private")
		now = mochi.time.now()
		mochi.db.execute("insert into books ( id, identity, version, created, updated ) values ( ?, ?, 0, ?, ? )", id, identity, now, now)
	if mochi.db.exists("select id from contacts where identity=? and book=''", identity):
		mochi.db.execute("update contacts set book=? where identity=? and book=''", id, identity)
		book_touch(id)
	return id

def book_public(identity, row, default, counts):
	return {
		"id": row["id"],
		"fingerprint": mochi.entity.fingerprint(row["id"]),
		"name": mochi.entity.name(row["id"]) or "",
		"count": counts.get(row["id"], 0),
		"default": row["id"] == default,
		"version": row["version"],
		"created": row["created"],
		"updated": row["updated"],
	}

def books_list(identity):
	default = book_default(identity)
	counts = {}
	for row in mochi.db.rows("select book, count(*) as count from contacts where identity=? group by book", identity):
		counts[row["book"]] = row["count"]
	# The default book first, then creation order: two books made within the
	# same second would otherwise fall to id order, which is random.
	out = []
	for row in mochi.db.rows("select * from books where identity=? order by created, id", identity):
		out.append(book_public(identity, row, default, counts))
	return [b for b in out if b["default"]] + [b for b in out if not b["default"]]

# === Cards ===

def card_decode(text):
	card = json.decode(text, None) if text else None
	if type(card) != "list":
		return []
	return card

def card_encode(card):
	return json.encode(card)

def property_name_valid(name):
	if type(name) != "string" or not name or len(name) > 64:
		return False
	for c in name.elems():
		if c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-":
			return False
	return True

# property_normalise(p) -> dict or None: a submitted property in canonical
# form ({name, params, value}, parameters sorted), or None when invalid. Only
# managed properties are accepted from the editor.
def property_normalise(p):
	if type(p) != "dict":
		return None
	name = p.get("name")
	if not property_name_valid(name) or name not in _MANAGED:
		return None
	value = p.get("value", "")
	if type(value) != "string" or len(value) > _VALUE_MAXIMUM:
		return None
	if value and not mochi.text.valid(value, "text"):
		return None
	params = p.get("params", {})
	if params == None:
		params = {}
	if type(params) != "dict":
		return None
	clean = {}
	for key in sorted(params.keys()):
		values = params[key]
		if not property_name_valid(key):
			return None
		if type(values) == "string":
			values = [values]
		if type(values) != "list":
			return None
		out = []
		for v in values:
			if type(v) != "string" or len(v) > _PARAMETER_MAXIMUM or not mochi.text.valid(v, "line"):
				return None
			out.append(v)
		clean[key] = out
	return {"name": name, "params": clean, "value": value}

# card_merge(card, properties) -> list or None: the card with every managed
# property replaced by the submission and every other property kept. None when
# the submission is malformed.
def card_merge(card, properties):
	if type(properties) != "list" or len(properties) > _PROPERTIES_MAXIMUM:
		return None
	kept = []
	for p in card:
		if type(p) != "dict":
			continue
		name = p.get("name", "")
		if name in _MANAGED or name in _RESERVED:
			continue
		kept.append(p)
	for p in properties:
		clean = property_normalise(p)
		if clean == None:
			return None
		kept.append(clean)
	if len(kept) > _PROPERTIES_MAXIMUM:
		return None
	return kept

def card_name(card):
	for p in card:
		if type(p) == "dict" and p.get("name") == "FN":
			return p.get("value", "").strip()
	return ""

def contact_etag(card, person, friend):
	return mochi.crypto.hash.sha256(json.encode([card, person, friend]))

# === Contacts ===

def contact_get(identity, id):
	if not id or len(id) > 64:
		return None
	return mochi.db.row("select * from contacts where identity=? and id=?", identity, id)

def contact_by_person(identity, person):
	return mochi.db.row("select * from contacts where identity=? and person=?", identity, person)

def contact_public(row):
	return {
		"id": row["id"],
		"book": row["book"],
		"person": row["person"],
		"friend": row["friend"] == 1,
		"name": row["name"],
		"directory": row["directory"],
		"created": row["created"],
		"updated": row["updated"],
	}

def contact_full(row):
	out = contact_public(row)
	out["card"] = card_decode(row["card"])
	out["etag"] = row["etag"]
	return out

def friend_projection(row):
	# The row shape the friends service and the -/friends alias have always
	# returned: id is the person entity id, name the user's label.
	return {"identity": row["identity"], "id": row["person"], "name": row["name"], "class": "person", "created": row["created"], "refreshed": row["refreshed"]}

# contact_insert(identity, book, person, friend, name, directory, card) -> row
def contact_insert(identity, book, person, friend, name, directory, card):
	id = mochi.uid()
	now = mochi.time.now()
	encoded = card_encode(card)
	etag = contact_etag(card, person, friend)
	# refreshed stays 0: a name that arrived in an invite is the sender's own
	# claim, so the first listing re-resolves the directory name straight away
	# rather than trusting the claim for a day.
	mochi.db.execute("insert into contacts ( id, book, identity, person, friend, name, directory, card, etag, created, updated, refreshed ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0 )",
		id, book, identity, person, friend, name, directory, encoded, etag, now, now)
	book_touch(book)
	return contact_get(identity, id)

# contact_link(identity, person, name) -> row: the contact for a Mochi person,
# created in the default book when there is none. The friend flag is untouched;
# name is the invite's self-asserted name and seeds both the label and the
# directory column of a new row.
def contact_link(identity, person, name):
	row = contact_by_person(identity, person)
	if row:
		return row
	card = [{"name": "FN", "params": {}, "value": name}] if name else []
	return contact_insert(identity, book_default(identity), person, 0, name, name, card)

# contact_friend_set(identity, person, friend, name="") -> row: link the contact
# and set its friend flag. A name refreshes the directory column, never the
# user's label.
def contact_friend_set(identity, person, friend, name=""):
	row = contact_link(identity, person, name)
	card = card_decode(row["card"])
	etag = contact_etag(card, person, friend)
	now = mochi.time.now()
	if name:
		# The name is the peer's claim: it fills the directory column for now and
		# refreshed is left alone, so the next listing checks it against the directory.
		mochi.db.execute("update contacts set friend=?, directory=?, etag=?, updated=? where id=?", friend, name, etag, now, row["id"])
	else:
		mochi.db.execute("update contacts set friend=?, etag=?, updated=? where id=?", friend, etag, now, row["id"])
	book_touch(row["book"])
	return contact_get(identity, row["id"])

# contact_delete(identity, row): remove a contact. A friend contact ends the
# friendship; a pending outgoing invite is cancelled.
def contact_delete(identity, row):
	person = row["person"]
	if person:
		if row["friend"] == 1:
			mochi.message.send({"from": identity, "to": person, "service": "friends", "event": "friend/remove"})
		elif mochi.db.exists("select id from invites where identity=? and id=? and direction='to'", identity, person):
			mochi.message.send({"from": identity, "to": person, "service": "friends", "event": "friend/cancel"})
		invite_remove(identity, person)
	mochi.db.execute("delete from contacts where id=? and identity=?", row["id"], identity)
	book_touch(row["book"])

# contacts_refresh(identity, rows): re-resolve stale directory names. The
# directory is the authority on a person's current name; reading it per row on
# every request made this route O(contacts) directory reads, so only rows past
# the interval are re-read, and the result goes into the directory column.
def contacts_refresh(identity, rows):
	stale = mochi.time.now() - _FRIEND_NAME_INTERVAL
	for row in rows:
		if not row["person"] or row.get("refreshed", 0) > stale:
			continue
		info = mochi.directory.get(row["person"])
		name = info.get("name") if info else None
		if name:
			row["directory"] = name
		mochi.db.execute("update contacts set directory=?, refreshed=? where id=?", row["directory"], mochi.time.now(), row["id"])

def contacts_rows(identity, book=""):
	if book:
		return mochi.db.rows("select * from contacts where identity=? and book=? order by created, id", identity, book)
	return mochi.db.rows("select * from contacts where identity=? order by created, id", identity)

def body_json(a):
	if not a.body:
		return None
	body = json.decode(a.body, None)
	return body if type(body) == "dict" else None

def person_input(a):
	# New actions name the person; the aliases the shipped Android client calls
	# still send it as id.
	person = a.input("person")
	if person == None:
		person = a.input("id")
	return person

# === Actions: contacts ===

def action_contacts(a):
	identity = a.user.identity.id
	book_default(identity)
	book = a.input("book", "")
	if book and not book_get(identity, book):
		a.error.label(404, "errors.book_not_found")
		return
	rows = contacts_rows(identity, book)
	contacts_refresh(identity, rows)
	return {"data": {
		"contacts": [contact_public(row) for row in rows],
		"received": invites_received(identity),
		"sent": invites_sent(identity),
	}}

def action_contact_get(a):
	identity = a.user.identity.id
	row = contact_get(identity, a.input("contact", ""))
	if not row:
		a.error.label(404, "errors.contact_not_found")
		return
	return {"data": {"contact": contact_full(row)}}

def action_contact_create(a):
	identity = a.user.identity.id
	body = body_json(a)
	if body == None:
		a.error.label(400, "errors.invalid_properties")
		return
	card = card_merge([], body.get("properties", []))
	if card == None:
		a.error.label(400, "errors.invalid_properties")
		return
	if len(card_encode(card)) > _CARD_MAXIMUM:
		a.error.label(400, "errors.contact_too_large")
		return
	person = body.get("person", "")
	if person == None:
		person = ""
	if person:
		if type(person) != "string" or not mochi.text.valid(person, "entity"):
			a.error.label(400, "errors.invalid_friend_id_format")
			return
		if person == identity:
			a.error.label(400, "errors.cannot_add_yourself")
			return
		if not person_exists(person):
			a.error.label(404, "errors.person_not_found")
			return
		if contact_by_person(identity, person):
			a.error.label(409, "errors.contact_exists")
			return
	name = card_name(card)
	if not name:
		a.error.label(400, "errors.missing_contact_name")
		return
	book = body.get("book", "")
	if book:
		if type(book) != "string" or not book_get(identity, book):
			a.error.label(404, "errors.book_not_found")
			return
	else:
		book = book_default(identity)
	directory = ""
	if person:
		info = mochi.directory.get(person)
		directory = info.get("name", "") if info else ""
	row = contact_insert(identity, book, person, 0, name, directory, card)
	return {"data": {"contact": contact_full(row)}}

def action_contact_update(a):
	identity = a.user.identity.id
	body = body_json(a)
	if body == None:
		a.error.label(400, "errors.invalid_properties")
		return
	contact = body.get("contact", "")
	if type(contact) != "string" or not contact:
		a.error.label(400, "errors.missing_contact_id")
		return
	row = contact_get(identity, contact)
	if not row:
		a.error.label(404, "errors.contact_not_found")
		return
	# Compare-and-swap on the etag: two devices can write the same card within
	# a second, and nothing serialises actions for one user and app.
	expected = body.get("etag", "")
	if expected and expected != row["etag"]:
		a.error.label(412, "errors.contact_changed")
		return
	card = card_decode(row["card"])
	if "properties" in body:
		card = card_merge(card, body.get("properties"))
		if card == None:
			a.error.label(400, "errors.invalid_properties")
			return
	if len(card_encode(card)) > _CARD_MAXIMUM:
		a.error.label(400, "errors.contact_too_large")
		return
	name = card_name(card)
	if not name and not row["person"]:
		a.error.label(400, "errors.missing_contact_name")
		return
	if not name:
		name = row["name"]
	book = body.get("book", "") or row["book"]
	if book != row["book"]:
		if type(book) != "string" or not book_get(identity, book):
			a.error.label(404, "errors.book_not_found")
			return
	etag = contact_etag(card, row["person"], row["friend"])
	now = mochi.time.now()
	mochi.db.execute("update contacts set book=?, name=?, card=?, etag=?, updated=? where id=? and identity=? and etag=?",
		book, name, card_encode(card), etag, now, row["id"], identity, row["etag"])
	after = contact_get(identity, row["id"])
	if not after or after["etag"] != etag:
		a.error.label(412, "errors.contact_changed")
		return
	book_touch(book)
	if book != row["book"]:
		book_touch(row["book"])
	return {"data": {"contact": contact_full(after)}}

def action_contact_delete(a):
	identity = a.user.identity.id
	contact = a.input("contact", "")
	if not contact:
		a.error.label(400, "errors.missing_contact_id")
		return
	row = contact_get(identity, contact)
	if not row:
		a.error.label(404, "errors.contact_not_found")
		return
	contact_delete(identity, row)
	return {"data": {}}

# Search the directory for people to add or invite. Each hit carries the
# caller's relationship to it and the id of an existing contact, if any.
def search_annotated(identity, search):
	results = people_search(search)
	contacts = {}
	for row in mochi.db.rows("select id, person, friend from contacts where identity=? and person<>''", identity):
		contacts[row["person"]] = row
	sent = {}
	for invite in mochi.db.rows("select id from invites where identity=? and direction='to'", identity):
		sent[invite["id"]] = True
	received = {}
	for invite in mochi.db.rows("select id from invites where identity=? and direction='from'", identity):
		received[invite["id"]] = True
	out = []
	for result in results:
		id = result["id"]
		contact = contacts.get(id)
		if id == identity:
			status = "self"
		elif contact and contact["friend"] == 1:
			status = "friend"
		elif id in sent:
			status = "invited"
		elif id in received:
			status = "pending"
		else:
			status = "none"
		result["relationship"] = status
		result["contact"] = contact["id"] if contact else ""
		out.append(result)
	# Name, then oldest first - so an impersonator cannot sort above the original.
	# sortkey folds accents as well as case, unlike .lower().
	def sort_key(r):
		return (mochi.text.sortkey(r.get("name", "")), r.get("created", 0))
	return sorted(out, key=sort_key)

def action_contact_search(a):
	identity = a.user.identity.id
	search = a.input("search", "").strip()
	if len(search) > 200:
		a.error.label(400, "errors.search_query_too_long")
		return
	# An empty query reaches the directory as `name like '%%'`, and core applies
	# no LIMIT, so one request would return every person in the directory.
	if len(search) < 1:
		return {"data": {"results": []}}
	return {"data": {"results": search_annotated(identity, search)}}

# === Actions: address books ===

def action_books(a):
	identity = a.user.identity.id
	return {"data": {"books": books_list(identity)}}

def book_name_input(a):
	name = a.input("name", "").strip()
	if not name:
		a.error.label(400, "errors.missing_book_name")
		return None
	if not mochi.text.valid(name, "name"):
		a.error.label(400, "errors.invalid_book_name")
		return None
	return name

def action_book_create(a):
	identity = a.user.identity.id
	name = book_name_input(a)
	if name == None:
		return
	# The default exists before any other book, so numbering and "default"
	# stay stable however the first request arrives.
	default = book_default(identity)
	id = mochi.entity.create("book", name, "private")
	now = mochi.time.now()
	mochi.db.execute("insert into books ( id, identity, version, created, updated ) values ( ?, ?, 0, ?, ? )", id, identity, now, now)
	row = book_get(identity, id)
	return {"data": {"book": book_public(identity, row, default, {})}}

def action_book_rename(a):
	identity = a.user.identity.id
	row = book_get(identity, a.input("book", ""))
	if not row:
		a.error.label(404, "errors.book_not_found")
		return
	name = book_name_input(a)
	if name == None:
		return
	mochi.entity.update(row["id"], name=name)
	book_touch(row["id"])
	return {"data": {}}

def action_book_delete(a):
	identity = a.user.identity.id
	row = book_get(identity, a.input("book", ""))
	if not row:
		a.error.label(404, "errors.book_not_found")
		return
	if row["id"] == book_default(identity):
		a.error.label(400, "errors.book_default")
		return
	# Contacts go one by one so a friend contact ends its friendship and a
	# pending invite is cancelled, exactly as deleting them singly would.
	for contact in contacts_rows(identity, row["id"]):
		contact_delete(identity, contact)
	mochi.db.execute("delete from books where id=? and identity=?", row["id"], identity)
	mochi.entity.delete(row["id"])
	return {"data": {}}

# === Actions: friendship ===

def person_valid(a, person, identity):
	if not person:
		a.error.label(400, "errors.missing_friend_id")
		return False
	if not mochi.text.valid(person, "entity"):
		a.error.label(400, "errors.invalid_friend_id_format")
		return False
	if person == identity:
		a.error.label(400, "errors.cannot_add_yourself")
		return False
	return True

# friend_invite(a, person, name): send an invitation, or accept one that is
# already waiting from the same person. The contact row exists from the
# moment of inviting, so the invitation shows in the list; the flag turns on
# when the other side accepts.
def friend_invite(a, person, name):
	identity = a.user.identity.id
	if not person_valid(a, person, identity):
		return
	if not name:
		a.error.label(400, "errors.missing_friend_name")
		return
	if not mochi.text.valid(name, "line"):
		a.error.label(400, "errors.invalid_friend_name")
		return
	if mochi.db.exists("select id from invites where identity=? and id=? and direction='from'", identity, person):
		# They already invited us - accept it.
		contact_friend_set(identity, person, 1, name)
		mochi.message.send({"from": identity, "to": person, "service": "friends", "event": "friend/accept"})
		invite_remove(identity, person)
		return {"data": {}}
	# An invite is the only friends message that can target a stranger, so it is
	# the one primitive for spraying or probing entity ids; core's send limit is
	# far looser.
	if invites_recent(identity) >= _INVITE_LIMIT:
		a.error.label(429, "errors.too_many_invites")
		return
	mochi.message.send({"from": identity, "to": person, "service": "friends", "event": "friend/invite"}, {"name": a.user.identity.name})
	invite_set(identity, person, "to", name)
	mochi.db.execute("insert into sent ( identity, created ) values ( ?, ? )", identity, mochi.time.now())
	contact_link(identity, person, name)
	return {"data": {}}

def friend_accept(a, person):
	identity = a.user.identity.id
	if not person_valid(a, person, identity):
		return
	i = mochi.db.row("select * from invites where identity=? and id=? and direction='from'", identity, person)
	if not i:
		a.error.label(400, "errors.invitation_not_found")
		return
	contact_friend_set(identity, person, 1, i["name"])
	mochi.message.send({"from": identity, "to": person, "service": "friends", "event": "friend/accept"})
	invite_remove(identity, person)
	return {"data": {}}

def friend_ignore(a, person):
	identity = a.user.identity.id
	if not person_valid(a, person, identity):
		return
	invite_remove(identity, person, "from")
	return {"data": {}}

# friend_remove(a, person, delete): end a friendship or cancel an outgoing
# invitation. The contact stays unless delete is set (the old -/friends/delete
# semantics the shipped Android client relies on).
def friend_remove(a, person, delete):
	identity = a.user.identity.id
	if not person_valid(a, person, identity):
		return
	row = contact_by_person(identity, person)
	if row and row["friend"] == 1:
		mochi.message.send({"from": identity, "to": person, "service": "friends", "event": "friend/remove"})
	elif mochi.db.exists("select id from invites where identity=? and id=? and direction='to'", identity, person):
		mochi.message.send({"from": identity, "to": person, "service": "friends", "event": "friend/cancel"})
	invite_remove(identity, person)
	if row:
		if delete:
			mochi.db.execute("delete from contacts where id=? and identity=?", row["id"], identity)
			book_touch(row["book"])
		elif row["friend"] == 1:
			contact_friend_set(identity, person, 0)
	return {"data": {}}

def action_friend_invite(a):
	return friend_invite(a, person_input(a), a.input("name", ""))

def action_friend_accept(a):
	return friend_accept(a, person_input(a))

def action_friend_ignore(a):
	return friend_ignore(a, person_input(a))

def action_friend_remove(a):
	return friend_remove(a, person_input(a), False)

# === Compatibility aliases for the -/friends/* routes ===
# Kept for one release so the shipped Android client keeps working until its
# own release; the old response shapes are preserved.

def action_friends_alias_list(a):
	identity = a.user.identity.id
	book_default(identity)
	rows = mochi.db.rows("select * from contacts where identity=? and friend=1 order by person", identity)
	contacts_refresh(identity, rows)
	friends = []
	for row in rows:
		out = friend_projection(row)
		# The old list carried the directory name; the label is what the user
		# chose, so a friend renamed on the phone shows that name here too.
		friends.append(out)
	return {"data": {
		"friends": friends,
		"received": invites_received(identity),
		"sent": invites_sent(identity),
	}}

def action_friends_alias_create(a):
	return friend_invite(a, a.input("id", ""), a.input("name", ""))

def action_friends_alias_delete(a):
	return friend_remove(a, a.input("id", ""), True)

def action_friends_alias_search(a):
	return action_contact_search(a)

# === P2P events: the friendship handshake ===

def event_accept(e):
	identity = e.header("to")
	sender = e.header("from")
	i = mochi.db.row("select * from invites where identity=? and id=? and direction='to'", identity, sender)
	if not i:
		return
	# They accepted our invitation: the contact made at invite time becomes a friend.
	contact_friend_set(identity, sender, 1, i["name"])
	invite_remove(identity, sender)
	notify("accept/accepted", "", mochi.app.label("notifications.title.friend_request_accepted"), mochi.app.label("notifications.body.accepted_invitation", name=i["name"]), "/people", sender, event_id="accept/accepted:" + sender + ":" + identity)

def event_invite(e):
	# Incoming friend invite. The user-configurable `invite_policy` preference
	# decides what happens for unsolicited invites; the default is notify, as
	# action_preferences_get and the clients present it. Mutual invites always
	# transition to friends regardless of policy.
	# mochi.text.valid raises on a non-string (it answers False only for None), and
	# a raised error aborts the handler and mails the admin, so a peer sending
	# {"name": 123} loses the invite silently. Test the type first.
	name = e.content("name")
	# display rather than line: the name is rendered to the recipient, and the
	# validator's own length bound is the one the identity name is set under.
	if type(name) != "string" or not mochi.text.valid(name, "display"):
		return

	identity = e.header("to")
	sender = e.header("from")

	# Mutual invite: always connect, regardless of policy.
	if mochi.db.exists("select id from invites where identity=? and id=? and direction='to'", identity, sender):
		contact_friend_set(identity, sender, 1, name)
		mochi.message.send({"from": identity, "to": sender, "service": "friends", "event": "friend/accept"})
		invite_remove(identity, sender)
		notify("accept/matched", "", mochi.app.label("notifications.title.new_friend"), mochi.app.label("notifications.body.now_your_friend", name=name), "/people", sender, event_id="accept/matched:" + sender + ":" + identity)
		return

	policy = e.user.preference.get("invite_policy") or "notify"

	if policy == "reject":
		return

	if policy == "accept":
		# Auto-accept: mirror the mutual path without writing to invites.
		contact_friend_set(identity, sender, 1, name)
		mochi.message.send({"from": identity, "to": sender, "service": "friends", "event": "friend/accept"})
		notify("accept/matched", "", mochi.app.label("notifications.title.new_friend"), mochi.app.label("notifications.body.now_your_friend", name=name), "/people", sender, event_id="accept/matched:" + sender + ":" + identity)
		return

	# silent or notify: store the pending invite. A sender already pending only
	# refreshes its row and is not announced again - the notification roll-up
	# deduplicates against the last event alone, so a resend after any other
	# sender's invite would otherwise count and push again. A new sender past
	# the ceiling is dropped; the mutual and accept branches above are the only
	# paths past it.
	pending = mochi.db.exists("select id from invites where identity=? and id=? and direction='from'", identity, sender)
	if not pending and invites_pending(identity) >= _INVITE_PENDING_MAXIMUM:
		return
	invite_set(identity, sender, "from", name)

	if policy == "notify" and not pending:
		notify("invite/received", "", mochi.app.label("notifications.title.friend_invitation"), mochi.app.label("notifications.body.invited_you", name=name), "/people/invitations", sender, event_id="invite/received:" + sender + ":" + identity)

def event_cancel(e):
	# Remove the invitation from the recipient's side
	invite_remove(e.header("to"), e.header("from"), "from")

def event_remove(e):
	# The remote friend removed us: the contact stays, the friendship ends.
	identity = e.header("to")
	sender = e.header("from")
	row = contact_by_person(identity, sender)
	if row and row["friend"] == 1:
		contact_friend_set(identity, sender, 0)
	invite_remove(identity, sender)

# === Services: the friends view of contacts ===
# Consumers (chat, chess, go, words) pass these rows straight to their own
# frontends, so the shape is a contract: id is the person entity id.

def function_get(context, identity, id):
	if not identity:
		return None
	row = mochi.db.row("select * from contacts where identity=? and person=? and friend=1", identity, id)
	return friend_projection(row) if row else None

def function_list(context, identity):
	if not identity:
		return []
	return [friend_projection(row) for row in mochi.db.rows("select * from contacts where identity=? and friend=1 order by person", identity)]

# Service function for friends count (used by chat app for cross-app link)
def function_count(context, identity):
	if not identity:
		return 0
	row = mochi.db.row("select count(*) as count from contacts where identity=? and friend=1", identity)
	return row["count"] if row else 0
