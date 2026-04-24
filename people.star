# Mochi friends app
# REST-style JSON responses version with default identity for API calls
# Copyright Alistair Cunningham 2024-2026

def database_create():
	mochi.db.execute("create table if not exists friends ( identity text not null, id text not null, name text not null, class text not null, primary key ( identity, id ) )")
	mochi.db.execute("create index if not exists friends_id on friends( id )")
	mochi.db.execute("create index if not exists friends_name on friends( name )")
	mochi.db.execute("create table if not exists invites ( identity text not null, id text not null, direction text not null, name text not null, updated integer not null, primary key ( identity, id, direction ) )")
	mochi.db.execute("create index if not exists invites_identity_id on invites( identity, id )")
	mochi.db.execute("create index if not exists invites_direction on invites( direction )")
	mochi.db.execute("create table if not exists profiles ( person text not null primary key, profile text not null default '', accent text not null default '', updated integer not null default 0 )")

def database_upgrade(version):
	if version == 2:
		mochi.db.execute("create table if not exists profiles ( person text not null primary key, profile text not null default '', accent text not null default '', updated integer not null default 0 )")

def json_error(message, code=400):
	return {"status": code, "error": message, "data": {}}

def resolve_identity(id):
	entry = mochi.directory.get(id)
	if entry and entry.get("id"):
		return entry["id"]
	return id

# Accept a friend's invitation
def action_accept(a):
	identity = a.user.identity.id
	id = a.input("id")
	if not id:
		return json_error("Missing friend ID")
	if not mochi.valid(id, "entity"):
		return json_error("Invalid friend ID format")

	i = mochi.db.row("select * from invites where identity=? and id=? and direction='from'", identity, id)
	if not i:
		return json_error("Invitation from friend not found")

	mochi.db.execute("replace into friends ( identity, id, name, class ) values ( ?, ?, ?, 'person' )", identity, id, i["name"])
	mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/accept"})
	mochi.db.execute("delete from invites where identity=? and id=?", identity, id)

	return {"data": {}}

# Create a new friend
def action_create(a):
	identity = a.user.identity.id
	id = a.input("id")
	if not id:
		return json_error("Missing friend ID")
	if not mochi.valid(id, "entity"):
		return json_error("Invalid friend ID format")
	if id == identity:
		return json_error("Cannot add yourself as a friend")

	name = a.input("name")
	if not name:
		return json_error("Missing friend name")
	if not mochi.valid(name, "line"):
		return json_error("Invalid friend name")
	if len(name) > 255:
		return json_error("Friend name too long")

	# Check if there's an existing invitation from them
	if mochi.db.exists("select id from invites where identity=? and id=? and direction='from'", identity, id):
		# They already invited us - accept it by adding as friend
		mochi.db.execute("replace into friends ( identity, id, name, class ) values ( ?, ?, ?, 'person' )", identity, id, name)
		mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/accept"})
		mochi.db.execute("delete from invites where identity=? and id=?", identity, id)
	else:
		# No existing invitation - send them an invitation (don't add as friend yet)
		mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/invite"}, {"name": a.user.identity.name})
		mochi.db.execute("replace into invites ( identity, id, direction, name, updated ) values ( ?, ?, 'to', ?, ? )", identity, id, name, mochi.time.now())

	return {"data": {}}

# Delete a friend or cancel a sent invitation
def action_delete(a):
	identity = a.user.identity.id
	id = a.input("id")
	if not id:
		return json_error("Missing friend ID")
	if not mochi.valid(id, "entity"):
		return json_error("Invalid friend ID format")

	# Check if this is an existing friendship - notify remote to remove us
	if mochi.db.exists("select id from friends where identity=? and id=?", identity, id):
		mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/remove"})
	# Check if this is a sent invitation that needs to be cancelled on the other side
	elif mochi.db.exists("select id from invites where identity=? and id=? and direction='to'", identity, id):
		mochi.message.send({"from": identity, "to": id, "service": "friends", "event": "friend/cancel"})

	# Clean up all local data for this relationship (both invite directions and friendship)
	mochi.db.execute("delete from invites where identity=? and id=?", identity, id)
	mochi.db.execute("delete from friends where identity=? and id=?", identity, id)

	return {"data": {}}

