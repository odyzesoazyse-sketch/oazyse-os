#!/bin/bash
export PATH="/usr/local/bin:/usr/local/Cellar/node/25.5.0/bin:$PATH"
cd "$(dirname "$0")"
exec /usr/local/Cellar/node/25.5.0/bin/node /usr/local/bin/npx ts-node src/server/Server.ts
