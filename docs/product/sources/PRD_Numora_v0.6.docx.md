**PRODUCT REQUIREMENTS DOCUMENT**

**NUMORA**

**Sistem Latihan, Simulasi TKA, PvP, dan Pembelajaran Berbasis Kelas**

| Atribut | Keterangan |
| :---- | :---- |
| Versi | 0.6 — Final |
| Tanggal | 03 Oktober 2026 |
| Pemilik | Product Owner — Departemen Product & Design |
| Status | Final — keputusan produk pada scope dokumen telah dikunci |
| Pengguna | PO, Research & Curriculum, UI/UX, Software, Data/AI, QA, DevOps |
| Basis | PRD v0.5 \+ keputusan final PO hasil konsolidasi lintas tim |

| STATUS DOKUMEN Tidak terdapat daftar OPEN pada versi ini. Detail teknis yang bukan domain produk dinyatakan sebagai dependency kepada tim terkait. |
| :---- |

Dokumen ini menjadi source of truth untuk scope, perilaku fitur, permission, business rules, alur, scoring, data minimum, acceptance criteria, dan batas handoff.

# **1 Ringkasan dan Tujuan Produk**

Numora adalah platform web responsif untuk latihan dan simulasi TKA Matematika bagi siswa SMP/MTs. Produk menggabungkan Drill bertingkat, Tryout berbasis batch, PvP realtime, leaderboard, monitoring guru, feedback, pelaporan konten, dan pengelolaan operasional serta konten oleh admin.

| Tujuan | Indikator |
| :---- | :---- |
| Latihan berkelanjutan | Attempt Drill/Tryout selesai; tingkat penyelesaian dan frekuensi aktivitas. |
| Perkembangan | Nilai terakhir, level terbuka/selesai, progres subbab, riwayat, XP. |
| Tindak lanjut guru | Monitoring siswa aktif dan feedback yang dikirim/dibaca. |
| Kualitas konten | Report valid dan tindak lanjut dapat ditelusuri. |
| PvP | Match selesai, reconnect/forfeit, Poin per soal, Best Poin mingguan. |

| PRINSIP XP \= reward aktivitas belajar (Drill \+ Tryout). Poin PvP \= performa pertandingan. Keduanya tidak dicampurkan. |
| :---- |

# **2 Ruang Lingkup**

| Domain | Cakupan MVP |
| :---- | :---- |
| Akun | Google Auth, role, profil, display name, foto profil opsional. |
| Sekolah/Kelas | Credential guru, create/join/leave class, multiple class, ban, takeover. |
| Learning | Pretest, Drill, progress, history, bintang, XP. |
| Assessment | Tryout 30 soal, weekly batch, auto-submit, result \+ pembahasan. |
| PvP | Room, invite, realtime, disconnect/reconnect, Poin, Best Poin. |
| Leaderboard | Aktivitas global/kelas; PvP per difficulty. |
| Support | Feedback guru, recommended video, report soal/video. |
| Admin | Super Admin; Admin Operasional; Admin Content, Data & Moderation. |

Post-MVP: pembayaran/pembelian Tryout lama, multi-varian Drill, personalisasi adaptif penuh, aplikasi native, sertifikasi resmi, dan materi Bahasa Indonesia.

| BOUNDARY Blueprint akademik dan validitas konten mengikuti Curriculum. Algoritma/pipeline IRT mengikuti Data/AI. Stack, API, storage, dan arsitektur mengikuti Software/DevOps. |
| :---- |

# **3 Akun, Role, dan Permission**

## **3.1 Akun & Profil**

* Semua siswa dan guru menggunakan Google Auth.  
* Satu Google Account hanya dapat memiliki satu akun Numora.  
* Email berasal dari Google Auth dan tidak dapat diubah.  
* Display name dapat diedit melalui Edit Profile.  
* Foto profil opsional; default menggunakan avatar sistem.  
* User dapat mengunggah foto melalui Edit Profile.  
* Jika foto dihapus, sistem kembali menggunakan avatar default.  
* Foto yang sama digunakan pada area yang mendukung identitas visual seperti profil, PvP, leaderboard, dan konteks feedback.

