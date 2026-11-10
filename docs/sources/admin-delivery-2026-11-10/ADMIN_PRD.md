# PRD Admin Numora

Versi 1.0 · 10 November 2026 · **Konsolidasi kebutuhan untuk acuan implementasi**.

Dokumen ini merangkum keputusan pemilik selama 9–10 November 2026 menjadi kebutuhan Admin. Pasangannya adalah [Spesifikasi Teknis Admin](../architecture/ADMIN_TECHNICAL_SPEC.md). [Catatan discovery](ADMIN_REQUIREMENTS_DISCOVERY.md#21-keputusan-kebutuhan-dari-klarifikasi-pemilik) menyimpan jawaban dan keputusan ADM-DEC-001–076. Dokumen ini tidak menyatakan seluruh perilaku sudah tersedia atau sudah lulus penerimaan aplikasi.

**ENGINEERING DECISION — ADM-DEC-076, instruksi terakhir pemilik:** atribut, validasi dan detail rutin mengikuti kontrak serta implementasi yang sudah ada. Tidak diperlukan putaran pertanyaan atribut berikutnya. Perubahan fungsi yang sudah disepakati tetap berlaku; ketergantungan akademik dan konflik kebijakan dicatat pada §17.

Label **PRD RULE** berarti aturan baseline PRD yang masih berlaku. **ENGINEERING DECISION** mencakup amendemen atau keputusan operasional pemilik yang tercatat. **PROPOSED** berarti rancangan teknis belum disahkan. **OPEN** berarti keputusan substantif atau penyerahan yang belum tersedia. Status dokumen konsolidasi tidak mengubah OPEN menjadi persetujuan.

Sumber utama: [PRD v0.6](sources/PRD_Numora_v0.6.docx.md), [amendemen varian/IRT v2 beserta dua belas kebijakan operasional](../AI_IRT_V2_CONTEXT.md), [penerbitan Pretest original](../development/PRETEST_ORIGINAL_RELEASE_2026-11-09.md), [kontrak kalibrasi v1](../IRT_CALIBRATION_CONTRACT_V1.md), dan keputusan pemilik dalam discovery. Bila catatan discovery bertentangan dengan amendemen v2, gunakan register §17; jangan menggabungkan keduanya menjadi algoritma baru.

## 1. Tujuan dan ruang lingkup

Admin menyediakan pengelolaan konten dan pelaksanaan asesmen, operasional sekolah, dukungan pengguna, moderasi, pemantauan hasil serta pengelolaan akses Admin. Prioritas perbaikan adalah alur asesmen: Pretest mengikuti bab, Drill mengikuti slot level, dan master paket Tryout terpisah dari batch pelaksanaan.

**ENGINEERING DECISION — ADM-DEC-036:** selama fase demo sekitar satu bulan ke depan semua fitur gratis bagi pengguna sesuai role dan kewenangannya. Tidak ada tanggal akhir pasti atau paywall otomatis yang disepakati. Monetisasi sesudah demo ditunda; verifikasi Guru, status sekolah, jadwal serta kelayakan konten tetap berlaku.

Cakupan versi ini meliputi Dashboard, master materi, Pretest, Drill, master/batch Tryout, katalog soal, impor/editor/media, proses varian dan IRT yang sudah mempunyai dasar sah, video, laporan, sekolah/token, pengguna/kelas, akun Admin serta histori aktivitas. Kebutuhan target dibedakan dari kekurangan implementasi pada spesifikasi teknis.

Tidak ditambahkan: bank soal umum sebagai pintu input, simulasi pengerjaan Admin, ekspor Dashboard atau histori aktivitas, pusat notifikasi Admin, modul tiket insiden, pemeriksaan otomatis berkala video, editor formula produk, OTP/MFA atau batas perangkat baru. Tidak ada fitur Admin untuk ban/unban kelas, memindahkan membership atau mengambil kepemilikan kelas.

## 2. Aktor, izin dan istilah

**PRD RULE:** tepat tiga subrole; Content/Data/Moderation merupakan satu subrole gabungan. Assignment kosong atau akun nonaktif tidak memperoleh kemampuan Admin. Otorisasi mengikuti [matriks izin](../api/ADMIN_PERMISSION_MATRIX.md) dan diperiksa di server pada setiap permintaan.

| Lingkup | Super Admin | Operations | Content/Data/Moderation |
| --- | --- | --- | --- |
| Dashboard | Gabungan agregat yang sah | Agregat operasional | Agregat konten/IRT |
| Sekolah dan token Guru | Kelola | Kelola | Struktur/count baca saja, tanpa credential |
| Pengguna, identitas, roster dan histori membership | Baca sesuai API operasional | Baca sesuai API operasional | Struktur/agregat tanpa identitas individual |
| Materi, soal, asesmen, media, video | Kelola | Tidak | Kelola |
| Laporan dan operasi IRT | Kelola | Tidak | Kelola |
| Akun/undangan Admin | Kelola | Tidak | Tidak |
| Histori aktivitas | Seluruh domain yang sah | Domain operasional | Domain konten/moderasi/IRT, identitas dibatasi |
| Ban/unban kelas, ubah hasil/XP historis atau formula | Tidak | Tidak | Tidak |

| Istilah | Makna |
| --- | --- |
| Slot Pretest | Satu pengaturan logis per bab; dapat mempunyai beberapa revisi internal. |
| Slot Drill | Pengaturan bab → subbab → Level 1–5; berisi original dan varian/revisinya. |
| Master paket | Identitas dan isi paket untuk satu jenis asesmen. Paket tidak dipakai sekaligus untuk Drill dan Tryout. |
| Revisi | Perubahan isi atau susunan dalam identitas paket; versi yang sudah digunakan dipertahankan. |
| Varian | Paket alternatif yang mempunyai sumber dan lineage, berbeda dari revisi. |
| Batch Tryout | Jadwal pelaksanaan, daftar paket yang dipin dan pengaturan alokasi. |
| Assignment / delivery | Paket atau arm yang ditetapkan / paket yang benar-benar disajikan. Keduanya dapat berbeda pada fallback yang sah. |
| Anchor | Item sumber yang sama versinya pada pasangan original–varian; dipilih dalam proses pembuatan varian. |
| Katalog global | Penelusuran soal lintas asesmen; baca saja dan menyediakan tautan ke konteks asal. |

## 3. Materi, soal, editor dan impor

### 3.1 Master materi

**ENGINEERING DECISION — ADM-DEC-014/061/062/071/072:** Content/Super memasukkan bab, subbab dan indikator secara manual berdasarkan sumber Curriculum. Atribut menggunakan representasi existing: kode, nama/deskripsi, urutan bila tersedia, status serta induk yang sesuai. Kode mengikuti sumber Curriculum dan aturan keunikan existing. Tidak membuat atribut baru hanya untuk menyamakan label antartingkat struktur.

Sumber atau metadata yang belum lengkap tetap draft; hak mengedit master tidak menggantikan persetujuan Curriculum.

Alur: buka master → tambah/ubah struktur → validasi → simpan → tampilkan kesiapan dan tautan ke asesmen. Bab baru otomatis mempunyai satu slot Pretest kosong; subbab baru otomatis mempunyai lima slot Drill Level 1–5 kosong. Penyediaan slot tidak membuat soal atau mengaktifkan asesmen.

Daftar materi memperlihatkan kelengkapan, jumlah soal/paket valid pada tiap slot, alasan belum siap dan tautan pengaturan. Draft dipisahkan dari versi yang tersedia bagi siswa. Kelengkapan bukan persetujuan akademik atau bukti kelayakan IRT.

Pengarsipan ditolak selama bab/subbab/indikator masih menjadi ketergantungan paket aktif. Tampilkan ketergantungan yang harus diselesaikan. Setelah ketergantungan aktif selesai, arsip mempertahankan seluruh referensi historis. Lima level dan aturan produk tidak dapat diubah melalui master.

### 3.2 Input dan katalog soal

**ENGINEERING DECISION — ADM-DEC-002/005/011/015/016:** soal dimasukkan dari asesmen/slot/paket tujuan. Satu paket hanya mempunyai satu tujuan asesmen.

| Kemampuan | Pretest | Drill | Tryout |
| --- | --- | --- | --- |
| Tambah soal baru manual | Ya | Melalui impor | Melalui impor |
| Impor JSON/Excel | Ya | Ya | Ya |
| Edit soal hasil impor | Ya | Ya | Ya |
| PG, PGK MCMA, PGK Kategori | Ya | Ya | Ya |
| Preview soal, kunci, pembahasan | Ya | Ya | Ya |

Katalog global menampilkan soal dari konteks asesmen yang tersedia, asal jenis/paket/original–varian/versi, informasi IRT yang sesuai artefak sah, serta jumlah/status laporan dan tautan detailnya. Jumlah laporan sumber dibedakan dari jumlah kasus. Pencarian/filter/pagination memakai pola existing. Input dan edit dilakukan melalui tautan konteks tujuan.

**OPEN — QST-09/ADM-DEP-04:** arti dan rincian informasi IRT mengikuti penyerahan Data/AI. Sebelum artefak tersedia atau ketika versinya tidak cocok, tampilkan status belum tersedia dan alasannya. Parameter item bukan nilai peserta; tidak mengganti data kosong dengan angka nol.

### 3.3 Editor, preview dan media

**ENGINEERING DECISION — ADM-DEC-017/018/069:** editor mencakup teks, LaTeX, pilihan/pernyataan, kunci, pembahasan, gambar soal/pembahasan serta pemetaan materi dan kesulitan. Editor mengikuti struktur tipe soal yang dipilih. Tidak diwajibkan mencampur ketiga tipe dalam setiap paket; blueprint dan rubrik tetap mengikuti sumber sah.

Preview menampilkan soal, kunci dan pembahasan. Preview tidak membuat attempt, nilai, progres atau XP siswa.

Gambar mendukung PNG/JPG/WebP, unggah, preview, penggantian dan teks alternatif. Batas teknis existing adalah **5 MiB per gambar (5.242.880 byte)**; validasi MIME, signature, ukuran dan checksum dilakukan server. Gambar baru dipakai setelah unggah terverifikasi. Kegagalan terlihat dan dapat dicoba ulang; gambar versi historis tidak diganti saat gambar revisi diubah.

### 3.4 Impor dan progres

**ENGINEERING DECISION — ADM-DEC-019/020/063/064/070:** satu file JSON/Excel untuk satu paket/varian, selalu dari tujuan yang sudah dipilih.

1. Buka Pretest/slot/paket tujuan dan pilih impor.
2. Jika sudah ada isi, pilih **Tambahkan** atau **Ganti isi**; lihat dampak terhadap revisi sebelum diterapkan.
3. Unggah dan parse file memakai template existing; tampilkan sumber, pemetaan, jumlah, error dan peringatan duplikat per baris.
4. Autosave menyimpan progres, termasuk baris bermasalah. Perbaiki baris tersebut di Admin dan validasi lagi; tidak otomatis melewati baris salah.
5. Untuk dugaan duplikat konten, tandai baris dan minta keputusan Admin sebelum menerapkan impor. Tidak otomatis menggabungkan soal lintas paket atau mengubah anchor/histori. Pelanggaran identitas/constraint tetap harus diperbaiki.
6. Terapkan hasil ke draft tujuan setelah koreksi/keputusan; Simpan eksplisit mengikuti §8. Progres intake bukan aktivasi.

Template, pemetaan field dan validasi teknis memakai kontrak existing. Intake dapat menyimpan pekerjaan yang belum layak, sedangkan versi aktif harus berjumlah tepat 20/10/30 dan memenuhi gate konten/penilaian. Retry tidak membuat paket atau soal ganda dari operasi yang sama.

Kelebihan jumlah diperbaiki pada preview sebelum diterapkan sebagai isi paket; progres intake tetap dapat disimpan tanpa melewati kapasitas paket.

## 4. Pretest per bab

**ENGINEERING DECISION — ADM-DEC-001/004/006/012/014:** daftar Pretest menampilkan bab yang sudah ada dan status pengaturannya. Aksi utamanya **Atur Pretest**, bukan Tambah paket atau Tambah bab. Pengelolaan bab berada pada master materi.

Alur: pilih bab → lihat versi aktif dan draft → tambah manual/impor → edit/lepas soal → preview → Simpan. Kapasitas 20 soal; draft boleh kurang, versi aktif harus tepat 20 lengkap dan valid. Draft tidak lengkap tidak menggantikan versi aktif lama. Jika belum ada versi aktif pertama, slot belum dapat dikerjakan; tampilkan alasan belum tersedia.

Simpan revisi lengkap/valid dan memenuhi persetujuan yang sah membuatnya berlaku bagi start baru. Attempt yang sedang berjalan tetap memakai versi saat mulai. Satu bab tetap satu Pretest logis meskipun terdapat beberapa revisi internal.

**PRD RULE:** Pretest opsional, maksimal satu kali selesai per bab, tanpa XP. Revisi tidak mereset kesempatan atau riwayat placement. Skip memulai Level 1.

**ENGINEERING DECISION — sumber penerbitan 9 November:** `PRETEST_PGK_PARTIAL_V1` memberi poin proporsi per opsi/pernyataan, bobot satu per soal, kosong nol. Placement berdasarkan total poin sebelum pembulatan: <8 → Level 1; 8–<19 → Level 2; ≥19 → Level 3. Nilai tampilan total poin ×5. `correctCount` menghitung item benar penuh secara terpisah. Attempt legacy mempertahankan policy lamanya. Audit PG-only sebelumnya merupakan konteks historis.

## 5. Drill per level

**ENGINEERING DECISION — ADM-DEC-007:** pilih bab → subbab → Level 1–5 → kelola original/varian di slot → impor soal → edit/preview → Simpan. Slot tidak dibuat sebagai paket bebas. Setiap versi yang dipakai berisi tepat 10 soal valid; varian terkait memuat 3 anchor + 7 focal.

**PRD RULE / amendemen existing:** mastery 80%, latest score/stars, best score dan unlock history mengikuti policy attempt. Count-up memakai durasi aktif, dijeda saat keluar dan dilanjutkan saat resume sesuai [kebijakan timer](../development/DRILL_V06_REWARDS.md). Tidak ada hidden timeout baru atau editor formula XP pada Admin.

**ENGINEERING DECISION — v2 sebagai target sumber:** satu original dan satu varian aktif per level, assignment A/B persisten; retry baru menggunakan versi aktif di arm yang sama. Beberapa varian dapat tersimpan sebagai kandidat/riwayat tanpa berarti semuanya aktif bersamaan. Sesi berjalan tidak berubah ketika versi baru aktif.

Jika varian dihentikan dan penggantinya belum siap, start/retry boleh menerima original aktif yang sah sementara. Catat assignment asal terpisah dari delivery aktual dan alasan fallback. Setelah pengganti siap, start berikutnya kembali ke arm asal; sesi original yang sudah berjalan tetap pinned. Siswa lama tidak menjadi fresh karena eksperimen baru; retry bukan evidence independen. Paparan lintas fitur untuk beta Drill diperbolehkan, tetapi provenance tetap dicatat.

**OPEN — ADM-DEP-01, kebutuhan discovery ADM-DEC-010:** pengguna meminta default original dan pemilihan paket dengan urutan berikut:

1. Pada retry, prioritaskan paket eligible yang belum pernah diselesaikan siswa.
2. Jika semuanya pernah selesai, gunakan semua paket eligible.
3. Pilih jumlah **attempt selesai global pada level yang sama** paling sedikit.
4. Jika seri, original → varian menurut urutan dibuat.

Keinginan ini dipertahankan sebagai keputusan discovery, tetapi bertentangan dengan assignment arm tetap v2 dan target dua paket aktif. Jangan menerapkan rotasi lintas arm atau menyamarkannya sebagai randomisasi. ADM-AC-006/011/012/013 menunggu rekonsiliasi ini; tidak menjadi syarat untuk mengubah runtime yang sudah dipin.

## 6. Master paket dan batch Tryout

**ENGINEERING DECISION — ADM-DEC-008 dan amendemen v2:** master berisi paket original/varian serta isi; batch berisi jadwal, daftar paket dan alokasi pelaksanaan. Satu batch dapat memakai beberapa paket, masing-masing tepat 30 soal. Pembuatan soal baru melalui impor; isi hasil impor boleh diedit.

Alur master: buka daftar → buat/pilih original → impor dan perbaiki → validasi/Simpan → bila membuat varian, pilih sumber dan lima anchor dahulu → proses varian (§7) → review/validasi/Simpan hasil pada master.

Alur batch: buat/pilih batch → gunakan field jadwal existing → pilih versi paket yang layak → atur alokasi yang sah → bekukan daftar paket sebelum batch dimulai → buka sesuai jadwal → tutup dan finalisasi attempt → proses nilai → rilis nilai dan pembahasan bersama.

Contoh kebutuhan operasional: sekolah A pada Batch 1 menerima paket A original, sekolah B menerima paket A varian. Aturan prioritas sekolah/kelas, multisekolah dan Mandiri menunggu dokumen batch lanjutan; bukan alasan menebak alokasi. Operations melihat status jadwal/rilis; pengelolaan konten dan proses IRT tetap Content/Super.

**ENGINEERING DECISION — v2:** satu siswa maksimal satu attempt per batch, bukan per paket/arm. Daftar paket dibekukan sebelum batch mulai. Simpan master tidak membuka batch lebih awal dan tidak mengganti paket pada batch yang sudah dibekukan. Revisi berikutnya menjadi kandidat untuk penggunaan berikutnya; attempt lama tetap pinned. Jadwal menggunakan Asia/Jakarta dan batas akhir attempt tidak melampaui penutupan batch. Pengaturan rilis fleksibel existing tidak dihapus oleh spesifikasi ini.

### 6.1 Nilai dan proses IRT

**ENGINEERING DECISION — v2 dan kontrak kalibrasi v1:** setelah batch tutup, Numora membekukan input berversi/pseudonim → membuat request compute → memantau status/retry yang sah → memvalidasi/adopsi artefak → memeriksa cakupan hasil → menerbitkan nilai serta pembahasan serentak per batch maksimal 72 jam setelah tutup. Compute sukses atau artefak diadopsi belum berarti hasil terbit.

Mode hasil ditentukan per paket/arm: IRT bila seluruh gate sah terpenuhi; fallback yang disahkan bila arm belum layak. Fallback memakai poin valid terbobot/maksimum valid ×100; maksimum valid nol adalah **UNSCORABLE**, bukan nilai nol. Hasil terlambat tidak mengganti hasil final historis. Tidak ada ranking/percentile nilai Tryout; leaderboard aktivitas XP tetap berlaku. XP diposting menurut policy attempt saat selesai, terpisah dari rilis IRT.

Metode mapping IRT yang dipilih adalah prediksi poin pada satu paket acuan frozen per batch, dinormalisasi ke 0–100 setelah linking lolos. Bentuk payload sudah ditetapkan oleh [kontrak v1](../IRT_CALIBRATION_CONTRACT_V1.md); parameter numerik, policy ilmiah, producer/adapter/adopter dan integrasi publikasi yang belum lengkap tetap dependency. Admin tidak menyediakan force release, pengisi parameter palsu atau pengedit hasil historis.

## 7. Anchor dan pembuatan varian

**ENGINEERING DECISION — ADM-DEC-009/013:** anchor dipilih manual saat **hendak membuat varian**, bukan saat pertama membuat original atau sesudah generate selesai. Satu proses menghasilkan satu varian.

| Asesmen | Total | Anchor | Focal |
| --- | --- | --- | --- |
| Pretest | 20 | Tidak ada | Tidak mempunyai varian pada scope ini |
| Drill | 10 | 3 | 7 |
| Tryout | 30 | 5 | 25 |

Alur: pilih versi original sumber → pilih tepat 3/5 anchor → simpan pin sumber/pilihan proses → jalankan jalur pembuatan varian yang sah → validasi hasil memuat anchor dengan versi identik → review → simpan varian. Set anchor boleh berbeda pada proses berikutnya tanpa mengubah proses/pasangan lama.

Anchor adalah relasi proses/pasangan dan bukan flag global yang ditimpa pada soal original. Mengedit anchor menghasilkan versi baru; tidak mengubah bukti pasangan yang sudah dipakai. Kesamaan jumlah atau pilihan manual tidak membuktikan linking, stabilitas atau kesetaraan IRT.

**OPEN — ANC-04/ADM-DEP-03:** jalur pembuatan varian dan hubungan generator/impor mengikuti dokumen lanjutan yang dijanjikan pengguna. Kapabilitas generator existing tetap mengikuti gate dan kontraknya; tidak menjadikan hasil generate otomatis terbit atau membuat jalur input umum baru. Keluaran target satu varian per proses tidak mengizinkan generate massal tanpa review.

## 8. Simpan, versi, autosave dan konflik

**ENGINEERING DECISION — ADM-DEC-003/006/012/063/065:** autosave menyimpan progres/draft, termasuk yang belum valid; **Simpan** eksplisit memberlakukan revisi hanya jika lengkap, valid dan memenuhi gate konteks. Tidak ada tombol Terapkan/Terbitkan tambahan sebagai langkah rutin. Persetujuan akademik yang masih diperlukan tidak dilewati oleh penggabungan aksi UI.

| Keadaan | Hasil |
| --- | --- |
| Autosave berhasil | Draft/progres tersimpan; versi efektif tidak berubah. |
| Simpan draft belum lengkap/valid | Pekerjaan tetap tersimpan; tampil alasan belum berlaku dan versi aktif lama. |
| Simpan lengkap/valid dan seluruh gate terpenuhi | Revisi efektif untuk start baru pada konteks yang belum dibekukan. |
| Attempt sudah dimulai | Konten, susunan dan scoring policy tetap versi saat mulai sampai selesai. |
| Batch Tryout sudah frozen | Pin batch dipertahankan; revisi master tidak menggantinya. |
| Admin lain lebih dahulu mengubah dasar revisi | Tolak overwrite; beri informasi konflik, pertahankan edit lokal selama masih berwenang, muat versi terbaru sebelum melanjutkan. |

Sistem membedakan status draft tersimpan, belum dapat diberlakukan, dan sudah efektif. UI tidak mengakui berhasil sebelum server mengonfirmasi. Autosave dan Simpan sama-sama menjaga revisi dasar. Retry aksi yang sama tidak membuat revisi/paket ganda. Histori soal, hasil, XP, unlock dan policy pin tidak dihitung ulang.

**OPEN — ADM-DEP-02:** ADM-DEC-024 meminta paket tetap tersedia selama koreksi, sedangkan v2 menghentikan distribusi baru pada versi invalid/DRIFT material. Laporan masuk tidak otomatis membuktikan invalid dan tidak otomatis menahan paket. Untuk invalid/DRIFT yang sudah ditetapkan, ikuti gate v2; keputusan discovery tetap dicatat untuk rekonsiliasi sebelum mengubah kebijakan availability. Attempt berjalan tetap pinned pada kedua arah tersebut.

## 9. Laporan dan moderasi

**ENGINEERING DECISION — ADM-DEC-021–025/068:** laporan soal dan versi yang sama masuk satu kasus dengan daftar laporan sumber. Versi berbeda tidak otomatis digabung; record dan jumlah laporan asli dipertahankan. Penanganan Content/Super tanpa assignment/claim wajib. Operations tidak memperoleh izin moderasi.

| Status UI | Status kontrak | Transisi |
| --- | --- | --- |
| Baru | OPEN | Mulai tinjauan → Ditinjau |
| Ditinjau | IN_REVIEW | Tutup → Selesai atau Ditolak |
| Selesai | RESOLVED | Laporan baru pada soal/versi sama → Baru pada kasus lama |
| Ditolak | REJECTED | Laporan baru pada soal/versi sama → Baru pada kasus lama |

Alur: siswa melapor → konfirmasi terkirim → Admin membuka kasus dan konteks versi → meninjau → memperbaiki konten bila perlu → menutup dengan alasan wajib dan tautan revisi bila ada perbaikan. Perbaikan konten tidak otomatis menutup kasus. Reopen mempertahankan histori penutupan dan seluruh laporan terkait.

Bukti investigasi menggunakan data versi yang sudah tersedia; Content tidak mendapatkan identitas/jawaban individual siswa. Laporan video tetap memakai alur dan identitas target existing; penggabungan baru yang disepakati berlaku untuk soal/versi. Tidak ada notifikasi penyelesaian kepada siswa atau SLA penanganan baru.

## 10. Video rekomendasi

**PRD RULE:** video YouTube ditampilkan hanya saat gagal Drill, sesuai subbab. Halaman hasil tetap tersedia bila tidak ada video relevan.

**ENGINEERING DECISION — ADM-DEC-026–030/066/067:** Content/Super memasukkan video secara manual. Input inti judul, URL YouTube dan subbab; atribut tambahan yang sudah ada tetap mengikuti baseline. Deskripsi opsional tidak menjadi kewajiban menambah field baru (§19).

Satu video hanya untuk satu subbab; maksimal tiga video aktif per subbab. Urutan rekomendasi otomatis mengikuti urutan video ditambahkan, tanpa pengurutan manual. Video dilaporkan tetap tampil sampai diperiksa dan tetap dihitung sebagai aktif; Admin dapat memperbaiki/mengganti/menonaktifkan. Tidak ada pemeriksaan otomatis berkala.

Alur: tambah video → validasi URL/subbab → simpan/aktifkan sesuai lifecycle existing → rekomendasikan menurut urutan ditambahkan → bila ada laporan, periksa manual → perbaiki/ganti/nonaktifkan → selesaikan laporan secara terpisah. Penggantian mempertahankan konteks laporan lama. Aktivasi bersamaan tidak boleh menghasilkan lebih dari tiga video aktif.

## 11. Sekolah, token dan verifikasi Guru

### 11.1 Sekolah

**ENGINEERING DECISION — ADM-DEC-031/032:** Operations/Super memasukkan sekolah manual. Nama dan kode internal wajib; alamat opsional. Kode unik mengikuti normalisasi existing; tidak menambah NPSN, PIC atau wilayah. Content hanya membaca struktur/count sesuai izin.

### 11.2 Token dan Guru pending

**PRD RULE / ADM-DEC-033/034:** token khusus satu sekolah, sekali pakai, berlaku 3×24 jam. Admin dapat menerbitkan beberapa token sekaligus untuk dibagikan offline. Guru terdaftar melalui Google tanpa token memperoleh halaman pending/informasi dan input token; fungsi Guru belum tersedia sampai verifikasi sah.

Alur: pilih sekolah aktif → terbitkan token → serahkan offline → Guru memasukkan token → server memeriksa sekolah/expiry/status dan mengonsumsi secara atomik → fungsi Guru tersedia sesuai izin. Credential tidak ditampilkan pada audit/log atau daftar umum.

Reissue token belum dipakai **tidak membatalkan token lama**. Token lama mempertahankan expiry aslinya; token baru mempunyai expiry sendiri. Masing-masing tetap tunduk pada sekali pakai, pencabutan eksplisit dan eligibility sekolah. Perilaku service lama yang mencabut token sumber harus diubah sebelum target ini dinyatakan selesai.

### 11.3 Sekolah nonaktif

**ENGINEERING DECISION — ADM-DEC-035–040:** penonaktifan membatasi akses/benefit sekolah tanpa menghapus membership, histori, progres atau XP akun.

| Dampak | Aturan |
| --- | --- |
| Kelas | Baca saja; tidak ada join siswa baru, kelas baru, takeover atau feedback baru. |
| Membership | Tetap aktif dan dihitung pada batas lima kelas; status Mandiri/School tetap ditentukan oleh membership. |
| Siswa multisekolah | Hak sah melalui sekolah lain yang aktif tetap berlaku. |
| Guru | Data historis yang sah dengan informasi sekolah nonaktif; monitoring aktivitas baru dibatasi. |
| IRT terlambat | Hasil tetap dapat dibaca Guru berwenang bila attempt selesai sebelum penonaktifan. |
| Belajar pribadi | Tetap tersedia sesuai hak akun; selama demo seluruh fitur gratis. |
| Token/verifikasi baru | Sekolah nonaktif tidak eligible menurut guard existing. |

Tampilkan status dan dampak sebelum konfirmasi penonaktifan. Batas data lama menggunakan waktu efektif penonaktifan dan waktu selesai attempt; waktu rilis IRT bukan cutoff tunggal. Tidak membuka akses ke semua Guru hanya karena data berstatus historis. Rincian transisi berulang dan perubahan ownership yang belum tercakup tercatat ADM-DEP-06.

### 11.4 Reaktivasi

**ENGINEERING DECISION — ADM-DEC-045:** pengaktifan kembali otomatis memulihkan kelas/monitoring bagi membership dan ownership yang masih sah, tanpa review manual wajib. Tidak membuat kembali membership atau ownership yang telah berakhir. Histori periode nonaktif tetap dapat ditelusuri.

## 12. Pengguna, kelas dan bantuan operasional

**ENGINEERING DECISION — ADM-DEC-041–044:** Operations/Super mencari/filter daftar pengguna berisi nama, email, role Siswa/Guru, status akun, status verifikasi Guru serta sekolah/kelas.

Detail siswa menampilkan seluruh kelas/sekolah, status sekolah aktif/nonaktif, jumlah dari batas lima kelas, Mandiri/School, serta histori join/leave/ban/unban. Progres dan XP tetap milik akun. Membership saat ini dipisahkan dari histori periode sebelumnya.

Detail kelas menampilkan nama, sekolah, status, Guru aktif atau belum ada Guru, jumlah anggota, roster aktif/mantan dan waktu join/leave. Content hanya menerima struktur/agregat, tanpa roster atau identitas siswa/guru.

Untuk salah kelas, gagal join atau Guru kehilangan akses: cari pengguna/kelas → baca status serta histori → arahkan ke alur pengguna yang sah. Admin tidak mengoreksi membership/ownership, membuat takeover, atau melakukan ban/unban. Pencarian, pagination dan field tambahan yang sudah ada mengikuti baseline.

## 13. Dashboard

**ENGINEERING DECISION — ADM-DEC-046–050:** semua subrole Admin aktif masuk ke Dashboard setelah login. Assignment kosong/nonaktif tidak diarahkan ke modul berizin.

| Subrole | Agregat |
| --- | --- |
| Semua | Siswa/kelas dan pengerjaan Drill/Tryout |
| Operations | Ditambah sekolah, verifikasi Guru/token dan status jadwal/rilis batch |
| Content/Data/Moderation | Ditambah kesiapan konten, laporan dan proses IRT |
| Super | Gabungan sesuai izin |

Filter tanggal, sekolah, jenis asesmen serta perbandingan periode tersedia mengikuti definisi metrik existing dan perluasan yang dijelaskan pada spesifikasi teknis. Setiap angka menjelaskan unit dan waktu acuannya; hitungan akun berbeda dari membership, dan completion berbeda dari start. Filter tidak membuka data yang dilarang bagi subrole.

Dashboard refresh otomatis setiap lima menit dan melalui tombol Perbarui. Tampilkan waktu pembaruan; gagal/belum tersedia/stale dibedakan dari nol. Interval refresh bukan janji kesegaran pipeline. Tidak ada unduhan Dashboard atau pusat notifikasi khusus; proses bermasalah terlihat melalui Dashboard, daftar modul dan status proses.

## 14. Akun dan akses Admin

**ENGINEERING DECISION — ADM-DEC-051–055/060:** Super mengundang dengan nama, email dan satu subrole wajib → sistem memproses email → penerima membuka tautan dan membuat password → login email/password. Pemulihan password melalui email. Tidak ada pendaftaran Admin publik.

Daftar membedakan status akun, assignment, undangan dan pemrosesan pengiriman. Berhasil diproses bukan bukti email diterima atau undangan diterima pengguna. Super dapat membatalkan undangan belum diterima dan mengirim ulang sesuai status. Email yang sudah digunakan Siswa/Guru ditolak; gunakan email lain tanpa konversi akun belajar.

Perubahan subrole, nonaktif atau aktif kembali wajib konfirmasi, alasan dan histori. Server memeriksa status terbaru, termasuk saat token Auth belum berubah. Penonaktifan/demosi Super aktif terakhir ditolak termasuk pada permintaan bersamaan. Kontrol autentikasi existing tetap; tidak menambah kewajiban OTP/MFA atau batas perangkat/sesi baru.

Jika tidak ada Super dapat masuk, pemulihan melalui operator teknis di luar UI dengan alasan insiden dan audit. Penanggung jawab operator belum ditentukan (ADM-DEP-05). Login Google Siswa/Guru dan pengecualian akun Siswa terkelola yang sudah disetujui tetap mengikuti sumber identity existing.

## 15. Histori aktivitas dan eskalasi

**ENGINEERING DECISION — ADM-DEC-056–059:** histori mencakup pelaku, waktu, modul/objek, tindakan, perubahan sebelum/sesudah, alasan serta hasil berhasil/gagal sesuai data yang tersedia. Filter pelaku/modul/tanggal; Super seluruh domain sah, Operations domain operasional, Content domain konten/moderasi/IRT dengan redaksi identitas.

Histori diperiksa saat ada masalah. Tidak menambah jadwal audit rutin, unduhan histori atau modul tiket insiden. Telusuri kasus/histori → eskalasi lewat kanal tim existing ke teknis/Curriculum/Data sesuai masalah → catat penanganan sesuai kewenangan. Eskalasi tidak memberikan hak mutasi tambahan.

Password, credential, secret dan identitas yang dilarang tidak masuk payload histori. Kegagalan tidak dibuat seolah-olah mutasi berhasil. Penanganan insiden tidak menimpa hasil/XP historis. Retensi dan pencatatan teknis mengikuti baseline; tidak menambahkan penghapusan otomatis baru.

## 16. Acceptance criteria

ID dari draft dipertahankan agar tautan pekerjaan sebelumnya tetap dapat ditelusuri. Baris yang terkait konflik §17 diberi pembatas eksplisit. Kriteria berikut adalah target verifikasi, bukan laporan hasil pengujian.

| ID | Skenario | Hasil yang diharapkan | Sumber |
| --- | --- | --- | --- |
| ADM-AC-001 | Admin membuka modul Pretest. | Mengelola Pretest dari bab yang ditetapkan; tidak diminta membuat paket Pretest bebas. | ADM-DEC-001. |
| ADM-AC-002 | Admin menyimpan draft revisi Pretest kurang dari 20 soal. | Draft tersimpan; versi aktif lama tetap digunakan. Draft baru berlaku setelah lengkap/valid dan disimpan. | ADM-DEC-004/012. |
| ADM-AC-003 | Admin menyimpan Pretest tepat 20 soal dan valid. | Perubahan berlaku bagi start baru setelah semua gate sah terpenuhi; approval yang diperlukan tidak dilewati oleh tombol Simpan. | ADM-DEC-006. |
| ADM-AC-004 | Siswa sedang mengerjakan versi A ketika versi B berlaku. | Resume/submit siswa tetap menggunakan versi A; attempt baru yang eligible menggunakan versi efektif menurut konteksnya. | ADM-DEC-003. |
| ADM-AC-005 | Admin menambah soal dari nol. | Jalur manual tersedia untuk Pretest; Drill/Tryout menggunakan impor untuk input soal baru. | ADM-DEC-005. |
| ADM-AC-006 | Admin mengelola slot level Drill dengan beberapa varian. | Slot dapat menyimpan original/varian; distribusi runtime mengikuti target v2. Rotasi/pemerataan ADM-DEC-010 masih OPEN pada ADM-DEP-01. | ADM-DEC-007/010. |
| ADM-AC-007 | Admin menyusun Batch 1 untuk dua sekolah. | Master/batch terpisah dan mendukung beberapa paket. Contoh A-original/B-varian membutuhkan policy alokasi sah; daftar frozen dan satu attempt/siswa/batch mengikuti v2. | ADM-DEC-008. |
| ADM-AC-008 | Admin akan membuat varian. | Memilih 5 anchor Tryout/3 Drill sebelum proses; anchor yang sama dipertahankan pada original dan hasil terkait. Pretest tidak memakai anchor. | ADM-DEC-009. |
| ADM-AC-009 | Dua proses dari original sama memilih anchor berbeda. | Masing-masing menghasilkan satu varian dengan pilihan sendiri; proses berikutnya tidak menulis ulang pilihan sebelumnya. | ADM-DEC-009/013. |
| ADM-AC-010 | Admin memperbaiki soal hasil impor Drill/Tryout. | Edit manual diperbolehkan; soal baru tetap melalui impor. Versi attempt lama tidak ditimpa. | ADM-DEC-011. |
| ADM-AC-011 | Kandidat paket pada level sama mempunyai jumlah attempt selesai berbeda. | Kebutuhan pemerataan completion global dicatat; penerapan algoritmanya tertahan ADM-DEP-01 agar tidak melanggar assignment arm tetap v2. | ADM-DEC-010. |
| ADM-AC-012 | Kandidat mempunyai jumlah selesai global sama. | Kebutuhan prioritas original lalu creation order dicatat; penerapan sebagai pemecah seri tertahan ADM-DEP-01. | ADM-DEC-010/DRL-13. |
| ADM-AC-013 | Siswa retry dan masih ada paket eligible yang belum pernah ia selesaikan. | Kebutuhan retry preferensi belum pernah selesai dicatat; rotasi lintas arm tertahan ADM-DEP-01. Resume tetap paket pinned. | ADM-DEC-010/DRL-12. |
| ADM-AC-014 | Admin memilih anchor untuk varian Drill/Tryout. | Total tetap 10/30, terdiri dari 3+7 atau 5+25; anchor tidak menambah jumlah soal. | ADM-DEC-009/ANC-06. |
| ADM-AC-015 | Content/Super mengelola bab/subbab/indikator. | Input struktur manual berdasarkan sumber Curriculum. Penambahan bab otomatis menyediakan slot Pretest kosong yang belum dapat dikerjakan sampai 20 soal lengkap/valid. | ADM-DEC-014/CUR-06/07. |
| ADM-AC-016 | Content/Super menelusuri soal di katalog global. | Asal asesmen/paket/varian/versi dan jumlah/status laporan beserta tautan terlihat; informasi IRT sesuai artefak/versi sah atau unavailable. Rincian metrik mengikuti ADM-DEP-04. | ADM-DEC-015/QST-08–10. |
| ADM-AC-017 | Admin ingin memasukkan atau mengoreksi soal dari katalog global. | Katalog tetap baca saja; input/edit dilakukan di asesmen/slot/paket tujuan sesuai hak dan batas metode inputnya. | ADM-DEC-002/005/015. |
| ADM-AC-018 | Admin menyiapkan konten Pretest, Drill atau Tryout. | PG satu jawaban, PGK MCMA dan PGK Kategori didukung pada ketiga asesmen sesuai metode inputnya. Penilaian/aktivasi tetap memerlukan rubrik dan validasi yang sah; tidak ada kewajiban campuran jenis tertentu per paket dari jawaban ini. | ADM-DEC-016. |
| ADM-AC-019 | Admin mengedit soal dalam konteks asesmen. | Teks/LaTeX, pilihan/pernyataan, kunci, pembahasan, gambar soal/pembahasan serta pemetaan materi/kesulitan dapat diubah. Perubahan tidak menimpa versi attempt lama. | ADM-DEC-017/003. |
| ADM-AC-020 | Admin membuka preview. | Melihat soal, kunci dan pembahasan; tidak diminta simulasi pengerjaan dan tidak tercipta attempt/progres/XP siswa. | ADM-DEC-018. |
| ADM-AC-021 | Admin mengimpor JSON/Excel. | Satu file diarahkan ke satu paket/varian pada konteks tujuan, bukan beberapa paket/varian dalam satu file. | ADM-DEC-019. |
| ADM-AC-022 | Sebagian baris impor gagal validasi. | Progres dapat disimpan; baris diperbaiki di Admin lalu proses dilanjutkan. Baris salah tidak otomatis dilewati dan paket tidak menjadi aktif hanya karena progres tersimpan. | ADM-DEC-020. |
| ADM-AC-023 | Beberapa laporan mengacu soal dan versi yang sama. | Admin menangani satu kasus dengan daftar laporan terkait; record/jumlah laporan asli tetap dapat ditelusuri. Versi berbeda tidak otomatis digabung. | ADM-DEC-021. |
| ADM-AC-024 | Content/Super mulai menangani kasus. | Dapat menangani langsung tanpa assignment/claim wajib. Pelaku tindakan tetap dicatat dan Operations tidak mendapat hak moderasi baru. | ADM-DEC-022; matriks izin existing. |
| ADM-AC-025 | Kasus Ditinjau akan ditutup menjadi Selesai/Ditolak. | Wajib ada alasan penutupan dan tautan revisi jika ada perbaikan konten; alur dimulai dari Baru → Ditinjau. | ADM-DEC-023. |
| ADM-AC-026 | Soal dalam paket aktif terbukti salah dan sedang diperbaiki. | Laporan tidak otomatis menahan paket. Permintaan keep-available ADM-DEC-024 tetap dicatat; kasus invalid/DRIFT mengikuti gate v2 dan membutuhkan rekonsiliasi ADM-DEP-02. Sesi/histori tetap pinned. | ADM-DEC-024/003/006. |
| ADM-AC-027 | Siswa mengirim laporan soal/video, lalu Admin menyelesaikan kasusnya. | Siswa menerima konfirmasi terkirim; tidak diperlukan notifikasi hasil penyelesaian atau dashboard tiket baru dari alur ini. | ADM-DEC-025; PRD §10.2. |
| ADM-AC-028 | Content/Super mengisi daftar video. | Input manual tersedia dalam konteks pengelolaan video; impor file video tidak menjadi kebutuhan. Hak Operations tidak diperluas. | ADM-DEC-026; matriks izin existing. |
| ADM-AC-029 | Subbab sudah memiliki tiga video aktif dan Admin akan mengaktifkan video lain. | Aktivasi ditolak bila akan melampaui tiga aktif, termasuk race/ganti video. Urutan rekomendasi otomatis menurut penambahan. | ADM-DEC-027. |
| ADM-AC-030 | Admin memetakan video. | Satu video terkait satu subbab; identitas YouTube/URL dinormalisasi melalui penjabaran teknis, tanpa memperluas penggunaan lintas subbab. | ADM-DEC-028. |
| ADM-AC-031 | Siswa melaporkan video yang masih aktif. | Video tetap tampil sampai diperiksa; laporan tidak memicu penyembunyian otomatis. Admin yang berhak dapat menonaktifkan setelah pemeriksaan. | ADM-DEC-029. |
| ADM-AC-032 | Admin memeriksa ketersediaan video. | Cukup alur pemeriksaan manual dan laporan siswa; pemeriksaan otomatis berkala tidak menjadi syarat scope ini. | ADM-DEC-030. |
| ADM-AC-033 | Operations/Super memasukkan sekolah. | Jalur input manual tersedia; impor sekolah tidak menjadi kebutuhan. Content tetap hanya tampilan terbatas. | ADM-DEC-031; matriks izin existing. |
| ADM-AC-034 | Admin membuat sekolah dengan/ tanpa alamat. | Nama dan kode internal wajib; alamat opsional. Kode mengikuti keunikan/normalisasi existing, tanpa field NPSN/wilayah/PIC baru. | ADM-DEC-032, mandat SCH-01. |
| ADM-AC-035 | Admin perlu token untuk beberapa Guru pada sekolah sama. | Bulk token tersedia untuk penyerahan offline; tiap token sekali pakai/72 jam. Retry operasi tidak menerbitkan token tambahan tersembunyi. | ADM-DEC-033; PRD §5.1. |
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
| ADM-AC-050 | Admin memfilter Dashboard dan membandingkan periode. | Filter tanggal/sekolah/asesmen dan comparison tersedia sesuai izin/sumber. Stock, flow, timestamp dan atribusi tidak dicampur; data historis tidak tersedia diberi alasan sesuai spesifikasi teknis §11. | ADM-DEC-048. |
| ADM-AC-051 | Dashboard terbuka dan data diperbarui. | Refresh otomatis lima menit dan tombol Perbarui tersedia; waktu pembaruan serta keadaan gagal/unavailable jelas dan tidak diganti angka nol. | ADM-DEC-049. |
| ADM-AC-052 | Admin ingin mengunduh Dashboard. | Unduhan Dashboard tidak menjadi kebutuhan scope ini. Tidak otomatis menetapkan keputusan ekspor modul lain. | ADM-DEC-050. |
| ADM-AC-053 | Penerima undangan Admin menyiapkan akses atau lupa password. | Tautan email membuat/memulihkan password Admin dan login email/password sesuai status sah. Metode login akun belajar tetap mengikuti sumber identity yang disetujui. | ADM-DEC-051. |
| ADM-AC-054 | Super mengundang Admin dan melihat daftar akun. | Nama/email/satu subrole wajib; subrole, status undangan/akun dan hasil pemrosesan pengiriman terlihat. Pengiriman diproses tidak ditampilkan sebagai bukti delivery/acceptance. | ADM-DEC-052. |
| ADM-AC-055 | Super mengelola undangan belum diterima atau mengundang email akun produk. | Batal/kirim ulang/pemulihan tersedia sesuai status. Email Siswa/Guru ditolak dengan arahan email lain, tanpa konversi akun belajar. | ADM-DEC-053. |
| ADM-AC-056 | Super mengubah subrole atau nonaktif/aktif akun Admin. | Wajib konfirmasi/alasan/histori; hak mengikuti status terbaru. Penonaktifan/demosi Super aktif terakhir ditolak termasuk pada perubahan bersamaan. | ADM-DEC-054; baseline runbook. |
| ADM-AC-057 | Tidak ada Super dapat masuk dan perlu pemulihan darurat. | Alur melalui operator teknis luar halaman Admin dengan alasan insiden dan audit. Penunjukan pihak berwenang tetap dependency OPEN sebelum prosedur operasional lengkap. | ADM-DEC-055. |
| ADM-AC-058 | Admin berwenang menelusuri histori aktivitas. | Pelaku/waktu/modul/objek/tindakan, sebelum/sesudah, alasan dan hasil tersedia sesuai data/izin; filter pelaku/modul/tanggal. Rahasia dan identitas terlarang disaring. | ADM-DEC-056. |
| ADM-AC-059 | Ada masalah yang memerlukan pemeriksaan histori. | Histori dapat ditinjau sesuai kebutuhan/insiden; jadwal rutin tidak menjadi syarat scope ini. | ADM-DEC-057. |
| ADM-AC-060 | Admin ingin mengunduh histori aktivitas. | Unduhan histori belum diperlukan; pembacaan/filter histori tetap tersedia sesuai izin. | ADM-DEC-058. |
| ADM-AC-061 | Admin menemukan salah publikasi, akses tidak sah atau hasil tertahan. | Telusuri histori dan eskalasikan melalui kanal tim existing ke pihak sesuai domain; penanganan tercatat. Tidak perlu modul tiket insiden baru atau hak mutasi tambahan. | ADM-DEC-059. |
| ADM-AC-062 | Admin login atau melakukan aksi sesuai perannya. | Autentikasi/kontrol akses existing tetap berlaku; OTP/MFA dan batas perangkat/sesi tambahan tidak menjadi syarat scope ini. Proteksi existing dipertahankan. | ADM-DEC-060. |
| ADM-AC-063 | Content/Super menambah subbab. | Lima slot Drill Level 1–5 kosong tersedia otomatis; tidak dapat dikerjakan sebelum paket lengkap/memenuhi syarat dan tidak menerbitkan soal otomatis. | ADM-DEC-061. |
| ADM-AC-064 | Content/Super melihat master materi. | Ringkasan kesiapan Pretest dan jumlah soal/paket setiap level Drill, alasan belum siap serta tautan pengaturan tersedia; kelengkapan tidak dinyatakan sebagai approval akademik. | ADM-DEC-062. |
| ADM-AC-065 | Admin mengedit progres impor/draft lalu menekan Simpan. | Autosave menyimpan progres tanpa memberlakukan revisi. Simpan eksplisit memberlakukan revisi hanya jika lengkap/valid dan memenuhi aturan konteks; kedua status terlihat berbeda. | ADM-DEC-063/006. |
| ADM-AC-066 | Admin mengimpor file ke konteks yang sudah memiliki soal. | Dapat memilih Tambahkan/Ganti isi dan melihat preview dampak pada revisi; batas jumlah/validasi tetap dijaga. Versi aktif dan attempt historis tidak langsung ditimpa. | ADM-DEC-064. |
| ADM-AC-067 | Admin A menyimpan perubahan sementara Admin B masih mengedit versi dasar sebelumnya. | Simpan B mendeteksi konflik, memberi informasi dan mempertahankan edit belum tersimpan dalam kewenangannya; B diminta memuat versi terbaru sebelum melanjutkan, tanpa overwrite diam-diam. | ADM-DEC-065. |
| ADM-AC-068 | Content/Super menambahkan video. | Judul/URL YouTube/subbab memakai field/validator existing; atribut opsional tidak memaksa kolom schema baru. | ADM-DEC-066/076. |
| ADM-AC-069 | Video ditambahkan dan kemudian judul/URL diperbarui. | Rekomendasi mengikuti urutan video ditambahkan; edit tidak menjadi aksi reorder manual. | ADM-DEC-067. |
| ADM-AC-070 | Laporan baru mengacu soal/versi dengan kasus Selesai/Ditolak. | Kasus lama kembali Baru; daftar laporan dan histori penutupan sebelumnya tetap, termasuk pada concurrency. | ADM-DEC-068. |
| ADM-AC-071 | Admin mengunggah/mengganti gambar. | PNG/JPG/WebP didukung dengan preview/alt text dan batas existing 5 MiB; hanya VERIFIED dapat dipakai; media versi lama tetap. | ADM-DEC-069. |
| ADM-AC-072 | Impor memuat dugaan duplikat konten pada revisi tujuan. | Peringatan/penanda baris dan keputusan Admin sebelum apply; tidak auto-merge lintas paket. Constraint identitas tetap tidak dapat dipintas. | ADM-DEC-070. |
| ADM-AC-073 | Content/Super mengisi metadata bab/subbab/indikator. | Gunakan atribut/relasi/validator existing dan sumber Curriculum; sumber belum lengkap tetap draft; tidak mewajibkan field name/order baru pada competency. | ADM-DEC-071/076. |
| ADM-AC-074 | Master masih direferensikan paket aktif dan dicoba diarsip. | Arsip ditolak dengan dependency yang relevan; setelah dependency aktif selesai, histori tetap dipertahankan. | ADM-DEC-072. |
| ADM-AC-075 | Admin kembali dari detail atau membuka ulang pekerjaan belum selesai. | Search/filter/halaman daftar pulih; draft terakhir yang sukses autosave dapat dilanjutkan sesuai izin, tanpa mengklaim edit gagal tersimpan. | ADM-DEC-073. |
| ADM-AC-076 | Admin membuka fungsi dari ponsel. | Seluruh fungsi tetap dapat digunakan sesuai izin, mengikuti pola responsif/aksesibilitas existing. | ADM-DEC-074. |
| ADM-AC-077 | Admin memantau tugas impor/laporan/hasil. | Status proses, daftar modul dan Dashboard cukup; tidak ada kebutuhan notification center baru. Email akun tetap. | ADM-DEC-075. |
| ADM-AC-078 | Tim memerlukan keputusan atribut/validasi rutin untuk implementasi. | Acuan adalah kontrak/implementasi existing dan spesifikasi teknis; tidak membuka putaran pertanyaan atribut kepada pemilik. | ADM-DEC-076. |
| ADM-AC-079 | Varian Drill dihentikan dan penggantinya belum siap. | Fallback original aktif mencatat assigned arm terpisah dari delivered package/reason; sesi pinned; start setelah pengganti siap kembali ke arm asal. Siswa lama/retry bukan fresh. | Amendemen v2; PRD §5; pembatas ADM-DEP-01. |
| ADM-AC-080 | Siswa mengganti kelas/paket dalam batch yang sama atau master direvisi setelah freeze. | Tetap maksimal satu attempt/siswa/batch dan daftar versi paket frozen; revisi master tidak mengganti pin batch/sesi. | Amendemen v2; PRD §6. |
| ADM-AC-081 | Batch ditutup dan arm memiliki readiness IRT berbeda. | Nilai dan pembahasan serentak per batch ≤72 jam, mode IRT/fallback per arm, maksimum valid nol UNSCORABLE, tanpa ranking/percentile dan tanpa menimpa hasil final/XP. | Amendemen v2; kontrak kalibrasi v1; ADM-DEP-04. |

## 17. Ketergantungan substantif dan rekonsiliasi

Daftar ini menggantikan daftar pertanyaan rutin sebagai catatan pekerjaan tersisa. Atribut, pagination, pesan dan detail teknis yang sudah mempunyai baseline tidak ditahan untuk klarifikasi pemilik.

| ID | Status dan lingkup | Yang sudah pasti | Sisa dan batas implementasi |
| --- | --- | --- | --- |
| ADM-DEP-01 | OPEN — distribusi Drill | Slot, jumlah soal, histori pinned; v2 memakai arm persisten | ADM-DEC-010 meminta pemerataan completion/preferensi retry/default original; rekonsiliasi dengan v2 sebelum perubahan distribusi lintas arm. |
| ADM-DEP-02 | OPEN — konten terbukti bermasalah | Laporan masuk tidak otomatis menahan; sesi/histori tetap pinned | Rekonsiliasi keep-available ADM-DEC-024 dengan penghentian distribusi invalid/DRIFT v2. Jangan melewati gate v2. |
| ADM-DEP-03 | OPEN — dokumen varian/batch lanjutan | Satu varian/proses, anchor 3/5; multipaket dan satu attempt/batch; freeze sebelum mulai | Jalur generator/impor, precedence kelas/sekolah, multisekolah/Mandiri dan perubahan membership mengikuti dokumen lanjutan. |
| ADM-DEP-04 | OPEN — penyerahan akademik/ilmiah | Payload v1, arah rubrik/policy yang sudah disahkan, mapping paket acuan dan fallback per arm | Blueprint/review konten, review rubrik Drill, parameter numerik/linking/quality gate, producer dan integrasi/adopsi/rilis yang belum siap; informasi IRT katalog mengikuti Data/AI. Tidak mengarang angka. |
| ADM-DEP-05 | OPEN — pihak berwenang | Alur undangan/izin, gate existing, recovery operator | Nama penanggung jawab persetujuan final, akademik/Data dan operator darurat belum ditentukan; jangan menganggap pembuat otomatis pemeriksa. |
| ADM-DEP-06 | OPEN — histori sekolah lintas transisi | Kelas baca saja, membership tetap, hasil attempt selesai sebelum cutoff terbaca; reaktivasi otomatis bagi hak sah | Semantik akses ketika ownership berubah/attempt melewati cutoff/periode nonaktif berulang perlu keputusan domain; jangan memperluas akses historis secara spekulatif. |

Penundaan monetisasi dan handoff visual final bukan alasan menanyakan ulang atribut. Handoff visual mengikuti baseline desain yang sudah ada sampai sumber baru tersedia.

## 18. Navigasi, perangkat dan kegagalan

**ENGINEERING DECISION — ADM-DEC-073–075/076:** saat kembali dari detail, pertahankan pencarian/filter/halaman daftar. Pekerjaan yang belum selesai dapat dilanjutkan dari draft terakhir yang sukses tersimpan otomatis. Tampilkan waktu/status simpan dan jika masih ada perubahan yang belum tersimpan.

Laptop adalah perangkat utama; seluruh fungsi tetap dapat digunakan di ponsel sesuai izin. Ikuti komponen, navigasi keyboard, label, fokus, status loading/error/empty/access-denied dan pola responsif existing. Daftar lebar boleh memakai tampilan adaptif atau gulir tanpa menyembunyikan aksi penting.

Login kedaluwarsa atau akses dicabut menghentikan mutasi; minta autentikasi ulang lewat alur existing dan jangan membuka data milik role sebelumnya. Resume draft hanya sesudah izin terverifikasi. Error menampilkan tindakan pemulihan yang sesuai: perbaiki field, ulang unggah, coba lagi, muat revisi terbaru atau hubungi pihak berwenang. Status gagal/belum ada data tidak ditampilkan sebagai sukses atau nol.

Pemberitahuan tugas cukup melalui status proses, daftar modul dan Dashboard. Email undangan/pemulihan tetap sesuai alur akun. Tidak ditambahkan pusat notifikasi.

## 19. Handoff dan aturan atribut

Gunakan [Spesifikasi Teknis Admin](../architecture/ADMIN_TECHNICAL_SPEC.md) untuk pemetaan route/API, field existing, state, transaksi, persistensi, error, integrasi dan pekerjaan implementasi. Kode/kontrak yang belum memenuhi kebutuhan dicatat sebagai gap, bukan diubah dalam pekerjaan dokumentasi ini.

**ENGINEERING DECISION — ADM-DEC-076:** jawaban atribut generik CUR-02/VID-01 diterapkan melalui representasi existing. Indikator memakai `code` dan `description` di bawah subbab; tidak mewajibkan kolom `name`/`displayOrder` baru. Video memakai field existing; deskripsi opsional tidak memaksa perubahan schema. `source` dan `recommendationOrder` dapat diisi sistem agar input pengguna tetap sederhana dan urutan otomatis. Detail mekanismenya berlabel PROPOSED pada spesifikasi teknis.

Urutan implementasi: catat perubahan kebutuhan → kontrak dan migrasi yang diperlukan → layanan domain/otorisasi → UI → verifikasi terhadap acceptance. Bagian di luar dependency §17 dapat dikerjakan dari acuan ini tanpa meminta ulang atribut. Persetujuan dokumen, validitas akademik, kelengkapan implementasi dan penerimaan rilis adalah bukti yang berbeda.
