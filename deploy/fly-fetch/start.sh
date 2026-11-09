#!/bin/sh
set -eu

# Network rules are mandatory; never start Fetch on a host without NET_ADMIN.
# Fly Proxy terminates HTTPS externally, only its established return traffic is allowed.
nft -f /app/deploy/fly-fetch/egress.nft
exec su -s /bin/sh -c 'exec node /app/scripts/mcp-public-stdio-bridge.mjs' dtsc-fetch