## **3.2 Role Admin**

| Role | Tanggung jawab utama |
| :---- | :---- |
| Super Admin | Full access seluruh modul admin; mengelola akun admin, role, permission, dan emergency access. |
| Admin Operasional | Sekolah, guru, credential, kelas, dan data operasional siswa. |
| Admin Content, Data & Moderation | Import konten, assessment, report/moderation, video, dan aggregated analytics. |

## **3.3 Batas Permission**

| Capability | Super Admin | Admin Operasional | Admin Content, Data & Moderation |
| :---- | :---- | :---- | :---- |
| Admin account/permission | Full | — | — |
| Sekolah/guru/credential | Full | Full | View terbatas |
| Kelas/membership | Full | Full | View terbatas |
| Data siswa | Full | Operasional | Aggregated |
| Content & assessment | Full | — | Full |
| Report & moderation | Full | — | Full |
| Analytics | Full | Operasional | Aggregated |
| Ban/unban siswa | Tidak | Tidak | Tidak |

# **4 Status Operasional Siswa**

| Active class membership | Status |
| :---- | :---- |
| 0 kelas | User Mandiri |
| 1-5 kelas | User Sekolah |
| Keluar sebagian, masih punya kelas | User Sekolah |
| Keluar semua kelas | User Mandiri |
| Banned satu kelas, masih punya kelas lain | User Sekolah |

Status bersifat dinamis berdasarkan active class membership. Progres akademik, riwayat, dan XP melekat pada akun, bukan pada kelas.

# **5 Sekolah, Credential, dan Kelas**

## **5.1 Credential Guru**

* Credential/token dibuat untuk sekolah tertentu.  
* Single-use dan berlaku 3×24 jam.  
* Token invalid setelah digunakan atau expired.  
* Token dapat dibuat ulang tanpa batas yang ditetapkan pada MVP.  
* Guru melakukan Google Auth → pilih role Guru → pilih sekolah → input credential → verifikasi.

## **5.2 Kelas**

* Guru terverifikasi dapat membuat unlimited kelas.  
* Satu kelas memiliki satu guru aktif pada satu waktu.  
* Sistem menghasilkan kode, link, dan QR.  
* Kode kelas permanen dan tidak diregenerate pada MVP.  
* Siswa dapat memiliki maksimal 5 kelas aktif.  
* Siswa boleh bergabung pada kelas dari sekolah/lembaga berbeda.

## **5.3 Leave & Ban**

| Aksi | Perilaku |
| :---- | :---- |
| Leave | Membership berakhir; progres, history, XP, dan feedback historis tetap ada. |
| Ban | Membership dihapus; siswa tidak dapat join kembali sampai unban. |
| Ban \+ kelas lain | Status tetap User Sekolah; kelas lain tidak terpengaruh. |
| Ban kelas terakhir | Status menjadi User Mandiri. |

# **6 Guru Keluar Sekolah & Takeover**

| Kondisi | Perilaku |
| :---- | :---- |
| Guru keluar sekolah | Kelas lama tetap aktif; data tidak dihapus. |
| Siswa di kelas | Tetap menjadi anggota. |
| Leaderboard | Tetap berjalan. |
| Siswa baru | Tetap dapat join dengan kode permanen. |
| Monitoring | Tidak tersedia selama kelas tidak memiliki guru aktif. |
| Feedback | Tidak dapat dibuat selama kelas tidak memiliki guru aktif. |

## **6.1 Takeover Kelas Lama**

1. Guru baru login dan memiliki credential sekolah yang valid.  
2. Pada Create Class, guru memilih opsi mengambil alih kelas lama.  
3. Guru memasukkan kode kelas lama.  
4. Sistem memvalidasi kode dan kesesuaian sekolah.  
5. Jika valid, guru baru menjadi guru aktif.  
6. Guru lama kehilangan akses.  
7. Jika guru lama kembali setelah takeover, kelas tidak kembali otomatis kepadanya.

| KELAS TANPA GURU State Active \+ active\_teacher \= null merupakan state valid. Kelas tetap dapat menerima siswa dan mempertahankan leaderboard. |
| :---- |