# Ignore a friend's invitation
def action_ignore(a):
	identity = a.user.identity.id
	id = a.input("id")
	if not id:
		return json_error("Missing friend ID")
	if not mochi.valid(id, "entity"):
		return json_error("Invalid friend ID format")

	mochi.db.execute("delete from invites where identity=? and id=? and direction='from'", identity, id)

	return {"data": {}}

# List friends
def action_list(a):
	identity = a.user.identity.id
	friends = mochi.db.rows("select * from friends where identity=? order by name, id", identity)

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
		return json_error("Search query too long")

	results = []

	# Check if search term is an entity ID (49-51 word characters)
	if mochi.valid(search, "entity"):
		entry = mochi.directory.get(search)
		if entry and entry.get("class") == "person":
			results.append(entry)

	# Check if search term is a fingerprint (9 alphanumeric, with or without hyphens)
	fingerprint = search.replace("-", "")
	if mochi.valid(fingerprint, "fingerprint"):
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
			if mochi.valid(part, "entity"):
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
		return json_error("Search query too long")
	if len(search) < 1:
		return {"data": {"results": []}}

	seen = {}
	unique_results = []

	# Check if search term is an entity ID (49-51 word characters)
	if mochi.valid(search, "entity"):
		entry = mochi.directory.get(search)
		if entry and entry.get("class") == "person":
			if entry["id"] not in seen:
				seen[entry["id"]] = True
				unique_results.append({"id": entry["id"], "name": entry["name"]})

	# Check if search term is a fingerprint (9 alphanumeric, with or without hyphens)
	fingerprint = search.replace("-", "")
	if mochi.valid(fingerprint, "fingerprint"):
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
			if mochi.valid(part, "entity"):
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
	mochi.db.execute("replace into friends ( identity, id, name, class ) values ( ?, ?, ?, 'person' )", identity, e.header("from"), i["name"])

	mochi.db.execute("delete from invites where identity=? and id=?", identity, e.header("from"))
	mochi.service.call("notifications", "send", "accept/accepted", "Friend request accepted", i["name"] + " accepted your friend invitation", "", "/people")

def event_invite(e):
	# Incoming friend invite. The user-configurable `invite_policy` preference
	# decides what happens for unsolicited invites (default: silent store, no
	# notification — invites are a common unsolicited-contact vector).
	# Mutual invites always transition to friends regardless of policy.
	name = e.content("name")
	if not mochi.valid(name, "line") or len(name) > 255:
		return

	identity = resolve_identity(e.header("to"))
	sender = e.header("from")

	# Mutual invite — always connect, regardless of policy.
	if mochi.db.exists("select id from invites where identity=? and id=? and direction='to'", identity, sender):
		mochi.db.execute("replace into friends ( identity, id, name, class ) values ( ?, ?, ?, 'person' )", identity, sender, name)
		mochi.message.send({"from": identity, "to": sender, "service": "friends", "event": "friend/accept"})
		mochi.db.execute("delete from invites where identity=? and id=?", identity, sender)
		mochi.service.call("notifications", "send", "accept/matched", "New friend", name + " is now your friend", "", "/people")
		return

	policy = e.user.preference.get("invite_policy") or "notify"

	if policy == "reject":
		return

	if policy == "accept":
		# Auto-accept: mirror mutual-invite path without writing to invites.
		mochi.db.execute("replace into friends ( identity, id, name, class ) values ( ?, ?, ?, 'person' )", identity, sender, name)
		mochi.message.send({"from": identity, "to": sender, "service": "friends", "event": "friend/accept"})
		mochi.service.call("notifications", "send", "accept/matched", "New friend", name + " is now your friend", "", "/people")
		return

	# silent or notify: store pending invite
	mochi.db.execute("replace into invites ( identity, id, direction, name, updated ) values ( ?, ?, 'from', ?, ? )", identity, sender, name, mochi.time.now())

	if policy == "notify":
		mochi.service.call("notifications", "send", "invite/received", "Friend invitation", name + " invited you to be friends", sender, "/people/invitations")

def event_cancel(e):
	# Remove the invitation from the recipient's side
	mochi.db.execute("delete from invites where identity=? and id=? and direction='from'", resolve_identity(e.header("to")), e.header("from"))

