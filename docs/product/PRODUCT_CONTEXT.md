**ENGINEERING DECISION — Aini, 6 October 2026:** Student result pages expose a Lihat pembahasan action leading to dedicated read-only question-layout pages. Typed PGK save/resume, server-derived review states, expandable reward details and Info nilai reuse the Student design system. This does not approve a PGK rubric or create an IRT/fallback publication policy. [Implementation boundary](../development/STUDENT_PGK_RESULT_UI.md).

> **PRD RULE - 4 October 2026:** [PRD v0.6 Final](sources/PRD_Numora_v0.6.docx.md), supplied by the project owner, supersedes conflicting earlier product rules. Relevant content rules: Admin content access requires Super Admin or Content/Data/Moderation; initial JSON import and R2 media; 5 levels per subchapter and 10 Drill items per level; one Drill variant per level for MVP; TryOut has 30 items. Historical decisions below remain evidence, not overriding policy.
>
> **ENGINEERING DECISION:** importer/preview rollout imports DRAFT only, with all preview scores null. No production publication, PGK grading, XP, or IRT is enabled by preview.
>
> **OPEN / dependency:** Curriculum still supplies approved taxonomy, blueprint, difficulty and PGK rubric; Data/AI supplies IRT details. **ENGINEERING DECISION — product correction by Aini, 5 October 2026:** TryOut XP uses correct-equivalent ×10, without speed bonus, immediately on completion (§12); this supersedes AC-15 ×100. The source wording remains historical evidence. See [decision and prospective compatibility](../development/TRYOUT_XP_V06.md). Full admin permission matrix and Ready/Revision/Archive workflow are tracked separately; content-only capability is not full RBAC acceptance.

> **USER CLARIFICATION — Reyhan, 5 October 2026:** Tryout XP is equivalent-correct ×10; AC-15's ×100 is a typo. PRD v0.6 also supersedes the one-class rule, variant rotation, 90-day explanation expiry and unresolved XP/star rules below. [Data alignment and rollout](../data/PRD_V06_DATA_ALIGNMENT.md) records the implementation and remaining feature dependencies. Curriculum still supplies approved taxonomy, blueprint, difficulty and PGK rubric; Data/AI supplies IRT details. Historical sections below do not override v0.6.

**ENGINEERING DECISION — owner clarification, 6 October 2026:** Pretest is available to every Student. Skip unlocks Level 1 without consuming completion; an active attempt and saved answers remain resumable. Pretest may be taken after Drill until completed; placement only adds unlocks, never Drill completion. One active attempt/account/chapter, server autosave/resume, no expiry, and optimistic answer revisions are approved. Tryout follows supplied feature v1.2: 30 items, 600 seconds, Monday 00:00 to Sunday **23:59:00 Asia/Jakarta**, deadline capped by close, Past metadata visible with Start/payment disabled. XP remains ×10 (the supplied ×100 is a typo), preserving existing policy pins. Approved content/blueprint, PGK grading/publication, and IRT/fallback computation are deferred; TEST/DEMO infrastructure does not authorize production publication. See [implementation boundary](../development/PRETEST_TRYOUT_LIFECYCLE.md).

# Product Context — Numora

