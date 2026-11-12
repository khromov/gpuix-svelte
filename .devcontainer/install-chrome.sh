#!/usr/bin/env bash
set -euo pipefail

if [ -x /opt/google/chrome/chrome ]; then
	echo "Chrome already present at /opt/google/chrome/chrome, skipping."
	exit 0
fi

# Google ships Chrome for Linux on amd64 only, and a missing browser should not fail the build.
arch="$(dpkg --print-architecture)"
if [ "$arch" != "amd64" ]; then
	echo "Google Chrome for Linux is amd64-only; detected '$arch', skipping." >&2
	exit 0
fi

deb="$(mktemp --suffix=.deb)"
curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o "$deb"
apt-get update
apt-get install -y --no-install-recommends "$deb"
rm -f "$deb"
rm -rf /var/lib/apt/lists/*
