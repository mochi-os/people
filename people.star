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
	mochi.db.execute("create table if not exists friends ( identity text not null, id text not null, name text not null default '', class text not null default 'person', created integer not null default 0, refreshed integer not null default 0, primary key ( identity, id ) )")
	mochi.db.execute("create table if not exists invites ( identity text not null, id text not null, direction text not null, name text not null default '', updated integer not null default 0, primary key ( identity, id, direction ) )")
	mochi.db.execute("create table if not exists sent ( identity text not null, created integer not null )")
	mochi.db.execute("create index if not exists sent_identity_created on sent( identity, created )")
	mochi.db.execute("create table if not exists profiles ( person text not null primary key, profile text not null default '', accent text not null default '', updated integer not null default 0 )")

	# Per-slot image metadata (avatar/banner/favicon). The bytes live in file
	# storage at "images/<person>/<slot>"; this holds the content type and size.
	# One row per person and slot, so an upload replaces rather than accumulates.
	mochi.db.execute("create table if not exists images ( person text not null, slot text not null, content_type text not null default '', size integer not null default 0, updated integer not null default 0, primary key ( person, slot ) )")

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
# How long a friend's cached directory name is trusted before action_list
# re-resolves it. A rename shows up within this window rather than immediately;
# the alternative was a directory read per friend on every request.
_FRIEND_NAME_INTERVAL = 86400

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
		# An invite is the only friends message that can target a stranger, so it is
		# the one primitive for spraying or probing entity ids; core's send limit is
		# far looser.
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

# List friends
def action_list(a):
	identity = a.user.identity.id
	friends = mochi.db.rows("select * from friends where identity=? order by id", identity)

	# The directory is the authority on a friend's current name, but reading it
	# per friend on every request made this route O(friends) directory reads. The
	# row caches the resolved name and when it was resolved; only rows past the
	# interval are re-read, so the steady state is none.
	stale = mochi.time.now() - _FRIEND_NAME_INTERVAL
	for friend in friends:
		if friend.get("refreshed", 0) > stale:
			continue
		info = mochi.directory.get(friend["id"])
		name = info.get("name") if info else None
		if name:
			friend["name"] = name
		mochi.db.execute("update friends set name=?, refreshed=? where identity=? and id=?", friend["name"], mochi.time.now(), identity, friend["id"])

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
	# Only the upper bound was checked. An empty query reaches the directory as
	# `name like '%%'`, and core applies no LIMIT, so one request returned every
	# person in the directory. action_users_search below has always had this.
	if len(search) < 1:
		return {"data": {"results": []}}

	results = people_search(search)

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

	# Annotate each result with the caller's relationship to it.
	unique_results = []
	for result in results:
		result_id = result["id"]
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

	# Name, then oldest first - so an impersonator cannot sort above the original.
	# sortkey folds accents as well as case, unlike .lower().
	def sort_key(r):
		return (mochi.text.sortkey(r.get("name", "")), r.get("created", 0))
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

	results = [{"id": entry["id"], "name": entry["name"]} for entry in people_search(search)]
	return {"data": {"results": results}}

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
	# mochi.text.valid raises on a non-string (it answers False only for None), and
	# a raised error aborts the handler and mails the admin, so a peer sending
	# {"name": 123} loses the invite silently. Test the type first.
	name = e.content("name")
	if type(name) != "string" or not mochi.text.valid(name, "line") or len(name) > 255:
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

	return [{"id": entry["id"], "name": entry["name"]} for entry in people_search(query.strip())]

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

def is_person_owner(a):
	# a.owner already answers for the routed entity; comparing a.entity["id"]
	# against person_id would reject fingerprint-addressed requests. The class
	# check stays because the route resolves any entity by id.
	if not a.user or not a.user.identity:
		return False
	if a.entity == None or a.entity["class"] != "person":
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
	if out and "data" in out and is_person_owner(a):
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
	if not is_person_owner(a):
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
	if not is_person_owner(a):
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
	if not is_person_owner(a):
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
	if not is_person_owner(a):
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
	if not is_person_owner(a):
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
