# PRD khusus Admin Numora — draft kebutuhan

Tanggal mulai: 9 November 2026. Pembaruan: 10 November 2026. Status keseluruhan: **PROPOSED — belum final**.

Dokumen ini mulai merumuskan kebutuhan Admin dari diskusi pemilik, bukan menggambarkan seluruh implementasi sebagai sudah benar. Keputusan eksplisit dan pertanyaan sumber tersedia pada [catatan discovery](ADMIN_REQUIREMENTS_DISCOVERY.md). Bagian berlabel OPEN menunggu jawaban atau dokumen lanjutan; status draft bukan izin mengaktifkan kebijakan yang belum lengkap.

**Catatan sinkronisasi sumber, 10 November 2026:** pembaruan workspace memuat [penerbitan Pretest original](../development/PRETEST_ORIGINAL_RELEASE_2026-11-09.md) dan [amendemen varian/IRT v2](../AI_IRT_V2_CONTEXT.md). Sumber Pretest sudah menetapkan rubrik parsial dan placement; audit PG-only terdahulu adalah konteks historis. **OPEN — rekonsiliasi:** distribusi Drill berbasis hitungan selesai/preferensi retry pada ADM-DEC-010 perlu dicocokkan dengan assignment arm tetap v2; demikian pula paket tetap tersedia saat koreksi versus penghentian distribusi versi bermasalah/DRIFT pada v2. Pertahankan kedua sumber dan keputusan pengguna; jangan memilih aturan yang bertentangan secara diam-diam. Ini akan diselesaikan bersama pembahasan dokumen lanjutan, tanpa membuka ulang parameter ilmiah yang sudah disahkan atau mengarang parameter baru.

## 1. Tujuan dan ruang lingkup

Menyediakan acuan perilaku dan workflow Admin untuk tiga subrole, dengan prioritas memperbaiki pengelolaan asesmen. Spesifikasi harus menjelaskan konteks pengelolaan soal, perbedaan revisi/varian, master paket versus batch, pembagian paket, anchor, dan dampak perubahan terhadap attempt.

**ENGINEERING DECISION — instruksi pemilik:** tiga subrole existing tetap: Super Admin, Admin Operasional, dan Admin Content/Data/Moderation. Pemberi persetujuan kebutuhan final, validitas akademik dan hasil Data/AI belum ditentukan.

**PRD RULE — tetap berlaku:** matriks izin dasar mengikuti [ADMIN_PERMISSION_MATRIX](../api/ADMIN_PERMISSION_MATRIX.md). Operations tidak mengelola konten/IRT; Content hanya memperoleh struktur operasional terbatas dan agregat siswa. Semua Admin tidak berwenang ban/unban siswa dalam kelas atau mengubah hasil akademik historis/formula produk.

**ENGINEERING DECISION — ADM-DEC-036/SCH-08, 10 November 2026:** selama fase demo sekitar satu bulan ke depan, semua fitur gratis bagi semua pengguna sesuai role dan kewenangannya. Pembahasan monetisasi serta benefit berbayar setelah demo ditunda. Tidak ada tanggal akhir pasti atau paywall otomatis yang disepakati. Akses gratis tetap mengikuti verifikasi Guru, status sekolah, jadwal asesmen dan kesiapan konten/penilaian.

## 2. Istilah dan pemisahan konsep

| Konsep | Pengertian untuk rancangan ini | Status |
| --- | --- | --- |
| Slot Pretest | Satu pengaturan Pretest logis untuk bab yang sudah ditetapkan. | ENGINEERING DECISION — ADM-DEC-001. |
| Slot Drill | Konteks bab/subbab/level tetap yang dapat memuat beberapa varian. | ENGINEERING DECISION — ADM-DEC-007. |
| Paket original/varian | Paket dengan tujuan asesmen tertentu, berada dalam konteks master/slot. Relasi original dan turunannya memerlukan rincian lineage. | Keberadaan diminta pemilik; hubungan rinci OPEN. |
| Revisi versi | Perubahan konten/susunan pada suatu konteks paket, berbeda dari membuat varian alternatif. | PROPOSED — pemodelan untuk memenuhi immutable history. |
| Master Tryout | Pengelolaan paket original/varian beserta isi paket; dipisahkan dari penjadwalan pelaksanaan. | ENGINEERING DECISION — ADM-DEC-008. |
| Batch Tryout | Pelaksanaan yang mengatur jadwal dan paket yang akan dirilis; dapat memuat beberapa paket dengan assignment sekolah/kelas. | ENGINEERING DECISION — ADM-DEC-008. |
| Assignment | Pembagian paket dalam batch kepada sekolah/kelas; prioritas dan fallback belum ditetapkan. | Kebutuhan diminta pemilik; aturan rinci OPEN. |
| Anchor | Soal original yang dipilih manual sebelum membuat varian: 5 dari 30 untuk Tryout, 3 dari 10 untuk Drill, tidak ada untuk Pretest. Original dan varian terkait mempertahankan soal yang sama; pilihan boleh berbeda pada proses berikutnya. | ENGINEERING DECISION — ADM-DEC-009, ralat ANC-01–02, dilengkapi ANC-06. |
| Katalog soal global | Daftar baca saja untuk penelusuran soal lintas konteks dengan asal asesmen/paket/varian, informasi IRT dan laporan masalah. Input/edit tetap melalui asesmen tujuan. | ENGINEERING DECISION — ADM-DEC-015. |

Penandaan anchor tidak dengan sendirinya menyetujui kesetaraan varian, kalibrasi, parameter atau metode equating. Detail ilmiah memerlukan handoff Data/AI.

## 3. Pengelolaan soal berdasarkan tujuan

**ENGINEERING DECISION — ADM-DEC-002/005:** input soal dimulai dari fitur asesmen/slot/paket yang sedang dikelola. Paket dipakai untuk satu jenis tujuan; satu paket tidak sekaligus menjadi paket Drill dan Tryout. Root bank soal umum bukan entry point input yang diinginkan.

| Kemampuan input | Pretest | Drill | Tryout |
| --- | --- | --- | --- |
| Impor JSON | Dibutuhkan. | Dibutuhkan. | Dibutuhkan. |
| Impor Excel | Dibutuhkan. | Dibutuhkan. | Dibutuhkan. |
| Jenis soal | PG, PGK MCMA dan PGK Kategori. | PG, PGK MCMA dan PGK Kategori. | PG, PGK MCMA dan PGK Kategori. |
| Menulis soal baru manual | Tersedia. | Input baru melalui impor. | Input baru melalui impor. |
| Edit isi hasil impor | Tersedia dalam pengaturan bab. | Boleh, termasuk teks/kunci/pembahasan. | Boleh, termasuk teks/kunci/pembahasan. |
| Hasil generate | Scope belum ditentukan. | Hubungan generator/impor/master perlu rincian. | Disebut dalam workflow anchor; rincian generator/master masih OPEN. |

**ENGINEERING DECISION — ADM-DEC-011:** soal hasil impor Drill/Tryout boleh diedit manual. Input soal baru tetap melalui impor; koreksi tidak selalu memerlukan impor ulang. Revisi mempertahankan versi attempt historis.

**OPEN:** penyalinan antar paket sejenis, provenance dan pengaruh edit pada anchor/lineage hasil generate. Pemakaian konten Drill oleh PvP tetap mengikuti keputusan tersendiri yang belum diubah dalam diskusi ini.

### 3.1 Katalog soal global

**ENGINEERING DECISION — ADM-DEC-015/QST-08/10:** katalog global tetap diperlukan sebagai daftar baca saja. Katalog membantu Content/Super menelusuri soal lintas paket tanpa menjadi entry point input/edit soal umum. Matriks izin konten existing tetap berlaku.

| Informasi | Kebutuhan yang sudah dinyatakan | Rincian yang belum final |
| --- | --- | --- |
| Asal soal | Jenis asesmen, paket dan identitas original/varian; pengguna menyebut Drill dan Tryout. | Cakupan Pretest dan tampilan satu soal yang terkait beberapa proses/versi. |
| Informasi IRT | Tersedia sebagai konteks kualitas/hasil analisis soal sesuai handoff yang sah. | QST-09: field, arti, sumber, versi dan keadaan belum tersedia mengikuti dokumen Data/AI nanti. |
| Laporan masalah | Jumlah dan status laporan, serta tautan membuka detail/penanganan di modul Laporan. Laporan soal/versi sama ditangani sebagai satu kasus dengan daftar laporan terkait (§9). | Penyajian hitungan laporan versus kasus, laporan baru setelah penutupan dan status yang diringkas. |

**Alur yang disepakati:** buka katalog → telusuri soal dan konteks asalnya → lihat informasi IRT yang tersedia serta jumlah/status laporan → buka detail laporan melalui tautannya bila perlu. Pengelolaan isi tetap pada konteks asesmen/paket, dan penanganan laporan berada di modul Laporan.

**DEFERRED/OPEN — QST-09:** istilah pengguna “skor IRT” belum menetapkan metrik tertentu. Tunggu dokumen Data/AI; jangan menyamakan nilai hasil peserta dengan parameter soal atau menambahkan formula/parameter dari dugaan.