# **7 Struktur Materi & Pretest**

* Hierarki materi: Bab → Subbab → Level.  
* Satu subbab memiliki 5 level pada MVP.  
* Satu level memiliki 10 soal Drill.  
* Curriculum menentukan blueprint, indikator, urutan, kesulitan, dan distribusi akademik.

## **7.1 Pretest**

* Opsional dan dapat di-skip.  
* 20 soal per bab.  
* Hanya dapat dikerjakan satu kali seumur hidup per bab.  
* Jika skip: mulai Level 1 pada seluruh subbab.  
* Tidak memberikan XP dan tidak masuk leaderboard.  
* Pemetaan unlock mengikuti rule produk dan konteks blueprint Curriculum.

| Benar | Level awal |
| :---- | :---- |
| 0–7 | Level 1 |
| 8–18 | Level 2 |
| 19–20 | Level 3 |

| CATATAN Detail distribusi 20 soal dan pemetaan akademik per indikator mengikuti blueprint Curriculum; PRD ini tidak mendefinisikan pembagian soal per subbab. |
| :---- |

# **8 Drill**

## **8.1 Flow**

8. Latihan → Bab → Subbab → Level → Mulai.  
9. Soal ditampilkan satu per satu.  
10. Timer count-up dan tidak dapat dipause.  
11. Jawaban disimpan selama sesi sesuai state penyimpanan yang tersedia.  
12. Submit membuka confirmation modal.  
13. Setelah submit: hasil, nilai, XP, bintang, pembahasan, dan status unlock.

## **8.2 Ketuntasan & Retry**

* ≥80% benar \= lulus dan dapat membuka level berikutnya.  
* \<80% \= retry level yang sama.  
* Level yang sudah terbuka tidak dapat terkunci kembali.  
* Level yang telah selesai tetap dapat diulang.  
* Setiap attempt disimpan pada riwayat level.  
* Nilai/bintang yang ditampilkan sebagai kondisi terkini menggunakan attempt terbaru.

## **8.3 Bintang**

| Nilai | Bintang |
| :---- | :---- |
| 0 | 0 |
| 10–50 | 1 |
| 51–99 | 2 |
| 100 | 3 |

* Bintang hanya berdasarkan nilai akhir attempt terbaru.  
* Bintang tidak digunakan untuk unlock, XP, leaderboard, atau ranking.

# **9 XP Drill**

| FORMULA FINAL XP Dasar \= (Jumlah Benar / Total Soal) × 100Bonus \= max(0, (900 detik − Waktu Pengerjaan) / 900 × 50\)XP Akhir \= min(150, XP Dasar \+ Bonus) |
| :---- |

| Parameter | Aturan |
| :---- | :---- |
| Total soal | 10 per level. |
| Referensi bonus | 15 menit / 900 detik. |
| \<15 menit | Mendapat bonus kecepatan. |
| \>=15 menit | Bonus \= 0\. |
| Rentang | 0–150 XP. |
| Pretest | 0 XP. |
| Bintang | Tidak memengaruhi XP. |

XP Drill langsung menjadi bagian dari akumulasi XP aktivitas untuk leaderboard.

# **10 Riwayat, Snapshot, Video & Report**

* MVP Drill hanya memiliki satu varian/paket soal per level.  
* Mekanisme multi-varian berada di luar scope MVP.  
* Setiap attempt mempertahankan konteks konten yang dikerjakan.  
* Perubahan/archive konten tidak mengubah hasil historis.  
* Riwayat level menyimpan attempt, waktu, nilai, XP, bintang, dan pembahasan terkait.

## **10.1 Recommended Video**

* Hanya muncul ketika siswa gagal Drill.  
* Rekomendasi terkait subbab; maksimal 3 video.  
* Video diarahkan ke YouTube.  
* Jika tidak ada video relevan, hasil Drill tetap dapat ditampilkan.

## **10.2 Report**

