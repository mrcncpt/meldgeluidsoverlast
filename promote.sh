#!/usr/bin/env bash
# promote.sh - Kopieer alle files van mrcncpt/klacht-eindhoven (dev) naar mrcncpt/meldgeluidsoverlast (prod)
#
# Gebruik:
#   export GITHUB_TOKEN=github_pat_...   # PAT met Contents:read+write op beide repos
#   ./promote.sh                          # promoot dev -> prod
#   ./promote.sh "release v1.9 - bugfix"  # met custom commit message
#
# Wat het doet:
#   1. Haalt alle 11 bron-files op uit klacht-eindhoven main
#   2. Pusht elke file naar meldgeluidsoverlast main (CNAME blijft staan)
#   3. Skipt als file niet veranderd is

set -euo pipefail

if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "ERROR: GITHUB_TOKEN niet gezet"
    echo "Maak een fine-grained PAT met Contents:read+write op beide repos en zet:"
    echo "  export GITHUB_TOKEN=github_pat_..."
    exit 1
fi

DEV_REPO="mrcncpt/klacht-eindhoven"
PROD_REPO="mrcncpt/meldgeluidsoverlast"
COMMIT_MSG="${1:-Promote from dev (klacht-eindhoven) to prod}"

FILES=(
    "klacht-eindhoven.user.js"
    "manifest-binnen.json"
    "manifest-buiten.json"
    "manifest-slaap.json"
    "binnen.html"
    "buiten.html"
    "slaap.html"
    "install.html"
    "start.html"
    "index.html"
    "klacht.html"
)

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "=== Promote: $DEV_REPO -> $PROD_REPO ==="
echo "Commit msg: $COMMIT_MSG"
echo ""

PUSHED=0
SKIPPED=0
FAILED=0

for f in "${FILES[@]}"; do
    # 1. Download dev version (raw)
    dev_url="https://raw.githubusercontent.com/$DEV_REPO/main/$f"
    if ! curl -fsSL "$dev_url" -o "$TMPDIR/$f"; then
        echo "  FAIL  $f  (download from dev)"
        FAILED=$((FAILED + 1))
        continue
    fi

    # 2. Get prod SHA (for update) and current content
    prod_meta=$(curl -fsSL \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/$PROD_REPO/contents/$f" 2>/dev/null || echo '{}')

    prod_sha=$(echo "$prod_meta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || echo "")

    # 3. Compare content (skip if unchanged)
    dev_b64=$(base64 -w 0 < "$TMPDIR/$f")
    if [ -n "$prod_sha" ]; then
        prod_b64_raw=$(echo "$prod_meta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("content","").replace("\n",""))' 2>/dev/null || echo "")
        if [ "$dev_b64" = "$prod_b64_raw" ]; then
            printf "  skip  %-32s  (unchanged)\n" "$f"
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
    fi

    # 4. PUT to prod
    if [ -n "$prod_sha" ]; then
        body=$(python3 -c "import json; print(json.dumps({'message': '$COMMIT_MSG: $f', 'content': '$dev_b64', 'sha': '$prod_sha', 'branch': 'main'}))")
    else
        body=$(python3 -c "import json; print(json.dumps({'message': '$COMMIT_MSG: $f', 'content': '$dev_b64', 'branch': 'main'}))")
    fi

    response=$(curl -fsSL -X PUT \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        -H "Content-Type: application/json" \
        -d "$body" \
        "https://api.github.com/repos/$PROD_REPO/contents/$f" 2>/dev/null) || {
            echo "  FAIL  $f  (push to prod)"
            FAILED=$((FAILED + 1))
            continue
        }

    commit_sha=$(echo "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["commit"]["sha"][:7])' 2>/dev/null || echo "?")
    printf "  push  %-32s  commit %s\n" "$f" "$commit_sha"
    PUSHED=$((PUSHED + 1))
done

echo ""
echo "=== Promote complete ==="
echo "  Pushed:  $PUSHED"
echo "  Skipped: $SKIPPED  (no change)"
echo "  Failed:  $FAILED"
echo ""
echo "Live: https://meldgeluidsoverlast.nl/  (na ~1 min Pages-build)"
