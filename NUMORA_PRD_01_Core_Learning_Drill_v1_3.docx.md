**NUMORA**

**PRODUCT REQUIREMENTS DOCUMENT**

**CORE LEARNING — DRILL / LATIHAN SOAL**

Version 1.3 — Finalized & Implementation-Ready

| Dokumen acuan lintas timDokumen ini menjadi source of truth untuk requirement Drill/Latihan Soal dan mempertahankan seluruh detail PRD v1.2 yang masih relevan. Requirement yang sudah diputuskan ditulis sebagai aturan implementasi. Keputusan produk yang telah dikunci pada NUMORA PRD v0.6 Final tidak boleh ditafsirkan ulang oleh tim lain. Detail teknis yang belum ditentukan secara produk tetap menjadi tanggung jawab owner teknis. |
| :---- |

| Attribute | Value |
| :---- | :---- |
| Product | NUMORA — Sistem Drill & Practice untuk Tes Kemampuan Akademik Siswa SMP |
| Module | Core Learning |
| Feature | Drill / Latihan Soal |
| Platform | Web Application |
| Primary User | Siswa |
| Feature Owner | Product Owner — Core Learning Team |
| Supporting Teams | Research & Curriculum, UI/UX, Software Engineering, Data & AI, Monitoring, QA |
| Baseline | PRD v1.2 — Revised & Implementation-Ready |
| Revision | v1.3 — alignment with NUMORA PRD v0.6 Final; product decisions frozen |

# **1\. Document Purpose & Revision Notes**

PRD v1.2 sudah memiliki core flow yang benar, tetapi sejumlah requirement masih terlalu singkat untuk dijadikan kontrak lintas tim. Revisi v1.3 mempertahankan seluruh struktur, requirement, state, analytics, acceptance criteria, dependency, dan terminology dari v1.2, lalu menyelaraskannya dengan NUMORA PRD v0.6 Final. Keputusan produk yang sudah final tidak lagi ditulis sebagai OPEN/TBC. Detail yang memang bersifat teknis tetap didefinisikan sebagai boundary/ownership dan tidak boleh diinterpretasikan sebagai business rule baru.

| Area | Status v1.2 | Revisi v1.3 |
| :---- | :---- | :---- |
| Recommended Video | Hanya disebut di journey | Dipertahankan sebagai conditional result component: hanya saat gagal, relevan dengan Subbab, maksimal 3 video, link YouTube, dan dapat dilaporkan. |
| Report Question | Ditambahkan pada v1.2 | Dipertahankan; report mereferensikan soal dan konteks attempt. Setelah dikirim siswa hanya menerima confirmation. |
| Timer | Count-up; speed bonus condition | Final: count-up, informational, tidak dapat pause. Durasi \<900 detik mendapat speed bonus; durasi ≥900 detik bonus \= 0\. |
| XP | Base XP \+ speed bonus concept | Final formula: XP Dasar \= (Jumlah Benar / Total Soal) × 100; Bonus \= max(0, (900 detik − Waktu Pengerjaan) / 900 × 50); XP Akhir \= min(150, XP Dasar \+ Bonus). |
| Stars | 1–3 berdasarkan nilai; threshold belum final | Final: 0 \= 0 bintang; 10–50 \= 1; 60–90 \= 2; 100 \= 3\. Bintang berdasarkan nilai attempt terbaru dan tidak memengaruhi unlock, XP, leaderboard, atau ranking. |
| Pretest Skip | Skip disebut | Dipertahankan: Skip → Level 1 pada seluruh Subbab dalam Bab tersebut; Pretest tetap 20 soal/bab dan hanya sekali seumur hidup per Bab. |
| Pretest mapping | Impact tetap ditetapkan: score Pretest menentukan level awal sesuai mapping/blueprint Research & Curriculum; PRD Drill tidak mengarang formula akademik. | Mapping score → level awal mengikuti blueprint/mapping Research & Curriculum. PRD Drill tidak mengarang formula akademik di luar source. |
| Answer/session | Local/session save behavior ambigu | Dipertahankan sebagai session state sesuai kemampuan implementasi. Produk wajib memberi warning yang jujur dan tidak menjanjikan persistence/resume yang tidak dijamin. |
| Retry | Variant setara | Final MVP hanya satu varian/paket per level. Retry tetap pada level yang sama dan menggunakan paket yang sama. Multi-varian dipindahkan ke post-MVP. |
| Best Score | Derived metric ditambahkan | Tetap dipertahankan sebagai metric historis/sekunder dari v1.2 bila UI membutuhkannya. Kondisi terkini tetap menggunakan nilai dan bintang attempt terbaru; best score tidak menentukan unlock. |
| Acceptance Criteria | Diperluas pada v1.2 | Diperbarui agar mencakup formula XP final, threshold bintang final, single variant, latest score/star, snapshot/history, report, dan duplicate-submission prevention. |

| Status keputusan produk dan boundary teknisKeputusan produk yang sudah dikunci pada NUMORA PRD v0.6 Final ditulis sebagai FINAL. Detail teknis yang belum dispesifikasikan oleh produk ditulis sebagai boundary/ownership. Software, Data, UI/UX, atau QA tidak boleh mengarang business rule baru dari area yang tidak ditetapkan PRD. |
| :---- |

# **2\. Feature Definition**

