# Triase Browser E2E Admin — 28 Oktober 2026 WIB

**ENGINEERING EVIDENCE.** CI head awal PR #109 `1780da0` dan PR #102 `7f3313f`
meluluskan connected release chain 6/6, lalu Browser E2E 186 PASS / 8 FAIL.
Sumber expected: `docs/content/UPLOAD_FIRST_WORKFLOW.md` beserta keputusan
pemilik 7 Oktober di bagian akhir; aturan lama yang digantikan tidak dipakai.

| Kegagalan                                     | Klasifikasi                                                                             | Koreksi QA dan assertion yang dipertahankan                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form soal pada pagination (2 viewport)        | Tes belum membuka editor revisi                                                         | Buka Buat revisi/varian; tetap periksa draft teks bertahan saat pindah halaman dan pagination 5/1                                                                             |
| Portal Super Admin/Content → upload (4 kasus) | Selector heading lama                                                                   | Periksa heading langkah Upload Excel aktual; pertahankan URL, izin role dan aria-current navigasi                                                                             |
| Upload/publish Tryout (2 viewport)            | Label Publish/tanggal lama serta mapping fixture mengikuti aturan yang telah digantikan | Periksa Publish sekarang nonaktif sebelum konfirmasi, lalu tanggal+jam WIB dan request releaseAt tepat; mapping Tryout opsional, nilai yang dipilih tetap divalidasi/disimpan |
| Layout desktop setelah editor dibuka          | Selector dan acuan geometri lama                                                        | Bandingkan toolbar dengan kolom daftar soal, bukan seluruh workspace dua kolom; batas lebar 95% dan pemeriksaan overflow tetap                                                |

Regresi terarah sebelum pembaruan dependency terakhir: **16 PASS**, meliputi
kedua viewport, empat subrole dan upload Drill/Pretest/Tryout. Percobaan koreksi
awal yang masih gagal tidak menggantikan CI awal maupun hasil full SIS-001.
Regresi pada dependency/commit akhir tetap diperlukan sebelum acceptance.

## APP-ADMIN-01 — instruksi kesulitan Tryout tidak sesuai keputusan terakhir

- Jenis: **aplikasi / copy UI**, prioritas usulan P2; belum diperbaiki pada aplikasi.
- Reproduksi: unggah fixture Excel → jenis Tryout → Lanjutkan ke pemetaan.
- Expected: instruksi menjelaskan kesulitan dan pemetaan materi boleh kosong
  sesuai keputusan pemilik 7 Oktober pada UPLOAD_FIRST_WORKFLOW; nilai yang
  diberikan tetap divalidasi.
- Actual: `content-import.tsx` menampilkan “Kesulitan tetap wajib.” pada langkah
  Pemetaan dan validasi, walau keputusan terakhir membolehkannya kosong.
- Dampak: Admin dapat mengira input opsional wajib dan tertahan menyelesaikan alur.
- Bukti: sumber paragraf UI dan capture tes `mapping-TRYOUT-1280.png` pada artefak
  lokal terarah; fixture sintetis, bukan publikasi konten akademik.
- Kandidat: `candidates/admin-tryout-copy.patch`. Kandidat **tidak diterapkan**;
  developer perlu mereview dan memverifikasi teks serta aturan backend terkait.

Tidak ada perubahan kode produk atau kelonggaran gate jumlah, review,
otorisasi, versi konten, receipt gambar, dan preservasi histori pada koreksi tes ini.