| Report Soal | Report Video |
| :---- | :---- |
| Soal salah/keliru | Tidak relevan |
| Pilihan jawaban bermasalah | Video tidak tersedia |
| Gambar/media bermasalah | Link rusak |
| Soal tidak jelas | Kualitas/isi bermasalah |
| Lainnya | Lainnya |

Siswa hanya menerima confirmation setelah report dikirim. Admin Content, Data & Moderation menangani tindak lanjut.

# **11 Tryout**

| Parameter | Aturan final |
| :---- | :---- |
| Jumlah soal | 30 soal. |
| Batch | Senin 00:00 – Minggu 23:59 WIB. |
| Paket | Sama untuk seluruh peserta batch. |
| Attempt | 1× per user untuk paket ongoing. |
| Timer | Countdown. |
| Batch close | Attempt aktif otomatis submit. |
| Hasil | Maksimal 3×24 jam setelah batch ditutup. |

* Ongoing Tryout gratis untuk seluruh user pada MVP.  
* Tryout yang sudah lewat tidak dapat dikerjakan ulang pada MVP.  
* Pembelian paket lama merupakan post-MVP.  
* Paket lama yang kelak dibeli tidak mengubah hasil IRT batch lama.

## **11.1 Hasil**

* Nilai simulasi skala 0–100.  
* Nilai final tidak berubah setelah tersedia.  
* Nilai dan pembahasan muncul bersama setelah hasil proses tersedia.  
* Jika proses belum selesai: 'Hasil sedang diproses'.

# **12 Scoring & XP Tryout**

| Jenis | Aturan |
| :---- | :---- |
| PG | Satu jawaban benar. |
| PGK MCMA | Partial scoring diperbolehkan. |
| PGK Kategori | Partial scoring diperbolehkan. |

Rubrik detail PGK mengikuti aturan penilaian Research & Curriculum.

| XP TRYOUT XP Tryout \= Skor Benar Ekuivalen × 10 |
| :---- |

Skor benar ekuivalen berasal dari hasil penilaian butir. Partial scoring dapat membuat skor benar ekuivalen desimal. Contoh: 24 full correct \+ 0,5 partial \= 24,5 → 245 XP.

* XP dihitung segera ketika attempt selesai, tanpa menunggu IRT.  
* XP bukan hasil IRT dan tidak mengubah nilai simulasi.

# **13 IRT — Product Boundary**

| OWNERSHIP Metode, formula, parameter, threshold statistik, kalibrasi, dan pipeline IRT bukan scope PRD produk. Seluruh detail tersebut dikelola Data/AI. |
| :---- |

| State produk | Perilaku |
| :---- | :---- |
| Batch ditutup | Data attempt batch diteruskan ke proses IRT Data/AI. |
| Proses selesai \<72 jam | Hasil langsung dapat dibuka. |
| Belum selesai | User melihat status hasil sedang diproses. |
| Batas SLA | Nilai \+ pembahasan tersedia maksimal 3×24 jam setelah batch tutup. |
| Hasil final | Tidak berubah. |
| Attempt paket lama post-MVP | Tidak menjadi data IRT dan tidak mengubah batch lama. |

# **14 PvP Realtime**

## **14.1 Room**

* Match tidak dibatasi tipe User Mandiri/User Sekolah.  
* Create room memilih Mudah/Sedang/Sulit.  
* Room yang belum dimulai berlaku 10 menit.  
* Invite berlaku 10 menit atau gugur saat room digunakan untuk match lain.  
* Host dapat membubarkan room; host keluar waiting room → room bubar.  
* Invite teman sekelas adalah shortcut, bukan pembatas matchmaking.

## **14.2 Arena**

* 10 soal per match; timer countdown per soal.  
* Kedua pemain mendapat soal yang sama.  
* Submit mengunci jawaban.  
* Soal berikutnya muncul saat kedua pemain menjawab atau timer habis.  
* Kunci/pembahasan tidak ditampilkan selama match.  
* Pindah tab tidak dianggap keluar; timer tetap berjalan.

# **15 Poin PvP & Disconnect**

| FORMULA POIN Benar \= 100 \+ floor(50 × Sisa Waktu / Durasi Soal)Salah/kosong \= 0 |
| :---- |

