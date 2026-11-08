# JOB-06 — pengujian rantai pada satu release SHA

**ENGINEERING IMPLEMENTATION — 4 November 2026:** [Smoke tiga subrole Admin](ADMIN_ROLE_PARITY_CONNECTED_2026-11-04.md) menambah Operations/Content pada fixture lokal dan satu kasus serial yang memeriksa landing, struktur terbatas serta penolakan HTTP. Seluruh required checks lama dan guard satu clean SHA tetap dipertahankan. Hasil historis di bawah bukan bukti otomatis untuk SHA baru.

**ENGINEERING DECISION — 3 Oktober 2026, instruksi Aini:** pengujian browser terhubung dan perbaikan defect yang terbukti dilakukan dalam PR baru. Farel tetap DRI regression frontend; Salim tetap pemberi acceptance independen. Keputusan akademik/product OPEN tidak ditutup oleh pengujian ini.

## Status dan bukti

**Engineering chain lokal: PASS. Acceptance JOB-06 untuk trial: belum selesai.**

Run production-build pada **`af850c47e091d33783dd75de4658bc7d24d2af3e`** menjalankan tiga kasus connected, seluruhnya lulus tanpa skip. Lihat [artifact lokal yang disanitasi](evidence/JOB06_LOCAL_2026-10-03.json). Next.js production build, API NestJS lengkap, PostgreSQL dan Redis terisolasi berjalan bersama. Tidak ada mock response API produk atau override service/guard/domain. Identitas memakai **email fixture pada batas Supabase Auth**, bukan login Google; Nest melakukan lookup role, verification, membership dan ownership dari PostgreSQL. Endpoint fixture hanya dipasang oleh proses harness, bukan API production.

Runner membangun ulang database/API/web dan memigrasikan DB khusus, memeriksa checkout bersih serta SHA sebelum/sesudah run. Bukti run CI terbaru selalu menyebut SHA checkout aktual, termasuk synthetic merge SHA GitHub bila digunakan. Jangan menggantinya dengan head PR/deployment SHA lain. Hasil CI PR #34–36/#42–44 tidak dirangkai menjadi acceptance kandidat ini; seluruh rantai harus dijalankan ulang bersama.

| Pemeriksaan pada satu run terhubung                                                                                           | Hasil                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Admin UI membuat sekolah/token → Guru UI verifikasi/create class → Student UI join                                            | PASS                                                      |
| Mandiri → Sekolah, persistence setelah refresh, repeat/concurrent join dan satu kelas                                         | PASS                                                      |
| Drill 10 PG; locked Level 2 ditolak API; kunci/pembahasan tidak ada sebelum submit                                            | PASS                                                      |
| Koneksi browser putus saat save → Belum tersimpan → explicit retry → ACK server; refresh/sesi baru memuat jawaban             | PASS                                                      |
| Submit 80 dan concurrent/repeated submit; jawaban setelah submit ditolak                                                      | PASS                                                      |
| Teacher UI latest/best 80/80 → retry varian berbeda 70/80; history terpisah, unlock permanen                                  | PASS                                                      |
| Level 2 dimainkan, submit 0 dan Teacher UI latest/best 0/0                                                                    | PASS dengan paket TEST ONLY DEMO                          |
| DB menyimpan 3 attempt, 3 completion event, 30 pinned items serta snapshot kelas/policy; result awal tetap 80                 | PASS                                                      |
| Token TTL 72 jam, revoke/reissue/expiry/single-use race; join race; anonymous/disabled/wrong role/foreign resource API denial | PASS; expiry memakai waktu fixture DB                     |
| Direct URL/refresh lintas Student/Teacher/Admin, unverified Teacher, foreign-class error, logout/re-auth/session ditolak API  | PASS dengan identitas fixture                             |
| Mandiri Drill, availability PvP/policy-pending leaderboard PvP kedua afiliasi, leaderboard kelas menolak Mandiri              | PASS untuk perilaku existing; bukan aktivasi policy final |

**Defect JOB06-DEF-01 — fixed:** save saat browser sudah offline dijeda oleh React Query, sehingga UI tertahan di `Menyimpan…` dan tidak menawarkan retry. Save mutation sekarang memakai `networkMode: 'always'`: kegagalan koneksi segera masuk state `Belum tersimpan`/`Coba simpan lagi`. Submit tetap tertahan hingga ACK yang cocok. Tes komponen mematikan online manager dan browser connected memutus koneksi sungguhan. Perubahan pada komponen assessment bersama tidak mengubah endpoint, scoring, deadline atau desain.

## Menjalankan ulang

Gunakan Node/pnpm sesuai engines, Chromium Playwright, PostgreSQL lokal dan Redis lokal. **Redis 7** dipakai CI. Redis 6.0 lokal cukup untuk code limiter chain ini tetapi gagal pada satu tes transport PvP/BullMQ dalam suite terpisah; kegagalan itu tidak dihitung lulus atau skip. Suite lengkap tetap harus lulus dengan Redis 7 di CI.

