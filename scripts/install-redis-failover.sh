#!/usr/bin/env bash
set -euo pipefail
umask 077

# sudo env NUMORA_NODE_BIN="$(command -v node)" bash /opt/numora/scripts/install-redis-failover.sh
if [[ "${EUID}" != 0 || -z "${SUDO_USER:-}" || "${SUDO_USER}" == root ]]; then
  echo 'Jalankan dari akun admin-numora menggunakan sudo env NUMORA_NODE_BIN=... bash skrip ini.' >&2
  exit 1
fi
redis_user="${SUDO_USER}"
redis_node="${NUMORA_NODE_BIN:-}"
redis_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
# Restrict characters before embedding paths/user in systemd and sudoers syntax.
if [[ ! "${redis_user}" =~ ^[a-z_][a-z0-9_-]*$ ||
      ! "${redis_node}" =~ ^/[a-zA-Z0-9_./+-]+$ || ! -x "${redis_node}" ||
      ! "${redis_repo}" =~ ^/[a-zA-Z0-9_./+-]+$ ]]; then
  echo 'Akun/path Node/path repo tidak valid. Gunakan path absolut Node dari nvm.' >&2
  exit 1
fi
if [[ ! -f "${redis_repo}/scripts/switch-redis.mjs" ||
      ! -f "${redis_repo}/scripts/redis-failover.mjs" ]]; then
  echo 'File failover belum lengkap; pull main terlebih dahulu.' >&2
  exit 1
fi
command -v visudo >/dev/null
command -v flock >/dev/null
getent group systemd-journal >/dev/null
redis_uid="$(id -u "${redis_user}")"
redis_group="$(id -gn "${redis_user}")"
if [[ ! -d /etc/numora || "$(stat -c %u /etc/numora/production.env)" != "${redis_uid}" ||
      "$(stat -c %a /etc/numora/production.env)" != 600 ]]; then
  echo '/etc/numora/production.env harus milik akun ini dan memiliki izin 600.' >&2
  exit 1
fi
# Validate access as the runtime user; do not change ownership of existing secrets.
/usr/sbin/runuser -u "${redis_user}" -- test -w /etc/numora
/usr/sbin/runuser -u "${redis_user}" -- test -x "${redis_node}"

redis_sudoers="$(mktemp /etc/sudoers.d/.numora-redis-failover.XXXXXX)"
trap 'rm -f -- "${redis_sudoers}"' EXIT
cat > "${redis_sudoers}" <<EOF
# Only the three exact unit operations used by the failover command.
${redis_user} ALL=(root) NOPASSWD: /usr/bin/systemctl stop numora-api numora-worker, /usr/bin/systemctl reset-failed numora-api numora-worker, /usr/bin/systemctl start numora-api numora-worker
EOF
chmod 440 "${redis_sudoers}"
visudo -cf "${redis_sudoers}" >/dev/null
install -o root -g root -m 440 "${redis_sudoers}" /etc/sudoers.d/numora-redis-failover

cat > /etc/systemd/system/numora-redis-failover.service <<EOF
[Unit]
Description=Numora Redis quota failover check
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=${redis_user}
Group=${redis_group}
SupplementaryGroups=systemd-journal
WorkingDirectory=${redis_repo}
ExecStart=${redis_node} ${redis_repo}/scripts/switch-redis.mjs auto
UMask=0077
# Individual probes/commands have deadlines; do not kill a switch mid-rollback.
TimeoutStartSec=0
EOF
chmod 644 /etc/systemd/system/numora-redis-failover.service
cat > /etc/systemd/system/numora-redis-failover.timer <<'EOF'
[Unit]
Description=Check Numora Redis quota every minute

[Timer]
OnBootSec=30s
OnUnitInactiveSec=60s
AccuracySec=5s
Unit=numora-redis-failover.service

[Install]
WantedBy=timers.target
EOF
chmod 644 /etc/systemd/system/numora-redis-failover.timer
systemd-analyze verify /etc/systemd/system/numora-redis-failover.service /etc/systemd/system/numora-redis-failover.timer
systemctl daemon-reload
systemctl enable --now numora-redis-failover.timer
echo 'Timer failover aktif. Lihat: sudo journalctl -u numora-redis-failover -n 40 --no-pager'