| Konsep | Definisi |
| :---- | :---- |
| Poin PvP | Skor yang diperoleh dari satu soal. |
| Total Poin | Akumulasi seluruh soal dalam satu match. |
| Best Poin | Total Poin tertinggi dalam satu match per difficulty selama periode mingguan. |
| Periode | Mingguan; reset Rabu 23:59 WIB. |

## **15.1 Connection**

| Kondisi | Perilaku |
| :---- | :---- |
| Disconnect | Reconnect 20 detik; timer tetap berjalan. |
| Reconnect berhasil | Lanjut state match tanpa mengulang soal. |
| Tidak reconnect | Forfeit; kalah otomatis. |
| Forfeit | Histori tetap tercatat; tidak memenuhi syarat Best Poin. |
| Gangguan sistem | Match dibatalkan tanpa menang/kalah dan tanpa Best Poin. |

# **16 Leaderboard**

## **16.1 Leaderboard Aktivitas**

| Leaderboard | Scope | Sumber |
| :---- | :---- | :---- |
| Kelas | Anggota kelas aktif | XP Drill \+ XP Tryout |
| Global | Seluruh siswa | XP Drill \+ XP Tryout |

* Siswa yang mengikuti beberapa kelas muncul pada leaderboard seluruh kelas yang diikutinya.  
* XP bersifat account-based; kelas hanya menjadi scope leaderboard.  
* Leave tidak menghapus kontribusi XP historis.  
* Ban langsung menghilangkan siswa dari leaderboard kelas tersebut, tetapi histori XP tetap tersimpan.

## **16.2 Leaderboard PvP**

| Tab | Dasar |
| :---- | :---- |
| Mudah | Best Poin Mudah |
| Sedang | Best Poin Sedang |
| Sulit | Best Poin Sulit |

* Top 10 \+ posisi diri sendiri jika di luar Top 10\.  
* Top 3 dapat menampilkan foto profil; posisi lainnya minimal nama tampilan.  
* Email dan riwayat belajar tidak ditampilkan.  
* Reset Rabu 23:59 WIB; periode lama di-archive.  
* Leaderboard bukan indikator kemampuan akademik.

# **17 Monitoring & Feedback**

## **17.1 Monitoring Guru**

* Guru hanya memonitor siswa yang masih menjadi anggota aktif kelasnya.  
* Guru melihat progres level, riwayat Drill, Tryout, nilai terakhir, dan nilai terbaik sesuai data yang tersedia.  
* Poin PvP tidak menjadi bagian monitoring akademik.  
* Setelah siswa leave/ban, akses monitoring guru berakhir.

## **17.2 Feedback**

* Feedback satu arah: Guru → Siswa.  
* Feedback baru menambah histori.  
* Notifikasi memiliki dua tab: Notifikasi Sistem dan Feedback Guru.  
* Feedback mencantumkan guru, kelas, waktu, dan isi.  
* Feedback lama tetap tersedia setelah siswa leave.  
* Feedback dari beberapa guru dapat tampil bersama.

# **18 Admin Content, Data & Moderation**

## **18.1 Initial Import**

* Initial content masuk melalui import JSON pada modul admin.  
* Gambar/media diunggah ke Cloudflare R2.  
* JSON menyimpan link/referensi asset.  
* Curriculum menentukan blueprint, indikator, kesulitan, dan validitas akademik.

## **18.2 Lifecycle**

| State | Makna |
| :---- | :---- |
| Draft | Konten masih disusun/import. |
| Ready | Metadata dan requirement konten terpenuhi. |
| Revision | Konten memerlukan perbaikan. |
| Archive | Tidak aktif untuk penggunaan baru; histori dipertahankan. |

* Soal tidak dapat Ready tanpa metadata, kunci, dan pembahasan yang diperlukan.  
* Perubahan penting mencatat pelaku dan waktu.  
* Perubahan konten tidak mengubah hasil historis.

# **19 Admin Operasional**