Database harus khusus `numora_test_job06` atau `numora_test_job06_<suffix>` dengan `sslmode=disable`. Harness menolak host cloud, DB lain, Redis cloud dan checkout belum di-commit. Credential layanan dipilih dari variabel `TEST_*`, bukan `.env`. API dan Next dinyalakan tanpa worker/shared Upstash. Buat DB lokal kosong terlebih dahulu; migrasi diterapkan runner.

```powershell
$env:TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:55440/numora_test_job06?sslmode=disable'
$env:TEST_REDIS_URL = 'redis://127.0.0.1:6386'
$env:RELEASE_SHA = git rev-parse HEAD
pnpm --filter @tka/web exec playwright install chromium
pnpm test:release-chain
```

`RELEASE_SHA` opsional; bila diisi harus sama dengan checkout. Port 3400–3402 harus kosong. Output `.tmp/job06-evidence/connected.json` berisi SHA, waktu, hasil checks dan batas acceptance, tanpa PII nyata/token/storage state. Artifact CI `job06-connected-<workflow SHA>` hanya mengunggah JSON tersebut. PASS membutuhkan semua tiga kasus selesai dan checkout tetap sama; dependency hilang atau run gagal tidak menjadi PASS. Direktori hasil browser terpisah dari suite E2E fixture existing.

Setiap run membuat actor baru dan paket Level 2 **TEST ONLY DEMO** di DB tes. Paket hanya menguji continuation dengan versi demo existing; bukan review/publikasi kandidat #42 atau seed shared Development. Tidak ada migrasi/schema baru dan tidak ada publikasi konten trial.

## Gate Google dan trial yang masih terbuka

**PRD RULE:** Student/Guru menggunakan Google dan konten demo ditinjau Curriculum sebelum trial sekolah. Bukti fixture tidak menggantikan gate tersebut. Scope minimum mengikuti [Product Context](../product/PRODUCT_CONTEXT.md) dan [Sprint 2](../development/SPRINT_2_GOAL.md).

| Gate                                                                            | Status saat run lokal                                                                    | Handoff                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| Environment trial disetujui, build web/API pada SHA sama, OAuth/callback Google | NOT PROVIDED / NOT RUN; env existing adalah sandbox Development                          | Pemilik environment + Database/Auth |
| Login Google Guru/Student dengan akun QA yang diizinkan                         | NOT RUN; manifest akun QA tidak ada pada checkout                                        | Database/Auth + Farel + Salim       |
| Level 1 reviewed Curriculum dan Level 2 playable reviewed untuk kelanjutan      | NOT PROVIDED; #42 masih DEMO/DRAFT; L2 harness fixture saja                              | Curriculum + owner content          |
| Scope trial/izin sekolah dan peserta                                            | Belum ada bukti baru                                                                     | Product/Design + sekolah            |
| Acceptance independen pada satu deployment SHA                                  | PENDING                                                                                  | Salim setelah handoff Farel         |
| TryOut gratis Mandiri/Sekolah dan matriks MVP penuh                             | Belum acceptance; #41 JOB-07 tetap PR terpisah; format/IRT/auto-finalization belum final | JOB-07/08/09 + owners               |
| PvP/create-share dan leaderboard XP final                                       | OPEN-07/OPEN-11; visibility existing teruji, aktivasi belum PASS                         | JOB-16/17 + owner policy            |

Setelah environment dan akun tersedia, ikuti [QA_SEED](QA_SEED.md) untuk provisioning/backup/guard dan [QA Guide](QA_GUIDE.md) untuk matriks. Jangan mengubah shared seed/token/data peserta existing untuk mensimulasikan expiry. Pakai akun QA baru yang diizinkan.

Farel/Salim mengulang UI Admin sekolah/token → Guru **Google sign-in**/verifikasi/create class → Student **Google sign-in**/join/save/refresh/logout/login/resume/submit Drill → Guru student kelas sendiri/latest/best/progress. Ulangi retry 70 sesudah 80, score 0, Level 2, wrong-role URL/API, foreign-class/attempt denial, duplicate token/join/submit dan offline save/retry. Race/expiry 72 jam memakai suite DB terisolasi pada SHA sama, bukan mutasi waktu shared.

Catat SHA deployment web/API, environment, waktu WIB, alias role, expected/actual, PASS/FAIL, defect dan reviewer. Credential/identitas/storage state tetap di vault; sanitasi bukti yang dibagikan. Bila build berbeda SHA atau ada critical failure, perbaiki/deploy satu SHA baru lalu ulangi seluruh rantai. Gate trial dan MVP penuh dinilai terpisah. **JOB-06 belum DONE dan staging belum dinyatakan siap trial.**