| Aspect | Definition |
| :---- | :---- |
| Purpose | Membantu siswa memahami materi melalui latihan berulang dan evaluasi kemampuan. |
| Learning Model | Bab → Subbab → Level → Drill Session. |
| Primary Outcome | Siswa menyelesaikan latihan, memperoleh score/XP/bintang, menerima pembahasan, dan dapat melanjutkan atau mengulang level. |
| Learning Logic | Mastery-oriented melalui level bertahap, threshold kelulusan, retry, pengulangan level, dan riwayat attempt. MVP tidak menggunakan multi-varian Drill; retry menggunakan paket soal yang sama. |
| Content Source | Bank soal dari Research & Curriculum. |
| Configuration MVP | Parameter fitur di-hardcode; tidak tersedia dashboard konfigurasi admin untuk feature Drill. |
| Access Scope | Fitur Drill berorientasi pada sisi siswa; guru menggunakan data progress untuk monitoring, bukan mengatur parameter Drill. |

## **2.1 Scope**

| Included | Excluded |
| :---- | :---- |
| Student flow: pilih bab, pretest, pilih subbab/level, drill, submit, result, explanation, retry, recommended video, report. | Pengaturan Drill oleh guru/admin. |
| Bank soal Curriculum yang sudah tersedia di database. | CRUD soal melalui UI Admin. |
| Hardcoded configuration untuk MVP. | Dashboard konfigurasi parameter Drill. |
| Activity/analytics events. | Implementasi Tryout/Practice sebagai feature terpisah; multi-varian Drill merupakan post-MVP. |
| Progress data untuk monitoring. | Implementasi TryOut/Practice sebagai feature terpisah. |
| Multi-varian Drill | Multi-varian/paket alternatif per retry berada di luar scope MVP dan dapat dipertimbangkan sebagai feature post-MVP. |

# **3\. Roles & Access**

| Role | Access terhadap Drill | Batasan |
| :---- | :---- | :---- |
| Siswa | Membuka bab/subbab/level yang eligible; mengerjakan pretest; mengerjakan Drill; melihat result/history/explanation; retry; membuka video; report soal/video. | Tidak mengubah parameter, bank soal, scoring rule, atau konten. |
| Guru/Mentor | Melihat perkembangan/keaktifan siswa yang berada pada kelasnya melalui sistem monitoring. | Tidak mengatur parameter Drill dan tidak membuat/edit soal melalui feature ini. |
| Admin | Tidak menjadi actor utama dalam student Drill flow. | Parameter Drill hardcoded; tidak ada UI konfigurasi Drill dalam scope. |
| Research & Curriculum | Menyediakan/validasi bank soal dan struktur materi. | Bukan actor student-facing. |

| Content pipeline Soal awal berasal dari Curriculum dan masuk ke database; PRD Drill tidak membutuhkan UI Admin untuk upload/CRUD soal. |
| :---- |

# **4\. Learning Structure**

| Level | Definition | Rule |
| :---- | :---- | :---- |
| Bab | Materi utama. | Pretest tersedia pada level Bab dan hanya dapat dikerjakan sekali seumur hidup per Bab. |
| Subbab | Kompetensi turunan dalam Bab. | Progress subbab independen; level berada di bawah subbab. |
| Level | Tahapan mastery dalam Subbab. | Level dapat locked/open/completed dan dapat di-retry menggunakan paket yang sama pada MVP. |
| Drill Session | Satu sesi pengerjaan level. | Terdiri dari 10 soal yang ditampilkan satu per satu. |

Struktur navigasi utama: Dashboard → Menu Latihan Soal → Bab → (Pretest bila belum selesai) → Subbab → Level → Level Detail → Drill Attempt → Result.

Catatan: jika UI menggunakan istilah “Indikator”, mapping istilah tersebut harus dikunci bersama Research & Curriculum. Struktur materi utama pada PRD adalah Bab → Subbab → Level.

# **5\. Pretest Requirement**

| Rule | Requirement |
| :---- | :---- |
| Frequency | Satu kali per Bab seumur hidup. |
| Question count | 20 soal per Bab. |
| Optional | Siswa dapat Skip. |
| Impact if completed | Hasil pretest digunakan untuk menentukan level awal yang terbuka. |
| Impact if skipped | Siswa memulai dari Level 1 pada seluruh Subbab dalam Bab tersebut. |
| XP | Tidak memberikan XP. |
| Reattempt | Tidak dapat mengerjakan ulang pretest yang sudah selesai. |

## **Pretest Info**

| Field | Specification |
| :---- | :---- |
| Type | MODAL |
| Status | WAJIB |
| Purpose | Memberi informasi sebelum siswa mengambil keputusan mulai atau skip. |
| Content / Data | Tujuan pretest; 20 soal; sifat optional; hanya sekali; dampak terhadap level; tombol Mulai dan Skip. |
| Interaction / Behavior | Open; close; start; skip. |
| Required States | Siswa harus mengetahui bahwa keputusan pretest bersifat one-time. |
| Business Rules | Product \+ Curriculum. |
| Dependency / Owner | — |

## **Pretest Attempt**

| Field | Specification |
| :---- | :---- |
| Type | PAGE |
| Status | WAJIB — CONDITIONAL |
| Purpose | Mengukur kemampuan awal siswa pada Bab. |
| Content / Data | 20 soal; one-by-one question; answer selection; navigator; submit. |
| Interaction / Behavior | Initial; active; answered; unanswered; submit confirmation; completed; error. |
| Required States | Satu kali per Bab. |
| Business Rules | Curriculum bank; Software. |
| Dependency / Owner | — |

## **Pretest Result**