**PROPOSED — penyajian teknis:** informasi IRT mengacu versi soal dan artefak analisis yang sesuai. Bila belum ada atau tidak cocok versinya, tampilkan keadaan belum tersedia beserta alasannya, bukan angka 0. Pencarian/filter, tautan asal paket, versi historis dan ringkasan laporan perlu dirinci.

### 3.2 Master bab, subbab dan indikator

**ENGINEERING DECISION — ADM-DEC-014/CUR-01/06/07:** Content/Super boleh mengelola bab, subbab dan indikator berdasarkan sumber Curriculum. Input struktur dilakukan **manual saja**. Aturan ini khusus master struktur; impor JSON/Excel soal tetap dibutuhkan.

Penambahan bab di master materi otomatis menyediakan satu slot Pretest kosong untuk bab tersebut. Pretest itu belum bisa dikerjakan siswa sampai tepat 20 soal lengkap dan valid disimpan. Tidak perlu membuat paket Pretest bebas atau melakukan tindakan terpisah untuk menyediakan slotnya.

**Alur yang telah diarahkan:** terima sumber Curriculum → Content/Super memasukkan struktur manual → bab baru memiliki pengaturan Pretest kosong → isi dan validasi soal dari pengaturan Pretest. Blueprint/validitas akademik tetap bergantung pada sumber serta persetujuan Curriculum, bukan otomatis disahkan oleh hak mengedit struktur.

**PRD RULE — tetap berlaku:** lima level per subbab dan aturan asesmen/XP tidak menjadi parameter yang dapat diubah melalui master materi. Perubahan master tidak menghapus histori attempt, konten atau hasil yang sudah dipin.

**OPEN:** metadata wajib, kode/urutan/relasi induk, proses validasi dan approval, revisi/arsip struktur yang sudah dipakai, kesiapan tampil kepada siswa, serta kapan slot Drill disediakan untuk subbab baru. Cakupan pengelolaan kategori belum diklarifikasi ulang.

### 3.3 Jenis soal, editor dan preview

**ENGINEERING DECISION — ADM-DEC-016/AS-14:** target final Pretest, Drill dan Tryout mendukung ketiga jenis yang ditanyakan:

- PG dengan satu jawaban benar.
- PGK MCMA dengan beberapa jawaban benar.
- PGK Kategori, misalnya Benar/Salah per pernyataan.

Ini kebutuhan dukungan jenis pada masing-masing asesmen, bukan kewajiban mencampur semua jenis pada setiap paket. Jumlah soal tetap 20 Pretest, 10 Drill dan 30 Tryout. Pilihan jenis tidak menetapkan rasio komposisi, rubrik parsial atau formula penilaian baru.

**ENGINEERING DECISION — ADM-DEC-017/QST-02:** editor dalam konteks asesmen/paket harus dapat mengubah semua bagian yang ditanyakan: teks soal, rumus matematika/LaTeX, pilihan atau pernyataan, kunci jawaban, pembahasan, gambar soal/pembahasan, serta pemetaan materi dan kesulitan. Pengeditan menyesuaikan struktur jenis soal. Input baru manual tetap khusus Pretest; Drill/Tryout mengedit soal yang sudah masuk melalui impor.

**ENGINEERING DECISION — ADM-DEC-018/QST-07:** preview cukup menampilkan soal, kunci dan pembahasan. Scope ini tidak membutuhkan simulasi pengerjaan atau perhitungan nilai simulasi. Preview bukan attempt siswa dan tidak menghasilkan progres atau XP.

**Alur yang telah diarahkan:** buka soal pada Pretest/paket tujuan → edit bagian yang diperlukan → lihat preview soal/kunci/pembahasan → Simpan mengikuti kelengkapan/validitas dan aturan versi. Mengedit hasil impor tidak memindahkan authoring ke katalog global dan tidak mengubah konten attempt lama.

**OPEN / dependency:** review akademik rubrik Drill, komposisi/blueprint, konversi jenis soal existing, batas media serta pembatalan review setelah edit. Rubrik Pretest parsial dan placement sudah dicatat pada sumber penerbitan original, sedangkan policy Tryout mengikuti sumber/pin existing. Dukungan editor tidak mengesahkan blueprint atau semua item secara otomatis.

[Audit Pretest](../development/PRETEST_AUDIT_2026-11-09.md) mencatat batas PG satu jawaban pada waktu audit. [Penerbitan original berikutnya](../development/PRETEST_ORIGINAL_RELEASE_2026-11-09.md) mencatat dukungan tiga tipe dan policy baru; jangan memakai audit terdahulu sebagai bukti kesenjangan runtime terkini. Bukti di dokumen sumber tidak menjadi hasil pengujian baru dari pekerjaan PRD ini.

### 3.4 Impor satu file untuk satu paket/varian

**ENGINEERING DECISION — ADM-DEC-019/IMP-02:** satu file JSON/Excel ditujukan untuk satu paket/varian, dimulai dari konteks asesmen/slot/paket yang dikelola. Pemilahan beberapa paket/varian dari satu file bukan kebutuhan yang dipilih.

**ENGINEERING DECISION — ADM-DEC-020/IMP-03:** bila ada baris bermasalah, progres impor tetap dapat disimpan; Admin memperbaiki baris di Admin, lalu melanjutkan. Paket tetap harus lengkap dan valid sebelum dipakai siswa. Alur ini berlaku untuk impor, tanpa mengubah hak input manual Pretest versus input baru melalui impor untuk Drill/Tryout.

**Alur yang telah diarahkan:**

1. Buka pengaturan Pretest atau konteks paket/varian tujuan.
2. Unggah satu file JSON/Excel untuk tujuan tersebut.
3. Periksa preview, pemetaan dan hasil validasi baris.
4. Simpan progres impor, termasuk pekerjaan yang masih memiliki baris bermasalah.
5. Perbaiki baris bermasalah melalui Admin dan lanjutkan validasi.
6. Simpan perubahan ke paket melalui aturan jumlah, validitas, versi dan approval yang berlaku. Paket belum menjadi aktif hanya karena progres impor tersimpan.

**PROPOSED — implikasi teknis:** persistensi sesi intake menyimpan sumber, hasil parsing/pemetaan, perubahan dan error per baris secara terpisah dari konten yang sudah lolos validasi. Perbaikan dan retry mempertahankan hubungan dengan sumber serta konteks tujuan. Rincian model/API, transaksi dan deduplikasi belum ditetapkan; ini bukan izin memasukkan baris invalid sebagai versi konten sah.

**OPEN:** template/sheet dan media, cara/waktu simpan manual atau otomatis, retensi/ownership sesi, recovery setelah refresh/koneksi gagal, konflik editor, duplikasi, serta apakah impor ke paket existing menambah atau mengganti susunan pada revisi. Simpan progres tidak otomatis menentukan semua perilaku recovery tersebut.

## 4. Pretest per bab

**ENGINEERING DECISION — ADM-DEC-001/004/005/006:**

1. Admin membuka daftar bab yang sudah ditetapkan, lalu memilih pengaturan Pretest bab.
2. Satu bab memiliki satu Pretest logis, bukan sejumlah paket bebas yang perlu dibuat pengguna.
3. Admin dapat memasukkan soal manual atau melalui JSON/Excel, mengedit dan melepas soal pada revisi yang dikelola.
4. Kapasitas Pretest adalah 20 soal. Draft boleh kurang dari 20; versi aktif harus tepat 20 dan valid.
5. Simpan pada isi yang lengkap dan valid membuat perubahan langsung berlaku. Tidak menambahkan tombol Terapkan/Terbitkan terpisah sebagai default.
6. Attempt yang sudah dimulai mempertahankan konten/versi lama; attempt baru mengikuti perubahan efektif.
7. Jika draft revisi belum lengkap/valid, versi aktif lama tetap digunakan, termasuk bagi attempt baru. Setelah revisi lengkap/valid disimpan, attempt baru memakai revisi tersebut. Ini keputusan PRE-08/ADM-DEC-012.

**PRD RULE — tetap berlaku:** Pretest opsional, satu kali selesai per bab, 0 XP; skip dan placement tetap mengikuti sumber keputusan existing. Mengubah soal tidak menghapus riwayat selesai, progres atau kesempatan yang sudah digunakan.

**ENGINEERING DECISION — CUR-07:** penambahan bab pada master materi otomatis menyediakan pengaturan Pretest kosong; sebelum versi aktif pertama lengkap/valid, Pretest belum dapat dikerjakan. Pengelolaan master berada pada §3.2.

**ENGINEERING DECISION — AS-14:** Pretest mendukung PG/MCMA/Kategori pada target final. Dukungan itu mengikuti batas input dan editor pada §3.3.

