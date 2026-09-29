# Database v0.5: constraint, alur data, dan seed demo

Status: rancangan kerja Data Engineer untuk dibahas dengan Backend, Data/AI, Curriculum, QA, dan PO. PRD v0.5 adalah acuan aturan produk. Dokumen repo yang masih merujuk v0.4 tidak boleh dipakai untuk menetapkan aturan yang bertentangan. Angka atau kebijakan OPEN di bawah tidak dianggap keputusan final.

## 1. Batas implementasi awal

Bangun schema melalui Drizzle di `packages/database/src/schema`, hasilkan migrasi SQL yang ikut di-commit, lalu jalankan migrasi pada database lokal dan staging/demo. Jangan mengubah schema bersama secara manual melalui Supabase Studio. Mulai dari fondasi yang dipakai semua tim: identitas/kelas, taksonomi/soal versi, paket/percobaan/jawaban, progres/XP, baru tabel fitur turunan.

`user_type` Mandiri/Sekolah sebaiknya diturunkan dari ada/tidaknya keanggotaan kelas aktif, bukan disimpan sebagai kolom kedua yang mudah tidak sinkron. Bila snapshot tipe saat aktivitas diperlukan untuk analitik, simpan pada peristiwa/percobaan terkait. `class_id_at_attempt` menyimpan kelas saat pengerjaan agar perpindahan kelas kelak tidak menulis ulang riwayat.

## 2. Constraint minimum per kelompok

| Kelompok | Constraint di PostgreSQL | Aturan tambahan di service/transaksi |
|---|---|---|
| Pengguna | `auth_user_id` unik; email unik bila kebijakan email satu akun tetap berlaku; `role` dan status memakai enum/check. | Hanya role STUDENT boleh menjadi anggota kelas atau peserta asesmen/PvP; hanya TEACHER terverifikasi boleh membuat kelas. FK saja tidak menegakkan role. |
| Sekolah/token | Kode/token hash unik; FK sekolah, pembuat, pemakai; `expires_at > created_at`; `used_at` dan `used_by_user_id` harus sama-sama terisi atau sama-sama kosong. | Konsumsi token atomik: update token yang belum dipakai/dicabut dan belum kedaluwarsa, lalu buat afiliasi guru dalam transaksi yang sama. Validitas 3×24 jam ditetapkan saat pembuatan. |
| Afiliasi guru | `verification_token_id` unik; indeks unik parsial `(teacher_user_id)` untuk afiliasi aktif jika satu guru hanya boleh di satu sekolah pada MVP. | Saat membuat kelas, pastikan pasangan guru–sekolah memiliki afiliasi aktif. Jika guru boleh aktif di beberapa sekolah, indeks parsial harus diubah menjadi `(teacher_user_id, school_id)` setelah keputusan produk. |
| Kelas | `join_code` unik; FK sekolah/guru; nama tidak kosong. | Guru kelas harus berafiliasi aktif dengan sekolah yang sama; validasi transaksi/service atau constraint DB khusus. |
| Keanggotaan | Indeks unik parsial `student_user_id WHERE left_at IS NULL`; `left_at >= joined_at` jika terisi. | Join dengan lock/transaksi; cegah siswa non-STUDENT dan kelas tidak aktif. Jangan hard-delete riwayat. Aturan keluar/pindah kelas masih OPEN-15. |
| Materi | `subchapter(chapter_id, order)` unik; `level(subchapter_id, number)` unik; nomor level positif. | Taksonomi final menunggu Curriculum/PO (OPEN-01); jangan mengunci jumlah bab dalam schema. |
| Soal/varian/versi | `variant(question_id, variant_code)` unik; `question_version(variant_id, version_number)` unik; nomor versi positif; status terkontrol. | Versi yang pernah dipakai paket/percobaan tidak ditimpa. READY memerlukan kunci, pembahasan, metadata dan review akademik. Candidate generator tetap berbeda dari konten terbit. |
| Paket/item | `package(family_code, version)` unik; `package_item(package_id, order)` unik; FK ke versi soal konkret; `max_points > 0`. | Paket aktif tidak dimutasi setelah dipakai. Paket tryout mingguan memiliki satu paket terbit per jendela waktu WIB; cek overlap waktu rilis/tutup di transaksi/publish. Validasi tepat 20 soal pretest, 10 drill, 10 PvP pada saat publish, bukan lewat hardcode bentuk tabel. |
| Percobaan | FK siswa/paket; state enum; `finished_at >= started_at`; skor 0–100; bintang 1–3 hanya untuk drill. Unik `(student_id, package_id)` khusus tryout; indeks unik parsial `(student_id, chapter_id)` khusus pretest bila `chapter_id` disnapshot ke percobaan, sehingga versi paket baru tidak membuka percobaan pretest kedua. | Buat/submit idempoten. Untuk tryout: hanya paket periode aktif, sama untuk semua siswa, dan satu pengerjaan per siswa per paket. Siswa mandiri tidak dapat memulai tryout berbayar pada MVP. Hasil dan pembahasan tryout baru dibuka sesudah batch IRT paket berstatus siap. |
| Jawaban/progres | `answer(attempt_id, package_item_id)` unik; `progress(student_id, level_id)` unik; FK pembuka/penyelesai; waktu selesai tidak lebih awal dari waktu buka. | Jawaban hanya boleh diubah sebelum finalisasi. Finalisasi skor, progres, XP dan outbox dalam satu transaksi. Unlock drill pada skor ≥80%; level yang sudah terbuka tidak ditutup kembali. Pemetaan pretest parsial tetap OPEN-01–03. |
| XP/leaderboard | Ledger append-only; unique `(source_type, source_id, student_id)` atau unique `attempt_id` untuk sumber asesmen; `xp_amount >= 0`; `(period_id, scope, scope_id, student_id, difficulty)` unik untuk proyeksi leaderboard. | Pretest tidak menghasilkan XP. Leaderboard kelas hanya drill + tryout untuk kelas saat pengerjaan. PvP global memakai best valid score per siswa/kesulitan/periode dan tidak masuk kelas. Tutup/arsip periode Rabu 23:59 WIB tanpa menghapus ledger. |
| PvP | `room_code` unik; `player(match_id, slot)` dan `(match_id, student_id)` unik; `match_question(match_id, order)` unik; `pvp_answer(player_id, match_question_id)` unik. | Dua pemain berbeda; satu paket/urutan sama; waktu/skor dari server; reconnect 20 detik; forfeit tidak memperbarui rekor. Semua transisi final idempoten. |
| Feedback/laporan | Panjang feedback 1–1000 karakter; laporan soal FK ke jawaban/versi yang dikerjakan; laporan video FK ke pemetaan video–subbab. | Guru hanya dapat mengirim feedback kepada siswa di kelasnya. Validasi kepemilikan dan otorisasi di backend. |
| Event/audit | `event_id` unik; `event_name`, `event_version`, waktu, referensi; indeks `(processed_at, occurred_at)` pada outbox; `idempotency_key` konsumen unik bila diproses lintas sistem. | Tulis outbox dalam transaksi domain, lalu worker menerbitkan/menyalin ke log analitik. Konsumen tahan duplikasi. Audit administratif tidak dicampur dengan event produk. |
| IRT/kalibrasi | Hasil mengacu ke `question_version_id`, `batch_id`, `model_version`, `sample_size`, dan status; nilai metrik boleh null saat data belum cukup; unique run/item; FK lineage varian→original. | Hanya tampilkan hasil valid setelah minimum 30 responden menurut PRD. Simpan parameter, SE, skala/anchor, dan provenance run untuk perbandingan original–varian. Threshold drift/aturan adjust masih keputusan Data+Curriculum, bukan constraint tetap. |