| Field | Specification |
| :---- | :---- |
| Type | PAGE / STATE |
| Status | WAJIB — CONDITIONAL |
| Purpose | Menampilkan hasil dan level awal yang terbuka. |
| Content / Data | Score/result; level unlocked; CTA lanjut Drill. |
| Interaction / Behavior | Processing; available; mapping unavailable; error. |
| Required States | Mapping score → level harus mengikuti keputusan Curriculum. |
| Business Rules | Research & Curriculum. |
| Dependency / Owner | — |

## **Pretest Already Completed**

| Field | Specification |
| :---- | :---- |
| Type | STATE |
| Status | WAJIB |
| Purpose | Mencegah pretest kedua pada Bab yang sama. |
| Content / Data | Status completed; result/score jika ditampilkan; CTA ke Drill. |
| Interaction / Behavior | Available; result unavailable. |
| Required States | Tidak ada reattempt. |
| Business Rules | Account \+ progress data. |
| Dependency / Owner | — |

## **Pretest Skipped**

| Field | Specification |
| :---- | :---- |
| Type | STATE |
| Status | WAJIB — CONDITIONAL |
| Purpose | Menunjukkan bahwa siswa memilih tidak melakukan pemetaan awal. |
| Content / Data | Status skipped; CTA ke Subbab/Level. |
| Interaction / Behavior | Skipped; navigation ready. |
| Required States | Semua Subbab dalam Bab dimulai dari Level 1\. |
| Business Rules | Product rule. |
| Dependency / Owner | — |

# **6\. Drill Navigation & Level Selection**

## **Latihan / Menu Latihan Soal**

| Field | Specification |
| :---- | :---- |
| Type | PAGE |
| Status | WAJIB — MVP |
| Purpose | Entry point utama ke Drill. |
| Content / Data | Daftar Bab; progress; Subbab; Level; status locked/open/completed; pretest CTA bila tersedia. |
| Interaction / Behavior | Loading; normal; empty; error; locked. |
| Required States | Siswa hanya dapat memulai level yang terbuka/eligible. |
| Business Rules | Curriculum \+ progress. |
| Dependency / Owner | — |

## **Daftar Bab**

| Field | Specification |
| :---- | :---- |
| Type | COMPONENT / SECTION |
| Status | WAJIB |
| Purpose | Memilih konteks materi. |
| Content / Data | Nama Bab; progress/status; pretest status. |
| Interaction / Behavior | Selected; expanded; collapsed; empty; error. |
| Required States | Klik Bab menampilkan Subbab dan status pretest. |
| Business Rules | Curriculum. |
| Dependency / Owner | — |

## **Subbab Selector**

| Field | Specification |
| :---- | :---- |
| Type | COMPONENT |
| Status | WAJIB |
| Purpose | Memilih kompetensi turunan. |
| Content / Data | Nama Subbab; progress; level status. |
| Interaction / Behavior | Open; selected; loading; empty. |
| Required States | Progress antar Subbab independen. |
| Business Rules | Curriculum. |
| Dependency / Owner | — |

## **Level Card/List**

| Field | Specification |
| :---- | :---- |
| Type | COMPONENT |
| Status | WAJIB |
| Purpose | Menunjukkan level yang tersedia dan statusnya. |
| Content / Data | Level number/name; description; lock/open/completed; score/bintang bila ditampilkan; CTA. |
| Interaction / Behavior | Locked; open; completed; retry. |
| Required States | Level locked tidak dapat dimainkan; level yang sudah terbuka tidak dapat terkunci kembali. |
| Business Rules | DRL scoring rules. |
| Dependency / Owner | — |

## **Level Detail / Info**

| Field | Specification |
| :---- | :---- |
| Type | PAGE / SUB-PAGE |
| Status | WAJIB |
| Purpose | Memberikan konteks sebelum sesi dimulai. |
| Content / Data | Deskripsi level; jumlah soal; status; best score/bintang bila final; CTA Mulai; akses history. |
| Interaction / Behavior | Open; locked; completed; retry. |
| Required States | Tidak mengubah eligibility. |
| Business Rules | UI/UX \+ progress. |
| Dependency / Owner | — |

# **7\. Drill Session Requirement**

| Step | System Behavior | UI/UX implication |
| :---- | :---- | :---- |
| Start | Sistem membuat attempt/session baru dan menetapkan paket/varian tunggal level tersebut. | Tampilkan konteks level dan state awal. |
| Question | Soal ditampilkan satu per satu. | Ada current question \+ navigation. |
| Answer | Siswa memilih jawaban; jawaban disimpan pada state sesi setiap kali siswa memilih jawaban. | Tampilkan selected/saved state yang jelas. |
| Timer | Count-up berjalan sebagai informasi waktu pengerjaan. | Timer tidak boleh tampil sebagai countdown/deadline. |
| Navigation | Siswa dapat berpindah antar soal dan mengubah jawaban sebelum submit sesuai rule sesi. | Question navigator wajib. |
| Submit | Muncul confirmation modal; setelah submit jawaban dikunci. | Submit final \+ disabled/locked state. |
| Evaluation | Sistem menghitung score, XP, bintang, completion/unlock, dan menyimpan attempt history serta konteks konten. | Result page menampilkan hasil. |

## **Drill Attempt**

| Field | Specification |
| :---- | :---- |
| Type | PAGE |
| Status | WAJIB — MVP |
| Purpose | Sesi pengerjaan satu Level. |
| Content / Data | 10 soal; one-by-one; options; question counter; navigator; count-up timer; submit. |
| Interaction / Behavior | Initial; answering; answered; unanswered; saving; saved; save error; connection/session issue; submit confirmation; submitted. |
| Required States | Satu attempt memiliki satu final submission; setelah submit jawaban terkunci. |
| Business Rules | Software \+ Data. |
| Dependency / Owner | — |

