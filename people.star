# Mochi friends app
# REST-style JSON responses version with default identity for API calls
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
	mochi.service.call("notifications", "send", topic, object, title, body, url, mochi.app.label("notifications.topic." + topic.replace("/", ".")), sender=sender, event_id=event_id)

def database_upgrade(version):
	if version == 4:
		# Four indexes that no query can use. friends is keyed ( identity, id )
		# and every lookup gives both, so an index on id alone is never chosen;
		# nothing filters or orders by friends.name. invites is keyed
		# ( identity, id, direction ), so invites_identity_id just repeats that
		# key's own prefix, and an index on direction alone leads with a column
		# of two values and cannot serve the identity-first queries that read it.
		# They cost a write on every insert and buy nothing.
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
		# Drop the pre-2026-07 broadcast tables left in the app data DB when
		# broadcast state moved to the per-app system DB - inert, but stale
		# sequence/log copies mislead diagnosis.
		for table in ["sequence", "log", "acknowledged", "received"]:
			mochi.db.execute("drop table if exists " + table)

def database_create():
	mochi.db.execute("create table if not exists friends ( identity text not null, id text not null, name text not null default '', class text not null default 'person', created integer not null default 0, primary key ( identity, id ) )")
	mochi.db.execute("create table if not exists invites ( identity text not null, id text not null, direction text not null, name text not null default '', updated integer not null default 0, primary key ( identity, id, direction ) )")
	mochi.db.execute("create table if not exists sent ( identity text not null, created integer not null )")
	mochi.db.execute("create index if not exists sent_identity_created on sent( identity, created )")
	mochi.db.execute("create table if not exists profiles ( person text not null primary key, profile text not null default '', accent text not null default '', updated integer not null default 0 )")

def resolve_identity(id):
	entry = mochi.directory.get(id)
	if entry and entry.get("id"):
		return entry["id"]
	return id

def friend_add(identity, id, name):
	# Preserve the original friendship-start time across re-adds of a live row;
	# a fresh add stamps now().
	existing = mochi.db.row("select created from friends where identity=? and id=?", identity, id)
	created = existing["created"] if existing else mochi.time.now()
	mochi.db.execute("insert into friends ( identity, id, name, class, created ) values ( ?, ?, ?, 'person', ? ) on conflict ( identity, id ) do update set name=excluded.name, created=excluded.created", identity, id, name, created)

def friend_remove(identity, id):
	mochi.db.execute("delete from friends where identity=? and id=?", identity, id)

# How many invites one identity may send per window. A person adding everyone
# they know in one sitting stays well under this; a script spraying strangers or
# walking entity ids to see which are real does not.
_INVITE_LIMIT = 30
_INVITE_WINDOW = 3600

def invites_recent(identity):
	# Prunes as it counts, so the log stays proportional to the window rather
	# than growing for the life of the account.
	mochi.db.execute("delete from sent where created < ?", mochi.time.now() - _INVITE_WINDOW)
	row = mochi.db.row("select count(*) as sent from sent where identity=?", identity)
	return row["sent"] if row else 0

def invite_set(identity, id, direction, name):
	mochi.db.execute("insert into invites ( identity, id, direction, name, updated ) values ( ?, ?, ?, ?, ? ) on conflict ( identity, id, direction ) do update set name=excluded.name, updated=excluded.updated", identity, id, direction, name, mochi.time.now())

def invite_remove(identity, id, direction=None):
	# Remove the invite(s) between identity and id. direction=None removes both.
	if direction:
		mochi.db.execute("delete from invites where identity=? and id=? and direction=?", identity, id, direction)
		return
	mochi.db.execute("delete from invites where identity=? and id=?", identity, id)

# Accept a friend's invitation
def action_accept(a):
	identity = a.user.identity.id
	id = a.input("id")
	if not id:
		a.error.label(400, "errors.missing_friend_id")
		return
	if not mochi.text.valid(id, "entity"):
		a.error.label(400, "errors.invalid_friend_id_format")
		return

	i = mochi.db.row("select * from invites where identity=? and id=? and direction='from'", identity, id)
	if not i:
		a.error.label(400, "errors.invitation_not_found")
		return

	friend_add(identity, id, i["name"])
	mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/accept"})
	invite_remove(identity, id)

	return {"data": {}}

