#!/bin/bash
# Copyright © 2026 Mochi OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# People P2P dual-instance test suite
# Tests friend invite/accept/cancel/ignore flows between two instances

set -e

CURL="/home/alistair/mochi/test/claude/curl.sh"

PASSED=0
FAILED=0

pass() {
    echo "[PASS] $1"
    ((PASSED++)) || true
}

fail() {
    echo "[FAIL] $1: $2"
    ((FAILED++)) || true
}

echo "=============================================="
echo "People Dual-Instance P2P Test Suite"
echo "=============================================="

# ============================================================================
# SETUP: Get identity IDs and clean up existing friendship
# ============================================================================

echo ""
echo "--- Setup: Get Identities and Clean State ---"

# Get identity IDs from current friends list
RESULT1=$("$CURL" -i 1 -a admin -X GET "/people/friends")
IDENTITY1=$(echo "$RESULT1" | python3 -c "import sys, json; d=json.load(sys.stdin)['data']; print(d['friends'][0]['identity'] if d['friends'] else '')" 2>/dev/null)

RESULT2=$("$CURL" -i 2 -a admin -X GET "/people/friends")
IDENTITY2=$(echo "$RESULT2" | python3 -c "import sys, json; d=json.load(sys.stdin)['data']; print(d['friends'][0]['identity'] if d['friends'] else '')" 2>/dev/null)

# If identities not found from friends, search directory
if [ -z "$IDENTITY1" ]; then
    # Get identity from directory search on instance 2 looking for instance 1
    RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends/search?search=test")
    IDENTITY1=$(echo "$RESULT" | python3 -c "import sys, json; results=json.load(sys.stdin)['data']['results']; print(results[0]['id'] if results else '')" 2>/dev/null)
fi

if [ -z "$IDENTITY2" ]; then
    # Get identity from directory search on instance 1
    RESULT=$("$CURL" -i 1 -a admin -X GET "/people/friends/search?search=User")
    IDENTITY2=$(echo "$RESULT" | python3 -c "import sys, json; results=json.load(sys.stdin)['data']['results']; print([r for r in results if 'User 21' in r['name']][0]['id'] if results else '')" 2>/dev/null)
fi

if [ -z "$IDENTITY1" ] || [ -z "$IDENTITY2" ]; then
    echo "Could not determine identity IDs"
    echo "Identity1: $IDENTITY1"
    echo "Identity2: $IDENTITY2"
    exit 1
fi

echo "Identity 1: $IDENTITY1"
echo "Identity 2: $IDENTITY2"

# Clean up any existing friendship
"$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY2\"}" "/people/friends/delete" >/dev/null 2>&1 || true
"$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY1\"}" "/people/friends/delete" >/dev/null 2>&1 || true

sleep 1

# Verify no friendship exists
RESULT=$("$CURL" -i 1 -a admin -X GET "/people/friends")
if ! echo "$RESULT" | grep -q "\"$IDENTITY2\""; then
    pass "Cleaned up existing friendship on instance 1"
else
    fail "Clean up friendship on instance 1" "$RESULT"
fi

RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends")
if ! echo "$RESULT" | grep -q "\"$IDENTITY1\""; then
    pass "Cleaned up existing friendship on instance 2"
else
    fail "Clean up friendship on instance 2" "$RESULT"
fi

# ============================================================================
# TEST: Send friend invite from instance 1 to instance 2
# ============================================================================

echo ""
echo "--- Friend Invite Test ---"

# Get name for instance 2 user
NAME2="User 21"

RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY2\",\"name\":\"$NAME2\"}" "/people/friends/create")
if echo "$RESULT" | grep -q '"data":{}'; then
    pass "Send friend invite from instance 1 to instance 2"
else
    fail "Send friend invite" "$RESULT"
fi

sleep 2

# Check that instance 1 has a sent invite
RESULT=$("$CURL" -i 1 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q '"sent":\[{'; then
    pass "Instance 1 has sent invite"
else
    fail "Instance 1 has sent invite" "$RESULT"
fi

# Check that instance 2 received the invite
RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q '"received":\[{'; then
    pass "Instance 2 received invite"
else
    fail "Instance 2 received invite" "$RESULT"
fi

# ============================================================================
# TEST: Accept friend invite
# ============================================================================

echo ""
echo "--- Accept Friend Invite Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY1\"}" "/people/friends/accept")
if echo "$RESULT" | grep -q '"data":{}'; then
    pass "Instance 2 accepts friend invite"
else
    fail "Accept friend invite" "$RESULT"
fi

sleep 2