## **Question Navigator**

| Field | Specification |
| :---- | :---- |
| Type | COMPONENT |
| Status | WAJIB |
| Purpose | Navigasi antar soal. |
| Content / Data | Nomor soal; current; answered; unanswered. |
| Interaction / Behavior | Current; answered; unanswered; disabled if submission final. |
| Required States | Tidak boleh membuat soal baru/berubah karena navigasi. |
| Business Rules | UI/UX. |
| Dependency / Owner | — |

## **Count-up Timer**

| Field | Specification |
| :---- | :---- |
| Type | COMPONENT |
| Status | WAJIB |
| Purpose | Memberi informasi durasi pengerjaan dan menjadi input speed bonus. |
| Content / Data | Elapsed minutes/seconds. |
| Interaction / Behavior | Running; session lost; resumed; completed. |
| Required States | Count-up; informational; tidak dapat pause. \<900 detik memperoleh speed bonus; ≥900 detik bonus \= 0\. |
| Business Rules | Formula bonus final: max(0, (900 detik − Waktu Pengerjaan) / 900 × 50). |
| Dependency / Owner | — |

## **Submit Confirmation**

| Field | Specification |
| :---- | :---- |
| Type | MODAL |
| Status | WAJIB |
| Purpose | Mencegah submit tidak sengaja. |
| Content / Data | Warning final submission; jumlah belum dijawab; Cancel/Submit. |
| Interaction / Behavior | Open; cancel; submit; submitting. |
| Required States | Submit final dan irreversible untuk attempt tersebut. |
| Business Rules | UI/UX \+ Software. |
| Dependency / Owner | — |

## **Answer Saved State**

| Field | Specification |
| :---- | :---- |
| Type | STATE |
| Status | WAJIB |
| Purpose | Memberi persistensi selama sesi dan mencegah user kehilangan jawaban tanpa informasi. |
| Content / Data | Selected answer; saving/saved indicator bila digunakan. |
| Interaction / Behavior | Saving; saved; save failed; session unavailable. |
| Required States | Jawaban disimpan selama sesi sesuai mekanisme penyimpanan yang benar-benar tersedia. Refresh/exit wajib memberikan warning sesuai kemampuan persistence; jangan menjanjikan resume/persistence yang tidak dijamin. |
| Business Rules | Software architecture. |
| Dependency / Owner | — |

# **8\. Scoring, Unlock, XP & Stars**

Score adalah nilai akhir attempt pada skala 0–100. Threshold kelulusan yang sudah ditetapkan adalah 80\.

| Condition | Result |
| :---- | :---- |
| Score ≥ 80 | Level berikutnya terbuka. |
| Score \< 80 | Siswa diarahkan/ditawarkan Retry pada level yang sama. |
| Previously unlocked | Tidak dikunci kembali walaupun attempt berikutnya memperoleh score \<80. |
| Retry | Membuat attempt baru pada level yang sama menggunakan paket/varian tunggal yang sama pada MVP. |

## **XP Calculation**

| Field | Specification |
| :---- | :---- |
| Type | BUSINESS RULE / OUTPUT |
| Status | WAJIB — formula final |
| Purpose | Memberikan activity reward dari Drill. |
| Content / Data | XP Dasar \= (Jumlah Benar / Total Soal) × 100; Bonus \= max(0, (900 detik − Waktu Pengerjaan) / 900 × 50); XP Akhir \= min(150, XP Dasar \+ Bonus). |
| Interaction / Behavior | Result; zero; retry; success; failure. |
| Required States | \<900 detik memperoleh speed bonus; ≥900 detik bonus \= 0\. Rentang XP 0–150. Pretest \= 0 XP. |
| Business Rules | Product \+ Data. |
| Dependency / Owner | — |

## **Stars**

| Field | Specification |
| :---- | :---- |
| Type | COMPONENT / OUTPUT |
| Status | WAJIB |
| Purpose | Memberikan indikator pencapaian berdasarkan nilai akhir. |
| Content / Data | 0–3 stars. |
| Interaction / Behavior | 0 \= 0; 10–50 \= 1; 60–90 \= 2; 100 \= 3\. |
| Required States | Bintang hanya ditentukan dari nilai akhir attempt terbaru; tidak menjadi syarat unlock dan tidak memengaruhi XP, leaderboard, atau ranking. |
| Business Rules | Product. |
| Dependency / Owner | — |

## **Best Score**

| Field | Specification |
| :---- | :---- |
| Type | DERIVED METRIC |
| Status | WAJIB sebagai metric historis/sekunder bila digunakan |
| Purpose | Menunjukkan pencapaian tertinggi siswa pada level tanpa menggantikan kondisi terkini. |
| Content / Data | Highest valid score dari seluruh attempt. |
| Interaction / Behavior | No score; first attempt; improved; unchanged. |
| Required States | Attempt baru tidak menghapus history. Best score hanya naik jika score baru lebih tinggi; nilai/bintang current tetap menggunakan attempt terbaru. |
| Business Rules | Data \+ Progress. |
| Dependency / Owner | — |

## **Leaderboard Activity Contribution**

| Field | Specification |
| :---- | :---- |
| Type | INTEGRATION |
| Status | WAJIB jika leaderboard keaktifan aktif |
| Purpose | Mengakumulasi XP Drill ke activity/keaktifan dan leaderboard aktivitas sesuai product rule. |
| Content / Data | XP earned from valid Drill completion sesuai formula final. |
| Interaction / Behavior | Pending; posted; duplicate prevented. |
| Required States | Satu submission final tidak boleh menghasilkan XP ganda. |
| Business Rules | Monitoring/Data. |
| Dependency / Owner | — |