| Area | Capability |
| :---- | :---- |
| Sekolah | Create, edit, status aktif/nonaktif, lihat struktur. |
| Guru | Data operasional dan verifikasi credential. |
| Credential | Generate, lihat status, regenerate. |
| Kelas | Lihat struktur, guru aktif/tidak aktif, anggota. |
| Siswa | Lihat data operasional dan status User Mandiri/User Sekolah. |

| BATAS Admin Operasional tidak memiliki ban/unban siswa dan tidak mengubah hasil akademik atau formula produk. |
| :---- |

# **20 Data Model Minimum**

| Entitas | Data minimum |
| :---- | :---- |
| Account | ID, role, display name, email/auth, photo, status. |
| School | ID, nama, alamat, status. |
| Credential | ID, school, code, created\_at, expires\_at, status, used\_by. |
| Class | ID, school, active\_teacher, code, link/QR, status. |
| Membership | student, class, joined/left, status, ban state. |
| Material | bab, subbab, level, indikator, urutan, kesulitan. |
| Question | form, difficulty, options, key, explanation, assets, version, status. |
| Package | type, question order, configuration, batch. |
| Attempt | user, assessment/level, times, answers, score, XP, status, version. |
| Progress | user, level, unlock source, latest score, latest stars, completion. |
| PvP Match | room, players, difficulty, per-question answer/time/Poin, result, connection state. |
| Leaderboard | period, scope, user/class, XP/Best Poin, rank, archive. |
| Feedback | sender, recipient, class, timestamp, content, read state. |
| Report | reporter, content reference, category, context, status, resolution. |

# **21 Analytics Event Baseline**

| Event | Trigger |
| :---- | :---- |
| account\_registered / profile\_updated | Akun/profil berhasil dibuat/diubah. |
| class\_joined / class\_left | Membership dibuat/berakhir. |
| student\_banned / unbanned | Guru melakukan ban/unban. |
| teacher\_verified | Credential guru valid. |
| class\_created / class\_takeover | Kelas dibuat/diambil alih. |
| pretest\_started / completed | Pretest dimulai/selesai. |
| drill\_started / completed | Attempt Drill dimulai/selesai. |
| level\_unlocked / star\_earned | Level unlock/bintang ditetapkan. |
| tryout\_started / completed | Attempt Tryout dimulai/selesai. |
| tryout\_batch\_closed | Batch ditutup. |
| pvp\_started / completed | Match dimulai/selesai. |
| pvp\_disconnected / reconnected / forfeit | State koneksi berubah. |
| feedback\_sent / read | Feedback dikirim/dibaca. |
| question\_reported / video\_reported | Report dikirim. |
| leaderboard\_archived | Periode leaderboard diarsipkan. |
| irt\_result\_available | Hasil IRT tersedia untuk produk. |

Schema event rinci disusun Data bersama PO. Event algoritmik IRT tetap menjadi domain Data/AI.

# **22 Persyaratan Nonfungsional**

| ID | Requirement |
| :---- | :---- |
| NFR-01 Access | Role, status user, dan membership divalidasi server-side. |
| NFR-02 Reliability | Tidak ada duplicate attempt/XP/Poin akibat refresh atau submit ulang. |
| NFR-03 Timer | Waktu assessment/PvP otoritatif dan tidak dipengaruhi jam perangkat. |
| NFR-04 Realtime | PvP menggunakan WebSocket dan reconnect 20 detik. |
| NFR-05 UI | Responsive; loading, empty, error, validation, success, expired/access denied jelas. |
| NFR-06 Privacy | Data pribadi dan hasil detail mengikuti role/membership; PvP tidak membuka history lawan. |
| NFR-07 Audit | Perubahan penting konten dan tindakan admin dapat ditelusuri. |
| NFR-08 Integrity | Histori mempertahankan konteks konten yang dikerjakan. |
| NFR-09 Leaderboard | Update/reset/archive mengikuti periode produk. |
| NFR-10 Storage | State attempt disimpan dan dipulihkan sesuai kemampuan implementasi. |

# **23 User Flow & Handoff**

## **23.1 Siswa**

Landing → Google Auth → Role Siswa → Profil → Dashboard → Drill / Tryout / PvP / Progress / Notifikasi.

