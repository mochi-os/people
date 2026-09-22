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
_RESERVED = ["X-MOCHI-PERSON", "X-MOCHI-FRIEND"]

# The DAV path stores whatever a client sends, photos included, so its ceilings
# are wider than the editor's. A phone's contact photo is tens of kilobytes.
_DAV_CARD_MAXIMUM = 524288
_DAV_PROPERTIES_MAXIMUM = 500
_DAV_PARAMETER_MAXIMUM = 1024
_SLUG_MAXIMUM = 128

# Contacts per identity. Far past any real address book; it bounds what one
# account can make a listing or a query walk.
_CONTACTS_MAXIMUM = 20000

# The label shown for a contact, in codepoints.
_LABEL_MAXIMUM = 500

# A friend's avatar, downscaled, travels on the CardDAV card as PHOTO. Fetched
# over P2P from the friend's server when the web listing runs, at most this
# many friends per request and each at most once a day (_FRIEND_NAME_INTERVAL),
# never from a scheduled pass. The thumbnail is read back through this cap.
_PHOTO_FETCHES = 3
_PHOTO_MAXIMUM = 262144
_PHOTO_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

# How long a deletion stays in the change log. A client whose cursor is older
# than what was pruned is told to start over (see action_contacts_changes).
_TOMBSTONE_RETENTION = 7776000

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

# book_touch(book, contact="", deleted=0): bump the book's version, the change
# token DAV clients compare, and log the contact's change. One row per contact
# is kept, the latest, so the log stays the size of the address book plus what
# was deleted from it.
def book_touch(book, contact="", deleted=0):
	now = mochi.time.now()
	mochi.db.execute("update books set version=version+1, updated=? where id=?", now, book)
	if contact:
		row = mochi.db.row("select identity from books where id=?", book)
		if row:
			mochi.db.execute("delete from changes where contact=?", contact)
			mochi.db.execute("insert into changes ( identity, book, contact, deleted, created ) values ( ?, ?, ?, ?, ? )", row["identity"], book, contact, deleted, now)

def book_by_slug(identity, slug):
	if not slug_valid(slug):
		return None
	return mochi.db.row("select * from books where identity=? and slug=?", identity, slug)

# slug_valid(s) -> bool: a name a DAV client may give a collection or object,
# the same character set core accepts in a path.
def slug_valid(s):
	if type(s) != "string" or not s or len(s) > _SLUG_MAXIMUM:
		return False
	for c in s.elems():
		if c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~@+=-":
			return False
	return True

def book_get(identity, id):
	if not id or not mochi.text.valid(id, "entity"):
		return None
	return mochi.db.row("select * from books where identity=? and id=?", identity, id)

# The identity's default book, the one whose slug is the literal "default":
# a flag by creation time ties within a second and a book made then could
# take the default's place. Created on first use together with its entity,
# which is why the migration leaves migrated contacts with an empty book and
# this backfills them.
def book_default(identity):
	row = mochi.db.row("select id from books where identity=? and slug='default'", identity)
	if row:
		id = row["id"]
	else:
		# An identity's first two requests race here - the contacts page loads
		# its contacts and its books together - and both find no default. The
		# unique index on (identity, slug) decides: the insert is ignored for the
		# loser, which drops the entity it made and reads the winner's. Before
		# this the loser's insert failed the whole request.
		id = mochi.entity.create("book", mochi.app.label("book.default"), "private")
		now = mochi.time.now()
		mochi.db.execute("insert or ignore into books ( id, identity, slug, version, created, updated ) values ( ?, ?, 'default', 0, ?, ? )", id, identity, now, now)
		row = mochi.db.row("select id from books where identity=? and slug='default'", identity)
		if row["id"] != id:
			mochi.entity.delete(id)
			id = row["id"]
	if mochi.db.exists("select id from contacts where identity=? and book=''", identity):
		mochi.db.execute("update contacts set book=? where identity=? and book=''", id, identity)
		book_touch(id)
	return id

