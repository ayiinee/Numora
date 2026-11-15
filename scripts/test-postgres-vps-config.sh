#!/usr/bin/env bash
set -euo pipefail
# Start a second, disposable Linux PostgreSQL 16 cluster inside the CI service.
# No host/server provisioning; all files and sockets live in that service container.
if [[ "${GITHUB_ACTIONS:-}" != true || ! "${1:-}" =~ ^[a-f0-9]{12,64}$ || -z "${TEST_DATABASE_TLS_CA_FILE:-}" ]]; then
  echo 'Requires the disposable CI PostgreSQL service and test TLS fixture.' >&2
  exit 1
fi
container_id="$1"
data_dir=/tmp/numora-vps-config-test
socket_dir=/tmp
port=55439
admin() { docker exec -i -u postgres "$container_id" psql -X -h "$socket_dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
cleanup() { docker exec -u postgres "$container_id" pg_ctl -D "$data_dir" -m fast -w stop >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker exec -u postgres "$container_id" initdb -D "$data_dir" -U postgres --auth-local=peer --auth-host=scram-sha-256 >/dev/null
docker cp deploy/postgres/postgresql.conf.example "$container_id:/tmp/numora-vps.conf"
docker cp deploy/postgres/pg_hba.conf.example "$container_id:$data_dir/pg_hba.conf"
docker cp "$TEST_DATABASE_TLS_CA_FILE" "$container_id:/tmp/numora-bootstrap-ca.crt"
docker exec -u root "$container_id" chown postgres:postgres "$data_dir/pg_hba.conf"
docker exec -u root "$container_id" chmod 644 /tmp/numora-bootstrap-ca.crt
docker exec -u postgres "$container_id" pg_ctl -D "$data_dir" -l /tmp/numora-vps-config-test.log -w start \
  -o "-c config_file=/tmp/numora-vps.conf -c hba_file=$data_dir/pg_hba.conf -c port=$port -c unix_socket_directories=$socket_dir -c ssl_cert_file=/tmp/numora-test-server.crt -c ssl_key_file=/tmp/numora-test-server.key" >/dev/null
admin -f /dev/stdin < deploy/postgres/roles.sql
admin -f /dev/stdin < deploy/postgres/database.sql
admin -c "ALTER ROLE numora_api PASSWORD 'TEST_ONLY_bootstrap_password'"
admin -At -c "SELECT count(*)=0 FROM pg_hba_file_rules WHERE error IS NOT NULL" | grep -qx t
admin -At -c "SELECT current_setting('max_connections')='60' AND current_setting('ssl')='on' AND current_setting('listen_addresses')='localhost' AND current_setting('fsync')='on' AND current_setting('full_page_writes')='on' AND current_setting('synchronous_commit')='on'" | grep -qx t
admin -At -c "SELECT rolpassword LIKE 'SCRAM-SHA-256\$%' FROM pg_authid WHERE rolname='numora_api'" | grep -qx t
connection="host=localhost port=$port dbname=numora_production user=numora_api sslmode=verify-full sslrootcert=/tmp/numora-bootstrap-ca.crt"
docker exec -u postgres -e PGPASSWORD=TEST_ONLY_bootstrap_password "$container_id" psql -X "$connection" -v ON_ERROR_STOP=1 -At \
  -c "SELECT session_user='numora_api' AND (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid())" | grep -qx t
if docker exec -u postgres -e PGPASSWORD=TEST_ONLY_bootstrap_password "$container_id" psql -X "host=localhost port=$port dbname=numora_production user=numora_api sslmode=disable" -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'Plaintext unexpectedly allowed' >&2; exit 1
fi
if docker exec -u postgres -e PGPASSWORD=WRONG_TEST_PASSWORD "$container_id" psql -X "$connection" -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'Wrong password unexpectedly allowed' >&2; exit 1
fi
if docker exec "$container_id" psql -X "host=localhost port=$port dbname=postgres user=postgres sslmode=require" -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'TCP administrator unexpectedly allowed' >&2; exit 1
fi
echo 'Linux PostgreSQL config/HBA, TLS, SCRAM and administrative socket checks passed.'