## **23.2 Join/Leave**

Join Class → kode/link/QR → validasi → active membership. Leave → confirmation → membership berakhir → status ditentukan ulang.

## **23.3 Drill**

Latihan → Bab → Subbab → Level → Detail → Mulai → Soal → Submit → Result → XP/Bintang → Pembahasan → Retry jika gagal.

## **23.4 Tryout**

Tryout → Ongoing Package → Detail/Tutorial/Rules → Mulai → Countdown → Submit/Auto-submit → XP → menunggu hasil → Nilai \+ Pembahasan.

## **23.5 PvP**

PvP → Create/Join Room → Waiting Room → Invite/Join → Difficulty → Disclaimer → Ready → Arena → Summary → Best Poin jika valid.

## **23.6 Guru**

Google Auth → Role Guru → Sekolah \+ Credential → Verifikasi → Dashboard → Create/Takeover Class → Monitoring → Feedback.

## **23.7 Admin**

Login internal → sesuai role admin → modul yang diizinkan → action → audit.

# **24 Acceptance Criteria Konsolidasi**

| ID | Acceptance criterion |
| :---- | :---- |
| AC-01 | Google Account menghasilkan satu akun Numora; email tidak dapat diedit. |
| AC-02 | Display name dan foto profil dapat dikelola sesuai aturan profil. |
| AC-03 | Siswa maksimal memiliki 5 active class membership. |
| AC-04 | Leave tidak menghapus progres, history, XP, atau feedback historis. |
| AC-05 | Ban menghapus membership dan mencegah rejoin sampai unban. |
| AC-06 | Kelas tanpa guru tetap aktif, menerima siswa, dan memiliki leaderboard. |
| AC-07 | Guru baru dapat takeover kelas dengan kode lama dan credential sekolah valid. |
| AC-08 | Pretest 20 soal/bab, sekali/bab, dapat di-skip, dan mengikuti mapping unlock final. |
| AC-09 | Level terbuka tidak dapat terkunci kembali. |
| AC-10 | Drill attempt disimpan; nilai/bintang terbaru menjadi kondisi terkini. |
| AC-11 | XP Drill berada pada rentang 0–150 dan mengikuti formula final. |
| AC-12 | MVP Drill hanya satu varian. |
| AC-13 | Tryout 30 soal dan batch Senin 00:00–Minggu 23:59 WIB. |
| AC-14 | Attempt Tryout aktif auto-submit saat batch ditutup. |
| AC-15 | XP Tryout dihitung langsung berdasarkan skor benar ekuivalen ×100. |
| AC-16 | Nilai \+ pembahasan tersedia maksimal 72 jam setelah batch ditutup. |
| AC-17 | Hasil Tryout final tidak berubah setelah tersedia. |
| AC-18 | Tryout lama post-MVP tidak memengaruhi IRT batch lama. |
| AC-19 | PvP Poin dihitung per soal dengan formula final. |
| AC-20 | Best Poin dipisah per difficulty dan berlaku mingguan. |
| AC-21 | Reconnect PvP 20 detik; forfeit tidak memenuhi syarat Best Poin. |
| AC-22 | Leaderboard aktivitas memakai XP Drill \+ XP Tryout. |
| AC-23 | Leaderboard PvP memakai Best Poin. |
| AC-24 | Leaderboard reset Rabu 23:59 WIB dan periode lama di-archive. |
| AC-25 | Guru hanya memonitor anggota aktif kelasnya. |
| AC-26 | Feedback historis tetap tersedia setelah leave. |
| AC-27 | Report siswa hanya menghasilkan confirmation. |
| AC-28 | Permission admin mengikuti matriks role pada Bagian 3\. |

# **25 Edge Cases Utama**