**ENGINEERING DECISION — klarifikasi lanjutan Aini, 5 Oktober 2026:** bobot produk PG=2, MCMA=3, Kategori=3 final; parsial berkontribusi pada scoring ketuntasan Drill dan XP dasar benar ekuivalen ×10, ditambah bonus kecepatan existing. Bintang mengikuti nilai akhir Drill. Mode hasil fallback IRT berlaku seluruh batch. Rubrik PGK, pemetaan kategori/nilai IRT dan rumus nilai scoring biasa tetap memerlukan pengesahan; [rincian Drill](../development/DRILL_V06_REWARDS.md#klarifikasi-pgk--5-oktober-2026).

**ENGINEERING DECISION — klarifikasi Aini, 5 Oktober 2026:** XP TryOut selalu diposting saat submit. Jika parsial dapat dihitung, XP = ceil((benar penuh + benar ekuivalen parsial) ×10); jika perhitungan parsial terkendala saat submit, fallback XP = benar penuh ×10. Keputusan ini terpisah dari skor IRT dan tidak mengubah XP setelah hasil IRT tersedia. Pembahasan dirilis bersama hasil; IRT yang belum menghasilkan hasil valid hingga 72 jam setelah batch ditutup memakai scoring biasa. Rubrik PGK dan rumus nilai scoring biasa masih memerlukan spesifikasi; [rincian dan batas implementasi](../development/TRYOUT_XP_V06.md#klarifikasi-fallback-xp--5-oktober-2026).

**PRD RULE / current Drill — 5 October 2026:** PRD v0.6 §8–10 supersedes the historical Drill TBC text below: base XP = correct/10 ×100, bonus = max(0,(900−server duration seconds)/900 ×50), cap 150; 0/1/2/3 stars at score 0/10–50/51–99/100; latest attempt determines displayed stars/score; one package per level may repeat, unlock never relocks. Every completed attempt uses its pinned policy and preserves history.

**ENGINEERING DECISION — Aini:** round the final XP once to nearest integer; new Drill explanation access has no expiry; confirm every unfinished Drill exit, with timer continuing and unsaved-loss notice. Applies prospectively, without legacy XP backfill. [Decision, compatibility and rollout](../development/DRILL_V06_REWARDS.md). JOB-11 TryOut XP and JOB-17 leaderboard remain separate dependencies.

**Product source:** [Drill v1.2](sources/PRD_01_Drill_Latihan_Soal.docx.md) dan [TryOut v1.1](sources/PRD_02_Core_Learning_TryOut.docx.md), diberikan pengguna pada 2 Oktober 2026, mengungguli konteks v0.5 yang berbeda untuk fitur tersebut. [Rekonsiliasi](CORE_LEARNING_PRD_UPDATE_2026-10-02.md) mencatat perubahan dan gap implementasi. Baseline lintas fitur: team-approved PRD v0.5, 28 September 2026. The supplied PDF still labels itself a consolidated draft for review; the Software Engineering coordinator confirmed team approval on 28 September 2026. Explicit OPEN items remain unresolved.
**Document purpose:** shared context for Software, Data/AI, QA, UI/UX, Research & Curriculum, and coding agents.

**ENGINEERING UPDATE, 29 September 2026:** the Database team has prepared one shared Supabase Cloud Development project. This updates the Development environment setup only; the staging domain/project dependency and product rules below remain open as recorded.

## 1. Tujuan dan tahap produk

Numora menyediakan latihan TKA Matematika bagi siswa kelas IX SMP/MTs melalui web responsif. Hipotesis masalahnya: latihan belum terarah, hasil kurang memberi tindak lanjut, guru sulit memantau progres, dan latihan dapat membosankan. Hipotesis ini perlu diuji dengan pengguna; daftar fitur bukan bukti validasi.

Target terdekat adalah **staging online siap diuji sekitar 12 Oktober 2026** oleh Siswa dan Guru sungguhan dari sekolah. **Sekolah mitra belum ditentukan.** Perkiraan awal peserta adalah **lebih dari 20 Siswa dan/atau beberapa Guru/Kelas**; jumlah tepatnya belum ditetapkan. Uji coba pertama mencakup Siswa yang bergabung ke kelas; alur User Mandiri menyusul.

Ruang lingkup minimum prototipe:

- Admin melihat daftar, membuat, mengedit, dan mengubah status sekolah; menerbitkan, membuat ulang, dan mencabut token guru melalui UI.
- Guru login Google, memilih sekolah, memverifikasi token, membuat kelas, lalu membuka daftar kelas dan detail siswa miliknya. Detail menunjukkan status level serta nilai Drill terakhir dan terbaik.
- Siswa login Google, bergabung ke kelas, mengerjakan 10 soal PG demo Level 1 dengan empat opsi `A`–`D` dan rumus sederhana dalam LaTeX inline, lalu melihat hasil/progres tersimpan; skor **≥80%** membuka Level 2.
- Draf soal demo disiapkan tim Software bersama Curriculum, diberi label jelas, dan **ditinjau Curriculum sebelum uji coba**; hasilnya tidak dipresentasikan sebagai ukuran kemampuan TKA resmi.
- Schema JSON soal yang ada ditujukan untuk impor dari Data/AI, bukan sebagai format fixture demo atau respons soal untuk Siswa. Empat opsi dan LaTeX inline adalah pilihan untuk prototipe pertama; detail akademik final tetap mengikuti Curriculum/PRD.
- Uji coba belum dimulai jika login, hak akses, penyimpanan jawaban/hasil, atau aturan unlock 80% gagal. Tim Product/Design bersama sekolah mengurus izin sekolah, persetujuan peserta/wali bila diperlukan, dan pemberitahuan soal demo.

Domain staging serta akses proyek Supabase/Google OAuth **belum tersedia** pada 28 September 2026; penyediaannya adalah dependensi nyata untuk uji coba online. Guru hanya boleh melihat progres siswa dari kelas yang ia kelola.

Desain/wireframe masih akan disiapkan divisi UI/UX. **Mock UI sederhana boleh dipakai untuk pengembangan awal dan uji coba sekolah pertama**, selama alur berfungsi dan aksesibilitas dasarnya terpenuhi. Penyedia hosting staging dan penanggung jawab setup akan **diputuskan bersama tim**; keduanya belum dipilih. Koordinasi domain oleh DevOps dan Supabase/Google OAuth oleh tim Database adalah perkiraan pembagian kerja yang **belum dikonfirmasi**.

Uji coba pertama hanya menguji rantai **Admin → Guru → Siswa → Drill → progres Guru**. Pretest, Tryout, PvP, leaderboard, feedback, dan alur Mandiri tetap bagian dari PRD v0.5 tetapi bukan sasaran sesi pertama.

Pengembangan untuk penggunaan lebih luas adalah tahap berikutnya. Sasaran Sprint 2 yang lebih sempit ada di `docs/development/SPRINT_2_GOAL.md`.

## 2. Skema pengguna, peran, dan akses

Role tetap `Student`, `Teacher`, dan `Admin`. `Student` memiliki dua status afiliasi, bukan dua role baru:

| Status Student           | Akses MVP setelah PRD fitur terbaru                                                                             | Batas utama                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User Mandiri             | Login Google, Drill, TryOut gratis, membuat room PvP dan membagikan kode, leaderboard PvP global                | Belum bergabung kelas; leaderboard kelas dan undangan teman sekelas tetap memerlukan kelas. Akses Pretest mempertahankan baseline kelas v0.5 sambil menunggu rekonsiliasi; tidak ada payment TryOut MVP |
| User Terafiliasi Sekolah | Seluruh fitur belajar yang tersedia gratis; leaderboard kelas dan global; dapat mengundang teman sekelas ke PvP | Maksimal satu kelas; tidak melihat hasil pribadi siswa lain                                                                                                                                             |

User Mandiri dapat bergabung ke kelas dengan kode/QR/link valid dan menjadi User Terafiliasi Sekolah. Siswa tidak dapat keluar/berpindah kelas sendiri; penanganan oleh Admin serta dampaknya pada riwayat/progres masih `OPEN-08`/`OPEN-15`. Afiliasi kelas harus diperiksa di server. Riwayat Student Mandiri tetap disimpan.

Hierarki operasional sekolah: `Admin → School → Verified Teacher → Class → Student`. Guru yang terverifikasi dapat membuat banyak kelas, melihat progres siswa pada kelasnya, dan memberi feedback satu arah. Guru tidak mengelola bank soal. Bank/paket Drill dan TryOut berasal dari Curriculum; CRUD soal/paket Admin dan UI konfigurasi dikecualikan dari kedua PRD fitur. Kapabilitas operasional Admin yang ada dicatat terpisah dari acceptance fitur siswa. Admin adalah satu role internal pada v0.5, mengelola sekolah/token, pengguna/kelas, konten/paket, laporan, IRT/analitik, dan audit. Pemecahan sub-role Admin masih `OPEN-16`. Admin tidak dapat mengubah parameter inti produk melalui UI.

## 3. Autentikasi, sekolah, dan kelas

- Student dan Teacher login dengan Google. Saat registrasi pertama, user memilih role dan melengkapi profil; role tidak dapat diubah sendiri. Foto mengikuti Google dengan avatar inisial sebagai fallback. Admin memakai akun internal/seeder.
- Admin membuat sekolah dan menerbitkan token verifikasi guru yang single-use, berlaku 3×24 jam, dapat diterbitkan ulang, dan hangus setelah dipakai. Guru memilih sekolah dan memasukkan token; token gagal tidak membuka fitur Guru.
- Guru terverifikasi membuat kelas dengan kode/link/QR. Student bergabung lewat salah satunya dan hanya boleh menjadi anggota satu kelas dalam versi ini.
- Tanpa kelas, Student tetap boleh mengerjakan Drill dan membuat/membagikan room PvP. TryOut gratis untuk Mandiri dan Sekolah; leaderboard kelas tetap memerlukan kelas. Akses Pretest masih baseline kelas v0.5, perlu klarifikasi terhadap scope siswa pada PRD Drill terbaru.

## 4. Materi dan Pretest

Hierarki akademik: `Chapter → Subchapter → Level`. PRD v0.5 memberi baseline 5 level per subbab dan 10 soal per level, tetapi juga menyerahkan daftar, urutan, jumlah level, kompetensi, dan definisi tuntas kepada Curriculum (`OPEN-01`). Jangan mengunci skema ke angka lima sebelum keputusan Curriculum; gunakan konten demo yang diberi label jelas.

**PRD RULE — Drill v1.2 §5:** Pretest opsional, 20 soal per bab, sekali seumur hidup per bab, tanpa XP, dan tidak dapat diulang setelah selesai. Modal informasi menjelaskan tujuan, sifat one-time, dampak level, dan Mulai/Skip. Skip membuka Level 1 seluruh subbab bab tersebut. Distribusi soal dan seluruh mapping score → initial unlocked levels masih OPEN; maksimal tiga level pada hasil sempurna dari v0.5 tidak menjadi mapping final. Akses afiliasi dan kesempatan setelah Skip perlu klarifikasi, bukan disimpulkan dari akses TryOut.

## 5. Drill, progres, bintang, dan XP

**PRD RULE — Drill v1.2 §6–13:**

- Student memilih Bab → Subbab → Level → Detail; progres antar subbab independen. Level locked tidak dapat dimulai; open/completed dapat dikerjakan ulang.
- Satu sesi berisi 10 soal satu per tampilan dengan navigator. Timer count-up informasional, tidak pause dan tanpa deadline. Koneksi putus tidak menjadi cara pause timer.
- Jawaban dapat diubah sebelum submit; konfirmasi final menampilkan soal belum dijawab. Setelah submit, jawaban terkunci. Submit ulang tidak membuat result/history/XP atau kontribusi leaderboard ganda.
- Score 0–100; ≥80 membuka level berikutnya; <80 menawarkan retry pada level sama. Unlock tidak dicabut oleh hasil lebih rendah. Retry menggunakan varian berbeda jika tersedia dengan kompetensi, bentuk dan kesulitan setara; fallback pool habis DRL-OPEN-09.
- Semua attempt valid tercatat terpisah. Best score adalah nilai tertinggi, hanya meningkat ketika hasil valid lebih tinggi, dan tidak menggantikan history.
- Result menampilkan score, XP, 1–3 bintang, ketuntasan/unlock, pembahasan setelah submit, dan retry. Threshold bintang seluruhnya DRL-OPEN-03; hanya final score menentukan bintang, bukan durasi atau syarat unlock.
- Durasi <15 menit eligible speed bonus; ≥15 menit tidak. Base XP, XP pada attempt gagal, dan formula bonus DRL-OPEN-01/02; formula angka v0.5 tidak menjadi kebijakan final.
- Hasil gagal menampilkan maksimum tiga video YouTube relevan subbab. Kosong/broken link tidak memblokir result. Student dapat melaporkan video dan soal dengan referensi konteks aktual.
- Save state harus jujur: gagal tidak berlabel Saved. Warning refresh/exit wajib sesuai risiko aktual. Server autosave/resume adalah mekanisme implementasi yang tercatat pada kontrak, bukan jaminan storage dari PRD; detail persistence/expiry DRL-OPEN-05 dan interaksi Exit DRL-OPEN-06.
- Retensi pembahasan/history DRL-OPEN-07. Batas 90 hari dari v0.5 tidak boleh disebut aturan PRD terbaru; hasil historis/versioning tetap dijaga sesuai arsitektur dan kebijakan retensi yang disepakati.

## 6. TryOut

**PRD RULE — TryOut v1.1 §1–11:**

- Semua siswa, termasuk Mandiri, gratis pada MVP; kelas dan checkout bukan prasyarat TryOut.
- Listing memuat Ongoing dan Past dengan status attempt/hasil. Detail menampilkan tutorial, rules, periode/deadline, jumlah 35 soal, ketiga format PG/PGK MCMA/PGK Kategori, dan durasi yang masih TBC.
- Semua siswa dalam batch/periode sama menerima paket sama. Satu attempt/user/paket; repeated start/refresh/re-auth tidak membuat kesempatan baru. Start menolak expired/unavailable dan memulai timer hanya setelah attempt valid.
- Countdown tidak pause; 0 memicu auto-submit tanpa konfirmasi. Submit manual memerlukan konfirmasi. Keduanya final dan idempotent; jawaban/navigator tersedia sebelum final dan jawaban terkunci setelahnya.
- Setelah submit, tampilkan Submission Success lalu Waiting/Processing tanpa score/kunci/pembahasan. Nilai dan pembahasan hanya setelah release IRT; maksimum 3×24 jam setelah akhir batch/periode. Skor parsial tidak ditampilkan saat delay/error; backend dapat retry processing tanpa mengubah raw submission.
- Released score immutable dan memakai skala TKA yang disetujui Research/Curriculum; skala, model IRT, rubrik PGK dan komposisi masih OPEN. Label hasil simulasi, bukan nilai TKA resmi.
- XP berdasarkan skor, tanpa speed/bonus durasi; konversi final TRY-TBC-03. Rekomendasi `XP = final score` di sumber tetap PROPOSED.
- Paket lampau tetap terlihat. Paket yang pernah dikerjakan tidak dapat diulang; paket lampau belum pernah dikerjakan mengikuti policy TRY-TBC-05. Jangan otomatis mengizinkan atau mengunci semuanya saat paket baru rilis.
- Rilis mingguan Senin 00:00 WIB tetap baseline lintas fitur v0.5; waktu akhir batch/periode dan hubungan deadline attempt dengan periode TRY-TBC-06. TryOut tidak membuka level Drill.

Kode saat ini masih memiliki gap kelas, PG saja, retensi/rentang lama, dan auto-finalization. Pembaruan dokumen tidak menyatakan gap tersebut telah diimplementasikan; lihat kontrak dan status backend.

## 7. PvP dan leaderboard

PvP adalah pertandingan 1v1 realtime via WebSocket dan dapat mempertemukan Student Mandiri dengan Student Sekolah, termasuk lintas kelas. Semua Student boleh membuat room dan berbagi kode/link/QR; hanya Student Sekolah dapat mengundang teman sekelas lewat notifikasi. Kategori awal Mudah/Sedang/Sulit, 10 soal dengan urutan sama untuk kedua pemain, timer 30/45/60 detik per soal, jawaban terkunci setelah submit, dan transisi setelah kedua pemain menjawab atau waktu habis. Server menentukan waktu, validitas, dan poin. Jawaban benar memperoleh `100 + floor(50 × remainingTime / questionDuration)`; salah/kosong memperoleh 0. Reconnect 20 detik; gagal kembali berarti forfeit dan hasil itu tidak masuk rekor. Detail expiry/putus dua pemain masih `OPEN-07`.

| Papan peringkat | Peserta dan sumber                                                                                                                                 | Periode                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Kelas           | Anggota kelas yang sama; akumulasi XP Drill + Tryout. Pretest/PvP tidak berkontribusi. Menunjukkan keaktifan, bukan kemampuan akademik.            | Perbarui tiap jam; tutup/arsip Rabu 23:59 WIB. |
| Global PvP      | Semua Student Mandiri dan Sekolah; best XP dari sesi PvP valid per kategori kesulitan. Tampilkan top 20 dan peringkat sendiri bila di luar top 20. | Perbarui tiap jam; tutup/arsip Rabu 23:59 WIB. |

Leaderboard menampilkan data identitas minimum, bukan email atau riwayat belajar pribadi. PvP XP tidak membuka level Drill.

## 8. Monitoring, dukungan, Admin, dan IRT

- Dashboard Student menunjukkan status mandiri/kelas, progres, level, bintang, nilai terakhir/terbaik, dan aktivitas. Nilai akademik dan XP keaktifan diberi label terpisah.
- Guru memilih kelas, mencari/mengurutkan siswa, melihat progres dan riwayat siswa miliknya, lalu memberi feedback satu arah maksimal 1.000 karakter dengan status dibaca. Ekspor laporan belum termasuk v0.5.
- Student dapat melaporkan soal atau video; laporan menyimpan referensi versi/varian/attempt yang relevan untuk ditinjau Admin. Student tidak memperoleh riwayat laporan atau notifikasi tindak lanjut pada versi ini.
- Admin mengelola konten versi/varian dan paket. Perubahan soal tidak menghitung ulang hasil lama; attempt tetap merujuk versi dan kebijakan penilaian yang digunakan.
- IRT adalah batch harian atas akumulasi respons. Hasil pada detail soal Admin memerlukan minimal 30 responden; di bawah itu tampilkan “Data belum cukup”. Model/parameter final masih `OPEN-12`. IRT tidak mengubah nilai/XP historis.

## 9. Batas kualitas dan status keputusan

Autorisasi, batas akses Mandiri/Sekolah, waktu asesmen/PvP, penilaian, dan idempotensi harus ditegakkan server-side. Simpan waktu durable dalam UTC; aturan jadwal bisnis menggunakan `Asia/Jakarta`. UI memerlukan state loading, kosong, gagal, validasi, sukses, sesi berakhir, dan akses ditolak. Perlindungan privasi siswa dan pengujian pengguna nyata harus disepakati sebelum uji coba.

PRD fitur Drill v1.2 dan TryOut v1.1 adalah acuan terbaru untuk area terkait. PRD v0.5 **sudah disetujui tim sebagai baseline lintas fitur**, walaupun label pada PDF yang diberikan masih menyebut “draf untuk review”. `docs/product/OPEN_DECISIONS.md` mencatat keputusan yang tetap belum final. Dokumen Sprint 2 yang diberikan masih mencantumkan 70% untuk unlock Drill; tim menegaskan bahwa aturan PRD v0.5, yaitu **80%**, berlaku juga untuk Sprint 2.

Peristiwa analitik tambahan v0.5 antara lain `user_type_changed` dan `star_earned`; kontrak lengkap ada di `docs/data/EVENTS.md`. Kebutuhan keamanan, privasi, observabilitas, dan QA ada di folder `docs/security`, `docs/operations`, serta `docs/testing`.