# Create a new friend
def action_create(a):
	identity = a.user.identity.id
	id = a.input("id")
	if not id:
		a.error.label(400, "errors.missing_friend_id")
		return
	if not mochi.text.valid(id, "entity"):
		a.error.label(400, "errors.invalid_friend_id_format")
		return
	if id == identity:
		a.error.label(400, "errors.cannot_add_yourself")
		return

	name = a.input("name")
	if not name:
		a.error.label(400, "errors.missing_friend_name")
		return
	if not mochi.text.valid(name, "line"):
		a.error.label(400, "errors.invalid_friend_name")
		return
	if len(name) > 255:
		a.error.label(400, "errors.friend_name_too_long")
		return

	# Check if there's an existing invitation from them
	if mochi.db.exists("select id from invites where identity=? and id=? and direction='from'", identity, id):
		# They already invited us - accept it by adding as friend
		friend_add(identity, id, name)
		mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/accept"})
		invite_remove(identity, id)
	else:
		# An invite is the only friends message that goes to an entity with no
		# prior relationship, so it is the only one that can be aimed anywhere:
		# accept, remove and cancel all require a row that already exists. That
		# makes this the app's one outbound primitive for spraying strangers or
		# probing which entity ids are real, and core's own send limit (1000 a
		# second) is far too loose to bound either.
		if invites_recent(identity) >= _INVITE_LIMIT:
			a.error.label(429, "errors.too_many_invites")
			return
		# No existing invitation - send them an invitation (don't add as friend yet)
		mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/invite"}, {"name": a.user.identity.name})
		invite_set(identity, id, "to", name)
		mochi.db.execute("insert into sent ( identity, created ) values ( ?, ? )", identity, mochi.time.now())

	return {"data": {}}

# Delete a friend or cancel a sent invitation
def action_delete(a):
	identity = a.user.identity.id
	id = a.input("id")
	if not id:
		a.error.label(400, "errors.missing_friend_id")
		return
	if not mochi.text.valid(id, "entity"):
		a.error.label(400, "errors.invalid_friend_id_format")
		return

	# Check if this is an existing friendship - notify remote to remove us
	if mochi.db.exists("select id from friends where identity=? and id=?", identity, id):
		mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/remove"})
	# Check if this is a sent invitation that needs to be cancelled on the other side
	elif mochi.db.exists("select id from invites where identity=? and id=? and direction='to'", identity, id):
		mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/cancel"})

	# Clean up all local data for this relationship (both invite directions and friendship)
	invite_remove(identity, id)
	friend_remove(identity, id)

	return {"data": {}}

# Ignore a friend's invitation
def action_ignore(a):
	identity = a.user.identity.id
	id = a.input("id")
	if not id:
		a.error.label(400, "errors.missing_friend_id")
		return
	if not mochi.text.valid(id, "entity"):
		a.error.label(400, "errors.invalid_friend_id_format")
		return

	invite_remove(identity, id, "from")

	return {"data": {}}

# List friends
def action_list(a):
	identity = a.user.identity.id
	friends = mochi.db.rows("select * from friends where identity=? order by id", identity)

	# Look up current names from directory to avoid stale names
	for friend in friends:
		info = mochi.directory.get(friend["id"])
		if info and info.get("name"):
			friend["name"] = info["name"]

	return {"data": {
		"friends": friends,
		"received": mochi.db.rows("select * from invites where identity=? and direction='from' order by updated desc", identity),
		"sent": mochi.db.rows("select * from invites where identity=? and direction='to' order by updated desc", identity)
	}}