**ENGINEERING DECISION — sumber penerbitan original, 9 November 2026:** policy `PRETEST_PGK_PARTIAL_V1` memakai bobot satu per soal, jawaban kosong nol dan nilai parsial per opsi/pernyataan; placement memakai total proporsi sebelum pembulatan: kurang dari 8 → Level 1, 8 sampai kurang dari 19 → Level 2, mulai 19 → Level 3. `correctCount` tetap jumlah soal benar seluruhnya. Sesi policy lama tetap memakai aturan PG lama. Rincian perhitungan dan bukti sumber mengikuti dokumen penerbitan, bukan formula baru dari discovery Admin.

**OPEN:** blueprint akademik untuk konten/revisi berikutnya, pemeriksa dan definisi validasi lengkap, termasuk pesan kepada siswa ketika belum ada versi aktif pertama. Kebijakan nilai yang sudah disahkan tidak otomatis mengesahkan semua konten baru.

## 5. Drill per level dengan beberapa varian

**ENGINEERING DECISION — ADM-DEC-005/007:** Admin memilih bab → subbab → level yang telah tersedia → mengelola original/varian pada slot itu → memasukkan soal melalui impor → validasi/Simpan. Satu slot level dapat mempunyai beberapa varian.

Ini perubahan kebutuhan dari PRD v0.6 yang membatasi satu varian MVP. Rancangan berikutnya mengikuti arahan pemilik; implementasi lama belum dinyatakan mempunyai distribusi multivarian yang lengkap.

**PRD RULE — tidak diubah dalam diskusi ini:** lima level/subbab, 10 soal/attempt level, count-up tanpa hidden timeout, mastery 80%, latest/best/unlock/XP mengikuti policy yang dipin.

**ENGINEERING DECISION — ADM-DEC-010/DRL-07–13:** dasar pemerataan adalah **jumlah attempt selesai**, dibandingkan **seluruh siswa pada level yang sama**. Default awal selalu original. Hitungan tidak dibagi menurut sekolah/kelas, dan tidak diganti dengan attempt mulai atau siswa unik. Urutan paket yang diperoleh siswa bergantung pada riwayat dan hitungan tersebut.

Urutan pemilihan saat retry:

1. Tentukan paket original/varian yang eligible pada slot level tersebut; syarat eligibility masih perlu dirinci.
2. Jika ada paket yang **belum pernah diselesaikan siswa**, gunakan subset itu sebagai kandidat. Pernah mulai/melihat tidak otomatis berarti pernah selesai.
3. Jika seluruh paket eligible sudah diselesaikan siswa, gunakan seluruh paket eligible sebagai kandidat lagi.
4. Di antara kandidat, pilih jumlah attempt selesai global paling sedikit pada level itu.
5. Jika jumlahnya sama, gunakan prioritas tetap **original → varian sesuai urutan dibuat**. Ini pemecah seri, tidak mengalahkan preferensi retry atau perbandingan jumlah selesai.

Contoh **PROPOSED — ilustrasi aturan, bukan data runtime**: original memiliki 2 completion global, V1 memiliki 8 dan V2 memiliki 5. Siswa sudah menyelesaikan original; retry membandingkan V1/V2 dan memilih V2. Setelah semua paket selesai oleh siswa, ketiganya masuk kandidat lagi dan original dipilih bila hitungan tadi masih berlaku. Ketika hitungan kandidat sama, urutan tetap digunakan.

**OPEN:** periode akumulasi, perlakuan revisi dan eligibility varian, serta fallback jika tidak ada paket eligible. Pembuatan varian baru tidak otomatis menetapkan reset hitungan atau status kalibrasinya.

**PROPOSED — implikasi teknis:** server menghitung dari attempt selesai yang durable, menerapkan filter riwayat/pemerataan/prioritas, lalu menyimpan paket terpilih pada attempt baru. Resume tidak memilih paket ulang atau menambah completion; duplicate finalization tidak boleh menambah hitungan. Konkurensi dan eligibility perlu diselesaikan tanpa mengganti basis hitungan dengan jumlah attempt berjalan. Status domain untuk “selesai” mengikuti lifecycle authoritative, bukan penghitung browser.

## 6. Master paket dan batch Tryout

**ENGINEERING DECISION — ADM-DEC-008:** master paket Tryout dipisahkan dari batch. Master berisi original/varian dan isi soalnya; batch mengatur jadwal dan paket rilis. Satu batch dapat memuat beberapa paket dengan pembagian menurut sekolah/kelas.

Contoh kebutuhan dari pemilik:

| Batch | Penerima | Paket |
| --- | --- | --- |
| Batch 1 | Sekolah A | Paket A original. |
| Batch 1 | Sekolah B | Paket A varian. |

Ini contoh assignment operasional yang disampaikan pengguna, bukan persetujuan desain eksperimen acak/A-B atau bukti paket setara secara ilmiah.

**Alur yang telah diarahkan:**

1. Kelola original pada master melalui impor, lalu edit hasil impor bila diperlukan.
2. Jika hendak membuat varian, pilih original sumber dan lima anchor terlebih dahulu. Lanjutkan pembuatan varian melalui jalur generator/impor eksternal yang masih perlu ANC-04, lalu validasi/simpan. Membuat original sendiri tidak mewajibkan penetapan anchor awal.
3. Pada pengelolaan batch, tetapkan jadwal, pilih paket master dan susun pembagian sekolah/kelas.
4. Siswa memperoleh paket berdasarkan assignment ketika batch berlaku; aturan resolusi/penguncian menunggu dokumen lanjutan.
5. Attempt, penutupan, input Data/AI dan rilis hasil mempertahankan versi dan bukti yang benar-benar digunakan.

**OPEN — dokumen lanjutan dari pengguna:** prioritas kelas/sekolah, siswa multikelas/lintas sekolah/Mandiri, perubahan membership, beberapa batch bersamaan, kapan assignment dibekukan, dan batas kesempatan per batch versus paket. Batas 30 soal tetap baseline; aturan baru jumlah soal belum diminta.

**OPEN — hubungan Simpan dan jadwal:** AS-12 tidak berarti menyimpan master otomatis membuka batch sebelum jadwal. Apakah perubahan master memengaruhi batch yang sudah menggunakan paket, serta snapshot ketika batch dibuka atau attempt dimulai, perlu ditentukan eksplisit.

## 7. Anchor dipilih pada proses pembuatan varian

**ENGINEERING DECISION — ADM-DEC-009, diralat ANC-01–02:** anchor dipilih manual ketika hendak membuat varian, bukan saat membuat original atau sesudah proses generate selesai.

| Jenis | Jumlah anchor | Jumlah soal paket | Hubungan original–varian |
| --- | --- | --- | --- |
| Tryout | 5. | 30 = 5 anchor + 25 lainnya. | Soal anchor harus sama pada original sumber dan varian terkait. |
| Drill | 3. | 10 = 3 anchor + 7 lainnya. | Soal anchor harus sama pada original sumber dan varian terkait. |
| Pretest | Tidak memakai anchor. | Tetap 20. | Tidak ada varian Pretest dalam kebutuhan ini. |

**ENGINEERING DECISION — ANC-06:** anchor merupakan bagian dari total soal, bukan tambahan. Pemilihan anchor dilakukan pada proses pembuatan varian; original tidak diwajibkan memiliki pilihan anchor sejak awal dibuat.

Pilihan anchor boleh berbeda pada setiap proses pembuatan varian. Mengubah pilihan untuk proses baru tidak mengubah relasi/versi yang digunakan pada proses lama.

**ENGINEERING DECISION — ADM-DEC-013/ANC-05:** satu proses menghasilkan satu varian. Untuk membuat varian berikutnya, ada proses baru yang dapat memiliki pilihan anchor berbeda.

Contoh ilustrasi **PROPOSED — untuk menjelaskan kebutuhan, bukan isi akademik**: original Drill O mempunyai soal O1–O10. Proses A memilih O1/O2/O3 sebagai anchor untuk V1; proses B boleh memilih O4/O5/O6 untuk V2. V1 tetap mempertahankan pilihan proses A, walaupun pilihan proses B berbeda. Ini menunjukkan mengapa anchor bukan sekadar flag global pada soal original.

**OPEN:**

- ANC-03: koreksi pilihan setelah proses berjalan/selesai, hak penggantian, audit dan dampak ketika paket sudah memiliki assignment/attempt.
- ANC-04: jalur generator/impor eksternal menunggu dokumen lanjutan yang pengguna akan kirim. Ini penundaan eksplisit, bukan pilihan yang boleh diasumsikan.
- Bukti Curriculum/Data, fungsi anchor dalam pipeline dan gate statistik tidak ditetapkan dari asumsi engineering.

**PROPOSED — bentuk interaksi dan persistensi untuk spesifikasi teknis:** pada aksi Buat varian, Admin memilih versi original sumber dan 3/5 item anchor sesuai jenis sebelum memulai proses. Simpan pilihan bersama identitas proses, versi sumber dan relasi hasilnya; jangan menimpa pilihan proses terdahulu. Daftar anchor ditampilkan dalam konteks pasangan/proses tersebut. Model tabel/API dan rincian kesamaan konten/versi belum ditetapkan sebagai kontrak final.

## 8. Simpan, draft dan histori

