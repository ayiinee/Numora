#!/usr/bin/env bash
set -euo pipefail
# Disposable Linux CI tooling only. No repository/provider initialization or credentials.
if [[ "${GITHUB_ACTIONS:-}" != true || -z "${RUNNER_TEMP:-}" || -z "${GITHUB_ENV:-}" || "$(uname -m)" != x86_64 ]]; then
  echo 'Requires the disposable Linux x86_64 CI runner.' >&2; exit 1
fi
umask 077
tool_dir="$(mktemp -d "$RUNNER_TEMP/numora-restic.XXXXXX")"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 10 --max-time 120 --retry 2 \
  'https://github.com/restic/restic/releases/download/v0.19.1/restic_0.19.1_linux_amd64.bz2' -o "$tool_dir/restic.bz2"
echo 'f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c  '"$tool_dir/restic.bz2" | sha256sum --check --status
bzip2 -d "$tool_dir/restic.bz2"
chmod 700 "$tool_dir/restic"
"$tool_dir/restic" version
echo "TEST_RESTIC_PATH=$tool_dir/restic" >> "$GITHUB_ENV"
