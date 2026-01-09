# Mochi friends app
# REST-style JSON responses version with default identity for API calls
# Copyright Alistair Cunningham 2024-2025

def database_create():
	mochi.db.execute("create table if not exists friends ( identity text not null, id text not null, name text not null, class text not null, primary key ( identity, id ) )")
	mochi.db.execute("create index if not exists friends_id on friends( id )")
	mochi.db.execute("create index if not exists friends_name on friends( name )")
	mochi.db.execute("create table if not exists invites ( identity text not null, id text not null, direction text not null, name text not null, updated integer not null, primary key ( identity, id, direction ) )")
	mochi.db.execute("create index if not exists invites_identity_id on invites( identity, id )")
	mochi.db.execute("create index if not exists invites_direction on invites( direction )")

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
		all_people = mochi.directory.search("person", "", False)
		for entry in all_people:
			entry_fp = entry.get("fingerprint", "").replace("-", "")
			if entry_fp == fingerprint:
				# Avoid duplicates
				found = False
				for r in results:
					if r.get("id") == entry.get("id"):
						found = True
						break
				if not found:
					results.append(entry)
				break

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
		all_people = mochi.directory.search("person", "", False)
		for entry in all_people:
			entry_fp = entry.get("fingerprint", "").replace("-", "")
			if entry_fp == fingerprint:
				if entry["id"] not in seen:
					seen[entry["id"]] = True
					unique_results.append({"id": entry["id"], "name": entry["name"]})
				break

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
	mochi.service.call("notifications", "create", "friends", "accept", e.header("from"), i["name"] + " accepted your friend invitation", "/people")

def event_invite(e):
	name = e.content("name")
	if not mochi.valid(name, "line") or len(name) > 255:
		return

	identity = resolve_identity(e.header("to"))
	if mochi.db.exists("select id from invites where identity=? and id=? and direction='to'", identity, e.header("from")):
		# Mutual invite - add friend immediately to avoid race condition
		mochi.db.execute("replace into friends ( identity, id, name, class ) values ( ?, ?, ?, 'person' )", identity, e.header("from"), name)
		mochi.message.send({"from": identity, "to": e.header("from"), "service": "friends", "event": "friend/accept"})
		mochi.db.execute("delete from invites where identity=? and id=?", identity, e.header("from"))
		mochi.service.call("notifications", "create", "friends", "accept", e.header("from"), name + " is now your friend", "/people")
	else:
		mochi.db.execute("replace into invites ( identity, id, direction, name, updated ) values ( ?, ?, 'from', ?, ? )", identity, e.header("from"), name, mochi.time.now())

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
		all_people = mochi.directory.search("person", "", False)
		for entry in all_people:
			entry_fp = entry.get("fingerprint", "").replace("-", "")
			if entry_fp == fingerprint:
				if entry["id"] not in seen:
					seen[entry["id"]] = True
					unique_results.append({"id": entry["id"], "name": entry["name"]})
				break

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
			else:
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

	if name:
		if not mochi.valid(name, "line"):
			return json_error("Invalid group name")
		if len(name) > 255:
			return json_error("Group name too long")

	if description and not mochi.valid(description, "text"):
		return json_error("Invalid description")

	mochi.group.update(id, name=name, description=description)
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

	member = a.input("member")
	if not member:
		return json_error("Missing member ID")

	type = a.input("type", "user")
	if type not in ["user", "group"]:
		return json_error("Invalid member type")

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