**ENGINEERING DECISION — ADM-DEC-003/006:** Simpan lengkap/valid membuat perubahan berlaku untuk attempt baru; attempt berjalan tetap menggunakan versi sebelumnya sampai selesai sesuai lifecycle yang berlaku. Perubahan tidak menimpa histori.

**PROPOSED — implikasi teknis:** gunakan identitas logis yang stabil dan versi konten/susunan yang dipin; pemilihan versi saat mulai dan pergantian versi diserialisasi server. Revisi, varian dan assignment batch merupakan konsep terpisah. Backend tetap authoritative untuk validasi, eligibility dan waktu.

**ENGINEERING DECISION — ADM-DEC-012:** draft Pretest tidak lengkap/valid tidak menggantikan versi aktif lama.

**OPEN:** definisi validasi termasuk approval, konflik dua editor, replay Simpan, revisi anchor, dan hubungan versi master dengan batch. Simpan tidak otomatis menyelesaikan pemisahan pembuat/pemeriksa AS-04.

**ENGINEERING DECISION — ADM-DEC-024/QST-05:** bila soal pada paket aktif terbukti salah, paket tetap tersedia selama diperbaiki. Alur penanganan ini tidak memerlukan aksi menahan penggunaan baru. Attempt baru memakai versi aktif yang berlaku saat mulai; attempt berjalan tetap pada versi sebelumnya. Revisi lengkap/valid diberlakukan menurut aturan Simpan dan hubungan batch yang masih perlu dirinci. Tidak ada penghitungan ulang hasil/XP historis dari keputusan ini.

## 9. Laporan soal/video dan moderasi

**PRD RULE — baseline tetap berlaku:** siswa melaporkan soal/video dan menerima konfirmasi terkirim; Content/Data/Moderation menangani tindak lanjut. Matriks existing memberi Content/Super hak moderasi, sementara Operations tidak mengelola laporan. Konteks investigasi tidak otomatis membuka identitas atau jawaban individual siswa ke Content.

**ENGINEERING DECISION — ADM-DEC-021/RPT-01:** beberapa laporan untuk **soal dan versi yang sama** ditangani sebagai satu kasus dengan daftar laporan terkait. Record serta jumlah laporan asli tetap dapat ditelusuri. Menggabungkan kasus tidak menghapus bukti laporan atau menyamakan beberapa versi soal. Aturan penggabungan video belum ditentukan.

**ENGINEERING DECISION — ADM-DEC-022/RPT-02:** tidak ada assignment penanggung jawab. Content/Super dapat menangani kasus langsung tanpa claim atau penugasan. Pelaku, waktu dan tindakan tetap dapat ditelusuri melalui audit; hak akses existing tetap berlaku.

**ENGINEERING DECISION — ADM-DEC-023/RPT-04:** alur status yang disepakati:

| Status | Tindakan berikutnya | Ketentuan |
| --- | --- | --- |
| Baru | Mulai tinjauan → Ditinjau. | Penanganan dilakukan Content/Super tanpa assignment. |
| Ditinjau | Tutup → Selesai atau Ditolak. | Alasan penutupan wajib. Jika ada perbaikan konten, tautkan revisinya. |
| Selesai / Ditolak | Riwayat kasus tetap dapat dibaca. | Reopen dan laporan baru setelah penutupan belum dirinci. |

**Alur yang telah diarahkan:** siswa mengirim laporan dan mendapat konfirmasi → Admin membuka kasus beserta laporan terkait/konteks konten → ubah Baru menjadi Ditinjau → investigasi dan lakukan perbaikan bila diperlukan → tutup Selesai/Ditolak dengan alasan dan tautan revisi jika ada perbaikan. Perbaikan konten dan perubahan status kasus tidak diasumsikan otomatis menjadi satu tindakan.

**ENGINEERING DECISION — ADM-DEC-024/QST-05:** paket soal tetap tersedia selama perbaikan; laporan maupun temuan soal salah tidak menahan attempt baru pada alur ini. Versi attempt berjalan serta hasil historis tetap dipertahankan. Keputusan ini tidak menetapkan perilaku otomatis video yang dilaporkan atau mencabut lifecycle arsip/review konten umum.

**ENGINEERING DECISION — ADM-DEC-025/RPT-05:** cukup konfirmasi laporan terkirim untuk siswa. Tidak menambahkan notifikasi hasil penyelesaian atau dashboard tiket siswa dalam scope ini.

**PROPOSED — implikasi teknis:** bedakan identitas kasus dengan record laporan sumber; kaitkan laporan tanpa mengubah bukti konten/versi saat dilaporkan. Server memvalidasi transisi/izin dan mencatat pelaku perubahan. Perlindungan konflik ketika dua Admin mengubah kasus diperlukan tanpa menjadikan assignment prasyarat. Model data/API dan strategi konflik belum merupakan kontrak final.

**OPEN:** kategori/urgensi/filter, bukti investigasi, ringkasan jumlah laporan versus kasus pada katalog, konflik perubahan, catatan internal, syarat penutupan rinci, propagasi status ke laporan terkait, reopen/laporan baru sesudah penutupan, serta aturan penggabungan laporan video. Perilaku video yang dilaporkan dirinci pada §10. Tidak ada SLA penanganan baru dari keputusan tanpa assignment.

## 10. Video rekomendasi

**PRD RULE — §10.1 sumber:** video YouTube direkomendasikan hanya ketika siswa gagal Drill, terkait subbab dan maksimal tiga rekomendasi. Jika tidak ada video relevan, halaman hasil Drill tetap dapat ditampilkan.

**PRD RULE — izin existing:** Content/Super mengelola video; Operations tidak mendapat hak pengelolaan video. Tampilan dan mutasi tetap mengikuti matriks izin server.

| Aspek | Kebutuhan yang sudah ditetapkan | Sumber |
| --- | --- | --- |
| Input | Manual saja; tidak memerlukan impor file video. | ADM-DEC-026/VID-05. |
| Pemetaan | Satu video hanya untuk satu subbab; bukan pemakaian video lintas subbab. | ADM-DEC-028/VID-06. |
| Kapasitas aktif | Maksimal tiga video aktif per subbab. Batas berlaku pada konten aktif, bukan hanya jumlah hasil pilihan dari pool yang lebih besar. | ADM-DEC-027/VID-02. |
| Laporan diterima | Video tetap tampil sampai diperiksa; tidak otomatis disembunyikan. | ADM-DEC-029/VID-03. |
| Tindak lanjut | Admin yang berhak memeriksa dan boleh menonaktifkan video; koreksi tautan/penggantian dilakukan dalam pengelolaan konten. | ADM-DEC-029/VID-03. |
| Pemeriksaan | Cukup manual Admin dan laporan siswa; tidak membutuhkan pemeriksaan otomatis berkala. | ADM-DEC-030/VID-04. |

**Alur yang telah diarahkan:** Content/Super mengisi video manual dan menentukan satu subbab → validasi/aktivasi dengan ketentuan metadata/kelayakan yang masih perlu dirinci → jumlah aktif tidak melampaui tiga → video direkomendasikan pada kegagalan Drill di subbab terkait → bila dilaporkan, tetap tampil sampai Admin memeriksa → perbaiki/ganti atau nonaktifkan sesuai hasil pemeriksaan. Penanganan status laporan tetap melalui modul Laporan; tidak diasumsikan bahwa menonaktifkan video otomatis menutup kasusnya.

Video yang masih aktif dan sedang dilaporkan tetap termasuk hitungan tiga video aktif. Video yang telah dinonaktifkan tidak menjadi rekomendasi aktif. Penggantian video tidak menghapus konteks laporan yang sudah tersimpan. Pengurutan hingga tiga video yang tampil belum ditentukan; tidak ada keputusan memakai rotasi dari pool aktif yang lebih besar.

**PROPOSED — implikasi teknis:** validasi server menjaga pemetaan satu subbab dan batas tiga aktif, termasuk ketika dua Admin mengaktifkan bersamaan atau mengganti video. Identitas video/normalisasi URL perlu ditetapkan agar duplikasi tidak menjadi jalan memintas relasi satu video/satu subbab. Bentuk tabel, endpoint, penanganan konflik dan strategi penggantian belum merupakan kontrak final.

**OPEN:** metadata wajib, validasi URL YouTube, identitas/duplikasi video, bukti kelayakan/approval, status awal dan syarat aktivasi/aktivasi ulang, urutan tampil, perubahan pemetaan, koreksi tautan/penggantian serta snapshot dan penggabungan laporan video. Keputusan pemeriksaan manual tidak menetapkan SLA operasional baru.

## 11. Sekolah, token dan verifikasi Guru

**PRD RULE — izin existing:** Operations/Super mengelola sekolah dan credential Guru. Content hanya mendapat struktur/count yang terbatas; tidak menerima token atau identitas individu Guru/Siswa melalui pembahasan ini.

### 11.1 Input sekolah manual

**ENGINEERING DECISION — ADM-DEC-031/SCH-07:** sekolah dimasukkan manual oleh Operations/Super. Impor sekolah tidak menjadi kebutuhan scope ini.

