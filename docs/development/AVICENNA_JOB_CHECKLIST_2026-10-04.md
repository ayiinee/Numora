## JOB-04 — Admin Drill publisher

**Status: Parsial**

- [x] Buat, edit, publish, dan archive paket Drill.

- [ ] Lengkapi alur UI Admin → Student sesuai data paket yang diterbitkan.

## JOB-10 — Admin IRT

**Status: Parsial**

- [x] Tampilkan status batch IRT terpisah dari status rilis hasil.

- [ ] Lengkapi tampilan status IRT lain yang tersedia di kontrak.

## JOB-12 / P1 — Penilaian & riwayat hasil

**Status: Done**

- [x] Gunakan endpoint riwayat Student `GET /students/me/assessment-results`. Endpoint sudah tersedia di backend dan tercantum pada OpenAPI.

- [x] Tampilkan daftar hasil dengan pagination agar Student dapat menemukan kembali attempt lama.

- [x] Sediakan akses hasil Drill melalui attempt ID.

- [x] Tampilkan status hasil Tryout dan jangan tampilkan nilai sebelum hasil dirilis.

- [x] Gunakan tipe yang dihasilkan dari kontrak OpenAPI.

- [x] Pertahankan tampilan nilai historis Drill ketika akses pembahasannya kedaluwarsa.

## JOB-13 / P2 — Pretest Student

**Status: UI awal tersedia; integrasi menunggu kontrak backend**

- [x] Tampilkan kartu Pretest per bab dan state unavailable tanpa membuat eligibility atau persistence palsu.

- [x] Siapkan state presentasi available, in-progress, completed, skipped, dan mapping-unavailable.

- [x] Sediakan dialog informasi 20 soal, sifat opsional/one-time, tanpa XP, dan dampak Skip yang sudah ditetapkan.

- [ ] Integrasikan flow Student setelah API eligibility dan lifecycle tersedia; eligibility afiliasi tetap mengikuti keputusan Product.

- [ ] Sediakan Pretest opsional berisi 20 soal per bab sesuai distribusi yang disetujui.

- [ ] Sediakan mulai, resume, submit, dan tampilan hasil serta state completed/unavailable.

- [ ] Terapkan batas satu kali selesai dan pastikan Pretest tidak memberikan XP.

- [ ] Implementasikan placement setelah Curriculum/PO memutuskan distribusi dan mapping melalui OPEN-01–03.

- [ ] Terapkan hasil perfect sesuai mapping placement yang disetujui; batas maksimal tiga level per subbab hanya berlaku jika dikonfirmasi sebagai keputusan final.

- [ ] Pastikan level yang sudah terbuka tidak terkunci kembali setelah placement.

## JOB-14 — Admin laporan

**Status: Parsial**

- [x] Tampilkan laporan soal/video, filter, konteks, dan tindak lanjut.

- [ ] Lengkapi state UI mengikuti kontrak final.

## JOB-18 — Admin pengguna & kelas

**Status: Frontend baca-saja selesai**

- [x] Tampilkan daftar dan detail pengguna/kelas dengan filter dan pagination.

- [x] Tangani loading, empty, error, retry, dan akses ditolak.

- [x] Batasi layar pada operasi baca-saja; tidak menyediakan mutasi ban/koreksi.