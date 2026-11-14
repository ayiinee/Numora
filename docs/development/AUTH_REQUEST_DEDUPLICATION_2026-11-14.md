# Deduplikasi verifikasi Auth dalam satu request HTTP

**ENGINEERING DECISION — 14 November 2026:** lanjutkan audit Q33 dengan
deduplikasi `Supabase.auth.getUser(token)` pada lingkup satu request HTTP.
Baseline `main` adalah `7288b4b3`; PR ini terpisah dari PR optimasi query lainnya.

## Perilaku

Middleware bootstrap membentuk konteks AsyncLocalStorage per request. Verifikasi
yang sedang berjalan maupun sudah berhasil dipakai bersama hanya untuk token
yang sama dan instance IdentityService yang sama. Request/provider/token berbeda
memiliki hasil terpisah. Token tetap harus lolos format Bearer dan verifikasi
Supabase; decode JWT tidak digunakan sebagai pengganti autentikasi.

Konteks ditutup dan referensi cache dibuang pada response `finish` atau `close`.
Kelanjutan async setelah response tidak memakai hasil cache. Pemanggilan di luar
HTTP, termasuk WebSocket/worker/direct service, tetap melakukan verifikasi setiap
kali. Tidak ada cache lintas request, TTL global, Redis, token log atau perubahan
Supabase session/refresh. Failure in-flight dibagi kepada pemanggil paralel,
kemudian dikeluarkan agar explicit retry dapat memverifikasi ulang.

Yang dibagi hanya identitas Auth. `getProfile/me`, status ACTIVE, subrole Admin,
capability, verifikasi guru dan affiliation/membership tetap dibaca dari database.
Mutasi profil tetap menggunakan predicate akun ACTIVE dan mengembalikan profil
terbaru. Perubahan role/status saat token masih valid tetap berlaku. Revocation
token diperiksa kembali pada request berikutnya; request yang sedang berjalan
memakai identitas yang diverifikasi dalam request tersebut.

Contoh caller existing yang mendapat manfaat:

- Registrasi: authenticate sebelum insert, lalu getProfile sesudah insert.
- Rename/remove foto: owner check, mutasi, lalu pembacaan profil terbaru.
- Upload foto: guard sebelum interceptor, owner check, storage/mutasi dan profil.

Dashboard/notifikasi yang sudah menghindari Auth berulang tidak diklaim mendapat
pengurangan tambahan. Tidak ada migrasi, environment baru atau perubahan kontrak.

## Pengukuran lokal

Suite HTTP menjalankan aplikasi Nest yang dikonfigurasi melalui bootstrap asli,
guard dan controller fixture, SDK Supabase asli, serta provider HTTP localhost.
Provider menyajikan metadata sintetis 4 KiB; tidak ada token atau koneksi Auth
cloud yang digunakan. Angka byte berikut adalah jumlah body respons Auth
localhost tanpa kompresi, bukan TLS/DB traffic atau tagihan Supabase.

| Skenario fixture                   |       Sebelum (`7288b4b3`) |                  Sesudah |
| ---------------------------------- | -------------------------: | -----------------------: |
| Guard + dua authenticate berurutan |  3 call / 12.891 byte body | 1 call / 4.297 byte body |
| Guard + 20 authenticate paralel    | 21 call / 90.237 byte body | 1 call / 4.297 byte body |

Pengurangan adalah 66,67% dan 95,24% pada skenario tersebut, bukan estimasi
persentase seluruh pemakaian Auth/egress proyek. Tiga tes perilaku HTTP juga
lulus pada baseline; tes batas call sengaja gagal, lalu lulus setelah optimasi.
Tidak ada klaim penurunan live cloud tanpa trace/Usage sesudah rollout.

## Verifikasi

61 tes pada lima file lulus tanpa skip: HTTP dedup/isolasi/revocation/header,
IdentityService, Admin guard/capability dan integrasi profil. Enam regresi unit
baru memeriksa concurrent/sequential sharing, request/provider/token isolation,
status/role/affiliation yang berubah, retry failure, finish/close serta panggilan
di luar HTTP. Empat tes HTTP baru menggunakan SDK dan koneksi provider lokal.
Typecheck/build API dan ESLint/Prettier diperiksa sebelum PR.

```powershell
pnpm --filter @tka/api exec vitest run src/modules/identity/authentication-request.integration.spec.ts src/modules/identity/identity.service.spec.ts src/modules/identity/admin.guard.spec.ts src/modules/identity/admin-permissions.spec.ts src/modules/identity/profile.integration.spec.ts
pnpm --filter @tka/api typecheck
pnpm --filter @tka/api build
```

Tes integrasi profil membutuhkan `NODE_ENV=test`, database localhost terpisah
dalam `TEST_DATABASE_URL` yang sudah dimigrasikan, dan DATABASE_URL runtime
cloud yang dikosongkan. Dua suite Auth tidak membutuhkan database/provider cloud.

Sesudah review/merge, restart/deploy API dan ukur jumlah getUser per request
serta error 401/403 pada skenario yang sebanding. Batas otorisasi DB dan deadline
assessment tidak berubah. Rollback melalui revert PR dan redeploy API.