def event_remove(e):
	# Remote friend removed us - clean up local friendship and any pending invites
	identity = resolve_identity(e.header("to"))
	mochi.db.execute("delete from friends where identity=? and id=?", identity, e.header("from"))
	mochi.db.execute("delete from invites where identity=? and id=?", identity, e.header("from"))

def function_get(context, identity, id):
	if not identity:
		return None
	return mochi.db.row("select * from friends where identity=? and id=?", identity, id)

def function_list(context, identity):
	if not identity:
		return []
	return mochi.db.rows("select * from friends where identity=? order by name, id", identity)

# Service function for user search
# Supports searching by name, entity ID, fingerprint (with or without hyphens), or URL
def function_users_search(context, query):
	if not query or len(query) > 200:
		return []

	search = query.strip()
	seen = {}
	unique_results = []

	# Check if search term is an entity ID (49-51 word characters)
	if mochi.valid(search, "entity"):
		entry = mochi.directory.get(search)
		if entry and entry.get("class") == "person":
			if entry["id"] not in seen:
				seen[entry["id"]] = True
				unique_results.append({"id": entry["id"], "name": entry["name"]})

	# Check if search term is a fingerprint (9 alphanumeric, with or without hyphens)
	fingerprint = search.replace("-", "")
	if mochi.valid(fingerprint, "fingerprint"):
		matches = mochi.directory.search("person", "", False, fingerprint=fingerprint)
		for entry in matches:
			if entry["id"] not in seen:
				seen[entry["id"]] = True
				unique_results.append({"id": entry["id"], "name": entry["name"]})

	# Check if search term is a URL (e.g., https://example.com/people/ENTITY_ID)
	if search.startswith("http://") or search.startswith("https://"):
		parts = search.rstrip("/").split("/")
		for part in reversed(parts):
			if mochi.valid(part, "entity"):
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
		return json_error("Missing group ID")

	group = mochi.group.get(id)
	if not group:
		return json_error("Group not found", 404)

	members = mochi.group.members(id)

	# Enrich members with names
	enriched_members = []
	for member in members:
		name = member["member"]
		member_id = member["member"]
		if member["type"] == "user":
			# Check if it's a numeric user ID or an entity ID
			if member_id.isdigit():
				user = mochi.user.get.id(int(member_id))
				if user:
					name = user["username"]
			elif mochi.valid(member_id, "entity"):
				# Entity from directory
				entity = mochi.directory.get(member_id)
				if entity:
					name = entity["name"]
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
		return json_error("Missing group name")
	if not mochi.valid(name, "line"):
		return json_error("Invalid group name")
	if len(name) > 255:
		return json_error("Group name too long")

	description = a.input("description", "")
	if description and not mochi.valid(description, "text"):
		return json_error("Invalid description")

	mochi.group.create(id, name, description)
	return {"data": {"id": id}}

def action_group_update(a):
	id = a.input("id")
	if not id:
		return json_error("Missing group ID")

	group = mochi.group.get(id)
	if not group:
		return json_error("Group not found", 404)

	name = a.input("name", "")
	description = a.input("description", "")

	if not name and not description:
		return json_error("No fields to update")

	if name:
		if not mochi.valid(name, "line"):
			return json_error("Invalid group name")
		if len(name) > 255:
			return json_error("Group name too long")

	if description and not mochi.valid(description, "text"):
		return json_error("Invalid description")

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
		return json_error("Missing group ID")

	group = mochi.group.get(id)
	if not group:
		return json_error("Group not found", 404)

	mochi.group.delete(id)
	return {"data": {}}

def action_group_member_add(a):
	group = a.input("group")
	if not group:
		return json_error("Missing group ID")

	g = mochi.group.get(group)
	if not g:
		return json_error("Group not found", 404)

	member = a.input("member", "").strip()
	if not member or len(member) > 256:
		return json_error("Invalid member ID")

	type = a.input("type", "user")
	if type not in ["user", "group"]:
		return json_error("Invalid member type")

	if type == "user" and not member.isdigit():
		return json_error("Invalid user ID")

	mochi.group.add(group, member, type)
	return {"data": {}}