# Verify both are now friends
RESULT=$("$CURL" -i 1 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q "\"id\":\"$IDENTITY2\""; then
    pass "Instance 1 now has instance 2 as friend"
else
    fail "Instance 1 has friend" "$RESULT"
fi

RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q "\"id\":\"$IDENTITY1\""; then
    pass "Instance 2 now has instance 1 as friend"
else
    fail "Instance 2 has friend" "$RESULT"
fi

# Verify no pending invites on either side
RESULT=$("$CURL" -i 1 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q '"sent":\[\]'; then
    pass "Instance 1 has no pending sent invites"
else
    fail "Instance 1 sent invites cleared" "$RESULT"
fi

RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q '"received":\[\]'; then
    pass "Instance 2 has no pending received invites"
else
    fail "Instance 2 received invites cleared" "$RESULT"
fi

# ============================================================================
# TEST: Unfriend
# ============================================================================

echo ""
echo "--- Unfriend Test ---"

RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY2\"}" "/people/friends/delete")
if echo "$RESULT" | grep -q '"data":{}'; then
    pass "Instance 1 unfriends instance 2"
else
    fail "Unfriend" "$RESULT"
fi

# Note: Unfriend is local-only, doesn't send P2P event to remove from other side
RESULT=$("$CURL" -i 1 -a admin -X GET "/people/friends")
if ! echo "$RESULT" | grep -q "\"id\":\"$IDENTITY2\""; then
    pass "Instance 1 no longer has instance 2 as friend"
else
    fail "Instance 1 removed friend" "$RESULT"
fi

# Clean up instance 2 as well
"$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY1\"}" "/people/friends/delete" >/dev/null 2>&1 || true

sleep 1

# ============================================================================
# TEST: Cancel sent invite
# ============================================================================

echo ""
echo "--- Cancel Sent Invite Test ---"

# Send invite
RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY2\",\"name\":\"$NAME2\"}" "/people/friends/create")
if echo "$RESULT" | grep -q '"data":{}'; then
    pass "Send friend invite for cancel test"
else
    fail "Send invite for cancel test" "$RESULT"
fi

sleep 2

# Verify instance 2 received it
RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q '"received":\[{'; then
    pass "Instance 2 received invite (for cancel test)"
else
    fail "Instance 2 received invite for cancel" "$RESULT"
fi

# Cancel the invite from instance 1
RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY2\"}" "/people/friends/delete")
if echo "$RESULT" | grep -q '"data":{}'; then
    pass "Instance 1 cancels sent invite"
else
    fail "Cancel sent invite" "$RESULT"
fi

sleep 2

# Verify invite removed from both sides
RESULT=$("$CURL" -i 1 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q '"sent":\[\]'; then
    pass "Instance 1 sent invites cleared after cancel"
else
    fail "Instance 1 sent invites after cancel" "$RESULT"
fi

RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q '"received":\[\]'; then
    pass "Instance 2 received invite removed after cancel"
else
    fail "Instance 2 received invites after cancel" "$RESULT"
fi

# ============================================================================
# TEST: Ignore received invite
# ============================================================================

echo ""
echo "--- Ignore Invite Test ---"

# Send invite
RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY2\",\"name\":\"$NAME2\"}" "/people/friends/create")
if echo "$RESULT" | grep -q '"data":{}'; then
    pass "Send friend invite for ignore test"
else
    fail "Send invite for ignore test" "$RESULT"
fi

sleep 2

# Instance 2 ignores the invite
RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY1\"}" "/people/friends/ignore")
if echo "$RESULT" | grep -q '"data":{}'; then
    pass "Instance 2 ignores invite"
else
    fail "Ignore invite" "$RESULT"
fi

# Verify invite removed from instance 2
RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q '"received":\[\]'; then
    pass "Instance 2 received invite removed after ignore"
else
    fail "Instance 2 received invites after ignore" "$RESULT"
fi

# Note: Instance 1 still shows sent invite (ignore doesn't notify sender)
# Clean up instance 1's sent invite
"$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY2\"}" "/people/friends/delete" >/dev/null 2>&1 || true

sleep 1

# ============================================================================
# TEST: Mutual invite (auto-accept)
# ============================================================================

echo ""
echo "--- Mutual Invite Test (Auto-Accept) ---"

# Get name for instance 1 user
NAME1="test"

# Instance 1 sends invite to instance 2
RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY2\",\"name\":\"$NAME2\"}" "/people/friends/create")
if echo "$RESULT" | grep -q '"data":{}'; then
    pass "Instance 1 sends mutual invite"
else
    fail "Instance 1 mutual invite" "$RESULT"
fi

sleep 1

# Instance 2 also sends invite to instance 1 (should auto-accept)
RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"id\":\"$IDENTITY1\",\"name\":\"$NAME1\"}" "/people/friends/create")
if echo "$RESULT" | grep -q '"data":{}'; then
    pass "Instance 2 sends mutual invite (triggers auto-accept)"
else
    fail "Instance 2 mutual invite" "$RESULT"
fi

sleep 2

# Verify both are now friends (auto-accepted)
RESULT=$("$CURL" -i 1 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q "\"id\":\"$IDENTITY2\""; then
    pass "Instance 1 is friends after mutual invite"
else
    fail "Instance 1 friends after mutual" "$RESULT"
fi

RESULT=$("$CURL" -i 2 -a admin -X GET "/people/friends")
if echo "$RESULT" | grep -q "\"id\":\"$IDENTITY1\""; then
    pass "Instance 2 is friends after mutual invite"
else
    fail "Instance 2 friends after mutual" "$RESULT"
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "=============================================="
echo "Results: $PASSED passed, $FAILED failed"
echo "=============================================="

if [ $FAILED -gt 0 ]; then
    exit 1
fi