# **9\. Retry & Attempt History**

Retry mendukung mastery learning. Siswa boleh mengulang level yang sudah selesai maupun level yang belum mencapai threshold. Setiap attempt dicatat sebagai history. Pada MVP, setiap level hanya memiliki satu paket/varian soal; retry menggunakan paket yang sama.

| Rule | Requirement |
| :---- | :---- |
| Same level | Retry tetap pada level yang sama. |
| Variation | MVP menggunakan satu paket/varian soal per level; retry menggunakan paket yang sama. |
| Equivalence | Tidak ada kebutuhan equivalence antar-variant pada MVP karena multi-varian berada di luar scope. |
| History | Setiap attempt valid disimpan sebagai record terpisah. |
| Best score | Nilai terbaik tetap dapat disimpan sebagai metric historis; current score tetap berasal dari attempt terbaru. |
| Unlock | Retry dengan score rendah tidak menarik kembali unlock yang sudah pernah diperoleh. |

## **Single Variant / Package Rule**

| Field | Specification |
| :---- | :---- |
| Type | SYSTEM BEHAVIOR |
| Status | WAJIB — MVP |
| Purpose | Menjamin retry tetap tersedia tanpa membuat kebutuhan multi-varian pada MVP. |
| Content / Data | Satu paket/varian soal ditetapkan untuk setiap level dan digunakan kembali pada attempt berikutnya. |
| Interaction / Behavior | Same package available; new attempt; session start error bila paket tidak dapat dimuat. |
| Required States | Retry tidak mengubah kompetensi, struktur, atau tingkat kesulitan karena tidak mengganti paket. |
| Business Rules | Product \+ Curriculum \+ Software. |
| Dependency / Owner | Multi-varian merupakan post-MVP. |

## **Retry CTA**

| Field | Specification |
| :---- | :---- |
| Type | COMPONENT / BEHAVIOR |
| Status | WAJIB |
| Purpose | Memulai attempt baru pada level yang sama. |
| Content / Data | Retry button; new attempt indication. |
| Interaction / Behavior | Available; starting; error. |
| Required States | Tidak menghapus attempt sebelumnya dan tidak menampilkan klaim bahwa siswa memperoleh variant baru. |
| Business Rules | UI/UX \+ Software. |
| Dependency / Owner | — |

# **10\. Result Page**

## **Drill Result**

| Field | Specification |
| :---- | :---- |
| Type | PAGE |
| Status | WAJIB — MVP |
| Purpose | Menampilkan hasil final setelah submission. |
| Content / Data | Score 0–100; XP; latest stars; completion/unlock status; optional best historical score; CTA Pembahasan; CTA Retry; recommended video bila gagal. |
| Interaction / Behavior | Success; failure; processing; error. |
| Required States | Pembahasan hanya setelah submit. Recommended video hanya jika gagal. |
| Business Rules | Software \+ Data \+ UI/UX. |
| Dependency / Owner | — |

| Result Element | Rule |
| :---- | :---- |
| Score | Nilai akhir attempt, skala 0–100. |
| XP | XP yang diperoleh dari attempt sesuai formula final. |
| Stars | 0–3 berdasarkan latest score: 0 \= 0; 10–50 \= 1; 60–90 \= 2; 100 \= 3\. |
| Unlock | Jika ≥80, level berikutnya terbuka. |
| Failure | Jika \<80, level tetap dan retry tersedia. |
| Best Score | Best score historis bila digunakan; tidak menggantikan latest score sebagai kondisi terkini. |
| History | Attempt terbaru masuk history tanpa menghapus attempt lama. |
| Explanation | Tersedia setelah submit. |
| Recommended Video | Hanya muncul pada failure; relevan dengan Subbab. |

# **11\. Recommended Video & Reporting**

## **Recommended Video**

| Field | Specification |
| :---- | :---- |
| Type | COMPONENT / SECTION |
| Status | WAJIB — CONDITIONAL |
| Purpose | Memberi remedial learning setelah siswa gagal. |
| Content / Data | Maksimum 3 video; title/thumbnail bila tersedia; CTA Open YouTube; Report Video. |
| Interaction / Behavior | Hidden on success; available; loading; no recommendation; broken link; reported. |
| Required States | Hanya muncul saat score \<80/failure. Video relevan dengan Subbab yang gagal. Sumber video diarahkan ke YouTube. |
| Business Rules | Data & AI / Recommendation. |
| Dependency / Owner | — |

## **Report Video**

| Field | Specification |
| :---- | :---- |
| Type | MODAL |
| Status | WAJIB — CONDITIONAL |
| Purpose | Melaporkan video yang salah/tidak relevan. |
| Content / Data | Reason/category; optional description; Submit/Cancel. |
| Interaction / Behavior | Open; validation; submitting; success; error. |
| Required States | Report harus mereferensikan video dan konteks Subbab. |
| Business Rules | Monitoring/Admin backend. |
| Dependency / Owner | — |

## **Report Question**

| Field | Specification |
| :---- | :---- |
| Type | MODAL |
| Status | WAJIB — CONDITIONAL |
| Purpose | Melaporkan masalah pada soal. |
| Content / Data | Category: soal/opsi/kunci/pembahasan; optional description; Submit/Cancel. |
| Interaction / Behavior | Open; validation; submitting; success; error. |
| Required States | Report harus mereferensikan question ID, level, subbab, dan attempt. Tidak ada kebutuhan variant ID pada MVP karena hanya satu paket/varian per level. |
| Business Rules | Monitoring \+ Software. |
| Dependency / Owner | — |

