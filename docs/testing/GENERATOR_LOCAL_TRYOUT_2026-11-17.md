# Generate Variant Tryout — verifikasi lokal 17 November 2026

**ENGINEERING VERIFICATION:** alur lokal terisolasi berhasil dari pemilihan original sampai impor 30 variant DRAFT. Ini bukan deployment atau acceptance production. Konfigurasi default aplikasi bersama tidak diaktifkan oleh launcher.

## Baseline dan batas

- Main target: `7a46ddd834d57cb53e72ed432c01afb3babaa4e4`; perbaikan import: `c99ba62a`.
- AI: `b635e90eea790f3a935d9e121ce386658d8c40d3`, memakai working copy lokal. Ada perubahan AI existing yang tidak termasuk pekerjaan ini; bukti bukan klaim clean-SHA release.
- SHA-256 bank Tryout `variant_gen/data/tryout-1/q0_bank.csv`: `324b589156821b66814e95ae5fe3d029ab64687063c218e8c1c6260b2970802a`.
- SHA-256 stock lokal `variant_gen/data/conceptual_stock.json`: `a8b5d3f26774d8adc0c994ff08b08f6aa398a5ee6502c883bc50074b4af486b7`.
- Node `24.22.1`, pnpm `12.6.0`, Python `3.11`; binary PostgreSQL embedded Windows `18.6.0-beta.19`.
- PostgreSQL disposable loopback; login Main dan compute terpisah, tanpa hak owner/DDL. Context package-bound tanpa batch. API, AI, auth fixture dan storage gambar loopback; polling memakai fungsi outbox worker existing tanpa Redis bersama.
- Sumber `SHAFWAN MAU TRY OUT [LOCAL TEST]` berisi 30 soal bank lokal, 27 numeric + 3 stock. UUID, metadata, rubrik dan approval fixture TEST ONLY. Bukan approval akademik atau paket production.

## Temuan dan perbaikan

1. Preview normal ditutup ketika `CONTENT_IMPORT_PREVIEW_ENABLED` bukan `true`; flag development lokal diaktifkan, lalu API direstart.
2. Fixture mencoba seal sebagai compute, sehingga guard gagal `42501` saat membaca `attempt_items`. Fixture sekarang mendaftarkan DRAFT sebagai compute dan seal sebagai operator disposable. Hak baca attempt tidak diberikan kepada compute.
3. Registrasi stock memakai parameter JSON ambigu. Cast `::text::jsonb` mempertahankan objek dan digest canonical PostgreSQL.
4. Validasi paket bergambar menghapus marker tetapi meninggalkan manifest, menghasilkan `INVALID_ASSET_MANIFEST`. Proyeksi validasi sekarang mencocokkan logical asset ID. Artifact/digest tetap diperiksa; import tetap memerlukan hash PNG dan receipt penyimpanan nyata sebelum transaksi DRAFT.

## Expected / actual

| Pemeriksaan                                 | Actual                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Compute tidak dapat membaca `attempt_items` | Ditolak `42501`                                                                          |
| Registrasi, seal operator dan replay        | 30 config SEALED, replay konsisten                                                       |
| Generator Python nyata                      | 30 sumber berhasil; 5 kandidat bergambar                                                 |
| Pilihan package-bound                       | Satu paket sumber, 30 keluarga ORIGINAL                                                  |
| Generate paket                              | 30 request; satu paket variant 30 item DRAFT                                             |
| Tampering JSON                              | Ditolak `GENERATOR_JSON_CHANGED`                                                         |
| Import ulang                                | Menghasilkan package ID yang sama                                                        |
| Upload media gagal                          | Tidak menambah `candidate_imports`                                                       |
| Approval dicabut sebelum save               | Save ditolak                                                                             |
| Histori nonkosong dan XP                    | Seluruh isi dibandingkan dan tetap sama; satu historical attempt                         |
| Original dan item paket sumber              | Seluruh isi dibandingkan dan tetap sama                                                  |
| Browser localhost                           | Pilih original, Generate Variant, preview, validasi 30/30, Import sebagai DRAFT berhasil |
| Publication                                 | Tidak dilakukan; tombol Publish tetap tertahan oleh review/approval                      |

Regresi runnable: `scripts/test-generator-local.py` dengan `GENERATOR_V2_TEST=true` dan `GENERATOR_V2_IDS` berisi 30 ID `tryout-1-*`. Harness memanggil `apps/api/scripts/test-generator-v2.mjs` dengan role nyata dan service Python terpisah. Hasil final:

```json
{
  "passed": true,
  "originals": 30,
  "mediaCandidates": 5,
  "packages": 1,
  "historyAndXpUnchanged": true,
  "historyContentCompared": true,
  "originalContentCompared": true,
  "historicalAttempts": 1
}
```

API build, lint file service yang berubah, pemeriksaan format JS/TS/docs dan parser Python lulus. Screenshot browser lokal: `output/playwright/tryout-local-draft.png`; log mentah di `.scratch/local-generator-v2-final.log`, tidak dikomit. Required GitHub CI pada branch ini belum dijalankan; perubahan belum dipush atau dideploy. OAuth nyata, review Curriculum, publication dan seluruh fitur aplikasi tidak menjadi acceptance demo ini.

Cara mencoba ulang: [GENERATOR_HANDOFF.md](../development/GENERATOR_HANDOFF.md). Database dan hasil demo bersifat sementara.
