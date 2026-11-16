# Rilis varian Tryout dari paket original

Dokumen ini menjelaskan jalur admin dari paket Tryout original sampai paket varian dapat dilihat siswa.

## Urutan kerja

1. Jalankan migration sampai `0076_generator_tryout_source_package.sql` pada database target.
2. Pastikan Numora memiliki:

   ```env
   NUMORA_GENERATOR_ENABLED=true
   NUMORA_GENERATOR_V2_ENABLED=true
   NUMORA_GENERATOR_URL=https://alamat-service-ai
   NUMORA_GENERATOR_TOKEN=...
   ```

3. Pastikan service AI memiliki token yang sama, koneksi compute database, dan R2 untuk media.
4. Periksa `GET /api/v1/admin/content/generator/packages/catalog`. Daftar `sourcePackages` hanya berisi paket Tryout original yang sudah `PUBLISHED`, bukan demo, berisi 30 soal, 30 keluarga unik, satu konteks, dan seluruhnya punya mapping generator yang tepat.
5. Admin pilih paket original pada halaman Generator paket. Numora menyimpan `source_package_id` dan membuat request berdasarkan urutan soal paket tersebut. Request tidak mengambil 30 soal global.
6. Service AI menjalankan generator numeric, conceptual stock, atau media. Numora membaca hasil melalui endpoint V2 dan membuat file kandidat.
7. Admin memeriksa preview, validasi, lalu impor sebagai paket canonical `DRAFT`. Gambar harus memiliki artifact dan manifest; upload media menyelesaikan `objectKey` sebelum draft dibuat.
8. Curriculum menyetujui isi. Admin publish melalui alur paket yang ada. Hanya paket `PUBLISHED` yang masuk jalur assignment Tryout siswa.
9. Mulai canary dengan satu paket varian dan pantau akses siswa, error media, mapping, dan attempt. Distribusi original/varian seimbang dilakukan setelah canary lolos.

## Guard penting

- Paket sumber wajib original Tryout terbit; paket varian, demo, draft, jumlah selain 30, keluarga duplikat, konteks campur, atau mapping ambigu ditolak.
- Paket generator tetap kandidat sampai review dan publish eksplisit. Tidak ada auto-publish atau self-adjustment pada jalur ini.
- Numora tetap pemilik soal, package, approval, dan publication. Service AI hanya menghasilkan artifact compute.
- Endpoint frontend tidak mengakses database langsung.
- Migration dan stock registration harus diuji pada staging/disposable database sebelum production. Belum ada perubahan production database dari implementasi ini.

## Rollback

Hentikan publish paket varian baru, arahkan batch baru ke paket original yang sudah terbit, dan biarkan attempt yang sudah dimulai menyelesaikan paket yang telah dipin. Jangan menghapus package atau question version yang sudah dipakai siswa.