| Analytics Event | Trigger | Required Context |
| :---- | :---- | :---- |
| video\_clicked | Siswa membuka video rekomendasi. | video\_id, subbab, level, attempt\_id, timestamp. |
| video\_reported | Siswa submit report video. | video\_id, category, subbab, level, attempt\_id, timestamp. |
| question\_reported | Siswa submit report soal. | question\_id, category, subbab, level, attempt\_id, timestamp. |

# **12\. History & Progress**

## **Level Attempt History**

| Field | Specification |
| :---- | :---- |
| Type | PAGE / SUB-PAGE |
| Status | WAJIB |
| Purpose | Memberikan histori seluruh pengerjaan level. |
| Content / Data | Attempt date/time; score; XP; latest stars; completion; access to explanation sesuai retention policy. |
| Interaction / Behavior | No history; available; loading; error. |
| Required States | Setiap attempt valid tercatat. Jangan overwrite history hanya karena ada best score baru. |
| Business Rules | Data. |
| Dependency / Owner | — |

## **Progress per Bab**

| Field | Specification |
| :---- | :---- |
| Type | SECTION / COMPONENT |
| Status | WAJIB |
| Purpose | Menunjukkan perkembangan per Bab. |
| Content / Data | Bab; progress; subbab status; level status. |
| Interaction / Behavior | No progress; in progress; completed. |
| Required States | Klik dapat membuka Latihan pada Bab tersebut. |
| Business Rules | Progress. |
| Dependency / Owner | — |

## **Progress per Level**

| Field | Specification |
| :---- | :---- |
| Type | SECTION / COMPONENT |
| Status | WAJIB |
| Purpose | Menunjukkan level yang telah dibuka/diselesaikan dan pencapaian terbaik. |
| Content / Data | Level; status; latest score; latest stars; optional best historical score. |
| Interaction / Behavior | Locked; open; completed; retry. |
| Required States | Unlock tidak ditarik kembali. |
| Business Rules | Progress. |
| Dependency / Owner | — |

## **Attempt Explanation**

| Field | Specification |
| :---- | :---- |
| Type | PAGE / SECTION |
| Status | WAJIB — CONDITIONAL |
| Purpose | Menampilkan pembahasan attempt. |
| Content / Data | Soal; jawaban siswa; jawaban benar; pembahasan. |
| Interaction / Behavior | Available after submit; unavailable before submit; expired if retention policy applies. |
| Required States | Pembahasan hanya dapat diakses setelah submission. |
| Business Rules | Curriculum \+ Software. |
| Dependency / Owner | — |

| Retention Jika kebijakan retensi pembahasan/history memiliki batas waktu, angka retensi harus ditulis di PRD. Jangan mengasumsikan durasi bila belum dikunci. |
| :---- |

# **13\. Error Handling & Session Behavior**

| Scenario | Required Behavior | UI/UX State |
| :---- | :---- | :---- |
| Refresh browser during Drill | Tampilkan warning bahwa data/progress dapat hilang. Jangan menjanjikan persistence jika belum ada. | Refresh warning / browser native warning bila applicable. |
| Exit session before submit | Jawaban yang belum menjadi final tidak dijamin menjadi hasil. User harus diberi konsekuensi yang jelas. | Exit confirmation atau explicit warning sesuai final UI decision. |
| Session still available | Jika session masih dapat dipulihkan, tampilkan entry/resume behavior yang sudah dikunci. | Resume available / session available. |
| Submit duplicate | Tidak membuat result/XP/history ganda. | Submitting / already submitted. |
| Save failure | Berikan indikator bahwa state belum tersimpan; jangan mengklaim Saved. | Save failed \+ retry. |
| Network loss | Pertahankan state lokal/session sesuai kemampuan implementasi; tampilkan connection state. | Offline/connection lost/reconnecting. |
| Server error on result | Jangan membuat result kedua; sediakan retry/reload behavior. | Result error. |

| Poin yang perlu dikunci Software PRD menetapkan behavior produk, bukan mekanisme storage. Detail apakah state disimpan localStorage, sessionStorage, memory, atau server adalah keputusan teknis. Yang wajib dari sisi produk: user diberi warning dan tidak diberi janji persistence yang belum dijamin. |
| :---- |

# **14\. Analytics Event**

| Event | Trigger | Why it matters |
| :---- | :---- | :---- |
| drill\_started | Siswa memulai Drill. | Mengukur entry dan start rate. |
| question\_answered | Siswa memilih/mengubah jawaban sesuai event policy. | Mengukur engagement dan response behavior. |
| drill\_submitted | Siswa berhasil submit. | Mengukur completion attempt. |
| drill\_completed | Result final berhasil dibuat. | Mengukur completed Drill. |
| level\_unlocked | Level baru menjadi open. | Mengukur progression. |
| level\_retry | Siswa memulai retry. | Mengukur kebutuhan remedial/repetition. |
| explanation\_viewed | Siswa membuka pembahasan. | Mengukur learning feedback usage. |
| video\_clicked | Siswa membuka recommended video. | Mengukur remedial video usage. |
| video\_reported | Siswa melaporkan video. | Monitoring recommendation quality. |
| question\_reported | Siswa melaporkan soal. | Monitoring content quality. |
| pretest\_started | Siswa memulai pretest. | Mengukur pretest adoption. |
| pretest\_skipped | Siswa skip pretest. | Mengukur skip rate. |
| pretest\_completed | Siswa menyelesaikan pretest. | Mengukur completion. |
| star\_earned | Bintang ditetapkan pada result attempt. | user/session context, bab, subbab, level, attempt\_id, stars, score, timestamp. |

