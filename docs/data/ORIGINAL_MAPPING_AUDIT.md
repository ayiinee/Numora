# Audit mapping original Paket 1

ENGINEERING IMPLEMENTATION — 8 November 2026. Audit 1.150 original Drill dan 30 Tryout menggunakan namespace impor, bukan susunan paket. Paket Tryout existing dapat menunjuk VARIANT; sumber generator tetap versi ORIGINAL canonical.

Jalankan dari Numora (Python service AI dan build API diperlukan untuk verifikasi storage):

```powershell
node scripts/audit-original-mappings.mjs --verify-media --output docs/audits/2026-11-08-original-mapping/report.json
```

Output relatif terhadap root AI. `NUMORA_AI_SERVICE_PATH`, `NUMORA_PYTHON` dan `NUMORA_REPO_PATH` dapat menunjuk checkout/toolchain lain. Auditor membuka transaksi REPEATABLE READ dengan READ ONLY sebelum query apa pun, tanpa import, registrasi, approval, DDL atau penulisan storage. Signed URL/credential tetap di proses verifier dan tidak disimpan.

## Hasil aktual

| Pemeriksaan                                            |               Hasil |
| ------------------------------------------------------ | ------------------: |
| Identitas ORIGINAL, hash dan versi lokal cocok         |         1.180/1.180 |
| Isi termasuk pembahasan lokal dapat dicocokkan lengkap |         1.172/1.180 |
| Perbedaan isi/taxonomy/kunci terdeteksi                |                   0 |
| Pembahasan belum tersedia pada sumber lokal independen |                   8 |
| Original Drill bergambar belum mempunyai tautan media  |                   9 |
| Rubrik PG Tryout masih DRAFT                           |                  18 |
| Original Tryout masih DRAFT                            |                  30 |
| Context/config/approval generator belum terdaftar      | 1.180 masing-masing |
| Gambar original tertaut: receipt dan byte R2 cocok     |                 5/5 |
| Siap registrasi berdasarkan seluruh prasyarat          |                   0 |

Delapan pembahasan yang belum bisa dibandingkan: `kategori-16-1-9`, `kategori-16-2-9`, `kategori-17-3-10`, `mcma-16-1-6`, `pg-16-1-1`, `pg-16-1-2`, `pg-16-3-2`, `pg-17-3-2`. Ini bukan perbedaan isi yang terbukti dan bukan alasan mengimpor ulang. Auditor tidak menyalin pembahasan database lalu menggunakannya sebagai pembanding terhadap database yang sama.

Report dan manifest per soal berada di `docs/audits/2026-11-08-original-mapping/` pada kedua repo. `identityValid`, `contentMatches`, dan `registrationReady` berbeda; tidak ada klaim bahwa 1.180 identitas valid berarti generator siap produksi. Penerimaan khusus pemilik atas Drill tidak disamakan dengan approval Curriculum/config IRT.

## Perbaikan berikutnya

Pertahankan semua keluarga/versi yang sudah benar. Lengkapi sumber pembahasan independen untuk delapan soal; hubungkan sembilan media melalui versi konten baru yang direview; buat context sesuai blueprint, registrasikan config/stock-set, dan kumpulkan approval yang sah. Delapan belas rubrik PG Tryout memerlukan keputusan pemilik rubrik, bukan seal otomatis dari auditor. Tahap ini hanya menghasilkan laporan dan manifest; tidak menjalankan perbaikan tersebut pada development.

Verifikasi: enam tes membuktikan pembandingan isi terpisah dari hash, taxonomy/kunci/rubrik, marker/manifest media, pembahasan yang hilang, dan bentuk media legacy. Pembacaan live menggunakan transaksi read-only; lima PNG diambil read-only dari R2 dan SHA-256/ukuran cocok. Manifest tidak berisi identitas peserta, credential, atau signed URL.