**ENGINEERING DECISION — ADM-DEC-032/SCH-01, mandat pemilik:** field cukup nama, kode sekolah internal dan alamat. Pengguna menyerahkan penetapan wajib/opsional kepada engineering; pilihan berikut konsisten kontrak existing:

| Field | Kewajiban | Ketentuan |
| --- | --- | --- |
| Nama sekolah | Wajib. | Harus terisi; tidak menetapkan nama unik lintas sekolah. |
| Kode sekolah internal | Wajib. | Unik pada sistem dengan normalisasi existing. Bukan NPSN; identitas durable sekolah tetap UUID. |
| Alamat | Opsional. | Boleh belum diisi atau dikosongkan melalui koreksi sesuai kontrak. |

NPSN, wilayah dan PIC tidak ditambahkan sebagai field baru dari jawaban ini. Kewajiban field merupakan keputusan dalam delegasi, bukan klaim kutipan PRD. Duplikasi, perubahan kode dan koreksi relasi masih perlu dirinci.

### 11.2 Penerbitan token dan Guru pending

**PRD RULE — §5.1 sumber:** Guru menggunakan Google Auth; token berlaku untuk satu sekolah, sekali pakai dan 3×24 jam. Token yang sudah digunakan atau kedaluwarsa tidak dapat digunakan kembali.

**ENGINEERING DECISION — ADM-DEC-033/SCH-03:** Admin dapat menerbitkan beberapa token sekaligus untuk sekolah yang dikelola. Token diserahkan offline/manual. Guru boleh terdaftar sebagai Guru tanpa token, tetapi fungsi Guru belum tersedia; yang tampil adalah informasi status pending dan tempat memasukkan token. Guru memasukkan token sendiri untuk menyelesaikan verifikasi.

**Alur yang telah diarahkan:** Operations/Super membuat atau memilih sekolah → menerbitkan satu/beberapa token → menyerahkan token offline → Guru Google login dan terdaftar pada role Guru → bila belum terverifikasi, tampil pending/informasi/input token → masukkan token sekolah yang sah → server memverifikasi dan mengonsumsi token sekali → fungsi Guru tersedia sesuai kewenangannya.

Status pending Guru berbeda dari status sekolah dan assignment Admin. Menjadi akun Guru terdaftar tidak dengan sendirinya mengaktifkan pembuatan kelas, monitoring atau fungsi Guru lain sebelum verifikasi. Bulk token tidak menetapkan pengikatan token ke nama/email Guru tertentu atau pengiriman otomatis melalui sistem.

**ENGINEERING DECISION — ADM-DEC-034/SCH-04:** menerbitkan ulang token yang belum dipakai tidak otomatis membatalkan token lama. Token lama mempertahankan expiry aslinya; token baru mempunyai masa berlaku sendiri sesuai baseline. Masing-masing tetap sekali pakai dan tunduk pada pencabutan eksplisit serta eligibility sekolah. Reissue tidak menghidupkan kembali token yang sudah dipakai, kedaluwarsa atau dicabut.

Implementasi `schools.service.ts` yang dibaca masih mencabut token sumber saat reissue. ADM-DEC-034 menetapkan kebutuhan yang berbeda; nama aksi, kontrak dan perilaku penggantinya perlu diselaraskan sebelum implementasi. Histori token lama/pemakaiannya tetap dipertahankan.

**PROPOSED — implikasi teknis:** server menyimpan operasi bulk serta hasil tiap token dengan perlindungan retry/idempotensi. Verifikasi token tetap transaksional dan memeriksa sekolah/sekali pakai/expiry. Pengungkapan token untuk penyerahan mengikuti batas credential existing; audit/log/daftar umum tidak memuat plaintext. Model operasi bulk, batas jumlah, hasil parsial dan UX penyalinan/penyerahan belum ditetapkan sebagai kontrak final.

### 11.3 Dampak sekolah nonaktif dan akses historis

**ENGINEERING DECISION — ADM-DEC-035, dilengkapi ADM-DEC-036–040/SCH-08–12 pada 10 November 2026:** sekolah nonaktif membatasi akses sekolah dan menjadikan kelas baca saja. Membership siswa tetap aktif dan dihitung; Guru tetap dapat membaca data historis yang sah dengan penanda sekolah nonaktif. Selama demo semua fitur gratis; daftar benefit berbayar setelah demo ditunda.

| Aspek | Kebutuhan dan batas keputusan |
| --- | --- |
| Penerbitan token/verifikasi baru | Baseline engineering existing menolak pada sekolah nonaktif; rincian perubahan lifecycle perlu diselaraskan dengan kebijakan baru. |
| Benefit siswa selama demo | Semua fitur gratis bagi semua pengguna sesuai kewenangannya. Contoh “Tryout gratis” pada jawaban awal tidak menjadi alasan membatasi akses gratis Mandiri selama demo. Monetisasi setelah demo ditunda. |
| Siswa multisekolah | Jika A nonaktif dan B tetap aktif, benefit yang sah melalui B tetap berlaku. Jawaban ini belum menentukan prioritas assignment paket batch. |
| Membership dan batas lima kelas | Membership pada kelas sekolah nonaktif tetap aktif dan dihitung dalam batas lima. Penonaktifan sekolah tidak menghapus/menangguhkan membership atau otomatis mengubah siswa menjadi Mandiri; status sekolah dibedakan dari status membership. |
| Kelas baca saja | Tidak menerima siswa baru, membuat kelas baru, takeover atau feedback baru pada sekolah nonaktif. |
| Akses historis Guru | Guru hanya membaca data historis dalam kewenangannya, dengan informasi sekolah nonaktif; monitoring aktivitas baru setelah penonaktifan dibatasi. |
| Hasil IRT dirilis setelah sekolah nonaktif | Guru boleh melihat hasil yang baru dirilis apabila attempt selesai sebelum penonaktifan, sepanjang akses historisnya sah. Batasnya waktu selesai attempt, bukan semata waktu rilis hasil. |
| Reaktivasi | Akses kelas/monitoring otomatis pulih bagi membership/ownership yang masih sah, menurut ADM-DEC-045/SCH-13 (§11.4). |
| Attempt melewati waktu penonaktifan dan token belum terpakai | Detail belum ditetapkan; jangan mereset histori/progres/XP atau mengubah policy pin. |

**Alur yang telah diarahkan:** Operations/Super menonaktifkan sekolah → tampilkan status/informasi nonaktif → terapkan kelas baca saja dan batas monitoring Guru → pertahankan membership aktif beserta hitungan lima kelas, histori/progres/XP akun dan benefit sah sekolah lain → tetap sediakan hasil IRT yang kemudian dirilis untuk attempt selesai sebelum penonaktifan bagi Guru yang berwenang. Ini tidak mematikan kegiatan belajar pribadi siswa yang tetap sah selama demo.

Contoh penerimaan: attempt selesai sebelum sekolah nonaktif tetapi hasil IRT dirilis sesudahnya. Guru yang memiliki akses historis sah masih dapat membaca hasil tersebut. Karena itu, “data berhenti realtime” tidak berarti seluruh field dibekukan mutlak pada detik penonaktifan.

**OPEN:** akses terhadap attempt yang selesai setelah penonaktifan, aksi leave/ban selama sekolah nonaktif, token tersisa serta otorisasi historis saat kepemilikan/keanggotaan berubah. Jawaban hasil IRT terlambat tidak menetapkan cakupan untuk seluruh keadaan tersebut.

**PROPOSED — kebutuhan teknis berikutnya:** bedakan status sekolah, membership, hak benefit dan batas pembacaan data Guru. Simpan waktu efektif yang durable dan definisikan pemeriksaan waktu selesai attempt serta kewenangan historis; pilih model snapshot/pemfilteran, transaksi/race dan audit melalui spesifikasi teknis. Perbandingan waktu persis pada batas perlu kontrak. Arsitektur penyimpanan belum dipilih oleh keputusan produk ini.

### 11.4 Reaktivasi sekolah

**ENGINEERING DECISION — ADM-DEC-045/SCH-13, 10 November 2026:** ketika sekolah diaktifkan kembali, akses kelas dan monitoring Guru otomatis pulih bagi keanggotaan/kepemilikan yang masih sah. Tidak memerlukan review manual tambahan sebagai syarat pemulihan.

**Alur yang disepakati:** Operations/Super mengaktifkan kembali sekolah → server memeriksa status sekolah dan hak pengguna terkini → kelas/monitoring kembali dapat diakses sesuai hak yang sah. Pemulihan tidak menciptakan ulang membership yang sudah berakhir atau kepemilikan yang sudah dilepas; verifikasi, status akun dan aturan domain lain tetap berlaku.

**OPEN / kebutuhan kontrak:** waktu efektif transisi berulang, visibilitas aktivitas yang terjadi selama periode nonaktif setelah reaktivasi, token tersisa dan penanganan request beririsan. Riwayat periode nonaktif/aktif serta data akademik tetap dipertahankan; model penyimpanannya belum dipilih.

