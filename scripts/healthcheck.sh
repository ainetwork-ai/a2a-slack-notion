#!/usr/bin/env bash
curl -fs http://localhost:3000/api/health >/dev/null && echo "OK" || { echo "FAIL"; exit 1; }
