# Joblist MVP — rekonsiliasi pekerjaan lama dan urutan pelaksanaan

**Tanggal:** 2 Oktober 2026, WIB. **Status:** PROPOSED rincian backlog engineering; **ENGINEERING DECISION:** klarifikasi pengguna pada tanggal ini menetapkan sembilan pekerjaan dalam gambar sebagai pekerjaan aktif Farel. Penugasan sembilan pekerjaan itu berlaku menggantikan pembagian yang bertumpang tindih pada versi sebelumnya. Keputusan produk/akademik yang OPEN tetap memerlukan owner terkait.

## 1. Acuan dan cara menggunakan daftar

Dokumen ini mencocokkan **seluruh 16 pekerjaan** dari joblist yang ditempel pengguna dengan [audit MVP terbaru](MVP_PRD_REVIEW_2026-10-02.md), [ownership](OWNERSHIP.md), [Sprint 2](SPRINT_2_GOAL.md), dan [rekonsiliasi PRD Drill v1.2 / TryOut v1.1](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md). Nomor **LAMA-01–16** merujuk daftar pengguna; **JOB-01–22** merujuk antrean baru.

Baseline kode diperiksa pada `origin/main` commit `3199eebba87f003f80bfc929847166e7100978c1`. [PR #32](https://github.com/ayiinee/Numora/pull/32) sudah merged. Perbedaan `4c94aaa` → `3199eeb` hanya menambahkan laporan audit; tidak ada perubahan aplikasi sejak snapshot audit. Angka database dalam laporan sebelumnya adalah snapshot audit 2 Oktober, bukan pemeriksaan database ulang pada penyusunan joblist ini. Status teknis dicocokkan kembali dengan kode/kontrak; acceptance Google/staging belum dinyatakan lulus.

**SELESAI TEKNIS** menutup implementasi lama yang sudah ada, bukan otomatis sign-off produksi. **PARSIAL** menyisakan integrasi/acceptance. **BELUM SELESAI** membutuhkan implementasi. **BERUBAH** berarti requirement lama diganti PRD terbaru. Tidak ada area fitur dari daftar lama yang dibuang diam-diam.

Urutan JOB adalah prioritas nominal. Pekerjaan yang independen dapat paralel; dependency wajib didahulukan. QA ikut sejak awal. Pemilik frontend dan backend tetap menulis tes modulnya; Salim memimpin acceptance lintas peran. Satu pekerjaan backend besar aktif per owner, agar Aini tidak mengerjakan TryOut, IRT, XP, Pretest dan PvP bersamaan.

**Batas pengerjaan aktif:** Farel menjadi DRI tunggal untuk profil Teacher, login/logout/session, proteksi role/route frontend, pemeriksaan akses Mandiri/Sekolah, regression join kelas/monitoring, verifikasi visibility PvP/leaderboard existing, diagnosis awal Level 2 dan regression main sebelum/sesudah fixing. Anggota lain menggunakan hasil Farel dan mengerjakan bagian yang diserahkan secara eksplisit. Domain backend serta fitur lanjutan tetap mengikuti owner JOB terkait. Salim melakukan acceptance independen setelah handoff; ia tidak membuka implementasi/fixing paralel atas sembilan task Farel. Rincian handoff dan area file ada pada bagian 7; [OWNERSHIP](OWNERSHIP.md) mencatat klarifikasi yang sama.

## 2. Rekonsiliasi lengkap 16 pekerjaan lama

### LAMA-01 — Admin → Teacher → Student

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** Profil Admin sudah ada pada snapshot baru; jalur token/class/domain tersedia. Tidak lagi menganggap Admin selalu belum diprovision.
- **Pekerjaan tersisa:** Pastikan Admin pada environment tujuan; Google browser chain, cross-class denial, expiry/race/refresh/duplicate submit. JOB-02,06.

### LAMA-02 — Level 2 playable

- **Status:** BELUM SELESAI
- **Sudah tersedia atau berubah:** Engine sudah unlock pada ≥80; snapshot audit Level 2 masih nol paket terbit.
- **Pekerjaan tersisa:** Konten Level 2/varian reviewed, publikasi dan play sesudah unlock. JOB-03,04,06.

### LAMA-03 — Pipeline paket Drill Admin

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** API list/detail/create/update/publish/archive dan integrasi engine canonical sudah ada; legacy `drill_*` bukan jalur baru.
- **Pekerjaan tersisa:** UI minimum paket Drill dan acceptance Admin publish → Student play. JOB-04.

### LAMA-04 — Penilaian/history

- **Status:** SELESAI TEKNIS untuk API/UI dasar
- **Sudah tersedia atau berubah:** Endpoint `/students/me/assessment-results`, cursor pagination dan UI sudah ada. Tidak membangun endpoint tersebut dari nol lagi.
- **Pekerjaan tersisa:** Regression ownership/history, konteks per-level, field XP/star pending, hasil TryOut dan Pretest sesuai kontrak terbaru. JOB-12.

### LAMA-05 — Konten/release/proteksi

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** Playwright runner/CI dan rate limit verifikasi/join sudah ada. Soal demo lama semua berkunci B; kualitas dan review tetap harus diperiksa.
- **Pekerjaan tersisa:** Curriculum review dan variasi kunci yang layak; Google staging, operasi, real-flow E2E. JOB-02,03,06,21.

### LAMA-06 — XP/outbox/analytics

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** Drill sudah canonical; backfill/version preservation dan consumer outbox sudah diimplementasikan. Tidak mengulang migrasi/consumer.
- **Pekerjaan tersisa:** Ledger posting/policy, rekonsiliasi XP, producer events lengkap dan delivery/retry evidence. JOB-11,20.

### LAMA-07 — Pretest

- **Status:** BELUM SELESAI + BERUBAH
- **Sudah tersedia atau berubah:** Schema/constraint saja; mapping hasil sempurna maksimal tiga level bukan keputusan final terbaru.
- **Pekerjaan tersisa:** 20 soal/bab, lifetime completion, Skip semua subbab Level 1, tanpa XP; placement/Skip/afiliasi disepakati owner. JOB-01,13.

### LAMA-08 — TryOut

- **Status:** PARSIAL + BERUBAH
- **Sudah tersedia atau berubah:** API attempt/save/manual submit/result gate sudah ada. Class-only dan blanket lock paket lampau tidak sesuai PRD terbaru.
- **Pekerjaan tersisa:** Gratis semua Student,35 PG/MCMA/Category, listing/detail/rules/countdown/auto-submit/IRT release. JOB-07–10.

### LAMA-09 — IRT

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** Snapshot pseudonim, ekstraksi/boundary input, output validation dan batch persistence tersedia.
- **Pekerjaan tersisa:** Model Data, input PGK/output Student, harian Admin, batch TryOut, failure/retry/SLA/release. JOB-10.

### LAMA-10 — Feedback/monitoring

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** Progres Guru latest/best dan daftar/cari/sort siswa ada; feedback baru schema.
- **Pekerjaan tersisa:** API feedback ≤1.000 karakter, inbox/read-state, riwayat asesmen untuk Guru yang berhak. JOB-15.

### LAMA-11 — Video/report Student

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** API/UI rekomendasi dan report ownership/idempotency tersedia; referensi canonical sudah didukung.
- **Pekerjaan tersisa:** Video reviewed/YouTube, kategori wajib/konteks, empty/broken/error states dan events. JOB-14,20.

### LAMA-12 — PvP realtime

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** Engine/gateway/time/score/durable/reconnect/transport tersedia; simulator lama dihapus. Policy runtime masih null.
- **Pekerjaan tersisa:** Tutup OPEN-07, sediakan paket, aktifkan policy version dan uji pertandingan nyata. JOB-16.

### LAMA-13 — Leaderboard

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** Proyeksi hourly/archive, REST PvP top 20/self dan pemisahan sumber sudah ada.
- **Pekerjaan tersisa:** Ledger/hasil valid, class ranks API, policy dan acceptance reset/archive/forfeit. JOB-11,17.

### LAMA-14 — Admin pengguna/kelas

- **Status:** BELUM SELESAI untuk scope ini
- **Sudah tersedia atau berubah:** Operasi sekolah/token/content tersedia; tidak perlu dibuat ulang.
- **Pekerjaan tersisa:** Daftar/detail/audit pengguna/kelas; koreksi/ban hanya sesudah keputusan OPEN. JOB-18.

### LAMA-15 — Dashboard/share kelas

- **Status:** PARSIAL
- **Sudah tersedia atau berubah:** Dashboard API sudah memiliki kelas/sekolah, affiliation, latest/best, aktivitas, active Drill.
- **Pekerjaan tersisa:** Reward/feedback fields sesuai kontrak; class link/QR dan auth continuation. JOB-19.

### LAMA-16 — Docs/handoff visual

- **Status:** PARSIAL / berkelanjutan
- **Sudah tersedia atau berubah:** Rekonsiliasi PRD dan audit terbaru sudah merged. Dokumen lama adalah snapshot historis.
- **Pekerjaan tersisa:** Status per flow/evidence, final UI handoff bila tersedia, tidak mengubah rule produk. JOB-22.

### Bagian lama yang tidak dikerjakan ulang atau tidak diterapkan

1. **Provision Admin dari nol untuk sandbox yang sudah punya Admin:** tidak dijadikan tugas otomatis. Verifikasi akun/role pada staging tujuan tetap wajib; bila belum ada, operator provision identitas Auth nyata sesuai prosedur.
2. **Migrasi Drill legacy → canonical dari nol:** implementasi/rehearsal sudah ada. Yang tersisa adalah verifikasi jalur upgrade pada target, backup dan preservasi data; jangan menghapus tabel/jurnal lama.
3. **Membuat ulang history API, publisher Drill API, consumer outbox, runner E2E atau rate limiter:** kapabilitas tersebut tersedia. Tambahkan hanya gap/integrasi/regression yang terbukti.
4. **Pretest hasil sempurna pasti membuka maksimal tiga level:** diganti seluruh mapping yang menunggu Curriculum/Product. Angka lama tidak menjadi acceptance final.
5. **TryOut hanya Student Sekolah atau payment Mandiri:** diganti TryOut gratis seluruh Student pada MVP. Pretest affiliation tidak otomatis ikut berubah; masih perlu keputusan.
6. **Seluruh paket TryOut lampau terkunci ketika paket baru rilis:** diganti Past listing dengan status; paket pernah dikerjakan tidak bisa diulang, never-attempted mengikuti keputusan Product.
7. **Skor PG 0–100 sebagai hasil TryOut final:** bukan hasil final berbobot IRT/skala TKA yang diminta PRD terbaru. Model/skala/output harus diberikan owner terkait.
8. **Retensi Drill 90 hari dan threshold bintang lama sebagai aturan final:** tidak dipakai sebagai requirement final baru. Kebijakan latest OPEN; preserve hasil/policy historis dan versi baru secara prospektif.
9. **Minimum 30 sebagai gate universal rilis hasil TryOut Student:** perlu review PO/Data terhadap low-response dan SLA; baseline 30 untuk detail soal Admin tidak otomatis berlaku universal.
10. **Admin CRUD tidak relevan sama sekali:** tidak benar. Ia tetap pekerjaan operasional lintas fitur dari daftar lama, tetapi tidak masuk acceptance journey dua PRD siswa. Tidak menambah dashboard pengubah mastery/XP/limit/reset.

## 3. Detailed list dari paling urgent ke less urgent

**Prioritas A (JOB-01–06):** keputusan/dependency dan alur trial pertama. **Prioritas B (JOB-07–17):** perilaku inti MVP dan fitur pendukung. **Prioritas C (JOB-18–22):** operasi dan kelengkapan integrasi. Urutan C tidak berarti QA/release baru dimulai di akhir: operasi minimum trial ada pada JOB-02/06, sedangkan JOB-21 berlaku sebelum setiap release fitur terkait. Seluruh fitur MVP yang diwajibkan tetap memerlukan gate sendiri.

### JOB-01 — Kunci dependency dan keputusan yang menghambat implementasi

- **Owner:** Farel (koordinasi); PO/Curriculum/Data/Software/UIUX sesuai keputusan. **Asal:** LAMA-05–09,12,14,16.
- **Kerjakan:** decision sheet berisi ID OPEN, rule FINAL, pilihan yang membutuhkan keputusan, owner, tanggal target, fitur/test yang terdampak, dan link keputusan. Prioritaskan konten Level 1/2; Drill XP/stars/retensi/session; TryOut PGK/durasi/skala/batch/model/Past/XP; Pretest placement/Skip/afiliasi; PvP edges; Admin koreksi/ban.
- **Output:** keputusan owner yang dicatat di PRD/module spec/OPEN register, lalu kontrak/policy version yang dapat dipakai developer. Angka yang belum diputuskan tetap pending atau fixture DEMO.
- **Bukti selesai:** item yang menghalangi jalur aktif sudah memiliki keputusan atau tanggal/owner dan batas implementasi yang jelas. Farel tidak mengesahkan rumus statistik/akademik sendiri. Infrastructure/kontrak generik tetap dapat dikerjakan saat menunggu.

### JOB-02 — Siapkan environment trial, profil Teacher dan session tiga peran

- **Owner:** Farel DRI frontend auth, profil Teacher, session dan koordinasi environment; Aini identity/API support hanya melalui handoff defect/field kontrak; Avicenna operasi Admin/content yang terpisah; Salim acceptance independen setelah handoff; operator Database/DevOps untuk provisioning. **Asal:** LAMA-01,05; Teacher Profile & Account dan Login/Logout & Session milik Farel dari daftar gambar.
- **Kerjakan:** pastikan staging pengguna nyata terpisah dari Development; host/domain, Google provider/callback/CORS/API URL, Redis prefix, server secrets dan schema target sesuai. Verifikasi Admin, Guru A/B, Student Sekolah dan Mandiri pada environment uji; provision hanya yang diperlukan melalui prosedur operator. Siapkan health dan backup/restore minimum serta sekolah/izin trial dengan Product/Design.
- **Output:** environment/commit/owner/akun uji siap, tanpa mencatat kredensial dalam repo/chat. UI session expiry/logout/account switch dan error429/503 jelas.
- **Bukti selesai:** Google login/callback berhasil, internal role benar, Admin dapat mengakses operasi sekolah/token, teacher verification dan class join dapat diuji. Health saja atau email QA tidak menutup gate Google.
- **Profil Teacher:** Farel membuat halaman akun berisi identitas, status verifikasi, informasi sekolah, akses menuju kelas dan logout. Data menggunakan profil/kontrak API yang tersedia; kebutuhan field/API diserahkan ke Aini melalui task terpisah bila diperlukan. Sertakan loading/error/empty dan status belum terverifikasi; akses kelas tetap mengikuti otorisasi server. aliwafa tidak membuat halaman profil Teacher kedua. Ini deliverable engineering yang diminta pengguna, bukan penetapan aturan profil/edit akun baru dari PRD.
- **Regresi session:** Farel menyamakan perilaku login/logout Student dan Teacher; menguji pergantian Student A → Teacher → Student B, session expiry, callback, refresh, dan tombol Back setelah logout. Cache/query/provider dan request tertunda tidak boleh menampilkan identitas, kelas atau progres akun sebelumnya. Farel mencatat bukti dan memperbaiki frontend dalam task yang sama; defect backend identity diserahkan ke Aini bila terbukti. Salim memakai hasil tersebut untuk acceptance akhir setelah handoff.
- **Bukti selesai tambahan:** profil Teacher menampilkan data akun aktif dan status verifikasi yang benar, tautan kelas mengikuti aksesnya, logout berfungsi, dan seluruh pergantian akun bebas data pengguna sebelumnya.

### JOB-03 — Siapkan konten reviewed dan paket Level 2 yang playable

- **Owner:** Ferdi koordinasi/content API; Curriculum validator; Avicenna publikasi UI; Aini engine reviewer; Salim acceptance. **Asal:** LAMA-02,05.
- **Kerjakan:** review 10 soal Level 1 yang akan digunakan; siapkan 10 soal Level 2 dan varian setara sesuai ketersediaan yang disepakati. Periksa kompetensi, difficulty, stem, A–D/LaTeX untuk prototype, kunci/pembahasan, variasi posisi jawaban benar dan label demo. Jangan menyimpulkan fixture semua B sebagai konten TKA yang tervalidasi.
- **Output:** konten/version/reviewer yang tercatat; paket terbit terikat level dan policy, variant pool/fallback jelas. Perubahan konten tidak menimpa versi yang sudah dipakai attempt.
- **Bukti selesai:** paket Level 2 benar-benar dapat dimulai setelah ≥80 pada Level 1; pertahankan histories dan uji retry varian. Publish memakai workflow konten/operator yang sesuai, bukan edit ad hoc database atau menonaktifkan readiness check.
- **Diagnosis error Level 2:** Farel menjadi DRI reproduksi dan diagnosis awal temuan QA pada SHA/environment tercatat dengan akun berhak; simpan langkah, expected/actual, respons/status API dan log relevan yang telah disanitasi. Periksa unlock persisted, readiness paket/versi soal, otorisasi, kontrak dan rendering sebelum menetapkan root cause; jangan menganggap semua error disebabkan paket kosong. Ferdi/Aini tidak membuka diagnosis kedua untuk temuan yang sama.
- **Handoff dan verifikasi:** setelah Farel mencatat root cause/indikasi dan menyerahkan task, defect Core Learning frontend ke Ferdi; assessment/unlock/eligibility ke Aini; pipeline/content ke Ferdi dengan Avicenna untuk UI Admin. Farel menguji ulang temuan setelah owner memperbaiki penyebab; Salim melakukan acceptance independen start/save/submit Level 2 dan locked-level denial setelah handoff. Penyediaan konten reviewed tetap dapat berjalan paralel karena berbeda dari diagnosis/fixing temuan Farel.

### JOB-04 — Sambungkan UI Admin ke publisher Drill yang sudah tersedia

- **Owner:** Avicenna frontend; Ferdi backend support; Aini review historical integrity; Salim flow test. **Asal:** LAMA-03.
- **Kerjakan:** UI minimum list/detail/draft/edit/publish/archive; pilih level/variant/scoring policy dan 10 versi soal. Gunakan existing Drill package API serta generated types. Tampilkan incomplete/unreviewed/published immutable/error states.
- **Output:** Admin dapat menerbitkan paket yang dibaca engine canonical tanpa dual-write legacy. Tidak membuat ulang API publisher atau editor bank lengkap.
- **Bukti selesai:** Admin publish → Student start/save/submit → historical result tetap sama setelah versi baru/archive. Pastikan Student/Teacher tidak dapat mengakses operasi Admin.

### JOB-05 — Tutup gap Drill session/result terhadap PRD terbaru

- **Owner:** Ferdi frontend; Aini domain/policy; Avicenna history integration; Salim QA. **Asal:** LAMA-02,04,06,16; gap baru PRD.
- **Kerjakan:** Retry langsung dari hasil gagal/completed, detail/history level, warning refresh/exit saat risiko data hilang, failed-save/retry/session lost, count-up tanpa pause/deadline. Representasikan XP/star/retensi pending sesuai keputusan; jangan menjanjikan 90 hari/rentang bintang sebagai rule terbaru. Durasi reward dari server, bukan jam UI.
- **Output:** UI/result contract jujur tentang policy dan state yang tersedia, retry memakai attempt baru, history terpisah, best score monotonic dan unlock permanen.
- **Bukti selesai:** 7/10 vs 8/10, retry score lebih rendah tidak relock, submit ganda, save failure tidak Saved, unsaved refresh/exit warning. Score/policy yang sudah historis tidak dihitung ulang setelah approval policy baru.
- **Batas scope:** session pada JOB ini adalah jawaban/timer/result Drill. Login/logout, cache lintas akun dan role/route frontend tetap task aktif Farel; perubahan shared auth hanya melalui handoff bagian 7.

### JOB-06 — Buktikan trial chain nyata dan otorisasi lintas peran

**Update engineering, 3 Oktober 2026 — instruksi Aini:** tiga kasus connected pada satu production-build SHA lulus dengan API/PostgreSQL/Redis sebenarnya dan identitas email fixture. Defect offline save diperbaiki; runner dan artifact per SHA ditambahkan ke CI. [Evidence dan gate tersisa](../testing/JOB06_RELEASE_CHAIN.md). **Belum DONE/acceptance trial:** login Google nyata, environment trial yang disetujui, konten reviewed dan acceptance Salim belum tersedia. Farel tetap DRI frontend; perubahan ini adalah pekerjaan integrasi/defect yang diotorisasi, bukan pengalihan seluruh ownership.

- **Owner:** Farel DRI integrasi browser, regression dan fixing frontend dalam sembilan task aktifnya; Salim acceptance akhir setelah handoff; Avicenna Admin/content, Ferdi Drill/content, Aini domain backend hanya untuk bagian fitur/defect yang diserahkan. **Asal:** LAMA-01,02,05 dan pekerjaan aktif Farel pada gambar.
- **Kerjakan:** pada satu release SHA, Admin sekolah/token → Guru Google login/verifikasi/create class → Student Google login/join/save/resume/submit Drill → Guru latest/best/progres siswa sendiri. Uji token 72 jam/single-use/revoke/reissue/race, satu kelas, foreign Teacher/Student denial, refresh/re-auth/double-submit; sertakan Level 2 continuation sebagai gate kelanjutan belajar.
- **Output:** testcase/evidence per environment/role/commit, daftar defect, konten reviewed dan scope trial yang disetujui. Reuse Playwright; fixture CI bukan bukti seluruh rantai ini.
- **Bukti selesai:** login/authorization/persistence/scoring ≥80/progres tidak memiliki critical failure. Level 2 playable adalah tambahan kelanjutan belajar di atas minimum Sprint 2 unlock, bukan perubahan diam-diam atas scope trial minimum. Salim menilai gate trial dan gate MVP penuh secara terpisah.
- **Role & Route Protection:** Farel memeriksa dan memperbaiki redirect/access-denied frontend pada URL langsung dan refresh halaman Student, Teacher dan Admin untuk setiap role, pengguna belum login, session expired dan Teacher belum terverifikasi. Farel mencatat bukti API dengan role/ownership salah; defect backend diserahkan ke Aini/owner API melalui task terpisah. Acceptance tetap memerlukan otorisasi API. Avicenna tidak membuka perbaikan route Admin yang sama secara paralel.
- **Student Mandiri vs Sekolah:** Farel menguji matriks UI/API dan memperbaiki tampilan akses frontend: Drill serta create/share PvP tersedia untuk keduanya; leaderboard kelas memerlukan keanggotaan kelas, sedangkan leaderboard PvP mengikuti akses global yang disepakati. Mandiri dapat join kelas dan berubah menjadi Sekolah; Student yang sudah berkelas tetap dibatasi satu kelas. TryOut gratis untuk keduanya menurut PRD terbaru; implementasi gap TryOut tetap JOB-07/08. Eligibility Pretest tetap OPEN. Perubahan domain backend harus diserahkan ke owner API, bukan duplikasi task pemeriksaan Farel.
- **Join Class Regression:** Farel menguji kode valid/tidak valid, repeated/concurrent join, satu kelas, perubahan affiliation/class/school, persistence sesudah refresh/logout/login ulang dan pembersihan cache akun berbeda. Farel memperbaiki frontend existing, lalu menyerahkan defect backend yang terbukti ke Aini. aliwafa tidak mengulang regression/fixing join existing; JOB-19 menambahkan link/QR setelah baseline Farel siap dan area file diserahkan.
- **Teacher Monitoring Regression:** Farel menguji dan memperbaiki flow existing Class → Student → Progress → latest/best pada kelas sendiri, termasuk score 0, retry lebih rendah, empty/error, refresh setelah submission dan denial kelas lain. Query/authorization defect diserahkan ke Aini. aliwafa menunggu handoff untuk mengintegrasikan fitur feedback baru JOB-15; Salim melakukan acceptance independen setelah hasil Farel siap.
- **Verifikasi awal PvP/leaderboard:** Farel menjadi DRI temuan QA visibility/access existing: menu, URL langsung, available/policy-pending dan akses Mandiri/Sekolah. Catat ID temuan, expected/actual, SHA dan area perubahan. Farel menangani route/visibility frontend dalam scope ini; defect domain diserahkan ke Ferdi/Aini. JOB-16/17 tetap aktivasi fitur final, bukan verifikasi awal kedua; Salim memakai evidence Farel untuk acceptance setelah handoff.

### JOB-07 — Perbaiki TryOut backend: free access, 35 item dan kontrak tiga format

- **Status tahap pertama — 2 Oktober 2026:** akses/availability backend dan UI minimum diimplementasikan lokal, menunggu review/QA. Mandiri/Sekolah gratis; snapshot kelas nullable dan immutable; dashboard feature access dipisahkan dari current-package availability/new-attempt eligibility. Tanpa endpoint/migrasi baru. OpenAPI/generated types mengikuti DTO; bukti verifikasi ada pada [status backend](CORE_LEARNING_BACKEND_STATUS.md#tryout-dan-irt). Perubahan mode development/Redis sebelumnya tetap pekerjaan terpisah.
- **Rekonsiliasi 3 Oktober 2026:** #41 mempertahankan serverTime/countdown, detail/ack aturan dan recovery main; akses gratis tetap scope tahap pertama. CI terbaru dan connected chain gabungan #46/#41/#45 menjadi gate; admin bypass merge diizinkan Aini pada 3 Oktober, tanpa mengklaim reviewer approval; belum acceptance trial.
- **Sisa JOB-07:** validator/delivery 35 soal, answer union PGK dan rubrik, listing/detail/Past. Konfirmasi Research/Curriculum + Product untuk rubrik/komposisi/durasi/skala; Product untuk Past never-attempted; Product + Data + Curriculum untuk batch end/periode vs deadline sebelum integrasi JOB-09/10. Tidak ada OPEN yang menghambat tahap akses; JOB-07 keseluruhan belum selesai.
- **Owner:** Aini backend; Ferdi consumer frontend; Data/Curriculum rubric/content; Salim contract tests. **Asal:** LAMA-08.
- **Kerjakan:** hapus class prerequisite pada API/dashboard/availability; simpan class snapshot nullable untuk Mandiri. Bedakan paket unavailable dari user ineligible. Validator/package delivery wajib 35 PG/MCMA/Category, answer union yang tervalidasi, pinned item/policy, shared package per batch dan satu attempt/user/package. Sediakan listing/detail/current/Past sesuai approved package policy.
- **Output:** controller/DTO/domain/schema migration bila perlu, OpenAPI/generated types dan tests. Numeric duration/composition/rubric/scale tidak ditebak; final publikasi menggunakan konten approved dari Curriculum.
- **Bukti selesai:** Mandiri/Sekolah sama-sama eligible tanpa checkout; count salah/answer type salah ditolak; repeated/concurrent start menghasilkan satu attempt; direct access unauthorized ditolak; unavailable/expired tidak bisa start. Persetujuan PGK scoring tetap dependency JOB-01.

- **Bukti connected rekonsiliasi - 3 Oktober 2026:** empat kasus pada satu production-build SHA `bd3fb4c` lulus tanpa skip, mencakup akses TryOut dan scope history Guru/level Student. [Bukti dan batas acceptance](../testing/RECONCILIATION_RELEASE_CHAIN_2026-10-03.md#verified-local-candidate); admin bypass merge diizinkan Aini, bukan bukti reviewer approval; SHA main final wajib diuji ulang dan hasil/artifact dicatat pada PR #47. Gate Google/trial/QA independen tetap diperlukan.

### JOB-08 — Lengkapi TryOut frontend sesuai alur terbaru

- **Owner:** Ferdi; Avicenna Penilaian/history; Salim browser QA. **Asal:** LAMA-08,04.
- **Kerjakan:** Ongoing/Past dengan never-attempted/submitted/waiting/released/expired, detail/tutorial/rules, 35 soal satu per layar, radio/MCMA/category controls, navigator, truthful saving, submission success dan processing. Remove class-lock wording. Past never-attempted CTA mengikuti server policy.
- **Output:** UI memakai kontrak JOB-07; metadata periode/deadline/batch end dan SLA dari server; label simulasi, loading/error/empty/session states lengkap.
- **Bukti selesai:** ketiga format bisa diubah/navigate sebelum final; tidak ada second attempt/checkout; pending/delay tidak menampilkan partial score/key; result/error retry tidak membuat hasil baru. Tidak membuat response types manual yang menduplikasi generated contract.

### JOB-09 — Countdown dan auto-finalization TryOut yang berjalan tanpa browser

- **Owner:** Aini service/worker; Ferdi countdown UI; Salim race/network QA. **Asal:** LAMA-08; PRD requirement tambahan.
- **Kerjakan:** deadline server setelah attempt valid dibuat, countdown tidak pause, auto-submit pada 0 tanpa confirmation, dan finalizer bersama manual submit. Row lock/constraint menjaga satu finalization; worker/scheduler memulihkan overdue attempt sesudah restart tanpa browser. Hubungan package close/attempt deadline mengikuti decision.
- **Output:** manual/auto/save semantics, scheduled recovery, idempotent result/outbox dan observability. Tidak menambahkan timeout pada Drill.
- **Bukti selesai:** browser ditutup/jaringan putus saat expiry tetap final; manual dan auto bersamaan menghasilkan satu submission; save sesudah deadline ditolak; raw saved answers dipertahankan; timer tidak di-reset oleh refresh/re-auth.

- **Status engineering - 3 October 2026:** shared manual/auto finalizer, late-save guard using database time, lazy resume and scheduled PostgreSQL recovery implemented; historical pins/answers preserved, one legacy completion event. Bounded scan/partial index and Redis-independent CLI documented in [runbook](TRYOUT_RECOVERY_RUNBOOK.md). Actual PostgreSQL tests passed; feature PR/clean-SHA CI and independent QA are separate gates. Official duration and package-close relationship remain TBC-06 OPEN; no Drill timeout or official TryOut publication unlocked.

### JOB-10 — Jalankan IRT dan initial weighted result/release TryOut

- **Owner:** Aini orchestration/worker/release; Ferdi snapshot/output integration; Data model/calibration; Curriculum/PO scale/policy; Avicenna Admin state; Salim QA. **Asal:** LAMA-09,08.
- **Kerjakan:** perluas existing pseudonymous envelope untuk PGK dan output berbobot per siswa; pisahkan daily Admin item analysis dari TryOut batch closure/release. Bekukan raw responses/input/model/policy; persist initial weighted score pada approved TKA scale, release atomik, retry/failure/low-response dan overdue monitoring.
- **Output:** pipeline versioned end-to-end, resultReleasedAt/per-user result contract, approved batch end, processing/status dan Admin insufficient display. `sampleSize >=30` Admin tidak otomatis menjadi gate universal Student.
- **Bukti selesai:** score/key/explanation tersembunyi sampai release, hasil tersedia ≤3×24 jam dari batch end sesuai policy approved, released score immutable, failure/retry tidak merusak raw submission. Model Data tidak diganti skor PG ternormalisasi atau formula buatan engineer.

### JOB-11 — Posting XP durable dan idempotent

- **Owner:** Aini ledger/domain; Ferdi result UI; Data/PO formula; Salim consistency QA. **Asal:** LAMA-06,08,13.
- **Kerjakan:** setelah approval formula, implementasikan XP Drill (base/gagal/bonus eligibility <15 menit) dan TryOut (final-score-only, tanpa speed bonus). Pin policy, satu source per valid attempt/released result, atomic ledger/outbox menurut timing approved; tampilkan pending sebelum valid.
- **Output:** API XP result, event/ledger transactional, reconciliation tooling dan regression tests. Consumer outbox yang sudah ada dipakai ulang.
- **Bukti selesai:** duplicate submit/release/job tidak menggandakan XP; tepat 15 menit tidak eligible bonus Drill; TryOut duration tidak menambah XP; Pretest/PvP tidak masuk ledger XP kelas; perubahan formula tidak merombak XP historis.

### JOB-12 — Lengkapi Penilaian/history dan acceptance hasil tersimpan

- **Status implementasi - 2 Oktober 2026:** backend history dan UI minimum dikerjakan dalam branch terpisah dari JOB-07. Query `levelId` opsional, cursor dibatasi pada result set pengguna/filter, dan timestamp PostgreSQL tetap presisi; record mendapat konteks bab/subbab/level serta status reward pending/notApplicable. Skor 0 dan retry terpisah tetap tersimpan; waiting TryOut/Pretest tanpa route tidak menampilkan tautan hasil. Bukti dan batas acceptance ada pada [status backend](CORE_LEARNING_BACKEND_STATUS.md#penilaian-dan-history---job-12). Review/QA staging dan integrasi numeric rewards/Pretest/final IRT masih tersisa; JOB-12 tidak menutup keputusan OPEN.

- **Owner:** Avicenna frontend; Aini query/contract; Ferdi result coordination; Salim ownership/history tests. **Asal:** LAMA-04,15.
- **Kerjakan:** reuse history API/pagination; tampilkan latest/best dan seluruh attempt, konteks level/jenis aktivitas, pending XP/star, TryOut waiting/released serta Pretest result route hanya ketika API tersedia. Akses pembahasan mengikuti approved retention; preserved result tidak hilang karena explanation policy berubah.
- **Output:** per-level history/context dan UI loading/empty/page-error/access states; contract additions minimal bila diperlukan.
- **Bukti selesai:** Student hanya history sendiri, score 0 benar, lower-score retry tidak overwrite best/history; no premature TryOut score; cursor tidak menggandakan/melewatkan record pada testcase; content correction tidak mengubah hasil lama.

- **Rekonsiliasi 3 Oktober 2026:** #45 menyatukan class snapshot Guru dan level filter Student dengan objek filter internal; cursor memakai scope yang sama dan presisi PostgreSQL. CI head terbaru dan connected chain satu SHA tetap wajib; admin bypass diizinkan Aini, tanpa mengklaim reviewer approval; tidak menutup kebijakan OPEN atau acceptance JOB-06.

- **Bukti connected rekonsiliasi - 3 Oktober 2026:** empat kasus pada satu production-build SHA `bd3fb4c` lulus tanpa skip, mencakup akses TryOut dan scope history Guru/level Student. [Bukti dan batas acceptance](../testing/RECONCILIATION_RELEASE_CHAIN_2026-10-03.md#verified-local-candidate); admin bypass merge diizinkan Aini, bukan bukti reviewer approval; SHA main final wajib diuji ulang dan hasil/artifact dicatat pada PR #47. Gate Google/trial/QA independen tetap diperlukan.

### JOB-13 — Implementasikan lifecycle Pretest dan Skip

- **Owner:** Aini backend; Avicenna frontend; Curriculum/PO placement/content/eligibility; Salim QA. **Asal:** LAMA-07.
- **Kerjakan:** eligibility chapter, modal Mulai/Skip, 20 soal, start/save/resume/submit/result, completed/skipped/mapping-unavailable, no XP, lifetime completion constraint. Skip membuka Level 1 semua subbab tanpa menurunkan existing progress. Rekonsiliasi afiliasi dan kesempatan sesudah Skip sebelum final behavior.
- **Output:** API/generated contract/schema changes bila diperlukan, bank 20 soal reviewed, history dan UI state. Mapping seluruhnya approved atau unavailable; tidak memakai otomatis batas tiga level dari joblist lama.
- **Bukti selesai:** no repeated completed Pretest, concurrent actions aman; 20 soal dan 0 XP; semua subbab terbuka Level 1 sesudah Skip; placement tidak menarik unlock/history lama. Tes numerical mapping menunggu Curriculum approval.

### JOB-14 — Lengkapi YouTube recommendations dan report contexts

- **Owner:** Ferdi backend/Student UI; Avicenna Admin review/resolve UI; Curriculum/Data video mapping; Salim QA. **Asal:** LAMA-11.
- **Kerjakan:** kurasi/mapping video, YouTube HTTPS validation, maksimal 3 saat failure subbab terkait, empty/broken/error nonblocking. Kategori soal/opsi/kunci/pembahasan, referensi question/version/variant/level/subbab/attempt dan video mapping tervalidasi; reuse report idempotency.
- **Output:** approved recommendation data, UI report validation/success/error, Admin destination yang dapat ditindaklanjuti. Tidak menambahkan Student report history/notifikasi follow-up yang di luar v0.5.
- **Bukti selesai:** score≥80 tidak mendapat recommendation; non-YouTube ditolak sesuai policy; wrong-owner report ditolak; retry requestID yang sama satu laporan; hasil Drill tetap terlihat ketika video kosong/gagal. Events ditangani JOB-20.

### JOB-15 — Feedback satu arah dan monitoring Guru lengkap

- **Owner:** Ferdi backend **sementara, ENGINEERING DECISION disetujui pengguna pada 2 Oktober**; aliwafa frontend feedback/inbox baru; Ferdi ringkasan dashboard; Farel handoff baseline monitoring existing dan reviewer integrasi; Salim acceptance independen; Aini backend reviewer. **Asal:** LAMA-10.
- **Kerjakan:** owned-class feedback create/list/read,1–1.000 karakter, Student inbox/readAt idempotent dan akses history asesmen Guru untuk siswa kelas miliknya. Complete loading/empty/error dan latest/best 0 states. Tidak membangun chat dua arah.
- **Output:** module/service/DTO/OpenAPI, ownership tests, Teacher send dan Student read UI. Scope backend tambahan ini antre setelah core-critical tasks Ferdi, bukan otomatis dibebankan ke frontend aliwafa.
- **Bukti selesai:** Guru tidak mengirim/membaca siswa kelas lain; Student tidak membaca feedback Student lain; mark-read tidak menggandakan state; batas karakter server-side. Tidak menyimpulkan Andi hadir dari tabel ownership historis.
- **Batas terhadap task Farel:** regression/fixing Class → Student → Progress → latest/best existing tetap Farel pada JOB-06. aliwafa dapat merancang komponen feedback/inbox secara terpisah; integrasi pada layar monitoring menunggu branch Farel di-merge dan handoff file. Ferdi membangun API feedback baru, Aini menangani defect query/authorization hanya bila diserahkan. Salim menguji dampak fitur baru dan acceptance akhir dengan memakai baseline/evidence Farel.

### JOB-16 — Aktifkan PvP policy final dan pertandingan nyata

- **Owner:** Aini engine/gateway/policy; Ferdi PvP UI; PO/Software/QA edge decision; Curriculum paket; Salim multiplayer QA. **Asal:** LAMA-12.
- **Kerjakan:** reuse existing engine, pin production policy approved, menyediakan 10 soal urutan sama, authoritative waktu/skor serta batas waktu 30/45/60 detik dan reconnect 20 detik, room/share/classmate invite access, disconnect/readiness/expiry/cancellation sesuai keputusan. Aktivasi tidak memakai fixture policy produksi.
- **Output:** availability yang benar, durable match/result/outbox dan frontend recovery states. Mandiri dan Sekolah boleh match; invite teman kelas tetap memerlukan kelas.
- **Bukti selesai:** dua browser nyata tersinkron, client fake-score/time ditolak, answer lock dan transition benar, reconnect≤20detik kembali, forfeit tidak masuk best record, dua disconnect/restart sesuai policy. Tidak membangun ulang simulator lama.
- **Batas terhadap task Farel:** visibility/access existing dan perbaikan route frontend pada JOB-06 dikerjakan Farel. Ferdi/Aini mengerjakan aktivasi engine/match dan fitur PvP baru; defect existing hanya dikerjakan setelah handoff Farel. Integrasi yang mengubah file route/navigation milik task aktif Farel menunggu merge/handoff. Saat policy belum approved, pertahankan pending/unavailable sesuai API; Salim melakukan acceptance fitur baru setelah integrasi dengan baseline Farel.

### JOB-17 — Sajikan leaderboard kelas/PvP dari sumber valid

- **Owner:** Aini projection/API; Ferdi UI; PO/Data tie-policy; Salim period/access QA. **Asal:** LAMA-13.
- **Kerjakan:** reuse projection/archive; class endpoint menyajikan ranks ketika XP policy siap, PvP best per difficulty valid, top 20/self dan privacy minimum. Hourly update dan period Rabu 23:59 WIB archive sesuai semantics yang tercatat.
- **Output:** availability/stale/update timestamp, ranks/current/archive contract dan UI non-fixture. Data XP JOB-11 dan PvP JOB-16 menjadi dependency masing-masing papan.
- **Bukti selesai:** class hanya anggotanya, Drill+TryOut saja; PvP/Pretest/forfeit excluded dari kelas/best sesuai rule; reproject tidak menggandakan, ties sesuai policy approved, batas minggu Asia/Jakarta benar. Redis restart tidak menghapus truth.
- **Batas terhadap task Farel:** Farel menangani verifikasi visibility/access existing, account switch dan afiliasi pada JOB-06. Ferdi/Aini mengerjakan ranks/projection/UI data final pada JOB ini, memakai findings Farel. Perubahan route/navigation existing menunggu handoff; Salim menguji sumber data/policy baru dan acceptance akhir setelah merge, dengan otorisasi API tetap wajib.

### JOB-18 — Admin pengguna/kelas dan correction policy

- **Owner:** Ferdi backend operational; Avicenna frontend; Farel PO/Data coordination; Aini identity/class reviewer; Salim access QA. **Asal:** LAMA-14.
- **Kerjakan:** list/detail/filter/page minimal pengguna/kelas dan audit dengan data minimum. Finalkan scope correction/wrong-class/ban/School↔Mandiri lewat OPEN-08/13/15 sebelum mutation terkait; tidak mengasumsikan self-transfer.
- **Output:** authorized Admin read/use-case, approved transaction/idempotency/version-preserving correction bila policy siap; account restriction reason/effect sesuai keputusan.
- **Bukti selesai:** non-Admin ditolak; history/class-at-event tetap utuh; correction/ban transaction dites dengan scenario approved; tidak mengekspos unnecessary PII. Menunggu policy bukan alasan membuat efek ban sendiri.

### JOB-19 — Kelas link/QR dan kelengkapan dashboard persisted

- **Owner:** aliwafa fitur share link/QR baru sesudah handoff join existing; Ferdi reward/feedback dashboard; Farel DRI join/auth existing dan handoff integrasi; Aini backend support bila kontrak/defect diserahkan; Avicenna history partner; Salim acceptance akhir fitur baru. **Asal:** LAMA-15.
- **Kerjakan:** teacher share class code/link/QR, preserve destination sesudah Google login/registration, confirm class join, invalid/expired/one-class errors. Tambahkan reward/feedback dashboard ketika kontrak tersedia; reuse class/school/affiliation/latest/best/activity/active Drill API yang sudah ada.
- **Output:** kelas memakai link/QR yang hanya membawa join reference, bukan token Guru/PII; dashboard real persisted data dan pending-state jujur.
- **Bukti selesai:** pengguna yang belum login join lewat link/QR sesudah login tanpa bypass satu kelas; code reusable beberapa Student; logout/account switch membuang cache identitas; update kelas/feedback/reward dari API, bukan angka frontend buatan.
- **Batas dan handoff:** validasi kode, perubahan Mandiri → Sekolah, persistence membership, session/cache dan callback existing tetap Farel di JOB-02/06. aliwafa mengembangkan komponen share link/QR terpisah; integrasi join/auth dilakukan sesudah hasil Farel merged dan file diserahkan. Kebutuhan perubahan callback/auth tetap satu task Farel atau diserahkan ke aliwafa secara eksplisit, bukan dua implementasi. Salim menguji skenario link/QR baru memakai baseline join Farel; Aini menangani kebutuhan backend yang ditugaskan.

### JOB-20 — Lengkapi producer analytics dan operasi outbox

- **Owner:** Ferdi support/view-click producers; Aini domain/worker; Data schema; aliwafa producers pada feedback/link/QR baru; Farel owner integrasi producers yang menyentuh auth/onboarding/monitoring existing; Salim delivery QA. **Asal:** LAMA-06,11,16.
- **Kerjakan:** gap inventory registered/join/affiliation, drill_started/question_answered/submitted/completed/unlocked/retry/explanation/view-video/report, Pretest dan TryOut events terhadap latest approved schema. Reuse durable outbox/dedup consumer; define trigger dan retry semantics, correlation dan PII-minimum.
- **Output:** contracts/producers/worker metrics dan event tests. Star/reward events baru valid sesudah policy/output ada; business mutation/outbox dalam transaksi yang sama.
- **Bukti selesai:** refresh/repeated request/job retry tidak menggandakan final contribution; event context versi/attempt/time benar; consumer replay aman; queue failures/backlog dapat diketahui. Tidak menghitung consumer existing sebagai belum dibuat.
- **Batas file:** aliwafa tidak mengubah auth/callback/monitoring existing untuk analytics selama task Farel aktif. Payload/trigger disepakati dengan Data, lalu integrasi di file tersebut dilakukan Farel atau diteruskan melalui handoff setelah merge.

- **Status Aini - 3 October 2026:** domain/worker engineering delivered separately after JOB-09 CI PASS: proposed default-off canonical start/answer/submission/unlock producers, pinned context, correlation preservation and outbox status/rollback/retry/replay tests. [Inventory/runbook](JOB20_ANALYTICS_INVENTORY.md) records existing support producers, auth/join handoff (Farel), views (Ferdi) and Pretest/reward/release dependencies. JOB-20 overall remains PARSIAL; DRL-OPEN-08/Data activation and independent QA remain open.

### JOB-21 — Acceptance dan operasi release untuk scope yang akan diaktifkan

- **Owner:** Farel DRI regression awal sebelum/sesudah fixing sesuai sembilan task aktif; Salim gate/evidence dan acceptance independen setelah handoff; seluruh feature owner fixes hanya pada task/area yang diserahkan; operator Database/DevOps release. **Asal:** LAMA-05,16 dan seluruh fitur.
- **Kerjakan:** matriks 49 AC Core Learning dan baseline lintas fitur, negative authorization, mobile target/browser nyata/accessibility, expired session/network/retry, PostgreSQL/Redis integration, backup/restore/upgrade/recovery/health/alert dan beban sesuai target yang disepakati. IRT low-response/SLA dan finalizer backlog khusus ketika TryOut dirilis.
- **Output:** release candidate SHA/environment, CI results, testcase IDs/evidence, migration/restore runbook, accepted residual defects dan sign-off scoped. Planning targets 100/500/1.000 concurrent serta RPO/RTO tetap PROPOSED sampai owner mengunci; tidak disebut PRD final.
- **Bukti selesai:** critical failure nol untuk scope aktif, Curriculum/Product/Software/QA/operator sign-off relevan; fitur yang belum compliant tidak diklaim MVP penuh. JOB-06 menangani trial awal; JOB-21 tidak menunda QA sampai semua kode selesai.
- **Baseline main sebelum fixing:** Farel mencatat SHA `origin/main` terbaru dan menjalankan flow Student, Teacher dan Admin. Setiap temuan memiliki ID, langkah reproduksi, expected/actual, role/afiliasi, environment, SHA, severity, owner pelaksana dan status handoff. Keadaan runtime yang tidak tersedia dicatat blocked. Salim menyiapkan acceptance matrix/review testability tanpa membuka regression/fixing baseline yang sama sebagai proyek paralel.
- **Sesudah fixing:** Farel mencatat SHA branch/PR fix, menguji ulang temuan dan flow terkait, lalu mencatat regression pada SHA `main` sesudah merge. Farel menyerahkan evidence baseline/fix/main dan residual defects kepada Salim. Salim menjalankan acceptance independen scoped release, menilai tes kontrak/race/operasi/fitur baru dan sign-off QA. Pengujian independen ini adalah verifikasi akhir atas hasil handoff, bukan implementasi/fixing kedua. Bukti branch dan main tetap dibedakan.

### JOB-22 — Status docs dan handoff visual yang disetujui

- **Owner:** Farel status board; Ferdi docs coordination; Avicenna/aliwafa/Ferdi layar masing-masing; UIUX handoff; Salim evidence. **Asal:** LAMA-16.
- **Kerjakan:** update status backend/frontend/persistence/tests/OPEN per flow setelah merge/QA; preserve dated historical audit. Terapkan final tokens/assets/handoff bila disetujui, prioritaskan usability/a11y dibanding redesign kosmetik saat critical flow masih gagal.
- **Output:** PR/task/AC/evidence links, status done yang dapat diverifikasi, handoff changes terpisah dari product-rule changes.
- **Bukti selesai:** pembaca dapat menemukan current execution/evidence tanpa salah menganggap snapshot lama current; tidak menulis ulang hasil tes masa lalu atau mengubah scoring/authorization hanya karena visual baru.

## 4. Pembagian tugas mengikuti daftar sebelumnya

**ENGINEERING DECISION yang sudah tercatat:** Ferdi Student Core Learning/PvP/leaderboard frontend + content/report/video/IRT backend; Aini engine/worker/XP/PvP/leaderboard backend; Avicenna Admin/content/History/Pretest frontend; Salim acceptance/E2E/release.

**ENGINEERING DECISION — klarifikasi pengguna 2 Oktober:** sembilan pekerjaan dalam gambar sedang dikerjakan Farel. Farel menjadi DRI tunggal task aktif tersebut, termasuk frontend profil/auth/route/join/monitoring existing dan regression awal. Pembagian versi sebelumnya yang menunjuk aliwafa sebagai pelaksana profil/auth/monitoring regression serta Ferdi/Salim sebagai pelaksana diagnosis/verifikasi awal yang sama diganti oleh klarifikasi ini.

**PROPOSED sisa kapasitas:** aliwafa menangani fitur feedback/inbox dan share link/QR baru, dengan integrasi setelah handoff baseline Farel. Ferdi tetap mengambil backend feedback/operasional secara sementara; Aini menangani backend identity/class hanya untuk kebutuhan/defect yang diserahkan. Farel tetap PM, sehingga antrean PM dan sembilan task aktif disusun sesuai kapasitas. Andi/Tangguh/Nafi tidak diasumsikan tersedia; Model/Data/Curriculum/DevOps tetap dependency eksternal.

### Ferdi

**ENGINEERING DECISION — 2 Oktober:** pengguna menyetujui rencana Ferdi termasuk JOB-15 backend feedback/riwayat Guru dan JOB-18 backend operasional Admin, kapasitas paruh waktu, satu pekerjaan besar aktif dan checkpoint 12 Oktober berbasis gate. Persetujuan assignment tidak menutup OPEN policy atau handoff Farel. Status implementasi/tes dan dependency dicatat terpisah dalam [FERDI_IMPLEMENTATION_2026-10-02](FERDI_IMPLEMENTATION_2026-10-02.md); snapshot audit lama tetap historis.

- **Fokus pertama:** JOB-03 konten/support publisher dan JOB-05 Drill session/result; perbaikan Level 2 hanya setelah diagnosis dan handoff Farel
- **Antrean berikut sesuai dependency:** JOB-08/09 UI TryOut; JOB-10 IRT boundary; JOB-11 result; JOB-14 support; JOB-15 backend sementara; JOB-16/17 UI; JOB-18/19/20/22 bagian terkait
- **Batas tanggung jawab:** Diagnosis awal Level 2 serta visibility/access existing PvP/leaderboard dikerjakan Farel. Ferdi melaksanakan fix Core Learning/content yang diserahkan serta fitur PvP/leaderboard baru; perubahan shared auth/route menunggu handoff. Jangan mengerjakan semua backend/UI paralel; statistik IRT dari Data.

### Aini

- **Fokus pertama:** JOB-07 kontrak/access TryOut, lalu JOB-09 finalizer; defect backend identity/class/monitoring/Level 2 diprioritaskan hanya jika diserahkan Farel melalui temuan konkret
- **Antrean berikut sesuai dependency:** JOB-10 orchestration/release → JOB-11 XP → JOB-13 Pretest → JOB-16/17 PvP/ranks; review feedback/Admin; JOB-20 worker
- **Batas tanggung jawab:** Satu pekerjaan backend besar aktif; unit/integration domain tetap tanggung jawab Aini. Tidak membuka regression frontend atau rewrite identity/class paralel atas task Farel; tidak mengarang rubrik/model/formula.

### Farel

- **Fokus pertama:** sembilan task aktif miliknya pada JOB-02/03/06/21: profil Teacher, login/logout/session, role/route, Mandiri/Sekolah, join regression, monitoring regression, verifikasi PvP/leaderboard existing, diagnosis Level 2 dan regression main sebelum/sesudah fixing
- **Antrean berikut sesuai dependency:** JOB-01 keputusan dan JOB-02 environment sesuai kapasitas PM; handoff defect ke owner domain; JOB-19 handoff join/auth untuk fitur link/QR; JOB-21 evidence kepada Salim; JOB-22 status
- **Batas tanggung jawab:** DRI tunggal task aktif dari gambar. Farel memperbaiki frontend dalam scope-nya, menyerahkan defect domain/backend ke owner, dan tidak mengesahkan akademik/model sendiri. Koordinasi PM tetap berjalan tanpa menjadwalkan semua pekerjaan besar serentak.

### aliwafa

- **Fokus pertama:** persiapan flow/komponen feedback/inbox baru JOB-15 dan komponen share link/QR terpisah JOB-19; konfirmasi kontrak, state serta area file sebelum integrasi
- **Antrean berikut sesuai dependency:** implementasi feedback sesudah kontrak Ferdi siap; integrasi feedback ke monitoring dan link/QR ke join sesudah branch Farel merged serta handoff file; producers fitur baru JOB-20; JOB-21/22 a11y/handoff
- **Batas tanggung jawab:** Tidak mengerjakan profil Teacher, auth/session, role/route, join regression atau monitoring existing yang aktif di Farel. Komponen baru dapat disiapkan pada file terpisah; perubahan file Farel menunggu handoff. Backend authorization/policy tetap owner domain.

### Avicenna

- **Fokus pertama:** JOB-04 UI publisher; verification/history JOB-12 dapat mulai pada API existing
- **Antrean berikut sesuai dependency:** JOB-13 Pretest setelah backend; JOB-14 Admin support; JOB-10 Admin IRT states; JOB-18 operations; JOB-21/22 QA/handoff
- **Batas tanggung jawab:** API/history/publisher yang ada dipakai ulang; response types generated.
- **Batas terhadap Farel:** proteksi role/route Admin existing tetap Farel; Avicenna mengerjakan layar content/operasi baru dan menyerahkan kebutuhan shared route/navigation melalui handoff.

### Salim

- **Fokus pertama:** JOB-01 testability dan acceptance matrix, konten/kontrak/race criteria; review evidence sembilan task Farel saat tersedia dan rencanakan acceptance independen JOB-06/21
- **Antrean berikut sesuai dependency:** Testcase/race/regression untuk JOB-07–20; JOB-21 release evidence; JOB-22 status
- **Batas tanggung jawab:** Baseline regression, diagnosis awal dan recheck fixing sembilan task dikerjakan Farel. Salim menguji acceptance independen setelah handoff serta domain/fitur baru/release; tidak membuka implementasi/fixing kedua. Developer tetap menulis unit/integration; operator provisioning/release.

## 5. Pekerjaan yang dapat dimulai serentak sekarang

1. **Farel:** lanjutkan sembilan task aktif dari gambar, catat SHA/evidence dan daftar defect; koordinasikan owner/akses staging/Google serta keputusan PM sesuai kapasitas.
2. **aliwafa:** rancang flow/state feedback/inbox dan komponen share link/QR baru pada area terpisah; integrasi menunggu kontrak dan handoff baseline Farel.
3. **Avicenna:** UI minimum publisher Drill; regression history existing.
4. **Ferdi:** Drill warning/result/retry dan konten/publisher; tangani fix Level 2 hanya dari handoff Farel. Tidak mengulang diagnosis/verifikasi visibility existing.
5. **Aini:** TryOut access/availability dan kontrak/finalizer; backend trial defect menjadi interrupt setelah handoff Farel, bukan rewrite atau regression paralel.
6. **Salim:** acceptance matrix dan review testability domain; gunakan evidence Farel untuk acceptance akhir setelah handoff, serta siapkan race/operasi/fitur baru.

Sesudah dependency kontrak siap, task berpindah antrean secara eksplisit. Target sekitar 12 Oktober tetap checkpoint gate: first trial dan MVP penuh dinilai terpisah; tidak menutup unfinished jobs hanya untuk menyesuaikan tanggal.

## 6. Rekonsiliasi sembilan tugas dari gambar

**ENGINEERING DECISION:** pengguna menjelaskan bahwa seluruh sembilan task berikut milik/sedang dikerjakan Farel. Statusnya **IN PROGRESS berdasarkan keterangan pengguna**, bukan hasil verifikasi runtime. Semua task memiliki satu DRI aktif: Farel. Owner domain hanya menerima handoff perbaikan tertentu; Salim menerima handoff untuk acceptance akhir. Prioritas task existing berada pada tahap A, sedangkan aktivasi fitur baru tetap mengikuti dependency tahap B. Snapshot audit pada bagian 1 tidak ditulis ulang.

1. **Teacher Profile & Account → JOB-02. DRI aktif: Farel.** Implementasi identitas, status verifikasi, sekolah, akses kelas dan logout oleh Farel. Kebutuhan kontrak/API diserahkan ke Aini; aliwafa tidak membangun halaman profil kedua.
2. **Login/Logout & Session → JOB-02,06,19,21. DRI aktif: Farel.** Implementasi/fixing flow Student/Teacher, session/account switch dan cache/request akun lama oleh Farel. Backend identity defect ke Aini hanya melalui handoff.
3. **Role & Route Protection → JOB-06,21. DRI aktif: Farel.** Pemeriksaan/fixing role dan route frontend Student/Teacher/Admin oleh Farel. Defect otorisasi backend ke owner API melalui task terpisah; Avicenna tidak memperbaiki route Admin yang sama paralel.
4. **Student Mandiri vs Sekolah → JOB-06,07,16,17,19,21. DRI aktif: Farel.** Pemeriksaan/fixing tampilan hak akses existing Drill/PvP/leaderboard/join oleh Farel. Gap domain dan free TryOut implementation tetap JOB-07/08 milik Aini/Ferdi; Pretest OPEN tidak ditebak.
5. **Join Class Regression → JOB-06,19,21. DRI aktif: Farel.** Validasi kode, perubahan affiliation, satu kelas, persistence dan fixing frontend existing oleh Farel. Link/QR baru aliwafa menunggu handoff; backend defect ke Aini.
6. **Teacher Monitoring Regression → JOB-06,15,21. DRI aktif: Farel.** Class → Student → Progress → latest/best, score 0 dan akses kelas lain beserta fixing frontend existing oleh Farel. Query defect ke Aini; feedback/inbox baru aliwafa/Ferdi setelah kontrak dan handoff layar.
7. **PvP & Leaderboard Verification → JOB-06,16,17,21. DRI aktif: Farel.** Visibility/access existing dan temuan QA diverifikasi Farel. Ferdi/Aini mengerjakan aktivasi match/ranks baru atau defect domain yang diserahkan; tidak mengulang verifikasi awal sebagai task kedua.
8. **Level 2 Error Diagnosis → JOB-03,06,21. DRI aktif: Farel.** Reproduksi, identifikasi root cause dan handoff oleh Farel. Fix Core Learning/content ke Ferdi, assessment/unlock ke Aini; Farel recheck, kemudian Salim acceptance independen.
9. **Regression Testing → JOB-06,21. DRI aktif: Farel.** Baseline main, recheck branch fix dan regression main sesudah merge oleh Farel. Salim menerima evidence/residual defects dan melakukan acceptance independen scoped release; owner implementasi hanya memperbaiki bagian yang diserahkan.

## 7. Aturan handoff dan area file untuk mencegah pekerjaan ganda

Aturan ini mengatur task aktif pada pembagian sekarang, bukan hak edit permanen atau perubahan CODEOWNERS.

1. **Satu temuan, satu pelaksana fixing:** gunakan satu ID task/bug, DRI, area file, branch/PR, dependency dan status. Bila Farel telah menangani temuan, anggota lain tidak membuka fix alternatif untuk ID yang sama. Status awal sembilan task adalah IN PROGRESS oleh Farel; status selesai tetap membutuhkan evidence.
2. **Handoff defect domain:** Farel mencatat repro, expected/actual, SHA/environment, respons/log tersanitasi, indikasi root cause dan batas perubahan. Owner penerima menetapkan satu branch/PR untuk bagian yang diserahkan. Farel menghentikan perubahan pada bagian itu sampai fix terintegrasi, lalu recheck; unit/integration domain tetap ditulis owner implementasi.
3. **Handoff fitur lanjutan:** branch Farel yang menyentuh baseline auth/join/monitoring di-merge terlebih dahulu; penerima menyinkronkan main, mencatat area file yang diserahkan dan baru mengintegrasikan fitur baru. Komponen feedback/inbox atau share link/QR boleh disiapkan pada file terpisah sebelum handoff, memakai kontrak yang disepakati.
4. **Area auth/onboarding aktif Farel:** `apps/web/src/features/onboarding/`, `apps/web/src/app/auth/callback/page.tsx`, dan `apps/web/src/app/onboarding/page.tsx`. aliwafa tidak mengambil task auth/session/callback/join existing di area ini sementara branch Farel aktif. Kebutuhan analytics/JOB-19 di area ini diterapkan Farel atau diserahkan setelah merge.
5. **Area Teacher/monitoring aktif Farel:** `apps/web/src/app/teacher/`, `apps/web/src/features/monitoring/teacher-screens.tsx`, dan `apps/web/src/components/shell/teacher-shell.tsx`. aliwafa mempersiapkan feedback baru secara terpisah; integrasi ke layar ini menunggu handoff. Farel tidak mengerjakan backend feedback baru JOB-15 yang ditugaskan ke Ferdi.
6. **Shared shell/route/API contract:** perubahan role/navigation/session pada `apps/web/src/components/shell/app-shell.tsx`, `apps/web/src/components/shell/student-layout.tsx`, serta entry route PvP/leaderboard existing dikoordinasikan Farel selama task-nya aktif. Owner fitur baru memakai file/domain fiturnya; bila perlu file bersama atau generated contracts, catat satu pelaksana perubahan per area pada task sebelum commit. Avicenna tetap mengerjakan content Admin, bukan fixing proteksi route yang sedang ditangani Farel.
7. **Pemisahan verifikasi dan QA:** Farel memiliki repro/regression awal dan recheck fixing sembilan task. Salim menyiapkan acceptance criteria sejak awal serta memverifikasi hasil setelah handoff untuk gate release; Salim tidak membuka implementasi/fixing kedua. Task domain baru/race/operasi tetap dapat diuji Salim secara independen sesuai scope.
8. **Bukti selesai handoff:** catat PR/merge SHA, area yang selesai/diserahkan, testcase/evidence dan residual defects. Task berpindah owner hanya untuk scope yang disebutkan; kepemilikan task lain tetap. Tidak perlu menghapus requirement atau menandai fitur selesai hanya untuk menghilangkan overlap.

## 8. Referensi implementasi dan evidence

- [Review MVP + seluruh 49 AC](MVP_PRD_REVIEW_2026-10-02.md), [QA Guide](../testing/QA_GUIDE.md), [release checklist](../operations/RELEASE_CHECKLIST.md).
- [Canonical learning controller](../../apps/api/src/modules/learning/learning.controller.ts), [Drill service](../../apps/api/src/modules/learning/drill-assessment.service.ts), [history service](../../apps/api/src/modules/learning/assessment-history.service.ts).
- [Publisher Drill](../../apps/api/src/modules/content/drill-packages.service.ts), [Admin UI](../../apps/web/src/features/admin/content.tsx), [demo content seed](../../packages/database/src/demo-learning.ts).
- [TryOut service](../../apps/api/src/modules/learning/tryout.service.ts), [release gate](../../apps/api/src/modules/learning/tryout-release.service.ts), [IRT boundary](../../apps/api/src/modules/irt/irt-integration.service.ts).
- [Worker](../../apps/worker/src/main.ts), [outbox](../../apps/worker/src/outbox.ts), [PvP policy module](../../apps/api/src/modules/pvp/pvp.module.ts), [leaderboard service](../../apps/api/src/modules/leaderboards/leaderboards.service.ts).
- [Student support](../../apps/api/src/modules/reports/student-support.service.ts), [monitoring controller](../../apps/api/src/modules/monitoring/monitoring.controller.ts), [dashboard service](../../apps/api/src/modules/learning/student-dashboard.service.ts), [browser fixture suite](../../apps/web/e2e/student.spec.ts).
- [Latest PRD reconciliation](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md), [OPEN register](../product/OPEN_DECISIONS.md), [ownership](OWNERSHIP.md).

Pembaruan ini hanya dokumentasi backlog. Tidak menjalankan provisioning/seed/migrasi/submit terhadap shared database dan tidak mengubah kode aplikasi, environment, API/schema atau rule produk.
