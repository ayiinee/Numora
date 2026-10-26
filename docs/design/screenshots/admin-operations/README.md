# Galeri Admin Operasional — 7 October 2026

Evidence redesign AdminLTE khusus Operations. Screenshot memakai provider/API fixture lokal, bukan data Cloud atau bank final. Tidak ada demo yang ditambahkan ke database. Desktop 1440 px memakai list/detail berdampingan; mobile 320 px memakai panel yang ditumpuk. Tablet 768 px juga diuji dalam suite.

| Halaman                    | Mobile 320 px              | Desktop 1440 px             |
| -------------------------- | -------------------------- | --------------------------- |
| Sekolah & credential       | [Sekolah](schools-320.png) | [Sekolah](schools-1440.png) |
| Detail pengguna/membership | [Pengguna](users-320.png)  | [Pengguna](users-1440.png)  |
| Detail kelas/roster        | [Kelas](classes-320.png)   | [Kelas](classes-1440.png)   |

Reproduksi dari root repository, tanpa koneksi database:

```powershell
$env:NUMORA_E2E_WEBPACK='true'
pnpm --filter @tka/web exec playwright test e2e/admin-operations.spec.ts e2e/admin.spec.ts --grep 'Operations removes|Operations school workspace'
```

Output lokal ada di `.tmp/admin-operations-*`. Lihat [scope dan hasil validasi](../../ADMIN_OPERATIONS_UX_2026-10-07.md).