Metadata event minimal sebaiknya mencakup user/session context, bab, subbab, level, attempt ID, timestamp, dan object ID yang relevan. Skema teknis final berada pada Data/Software.

# **15\. Acceptance Criteria**

| ID | Acceptance Criteria |
| :---- | :---- |
| DRL-AC-01 | Siswa hanya dapat memulai level yang terbuka/eligible. |
| DRL-AC-02 | Pretest tersedia maksimal satu kali seumur hidup untuk setiap Bab. |
| DRL-AC-03 | Pretest terdiri dari 20 soal per Bab dan tidak memberikan XP. |
| DRL-AC-04 | Jika Pretest di-skip, seluruh Subbab pada Bab tersebut dimulai dari Level 1\. |
| DRL-AC-05 | Satu Drill level terdiri dari 10 soal yang ditampilkan satu per satu. |
| DRL-AC-06 | Timer Drill menggunakan count-up, tidak dapat di-pause, dan tidak menjadi deadline pengerjaan. |
| DRL-AC-07 | Attempt dengan durasi \<900 detik memenuhi syarat speed bonus XP; attempt ≥900 detik memperoleh bonus 0\. |
| DRL-AC-08 | Siswa dapat berpindah soal dan mengubah jawaban sebelum submit sesuai session rule. |
| DRL-AC-09 | Submit memerlukan confirmation dan setelah final submission jawaban tidak dapat diubah. |
| DRL-AC-10 | Submit hanya menghasilkan satu result final dan tidak membuat XP/history ganda. |
| DRL-AC-11 | Score ≥80 membuka level berikutnya. |
| DRL-AC-12 | Score \<80 mempertahankan siswa pada level tersebut dan menyediakan Retry. |
| DRL-AC-13 | Level yang sudah pernah terbuka tidak terkunci kembali karena attempt berikutnya mendapat score \<80. |
| DRL-AC-14 | MVP hanya memiliki satu paket/varian soal per level; retry menggunakan paket yang sama. |
| DRL-AC-15 | Setiap attempt valid tercatat sebagai history terpisah. |
| DRL-AC-16 | Best score historis, bila digunakan, adalah score tertinggi dari attempt valid dan tidak menghapus history; kondisi terkini tetap memakai latest score. |
| DRL-AC-17 | Result menampilkan score, XP, latest stars, dan progress/unlock status. |
| DRL-AC-18 | Pembahasan hanya tersedia setelah submit. |
| DRL-AC-19 | Recommended Video hanya muncul ketika siswa gagal dan relevan dengan Subbab. |
| DRL-AC-20 | Siswa dapat membuka video melalui YouTube dan melaporkan video. |
| DRL-AC-21 | Siswa dapat melaporkan soal melalui Report Question. |
| DRL-AC-22 | Refresh/exit saat session berjalan menampilkan konsekuensi kehilangan data sesuai persistence yang benar-benar dijamin sistem. |
| DRL-AC-23 | Answer saved state tidak boleh menampilkan status Saved apabila penyimpanan gagal. |
| DRL-AC-24 | XP Drill yang valid dapat dikirim ke mekanisme activity/leaderboard sesuai rule produk tanpa duplicate contribution. |
| DRL-AC-25 | XP Drill mengikuti formula final: XP Dasar \= (Jumlah Benar / Total Soal) × 100; Bonus \= max(0, (900 − Waktu Pengerjaan) / 900 × 50); XP Akhir \= min(150, XP Dasar \+ Bonus). |
| DRL-AC-26 | Bintang mengikuti mapping final 0=0; 10–50=1; 60–90=2; 100=3 dan tidak memengaruhi unlock, XP, leaderboard, atau ranking. |

# **16\. UI/UX State Inventory**

| State | Where | Priority | Minimum design requirement |
| :---- | :---- | :---- | :---- |
| Loading | All pages | WAJIB | Skeleton/spinner \+ prevent misleading partial data. |
| Empty | Bab, history, progress, video | WAJIB | Reason \+ relevant CTA. |
| Locked | Level | WAJIB | Visual status \+ reason/eligibility hint. |
| Open | Level | WAJIB | Playable CTA; single package/variant pada MVP. |
| Completed | Level | WAJIB | Completed status \+ retry/history. |
| Pretest Available | Bab | WAJIB | Start/Skip. |
| Pretest Completed | Bab | WAJIB | No reattempt; access result/Drill. |
| Pretest Skipped | Bab | WAJIB | Proceed with Level 1\. |
| Saving | Drill Attempt | WAJIB | Transient save indicator if used. |
| Saved | Drill Attempt | WAJIB | Clear saved state. |
| Save Error | Drill Attempt | WAJIB | Error \+ retry; no false confirmation. |
| Submit Confirmation | Drill Attempt | WAJIB | Cancel/Submit. |
| Success | Result | WAJIB | Unlock \+ score \+ XP \+ stars. |
| Failure | Result | WAJIB | Retry \+ recommended video \+ explanation; latest score/star shown. |
| Video Empty/Error | Result | WAJIB — CONDITIONAL | Do not block result; show fallback. |
| Report Success/Error | Report modal | WAJIB — CONDITIONAL | Feedback after submission. |
| Session/Connection Error | Drill Attempt | WAJIB | Warning \+ recovery/exit behavior. |
| Session Available | Entry/Level | WAJIB — CONDITIONAL | Resume/re-entry behavior according to final persistence decision. |