## 12. Pengguna, kelas dan bantuan operasional

**ENGINEERING DECISION — ADM-DEC-041–044/PEO-01–04, 10 November 2026:** Operations/Super memerlukan daftar/detail berikut untuk penelusuran dan membantu pengguna. Content tetap hanya mendapat struktur/agregat yang diizinkan, tanpa identitas siswa.

| Tampilan | Informasi yang disepakati |
| --- | --- |
| Daftar pengguna | Nama, email, role Siswa/Guru, status akun, status verifikasi Guru, serta sekolah/kelas; pencarian/filter mengikuti data tersebut. |
| Detail siswa | Semua kelas/sekolah yang diikuti, penanda sekolah aktif/nonaktif, jumlah membership aktif dari batas lima, status Mandiri/School, serta riwayat join/leave/ban/unban. Progres dan XP tetap milik akun. |
| Detail kelas | Nama, sekolah, status kelas, Guru aktif atau belum ada Guru, jumlah anggota, roster aktif/mantan, serta waktu bergabung/keluar. |

**Alur yang disepakati:** cari/filter pengguna atau kelas → buka detail yang sesuai izin → telusuri membership/status/histori → jelaskan penyebab dan arahkan pengguna melalui alur yang sah. Untuk salah kelas, gagal bergabung atau Guru kehilangan akses, kebutuhan ini cukup dipenuhi dengan membaca data/histori dan memberi pengarahan.

**PRD RULE / batas yang dipertahankan:** Admin tidak melakukan ban/unban kelas. ADM-DEC-044 tidak meminta aksi koreksi membership atau ownership oleh Admin; takeover tetap melalui Guru terverifikasi yang sah. Membaca histori tidak memberi hak mengubah catatan akademik, progres, XP atau histori keanggotaan.

**PROPOSED — penyajian teknis:** pisahkan status akun, verifikasi, sekolah dan membership; tampilkan membership saat ini terpisah dari riwayatnya. Untuk siswa dengan beberapa kelas, hitungan batas lima memakai membership aktif, termasuk pada sekolah nonaktif sesuai ADM-DEC-038. Kontrak pencarian/pagination, definisi count/roster dan join berulang perlu dirinci. Detail Guru di luar informasi daftar, catatan bantuan internal dan daftar tindak lanjut kelas tanpa Guru belum diputuskan.

## 13. Dashboard sesuai subrole

**ENGINEERING DECISION — ADM-DEC-046–050/DASH-01–05, 10 November 2026:** setelah login semua tiga subrole Admin aktif diarahkan ke Dashboard sesuai lingkupnya. Ini menggantikan tujuan awal lama Operations ke Sekolah dan Content ke konten. Assignment kosong/nonaktif tetap tidak mendapat akses Admin.

### 13.1 Cakupan informasi

| Subrole | Agregat yang disepakati |
| --- | --- |
| Semua subrole | Siswa/kelas serta pengerjaan Drill/Tryout. |
| Operations | Cakupan bersama ditambah sekolah, verifikasi Guru/token dan status jadwal/rilis batch. |
| Content/Data/Moderation | Cakupan bersama ditambah kesiapan konten, laporan dan proses IRT. |
| Super Admin | Gabungan cakupan tersebut. |

Data tetap mengikuti izin server dan berupa agregat. Pilihan Dashboard sebagai halaman awal tidak membuka identitas siswa kepada Content, diagnostik IRT kepada Operations atau kemampuan mutasi dari angka Dashboard.

### 13.2 Filter, perbandingan dan pembaruan

1. Dashboard menyediakan filter tanggal, sekolah dan jenis asesmen.
2. Dashboard menyediakan perbandingan periode.
3. Pembaruan otomatis dilakukan setiap **lima menit**, disertai tombol **Perbarui**.
4. Waktu pembaruan ditampilkan; keadaan sumber gagal/belum tersedia dibedakan dari angka nol.
5. Unduhan/ekspor Dashboard **belum diperlukan** dalam scope ini. Ekspor modul lain/audit diputuskan terpisah.

**Alur yang disepakati:** login → Dashboard scoped → pilih filter → baca metrik dan perbandingan → gunakan angka untuk membuka konteks pekerjaan yang berhak diakses → refresh otomatis/manual. Filter dan perbandingan tidak memperluas lingkup role.

**OPEN — definisi analitik:** rentang awal, periode pembanding, event/timestamp acuan tiap metrik, timezone/batas inklusif, unit hitung akun/membership/attempt/soal/versi/paket, status yang dihitung, atribusi sekolah bagi siswa multikelas, serta perlakuan metrik tanpa dimensi tanggal/sekolah/asesmen. Cakupan metrik yang disetujui belum menyelesaikan definisi tersebut. Metrik kumulatif existing tidak otomatis bisa dihitung historis dengan memfilter timestamp record.

**PROPOSED — kebutuhan teknis:** server menerapkan filter/izin dan menghasilkan nilai beserta cakupan, waktu dan alasan unavailable; frontend mengelola interval lima menit/manual tanpa request bertumpuk atau respons lama menimpa filter/identitas baru. Perilaku tab tidak aktif, kegagalan refresh dan konsistensi snapshot perlu kontrak. Interval pembaruan UI bukan SLA kesegaran pipeline. Tidak ada rumus analitik baru yang disahkan oleh keputusan ini.

## 14. Akun Admin, undangan dan pemulihan

**PRD RULE — batas izin:** hanya Super aktif yang mengelola akun/assignment Admin; tiga subrole tetap. Tidak ada pendaftaran Admin publik atau konversi otomatis akun Siswa/Guru.

Login Google Siswa/Guru tetap tersedia. Pilihan login Admin ini tidak mencabut pengecualian akun Siswa yang disiapkan pengelola melalui email/password sebagaimana dicatat pada PRODUCT_CONTEXT/OPEN-14; tidak ada perubahan alur pengguna produk dari pembahasan akun Admin.

**ENGINEERING DECISION — ADM-DEC-051–055/ACC-01–04/06, 10 November 2026:**

| Kebutuhan | Aturan yang disepakati |
| --- | --- |
| Undangan | Super mengisi **nama, email dan satu dari tiga subrole**, semuanya wajib; undangan dikirim melalui email. |
| Penerimaan dan login | Penerima membuka tautan, membuat password, lalu login Admin menggunakan email/password. Siswa/Guru tetap Google. |
| Informasi daftar | Subrole, status undangan/akun serta hasil pemrosesan pengiriman berhasil/gagal. Sukses diproses bukan bukti email sudah diterima atau undangan sudah diterima pengguna. |
| Undangan belum diterima | Super dapat membatalkan dan mengirim ulang/pemulihan. Undangan yang sudah diterima dikelola melalui status akun. |
| Email akun produk | Email yang sudah dipakai Siswa/Guru ditolak dengan arahan menggunakan email lain; akun belajar tidak otomatis berubah menjadi Admin. |
| Lupa password | Pemulihan melalui tautan email. Recovery tidak mengaktifkan akun nonaktif atau memberikan subrole dengan sendirinya. |
| Perubahan akses | Super mengubah subrole atau menonaktifkan/mengaktifkan akun dengan konfirmasi, alasan wajib dan histori. Hak mengikuti status terbaru. |
| Super aktif terakhir | Tidak boleh dinonaktifkan atau diturunkan perannya sehingga tidak ada Super aktif. |
| Pemulihan darurat | Jika tidak ada Super bisa masuk, gunakan operator teknis melalui prosedur di luar halaman Admin, dengan alasan insiden dan audit. Penanggung jawab belum ditentukan. |

**Alur yang disepakati:** Super mengundang → sistem memeriksa email dan mencatat undangan/subrole tujuan → tampilkan status pemrosesan → penerima menerima tautan dan membuat password → penerimaan sah membuka akses sesuai assignment → login/pemulihan sesuai status akun. Jika belum diterima, Super dapat batal/kirim ulang; untuk akun diterima gunakan perubahan status/subrole yang tercatat.

**ENGINEERING DECISION — baseline teknis existing:** [runbook akun](../development/ADMIN_ACCOUNTS_RUNBOOK.md) memisahkan pengiriman, undangan durable, penerimaan, recovery dan assignment. Otorisasi memakai status database terkini pada request istimewa; Auth session yang masih valid tidak cukup bila assignment dicabut. Pending tidak mendapat akses; penerimaan ulang tidak mengaktifkan kembali akun yang sudah dinonaktifkan. Proteksi Super terakhir berlaku juga pada perubahan bersamaan. Pilihan alur pengguna ini tidak menyatakan kontrak/UI existing sudah memenuhi seluruh field/alasan yang baru diwajibkan.

**OPEN:** pihak berwenang menjalankan pemulihan operator, kebutuhan autentikasi tambahan/pembatasan sesi (ACC-05), expiry/template/retry dan tautan lama, self-change, konflik edit serta pekerjaan belum tersimpan saat hak berubah. Implementasi API/UI/provider dan bukti delivery perlu ditinjau terpisah; tidak mengeksekusi pemulihan atau mengirim email dari pekerjaan dokumentasi ini.

