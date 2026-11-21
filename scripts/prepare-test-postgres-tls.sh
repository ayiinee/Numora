#!/usr/bin/env bash
set -euo pipefail

# Only the disposable GitHub Actions PostgreSQL service, never a deployment server.
if [[ "${GITHUB_ACTIONS:-}" != "true" || ! "${1:-}" =~ ^[a-f0-9]{12,64}$ || -z "${GITHUB_ENV:-}" ]]; then
  echo 'This helper requires the disposable CI PostgreSQL service.' >&2
  exit 1
fi
container_id="$1"
fixture_dir="$(mktemp -d "${RUNNER_TEMP:?}/numora-tls.XXXXXX")"
umask 077
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=Numora TEST ONLY CA' \
  -keyout "$fixture_dir/ca.key" -out "$fixture_dir/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj '/CN=localhost' \
  -keyout "$fixture_dir/server.key" -out "$fixture_dir/server.csr" >/dev/null 2>&1
printf 'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n' > "$fixture_dir/extensions"
openssl x509 -req -in "$fixture_dir/server.csr" -CA "$fixture_dir/ca.crt" -CAkey "$fixture_dir/ca.key" \
  -CAcreateserial -days 2 -extfile "$fixture_dir/extensions" -out "$fixture_dir/server.crt" >/dev/null 2>&1
docker cp "$fixture_dir/server.key" "$container_id:/tmp/numora-test-server.key"
docker cp "$fixture_dir/server.crt" "$container_id:/tmp/numora-test-server.crt"
docker exec -u root "$container_id" chown postgres:postgres /tmp/numora-test-server.key /tmp/numora-test-server.crt
docker exec -u root "$container_id" chmod 600 /tmp/numora-test-server.key
docker exec -u postgres "$container_id" psql -U postgres -d numora_test -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET ssl_cert_file='/tmp/numora-test-server.crt'"
docker exec -u postgres "$container_id" psql -U postgres -d numora_test -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET ssl_key_file='/tmp/numora-test-server.key'"
docker exec -u postgres "$container_id" psql -U postgres -d numora_test -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET ssl='on'"
docker exec -u postgres "$container_id" psql -U postgres -d numora_test -v ON_ERROR_STOP=1 -c 'SELECT pg_reload_conf()'
echo "TEST_DATABASE_TLS_URL=postgres://postgres:test_only@localhost:5432/numora_test?sslmode=verify-full" >> "$GITHUB_ENV"
echo "TEST_DATABASE_TLS_CA_FILE=$fixture_dir/ca.crt" >> "$GITHUB_ENV"
