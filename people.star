# Mochi friends app
# REST-style JSON responses version with default identity for API calls
# Copyright © 2026 Mochi OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

def notify(topic, object="", title="", body="", url="", sender="", event_id=""):
	mochi.service.call("notifications", "send", topic, object, title, body, url, mochi.app.label("notifications.topic." + topic.replace("/", ".")), sender=sender, event_id=event_id)

def database_create():
	mochi.db.execute("create table if not exists friends ( identity text not null, id text not null, name text not null default '', class text not null default 'person', created integer not null default 0, primary key ( identity, id ) )")
	mochi.db.execute("create index if not exists friends_id on friends( id )")
	mochi.db.execute("create index if not exists friends_name on friends( name )")
	mochi.db.execute("create table if not exists invites ( identity text not null, id text not null, direction text not null, name text not null default '', updated integer not null default 0, primary key ( identity, id, direction ) )")
	mochi.db.execute("create index if not exists invites_identity_id on invites( identity, id )")
	mochi.db.execute("create index if not exists invites_direction on invites( direction )")
	mochi.db.execute("create table if not exists profiles ( person text not null primary key, profile text not null default '', accent text not null default '', updated integer not null default 0 )")

def database_upgrade(version):
	if version == 2:
		mochi.db.execute("create table if not exists profiles ( person text not null primary key, profile text not null default '', accent text not null default '', updated integer not null default 0 )")
	if version == 3:
		# Timestamp friendships so clients can offer a "recently added" sort.
		# Pre-existing rows default to 0 (sort oldest), which is correct: their
		# real add-time is unknown.
		mochi.db.execute("alter table friends add column created integer not null default 0")
	if version == 4:
		# friends / invites / profiles become versioned LWW-Registers
		# (mochi.db.merge / mochi.db.remove) so add/remove/edits converge across a
		# user's hosts and a stale write can't resurrect a removed relationship.
		# Rebuild friends + invites so every non-key column carries a DEFAULT: a
		# tombstone upserts only the key columns, so a NOT NULL column without a
		# default would abort the removal (SQLite can't add a default via ALTER).
		# profiles already has defaults on its columns, so it only needs the register
		# columns added.
		mochi.db.execute("create table friends_new ( identity text not null, id text not null, name text not null default '', class text not null default 'person', created integer not null default 0, writer text not null default '', version integer not null default 0, removed integer not null default 0, primary key ( identity, id ) )")
		mochi.db.execute("insert into friends_new ( identity, id, name, class, created ) select identity, id, name, class, created from friends")
		mochi.db.execute("drop table friends")
		mochi.db.execute("alter table friends_new rename to friends")
		mochi.db.execute("create index if not exists friends_id on friends( id )")
		mochi.db.execute("create index if not exists friends_name on friends( name )")
		mochi.db.execute("create table invites_new ( identity text not null, id text not null, direction text not null, name text not null default '', updated integer not null default 0, writer text not null default '', version integer not null default 0, removed integer not null default 0, primary key ( identity, id, direction ) )")
		mochi.db.execute("insert into invites_new ( identity, id, direction, name, updated ) select identity, id, direction, name, updated from invites")
		mochi.db.execute("drop table invites")
		mochi.db.execute("alter table invites_new rename to invites")
		mochi.db.execute("create index if not exists invites_identity_id on invites( identity, id )")
		mochi.db.execute("create index if not exists invites_direction on invites( direction )")
		for c in ["writer text not null default ''", "version integer not null default 0", "removed integer not null default 0"]:
			mochi.db.execute("alter table profiles add column " + c)
	if version == 5:
		# Replication is removed: purge tombstones and drop the LWW-Register
		# columns v4 added. Idempotent per table so a partial run heals.
		for t in ["friends", "invites", "profiles"]:
			cols = [r["name"] for r in mochi.db.table(t) or []]
			if "removed" in cols:
				mochi.db.execute("delete from " + t + " where removed=1")
			for c in ["writer", "version", "removed"]:
				if c in cols:
					mochi.db.execute("alter table " + t + " drop column " + c)

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
		# No existing invitation - send them an invitation (don't add as friend yet)
		mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/invite"}, {"name": a.user.identity.name})
		invite_set(identity, id, "to", name)

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

def action_group_create(a):
	id = a.input("id", "")
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

	name = a.input("name", "")
	description = a.input("description", "")

	if not name and not description:
		a.error.label(400, "errors.no_fields_to_update")
		return

	if name:
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
	if name:
		kwargs["name"] = name
	if description:
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
	# returns and what the member list resolves for display. Older data may
	# hold a numeric local uid, so accept either form.
	if type == "user" and not (mochi.text.valid(member, "entity") or member.isdigit()):
		a.error.label(400, "errors.invalid_user_id")
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

# Welcome page data - returns whether user has seen welcome and friends count
def action_welcome(a):
	identity = a.user.identity.id
	seen = a.user.preference.get("people_welcome_seen") == "true"
	count = mochi.db.row("select count(*) as count from friends where identity=?", identity)
	return {"data": {"seen": seen, "count": count["count"] if count else 0}}

# Mark welcome as seen
def action_welcome_seen(a):
	a.user.preference.set("people_welcome_seen", "true")
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

def is_person_owner(a, person_id):
	if not a.user or not a.user.identity:
		return False
	owned = mochi.entity.get(person_id)
	if not owned:
		return False
	for e in owned:
		if e.get("class") == "person":
			return True
	return False

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
	s = mochi.remote.stream(person_id, "people", asset, {})
	if not s:
		a.error.label(502, "errors.person_unavailable")
		return None
	header = s.read()
	if not header or header.get("status") != "200":
		code = 404
		if header and header.get("status"):
			code = int(header["status"])
		message = (header.get("error") if header else None) or "Person not found"
		a.error(code, message)
		return None
	if "data" in header:
		return {"data": header["data"]}
	a.header("Cache-Control", "private, max-age=300")
	a.header("Content-Type", header.get("content_type", "application/octet-stream"))
	a.write.stream(s)
	return None

def action_information(a):
	return stream_person_asset(a, a.input("person"), "information")

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
	object = slot_object(person_id, slot)
	saved = mochi.attachment.save(object, "file", [], [], [])
	if not saved or len(saved) == 0:
		a.error.label(400, "errors.no_file_uploaded")
		return
	att = saved[0]
	if att.get("size", 0) > _SLOT_CAPS[slot]:
		mochi.attachment.delete(att["id"])
		a.error.label(400, "errors.asset_too_large", slot=slot)
		return
	if not att.get("content_type", "").startswith("image/"):
		mochi.attachment.delete(att["id"])
		a.error.label(400, "errors.asset_must_be_image", slot=slot)
		return
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
