# Local generator link

`Numora` calls `varian-numora` over its authenticated HTTP contract. The repositories stay separate.

Run `varian-numora` from its root:

```powershell
python -m numora_service --host 127.0.0.1 --port 8770
```

Set matching server-only values in both services. Copy `varian-numora/service.env.example` into its local environment, then set:

```dotenv
NUMORA_GENERATOR_ENABLED=true
NUMORA_GENERATOR_V2_ENABLED=true
NUMORA_GENERATOR_TOKEN=<same random token, at least 32 characters>
COMPUTE_DATABASE_URL=<generator compute database URL>
COMPUTE_SERVICE_PRINCIPAL_ID=<UUID>
```

Set Numora API/worker values in `.env.local`:

```dotenv
NUMORA_GENERATOR_ENABLED=true
NUMORA_GENERATOR_V2_ENABLED=true
NUMORA_GENERATOR_URL=http://127.0.0.1:8770
NUMORA_GENERATOR_TOKEN=<same random token>
```

Verify the link:

```powershell
$h = @{ Authorization = "Bearer $env:NUMORA_GENERATOR_TOKEN" }
Invoke-RestMethod http://127.0.0.1:8770/health/live
Invoke-RestMethod http://127.0.0.1:8770/health/ready -Headers $h
Invoke-RestMethod http://127.0.0.1:8770/api/v2/generators -Headers $h
```

Numora selects `generator-service-v2` per approved mapping and sends generation jobs to `/api/v2/compute/execute`. Do not expose the token to web client or commit local env files.