# Search for friends to add (searches P2P directory)
# Supports searching by name, entity ID, fingerprint (with or without hyphens), or URL
def action_search(a):
	identity = a.user.identity.id
	search = a.input("search", "").strip()
	if len(search) > 200:
		a.error.label(400, "errors.search_query_too_long")
		return

	results = []

	# Check if search term is an entity ID (49-51 word characters)
	if mochi.text.valid(search, "entity"):
		entry = mochi.directory.get(search)
		if entry and entry.get("class") == "person":
			results.append(entry)

	# Check if search term is a fingerprint (9 alphanumeric, with or without hyphens)
	fingerprint = search.replace("-", "")
	if mochi.text.valid(fingerprint, "fingerprint"):
		matches = mochi.directory.search("person", "", False, fingerprint=fingerprint)
		for entry in matches:
			found = False
			for r in results:
				if r.get("id") == entry.get("id"):
					found = True
					break
			if not found:
				results.append(entry)

	# Check if search term is a URL (e.g., https://example.com/people/ENTITY_ID)
	if search.startswith("http://") or search.startswith("https://"):
		parts = search.rstrip("/").split("/")
		for part in reversed(parts):
			if mochi.text.valid(part, "entity"):
				entry = mochi.directory.get(part)
				if entry and entry.get("class") == "person":
					# Avoid duplicates
					found = False
					for r in results:
						if r.get("id") == entry.get("id"):
							found = True
							break
					if not found:
						results.append(entry)
				break

	# Also search by name
	name_results = mochi.directory.search("person", search, False)
	for entry in name_results:
		# Avoid duplicates
		found = False
		for r in results:
			if r.get("id") == entry.get("id"):
				found = True
				break
		if not found:
			results.append(entry)

	# Build sets of existing relationships for efficient lookup
	friend_ids = set()
	sent_invite_ids = set()
	received_invite_ids = set()

	# Get all friends
	friends = mochi.db.rows("select id from friends where identity=?", identity)
	for friend in friends:
		friend_ids.add(friend["id"])

	# Get all sent invitations (direction='to' means we invited them)
	sent_invites = mochi.db.rows("select id from invites where identity=? and direction='to'", identity)
	for invite in sent_invites:
		sent_invite_ids.add(invite["id"])

	# Get all received invitations (direction='from' means they invited us)
	received_invites = mochi.db.rows("select id from invites where identity=? and direction='from'", identity)
	for invite in received_invites:
		received_invite_ids.add(invite["id"])

	# Deduplicate results by ID and add relationship status
	seen = {}
	unique_results = []
	for result in results:
		result_id = result["id"]
		if result_id not in seen:
			seen[result_id] = True

			# Determine relationship status
			# - "friend": Already friends
			# - "invited": You sent them an invitation (outgoing)
			# - "pending": They sent you an invitation (incoming)
			# - "none": No existing relationship
			if result_id == identity:
				status = "self"
			elif result_id in friend_ids:
				status = "friend"
			elif result_id in sent_invite_ids:
				status = "invited"
			elif result_id in received_invite_ids:
				status = "pending"
			else:
				status = "none"

			result["relationshipStatus"] = status
			unique_results.append(result)

	# Sort by name (case-insensitive), then by created date (oldest first)
	# Oldest first for same names prevents impersonation attacks
	def sort_key(r):
		return (r.get("name", "").lower(), r.get("created", 0))
	unique_results = sorted(unique_results, key=sort_key)

	return {"data": {"results": unique_results}}