# **17\. Dependencies & Ownership**

| Team | Dependency / Deliverable |
| :---- | :---- |
| Research & Curriculum | Bab/Subbab structure; bank soal; validation; explanation; pretest mapping; level blueprint dan kompetensi soal. |
| UI/UX | Page, component, modal, state, error, confirmation, responsive behavior, accessibility. |
| Software Engineering | Student flow; session; question delivery; scoring; persistence; submission idempotency; result; integration. |
| Data & AI | Event schema; score/XP data handling; snapshot/context data; recommendation data jika applicable. Multi-variant generation/selection bukan scope MVP. |
| Monitoring | Progress/activity consumption; report handling destination; class activity visibility. |
| QA | Acceptance tests based on AC; edge cases; duplicate submission; session/refresh; unlock persistence. |

## **17.1 Source of Truth by Decision**

| Decision | Source |
| :---- | :---- |
| Product behavior & user flow | This PRD. |
| Content competency & material correctness | Research & Curriculum. |
| Technical architecture/storage mechanism | Software Engineering. |
| Event schema / analytics implementation | Data & Software. |
| Visual interaction | UI/UX. |
| Testable acceptance | Acceptance Criteria in this PRD \+ finalized product decisions in Section 18\. |

# **18\. Finalized Decisions & Technical Boundaries**

| ID | Decision | Why it matters | Owner |
| :---- | :---- | :---- | :---- |
| FINAL-01 | Speed bonus XP: Bonus \= max(0, (900 detik − Waktu Pengerjaan) / 900 × 50). | Formula harus deterministik untuk Software/Data/QA. | Product \+ Data |
| FINAL-02 | XP Drill: XP Dasar \= (Jumlah Benar / Total Soal) × 100; XP Akhir \= min(150, XP Dasar \+ Bonus). Pretest \= 0 XP. | Menjadi sumber reward aktivitas dan leaderboard. | Product \+ Data |
| FINAL-03 | Bintang: 0 \= 0; 10–50 \= 1; 60–90 \= 2; 100 \= 3\. Kondisi terkini memakai attempt terbaru. | UI/Software/QA membutuhkan mapping final. | Product |
| FINAL-04 | Mapping score Pretest → initial unlocked levels mengikuti blueprint/mapping Research & Curriculum. | Menentukan initial state tanpa mengarang rule akademik. | Research & Curriculum |
| BOUNDARY-05 | Persistence session/answer mengikuti kemampuan storage yang benar-benar diimplementasikan; produk tidak menjanjikan persistence/resume yang tidak dijamin. | Menjaga kontrak produk tetap jujur terhadap implementasi. | Software \+ Product |
| BOUNDARY-06 | Exit sebelum submit harus memberi warning/confirmation yang menjelaskan konsekuensi. Tidak ada result final sebelum submit. | UI/UX dan Software membutuhkan state yang konsisten. | Product \+ UI/UX |
| BOUNDARY-07 | History/pembahasan mengikuti retention policy yang benar-benar diterapkan; jangan menambahkan durasi fiktif. | Menentukan availability data tanpa asumsi. | Product \+ Software |
| BOUNDARY-08 | Analytics mengikuti event list PRD; metadata minimal mencakup user/session context, bab, subbab, level, attempt ID, timestamp, dan object ID relevan. | Data/QA membutuhkan event yang dapat diuji. | Data \+ Software |
| FINAL-09 | MVP hanya satu paket/varian soal per level. Retry menggunakan paket yang sama. Multi-varian adalah post-MVP. | Menghilangkan ketergantungan variant generation/selection pada MVP. | Product \+ Curriculum \+ Software |
| FINAL-10 | Tidak ada metric 'mastery score' terpisah sebagai business rule MVP. Mastery direpresentasikan melalui unlock, completion, latest score, bintang, XP, dan history. | Menghindari metric tanpa formula atau ownership yang jelas. | Product \+ Data |

| Implementation boundarySemua keputusan produk pada bagian ini sudah final untuk MVP. Area yang ditulis sebagai BOUNDARY adalah detail implementasi/retention/UI behavior yang harus dijaga konsisten dengan PRD, tetapi tidak boleh diperluas menjadi business rule baru tanpa keputusan Product. |
| :---- |

# **19\. Revision Changelog**

| Version | Change |
| :---- | :---- |
| v1.0 | Initial Practice & Drill feature specification. |
| v1.1 | Professionalized feature PRD with functional requirements, flow, scoring, retry, result, analytics, acceptance criteria. |
| v1.2 | Clarified missing/ambiguous requirements: Recommended Video, Report Question, timer rules, speed bonus condition, pretest skip behavior, answer/session state, retry of completed levels, best score, analytics, UI states, dependencies, and explicit TBC decisions. |
| v1.3 | Finalized against NUMORA PRD v0.6 Final: exact Drill XP formula, exact star mapping, single-variant MVP, latest score/star as current state, snapshot/history alignment, final report context, and removal of product-level OPEN/TBC decisions. |

This revision preserves the original PRD v1.2 terminology, organization, requirements, states, analytics, acceptance criteria, dependencies, and UI/UX inventory while applying the finalized product decisions from NUMORA PRD v0.6 Final. Product-level OPEN/TBC items are no longer left unresolved; only technical boundaries that are explicitly outside product specification remain delegated to their owners.