| Kasus | Expected behavior |
| :---- | :---- |
| Refresh saat Drill | Peringatan potensi kehilangan state; state tersimpan dapat dipulihkan. |
| Keluar Drill sebelum submit | Attempt tidak final; jawaban yang belum tersimpan dapat hilang. |
| Batch tutup saat Tryout berjalan | Auto-submit state/jawaban terakhir yang tersedia. |
| IRT belum selesai | Hasil menampilkan status sedang diproses. |
| Guru keluar sekolah | Kelas tetap aktif tanpa guru; monitoring/feedback berhenti. |
| Guru baru takeover | Guru lama kehilangan akses; data kelas tetap. |
| Leave semua kelas | Status menjadi User Mandiri. |
| Join kelas kedua | Status tetap User Sekolah; progres global tidak berubah. |
| Ban satu kelas \+ kelas lain | Akses kelas lain tetap. |
| Host PvP keluar waiting room | Room bubar. |
| Room \>10 menit belum dimulai | Expired. |
| Invite \>10 menit | Expired. |
| PvP disconnect \>20 detik | Forfeit; kalah otomatis; tidak Best Poin. |
| Gangguan sistem PvP | Match dibatalkan tanpa hasil dan tanpa Best Poin. |

# **26 Glosarium**

| Istilah | Definisi |
| :---- | :---- |
| User Mandiri | Siswa tanpa active class membership. |
| User Sekolah | Siswa dengan minimal satu active class membership. |
| Active Class | Kelas aktif, termasuk state tanpa guru aktif. |
| Ban | Menghapus membership dan mencegah rejoin sampai unban. |
| Pretest | Asesmen 20 soal per bab untuk menentukan akses level awal. |
| Drill | Latihan bertingkat per subbab dan level. |
| Tryout | Simulasi TKA 30 soal dalam weekly batch. |
| XP | Reward aktivitas belajar dari Drill dan Tryout. |
| Poin PvP | Skor pertandingan per soal. |
| Best Poin | Total Poin tertinggi dalam satu match per difficulty pada periode mingguan. |
| Nilai Terakhir | Nilai dari attempt terbaru. |
| Bintang | Indikator hasil attempt Drill terbaru; tidak digunakan untuk ranking. |
| Feedback | Pesan satu arah guru kepada siswa. |
| Snapshot | Konteks konten yang mempertahankan histori hasil. |
| Batch Tryout | Senin 00:00 sampai Minggu 23:59 WIB. |
| IRT | Item Response Theory; algoritma merupakan domain Data/AI. |
| Archive | Penyimpanan histori periode yang tidak lagi aktif. |

# **27 Riwayat Versi & Finality**

| Versi | Tanggal | Perubahan |
| :---- | :---- | :---- |
| 0.2 | 15 Sep 2026 | Dokumen acuan awal. |
| 0.3 | 18 Sep 2026 | Penyelarasan kelas, Pretest, Drill, Tryout, PvP, leaderboard, integritas hasil. |
| 0.4 | 22 Sep 2026 | Sekolah/token, Drill count-up, XP, Tryout, PvP realtime, video, IRT, report. |
| 0.5 | 28 Sep 2026 | Dua status operasional, weekly Tryout, Pretest unlock, bintang, global/class leaderboard, PvP lintas tipe. |
| 0.6 | 03 Oct 2026 | Finalisasi multiple class, leave/ban, guru keluar/takeover, role admin, foto profil, XP/Poin separation, weekly IRT boundary, single variant, final scoring, monitoring, permission, edge cases. |

| FINAL Versi 0.6 tidak memiliki status OPEN. Kebutuhan baru atau perubahan business rule setelah dokumen ini disepakati harus dicatat sebagai revisi PRD berikutnya beserta alasan, owner keputusan, tanggal berlaku, dan dampak modul. |
| :---- |

## Addendum keputusan owner — 5 Oktober 2026

**ENGINEERING DECISION — koreksi produk oleh Aini:** XP TryOut mengikuti §12: skor benar ekuivalen ×10, tanpa bonus waktu, dihitung saat selesai tanpa menunggu IRT. AC-15 ×100 pada sumber di atas disupersede oleh keputusan ini; teks sumber dipertahankan untuk audit. Contoh 24,5 menghasilkan 245 XP; 30 menghasilkan 300 XP. Rubrik PGK tetap disediakan Research & Curriculum. [Implementasi dan kompatibilitas historis](../../development/TRYOUT_XP_V06.md).
