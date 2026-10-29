# Investigasi CI PR #109 — fixture HTTP observer

**ENGINEERING EVIDENCE — snapshot sebelum publikasi, 28 Oktober 2026 WIB.** Kandidat perbaikan lokal
menutup reproduksi kegagalan setup fixture. Seluruh regresi terkait lulus pada
Windows dengan Node 24.22.1. Kandidat belum dipush atau diuji kembali oleh Linux
CI pada saat snapshot ini dibuat; hasil CI lama tetap gagal. Status publikasi dan
CI setelah snapshot dibaca dari check commit PR #109. Hasil full SIS-001 tidak diubah.

## Penyebab yang terkonfirmasi

Pada [run CI 40603050557](https://github.com/ayiinee/Numora/actions/runs/40603050557),
job `core` berhenti di langkah `Validate QA workflow`: 58 tes, 57 PASS, 1 FAIL,
0 skip. Kegagalan berada pada tes
`QA observer keeps the response unchanged and records finish/close without secrets`.

Tes memanggil `mkdtempSync` dengan prefix `qa/.local/http-observer-test-` relatif
terhadap working directory. Fungsi ini memerlukan direktori induk yang sudah ada.
`qa/.local` diabaikan Git dan belum tersedia pada checkout CI bersih; hasilnya
`ENOENT` sebelum assertion HTTP dijalankan. Direktori yang sudah ada pada host
QA lokal menyamarkan ketergantungan setup ini.

PR head adalah `43b4cb7560e71e7154ad6f8c01d7652130c57e43`; GitHub Actions
men-checkout merge ref `05b63534dd768f56a011e6998a25b445b362949e`.
Isi file tes pada kedua versi diverifikasi identik. Jadi temuan ini tidak
didasarkan pada perbandingan dua implementasi tes yang berbeda.

**Klasifikasi:** bug setup fixture tes QA, bukan bukti bug aplikasi, autentikasi,
database, atau ketidaksesuaian aturan Drill. Gate `quality` gagal mengikuti
kegagalan `core`; kedua shard Browser E2E pada run tersebut sukses.

## Kesesuaian dengan requirement

- `.github/workflows/ci.yml` menetapkan validasi harness sebelum tahap produk,
  dengan komentar bahwa harness tidak memerlukan kredensial maupun layanan cloud.
- `docs/testing/QA_WORKFLOW.md` mensyaratkan bukti positif; tes kosong, terlewat,
  atau gagal tidak boleh diartikan lulus.
- Guard observer tetap membatasi output ke `qa/.local` relatif terhadap root yang
  diberikan. Tidak ada perubahan pada guard atau implementasi observer.

Perbaikannya menyiapkan seluruh kebutuhan fixture sendiri; tidak menambahkan
langkah setup layanan pada CI atau mengabaikan tes yang gagal.

## Kandidat yang diimplementasikan

Hanya `scripts/qa/http-observer.test.mjs` yang berubah:

1. Buat root fixture unik di direktori sementara sistem operasi.
2. Pastikan `qa/.local` belum ada, kemudian buat direktori induk fixture tersebut.
3. Berikan root fixture kepada observer sehingga aturan lokasi artefak tetap sama.
4. Daftarkan cleanup hanya untuk root milik tes, dengan pemeriksaan parent/prefix;
   tutup observer ketika pemeriksaan HTTP gagal agar resource dapat dibersihkan.
5. Pertahankan assertion status 201, kesamaan body, sanitasi konten/token,
   metadata, `writableFinished`, korelasi operation ID, dan penolakan lokasi luar.
   Tambahkan assertion status 201 pada event `response_finished`.

Kode aplikasi, implementasi observer, konfigurasi CI, manifest, layanan tes,
parameter beban/timeout dan clean-SHA release guard tidak diubah.

## Bukti sebelum dan sesudah

Reproduksi menjalankan file tes yang sama dari working directory sementara yang
tidak mempunyai `qa/.local`. Ini tidak menghapus atau memindahkan artefak QA lokal.

| Pemeriksaan                            | Sebelum                                 | Sesudah                        |
| -------------------------------------- | --------------------------------------- | ------------------------------ |
| Observer dari working directory bersih | 3 PASS, 1 FAIL (`ENOENT`), 0 skip       | 4 PASS, 0 FAIL, 0 skip         |
| Seluruh workflow QA                    | CI lama: 57 PASS, 1 FAIL, 0 skip        | Lokal: 58 PASS, 0 FAIL, 0 skip |
| Guard repository `test:checks`         | Bukan tahap yang tercapai pada CI gagal | Lokal: 68 PASS, 0 FAIL, 0 skip |
| Validasi manifest                      | Tidak tercapai pada CI gagal            | PASS; SIS-001 valid            |
| Typecheck QA                           | Tidak tercapai pada CI gagal            | PASS                           |
| Lint dan format file yang berubah      | Bukti kandidat belum ada                | PASS                           |

Tiga bagian langkah CI yang sama selesai lokal, dengan Node 24.22.1:

```text
pnpm test:qa-workflow
pnpm qa validate
pnpm exec tsc -p qa/tsconfig.json
```

Tambahan regresi: `pnpm test:checks`, ESLint tanpa warning, Prettier check dan
`git diff --check`. Runtime Node 24.22.1 diaktifkan secara terisolasi untuk
perintah-perintah tersebut; Node global host tidak dijadikan bukti kesetaraan.

`EVIDENCE.json` menyimpan identitas versi, hash file sebelum/sesudah, hitungan
aktual, perintah, waktu, exit code dan batas kesimpulan. `candidate.patch`
memuat perubahan file tes tanpa baris konteks; gunakan `git apply --unidiff-zero`
jika menerapkannya secara terpisah. Log CI asli, reproduksi gagal dan
log regresi tetap berada di direktori ignored `qa/.local/ci-workflow-20261028/`.

## Keputusan dan pekerjaan terbuka

**Status pada snapshot: kandidat lokal terverifikasi; Linux CI kandidat NOT_RUN.** WSL tidak terpasang
pada host dan patch belum dipush pada saat bukti ini dibuat. Perbaikan ini belum mengubah status check PR
#109 yang lama. Verifikasi remote memerlukan commit kandidat pada PR dan seluruh
gate CI yang diwajibkan; jangan melewati `core` atau menandai gate hijau manual.

Full SIS-001 `838c1952-e8f9-4681-8396-ea74365157a1` tetap **FAIL: 13 PASS,
1 FAIL, 0 BLOCKED, 1 NOT_RUN**. Load/selisih respons submit, verifikasi headroom
host, pengujian manusia, Google OAuth nyata, staging, pengesahan akademik dan
integrasi migrasi tetap terbuka sesuai bukti masing-masing. Tidak ada klaim
kelulusan ulang aplikasi, merge atau deployment.