## 15. Acceptance yang sudah bisa diturunkan

| ID | Skenario | Hasil yang diharapkan | Sumber |
| --- | --- | --- | --- |
| ADM-AC-001 | Admin membuka modul Pretest. | Mengelola Pretest dari bab yang ditetapkan; tidak diminta membuat paket Pretest bebas. | ADM-DEC-001. |
| ADM-AC-002 | Admin menyimpan draft revisi Pretest kurang dari 20 soal. | Draft tersimpan; versi aktif lama tetap digunakan. Draft baru berlaku setelah lengkap/valid dan disimpan. | ADM-DEC-004/012. |
| ADM-AC-003 | Admin menyimpan Pretest tepat 20 soal dan valid. | Perubahan langsung berlaku bagi attempt baru. Definisi validasi/approval harus dilengkapi sebelum implementasi final. | ADM-DEC-006. |
| ADM-AC-004 | Siswa sedang mengerjakan versi A ketika versi B berlaku. | Resume/submit siswa tetap menggunakan versi A; attempt baru yang eligible menggunakan versi efektif menurut konteksnya. | ADM-DEC-003. |
| ADM-AC-005 | Admin menambah soal dari nol. | Jalur manual tersedia untuk Pretest; Drill/Tryout menggunakan impor untuk input soal baru. | ADM-DEC-005. |
| ADM-AC-006 | Admin mengelola slot level Drill dengan beberapa varian. | Default awal original; retry mengikuti preferensi belum pernah selesai, pemerataan global dan prioritas tetap sesuai §5. | ADM-DEC-007/010. |
| ADM-AC-007 | Admin menyusun Batch 1 untuk dua sekolah. | Dapat memilih original untuk sekolah A dan varian untuk sekolah B pada batch yang sama. Resolusi siswa tetap mengikuti kebijakan assignment yang belum dirinci. | ADM-DEC-008. |
| ADM-AC-008 | Admin akan membuat varian. | Memilih 5 anchor Tryout/3 Drill sebelum proses; anchor yang sama dipertahankan pada original dan hasil terkait. Pretest tidak memakai anchor. | ADM-DEC-009. |
| ADM-AC-009 | Dua proses dari original sama memilih anchor berbeda. | Masing-masing menghasilkan satu varian dengan pilihan sendiri; proses berikutnya tidak menulis ulang pilihan sebelumnya. | ADM-DEC-009/013. |
| ADM-AC-010 | Admin memperbaiki soal hasil impor Drill/Tryout. | Edit manual diperbolehkan; soal baru tetap melalui impor. Versi attempt lama tidak ditimpa. | ADM-DEC-011. |
| ADM-AC-011 | Kandidat paket pada level sama mempunyai jumlah attempt selesai berbeda. | Setelah filter riwayat retry, kandidat dengan jumlah selesai global lebih sedikit diprioritaskan; hitungan mencakup semua siswa pada level itu, tanpa segmentasi sekolah/kelas. | ADM-DEC-010. |
| ADM-AC-012 | Kandidat mempunyai jumlah selesai global sama. | Pemecah seri menggunakan original → varian sesuai urutan dibuat. Preferensi retry tetap diterapkan dahulu. | ADM-DEC-010/DRL-13. |
| ADM-AC-013 | Siswa retry dan masih ada paket eligible yang belum pernah ia selesaikan. | Kandidat dibatasi pada paket yang belum pernah selesai, lalu pemerataan global/prioritas diterapkan. Jika semua sudah selesai, gunakan seluruh kandidat eligible. | ADM-DEC-010/DRL-12. |
| ADM-AC-014 | Admin memilih anchor untuk varian Drill/Tryout. | Total tetap 10/30, terdiri dari 3+7 atau 5+25; anchor tidak menambah jumlah soal. | ADM-DEC-009/ANC-06. |
| ADM-AC-015 | Content/Super mengelola bab/subbab/indikator. | Input struktur manual berdasarkan sumber Curriculum. Penambahan bab otomatis menyediakan slot Pretest kosong yang belum dapat dikerjakan sampai 20 soal lengkap/valid. | ADM-DEC-014/CUR-06/07. |
| ADM-AC-016 | Content/Super menelusuri soal di katalog global. | Asal jenis asesmen/paket/varian dan jumlah/status laporan terlihat; tautan membuka detail laporan. Informasi IRT menunggu kontrak Data/AI. | ADM-DEC-015/QST-08–10. |
| ADM-AC-017 | Admin ingin memasukkan atau mengoreksi soal dari katalog global. | Katalog tetap baca saja; input/edit dilakukan di asesmen/slot/paket tujuan sesuai hak dan batas metode inputnya. | ADM-DEC-002/005/015. |
| ADM-AC-018 | Admin menyiapkan konten Pretest, Drill atau Tryout. | PG satu jawaban, PGK MCMA dan PGK Kategori didukung pada ketiga asesmen sesuai metode inputnya. Penilaian/aktivasi tetap memerlukan rubrik dan validasi yang sah; tidak ada kewajiban campuran jenis tertentu per paket dari jawaban ini. | ADM-DEC-016. |
| ADM-AC-019 | Admin mengedit soal dalam konteks asesmen. | Teks/LaTeX, pilihan/pernyataan, kunci, pembahasan, gambar soal/pembahasan serta pemetaan materi/kesulitan dapat diubah. Perubahan tidak menimpa versi attempt lama. | ADM-DEC-017/003. |
| ADM-AC-020 | Admin membuka preview. | Melihat soal, kunci dan pembahasan; tidak diminta simulasi pengerjaan dan tidak tercipta attempt/progres/XP siswa. | ADM-DEC-018. |
| ADM-AC-021 | Admin mengimpor JSON/Excel. | Satu file diarahkan ke satu paket/varian pada konteks tujuan, bukan beberapa paket/varian dalam satu file. | ADM-DEC-019. |
| ADM-AC-022 | Sebagian baris impor gagal validasi. | Progres dapat disimpan; baris diperbaiki di Admin lalu proses dilanjutkan. Baris salah tidak otomatis dilewati dan paket tidak menjadi aktif hanya karena progres tersimpan. | ADM-DEC-020. |
| ADM-AC-023 | Beberapa laporan mengacu soal dan versi yang sama. | Admin menangani satu kasus dengan daftar laporan terkait; record/jumlah laporan asli tetap dapat ditelusuri. Versi berbeda tidak otomatis digabung. | ADM-DEC-021. |
| ADM-AC-024 | Content/Super mulai menangani kasus. | Dapat menangani langsung tanpa assignment/claim wajib. Pelaku tindakan tetap dicatat dan Operations tidak mendapat hak moderasi baru. | ADM-DEC-022; matriks izin existing. |
| ADM-AC-025 | Kasus Ditinjau akan ditutup menjadi Selesai/Ditolak. | Wajib ada alasan penutupan dan tautan revisi jika ada perbaikan konten; alur dimulai dari Baru → Ditinjau. | ADM-DEC-023. |
| ADM-AC-026 | Soal dalam paket aktif terbukti salah dan sedang diperbaiki. | Paket tetap tersedia untuk attempt baru sampai revisi berlaku sesuai aturan; attempt berjalan tetap pada versi lama dan hasil historis tidak ditimpa. | ADM-DEC-024/003/006. |
| ADM-AC-027 | Siswa mengirim laporan soal/video, lalu Admin menyelesaikan kasusnya. | Siswa menerima konfirmasi terkirim; tidak diperlukan notifikasi hasil penyelesaian atau dashboard tiket baru dari alur ini. | ADM-DEC-025; PRD §10.2. |
| ADM-AC-028 | Content/Super mengisi daftar video. | Input manual tersedia dalam konteks pengelolaan video; impor file video tidak menjadi kebutuhan. Hak Operations tidak diperluas. | ADM-DEC-026; matriks izin existing. |
| ADM-AC-029 | Subbab sudah memiliki tiga video aktif dan Admin akan mengaktifkan video lain. | Jumlah video aktif tidak melampaui tiga, termasuk selama penggantian atau perubahan bersamaan. Urutan tampil di antara ketiganya masih perlu dirinci. | ADM-DEC-027. |
| ADM-AC-030 | Admin memetakan video. | Satu video hanya terkait satu subbab; tidak digunakan lintas beberapa subbab. Mekanisme identifikasi video/duplikasi perlu dilengkapi sebelum kontrak final. | ADM-DEC-028. |
| ADM-AC-031 | Siswa melaporkan video yang masih aktif. | Video tetap tampil sampai diperiksa; laporan tidak memicu penyembunyian otomatis. Admin yang berhak dapat menonaktifkan setelah pemeriksaan. | ADM-DEC-029. |
| ADM-AC-032 | Admin memeriksa ketersediaan video. | Cukup alur pemeriksaan manual dan laporan siswa; pemeriksaan otomatis berkala tidak menjadi syarat scope ini. | ADM-DEC-030. |
| ADM-AC-033 | Operations/Super memasukkan sekolah. | Jalur input manual tersedia; impor sekolah tidak menjadi kebutuhan. Content tetap hanya tampilan terbatas. | ADM-DEC-031; matriks izin existing. |
| ADM-AC-034 | Admin membuat sekolah dengan/ tanpa alamat. | Nama dan kode internal wajib; alamat opsional. Kode mengikuti keunikan/normalisasi existing, tanpa field NPSN/wilayah/PIC baru. | ADM-DEC-032, mandat SCH-01. |
| ADM-AC-035 | Admin perlu token untuk beberapa Guru pada sekolah sama. | Dapat menerbitkan beberapa token sekaligus untuk dibagikan offline; tiap token tetap single-use dan 3×24 jam. Batas dan hasil bulk/retry perlu kontrak sebelum implementasi final. | ADM-DEC-033; PRD §5.1. |
| ADM-AC-036 | Akun Guru terdaftar tetapi belum memasukkan token sah. | Hanya memperoleh informasi pending dan input token; fungsi Guru belum dapat diakses. Verifikasi sah mengonsumsi token sekali dan membuka fungsi sesuai kewenangan. | ADM-DEC-033; PRD §5.1. |
| ADM-AC-037 | Admin menerbitkan ulang token belum terpakai. | Token lama tidak otomatis dicabut dan mempertahankan expiry aslinya; token baru/ lama tetap mengikuti single-use, explicit revoke dan eligibility sekolah. Histori tetap ada. | ADM-DEC-034. |
| ADM-AC-038 | Siswa Mandiri atau School menggunakan fitur selama demo. | Semua fitur gratis sesuai role dan kewenangan; tidak ada paywall yang diasumsikan. Verifikasi, status sekolah, jadwal serta gate konten/penilaian tetap berlaku. | ADM-DEC-036. |
| ADM-AC-039 | Siswa memiliki kelas di sekolah A nonaktif dan B aktif. | Benefit yang sah melalui B tetap berlaku; penonaktifan A tidak membatalkannya. Prioritas assignment Tryout tetap menunggu dokumen lanjutan. | ADM-DEC-037. |
| ADM-AC-040 | Sekolah salah satu kelas siswa dinonaktifkan. | Membership kelas tetap aktif dan dihitung pada batas lima. Histori/progres/XP akun dipertahankan; siswa tidak otomatis menjadi Mandiri akibat penonaktifan sekolah. | ADM-DEC-038. |
| ADM-AC-041 | Guru/Siswa membuka kelas sekolah nonaktif atau mencoba aksi baru. | Status nonaktif terlihat; kelas baca saja. Join siswa baru, pembuatan kelas, takeover dan feedback baru ditolak. Guru hanya membaca data historis yang sah. | ADM-DEC-039. |
| ADM-AC-042 | Attempt selesai sebelum sekolah dinonaktifkan dan hasil IRT dirilis sesudahnya. | Guru yang berwenang tetap dapat membaca hasil tersebut sebagai data historis. Rilis belakangan tidak membuka monitoring aktivitas baru setelah penonaktifan atau menulis ulang hasil. | ADM-DEC-040. |
| ADM-AC-043 | Operations/Super mencari pengguna. | Daftar memuat nama/email, role Siswa/Guru, status akun/verifikasi Guru dan sekolah/kelas; tersedia pencarian/filter mengikuti data tersebut. Content tidak mendapat identitas individual. | ADM-DEC-041. |
| ADM-AC-044 | Operations/Super membuka detail siswa multikelas. | Semua kelas/sekolah, penanda sekolah aktif/nonaktif, hitungan batas lima, Mandiri/School dan histori join/leave/ban/unban tersedia; progres/XP milik akun. | ADM-DEC-042. |
| ADM-AC-045 | Operations/Super membuka detail kelas dengan atau tanpa Guru. | Nama/sekolah/status, Guru aktif/kosong, jumlah anggota, roster aktif/mantan dan waktu join/leave tersedia. Content tetap struktur/agregat. | ADM-DEC-043. |
| ADM-AC-046 | Admin membantu masalah kelas atau akses Guru. | Dapat membaca histori dan mengarahkan pengguna melalui alur sah; tidak ada kebutuhan aksi koreksi membership/ownership Admin. Ban/unban tetap Guru aktif. | ADM-DEC-044. |
| ADM-AC-047 | Sekolah diaktifkan kembali. | Akses kelas/monitoring pulih otomatis bagi membership/ownership yang masih sah tanpa review manual wajib; hak yang sudah berakhir tidak dibuat kembali. | ADM-DEC-045. |
| ADM-AC-048 | Super, Operations atau Content aktif selesai login. | Masing-masing diarahkan ke Dashboard dengan data sesuai lingkupnya; assignment kosong/nonaktif tetap tanpa akses Admin. | ADM-DEC-046. |
| ADM-AC-049 | Subrole membaca Dashboard. | Agregat bersama dan tambahan per subrole mengikuti §13.1; Super gabungan. Content tidak memperoleh identitas siswa dan Operations tidak memperoleh diagnostik IRT. | ADM-DEC-047. |
| ADM-AC-050 | Admin memfilter Dashboard dan membandingkan periode. | Filter tanggal/sekolah/jenis asesmen serta perbandingan periode tersedia sesuai izin. Definisi waktu, atribusi dan metrik perlu kontrak sebelum nilai dapat diverifikasi secara menyeluruh. | ADM-DEC-048. |
| ADM-AC-051 | Dashboard terbuka dan data diperbarui. | Refresh otomatis lima menit dan tombol Perbarui tersedia; waktu pembaruan serta keadaan gagal/unavailable jelas dan tidak diganti angka nol. | ADM-DEC-049. |
| ADM-AC-052 | Admin ingin mengunduh Dashboard. | Unduhan Dashboard tidak menjadi kebutuhan scope ini. Tidak otomatis menetapkan keputusan ekspor modul lain. | ADM-DEC-050. |
| ADM-AC-053 | Penerima undangan Admin menyiapkan akses atau lupa password. | Menggunakan tautan email untuk membuat/memulihkan password dan login email/password sesuai status sah. Siswa/Guru tetap Google. | ADM-DEC-051. |
| ADM-AC-054 | Super mengundang Admin dan melihat daftar akun. | Nama/email/satu subrole wajib; subrole, status undangan/akun dan hasil pemrosesan pengiriman terlihat. Pengiriman diproses tidak ditampilkan sebagai bukti delivery/acceptance. | ADM-DEC-052. |
| ADM-AC-055 | Super mengelola undangan belum diterima atau mengundang email akun produk. | Batal/kirim ulang/pemulihan tersedia sesuai status. Email Siswa/Guru ditolak dengan arahan email lain, tanpa konversi akun belajar. | ADM-DEC-053. |
| ADM-AC-056 | Super mengubah subrole atau nonaktif/aktif akun Admin. | Wajib konfirmasi/alasan/histori; hak mengikuti status terbaru. Penonaktifan/demosi Super aktif terakhir ditolak termasuk pada perubahan bersamaan. | ADM-DEC-054; baseline runbook. |
| ADM-AC-057 | Tidak ada Super dapat masuk dan perlu pemulihan darurat. | Alur melalui operator teknis luar halaman Admin dengan alasan insiden dan audit. Penunjukan pihak berwenang tetap dependency OPEN sebelum prosedur operasional lengkap. | ADM-DEC-055. |