# Search for users (for group membership)
# Supports searching by name, entity ID, fingerprint (with or without hyphens), or URL
def action_users_search(a):
	search = a.input("search", "").strip()
	if len(search) > 200:
		a.error.label(400, "errors.search_query_too_long")
		return
	if len(search) < 1:
		return {"data": {"results": []}}

	seen = {}
	unique_results = []

	# Check if search term is an entity ID (49-51 word characters)
	if mochi.text.valid(search, "entity"):
		entry = mochi.directory.get(search)
		if entry and entry.get("class") == "person":
			if entry["id"] not in seen:
				seen[entry["id"]] = True
				unique_results.append({"id": entry["id"], "name": entry["name"]})

	# Check if search term is a fingerprint (9 alphanumeric, with or without hyphens)
	fingerprint = search.replace("-", "")
	if mochi.text.valid(fingerprint, "fingerprint"):
		matches = mochi.directory.search("person", "", False, fingerprint=fingerprint)
		for entry in matches:
			if entry["id"] not in seen:
				seen[entry["id"]] = True
				unique_results.append({"id": entry["id"], "name": entry["name"]})

	# Check if search term is a URL (e.g., https://example.com/people/ENTITY_ID)
	if search.startswith("http://") or search.startswith("https://"):
		# Extract entity ID from URL - look for the last path segment that's a valid entity
		parts = search.rstrip("/").split("/")
		for part in reversed(parts):
			if mochi.text.valid(part, "entity"):
				entry = mochi.directory.get(part)
				if entry and entry.get("class") == "person":
					if entry["id"] not in seen:
						seen[entry["id"]] = True
						unique_results.append({"id": entry["id"], "name": entry["name"]})
				break

	# Also search by name
	results = mochi.directory.search("person", search, False)
	for result in results:
		if result["id"] not in seen:
			seen[result["id"]] = True
			unique_results.append({"id": result["id"], "name": result["name"]})

	return {"data": {"results": unique_results}}

def event_accept(e):
	identity = resolve_identity(e.header("to"))
	i = mochi.db.row("select * from invites where identity=? and id=? and direction='to'", identity, e.header("from"))
	if not i:
		return

	# Add them as a friend since they accepted our invitation
	# Use e.header values consistently instead of i[] for safety
	friend_add(identity, e.header("from"), i["name"])

	invite_remove(identity, e.header("from"))
	notify("accept/accepted", "", mochi.app.label("notifications.title.friend_request_accepted"), mochi.app.label("notifications.body.accepted_invitation", name=i["name"]), "/people", e.header("from"), event_id="accept/accepted:" + e.header("from") + ":" + identity)

def event_invite(e):
	# Incoming friend invite. The user-configurable `invite_policy` preference
	# decides what happens for unsolicited invites (default: silent store, no
	# notification — invites are a common unsolicited-contact vector).
	# Mutual invites always transition to friends regardless of policy.
	name = e.content("name")
	if not mochi.text.valid(name, "line") or len(name) > 255:
		return

	identity = resolve_identity(e.header("to"))
	sender = e.header("from")

	# Mutual invite — always connect, regardless of policy.
	if mochi.db.exists("select id from invites where identity=? and id=? and direction='to'", identity, sender):
		friend_add(identity, sender, name)
		mochi.message.send({"from": identity, "to": sender, "service": "friends", "event": "friend/accept"})
		invite_remove(identity, sender)
		notify("accept/matched", "", mochi.app.label("notifications.title.new_friend"), mochi.app.label("notifications.body.now_your_friend", name=name), "/people", sender, event_id="accept/matched:" + sender + ":" + identity)
		return

	policy = e.user.preference.get("invite_policy") or "notify"

	if policy == "reject":
		return

	if policy == "accept":
		# Auto-accept: mirror mutual-invite path without writing to invites.
		friend_add(identity, sender, name)
		mochi.message.send({"from": identity, "to": sender, "service": "friends", "event": "friend/accept"})
		notify("accept/matched", "", mochi.app.label("notifications.title.new_friend"), mochi.app.label("notifications.body.now_your_friend", name=name), "/people", sender, event_id="accept/matched:" + sender + ":" + identity)
		return

	# silent or notify: store pending invite
	invite_set(identity, sender, "from", name)

	if policy == "notify":
		notify("invite/received", "", mochi.app.label("notifications.title.friend_invitation"), mochi.app.label("notifications.body.invited_you", name=name), "/people/invitations", sender, event_id="invite/received:" + sender + ":" + identity)

def event_cancel(e):
	# Remove the invitation from the recipient's side
	invite_remove(resolve_identity(e.header("to")), e.header("from"), "from")