Constraint `CHECK` cocok untuk aturan satu baris (rentang, pasangan null, urutan waktu). Aturan lintas tabel seperti role, keanggotaan, paket aktif, dan review Curriculum perlu transaksi/service serta pengujian; gunakan trigger atau constraint khusus hanya bila tim menyepakati pemilik logikanya. Indeks FK dan indeks untuk query dashboard/leaderboard dibuat berdasarkan query nyata, lalu diperiksa dengan `EXPLAIN ANALYZE` ketika dataset bertambah.

## 3. Alur data yang harus dipertahankan

1. **Konten:** Curriculum membuat original → versi original direview → Data/AI menghasilkan varian candidate beserta seed, config version, parameter, dan parent original → validasi statis → uji/kalibrasi → review → READY → versi konkret dimasukkan ke paket. Candidate gagal tetap tersimpan untuk audit, tanpa mengubah original.
2. **Asesmen:** Backend memilih paket/versi soal → membuat percobaan dan daftar item tetap → autosave jawaban → finalisasi satu kali → simpan skor historis, progres, XP ledger, dan outbox dalam satu transaksi. Revisi soal berikutnya tidak menghitung ulang hasil lama.
3. **Analitik:** Outbox menjadi sumber peristiwa yang andal → worker memproses dengan `event_id` idempoten → tabel analitik/proyeksi diperbarui. Jangan mengambil makna event hanya dari perubahan tabel tanpa kontrak event.
4. **IRT:** Jawaban final diekstrak per versi item dengan identitas responden pseudonim → batch menyimpan model, ukuran sampel, SE, dan status → admin membaca hasil versi terbaru yang valid. Batch harian pemantauan soal dan batch penutupan paket tryout perlu status terpisah agar gerbang hasil tryout tidak bergantung pada cron harian yang kebetulan berjalan.
5. **Leaderboard:** Ledger/hasil PvP valid menjadi sumber → proyeksi per periode dibangun ulang secara idempoten → periode ditutup dan dipertahankan sebagai riwayat. Redis hanya cache; PostgreSQL tetap sumber kebenaran.

## 4. Pemanfaatan workflow original–kalibrasi–varian

Dokumen `Workflow_Original_Kalibrasi_Generate_Uji_Compare_Adjust_Regenerate.docx` membantu menjelaskan lineage dan provenance yang belum lengkap pada PDF Data & Analytics. Tambahkan konsep `generator_configs` (versi, parameter, batas Curriculum), `generation_runs` (seed, config version, waktu, generator version), `variant_candidates` (asal original/versi, status, alasan gagal), dan `calibration_runs/results` (item version, model, anchor/skala, sample size, a, b, D, SE, status). Implementasi fisik boleh menggabungkan tabel bila kontrak dan audit tetap jelas.