Ini rancangan acceptance, belum hasil tes atau bukti dukungan API/UI. Prinsip sekolah nonaktif/demo SCH-08–12 sudah diklarifikasi; reaktivasi otomatis bagi hak sah sudah diklarifikasi, sementara rincian transisi, attempt melewati batas waktu dan otorisasi historis tetap OPEN. Definisi filter/perbandingan metrik dan penanggung jawab pemulihan operator juga belum lengkap. Skenario penolakan izin, versioning, retry dan lintas role perlu dilengkapi dalam spesifikasi teknis.

## 16. Modul lain dan kelengkapan dokumen final

Kebutuhan akun/recovery, Dashboard, pengguna/kelas dan reaktivasi sudah diarahkan pada §11.4–14; rincian kontrak serta kebutuhan audit, keamanan sesi, notifikasi, retensi, master/katalog/editor/impor/media, generator dan acceptance masih berada dalam [daftar pertanyaan](ADMIN_REQUIREMENTS_DISCOVERY.md). Cakupan yang sudah diputuskan tidak perlu ditanyakan ulang; definisi filter/perbandingan Dashboard, operator pemulihan dan dependency akademik tetap terlihat sebagai OPEN. Monetisasi setelah demo ditunda sesuai instruksi pemilik.

**PROPOSED — keluaran teknis setelah aturan lengkap:** matriks aksi/role, state machine, API/OpenAPI yang mengacu kontrak shared/generated, model data/migrasi, transaksi/idempotensi, error, job/outbox, audit, compatibility dan pemetaan acceptance. Dokumen lanjutan pengguna akan ditautkan sebagai sumber; kontrak Data, blueprint/rubric dan persetujuan akhir yang masih OPEN tetap menjadi dependency yang terlihat.