def event_remove(e):
	# Remote friend removed us - clean up local friendship and any pending invites
	identity = resolve_identity(e.header("to"))
	friend_remove(identity, e.header("from"))
	invite_remove(identity, e.header("from"))

def function_get(context, identity, id):
	if not identity:
		return None
	return mochi.db.row("select * from friends where identity=? and id=?", identity, id)

def function_list(context, identity):
	if not identity:
		return []
	return mochi.db.rows("select * from friends where identity=? order by id", identity)

# Service function for user search
# Supports searching by name, entity ID, fingerprint (with or without hyphens), or URL
def function_users_search(context, query):
	if not query or len(query) > 200:
		return []

	search = query.strip()
	seen = {}
	unique_results = []

	# Check if search term is an entity ID (49-51 word characters)
	if mochi.text.valid(search, "entity"):
		entry = mochi.directory.get(search)
		if entry and entry.get("class") == "person":
			if entry["id"] not in seen:
				seen[entry["id"]] = True
				unique_results.append({"id": entry["id"], "name": entry["name"]})

	# Check if search term is a fingerprint (9 alphanumeric, with or without hyphens)
	fingerprint = search.replace("-", "")
	if mochi.text.valid(fingerprint, "fingerprint"):
		matches = mochi.directory.search("person", "", False, fingerprint=fingerprint)
		for entry in matches:
			if entry["id"] not in seen:
				seen[entry["id"]] = True
				unique_results.append({"id": entry["id"], "name": entry["name"]})

	# Check if search term is a URL (e.g., https://example.com/people/ENTITY_ID)
	if search.startswith("http://") or search.startswith("https://"):
		parts = search.rstrip("/").split("/")
		for part in reversed(parts):
			if mochi.text.valid(part, "entity"):
				entry = mochi.directory.get(part)
				if entry and entry.get("class") == "person":
					if entry["id"] not in seen:
						seen[entry["id"]] = True
						unique_results.append({"id": entry["id"], "name": entry["name"]})
				break

	# Also search by name
	results = mochi.directory.search("person", search, False)
	for result in results:
		if result["id"] not in seen:
			seen[result["id"]] = True
			unique_results.append({"id": result["id"], "name": result["name"]})

	return unique_results

# Service function for groups list
def function_groups_list(context):
	return mochi.group.list()

# Service function for friends count (used by chat app for cross-app link)
def function_count(context, identity):
	if not identity:
		return 0
	row = mochi.db.row("select count(*) as count from friends where identity=?", identity)
	return row["count"] if row else 0

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
			# 'user' subjects are person entity IDs (see
			# action_group_member_add). Resolve the display name via
			# mochi.entity.name (local entities then the directory) — NOT
			# mochi.user.get, which is administrator-only and raises, so a
			# normal group viewer got a 500 the moment the group had any user
			# member.
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

def action_group_create(a):
	# A caller may supply the id - an import restoring groups under their
	# original ids needs to - but only in the shape this app generates. Core
	# leaves mochi.group.get ungated on the grounds that a group id cannot be
	# guessed, so an app without groups/read cannot read a group it was never
	# told about; a group created as "family" would make that false. Enforcing
	# the shape here is what makes that assumption true, since this is the only
	# app that creates groups.
	id = a.input("id", "")
	if id and not uid(id):
		a.error.label(400, "errors.invalid_group_id")
		return
	# mochi.group.create writes by primary key, so a supplied id naming a group
	# that already exists replaced its name and description while reporting a
	# creation. An import restoring groups under their original ids is the reason
	# callers may supply one at all, and silently overwriting is not what an
	# import wants either - it wants to know the group is already there.
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

	# Clearing a field and leaving it alone have to be told apart, and neither
	# accessor manages it alone. a.input() reads the JSON body first, where ""
	# survives, but falls back to the form only for a non-empty value - so over a
	# form, sent-empty and never-sent both read as None. a.inputs() returns the
	# raw query/form list, where the two are distinct ([""] against []), but it
	# never looks at a JSON body at all. Checking both covers either encoding:
	# this app's own client posts a form, and JSON callers exist too.
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

	# Group "user" members are person entity IDs — that's what -/users/search
	# returns and what the member list resolves for display.
	#
	# A numeric local uid used to be accepted here as a legacy form, which
	# exempted it from the check below because there is no entity behind such an
	# id to find. That exemption was the one remaining way to store a member
	# pointing at nothing, and no numeric member survives, so it is gone. Only
	# the entity form is accepted now.
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

	mochi.group.add(group, member, type)
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
	return {"data": {"invite_policy": a.user.preference.get("invite_policy") or "notify"}}