# ignore: let the unique index on (identity, slug) settle a race between two
# creators of the same slug; the caller reads the slug back to learn who won.
def book_insert(identity, id, slug, ignore=False):
	now = mochi.time.now()
	mochi.db.execute("insert" + (" or ignore" if ignore else "") + " into books ( id, identity, slug, version, created, updated ) values ( ?, ?, ?, 0, ?, ? )", id, identity, slug, now, now)

def book_public(identity, row, default, counts):
	return {
		"id": row["id"],
		"fingerprint": mochi.entity.fingerprint(row["id"]),
		"slug": row["slug"],
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
	if len(kept) > _DAV_PROPERTIES_MAXIMUM:
		return None
	return kept

# card_name(card) -> string: the label for a card, from FN. The label reaches
# every friends-service caller and every list, so it is one line, bounded,
# and free of markup characters; the card keeps FN exactly as written.
def card_name(card):
	for p in card:
		if type(p) == "dict" and p.get("name") == "FN":
			return label_clean(p.get("value", ""))
	return ""

def label_clean(text):
	if type(text) != "string":
		return ""
	for c in ["\r", "\n", "\t", "<", ">"]:
		text = text.replace(c, " ")
	text = text.strip()
	letters = list(text.codepoints())
	if len(letters) > _LABEL_MAXIMUM:
		text = "".join(letters[:_LABEL_MAXIMUM]).strip()
	if not text or not mochi.text.valid(text, "name"):
		return ""
	return text

def contacts_full(identity):
	row = mochi.db.row("select count(*) as count from contacts where identity=?", identity)
	return row != None and row["count"] >= _CONTACTS_MAXIMUM

# contact_etag(card, person, friend, photo="") -> string: the etag a DAV
# client compares. The photo stamp joins only when there is one, so a contact
# without a photo keeps the etag it always had.
def contact_etag(card, person, friend, photo=""):
	parts = [card, person, friend]
	if photo:
		parts.append(photo)
	return mochi.crypto.hash.sha256(json.encode(parts))

def photo_path(id, ext):
	return "photos/" + id + "." + ext

def photo_delete(row):
	if row.get("photo"):
		mochi.file.delete(photo_path(row["id"], row["photo"].split(":")[0]))

# photo_fetch(row) -> string or None: fetch the friend's current avatar and
# store its thumbnail, answering the new stamp ("<ext>:<hash>"), "" when the
# friend has no avatar any more, or None when nothing changed or the fetch
# failed. The source is written to file storage only long enough to downscale.
def photo_fetch(row):
	s = mochi.remote.stream(row["person"], "people", "avatar", {})
	if not s:
		return None
	header = s.read()
	if not header:
		return None
	if header.get("status") != "200":
		return "" if row.get("photo") else None
	ext = _PHOTO_EXTENSIONS.get(header.get("content_type", ""))
	if not ext:
		return None
	declared = header.get("size", 0)
	if type(declared) in ("int", "float") and declared > _AVATAR_MAX:
		return None
	source = "photos/" + row["id"] + "/source." + ext
	read = s.read.file(source, maximum=_AVATAR_MAX)
	if read <= 0 or read > _AVATAR_MAX:
		mochi.file.delete(source)
		return None
	name = mochi.image.variant(source, "thumbnail")
	data = mochi.cache.read(name, maximum=_PHOTO_MAXIMUM) if name else None
	mochi.file.delete(source)
	if not data:
		return None
	stamp = ext + ":" + mochi.crypto.hash.sha256(data)[:16]
	if stamp == row.get("photo"):
		return None
	photo_delete(row)
	mochi.file.write(photo_path(row["id"], ext), data)
	return stamp

# photos_refresh(identity, rows): refresh the photos of the friends among rows
# whose last attempt is over a day old, a few per request. A change moves the
# etag and the book version so DAV clients fetch the card again.
def photos_refresh(identity, rows):
	stale = mochi.time.now() - _FRIEND_NAME_INTERVAL
	fetched = 0
	for row in rows:
		if fetched >= _PHOTO_FETCHES:
			break
		if not row["person"] or row["friend"] != 1 or row.get("photographed", 0) > stale:
			continue
		fetched += 1
		now = mochi.time.now()
		mochi.db.execute("update contacts set photographed=? where id=?", now, row["id"])
		stamp = photo_fetch(row)
		if stamp == None:
			continue
		if stamp == "":
			photo_delete(row)
		etag = contact_etag(card_decode(row["card"]), row["person"], row["friend"], stamp)
		mochi.db.execute("update contacts set photo=?, etag=?, updated=? where id=?", stamp, etag, now, row["id"])
		row["photo"] = stamp
		row["etag"] = etag
		book_touch(row["book"], row["id"])

# === Contacts ===

def contact_get(identity, id):
	if not id or len(id) > 64:
		return None
	return mochi.db.row("select * from contacts where identity=? and id=?", identity, id)

def contact_by_person(identity, person):
	return mochi.db.row("select * from contacts where identity=? and person=?", identity, person)

def contact_by_slug(identity, book, slug):
	if not slug_valid(slug):
		return None
	return mochi.db.row("select * from contacts where identity=? and book=? and slug=?", identity, book, slug)

def contact_public(row):
	return {
		"id": row["id"],
		"book": row["book"],
		# The name a sync client gave the contact when it created it (its id
		# otherwise), so the client can recognise its own creates on download.
		"slug": row["slug"],
		"person": row["person"],
		"friend": row["friend"] == 1,
		"name": row["name"],
		"directory": row["directory"],
		"created": row["created"],
		"updated": row["updated"],
	}

def contact_full(row):
	out = contact_public(row)
	out["card"] = card_photo(row, card_decode(row["card"]))
	out["etag"] = row["etag"]
	return out

# card_photo(row, card) -> list: the card with the cached friend photo added
# as PHOTO, unless the client stored a photo of its own. vCard 3.0 carries it
# inline base64 with a type; 4.0 as a data URI. The stored card never holds
# it, so the etag does not depend on the bytes, only on the photo stamp.
def card_photo(row, card):
	if not row.get("photo"):
		return card
	version = "3.0"
	for p in card:
		if type(p) != "dict":
			continue
		if p.get("name") == "PHOTO":
			return card
		if p.get("name") == "VERSION":
			version = p.get("value", "3.0")
	ext = row["photo"].split(":")[0]
	data = mochi.file.read(photo_path(row["id"], ext), _PHOTO_MAXIMUM)
	if not data:
		return card
	mime = mochi.file.type(photo_path(row["id"], ext))
	out = list(card)
	if version == "4.0":
		out.append({"name": "PHOTO", "params": {}, "value": "data:" + mime + ";base64," + mochi.encode.base64(data)})
	else:
		out.append({"name": "PHOTO", "params": {"ENCODING": ["b"], "TYPE": [mime.split("/")[-1].upper()]}, "value": mochi.encode.base64(data)})
	return out

def friend_projection(row):
	# The row shape the friends service and the -/friends alias have always
	# returned: id is the person entity id, name the user's label.
	return {"identity": row["identity"], "id": row["person"], "name": row["name"], "class": "person", "created": row["created"], "refreshed": row["refreshed"]}

# contact_insert(identity, book, person, friend, name, directory, card, slug="") -> row
# The slug is the name a DAV client chose; a contact made here is named by its id.
def contact_insert(identity, book, person, friend, name, directory, card, slug=""):
	id = mochi.uid()
	now = mochi.time.now()
	encoded = card_encode(card)
	etag = contact_etag(card, person, friend)
	# refreshed stays 0: a name that arrived in an invite is the sender's own
	# claim, so the first listing re-resolves the directory name straight away
	# rather than trusting the claim for a day.
	mochi.db.execute("insert into contacts ( id, book, identity, person, friend, name, directory, card, etag, slug, created, updated, refreshed ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0 )",
		id, book, identity, person, friend, name, directory, encoded, etag, slug or id, now, now)
	book_touch(book, id)
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

# contact_person_set(row, person, name): link an existing contact to a Mochi
# person. The user's label stays; the directory column takes the name the
# directory gave and refreshed resets so the next listing checks it.
def contact_person_set(row, person, name):
	etag = contact_etag(card_decode(row["card"]), person, row["friend"], row.get("photo", ""))
	mochi.db.execute("update contacts set person=?, directory=?, refreshed=0, etag=?, updated=? where id=?", person, name, etag, mochi.time.now(), row["id"])
	book_touch(row["book"], row["id"])

# contact_friend_set(identity, person, friend, name="") -> row: link the contact
# and set its friend flag. A name refreshes the directory column, never the
# user's label.
def contact_friend_set(identity, person, friend, name=""):
	row = contact_link(identity, person, name)
	card = card_decode(row["card"])
	# The cached photo is a friend's; it goes when the friendship does, and
	# photographed resets so a new friendship fetches it straight away.
	photo = row.get("photo", "") if friend else ""
	if not friend:
		photo_delete(row)
	etag = contact_etag(card, person, friend, photo)
	now = mochi.time.now()
	if name:
		# The name is the peer's claim: it fills the directory column for now and
		# refreshed is left alone, so the next listing checks it against the directory.
		mochi.db.execute("update contacts set friend=?, directory=?, photo=?, photographed=0, etag=?, updated=? where id=?", friend, name, photo, etag, now, row["id"])
	else:
		mochi.db.execute("update contacts set friend=?, photo=?, photographed=0, etag=?, updated=? where id=?", friend, photo, etag, now, row["id"])
	book_touch(row["book"], row["id"])
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
	photo_delete(row)
	mochi.db.execute("delete from contacts where id=? and identity=?", row["id"], identity)
	book_touch(row["book"], row["id"], 1)
	changes_prune(identity)

# changes_prune(identity): drop deletions older than the retention, and record
# the newest pruned row as the identity's floor. A cursor below the floor may
# have missed a deletion, so the change log answers it with a reset.
def changes_prune(identity):
	old = mochi.db.row("select max(id) as id from changes where identity=? and deleted=1 and created<?", identity, mochi.time.now() - _TOMBSTONE_RETENTION)
	if not old or not old["id"]:
		return
	mochi.db.execute("delete from changes where identity=? and deleted=1 and id<=?", identity, old["id"])
	mochi.db.execute("insert into pruned ( identity, change ) values ( ?, ? ) on conflict( identity ) do update set change=max( change, excluded.change )", identity, old["id"])

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
	photos_refresh(identity, rows)
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
	# A sync client names the contact itself, so that a create whose answer
	# was lost can be sent again: the retry finds the contact it made.
	slug = body.get("slug", "")
	if slug:
		if not slug_valid(slug):
			a.error.label(400, "errors.invalid_properties")
			return
		existing = contact_by_slug(identity, book, slug)
		if existing:
			return {"data": {"contact": contact_full(existing)}}
	if contacts_full(identity):
		a.error.label(400, "errors.too_many_contacts")
		return
	directory = ""
	if person:
		info = mochi.directory.get(person)
		directory = info.get("name", "") if info else ""
	row = contact_insert(identity, book, person, 0, name, directory, card, slug)
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
	if len(card_encode(card)) > _DAV_CARD_MAXIMUM:
		a.error.label(400, "errors.contact_too_large")
		return
	name = card_name(card)
	if not name and not row["person"]:
		a.error.label(400, "errors.missing_contact_name")
		return
	if not name:
		name = row["name"]
	book = body.get("book", "") or row["book"]
	slug = row["slug"]
	if book != row["book"]:
		if type(book) != "string" or not book_get(identity, book):
			a.error.label(404, "errors.book_not_found")
			return
		# A DAV client named the contact within its old book; another object
		# there may already hold that name in the new one.
		if contact_by_slug(identity, book, slug):
			slug = row["id"]
			if contact_by_slug(identity, book, slug):
				a.error.label(409, "errors.contact_exists")
				return
	etag = contact_etag(card, row["person"], row["friend"], row.get("photo", ""))
	now = mochi.time.now()
	mochi.db.execute("update contacts set book=?, slug=?, name=?, card=?, etag=?, updated=? where id=? and identity=? and etag=?",
		book, slug, name, card_encode(card), etag, now, row["id"], identity, row["etag"])
	after = contact_get(identity, row["id"])
	if not after or after["etag"] != etag:
		a.error.label(412, "errors.contact_changed")
		return
	book_touch(book, row["id"])
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
	expected = a.input("etag", "")
	if expected and expected != row["etag"]:
		a.error.label(412, "errors.contact_changed")
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
	book_insert(identity, id, mochi.entity.fingerprint(id))
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
	book_delete(identity, row)
	return {"data": {}}

# book_delete(identity, row): remove a book and its contacts. Contacts go one
# by one so a friend contact ends its friendship and a pending invite is
# cancelled, exactly as deleting them singly would.
def book_delete(identity, row):
	for contact in contacts_rows(identity, row["id"]):
		contact_delete(identity, contact)
	mochi.db.execute("delete from books where id=? and identity=?", row["id"], identity)
	mochi.entity.delete(row["id"])

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

# friend_invite(a, person, name, contact=""): send an invitation, or accept
# one that is already waiting from the same person. The contact row exists
# from the moment of inviting, so the invitation shows in the list; the flag
# turns on when the other side accepts. A contact names an existing card to
# link to the person first, so a card typed in by hand or synced from a
# device becomes the friend instead of gaining a duplicate beside it.
def friend_invite(a, person, name, contact=""):
	identity = a.user.identity.id
	if not person_valid(a, person, identity):
		return
	if not name:
		a.error.label(400, "errors.missing_friend_name")
		return
	if not mochi.text.valid(name, "line"):
		a.error.label(400, "errors.invalid_friend_name")
		return
	if contact:
		row = contact_get(identity, contact)
		if not row:
			a.error.label(404, "errors.contact_not_found")
			return
		if row["person"] and row["person"] != person:
			a.error.label(409, "errors.contact_linked")
			return
		other = contact_by_person(identity, person)
		if other and other["id"] != row["id"]:
			a.error.label(409, "errors.person_linked")
			return
		if not row["person"]:
			contact_person_set(row, person, name)
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
	return friend_invite(a, person_input(a), a.input("name", ""), a.input("contact", ""))

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

# === CardDAV ===
# Core serves the carddav/*path route with its DAV engine and calls these as
# the server for the authenticated identity (core/server/dav.go). A collection
# is a book named by its slug, an object a contact named by its slug, and a
# card travels as the property list stored in the card column. Cards written
# here keep every property a client sent, photos and UID included; only the
# server's own X-MOCHI properties are regenerated on every read.

def dav_collection(row, default):
	return {"slug": row["slug"], "name": mochi.entity.name(row["id"]) or "", "description": "", "readonly": False, "version": row["version"], "default": row["id"] == default}

# dav_caller(context) -> bool: the call came from the server's DAV engine. The
# engine passes _server in the context; an app calling through the service
# cannot, so these functions are the engine's and nothing else's.
def dav_caller(context):
	return type(context) == "dict" and context.get("_server") == True

def function_dav_collections(context, identity, collection=None):
	if not dav_caller(context) or not identity:
		return []
	default = book_default(identity)
	if collection != None:
		row = book_by_slug(identity, collection)
		return [dav_collection(row, default)] if row else []
	return [dav_collection(row, default) for row in mochi.db.rows("select * from books where identity=? order by created, id", identity)]

def function_dav_collection_create(context, identity, collection, name="", description=""):
	if not dav_caller(context):
		return {"error": "forbidden"}
	if not identity or not slug_valid(collection):
		return {"error": "invalid"}
	if book_by_slug(identity, collection):
		return {"error": "exists"}
	book_default(identity)
	label = name.strip() if type(name) == "string" else ""
	if not label or not mochi.text.valid(label, "name"):
		label = collection
	id = mochi.entity.create("book", label, "private")
	# Two MKCOLs for one slug at once both pass the check above. The unique
	# index decides; the loser drops the entity it made and answers as a
	# sequential duplicate would, rather than failing on the constraint.
	book_insert(identity, id, collection, ignore=True)
	row = book_by_slug(identity, collection)
	if row["id"] != id:
		mochi.entity.delete(id)
		return {"error": "exists"}
	return {"slug": collection}

def function_dav_collection_delete(context, identity, collection):
	if not dav_caller(context):
		return {"error": "forbidden"}
	row = book_by_slug(identity, collection) if identity else None
	if not row:
		return {"error": "not_found"}
	if row["id"] == book_default(identity):
		return {"error": "forbidden"}
	book_delete(identity, row)
	return {}

# dav_object(row) -> dict: a contact as the engine serves it. A card that
# never had an FN, a person contact linked by an invite, is named by the
# user's label or the directory; UID is the client's when it wrote one, the
# contact id otherwise.
def dav_object(row):
	card = [p for p in card_decode(row["card"]) if type(p) == "dict" and p.get("name") not in _RESERVED]
	names = [p.get("name") for p in card]
	if "FN" not in names:
		card.append({"name": "FN", "params": {}, "value": row["name"] or row["directory"] or row["id"]})
	if "UID" not in names:
		card.append({"name": "UID", "params": {}, "value": row["id"]})
	if row["person"]:
		card.append({"name": "X-MOCHI-PERSON", "params": {}, "value": row["person"]})
		if row["friend"] == 1:
			card.append({"name": "X-MOCHI-FRIEND", "params": {}, "value": "1"})
	return {"name": row["slug"], "etag": row["etag"], "updated": row["updated"], "card": card_photo(row, card)}

# function_dav_objects(context, identity, collection, names?, data, offset?,
# limit?): the contacts of a book, or the ones named. Without data only names,
# etags and times travel - an ordinary listing - and no card is read.
def function_dav_objects(context, identity, collection, names=None, start=None, finish=None, data=True, offset=None, limit=None):
	if not dav_caller(context):
		return {"error": "forbidden"}
	book = book_by_slug(identity, collection) if identity else None
	if not book:
		return {"error": "not_found"}
	if not data:
		rows = mochi.db.rows("select slug, etag, updated from contacts where identity=? and book=? order by created, id", identity, book["id"])
		return [{"name": row["slug"], "etag": row["etag"], "updated": row["updated"]} for row in rows]
	if names != None:
		wanted = [n for n in names if slug_valid(n)]
		rows = []
		for i in range(0, len(wanted), 200):
			chunk = wanted[i:i + 200]
			rows.extend(mochi.db.rows("select * from contacts where identity=? and book=? and slug in (" + ", ".join(["?"] * len(chunk)) + ")", identity, book["id"], chunk))
	elif offset != None:
		rows = mochi.db.rows("select * from contacts where identity=? and book=? order by created, id limit ? offset ?", identity, book["id"], limit or 100, offset)
	else:
		rows = contacts_rows(identity, book["id"])
	contacts_refresh(identity, rows)
	return [dav_object(row) for row in rows]

# dav_card_clean(card) -> list or None: a client's property list in stored
# form, the server-owned properties dropped. Values are taken as the parser
# gave them; the encoder escapes on the way out. Lists arrive from core as
# tuples, so both are accepted.
def dav_card_clean(card):
	if type(card) not in ("list", "tuple") or len(card) > _DAV_PROPERTIES_MAXIMUM:
		return None
	out = []
	for p in card:
		if type(p) != "dict":
			return None
		name = p.get("name")
		if not property_name_valid(name):
			return None
		if name in _RESERVED:
			continue
		value = p.get("value", "")
		if type(value) != "string":
			return None
		params = p.get("params", {})
		if params == None:
			params = {}
		if type(params) != "dict":
			return None
		clean = {}
		for key in sorted(params.keys()):
			if not property_name_valid(key):
				return None
			values = params[key]
			if type(values) == "string":
				values = [values]
			if type(values) not in ("list", "tuple"):
				return None
			kept = []
			for v in values:
				if type(v) != "string" or len(v) > _DAV_PARAMETER_MAXIMUM:
					return None
				kept.append(v)
			clean[key] = kept
		entry = {"name": name, "params": clean, "value": value}
		group = p.get("group", "")
		if group:
			if type(group) != "string" or not property_name_valid(group.upper()):
				return None
			entry["group"] = group
		out.append(entry)
	return out

# function_dav_put(context, identity, collection, name, card, match, absent):
# create or replace the object at name. match is the etag the stored object
# must carry ("" for none, "*" for "must exist"); absent says it must not exist
# yet. A person contact keeps its person and friend columns whatever the card
# says, and the user's label follows FN.
def function_dav_put(context, identity, collection, name, card, match="", absent=False):
	if not dav_caller(context):
		return {"error": "forbidden"}
	book = book_by_slug(identity, collection) if identity else None
	if not book:
		return {"error": "not_found"}
	if not slug_valid(name):
		return {"error": "invalid"}
	clean = dav_card_clean(card)
	if clean == None:
		return {"error": "invalid"}
	if len(card_encode(clean)) > _DAV_CARD_MAXIMUM:
		return {"error": "too_large"}
	row = contact_by_slug(identity, book["id"], name)
	if absent and row:
		return {"error": "conflict"}
	if match == "*" and not row:
		return {"error": "conflict"}
	if match and match != "*" and (not row or row["etag"] != match):
		return {"error": "conflict"}
	label = card_name(clean)
	if not label:
		if not row:
			return {"error": "invalid"}
		label = row["name"]
	if not row:
		if contacts_full(identity):
			return {"error": "full"}
		inserted = contact_insert(identity, book["id"], "", 0, label, "", clean, name)
		return {"name": name, "etag": inserted["etag"], "updated": inserted["updated"]}
	etag = contact_etag(clean, row["person"], row["friend"], row.get("photo", ""))
	now = mochi.time.now()
	mochi.db.execute("update contacts set name=?, card=?, etag=?, updated=? where id=? and identity=? and etag=?",
		label, card_encode(clean), etag, now, row["id"], identity, row["etag"])
	after = contact_get(identity, row["id"])
	if not after or after["etag"] != etag:
		return {"error": "conflict"}
	book_touch(book["id"], row["id"])
	return {"name": name, "etag": etag, "updated": now}

# function_dav_delete: remove the object at name. match and absent are the
# request's If-Match and If-None-Match, as for dav/put: a device holding a
# stale copy must not delete what another device has just changed, and a
# friend's card takes the friendship with it.
def function_dav_delete(context, identity, collection, name, match="", absent=False):
	if not dav_caller(context):
		return {"error": "forbidden"}
	book = book_by_slug(identity, collection) if identity else None
	if not book:
		return {"error": "not_found"}
	row = contact_by_slug(identity, book["id"], name)
	if not row:
		return {"error": "not_found"}
	if absent or (match and match != "*" and match != row["etag"]):
		return {"error": "conflict"}
	contact_delete(identity, row)
	return {}

# === Sync ===
# What a sync client that is not a DAV client needs: the change log since a
# cursor, and several contacts in one request.

def action_contacts_changes(a):
	identity = a.user.identity.id
	since = a.input("since", "0") or "0"
	if not since.isdigit() or len(since) > 18:
		a.error.label(400, "errors.invalid_since")
		return
	since = int(since)
	latest = mochi.db.row("select max(id) as id from changes")
	version = latest["id"] if latest and latest["id"] else 0
	# reset: changed lists every contact there is, and anything the client
	# holds that is not in it is gone. Always so for a first sync; also when
	# the cursor predates deletions the log has since forgotten.
	floor = mochi.db.row("select change from pruned where identity=?", identity)
	if since == 0 or (floor and since < floor["change"]):
		return {"data": {"version": version, "reset": True, "changed": [row["id"] for row in contacts_rows(identity)], "deleted": []}}
	changed = []
	deleted = []
	for row in mochi.db.rows("select contact, deleted from changes where identity=? and id>? order by id", identity, since):
		if row["deleted"] == 1:
			deleted.append(row["contact"])
		else:
			changed.append(row["contact"])
	return {"data": {"version": max(version, since), "reset": False, "changed": changed, "deleted": deleted}}

def action_contacts_batch(a):
	identity = a.user.identity.id
	body = body_json(a)
	ids = body.get("contacts") if body else None
	if type(ids) != "list" or len(ids) > 500:
		a.error.label(400, "errors.missing_contact_id")
		return
	out = []
	for id in ids:
		row = contact_get(identity, id) if type(id) == "string" else None
		if row:
			out.append(contact_full(row))
	return {"data": {"contacts": out}}

# === Actions: device tokens ===
# The credential a CardDAV client holds: a token with the dav scope, bound to
# the carddav route so it can drive nothing else, never expiring because it is
# bound, one per device and revocable alone.

def token_name_input(a):
	name = a.input("name", "").strip()
	if not name or len(name) > 100:
		a.error.label(400, "errors.token_name_is_too_long_max_100_characters")
		return None
	return name

def action_token_create(a):
	name = token_name_input(a)
	if name == None:
		return
	token = mochi.token.create(name, ["dav"], 0, "carddav/*path", "")
	if not token:
		a.error.label(500, "errors.failed_to_create_token")
		return
	return {"data": {"token": token}}

def action_token_list(a):
	return {"data": {"tokens": mochi.token.list() or []}}

def action_token_delete(a):
	hash = a.input("hash", "").strip()
	if not hash or len(hash) > 128:
		a.error.label(400, "errors.invalid_token_hash")
		return
	return {"data": {"ok": mochi.token.delete(hash)}}

# === Service: contacts ===
# The whole address book for an app holding contacts/read; the friends service
# above answers only the friends among them.

def function_contacts_list(context, identity):
	if not identity:
		return []
	return [contact_public(row) for row in contacts_rows(identity)]

def function_contacts_get(context, identity, contact):
	row = contact_get(identity, contact) if identity else None
	return contact_full(row) if row else None

# function_contacts_birthdays(context, identity) -> list: every contact with a
# BDAY, as {id, name, month, day, year} with year 0 when the card gives none.
# The forms vCard allows: 19850412, 1985-04-12, --0412, --04-12, each with an
# optional time after T.
def function_contacts_birthdays(context, identity):
	if not identity:
		return []
	out = []
	for row in contacts_rows(identity):
		for p in card_decode(row["card"]):
			if type(p) != "dict" or p.get("name") != "BDAY":
				continue
			date = birthday_parse(p.get("value", ""))
			if date:
				out.append({"id": row["id"], "name": row["name"] or row["directory"], "year": date[0], "month": date[1], "day": date[2]})
			break
	return out

def birthday_parse(value):
	if type(value) != "string":
		return None
	text = value.split("T")[0].strip()
	year = 0
	if text.startswith("--"):
		text = text[2:].replace("-", "")
		if len(text) != 4 or not text.isdigit():
			return None
		month, day = int(text[:2]), int(text[2:])
	else:
		text = text.replace("-", "")
		if len(text) != 8 or not text.isdigit():
			return None
		year, month, day = int(text[:4]), int(text[4:6]), int(text[6:])
	if month < 1 or month > 12 or day < 1 or day > 31:
		return None
	return (year, month, day)

def function_contacts_search(context, identity, search):
	if not identity or type(search) != "string" or not search.strip():
		return []
	needle = search.strip().lower()
	return [contact_public(row) for row in contacts_rows(identity) if needle in row["name"].lower() or needle in row["directory"].lower()]
