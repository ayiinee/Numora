# Bukti verifikasi generator v2

Pelaksanaan lokal 8–9 November 2026. Tidak ada migrasi/registrasi/approval/upload/DRAFT pada database development bersama. Semua fixture dan write memakai PostgreSQL loopback disposable, compute/main role terpisah, serta transport storage HTTP lokal dengan pipeline reserve/verify/receipt sesungguhnya.

| Pemeriksaan                               | Hasil                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Mapping canonical read-only               | 1.180 identitas terpetakan; blocker produksi tetap eksplisit pada laporan tahap 3                                                      |
| Migrasi populated upgrade + fresh install | Lulus; 12 guard tests, termasuk assignment paralel, fallback, pin versi dan Tryout lintas arm                                          |
| Coverage bank Windows                     | 1.094 numerik seed 42 dan seluruh 248 stok VERIFIED dari 86 keluarga; lulus                                                            |
| Coverage Linux WSL                        | Coverage yang sama dan replay/tamper gambar; lulus                                                                                     |
| Coverage Linux amd64 container            | Coverage yang sama serta replay/tamper gambar dijalankan saat Docker build; lulus                                                      |
| Kontrak JS                                | 6 tests lulus; notification compute v3, response serta kandidat numerik/stok/media                                                     |
| Paritas lintas repo                       | Schema dan contoh JSON sama byte-per-byte; 4 tests v2 Python lulus (termasuk flag/auth dan katalog stok tanpa config palsu)            |
| End-to-end massal                         | **1.180/1.180** compute → preview → VARIANT DRAFT → save ulang idempoten lulus                                                         |
| Gambar end-to-end                         | **14/14** keluarga; artifact SHA/ukuran/dimensi/provenance, upload gagal tanpa DRAFT parsial, retry dan receipt reuse lulus            |
| Paket lengkap                             | **3/3**: Drill indikator 16 level 4 dan 5 (10 soal masing-masing), Tryout 30 soal; export/validate/import DRAFT ulang lulus            |
| Stok                                      | Alokasi paralel, rotasi, reuse, reservasi tetap saat replay/retry, ledger FAILED/SUCCEEDED/CANCELLED dan penolakan ledger palsu lulus  |
| Approval/dispatch                         | Revoke sebelum adopsi, dispatch usang dan retry lease habis ditolak/ditangani sesuai pin                                               |
| Histori/XP                                | Jumlah attempt dan XP ledger tidak berubah pada uji penuh                                                                              |
| v1 HTTP/Nest                              | Auth/subrole, tiga format, prepare paralel, preview, save paralel, replay/digest, expiry/retry dan revoke lulus                        |
| Fault/role v1 pada migrasi canonical      | **11/11** lulus: restart setelah respons hilang, timeout, heartbeat gagal, fencing, rollback/partial insert, input/config/rubric salah |
| Unit Python v1                            | Content 9/9 dan API 5/5 lulus                                                                                                          |
| Unit API main                             | Generator/media upload/storage 21/21 lulus                                                                                             |
| Unit web                                  | Generator individual 5/5 lulus                                                                                                         |
| Browser individual                        | Enam sampel PG/MCMA/kategori/numerik/stok/gambar, preview/save DRAFT, mobile dan desktop lulus                                         |
| Browser paket                             | Preview gambar dan validasi melalui workflow impor diuji terpisah dari save paket API; bukti PNG ada di outputs                        |
| Build/type/lint                           | Database, orchestration, API tsc; source web tanpa e2e; scoped ESLint dan kontrak generated check lulus                                |

Output harness massal tersanitasi:

```json
{
  "passed": true,
  "originals": 1180,
  "mediaCandidates": 14,
  "packages": 3,
  "historyAndXpUnchanged": true
}
```

Build Linux terakhir yang diperiksa:

```text
image ID sha256:7f0730a52c3b75b4806dea067b73651c343be91da88a6752b69aeef230e54bcd
base python:3.11.14-slim-bookworm@sha256:83f339c1be6340ae1096010fdccf6552ac932d8f410d45d206014916bdf37e48
profile linux-amd64-bookworm-cpython-3.11.14-pillow-12.1.0-v1
```

Image ID adalah image lokal yang diuji, bukan digest registry yang sudah dipublikasikan. Dockerfile mengunci base/dependency; tidak ada push image atau deployment. Hash image dapat berubah ketika metadata/build input berikutnya berubah; jangan memakai tag `local` sebagai pin produksi.

## Batas bukti

- Coverage numerik ini adalah seluruh generator dengan satu seed per original, ditambah jalur seed acak pada integrasi. Bukan bukti exhaustive seluruh kombinasi parameter atau kesetaraan kesulitan akademik.
- Node terpasang 24.15.0, sedangkan repo mensyaratkan 24.22.1. CI pada runtime yang dipin tetap diperlukan.
- Typecheck web penuh terhalang dependency e2e existing `@axe-core/playwright` yang belum terpasang. Source aplikasi web diperiksa terpisah; tidak ada kegagalan source yang disembunyikan sebagai lulus full e2e.
- Routing siswa existing tidak diaktifkan; tidak ada kalibrasi IRT, publikasi paket atau perubahan reward/history.
- Delapan pembahasan independen lokal, sembilan tautan gambar original Drill, 18 rubrik PG Tryout DRAFT, status original Tryout, context/config/approval produksi masih membutuhkan tindak lanjut sebagaimana audit. Fixture lokal tidak menyelesaikan blocker tersebut.

## Reproduksi

Di repo utama, build database, assessment-engine, orchestration dan API dahulu. Atur `NUMORA_AI_SERVICE_PATH` serta `POSTGRES_BIN` ke instalasi lokal. Jalankan `python -B scripts/test-assessment-arms-local.py` untuk guard migrasi. Untuk uji penuh generator, `GENERATOR_V2_TEST=true python -B scripts/test-generator-local.py` (gunakan sintaks environment PowerShell bila di Windows). Hapus flag untuk regresi v1; `GENERATOR_SKIP_BROWSER=true` hanya untuk suite API/fault v1 karena browser v2 diperiksa terpisah.

Browser v2: aktifkan `GENERATOR_V2_BROWSER=true`, lalu pilih `GENERATOR_V2_IDS` untuk PG, MCMA, kategori, dua mode, gambar dan satu level Drill lengkap. Harness memeriksa loopback DB sebelum menjalankan fixture. Bukti PNG TEST ONLY tersedia di `outputs/generator-v2/`.

Penerapan/rollback ada di [handoff](../GENERATOR_SERVICE_V2_HANDOFF.md). Tahap ini tidak memberikan persetujuan untuk menerapkan migrasi ke database bersama.