Untuk demo tanpa respons siswa yang cukup, **jangan tandai metrik IRT dummy sebagai hasil kalibrasi nyata**. Tunjukkan generator → validasi statis → candidate → review/manual READY dengan label DEMO, atau gunakan fixture hasil kalibrasi simulasi yang jelas dipisahkan dari data riil. PRD menyatakan minimum 30 responden untuk menampilkan hasil IRT. Besaran toleransi Δa/Δb/ΔD, batas regenerasi, dan model adjustment pada dokumen workflow adalah usulan Data/Curriculum sampai disahkan.

## 5. Kontrak seed demo lintas tim

Gunakan seed deterministik dan idempoten: kode stabil/UUID tetap untuk fixture, `upsert` atau `onConflict`, serta label `DEMO` pada data. Pisahkan `seed:base` (referensi aman) dari `seed:demo` (skenario fitur). Jangan masukkan kredensial nyata atau token guru plaintext ke Git. Akun demo yang dipakai login harus punya identitas Supabase Auth yang cocok; UUID placeholder pada seed saat ini hanya membuktikan wiring DB.

| Urutan | Tim pemasok/peninjau | Data minimum yang diperlukan | Skenario demo yang dibuka |
|---|---|---|---|
| 1 | Onboarding + Data | 1 sekolah aktif; 1 admin, 1 guru terverifikasi, 3 siswa sekolah, 1 siswa mandiri; 1 kelas; 1 token belum dipakai dan 1 token terpakai/kedaluwarsa. | Login, verifikasi guru, buat/join kelas, perbedaan hak mandiri/sekolah. |
| 2 | Curriculum + Admin & Content + Data/AI | 1 bab, 2 subbab, masing-masing 5 level; kompetensi/kesulitan; soal PG original dan minimal 2 varian untuk level demo; kunci dan pembahasan tervalidasi; beberapa status DRAFT/READY/ARCHIVED. | CRUD konten, riwayat versi, generator varian, drill ulang. Jumlah/konten final tetap menunggu Curriculum. |
| 3 | Core Learning + Data | Paket pretest demo 20 soal per bab; paket drill 10 soal untuk minimal satu level dengan dua indeks varian; satu paket tryout mingguan demo yang sama untuk seluruh siswa sekolah; item paket mengacu versi soal tetap. | Practice/drill, submit, skor 70/80/100, unlock, bintang, tryout sekali per paket. Spesifikasi resmi tryout masih OPEN-05. |
| 4 | Monitoring + Data | Percobaan selesai/gagal/berjalan, jawaban, progres berbeda antar siswa; minimal 2 feedback (belum/sudah dibaca); 1 laporan soal dan 1 laporan video. | Dashboard siswa/guru, monitoring, feedback, laporan. |
| 5 | PvP & Leaderboard + Data | 1 paket PvP 10 soal PG per kesulitan yang didemokan; dua pertandingan penuh berbeda skor, satu forfeit/reconnect; ledger drill/tryout; periode leaderboard aktif dan arsip. | Room lintas tipe siswa, skor server, best record global, leaderboard kelas terpisah, arsip. |
| 6 | Data Platform & AI + Curriculum | Original dan candidate varian dengan generation run/config/seed; 3 video per subbab demo bila tersedia; satu hasil IRT simulasi berlabel DEMO dan satu item `NOT_ENOUGH_DATA`. | Generator, rekomendasi video, status IRT tanpa mengklaim validasi empiris palsu. |

Seed harus menyediakan kasus negatif untuk QA: token kedaluwarsa/terpakai, siswa sudah di kelas, percobaan tryout kedua pada paket sama, soal DRAFT yang tidak boleh dipakai, jawaban PvP ganda, dan akses guru ke kelas orang lain. Kasus negatif tidak harus tampak pada UI utama, tetapi harus dapat dipanggil lewat test/API.

## 6. Urutan kerja yang tidak menunggu pembaruan seluruh dokumentasi

1. Catat v0.5 sebagai acuan pada PR/issue database dan cantumkan perubahan v0.4→v0.5 yang memengaruhi constraint. Jangan menyalin aturan lama dari repo ke migrasi baru.
2. Finalkan nama tabel, FK, unique/check/index bersama Backend untuk kelompok identitas, konten, dan asesmen; buat ERD fisik dan migrasi bertahap.
3. Sepakati kontrak JSON soal serta seed IDs dengan Curriculum, Data/AI, dan tiap tim fitur sebelum menulis seed kaya data.
4. Jalankan migrasi + seed dua kali pada DB kosong untuk membuktikan idempotensi, lalu uji alur demo inti dan constraint negatif.
5. Deploy migrasi yang sama ke Supabase demo/staging dengan rahasia di environment, verifikasi koneksi server, dan simpan catatan versi migrasi. Deployment produksi dan data siswa nyata menunggu keputusan operasional/privasi.