def action_preferences_set(a):
	policy = a.input("invite_policy", "").strip()
	if policy not in _VALID_INVITE_POLICIES:
		a.error.label(400, "errors.invalid_invite_policy")
		return
	a.user.preference.set("invite_policy", policy)
	return {"data": {}}

# ---------------------------------------------------------------------------
# Person profiles: avatar / banner / favicon / markdown / style
#
# The people app handles the `person` entity class. Each person entity exposes
# a public profile via :person/-/* HTTP actions (for browsers + domain-routed
# visits) and matching P2P events (for cross-server access). Other apps fetch
# person data with mochi.remote.request(person, "people", "<event>", {}).

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

def is_person_owner(a, person_id):
	# a.owner is core's answer for the routed entity, computed against the
	# authenticated caller. person_id is the same route segment core resolved to
	# a.entity, so there is nothing to compare - and nothing to get wrong: the
	# id and fingerprint forms both reach here, and comparing a.entity["id"]
	# against person_id would reject every fingerprint-addressed request.
	#
	# The class check stays because the route resolves an entity by id without
	# requiring it to be a person.
	if not a.user or not a.user.identity:
		return False
	if a.entity == None or a.entity["class"] != "person":
		return False
	return a.owner

def slot_object(person_id, slot):
	return person_id + "/" + slot

def slot_attachment(person_id, slot):
	atts = mochi.attachment.list(slot_object(person_id, slot))
	if atts and len(atts) > 0:
		return atts[0]
	return None

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

