# Pemulihan sumber original — 9 November 2026

**ENGINEERING DECISION — instruksi pemilik:** “perbaiki, tidak perlu menunggu keputusanku”. Dua koreksi pembahasan diterapkan lokal; sumber DOCX dan kutipan sumber tetap utuh. Tidak ada approval Curriculum baru, penulisan database bersama, upload, publikasi, atau perubahan hasil/XP.

## Hasil

- Delapan pembahasan dipulihkan ke `variant_gen/data/question_metadata.json`, dengan hash DOCX, kutipan verbatim, dan catatan koreksi. Hash/versi original, stem, opsi, kunci, config dan stok tidak diubah.
- `pg-17-3-2`: dua salah ketik `(-,x-y)` diperbaiki menjadi `(-x,-y)` lokal. Canonical ternyata **sudah benar**; tidak perlu revisi database untuk soal ini.
- `mcma-16-1-6`: pembahasan pernyataan 4 ditambahkan: dua segitiga + tiga persegi panjang = lima bangun datar. Canonical masih belum memuat tambahan ini.
- Enam soal lain disalin dari sumber tanpa koreksi. Pada `kategori-17-3-10`, canonical memakai `(k)^(2)` dan `(3)^(2)`, sedangkan sumber memakai `k^(2)` dan `3^(2)`: ekuivalen, tidak perlu menulis ulang canonical.
- Sembilan PNG original, pin original, receipt VERIFIED database dan byte storage diperiksa ulang. Semua hash/ukuran cocok; belum ada hubungan media pada versi soal.
- Simulasi penautan marker–manifest dan perbandingan konten lulus untuk seluruh **17 soal**. Ini simulasi data di memori, bukan penerapan migrasi atau pengujian publikasi siswa.

| Kelompok | ID | Hasil |
| --- | --- | --- |
| Pembahasan | `pg-16-1-1`, `pg-16-1-2`, `pg-16-3-2`, `kategori-16-1-9`, `kategori-16-2-9` | Sama persis dengan canonical |
| Pembahasan | `kategori-17-3-10` | Ekuivalen; perbedaan tanda kurung pangkat |
| Pembahasan | `pg-17-3-2` | Lokal dikoreksi; canonical sudah benar, redaksi ekuivalen |
| Pembahasan | `mcma-16-1-6` | Tambahan pernyataan 4 disiapkan untuk revisi canonical |
| Gambar | `pg-16-4-1`, `pg-16-4-2`, `pg-16-4-3`, `pg-16-4-4`, `mcma-16-4-6`, `mcma-16-4-7`, `pg-16-5-1`, `pg-16-5-3`, `pg-16-5-5` | Receipt/byte valid; proposal penautan lokal lulus |

## Bukti dan batas

- [Audit database read-only terbaru](report.json): 1.180 identitas valid, 1.177 perbandingan persis, tiga perbedaan pembahasan yang dirinci di atas. Tidak lagi ada `LOCAL_EXPLANATION_UNAVAILABLE`. Auditor tetap ketat; ekuivalensi tidak disembunyikan dengan normalisasi umum.
- [Proposal lokal](repair-proposal.json): pin versi/fingerprint canonical, patch satu pembahasan dan sembilan relasi media, hasil 17 simulasi, serta sembilan hasil pembacaan storage. Proposal ini **bukan payload apply otomatis**.
- Pengujian sumber/audit/media: 10 tests lulus, termasuk receipt berubah, pin versi sumber salah dan PNG rusak.
- Regresi generator v2: empat tests lulus setelah pemulihan metadata, mencakup 1.094 generator numerik, 248 stok VERIFIED, kontrak lintas repo dan replay/tamper gambar. Lima media Tryout existing juga diverifikasi ulang dari storage dan cocok.
- Blocker produksi tetap: 18 rubrik PG Tryout DRAFT, 30 original Tryout DRAFT, dan context/config/approval produksi. Pemulihan metadata tidak memberi approval akademik atau meloloskan registrasi produksi.

## Reproduksi

Dari root service AI:

```powershell
python -B -m unittest tests.service.test_original_explanation_recovery tests.service.test_original_media_repairs tests.service.test_mapping_audit
python -B -m numora_service.mapping_audit --output .scratch/source-repair/audit.json --verify-media
python -B tools/prepare_original_source_repairs.py --output .scratch/source-repair/proposal.json --verify-storage
```

Koneksi memakai `.env` lokal; kredensial dan signed URL tidak dicatat. Semua query dijalankan dalam transaksi read-only. Tool berhenti pada mapping ambigu, sumber berubah, perbedaan pembahasan belum direview, receipt/byte salah, atau media canonical yang sudah terisi; tidak menebak pengganti.

Langkah berikutnya setelah batas database dibuka secara eksplisit: repo utama menerapkan **versi konten baru** untuk satu pembahasan dan sembilan penautan gambar melalui jalur canonical yang sah, dengan pemeriksaan fingerprint sebelum perubahan. Jangan mengedit versi immutable, mengganti pin sesi berjalan, atau mengimpor ulang 1.180 soal. Registrasi generator lama harus ditinjau ulang terhadap fingerprint versi baru; approval tidak dipindahkan diam-diam.