def action_group_member_remove(a):
	group = a.input("group")
	if not group:
		return json_error("Missing group ID")

	g = mochi.group.get(group)
	if not g:
		return json_error("Group not found", 404)

	member = a.input("member")
	if not member:
		return json_error("Missing member ID")

	mochi.group.remove(group, member)
	return {"data": {}}

# Notification proxy actions - forward to notifications service

def action_notifications_check(a):
	"""Check if a notification subscription exists for this app."""
	result = mochi.service.call("notifications", "subscriptions")
	return {"data": {"exists": len(result) > 0}}

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
		return json_error("Invalid invite_policy")
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
	mochi.db.execute(
		"insert into profiles ( person, profile, accent, updated ) values ( ?, ?, ?, ? ) on conflict ( person ) do update set profile=excluded.profile, accent=excluded.accent, updated=excluded.updated",
		person_id, new_profile, new_accent, mochi.time.now())

def build_information(person_id, entity):
	profile = get_profile_row(person_id)
	style = {}
	if profile.get("accent"):
		style["accent"] = profile["accent"]
	out = {
		"id": entity["id"],
		"fingerprint": entity.get("fingerprint", mochi.entity.fingerprint(person_id)),
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

def action_information(a):
	person_id = a.input("person")
	entity = get_person_entity(person_id)
	if not entity:
		a.error(404, "Person not found")
		return
	return {"data": build_information(person_id, entity)}

def serve_image(a, slot, fallback_slot=""):
	person_id = a.input("person")
	if not get_person_entity(person_id):
		a.error(404, "Person not found")
		return
	att = slot_attachment(person_id, slot)
	if not att and fallback_slot:
		att = slot_attachment(person_id, fallback_slot)
	if not att:
		a.error(404, slot + " not set")
		return
	path = mochi.attachment.path(att["id"])
	if not path:
		a.error(404, slot + " unavailable")
		return
	a.header("Cache-Control", "private, max-age=300")
	a.write_from_file(path)

def action_avatar(a):
	serve_image(a, "avatar")

def action_banner(a):
	serve_image(a, "banner")

def action_favicon(a):
	serve_image(a, "favicon", "avatar")

def set_image(a, slot):
	person_id = a.input("person")
	if not get_person_entity(person_id):
		return json_error("Person not found", 404)
	if not is_person_owner(a, person_id):
		return json_error("Not the owner", 403)
	object = slot_object(person_id, slot)
	saved = mochi.attachment.save(object, "file", [], [], [])
	if not saved or len(saved) == 0:
		return json_error("No file uploaded")
	att = saved[0]
	if att.get("size", 0) > _SLOT_CAPS[slot]:
		mochi.attachment.delete(att["id"])
		return json_error(slot + " too large")
	if not att.get("content_type", "").startswith("image/"):
		mochi.attachment.delete(att["id"])
		return json_error(slot + " must be an image")
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
	person_id = a.input("person")
	if not get_person_entity(person_id):
		a.error(404, "Person not found")
		return
	profile = get_profile_row(person_id)
	style = {}
	if profile.get("accent"):
		style["accent"] = profile["accent"]
	return {"data": style}

def action_style_set(a):
	person_id = a.input("person")
	if not get_person_entity(person_id):
		return json_error("Person not found", 404)
	if not is_person_owner(a, person_id):
		return json_error("Not the owner", 403)
	accent = a.input("accent", "").strip()
	if accent and not valid_hex_colour(accent):
		return json_error("Invalid accent colour")
	upsert_profile(person_id, accent=accent)
	return {"data": {}}

def action_profile_set(a):
	person_id = a.input("person")
	if not get_person_entity(person_id):
		return json_error("Person not found", 404)
	if not is_person_owner(a, person_id):
		return json_error("Not the owner", 403)
	profile = a.input("profile", "")
	if len(profile) > _PROFILE_MAX:
		return json_error("Profile too long")
	upsert_profile(person_id, profile=profile)
	return {"data": {}}

# === Open Graph (rendered profile page) ===

def opengraph_person(params):
	person_id = params.get("entity", "") or params.get("person", "")
	og = {"title": "Mochi", "description": "A person on Mochi", "type": "profile"}
	entity = get_person_entity(person_id)
	if not entity:
		return og
	og["title"] = entity.get("name", "Mochi")
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
	e.stream.write_from_file(path)

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