def build_information(person_id, entity):
	profile = get_profile_row(person_id)
	style = {}
	if profile.get("accent"):
		style["accent"] = profile["accent"]
	out = {
		"id": entity["id"],
		"fingerprint": entity.get("fingerprint", mochi.entity.fingerprint(person_id)),
		"name": entity.get("name", ""),
		"privacy": entity.get("privacy", ""),
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
	# Reject a malformed id before opening a stream: mochi.remote.stream errors
	# out on an invalid entity, and a builtin error aborts the whole action as a
	# 500 quoting the internal API name. These routes are public and the id is
	# the route segment, so anyone can trigger it. Both forms are legitimate
	# here - the UI links profiles by fingerprint. Mirrors projects/market/staff.
	if not mochi.text.valid(person_id, "entity") and not mochi.text.valid(person_id, "fingerprint"):
		a.error.label(404, "errors.person_not_found")
		return None
	s = mochi.remote.stream(person_id, "people", asset, {})
	if not s:
		a.error.label(502, "errors.person_unavailable")
		return None
	header = s.read()
	if not header or header.get("status") != "200":
		# The status is the far end's claim, exactly like the error text below, so
		# it gets the same treatment. Adopting it raw was reachable by anyone who
		# can name a person this server will dial: int() aborts the whole action
		# as a 500 on a non-decimal string, and int() on a non-string aborts it
		# too, while a value outside 100-999 panics net/http inside
		# a.error.label - gin recovers that, so it surfaces as a 500 and a stack
		# trace rather than a crash.
		#
		# Only a 4xx or 5xx is adopted. We are in this branch because the reply
		# was not a 200, so a peer claiming 2xx or 3xx is malformed by
		# definition, and passing one on is worse than saying not found: a 204
		# answers an image request with nothing, and a 301 from a route that
		# sets no Location is simply broken.
		code = 404
		remote = header.get("status") if header else None
		if type(remote) == "string" and decimal(remote):
			status = int(remote)
			if status >= 400 and status <= 599:
				code = status
		# Word the failure from what we asked for, not from what the far end
		# said. The error field in the response is a diagnostic written by
		# whoever hosts this person, so it is English prose at best and a remote
		# server's choice of message at worst - resolving it as a label key let
		# another server pick which of our strings the user sees. Matches how
		# feeds, forums, wikis and staff bridge the same event.
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
	# The far end declares a length alongside the type. Checking it here turns an
	# honestly-oversized asset into a clean error, because once a.write.stream
	# starts copying, the status and headers are already sent and the response
	# cannot be retracted - the caller would receive a truncated image under a 200.
	# A peer that under-declares, or declares nothing, is still stopped by the
	# maximum passed to a.write.stream below; this check is for the common case,
	# that one being the cheaper and clearer failure.
	declared = header.get("size", 0)
	if type(declared) in ("int", "float") and declared > cap:
		a.error.label(502, "errors.asset_too_large", slot=asset)
		return None
	a.header("Cache-Control", "private, max-age=300")
	# The content type comes from whoever hosts the person, so for a remote
	# profile it is a claim by another server rather than by us. These routes
	# serve images and nothing else, so anything outside that set is served as
	# an opaque download - core stops it rendering in our origin either way, but
	# there is no reason to repeat a stranger's claim about what their bytes are.
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
	# privacy says whether this person is listed in the directory. It is the
	# owner's own setting and their UI reads it back after changing it, so it
	# stays in the payload for them - but this route is public, and a stranger
	# reading someone's profile has no use for it. Rebuilt rather than removed
	# in place: the dict comes from a decoded response and may be frozen.
	if out and "data" in out and not is_person_owner(a, person):
		return {"data": {key: value for key, value in out["data"].items() if key != "privacy"}}
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
	# Judge the upload before it is stored, not after. These same two checks used
	# to run on the saved attachment, so a favicon - capped at 64KB - was written
	# to disk at whatever size arrived and only then measured and deleted.
	# a.file() reads the multipart field without storing it, and its content_type
	# is the same value the attachment would carry: core takes the client's
	# Content-Type header for both, so checking here is equivalent, not weaker.
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
	object = slot_object(person_id, slot)
	saved = mochi.attachment.save(object, "file", [], [])
	if not saved or len(saved) == 0:
		a.error.label(400, "errors.no_file_uploaded")
		return
	att = saved[0]
	# Validation passed — remove any previous attachment for this slot
	for old in mochi.attachment.list(object):
		if old["id"] != att["id"]:
			mochi.attachment.delete(old["id"])
	return {"data": {"id": att["id"]}}

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
	# OpenGraph is rendered for anonymous crawlers and link previews, and core
	# runs it as the entity owner regardless of who asked, so treat every
	# request as untrusted. A person who set their profile private should not
	# have their name and bio emitted into meta tags, which exist precisely to
	# be harvested and indexed by third parties. Matches opengraph_feed.
	#
	# This does NOT make a private profile unreadable: the person routes and the
	# anonymous P2P handlers still serve the same fields by design (see the
	# people privacy task). What it removes is the indexing path.
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

# === P2P events (cross-server reads) ===
#
# The `error` field these handlers send is a diagnostic for the operator of the
# requesting server, never user-facing text: the bridge on the other side words
# its own message from the asset it asked for, because a message chosen by a
# remote server has no business reaching our user. Keep them stable and English
# for that reason - translating them would imply they are shown to someone.

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
	att = slot_attachment(person_id, slot)
	if not att and fallback_slot:
		att = slot_attachment(person_id, fallback_slot)
	if not att:
		e.stream.write({"status": "404", "error": slot + " not set"})
		return
	path = mochi.attachment.path(att["id"])
	if not path:
		e.stream.write({"status": "404", "error": slot + " unavailable"})
		return
	e.stream.write({"status": "200", "content_type": att.get("content_type", "application/octet-stream"), "size": att.get("size", 0)})
	e.write.file(path)

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
