# Finalisasi Admin Numora — arsip discovery dan keputusan

Tanggal mulai: 9 November 2026. Pembaruan: 10 November 2026. Status: **arsip discovery; acuan kebutuhan telah dikonsolidasikan** dalam [PRD Admin](ADMIN_PRD.md) dan [Spesifikasi Teknis Admin](../architecture/ADMIN_TECHNICAL_SPEC.md). Catatan di bawah mempertahankan riwayat, bukan kuesioner aktif.

**ENGINEERING DECISION — instruksi terakhir pemilik, ADM-DEC-076:** “kalau tanya masalah atribut dan lain lain, gausah dipertanyakan lagi deh, pakai yang saat ini ada”. Seluruh detail rutin tanpa jawaban mengikuti baseline existing. Hanya dependency substantif pada PRD §17 yang tetap OPEN. Tidak ada pertanyaan atribut yang sedang menunggu jawaban.

Tujuan: mengumpulkan keputusan untuk PRD khusus Admin dan spesifikasi teknis yang dapat menjadi acuan implementasi. Cakupan meliputi tiga subrole, seluruh modul Admin yang sudah ada, alur lintas modul, kegagalan, dan penerimaan. Prioritas diskusi pengguna adalah **alur asesmen yang belum sesuai**.

Dokumen ini dibuat dari pembacaan dokumentasi dan sebagian kode pada working tree lokal yang sudah memiliki perubahan. Ini bukan hasil pengujian runtime, audit lengkap implementasi, atau bukti fitur siap digunakan. Keberadaan menu/API tidak membuktikan bahwa perilakunya sudah benar.

## 1. Cara menggunakan

- Gunakan [PRD Admin](ADMIN_PRD.md) sebagai acuan aktif. ID pertanyaan di sini dipertahankan untuk menelusuri asal keputusan.
- Jawaban boleh `tetap seperti baseline`, `belum ditentukan`, atau `perlu keputusan Curriculum/Data`. Diam/tidak menjawab bukan persetujuan.
- Untuk kebutuhan yang berubah, gunakan pola `saat ini → seharusnya → contoh`.
- Setiap keputusan perlu ruang lingkup: Pretest/Drill/Tryout, paket baru/attempt berjalan/histori, dan subrole yang berhak.
- **PRD RULE** menunjukkan aturan PRD yang tetap berlaku selama tidak digantikan keputusan pemilik yang tercatat. **ENGINEERING DECISION** menunjukkan keputusan teknis/operasional yang sudah tercatat. **PROPOSED** adalah rancangan yang belum disetujui. **OPEN** adalah pertanyaan atau ketergantungan yang belum selesai.
- Bagian pertanyaan §4–19 adalah arsip historis. Pernyataan lama “belum dirinci/perlu ditanyakan” tidak membuka ulang detail rutin setelah ADM-DEC-076. Usulan ilmiah/produk yang belum disetujui tetap bukan aturan; lihat register dependency PRD §17.
- Pertanyaan tentang penanganan insiden tidak memberi Admin izin baru untuk ban, memindahkan membership, mengganti pemilik kelas, mengubah formula, atau mengedit hasil historis.

## 2. Jawaban yang sudah diterima

| ID | Pertanyaan | Jawaban pengguna, 9–10 November 2026 | Makna yang boleh dicatat |
| --- | --- | --- | --- |
| F-01 | Bagian Admin yang paling salah/belum mengadopsi kebutuhan? | “alur assesmen masih belum sesuai” | Asesmen menjadi prioritas klarifikasi; rincian pertama diterima pada AS-01–AS-05. |
| F-02 | Pengguna tiga subrole, termasuk keterlibatan Curriculum/Data? | “sesuai dengan saat ini, ada 3” | Tiga subrole existing dipertahankan. Orang/tim per subrole dan cara keterlibatan Curriculum/Data belum disebutkan. |
| F-03 | Pemberi persetujuan kebutuhan Admin, akademik dan Data/AI? | “belum ditentukan” | Penanggung jawab persetujuan akhir tetap OPEN; tidak otomatis menjadi Super Admin atau pembuat paket. |
| AS-01 | Alur utama pembuatan asesmen? | Pretest sudah ditentukan per bab, satu tiap bab; awalnya mengatur Pretest bab, bukan menambah paket/bab; isi soal bisa diedit, ditambah dan dihapus dengan jumlah maksimal. | Modul Pretest membuka slot per bab yang sudah ditetapkan. Kapasitas dan pemberlakuan diklarifikasi pada PRE-07/AS-12. Ini belum menetapkan ulang hak pengelolaan bab pada modul master materi. |
| AS-02 | Cara memasukkan soal? | Impor JSON dan Excel; soal dibuat per paket untuk satu tujuan, satu paket tidak dipakai sekaligus untuk Tryout dan Drill. Pengguna mempertanyakan adanya bank soal umum. | JSON/Excel dibutuhkan dan tujuan paket tidak lintas jenis asesmen. AS-11 membedakan tambah manual khusus Pretest dengan input impor untuk Drill/Tryout. |
| AS-03 | Tujuan soal setelah impor? | “soal hanya bisa diinput melalui suatu fitur”, misalnya master paket Tryout atau Drill, “ga dari root bank soal secara general”. | Entry point input harus melalui konteks fitur/paket tujuan. Jalur bank soal umum bukan alur authoring yang diinginkan. Katalog teknis/repository internal bukan keputusan UI atau model data baru. |
| AS-04 | Pembuat boleh sekaligus menyetujui? | “Belum ditentukan” | Pemisahan pembuat/pemeriksa/pemberi persetujuan tetap OPEN. |
| AS-05 | Paket bagi attempt lama dan baru? | Attempt yang sudah dimulai mempertahankan paket lama sampai selesai; yang mulai setelah paket diubah memakai paket baru. | Versi dipilih saat attempt dimulai. AS-12 menetapkan Simpan lengkap/valid sebagai pemicu, dengan hubungan terhadap snapshot/jadwal batch Tryout masih perlu dirinci. Deadline dan batas kesempatan tidak otomatis berubah. |
| PRE-07 | Batas jumlah Pretest/draft? | “Ya, draft boleh kurang; aktif harus tepat 20”. | Pretest boleh menyimpan draft parsial; versi aktif harus tepat 20 dan valid. PRE-08 memastikan versi aktif lama tetap dipakai selama draft baru belum lengkap/valid. |
| AS-11 | Penambahan manual dari nol? | Khusus Pretest bisa; Drill dan Tryout yang mempunyai varian/perbedaan paket dibatasi hanya impor. | Tambah manual tersedia hanya untuk Pretest. AS-13 memperbolehkan edit hasil impor Drill/Tryout; jalur pembuatan varian/generator masih perlu dirinci. |
| AS-12 | Kapan perubahan berlaku? | “Langsung berlaku saat Simpan jika sudah lengkap dan valid”. | Tidak menambahkan tahap Terapkan/Terbitkan terpisah sebagai default untuk perubahan yang lengkap/valid. Definisi validasi, review dan hubungan dengan jadwal/snapshot batch Tryout belum seluruhnya selesai. |
| DRL-06 | Struktur Drill? | Soal diatur pada slot level yang tersedia, tetapi satu slot level bisa memiliki beberapa varian. | Bab → subbab → level tetap; tiap slot memiliki beberapa varian. DRL-07 selanjutnya mengarahkan pemilihan sistem menurut jumlah pengerjaan. |
| TRY-10 | Struktur Tryout? | Master data Tryout berisi paket original/varian dan terpisah dari batch yang mengatur jadwal serta paket rilis. Satu batch dapat memuat lebih dari satu paket dengan pembagian sekolah/kelas. Pengguna akan mengirim dokumen lanjutan. | Contoh: batch 1, sekolah A mendapat original A, sekolah B mendapat varian A. Pernyataan awal anchor setelah impor/generate dikoreksi ANC-02: dipilih sebelum proses pembuatan varian. |
| ANC-01 | Cakupan dan jumlah anchor? | Tryout 5, Drill 3, Pretest tidak memakai anchor karena tidak mempunyai varian untuk diukur keseimbangan skor IRTnya. | Cakupan/jumlah ditentukan; ANC-06 kemudian menegaskan anchor termasuk total 30/10. Alasan pemilik dicatat, metode ilmiah tetap milik Data. |
| ANC-02 | Hubungan anchor original/varian? | Anchor original dan variannya harus sama. Ralat: dipilih ketika hendak membuat varian, bukan saat awal membuat paket; bisa berbeda pada setiap proses pembuatan varian berikutnya. | Anchor terkait proses/pasangan, bukan penanda tetap global pada original. ANC-05 menetapkan satu hasil varian per proses. |
| DRL-07 | Siapa memilih varian siswa? | Sistem memilih paket yang masih sedikit dikerjakan; jika original sudah banyak dikerjakan, pengguna lain memperoleh paket/varian yang belum banyak dikerjakan. Urutan tidak pasti, tetapi di awal ada default. | DRL-08–12 menetapkan jumlah attempt selesai, seluruh siswa pada level, default original, prioritas tetap saat seri dan preferensi retry untuk paket yang belum pernah diselesaikan. Cakupan revisi/periode masih OPEN. |
| AS-13 | Edit setelah impor Drill/Tryout? | “Boleh edit soal hasil impor; hanya soal baru yang wajib impor”. | Teks, kunci dan pembahasan hasil impor dapat diedit pada konteks paket. Pin lama tetap dipertahankan; koreksi anchor yang sudah dipakai perlu aturan lanjut. |
| PRE-08 | Draft revisi tinggal 19 ketika versi 20 aktif? | “Versi aktif lama tetap dipakai; draft baru berlaku setelah lengkap dan valid”. | Draft parsial tidak menggantikan versi aktif. Saat Simpan lengkap/valid, revisi berlaku untuk attempt baru; attempt lama tetap pinned. |
| DRL-08 | Angka untuk pemerataan paket? | “Jumlah attempt yang sudah selesai”. | Bukan attempt mulai atau jumlah siswa unik. Status selesai dipetakan ke lifecycle domain; duplicate submit tidak boleh menambah hitungan. |
| DRL-09 | Default awal original atau pilihan Admin? | “Selalu paket original”. | Default awal original. Kondisi tie dan default di tengah lifecycle belum ditentukan oleh jawaban ini. |
| DRL-10 | Scope pemerataan paket? | “Semua siswa pada level tersebut”. | Perbandingan global di slot level yang sama, tidak dipecah per sekolah/kelas. Batas periode dan pengaruh revisi masih perlu dirinci. |
| ANC-04 | Generator Admin, impor eksternal atau keduanya? | “Akan dijelaskan dalam dokumen lanjutan”. | DEFERRED/OPEN — tunggu dokumen pengguna; tidak memilih jalur berdasarkan implementasi lama atau asumsi. |
| ANC-05 | Jumlah hasil per proses pembuatan varian? | “Satu varian per proses”. | Satu proses menghasilkan satu varian; tidak menetapkan dukungan beberapa hasil per proses. |
| DRL-11 | Pemilihan ketika jumlah attempt selesai sama? | “Gunakan urutan prioritas tetap”. | Pemecah seri menggunakan prioritas tetap. DRL-13 kemudian menentukan original → varian sesuai urutan dibuat. |
| DRL-12 | Prioritas paket saat retry? | “Utamakan yang belum pernah ia selesaikan; jika semua sudah, kembali ke pemerataan global”. | Pada retry, utamakan kandidat yang belum pernah diselesaikan siswa, lalu gunakan pemerataan global di antara kandidat itu. Jika semuanya sudah diselesaikan, gunakan seluruh kandidat yang eligible. Pernah mulai/melihat tidak sama dengan pernah selesai. |
| ANC-06 | Anchor bagian total atau tambahan? | “Ya, anchor bagian dari total 10/30 soal”. | Drill tetap 10 soal: 3 anchor + 7 lainnya. Tryout tetap 30 soal: 5 anchor + 25 lainnya. Berlaku pada relasi pembuatan varian; original tidak wajib memilih anchor saat pertama dibuat. |
| CUR-01 | Master bab/subbab/indikator hanya dilihat atau boleh dikelola? | “Content/Super boleh mengelola berdasarkan sumber Curriculum”. | Content/Super boleh mengelola struktur tersebut sesuai sumber Curriculum. CUR-06/07 kemudian menentukan input manual dan slot Pretest otomatis; bukti akademik serta revisi/arsip masih OPEN. |
| QST-08 | Perlu katalog semua soal baca saja? | “tetap perlu katalog global. namun tetap ada informasi dia dari jenis try out atau drill lalu varian apa, skor irtnya, lalu ada laporan masalah atau tidak”. | Katalog global dibutuhkan untuk penelusuran dengan asal jenis asesmen/paket/varian, informasi IRT dan keberadaan laporan masalah. Input tetap dari konteks asesmen. QST-09/10 menentukan penundaan detail IRT serta jumlah/status/tautan laporan; cakupan Pretest belum dipastikan. |
| DRL-13 | Urutan prioritas tetap saat seri? | “Original → varian sesuai urutan dibuat”. | Setelah filter retry dan perbandingan jumlah selesai global, seri dipecahkan dengan original lebih dahulu, lalu varian menurut urutan dibuat. Tidak menetapkan pengaturan prioritas bebas oleh Admin. |
| QST-09 | Arti dan field “skor IRT” di katalog? | “mengikuti dokumen data/ai nanti”. | DEFERRED/OPEN — ikuti dokumen Data/AI; belum menetapkan metrik, parameter, formula atau keadaan validitasnya. |
| QST-10 | Rincian laporan pada katalog? | “Jumlah/status + tautan ke detail laporan”. | Katalog menampilkan jumlah/status dan tautan ke detail laporan, bukan hanya boolean ada/tidak. Definisi hitungan dan cakupan versi laporan belum dirinci. |
| CUR-06 | Cara input master bab/subbab/indikator? | “Manual saja”. | Master struktur dimasukkan manual oleh Content/Super berdasarkan sumber Curriculum. Tidak mengubah kebutuhan impor JSON/Excel untuk soal. |
| CUR-07 | Penyediaan Pretest saat bab baru dibuat? | “Ya, slot Pretest otomatis tersedia”. | Penambahan bab melalui master otomatis menyediakan slot Pretest kosong, belum dapat dikerjakan siswa sampai tepat 20 soal lengkap/valid disimpan. Kapan bab/struktur ditampilkan ke siswa masih perlu dirinci. |
| AS-14 | Jenis soal untuk Pretest, Drill dan Tryout? | “semua”. | Ketiganya harus mendukung PG satu jawaban, PG kompleks beberapa jawaban benar (MCMA), serta kategori seperti Benar/Salah per pernyataan. Tidak menetapkan komposisi wajib setiap paket atau rubrik penilaian. |
| QST-02 | Cakupan bagian yang dapat diubah di editor? | “semua”. | Semua bagian yang ditanyakan dapat diedit: teks, rumus/LaTeX, pilihan/pernyataan, kunci, pembahasan, gambar soal/pembahasan serta pemetaan materi dan kesulitan. Input baru manual tetap khusus Pretest; perubahan versi tidak menimpa histori. |
| QST-07 | Preview statis atau simulasi pengerjaan? | “Lihat tampilan soal, kunci, dan pembahasan saja”. | Preview menampilkan soal, kunci dan pembahasan; simulasi pengerjaan/scoring tidak dibutuhkan untuk scope ini. Preview tidak menjadi attempt siswa. |
| IMP-02 | Satu atau beberapa paket/varian per file? | “Satu file untuk satu paket/varian”. | Satu file JSON/Excel mengisi satu paket/varian di konteks tujuan; tidak meminta pemilahan beberapa paket/varian dari satu file. Penerapan pada revisi/impor tambahan masih perlu dirinci. |
| IMP-03 | Penanganan sebagian soal impor bermasalah? | “Simpan progres impor, perbaiki baris bermasalah di Admin, lalu lanjutkan”. | Progres intake dipertahankan dan baris dapat diperbaiki di Admin sebelum dilanjutkan. Bukan otomatis melewati baris salah atau mengaktifkan paket belum lengkap/valid. Cara/waktu penyimpanan dan recovery masih OPEN. |
| RPT-01 | Laporan beberapa siswa untuk soal/versi sama? | “Gabungkan menjadi satu kasus dengan daftar laporan terkait”. | Admin menangani satu kasus, dengan record laporan terkait dan jumlah laporan asli tetap dapat ditelusuri. Tidak menggabungkan versi berbeda atau menetapkan aturan penggabungan video. |
| RPT-02 | Penanggung jawab kasus? | “Tanpa assignment; Content/Super boleh menangani”. | Tidak ada assignment/claim penanggung jawab sebagai prasyarat; Content/Super dapat menangani. Pelaku setiap tindakan tetap dicatat. Tidak memperluas hak Operations atau membuka identitas pelapor ke Content. |
| RPT-04 | Alur Baru → Ditinjau → Selesai/Ditolak, alasan dan revisi? | “Sesuai dengan alur tersebut”. | Alur tersebut disepakati, dengan alasan wajib saat menutup dan tautan revisi jika ada perbaikan konten. Buka kembali, laporan baru setelah penutupan dan propagasi status laporan terkait belum dirinci. |
| QST-05 | Menahan paket bermasalah bagi attempt baru? | “Tidak; paket tetap tersedia selama diperbaiki”. | Paket tetap tersedia selama perbaikan untuk Pretest/Drill/Tryout; tidak menambahkan aksi tahan penggunaan baru untuk kasus ini. Attempt berjalan tetap versi lama; revisi lengkap/valid mengikuti aturan Simpan dan batch yang relevan. Bukan izin menimpa hasil historis. |
| RPT-05 | Konfirmasi terkirim atau notifikasi penyelesaian? | “Cukup konfirmasi laporan terkirim”. | Tidak menambahkan pemberitahuan hasil penyelesaian kepada siswa pada scope ini. Selaras PRD v0.6 §10.2; tidak menyiratkan dashboard tiket siswa. |
| VID-05 | Metode input daftar video? | “Input manual saja”. | Content/Super mengisi video manual; impor file video tidak dibutuhkan. Berbeda dari impor soal JSON/Excel. |
| VID-02 | Memilih tiga video dari banyak video aktif? | “Maksimal tiga video aktif per subbab”. | Batas berlaku pada jumlah video aktif per subbab; tidak memerlukan pool lebih dari tiga video aktif untuk rotasi/pemilihan. Urutan tampil di antara maksimal tiga video belum ditentukan. |
| VID-06 | Pemakaian satu video pada beberapa subbab? | “Satu video hanya untuk satu subbab”. | Satu video terkait tepat satu subbab; tidak mendukung pemakaian lintas subbab dengan urutan berbeda. Identitas/normalisasi URL dan koreksi pemetaan perlu dirinci. |
| VID-03 | Video dilaporkan tetap tampil atau disembunyikan otomatis? | “Tetap tampil sampai diperiksa; Admin boleh menonaktifkan”. | Laporan tidak otomatis menyembunyikan video. Content/Super memeriksa, lalu boleh menonaktifkan; koreksi tautan/penggantian berada di alur pengelolaan konten. |
| VID-04 | Pemeriksaan otomatis berkala atau manual/laporan? | “Cukup pengecekan manual dan laporan siswa”. | Tidak membutuhkan pemeriksaan otomatis berkala pada scope ini. Status laporan bukan bukti hasil pemeriksaan ketersediaan otomatis. |
| SCH-07 | Metode input sekolah? | “Manual saja”. | Operations/Super memasukkan sekolah manual; impor sekolah tidak dibutuhkan. |
| SCH-01 | Field sekolah dan wajib/opsional? | “itu aja, atur deh dilogikakan mana yang wajib dan opsional”. | Field cukup nama, kode internal dan alamat; pemilik mendelegasikan penentuan kewajiban. Keputusan dalam mandat itu: nama dan kode internal wajib, alamat opsional, mengikuti kontrak existing. Tidak menambah NPSN/wilayah/PIC. |
| SCH-03 | Penerbitan dan penyerahan token guru? | “bisa beberapa sekaligus”; guru boleh terdaftar tanpa token tetapi belum bisa mengakses fitur, hanya informasi status pending dan input token; “token dishare offline”. | Penerbitan mendukung beberapa token sekaligus untuk sekolah. Penyerahan offline/manual; guru memasukkan token sendiri. Tanpa verifikasi, akun Guru tetap terdaftar dengan halaman pending/input token, belum mendapat fungsi Guru. |
| SCH-04 | Token lama saat reissue token belum dipakai? | “Token lama tetap berlaku sampai kedaluwarsa”. | Reissue tidak otomatis membatalkan token lama. Masing-masing tetap single-use dan punya expiry; token yang dipakai atau dicabut eksplisit tidak menjadi valid lagi. Batas baru sekolah nonaktif perlu dirinci. |
| SCH-02 | Dampak sekolah nonaktif pada akses existing? | Siswa tidak lagi mendapat benefit anggota sekolah, misalnya Tryout gratis; guru “mungkin hanya bisa cek data lama”, data berhenti realtime, data sebelum berhenti masih dapat diakses dengan status/informasi sekolah nonaktif. | Arah awal dilengkapi SCH-08–12 pada 10 November: fase demo gratis untuk semua; benefit sekolah lain tetap ada; membership aktif/dihitung; kelas baca saja; hasil terlambat boleh bagi attempt selesai sebelum penonaktifan. Kebijakan harga/benefit setelah demo tetap ditunda. |
| SCH-08 | Benefit Tryout dan Mandiri? | 10 November: “untuk fase demo sekitar satu bulan kedepan itu, semua fitur dapat diakses gratis oleh semua user, so jangan terlalu memusingkan itu terlebih dahulu”. | Selama fase demo sekitar satu bulan ke depan, seluruh fitur gratis bagi pengguna sesuai role/kewenangannya. Monetisasi/daftar benefit setelah demo ditunda; tidak menetapkan tanggal akhir pasti, pembayaran otomatis atau bypass verifikasi/izin. |
| SCH-09 | Benefit melalui sekolah B aktif ketika A nonaktif? | 10 November: “Ya, benefit melalui sekolah B tetap berlaku”. | Penonaktifan A tidak mencabut benefit yang sah melalui B. Prioritas assignment paket batch tetap belum ditentukan oleh jawaban ini. |
| SCH-10 | Membership dan batas lima kelas saat sekolah nonaktif? | 10 November: “Tetap aktif dan dihitung; hanya benefit/akses sekolah dibatasi”. | Membership kelas sekolah nonaktif tetap aktif dan dihitung dalam batas lima kelas. Tidak ditangguhkan/dihapus atau otomatis memindahkan siswa menjadi Mandiri; status sekolah dan akses dibedakan dari membership. |
| SCH-11 | Kelas sekolah nonaktif menjadi baca saja? | 10 November: “Ya, baca saja dengan batas tersebut”. | Tidak menerima siswa baru, membuat kelas baru, takeover atau feedback baru pada sekolah nonaktif. Guru melihat data historis dengan penanda nonaktif; akses tetap terbatas kewenangan yang sah. |
| SCH-12 | Hasil IRT rilis setelah sekolah nonaktif? | 10 November: “Ya, jika attempt selesai sebelum penonaktifan”. | Guru masih boleh melihat hasil IRT yang dirilis belakangan untuk attempt selesai sebelum sekolah dinonaktifkan, sesuai kewenangan historisnya. Bukan pembekuan mutlak semua field pada saat nonaktif atau izin melihat aktivitas baru setelahnya. |
| PEO-01 | Data daftar pengguna Operations/Super cukup? | 10 November: “Cukup dengan data tersebut”. | Nama, email, role Siswa/Guru, status akun, verifikasi Guru dan sekolah/kelas, dengan pencarian/filter pada data tersebut. Tidak menambahkan identitas individu ke akses Content. |
| PEO-02 | Informasi detail siswa? | 10 November: “Ya, tampilkan semua informasi tersebut”. | Semua kelas/sekolah, penanda sekolah aktif/nonaktif, hitungan batas lima, status Mandiri/School dan riwayat join/leave/ban/unban. Progres/XP tetap milik akun. |
| PEO-03 | Informasi detail kelas? | 10 November: “Ya, detail kelas mencakup informasi tersebut”. | Operations/Super melihat nama/sekolah/status kelas, Guru aktif atau belum ada, jumlah anggota, roster aktif/mantan serta waktu join/leave. Content hanya struktur/agregat tanpa identitas siswa. |
| PEO-04 | Admin perlu aksi koreksi membership/akses? | 10 November: “Cukup membaca data/histori dan mengarahkan pengguna”. | Dukungan baca saja dan pengarahan ke alur sah; tidak memerlukan mutasi membership, takeover atau ban/unban oleh Admin dari kebutuhan ini. |
| SCH-13 | Pemulihan akses saat sekolah aktif kembali? | 10 November: “Otomatis pulih untuk keanggotaan/kepemilikan yang masih sah”. | Akses kelas/monitoring pulih otomatis berdasarkan membership/ownership yang masih sah, tanpa peninjauan manual wajib. Tidak menghidupkan kembali hak yang sudah berakhir. |
| DASH-01 | Halaman awal setiap subrole? | 10 November: “Semua ke Dashboard sesuai lingkup subrole”. | Super, Operations dan Content aktif masuk ke Dashboard dengan data sesuai izin. Menggantikan tujuan awal lama Operations ke Sekolah/Content ke konten; assignment tidak sah tetap tanpa akses. |
| DASH-02 | Cakupan metrik per subrole? | 10 November: “itu aja dulu”. | Cukup usulan yang ditanyakan: semua agregat siswa/kelas dan pengerjaan Drill/Tryout; Operations ditambah sekolah, verifikasi Guru/token, jadwal/rilis batch; Content ditambah kesiapan konten, laporan dan proses IRT; Super gabungan. Definisi hitungan rinci belum ditetapkan. |
| DASH-03 | Filter dan perbandingan Dashboard? | 10 November: “Filter tersebut ditambah perbandingan periode”. | Filter tanggal, sekolah dan jenis asesmen serta perbandingan periode dibutuhkan. Definisi periode pembanding, event waktu dan penerapan filter per metrik belum ditetapkan. |
| DASH-04 | Pembaruan Dashboard? | 10 November: “Otomatis setiap lima menit serta tombol Perbarui”. | Refresh otomatis lima menit dan manual; tampilkan waktu pembaruan serta bedakan data belum tersedia/gagal dari angka nol. Bukan persetujuan SLA kesegaran sumber atau polling saat pengguna sudah keluar. |
| DASH-05 | Unduhan Dashboard? | 10 November: “Belum perlu unduhan Dashboard”. | Ekspor Dashboard tidak diperlukan dalam scope final saat ini. Tidak sekaligus meniadakan atau menyetujui ekspor modul lain/audit. |
| ACC-01 | Alur undangan dan login Admin? | 10 November: “Sesuai dengan alur tersebut”. | Super undang email → penerima membuat password melalui tautan → Admin login email/password dan lupa password via email. Siswa/Guru tetap Google. |
| ACC-02 | Field undangan dan status daftar akun? | 10 November: “Cukup dengan field dan informasi tersebut”. | Nama, email dan satu dari tiga subrole wajib. Daftar memuat subrole, status undangan/akun serta hasil pemrosesan pengiriman; sukses diproses tidak membuktikan delivery/acceptance. |
| ACC-03 | Batal/kirim ulang dan konflik email akun produk? | 10 November: “Sesuai: bisa batal/kirim ulang; email Siswa/Guru ditolak”. | Super dapat membatalkan undangan belum diterima dan mengirim ulang/pemulihan; email akun Siswa/Guru ditolak dengan arahan memakai email lain, tanpa konversi akun belajar. |
| ACC-04 | Perubahan subrole/nonaktif/aktif akun Admin? | 10 November: “Sesuai dengan aturan tersebut”. | Super melakukan dengan konfirmasi, alasan wajib dan histori; akses mengikuti status terbaru. Super aktif terakhir tidak boleh dinonaktifkan/diturunkan perannya. |
| ACC-06 | Pemulihan darurat saat tidak ada Super bisa masuk? | 10 November: “Gunakan prosedur operator teknis; penanggung jawab belum ditentukan”. | Prosedur operator di luar halaman Admin dengan alasan insiden dan audit diterima; orang/tim berwenang belum ditentukan. Tidak membuka endpoint pemulihan publik. |
| AUD-01 | Kolom/filter histori aktivitas? | 10 November: menyetujui rekomendasi: “sesuai semua deh … selain itu sesuai rekomenasi kamu”. | Pelaku, waktu, modul/objek, tindakan, sebelum/sesudah, alasan dan berhasil/gagal; filter pelaku/modul/tanggal. Super seluruh lingkup, Operations/Content domain masing-masing; rahasia dan identitas terlarang tetap disaring. |
| AUD-02 | Kapan histori diperiksa? | 10 November: menyetujui rekomendasi pemeriksaan saat ada masalah. | Pemeriksaan sesuai kebutuhan/insiden; belum perlu jadwal rutin. Tidak menunjuk orang/tim baru atau SLA. |
| AUD-03 | Unduhan histori aktivitas? | 10 November: “yg unduhan history jangan dulu”. | Unduhan histori aktivitas belum diperlukan untuk scope saat ini; histori tetap dapat dibaca sesuai izin di Admin. |
| AUD-04 | Eskalasi insiden? | 10 November: menyetujui rekomendasi alur melalui kanal tim. | Admin menelusuri masalah/histori → teruskan melalui kanal tim existing kepada teknis/Curriculum/Data sesuai kasus → penanganan dicatat sesuai kewenangan; tanpa modul tiket insiden baru. |
| ACC-05 | Autentikasi/perangkat/sesi tambahan? | 10 November: menyetujui rekomendasi cukup autentikasi dan kontrol akses existing. | OTP/MFA atau pembatasan perangkat/sesi tambahan belum diperlukan untuk versi ini. Kontrol login/otorisasi, expiry dan proteksi existing tetap berlaku. |
| CUR-08 | Slot Drill untuk subbab baru? | 10 November: “Ya, otomatis tersedia lima slot kosong (Rekomendasi)”. | Penambahan subbab menyediakan Level 1–5 kosong secara otomatis. Belum bisa dikerjakan sebelum paket lengkap dan memenuhi syarat; bukan publikasi konten otomatis. |
| CUR-05 | Ringkasan kesiapan pada master materi? | 10 November: “Ya, tampilkan ringkasan kesiapan dan tautannya (Rekomendasi)”. | Tampilkan kesiapan Pretest (contoh 20/20 valid), jumlah soal/paket pada tiap level Drill, alasan belum siap dan tautan pengaturan. Kelengkapan bukan persetujuan akademik. |
| IMP-05 | Cara simpan progres/draft? | 10 November: “Simpan otomatis progres/draft + tombol Simpan (Rekomendasi)”. | Progres impor/draft disimpan otomatis; tombol Simpan tetap memicu pemberlakuan revisi lengkap/valid sesuai aturan. Autosave tidak mengaktifkan revisi. |
| IMP-08 | Impor pada Pretest/paket yang sudah berisi soal? | 10 November: “Admin memilih Tambahkan atau Ganti isi, dengan preview dampak (Rekomendasi)”. | Pilihan Tambahkan/Ganti berlaku pada revisi yang dikelola, setelah preview dampak; validasi jumlah/kelengkapan dan pin versi tetap berlaku. Bukan overwrite versi aktif/histori langsung. |
| SYS-07 | Konflik edit dua Admin? | 10 November: “Ya, deteksi konflik saat simpan dan bantu memuat ulang (Rekomendasi)”. | Deteksi perubahan Admin lain saat simpan, beri informasi, pertahankan salinan edit yang belum tersimpan dan minta memuat versi terbaru sebelum melanjutkan. Tidak menimpa diam-diam atau memakai lock editor wajib. |
| VID-01 | Atribut video? | “Cukup dengan field tersebut (Rekomendasi)”. | Judul/URL YouTube/subbab cukup; deskripsi opsional tidak mewajibkan field schema baru setelah instruksi atribut existing ADM-DEC-076. |
| VID-07 | Urutan rekomendasi? | “Otomatis mengikuti urutan video ditambahkan”. | Urutan otomatis, bukan pengurutan manual. |
| RPT-06 | Laporan baru setelah kasus ditutup? | “Buka kembali kasus lama menjadi Baru (Rekomendasi)”. | Soal/versi sama membuka kembali kasus lama; laporan dan histori penutupan dipertahankan. |
| QST-06 | Media soal/pembahasan? | “Cukup; batas teknis ditentukan tim teknis (Rekomendasi)”. | PNG/JPG/WebP, preview/penggantian/alt text; batas teknis memakai implementasi existing. |
| QST-03 | Dugaan duplikat pada impor? | “Ya, peringatan dan keputusan Admin (Rekomendasi)”. | Tandai baris dan minta keputusan sebelum apply; tidak otomatis merge lintas paket atau ubah anchor/histori. Constraint identitas tetap berlaku. |
| CUR-02 | Atribut master? | “Sesuai dengan aturan tersebut (Rekomendasi)”. | Kode/nama/urutan/parent menurut representasi yang tersedia, sumber Curriculum dan kode tidak bentrok; instruksi terakhir memakai atribut existing mengendalikan bentuk DTO. |
| CUR-04 | Arsip master yang masih dipakai? | “Tolak arsip sampai ketergantungan paket aktif diselesaikan (Rekomendasi)”. | Tampilkan dependency aktif; histori tetap dipertahankan setelah arsip sah. |
| NAV-02 | Kembali ke daftar dan lanjut draft? | “Ya, pertahankan konteks daftar dan lanjutkan draft tersimpan (Rekomendasi)”. | Search/filter/halaman tetap; resume draft autosave terakhir yang berhasil. |
| SYS-01 | Perangkat Admin? | “Laptop utama; semua fungsi tetap bisa digunakan di ponsel (Rekomendasi)”. | Fungsi tidak dibatasi desktop; izin subrole tetap. |
| SYS-04 | Pusat notifikasi Admin? | “Cukup status dan Dashboard; belum perlu pusat notifikasi (Rekomendasi)”. | Status proses/modul/Dashboard cukup; email undangan/recovery tetap. |

Ini adalah catatan jawaban, bukan persetujuan atas seluruh implementasi yang ada. F-02 tidak berarti semua batas izin existing sudah diterima tanpa pemeriksaan.

### 2.1 Keputusan kebutuhan dari klarifikasi pemilik

**ENGINEERING DECISION — instruksi pemilik, 9–10 November 2026:** record berikut menyatakan arah kebutuhan yang diminta eksplisit. ADM-DEC-001–035 berasal dari 9 November; ADM-DEC-036–076 dari 10 November. Status APPROVED berlaku pada kebutuhan tersebut, bukan bukti validitas akademik atau penerimaan implementasi. Rincian rutin pada kolom batas lama diselesaikan melalui baseline/penjabaran teknis sesuai ADM-DEC-076; konflik v2 tetap terlihat pada PRD §17.

| ID | Status dan sumber | Kebutuhan yang disepakati | Batas yang masih OPEN |
| --- | --- | --- | --- |
| ADM-DEC-001 | APPROVED — AS-01 | Satu Pretest logis per bab yang sudah ditetapkan. Admin memilih bab dan mengatur isi Pretest; tambah paket bebas/tambah bab bukan entry point modul Pretest. Soal dapat ditambah, diedit dan dilepas dalam batas jumlah. | UI rinci/blueprint. Master bab dan slot otomatis ditetapkan ADM-DEC-014; jenis soal ADM-DEC-016. Jumlah dan Simpan dilengkapi ADM-DEC-004/006. |
| ADM-DEC-002 | APPROVED — AS-02–AS-03 | Input soal dimulai dari asesmen/paket tujuan; JSON dan Excel dibutuhkan. Paket mempunyai satu tujuan jenis asesmen. Authoring dari root bank soal umum digantikan alur kontekstual. | Rincian generator dan penyalinan antar paket sejenis. Katalog baca saja dibutuhkan sesuai ADM-DEC-015. Keputusan existing mengenai pemakaian konten Drill oleh PvP belum dibahas/dicabut. |
| ADM-DEC-003 | APPROVED — AS-05/AS-12 | Attempt berjalan mempertahankan versi lama; attempt baru mengikuti perubahan lengkap/valid setelah Simpan. Snapshot/hasil historis dipertahankan. | Hubungan perubahan master dengan paket/snapshot batch Tryout yang sudah dibuka, pemilihan varian dan penggantian terjadwal. Perubahan versi tidak otomatis memberi kesempatan tambahan. |
| ADM-DEC-004 | APPROVED — PRE-07 | Pretest maksimal 20 soal; draft boleh kurang, tetapi aktif harus tepat 20 dan valid. | Definisi validasi/blueprint dan penilaian PGK. Jenis soal ADM-DEC-016; perilaku versi aktif ADM-DEC-012. |
| ADM-DEC-005 | APPROVED — AS-11 | Pretest mendukung soal baru manual serta impor. Drill/Tryout memasukkan soal melalui impor, bukan menulis soal baru manual. | Edit pascaimpor diperbolehkan ADM-DEC-011. Jalur generator/impor varian masih ANC-04. |
| ADM-DEC-006 | APPROVED — AS-12 | Perubahan lengkap dan valid langsung berlaku saat Simpan; tidak memaksakan tombol aktivasi tambahan sebagai default. | Definisi validasi/persetujuan, perilaku Simpan draft tidak lengkap dan hubungan dengan jadwal/snapshot batch. Ini bukan izin melewati approval yang diwajibkan atau membuka batch sebelum jadwal. |
| ADM-DEC-007 | APPROVED — DRL-06 | Satu slot Drill pada bab/subbab/level dapat memiliki beberapa varian. | Lineage, eligibility dan fallback. Pemilihan sistem dilengkapi ADM-DEC-010. Kebutuhan ini menggantikan batas satu varian MVP; bukan klaim runtime sudah mendukung. |
| ADM-DEC-008 | APPROVED — TRY-10 | Master paket Tryout original/varian terpisah dari batch. Batch mengatur jadwal dan dapat memuat beberapa paket dengan pembagian sekolah/kelas. | Dokumen lanjutan pengguna; prioritas assignment, Mandiri, siswa multikelas, batas kesempatan dan IRT lintas paket. Tidak otomatis menyetujui randomisasi A/B atau formula equating. |
| ADM-DEC-009 | APPROVED — TRY-10, diralat ANC-01–02; dilengkapi ANC-06 | Sebelum membuat varian, Admin memilih 5 anchor Tryout atau 3 Drill; Pretest tidak memiliki anchor. Original/varian terkait memakai soal yang sama. Set boleh berbeda pada proses berikutnya. Anchor termasuk total: Drill 3+7=10, Tryout 5+25=30. | Jalur pembuatan dan revisi setelah dipakai. Jumlah hasil ditetapkan ADM-DEC-013. Ralat menggantikan waktu/cakupan awal; bukan bukti validitas statistik. |
| ADM-DEC-010 | APPROVED — DRL-07–13 | Sistem memakai jumlah attempt selesai seluruh siswa pada level yang sama; default awal original. Pada retry, utamakan kandidat yang belum pernah diselesaikan siswa; jika semua sudah, gunakan seluruh kandidat eligible. Di antara kandidat itu, pilih jumlah selesai global paling sedikit; seri memakai original → varian sesuai urutan dibuat. | Periode akumulasi, pengaruh revisi dan eligibility varian. Jangan mengganti hitungan dengan attempt mulai/siswa unik atau menyamakan pernah dilihat dengan pernah selesai. |
| ADM-DEC-011 | APPROVED — AS-13 | Soal hasil impor Drill/Tryout boleh diedit manual; pembatasan impor hanya pada input soal baru, bukan kewajiban impor ulang setiap koreksi. | Revisi anchor/hasil generate, bukti review ulang dan hubungan batch perlu dirinci. |
| ADM-DEC-012 | APPROVED — PRE-08 | Versi Pretest aktif lama tetap digunakan saat draft revisi tidak lengkap/valid. Draft baru menggantikan hanya ketika disimpan lengkap/valid; attempt lama tetap pada snapshot lama. | Pesan validasi rinci. CUR-07 menetapkan slot bab baru kosong/belum dapat dikerjakan sampai versi pertama lengkap/valid. |
| ADM-DEC-013 | APPROVED — ANC-05 | Satu proses pembuatan varian menghasilkan satu varian, dengan anchor yang dipilih untuk pasangan proses tersebut. | Generator versus impor eksternal tetap menunggu dokumen lanjutan ANC-04. |
| ADM-DEC-014 | APPROVED — CUR-01/06/07 | Content/Super mengelola bab, subbab dan indikator manual berdasarkan sumber Curriculum. Penambahan bab otomatis menyediakan slot Pretest kosong, belum dapat dikerjakan sampai tepat 20 soal lengkap/valid disimpan. Larangan tambah bab dari Pretest tidak membuat master materi baca saja. | Bukti approval Curriculum, perubahan struktur yang sudah dipakai, arsip dan keterlihatan bab ke siswa. Tidak mengizinkan perubahan lima level atau aturan produk lain; impor soal tetap ada. |
| ADM-DEC-015 | APPROVED — QST-08/10; QST-09 ditunda | Katalog global baca saja menampilkan asal jenis asesmen/paket/varian, informasi IRT serta jumlah/status laporan dan tautan ke detail laporan. Input/edit tetap di asesmen/slot/paket tujuan. | Makna/field IRT mengikuti dokumen Data/AI nanti. Cakupan Pretest, filter, versi/provenance, definisi hitungan laporan dan keadaan data belum tersedia masih OPEN. Tidak memberi jalur input/edit soal global. |
| ADM-DEC-016 | APPROVED — AS-14 | Pretest, Drill dan Tryout harus mendukung PG satu jawaban, PGK MCMA serta PGK Kategori seperti Benar/Salah per pernyataan. | Rubrik/scoring, makna benar pada Pretest PGK dan validasi akademik mengikuti handoff Curriculum/Data; tidak mengubah formula produk atau mewajibkan campuran tertentu di setiap paket. Batas runtime PG-only bukan target final. |
| ADM-DEC-017 | APPROVED — QST-02 | Editor kontekstual dapat mengubah teks, rumus/LaTeX, pilihan/pernyataan, kunci, pembahasan, gambar soal/pembahasan serta pemetaan materi/kesulitan. | Konversi jenis soal, batas media, field metadata lain dan pembatalan approval masih perlu rincian. Hak edit tidak mengubah aturan input baru manual/impor atau histori immutable. |
| ADM-DEC-018 | APPROVED — QST-07 | Preview cukup menampilkan soal, kunci dan pembahasan. Tidak membutuhkan simulasi pengerjaan atau nilai simulasi pada scope ini. | Susunan UI, navigasi antarsoal dan preview versi lama. Preview bukan attempt/progres/XP siswa. |
| ADM-DEC-019 | APPROVED — IMP-02 | Satu file JSON/Excel untuk satu paket/varian di konteks tujuan. | ADM-DEC-064 menetapkan pilihan Tambahkan/Ganti dengan preview; template, sheet/baris/media dan duplikasi/retry masih perlu kontrak. Tidak mengasumsikan beberapa paket dari satu file. |
| ADM-DEC-020 | APPROVED — IMP-03 | Progres impor tersimpan; Admin memperbaiki baris bermasalah di Admin, lalu melanjutkan. Kelengkapan/validitas tetap diperlukan sebelum paket dipakai siswa. | Autosave/tombol Simpan dan deteksi konflik dilengkapi ADM-DEC-063/065; interval, retensi, ownership sesi, recovery dan batas validasi masih perlu kontrak. Menyimpan progres intake berbeda dari membuat konten DRAFT sah atau mengaktifkan paket. |
| ADM-DEC-021 | APPROVED — RPT-01 | Laporan untuk soal dan versi yang sama digabung menjadi satu kasus dengan daftar laporan terkait. Jumlah/record laporan asli tetap dapat ditelusuri. | Kategori/urgensi/filter, laporan baru setelah kasus ditutup, aturan video serta relasi anchor/varian yang berbagi soal. Tidak menghapus/menggabungkan histori lintas versi. |
| ADM-DEC-022 | APPROVED — RPT-02 | Kasus tanpa assignment penanggung jawab; Content/Super boleh menangani langsung. | Konflik edit/status, catatan internal dan target operasional. Pelaku tindakan/audit tetap dicatat; tanpa assignment bukan tanpa akuntabilitas atau perubahan matriks izin. |
| ADM-DEC-023 | APPROVED — RPT-04 | Alur Baru → Ditinjau → Selesai atau Ditolak. Alasan penutupan wajib; tautkan revisi jika ada perbaikan konten. | Reopen, syarat penutupan rinci, propagasi status kasus ke record laporan terkait dan laporan baru sesudah penutupan. Tidak mengasumsikan perbaikan otomatis menutup kasus. |
| ADM-DEC-024 | APPROVED — QST-05 | Paket tetap tersedia bagi attempt baru selama diperbaiki; tidak memerlukan aksi menahan penggunaan baru karena laporan/kesalahan soal. Attempt berjalan tetap pada versi lama; revisi lengkap/valid mengikuti aturan pemberlakuan. | Detail penerapan versi pada batch Tryout tetap menunggu dokumen. Tidak mencabut lifecycle arsip/review umum atau memberi hak mengubah histori, hasil dan XP. |
| ADM-DEC-025 | APPROVED — RPT-05; selaras PRD §10.2 | Siswa cukup menerima konfirmasi laporan terkirim; tidak membutuhkan pemberitahuan hasil penyelesaian pada scope ini. | Rincian penanganan kasus tetap di Admin. Tidak menyimpulkan kebutuhan kanal komunikasi atau dashboard tiket siswa baru. |
| ADM-DEC-026 | APPROVED — VID-05 | Pengisian video YouTube oleh Content/Super dilakukan manual saja. | Metadata wajib, validasi tautan, bukti kelayakan/approval serta status awal video. Impor soal tetap tersedia sesuai keputusan lain. |
| ADM-DEC-027 | APPROVED — VID-02 | Maksimal tiga video aktif per subbab, bukan hanya membatasi hasil rekomendasi dari pool aktif yang lebih besar. | Urutan tampil, aktivasi/penggantian saat sudah tiga dan pesan batas. Tidak menetapkan rotasi sistem atau prioritas dari lebih dari tiga video aktif. |
| ADM-DEC-028 | APPROVED — VID-06 | Satu video hanya untuk satu subbab; bukan relasi video lintas beberapa subbab. | Identitas/normalisasi URL, duplikasi dan perubahan pemetaan ketika sudah pernah direkomendasikan/dilaporkan. Tidak mengizinkan duplikasi untuk melewati batas relasi. |
| ADM-DEC-029 | APPROVED — VID-03 | Video yang dilaporkan tetap tampil sampai diperiksa; Admin yang berhak boleh menonaktifkan. | Aktivasi ulang, bukti snapshot, relasi perbaikan dengan penutupan kasus dan penggabungan laporan video. Tidak ada penyembunyian otomatis hanya karena menerima laporan. |
| ADM-DEC-030 | APPROVED — VID-04 | Pemeriksaan ketersediaan video cukup manual oleh Admin dan melalui laporan siswa; pemeriksaan otomatis berkala bukan kebutuhan scope ini. | Tata cara pemeriksaan dan target operasional belum ditentukan. Tidak menetapkan scheduler, ambang otomatis atau SLA baru. |
| ADM-DEC-031 | APPROVED — SCH-07 | Operations/Super mengisi sekolah manual saja. | Duplikasi dan koreksi data; hak Content tetap tampilan terbatas. Impor sekolah bukan kebutuhan scope ini. |
| ADM-DEC-032 | APPROVED — mandat SCH-01; pilihan engineering dalam kewenangan yang didelegasikan | Field sekolah cukup nama, kode internal dan alamat. Nama/kode internal wajib; alamat opsional. Ini pilihan dari mandat pengguna dan konsisten kontrak existing, bukan kutipan langsung PRD tentang kewajiban field. | Perubahan kode dan deduplikasi rinci. Identitas sekolah tetap UUID; kode internal bukan NPSN dan tidak menyimpulkan nama sekolah unik. |
| ADM-DEC-033 | APPROVED — SCH-03 | Admin dapat menerbitkan beberapa token sekolah sekaligus untuk dibagikan offline. Guru boleh terdaftar tanpa token, tetapi hanya mendapat halaman pending/informasi dan input token sampai verifikasi; fungsi Guru belum tersedia. | Jumlah maksimum, penanganan bulk parsial/retry, penyalinan/penyerahan dan sesi plaintext. Baseline token satu sekolah, sekali pakai, 3×24 jam dan Google Auth tetap berlaku. |
| ADM-DEC-034 | APPROVED — SCH-04 | Reissue tidak otomatis mencabut token lama yang belum dipakai; token lama tetap berlaku sampai expiry, selama tidak dipakai/dicabut dan sekolah eligible. Histori pemakaian tetap disimpan. | Label aksi/relasi token baru-lama, pencabutan eksplisit dan sekolah nonaktif. Ini mengganti perilaku reissue existing yang mencabut token sumber; runtime belum diubah. |
| ADM-DEC-035 | APPROVED pada arah — SCH-02; dilengkapi ADM-DEC-036–040 tanggal 10 November | Sekolah nonaktif memengaruhi benefit/akses sekolah dan Guru melihat data lama dengan penanda nonaktif. Jawaban awal yang tentatif dirinci oleh SCH-08–12: kelas baca saja, membership tetap aktif/dihitung dan hasil terlambat untuk attempt lama dapat diakses. | Monetisasi/daftar benefit setelah demo ditunda, bukan blocker discovery. Reaktivasi otomatis diklarifikasi ADM-DEC-045. Attempt yang selesai setelah penonaktifan dan rincian pembacaan historis masih perlu diselesaikan. |
| ADM-DEC-036 | APPROVED — SCH-08, 10 November | Seluruh fitur gratis untuk semua pengguna selama fase demo sekitar satu bulan ke depan. Pembahasan monetisasi/benefit berbayar setelah demo ditunda sesuai instruksi pemilik. | Tanggal akhir pasti dan kebijakan sesudah demo belum ditetapkan; tidak ada expiry/paywall otomatis. Gratis tidak mengubah role, verifikasi Guru, izin historis, jadwal atau gate konten/scoring. |
| ADM-DEC-037 | APPROVED — SCH-09, 10 November | Jika siswa anggota A dan B, A nonaktif/B aktif, benefit melalui B tetap berlaku. | Definisi benefit setelah demo dan assignment paket batch tetap belum dirinci; penonaktifan A tidak boleh membatalkan hak yang sah dari B. |
| ADM-DEC-038 | APPROVED — SCH-10, 10 November | Membership di kelas sekolah nonaktif tetap aktif dan dihitung dalam batas lima kelas. Benefit/akses sekolah yang dibatasi, bukan penghapusan/penangguhan membership. | Perilaku leave/ban selama nonaktif dan penyajian lifecycle masih perlu rincian. Baseline Mandiri/School tetap berdasarkan membership; status sekolah adalah dimensi terpisah. |
| ADM-DEC-039 | APPROVED — SCH-11, 10 November | Sekolah nonaktif menjadikan kelas baca saja: tanpa siswa baru, kelas baru, takeover atau feedback baru. Guru hanya data historis dengan informasi nonaktif dalam kewenangannya. | Reaktivasi otomatis menurut ADM-DEC-045; query/otorisasi histori dan aksi lifecycle lain belum dirinci. Tidak mematikan kegiatan belajar pribadi siswa atau membuka akses semua data ke semua Guru. |
| ADM-DEC-040 | APPROVED — SCH-12, 10 November | Guru dapat melihat hasil IRT yang dirilis setelah sekolah nonaktif bila attempt selesai sebelum penonaktifan dan aksesnya sah. | Identitas/versi hasil dan otorisasi historis perlu kontrak; bukan izin melihat attempt yang selesai setelah batas atau menulis ulang hasil. |
| ADM-DEC-041 | APPROVED — PEO-01, 10 November | Daftar pengguna Operations/Super cukup nama, email, role Siswa/Guru, status akun, verifikasi Guru dan sekolah/kelas, dengan pencarian/filter mengikuti data tersebut. | Definisi tiap status, pencarian/pagination dan kontrak data perlu rincian; tidak memberi Content akses PII. |
| ADM-DEC-042 | APPROVED — PEO-02, 10 November | Detail siswa memuat semua kelas/sekolah, status aktif/nonaktif sekolah, hitungan batas lima kelas, Mandiri/School dan histori join/leave/ban/unban; progres/XP milik akun. | Pemisahan daftar membership saat ini dan histori perlu kontrak. Menampilkan histori tidak memberi Admin hak mengubahnya. |
| ADM-DEC-043 | APPROVED — PEO-03, 10 November | Detail kelas Operations/Super mencakup nama/sekolah/status, Guru aktif/kosong, jumlah anggota, roster aktif/mantan dan waktu join/leave. Content tetap struktur/agregat tanpa identitas siswa. | Definisi jumlah anggota dan riwayat periode join berulang perlu kontrak; tidak memperluas hak mutasi kelas. |
| ADM-DEC-044 | APPROVED — PEO-04, 10 November | Untuk salah kelas, gagal join atau Guru kehilangan akses, Admin cukup membaca data/histori dan mengarahkan pengguna ke alur sah. | Tidak memerlukan aksi koreksi membership/ownership oleh Admin; ban/unban tetap Guru aktif. Fitur tiket internal tidak otomatis diminta. |
| ADM-DEC-045 | APPROVED — SCH-13, 10 November | Reaktivasi sekolah otomatis memulihkan akses kelas dan monitoring untuk keanggotaan/kepemilikan yang masih sah, tanpa review manual wajib. | Kontrak eligibility, transisi berulang serta visibilitas data yang dibuat selama nonaktif masih perlu rincian. Tidak mengembalikan membership/ownership yang sudah berakhir. |
| ADM-DEC-046 | APPROVED — DASH-01, 10 November | Semua tiga subrole Admin aktif masuk ke Dashboard sesuai lingkup masing-masing setelah login. | Menggantikan tujuan awal Operations/Sekolah dan Content/konten. Assignment null/nonaktif tetap tidak mendapat akses; route/capability terperinci mengikuti spesifikasi. |
| ADM-DEC-047 | APPROVED — DASH-02, 10 November | Metrik cukup agregat siswa/kelas serta pengerjaan Drill/Tryout bagi semua; Operations ditambah sekolah, verifikasi Guru/token dan jadwal/rilis batch; Content ditambah kesiapan konten, laporan dan proses IRT; Super gabungan. | Definisi status, unit hitung akun/membership/attempt/soal/versi/paket dan penerapan waktu harus dirinci. Tidak ada identitas individual atau diagnosis IRT untuk Operations. |
| ADM-DEC-048 | APPROVED — DASH-03, 10 November | Dashboard memerlukan filter tanggal, sekolah, jenis asesmen dan perbandingan periode, selalu sesuai lingkup izin. | Periode default/pembanding, timestamp acuan, dimensi sekolah multikeanggotaan dan metrik yang tidak mendukung filter masih OPEN; jangan membuat atribusi ganda tanpa definisi. |
| ADM-DEC-049 | APPROVED — DASH-04, 10 November | Dashboard diperbarui otomatis setiap lima menit serta melalui tombol Perbarui; waktu pembaruan dan status belum tersedia/gagal berbeda dari nol. | Kebijakan tab tidak aktif, request beririsan dan kesegaran agregat sumber perlu spesifikasi; interval UI bukan SLA pipeline. |
| ADM-DEC-050 | APPROVED — DASH-05, 10 November | Unduhan/ekspor Dashboard belum diperlukan untuk scope ini. | Ekspor audit/modul lain tetap pertanyaan terpisah; tidak menambahkan format atau tombol unduh Dashboard. |
| ADM-DEC-051 | APPROVED — ACC-01, 10 November | Super mengundang Admin lewat email; penerima membuka tautan dan membuat password; login Admin email/password dengan lupa password lewat email. Siswa/Guru tetap Google. | Rincian expiry/template dan delivery perlu kontrak/provider verification; tidak ada pendaftaran Admin publik. |
| ADM-DEC-052 | APPROVED — ACC-02, 10 November | Undangan wajib nama, email dan satu dari tiga subrole. Daftar akun menampilkan subrole, status undangan/akun serta pengiriman diproses/gagal; sukses diproses berbeda dari email diterima/acceptance. | Enum status, retry dan ketentuan field perlu kontrak; tidak memunculkan bukti delivery palsu. |
| ADM-DEC-053 | APPROVED — ACC-03, 10 November | Super dapat batal undangan belum diterima dan kirim ulang/pemulihan. Email yang telah dipakai Siswa/Guru ditolak dengan arahan memakai email lain. | Undangan diterima dikelola lewat status akun, bukan pembatalan undangan. Detail idempotensi, link lama dan konflik antar-Admin belum dirinci. |
| ADM-DEC-054 | APPROVED — ACC-04, 10 November | Super mengubah subrole atau menonaktifkan/mengaktifkan Admin dengan konfirmasi, alasan wajib dan histori. Hak mengikuti status terbaru; Super aktif terakhir dilindungi dari penonaktifan/demosi. | Konkurensi, self-change dan pekerjaan belum tersimpan perlu spesifikasi. Aktif ulang sekolah tidak sama dengan aktif ulang akun Admin. |
| ADM-DEC-055 | APPROVED pada alur — ACC-06, 10 November | Pemulihan saat tidak ada Super bisa masuk melalui operator teknis di luar halaman Admin, dengan alasan insiden dan catatan audit. | Penanggung jawab/operator berwenang masih OPEN. Tidak mengizinkan eksekusi prosedur atau menetapkan orang/tim tertentu dari jawaban ini. |
| ADM-DEC-056 | APPROVED — AUD-01, 10 November | Histori aktivitas mencakup pelaku/waktu/modul/objek/tindakan, perubahan sebelum/sesudah, alasan dan hasil berhasil/gagal, dengan filter pelaku/modul/tanggal. Super seluruh lingkup; Operations/Content lingkup masing-masing. | Rahasia tidak masuk histori; batas identitas Content tetap berlaku. Cakupan event, redaksi perubahan, absent values pada kegagalan dan retensi perlu kontrak. |
| ADM-DEC-057 | APPROVED — AUD-02, 10 November | Histori diperiksa saat ada masalah; jadwal pemeriksaan rutin belum diperlukan. | Orang/tim berwenang tetap mengikuti domain/izin; jawaban ini tidak menetapkan penanggung jawab operator pemulihan atau SLA baru. |
| ADM-DEC-058 | APPROVED — AUD-03, 10 November | Unduhan/ekspor histori aktivitas belum diperlukan dalam scope ini. | Histori tetap dapat dibaca/filter di Admin sesuai izin. Tidak menetapkan retensi/penghapusan atau meniadakan logging. |
| ADM-DEC-059 | APPROVED — AUD-04, 10 November | Insiden ditelusuri lewat masalah/histori lalu dieskalasikan melalui kanal tim existing ke teknis/Curriculum/Data sesuai kasus; penanganan sesuai kewenangan dicatat. Tanpa modul tiket insiden baru. | Tidak mengotorisasi pengiriman pesan oleh agent, memilih kanal/orang tertentu atau menambah hak perubahan hasil/membership; respons insiden ilmiah tetap mengikuti policy sah. |
| ADM-DEC-060 | APPROVED — ACC-05, 10 November | Versi ini cukup autentikasi dan kontrol akses existing; OTP/MFA dan batas perangkat/sesi tambahan belum diperlukan. | Tidak menonaktifkan expiry, pembatasan provider, pemeriksaan assignment terkini atau proteksi Super terakhir. Penanggung jawab recovery ACC-06 tetap OPEN. |
| ADM-DEC-061 | APPROVED — CUR-08, 10 November | Subbab baru otomatis memiliki lima slot Drill Level 1–5 kosong; belum dapat dikerjakan sampai paket lengkap dan memenuhi syarat. | Bukan pembuatan soal/varian atau publikasi otomatis. Hubungan status master/coverage dan syarat kesiapan paket perlu kontrak. |
| ADM-DEC-062 | APPROVED — CUR-05, 10 November | Master materi menampilkan ringkasan kesiapan: Pretest, jumlah soal/paket per level Drill, alasan belum siap dan tautan pengaturan. | Ringkasan kelengkapan bukan approval Curriculum/IRT. Definisi count valid/aktif/draft dan alasan mengikuti lifecycle yang disepakati; tidak membuat checklist akademik baru. |
| ADM-DEC-063 | APPROVED — IMP-05, 10 November | Progres impor/draft disimpan otomatis, disertai tombol Simpan. Autosave menyimpan progres; pemberlakuan revisi lengkap/valid tetap melalui tindakan Simpan sesuai ADM-DEC-006. | Interval/debounce, recovery dan ownership belum dirinci; tidak mengaktifkan perubahan hanya karena autosave berhasil atau melewati approval/jadwal. |
| ADM-DEC-064 | APPROVED — IMP-08, 10 November | Saat impor ke Pretest/paket berisi soal, Admin memilih Tambahkan atau Ganti isi dengan preview dampak sebelum diterapkan ke revisi. | Jumlah maksimal/validasi tetap berlaku; versi aktif lama/attempt/histori dipertahankan sampai pengganti sah. Identitas duplikat, rollback draft dan media perlu rincian. |
| ADM-DEC-065 | APPROVED — SYS-07, 10 November | Konflik edit dideteksi saat simpan; informasikan perubahan Admin lain, pertahankan salinan edit belum tersimpan dan minta muat versi terbaru sebelum melanjutkan. Tidak menimpa diam-diam. | Format pembanding/manual merge, cakupan objek dan autosave perlu kontrak. Salinan edit hanya dapat dipulihkan dalam kewenangan yang sah; bukan izin menyimpan rahasia setelah pencabutan akses. |
| ADM-DEC-066 | APPROVED — VID-01 | Judul, URL YouTube dan subbab cukup sebagai input inti video. | Atribut existing menjadi acuan sesuai ADM-DEC-076; deskripsi opsional tidak memaksa kolom baru. |
| ADM-DEC-067 | APPROVED — VID-07 | Rekomendasi otomatis menurut urutan video ditambahkan. | Teknis menggunakan urutan existing yang ditetapkan sistem; tidak ada pengurutan manual. |
| ADM-DEC-068 | APPROVED — RPT-06 | Laporan baru soal/versi sama membuka kembali kasus Selesai/Ditolak menjadi Baru. | Histori penutupan dan seluruh laporan tetap; race dijaga server. |
| ADM-DEC-069 | APPROVED — QST-06 | PNG/JPG/WebP, preview, penggantian serta alt text; batas teknis didelegasikan. | Gunakan validasi upload existing termasuk 5 MiB, verifikasi server dan media historis immutable. |
| ADM-DEC-070 | APPROVED — QST-03 | Dugaan duplikat diberi warning/penanda baris; Admin memutuskan sebelum impor diterapkan. | Tidak auto-merge atau mengubah lineage/anchor/histori; constraint identity tetap keras. |
| ADM-DEC-071 | APPROVED — CUR-02 | Metadata master mengikuti sumber Curriculum, kode tidak bentrok, induk sesuai struktur; sumber belum lengkap tetap draft. | Representasi existing mengikuti ADM-DEC-076; competency tidak harus ditambah field name/order. |
| ADM-DEC-072 | APPROVED — CUR-04 | Tolak arsip master sampai ketergantungan paket aktif diselesaikan. | Histori/versi lama tidak dihapus; dependency ditampilkan. |
| ADM-DEC-073 | APPROVED — NAV-02 | Pertahankan konteks daftar dan lanjutkan draft autosave terakhir yang sukses. | Hanya data tersimpan yang dapat dijanjikan pulih; izin tetap diperiksa. |
| ADM-DEC-074 | APPROVED — SYS-01 | Laptop utama; semua fungsi dapat digunakan di ponsel. | Responsif mengikuti desain existing dan izin subrole. |
| ADM-DEC-075 | APPROVED — SYS-04 | Status proses/modul/Dashboard cukup; tidak perlu pusat notifikasi Admin. | Email undangan/pemulihan tetap sesuai alur akun. |
| ADM-DEC-076 | APPROVED — instruksi terakhir pemilik | Hentikan pertanyaan atribut/detail rutin; gunakan atribut, validasi dan pola yang saat ini tersedia. Selesaikan keluaran dokumen dari keputusan terkumpul. | Tidak menganggap dependency ilmiah terjawab, konflik kebijakan terselesaikan atau implementasi sudah selesai. |

### 2.2 Draf alur berdasarkan jawaban

**Catatan historis dari keputusan ADM-DEC-001–065; alur aktif yang sudah dikonsolidasikan ada pada PRD Admin.** Ringkasan Drill/availability di bawah harus dibaca bersama konflik v2 pada PRD §17, bukan langsung diterapkan:

- Pretest → pilih bab tetap → manual/impor dan kelola soal → Simpan draft jika belum lengkap, versi aktif lama tetap dipakai → Simpan tepat 20 dan valid → attempt baru memakai revisi baru; attempt lama tetap pada versi lama.
- Drill → pilih bab/subbab/level → kelola original/varian → impor/edit → validasi/Simpan. Default awal original; saat retry, pilih kandidat yang belum pernah diselesaikan siswa jika ada → jumlah selesai global paling sedikit di antara kandidat → original lalu varian sesuai urutan dibuat saat seri. Jika seluruh kandidat sudah diselesaikan, kembali ke pemerataan global. Periode/revisi masih OPEN.
- Pembuatan varian Drill/Tryout → pilih original sumber → pilih manual 3/5 anchor dari total 10/30 soal → jalur yang menunggu dokumen → satu varian dihasilkan dengan soal anchor yang sama. Proses berikutnya boleh memilih set berbeda.
- Master Tryout → impor/kelola original dan varian, edit hasil impor → validasi/simpan master. Batch Tryout → jadwal → pilih paket → pembagian sekolah/kelas → distribusi menurut jadwal → attempt dan hasil sesuai kontrak batch yang belum lengkap.
- Master materi → Content/Super memasukkan bab/subbab/indikator manual berdasarkan sumber Curriculum → bab baru otomatis memiliki slot Pretest kosong, belum dapat dikerjakan sampai 20 soal lengkap/valid. Validasi/persetujuan serta revisi/arsip masih perlu rincian.
- Katalog soal global → telusuri soal beserta asal jenis asesmen/paket/varian, informasi IRT dan jumlah/status laporan → tautan detail laporan. Katalog baca saja; pengelolaan isi tetap pada asesmen tujuan. Makna IRT mengikuti dokumen Data/AI nanti.
- Editor/preview → ubah seluruh bagian yang ditanyakan pada konteks soal → lihat tampilan soal, kunci dan pembahasan tanpa simulasi. PG/MCMA/Kategori dibutuhkan untuk ketiga asesmen; rubrik penilaian tetap dependency.
- Impor → buka tujuan → unggah JSON/Excel satu paket/varian → preview/validasi → simpan progres → perbaiki baris bermasalah di Admin → lanjutkan setelah diperbaiki. Paket tetap harus lengkap/valid sebelum efektif.
- Laporan soal/video → siswa menerima konfirmasi terkirim → laporan soal/versi sama masuk satu kasus dengan daftar laporan terkait → Content/Super menangani tanpa assignment → Baru → Ditinjau → Selesai/Ditolak dengan alasan wajib dan tautan revisi bila diperbaiki. Paket tetap tersedia selama perbaikan; tidak mengirim notifikasi penyelesaian siswa.
- Video → input manual oleh Content/Super → satu video dipetakan ke satu subbab → maksimal tiga aktif per subbab → direkomendasikan saat gagal Drill. Laporan tidak otomatis menyembunyikan video → Admin memeriksa manual → boleh menonaktifkan/memperbaiki. Tidak membutuhkan pemeriksaan berkala otomatis.
- Sekolah → Operations/Super membuat sekolah manual (nama/kode wajib, alamat opsional) → terbitkan beberapa token bila diperlukan → bagikan offline → Guru terdaftar namun pending sampai memasukkan token sah → fungsi Guru terbuka setelah verifikasi. Reissue tidak otomatis membatalkan token lama yang belum dipakai.
- Pengguna/kelas → Operations/Super mencari dan memfilter daftar pengguna → buka detail siswa/kelas beserta membership/histori → arahkan pengguna melalui alur sah. Tidak ada aksi koreksi membership/ownership Admin; Content hanya struktur/agregat.
- Dashboard → semua subrole masuk ke Dashboard scoped → pilih tanggal/sekolah/asesmen dan bandingkan periode → periksa agregat sesuai izin → refresh otomatis lima menit atau manual. Tidak membutuhkan ekspor Dashboard; definisi filter/perbandingan rinci masih OPEN.
- Akun Admin → Super mengundang nama/email/subrole wajib → penerima membuat password dari tautan → login email/password → recovery lewat email bila perlu. Undangan bisa batal/kirim ulang; email Siswa/Guru ditolak. Ubah subrole/nonaktif/aktif wajib konfirmasi/alasan/histori; Super terakhir dilindungi. Pemulihan darurat lewat operator luar UI, orang/tim belum ditentukan.
- Audit/insiden → catat aktivitas sesuai domain dan redaksi → filter/telusuri saat ada masalah → eskalasi melalui kanal tim existing dan catat penanganan sesuai kewenangan. Tanpa unduhan histori, jadwal audit rutin atau modul tiket insiden baru.
- Kesiapan materi/draft → subbab baru otomatis memiliki lima slot kosong → master menampilkan kesiapan dan tautan pengaturan → impor dengan pilihan Tambahkan/Ganti dan preview → autosave progres/draft tanpa aktivasi → Simpan lengkap/valid memberlakukan revisi. Konflik edit diberitahukan tanpa menimpa perubahan lain.

**ENGINEERING DECISION — sekolah nonaktif/demo, 10 November:** seluruh fitur gratis selama demo sekitar satu bulan, pembahasan berbayar ditunda. Sekolah nonaktif → kelas baca saja tanpa join/create/takeover/feedback baru → membership tetap aktif/dihitung pada batas lima → Guru membaca data lama dengan penanda nonaktif, termasuk hasil IRT terlambat jika attempt selesai sebelum penonaktifan. Benefit dari sekolah lain yang aktif tetap berlaku. Reaktivasi otomatis untuk membership/ownership sah mengikuti ADM-DEC-045; rincian akses historis masih OPEN. Demo gratis tidak menghapus izin per role/verifikasi.

**PROPOSED — rincian teknis untuk spesifikasi berikutnya:** satu identitas Pretest logis per bab dapat memiliki revisi internal. Revisi tidak tampil sebagai beberapa paket Pretest bebas yang perlu dibuat pengguna. Mulai attempt dan pergantian versi harus diputuskan secara atomik di server; edit/lepas soal pada revisi baru tidak mengubah konten attempt lama. Bentuk tabel, endpoint dan strategi transaksinya belum ditetapkan oleh diskusi ini.

**OPEN:** periode/revisi/eligibility Drill; validasi/perubahan master; rincian katalog; kategori/filter/bukti/konflik/reopen laporan; metadata/validasi/urutan/aktivasi video; template/recovery impor; rubrik/blueprint; kontrak reaktivasi/akses historis sekolah serta definisi filter/perbandingan metrik. Dasar asesmen/konten/video/sekolah/token serta prinsip dampak sekolah nonaktif sudah dicatat, bukan ditanyakan ulang. Cakupan pengguna/kelas, akun dan Dashboard sudah diputuskan pada ADM-DEC-041–055; audit/keamanan serta kesiapan materi dan penyimpanan draft dilengkapi ADM-DEC-056–065. Rincian kontrak, approval dan batch masih perlu dilengkapi. Monetisasi setelah demo ditunda tanpa menghambat discovery; IRT katalog dan jalur varian menunggu dokumen lanjutan. Tidak mengubah histori/progres/XP.

### 2.3 Perubahan terhadap sumber lama dan dokumen lanjutan

| Sumber lama | Arah kebutuhan terbaru | Batas tindak lanjut |
| --- | --- | --- |
| PRD v0.6 §10/AC-12: satu varian Drill MVP. | ADM-DEC-007: beberapa varian pada satu slot level. | Catat sebagai perubahan scope dari pemilik; algoritma pemilihan/rotasi belum boleh dibuat berdasarkan dugaan. |
| Paket Tryout bersama dan fondasi Admin 9 November tanpa multi-paket aktif. | ADM-DEC-008: master/batch terpisah dengan beberapa paket dan assignment sekolah/kelas. | Acuan perilaku berikutnya berubah; runtime lama tidak dinyatakan sudah mendukung. Detail menunggu dokumen yang pengguna akan kirim. |
| Pernyataan awal TRY-10: lima anchor setelah impor/generate. | Ralat ANC-01–02: sebelum membuat varian, 5 Tryout/3 Drill/0 Pretest; sama pada relasi original/varian, boleh berbeda pada proses berikutnya. | Ralat menggantikan waktu/cakupan awal. Tidak menyimpulkan seluruh rancangan A/B atau pipeline ilmiah disetujui. |
| Audit runtime Pretest 9 November: paket Pretest dibatasi PG satu jawaban. | ADM-DEC-016: target final mencakup PG/MCMA/Kategori untuk Pretest, Drill dan Tryout. | Ini kesenjangan implementasi terhadap kebutuhan, bukan pencabutan aturan PRD yang melarang PGK. Rubrik/placement PGK belum disahkan oleh pilihan jenis soal. |
| Reissue pada `schools.service.ts` mencabut token sumber sebelum menerbitkan token baru. | ADM-DEC-034: token lama yang belum dipakai tidak otomatis dicabut saat reissue. | Catat kesenjangan implementasi; single-use/expiry/revoke eksplisit tetap berlaku. Kontrak, label dan runtime belum diperbarui. |
| PRD §11: Tryout ongoing gratis bagi semua; §4–6: status membership dan kelas tanpa guru. | ADM-DEC-036–040: semua fitur gratis selama demo; sekolah nonaktif baca saja, membership tetap aktif/dihitung, hasil IRT terlambat boleh untuk attempt selesai sebelumnya. | Demo tidak menetapkan harga/akses pascademo. Kelas tanpa Guru di sekolah aktif tetap mengikuti baseline tersendiri; sekolah nonaktif tidak otomatis menghapus membership atau membekukan mutlak hasil lama. |

Rancangan yang sudah mulai disusun tersedia di [PRD Admin — draft](ADMIN_PRD_DRAFT.md). Kelengkapan dokumen lanjutan Tryout dicatat sebagai dependency; tidak perlu menebak isi dokumen atau meminta pengguna memutuskan threshold statistik.

**Catatan rekonsiliasi sumber, 10 November:** pembaruan workspace kini memuat [penerbitan Pretest original](../development/PRETEST_ORIGINAL_RELEASE_2026-11-09.md), [amendemen varian/IRT v2](../AI_IRT_V2_CONTEXT.md) dan [kontrak IRT v1](../IRT_CALIBRATION_CONTRACT_V1.md). Rubrik parsial/placement Pretest sudah diputuskan dalam sumber penerbitan; catatan audit PG-only dan OPEN Pretest terdahulu merupakan konteks sebelum keputusan tersebut. **OPEN — untuk pembahasan dokumen lanjutan:** cocokkan distribusi Drill ADM-DEC-010 dengan assignment arm tetap v2 serta ketersediaan selama koreksi ADM-DEC-024 dengan penghentian versi bermasalah/DRIFT v2. Jangan diam-diam menghapus keputusan salah satu sumber, menyamakan approval produk dengan validasi ilmiah, atau membuka ulang seluruh kontrak IRT sebagai belum ada. Login Google yang tetap tersedia juga tidak mencabut pengecualian akun Siswa email/password yang disiapkan pengelola pada OPEN-14.

## 3. Sumber dan baseline untuk diskusi

| Sumber | Dipakai untuk |
| --- | --- |
| [PRD v0.6 Final](sources/PRD_Numora_v0.6.docx.md), terutama §3, §5–13, §18–19, §22–25 | Perilaku produk, batas izin, lifecycle dan acceptance awal. |
| [PRD Admin](ADMIN_PRD.md), [spesifikasi teknis](../architecture/ADMIN_TECHNICAL_SPEC.md) dan ADM-DEC-001–076 | Acuan konsolidasi. Detail rutin memakai baseline existing; dependency substantif dan konflik v2 ditandai pada PRD §17. |
| [PRODUCT_CONTEXT](PRODUCT_CONTEXT.md), [OPEN_DECISIONS](OPEN_DECISIONS.md), [PRD_MAPPING](PRD_MAPPING.md) | Keputusan pemilik setelah PRD, supersession dan ketergantungan. Bagian historis tidak otomatis masih berlaku. |
| [Matriks izin Admin](../api/ADMIN_PERMISSION_MATRIX.md) | Hak per aksi dan pembatasan data ketiga subrole. |
| [Admin dan akses asesmen, 9 November](../development/ADMIN_ASSESSMENT_REWORK.md) dan [direktori asesmen](../design/ADMIN_ASSESSMENT_DIRECTORY_2026-11-09.md) | Pipeline canonical, pemisahan daftar/tambah/detail, ketersediaan siswa dan status hasil. |
| [Audit Pretest, 9 November](../development/PRETEST_AUDIT_2026-11-09.md) | Batas implementasi dan persetujuan, terutama PG-only, editor yang terbatas dan blueprint. |
| [Publisher asesmen](../api/ADMIN_ASSESSMENT_PUBLISHER.md) | Publikasi, snapshot, policy pin dan penggantian paket. Baca koreksi terbaru sebelum bagian historis. |
| [IRT dan Analytics Admin](../api/ADMIN_IRT_ANALYTICS.md) | Orkestrasi, adopsi, hasil peserta, batas kontrak Data dan agregat. |
| [Workflow upload](../content/UPLOAD_FIRST_WORKFLOW.md) dan [preview konten](../api/CONTENT_IMPORT_PREVIEW.md) | Intake, pemetaan, progres parsial dan lifecycle. Ketentuan Tryout lama di sini sudah memiliki koreksi berikutnya. |
| [Status full stack](../development/ADMIN_FULL_STACK_STATUS.md), [runbook akun](../development/ADMIN_ACCOUNTS_RUNBOOK.md) | Kemampuan existing, pemulihan akun dan gate penerimaan yang tercatat. |
| [ADR-008](../adr/ADR-008-question-versioning.md), [ADR-011](../adr/ADR-011-separated-irt-compute.md) | Histori versi immutable dan pemisahan produk dengan compute Data/AI. |
| [Navigasi Admin](../../apps/web/src/features/admin/navigation.ts), [capability server](../../apps/api/src/modules/identity/admin-capabilities.ts) | Inventaris menu dan izin implementasi lokal; kode bukan pengganti keputusan produk. |

### Baseline yang tidak perlu ditebak ulang

**PRD RULE:** ada Super Admin, Admin Operasional, dan satu subrole gabungan Content/Data/Moderation. Tidak ada subrole atau assignment aktif berarti tidak ada akses istimewa. Semua Admin dilarang ban/unban kelas dan mengubah formula produk atau hasil akademik historis.

**PRD RULE — baseline dengan perubahan pemilik yang dicatat:** Pretest 20 soal per bab, opsional, maksimal sekali selesai per bab, tanpa XP; Drill 10 soal per level, lima level/subbab dan mastery 80%. Batas satu varian MVP pada PRD lama digantikan kebutuhan multivarian ADM-DEC-007. Tryout 30 soal tetap baseline, tetapi master/batch dan beberapa paket kini mengikuti ADM-DEC-008; batas attempt per paket/batch pada model baru masih perlu dirinci. Kelas tanpa guru aktif valid; progres/riwayat/XP milik akun, maksimal lima kelas aktif.

**PRD RULE / ENGINEERING DECISION:** import/preview, READY, publikasi paket, ketersediaan siswa, keberhasilan compute, adopsi dan rilis hasil adalah kejadian berbeda. Attempt menyimpan versi konten, susunan paket dan policy yang benar-benar digunakan. Revisi tidak menulis ulang histori.

**ENGINEERING DECISION — sumber 7 Oktober:** alur Admin Tryout sudah mengizinkan rilis segera/terjadwal, menggantikan batas rilis Senin pada alur tersebut; periode tujuh hari dikurangi satu menit dan durasi attempt 600 detik tercatat. Rancangan final harus menyatakan perilaku paket bersamaan/pengganti secara eksplisit, tidak mengambil aturan mingguan lama secara diam-diam.

**ENGINEERING DECISION — sumber 7 dan 26 Oktober:** Tryout mempunyai pengecualian metadata dan policy parsial `TRYOUT_PGK_PARTIAL_V1` dengan ketentuan XP/presisi tersendiri. Pengecualian dan policy ini tidak otomatis berlaku pada Drill/Pretest. Formula, pembulatan dan nilai yang ditampilkan harus mengikuti policy pin, bukan diseragamkan berdasarkan catatan lama. Rubrik/blueprint atau kontrak ilmiah yang belum disetujui tetap OPEN.

**ENGINEERING DECISION — sumber 9 November, baseline implementasi sebelum klarifikasi kebutuhan ini:** Dashboard tersedia sesuai lingkup ketiga subrole; sidebar memiliki empat kelompok. Pretest, Drill dan Tryout memiliki halaman daftar, tambah dan detail masing-masing. Untuk rancangan berikutnya, entry point tambah paket bebas Pretest digantikan pengaturan per bab pada ADM-DEC-001; ini bukan klaim kode sudah diubah.

### Hal yang perlu direkonsiliasi

| Area | Bukti/indikasi dari sumber | Pertanyaan keputusan |
| --- | --- | --- |
| Urutan membuat asesmen | Pemilik menetapkan Pretest per bab dan input soal dari konteks asesmen/paket. Implementasi masih mempunyai jalur intake/bank umum. | ADM-DEC-001–002; rincian authoring, Drill dan Tryout masih ditanyakan. |
| Persetujuan akademik | Audit Pretest mencatat deklarasi Admin dan blueprint dari susunan aktual; belum membuktikan pemeriksaan terhadap blueprint akademik independen. | AS-04, CUR-03, PRE-02: siapa memeriksa apa dan bukti apa yang sah. |
| Mengisi dan menyusun Pretest | Audit mencatat kemampuan editor/pengurutan terpadu masih terbatas; bank umum bukan alur yang diminta pemilik. | AS-06–AS-07/AS-11: impor, edit, tambah/lepas dan pengurutan dalam konteks Pretest. |
| Tryout | Aturan jadwal, metadata dan policy berubah setelah PRD awal. | TRY-01–TRY-06: perilaku akhir yang menjadi acuan tunggal. |
| Rilis hasil | Dokumen IRT menyatakan kontrak hasil respondent/mapping produksi belum disetujui. | IRT-01–IRT-08: handoff dan rilis hasil, bukan sekadar compute sukses. |
| Kejelasan status | PUBLISHED dapat berbeda dari AVAILABLE; hasil belum tentu dirilis. | AS-08, TRY-07, IRT-05: label, alasan tertahan, tindakan berikutnya. |
| Definisi metrik | Dashboard existing menggunakan hitungan record/attempt kumulatif dan agregat berdasarkan izin. | DASH-01–DASH-05: makna, filter dan tindakan, tanpa klaim DAU atau siswa unik yang belum didukung. |

## 4. Pertanyaan prioritas — asesmen bersama

**Arah yang sudah diputuskan:** masuk fitur asesmen → pilih konteks tujuan → isi/kelola soal di situ. Pretest per bab, Drill per slot level dengan beberapa varian, Tryout master paket terpisah dari batch. Simpan lengkap/valid langsung berlaku; hubungan terhadap distribusi/jadwal batch dan review/approval masih perlu dirinci.

AS-01–AS-05 di bawah dipertahankan sebagai pertanyaan asli untuk jejak diskusi. Jawaban ada di §2; AS-04 belum diputuskan. Pilihan bank umum pada pertanyaan awal tidak lagi menjadi usulan alur aktif setelah jawaban AS-02–AS-03.

- **AS-01.** Alur utama mana yang diinginkan: (a) pilih jenis → buat draft paket → isi soal; (b) impor/generate → preview → pilih jenis/tujuan paket; atau (c) siapkan bank → pilih soal untuk paket? Jalur tambahan mana yang masih dibutuhkan?
- **AS-02.** Cara mengisi soal apa yang wajib: Excel, JSON, memilih bank soal, menulis langsung, generator AI? Mana yang paling sering dipakai? Apakah kebutuhannya berbeda untuk tiap asesmen?
- **AS-03.** Setelah impor, soal langsung masuk paket yang sedang dibuat, masuk bank dahulu, atau Admin boleh memilih? Apakah jawaban berbeda untuk Pretest/Drill/Tryout?
- **AS-04.** Pembuat boleh sekaligus memberi persetujuan, atau wajib diperiksa orang lain? Jika pembuat boleh, apa bukti persetujuan akademik yang harus dilampirkan? Identitas penanggung jawab boleh tetap OPEN.
- **AS-05.** Jika ada paket pengganti, siswa yang belum mulai mendapat paket mana untuk setiap jenis asesmen? Attempt yang sudah dimulai tetap memakai versi paketnya; bagaimana pilihan paket lama dijelaskan kepada Admin?
- **AS-06.** Di pengaturan Pretest/detail paket tujuan, aksi apa yang wajib tersedia: impor tambahan, edit, tambah manual jika disepakati, lepas/ganti soal, atur urutan dan preview? Apakah duplikasi antar paket sejenis dibutuhkan sebagai salinan terpisah?
- **AS-07.** Apa yang boleh diubah saat DRAFT dan setelah review? Perubahan mana wajib membatalkan review/persetujuan: soal, urutan, kunci, pembahasan, materi, judul atau jadwal? Jelaskan kebutuhan, kemudian engineering memetakan guard versinya.
- **AS-08.** Informasi apa yang perlu terlihat agar Admin memahami perbedaan DRAFT, READY, disetujui, terbit, tersedia untuk siswa, terjadwal, tutup dan arsip? Apakah diperlukan checklist alasan tertahan dan tautan perbaikannya?
- **AS-09.** Contoh alur lengkap yang kamu anggap benar: Admin mulai dari mana, mengisi apa, menekan tombol apa, dan siswa melihat apa? Berikan minimal satu contoh nyata untuk Pretest, Drill dan Tryout; tandai langkah existing yang salah.
- **AS-10.** Jika soal valid tetapi paket belum lengkap, gambar gagal, master berubah atau dua Admin menyunting bersamaan, progres apa yang harus tetap tersimpan dan di langkah mana pengguna melanjutkan?
- **AS-11.** Selain JSON/Excel dan mengedit soal existing, apakah wajib menulis soal baru dari nol langsung di halaman pengaturan Pretest/paket, atau soal baru cukup berasal dari impor?
- **AS-12.** Perubahan berlaku bagi attempt baru saat Simpan, atau disimpan sebagai draft lalu diterapkan/diterbitkan setelah lengkap dan valid? Pemilihan ini tidak mengubah versi attempt yang telah dimulai.
- **AS-13.** Drill/Tryout hanya impor untuk soal baru. Setelah impor, apakah teks, kunci dan pembahasan boleh diedit manual atau koreksi isi juga harus melalui impor ulang?
- **AS-14.** Terjawab: semua jenis yang ditanyakan dibutuhkan pada masing-masing Pretest, Drill dan Tryout, yaitu PG satu jawaban, PGK MCMA dan PGK Kategori. Tidak menetapkan campuran wajib setiap paket atau rubrik scoring yang belum diserahkan Curriculum/Data.

AS-11–AS-13 terjawab: manual dari nol khusus Pretest; edit hasil impor Drill/Tryout boleh; Simpan lengkap/valid langsung berlaku. Pertanyaan asli dipertahankan sebagai jejak diskusi, bukan diminta ulang.

### Pretest

**Alur yang telah diarahkan pemilik:** daftar bab tetap → atur Pretest → isi/edit manual atau impor → simpan draft kurang dari 20 → Simpan tepat 20 soal yang valid agar berlaku → tampil pada bab siswa yang memenuhi syarat → mulai/lanjutkan/lewati/hasil. Tindakan revisi tidak mengganti versi attempt berjalan.

- **PRE-01.** Entry point telah diklarifikasi AS-01: pengaturan per bab, bukan tambah paket bebas. Informasi bab, cakupan subbab, jumlah soal dan versi aktif/draft apa yang perlu terlihat sejak awal? Apakah perlu pintasan dari detail bab pada modul materi?
- **PRE-02.** Blueprint resmi diterima dalam bentuk apa, dari siapa, dengan nomor versi dan bukti persetujuan apa? Kuota subbab/indikator mana yang perlu dicek otomatis? Yang belum tersedia dicatat sebagai dependency Curriculum.
- **PRE-03.** Jenis soal terjawab melalui AS-14: PG/MCMA/Kategori dibutuhkan. Runtime PG-only merupakan kesenjangan terhadap target. Rubrik PGK, definisi benar/benar ekuivalen dan penerapannya pada placement Pretest tetap perlu handoff sah; dukungan jenis tidak otomatis menyelesaikannya.
- **PRE-04.** Jika siswa sudah berlatih atau pernah memilih skip sebelum Pretest tersedia, informasi dan ajakan apa yang seharusnya muncul? Kesempatan setelah skip mengikuti keputusan existing bahwa skip belum menghabiskan kesempatan; progres Drill yang sudah ada tidak diturunkan.
- **PRE-05.** Saat Pretest bab diganti, bagaimana Admin melihat dampak pada siswa belum mulai, sedang mengerjakan dan sudah selesai? Selesai sekali per bab tetap tidak direset hanya karena paket diganti.
- **PRE-06.** Informasi pemantauan apa yang dibutuhkan: siswa memenuhi syarat, mulai/selesai/skip, distribusi level awal dan alasan paket belum tersedia? Tentukan kebutuhan per subrole dan gunakan agregat untuk Content.
- **PRE-07.** Apakah batas tetap 20 soal sesuai PRD: draft boleh kurang dari 20, tetapi Pretest baru bisa dipakai siswa saat tepat 20 dan valid? Jika jumlah ingin diubah, perubahan produk dan penempatan perlu diputuskan eksplisit.
- **PRE-08.** Terjawab: ketika draft revisi Pretest menjadi 19, versi aktif lama tetap dipakai; draft baru berlaku setelah lengkap/valid. Pertanyaan asli membandingkan mempertahankan versi aktif, menghentikan akses baru atau mewajibkan pengganti saat menghapus.

### Drill

**Alur berdasarkan klarifikasi:** pilih bab/subbab/level → kelola varian → impor/edit (10 soal) → validasi/Simpan. Default awal original; retry mengutamakan kandidat yang belum pernah diselesaikan siswa, lalu pemerataan menurut attempt selesai global pada level itu dan original → varian sesuai urutan dibuat saat seri. Jika semuanya sudah diselesaikan, gunakan seluruh kandidat eligible. Periode/revisi/eligibility masih OPEN; latest/best/unlock/XP mengikuti policy sah.

- **DRL-01.** Cara membuat paket Drill yang paling praktis: per level atau menyusun lima level dalam satu pekerjaan dengan status terpisah? Ini kemudahan authoring, bukan perubahan jumlah level/soal.
- **DRL-02.** Bagaimana Admin melihat kelengkapan semua level dalam subbab: belum ada paket, draft, tertahan, aktif, atau perlu revisi? Apa tindakan dari setiap kondisi?
- **DRL-03.** AS-05 mengatur revisi versi; DRL-06–07 menambahkan varian yang dipilih sistem menurut jumlah pengerjaan. Bagaimana Admin melihat perbedaan versi, varian dan hitungan distribusi sambil mempertahankan best/latest, bintang dan unlock?
- **DRL-04.** Distribusi kesulitan/indikator pada tiap level bersumber dari dokumen mana dan siapa yang menyetujuinya? Jangan menjadikan pemetaan level ke kesulitan sebagai asumsi engineering.
- **DRL-05.** Terjawab melalui QST-07: cukup preview tampilan soal, kunci dan pembahasan; simulasi pengerjaan/scoring bukan kebutuhan scope ini. Preview tidak memengaruhi attempt/progres/XP siswa.
- **DRL-06.** Terjawab: slot bab/subbab/level tetap, dengan beberapa varian per slot. Ini menggantikan batas satu varian MVP pada rancangan berikutnya.
- **DRL-07.** Terjawab: sistem memilih paket yang lebih sedikit dikerjakan; ada default awal dan urutan tidak pasti. Definisi hitungan, scope, tie dan exposure tidak otomatis ditentukan dari prinsip tersebut.
- **DRL-08.** Terjawab: jumlah attempt selesai. Attempt mulai atau siswa unik bukan basis pengganti; mapping status selesai dan kompatibilitas hitungan masih rincian teknis.
- **DRL-09.** Terjawab: default awal selalu original. Aturan tie/perubahan eligibility tidak otomatis ditentukan dari jawaban default awal.
- **DRL-10.** Terjawab: seluruh siswa pada level itu, bukan per sekolah/kelas. Pengaruh revisi dan periode akumulasi masih OPEN.
- **DRL-11.** Terjawab: ketika jumlah attempt selesai sama, gunakan urutan prioritas tetap; DRL-13 melengkapi urutan konkret.
- **DRL-12.** Terjawab: retry mengutamakan paket yang belum pernah diselesaikan siswa; jika semua sudah diselesaikan, kembali ke pemerataan global. Seleksi berdasarkan riwayat selesai, bukan sekadar pernah mulai atau melihat.
- **DRL-13.** Terjawab: prioritas tetap original → varian sesuai urutan dibuat. Ini pemecah seri setelah preferensi retry dan pemerataan global, bukan pengaturan urutan bebas oleh Admin.

### Tryout

**Alur berdasarkan klarifikasi:** kelola master original/varian (baseline 30 soal); ketika membuat varian pilih 5 anchor terlebih dahulu → validasi/simpan → atur batch/jadwal/pembagian paket → buka batch → attempt → tutup → proses hasil/IRT → rilis nilai dan pembahasan bersama. Membuat original sendiri tidak mewajibkan pemilihan anchor awal.

- **TRY-01.** Apakah rilis fleksibel existing tetap menjadi aturan final, atau kamu mengusulkan perubahan ke jadwal tertentu? Jika berubah, jelaskan tanggal mulai aturan baru dan perlakuan paket yang sudah dijadwalkan.
- **TRY-02.** Pada model master/batch baru, bagaimana siswa melihat beberapa batch yang aktif bersamaan? Assignment paket di dalam satu batch sudah diarahkan per sekolah/kelas, bukan otomatis pilihan bebas siswa. Prioritas/fallback dan batas kesempatan masih menunggu dokumen lanjutan.
- **TRY-03.** Apakah durasi 10 menit dan periode tujuh hari kurang satu menit existing dipertahankan? Jika ada usulan perubahan, siapa pemberi persetujuan produk/akademik dan bagaimana penerapannya hanya untuk versi baru?
- **TRY-04.** Apa yang boleh dilakukan pada Tryout terjadwal yang belum dibuka: ubah waktu, batalkan, atau buat versi baru? Apa yang terjadi jika publikasi dibatalkan ketika notifikasi sudah dikirim?
- **TRY-05.** Perlukah tindakan menghentikan akses baru ketika paket aktif bermasalah? Jika perlu, siapa berwenang, alasan apa wajib, dan bagaimana attempt berjalan diselesaikan tanpa mengubah snapshot/histori?
- **TRY-06.** Apakah pengecualian existing berupa materi/kesulitan opsional tetap dipertahankan untuk Tryout? Metadata mana sekadar informasi sumber dan mana yang harus diperiksa agar lolos publikasi? Jangan meluaskan pengecualian ke Drill/Pretest.
- **TRY-07.** Pada daftar/detail, informasi apa yang diperlukan untuk membedakan jadwal paket, paket yang dipilih untuk siswa, jumlah peserta, batch tutup, proses IRT dan hasil dirilis?
- **TRY-08.** Apa yang Admin perlu lihat saat auto-submit tertunda, scoring gagal atau belum semua attempt selesai? Siapa menerima eskalasi dan tindakan aman apa yang boleh dilakukan?
- **TRY-09.** Untuk paket lampau, apakah MVP cukup menampilkan histori peserta, atau diperlukan kebutuhan baru? Akses attempt baru/pembelian paket lama tetap dipisahkan dari IRT batch lama dan memerlukan keputusan produk tersendiri.
- **TRY-10.** Terjawab: master paket original/varian terpisah dari batch; batch mengatur jadwal dan beberapa paket melalui pembagian sekolah/kelas. Detail lanjutan akan dikirim pengguna.
- **TRY-11.** Untuk dokumen lanjutan: bagaimana prioritas pembagian per kelas dan sekolah, siswa multikelas/lintas sekolah, siswa Mandiri dan perubahan membership ketika batch sudah berjalan? Tidak menetapkan fallback diam-diam.
- **TRY-12.** Untuk dokumen lanjutan: pada satu batch yang memuat beberapa paket, batas kesempatan siswa dihitung per batch atau per paket yang ditugaskan? Bagaimana pembagian dikunci saat mulai dan bagaimana revisi master memengaruhi batch yang belum/sudah dibuka?

### Anchor paket

**ENGINEERING DECISION — ralat ANC-01–02:** sebelum proses pembuatan varian, Admin memilih 5 anchor Tryout atau 3 Drill. Pretest tidak memakai anchor. Original/varian terkait memakai soal anchor yang sama; pilihan boleh berubah pada proses berikutnya. Ini menggantikan waktu/cakupan awal setelah impor/generate. Metode validasi/IRT tetap milik Data/AI.

- **ANC-01.** Lima anchor berlaku hanya Tryout, Drill/Tryout atau termasuk Pretest? Apakah dipilih dari jumlah soal paket yang sudah ditetapkan, misalnya lima dari 30 Tryout, bukan lima soal tambahan?
- **ANC-02.** Apakah anchor original dan varian harus persis sama dan dipertahankan, atau Admin boleh menentukan set berbeda? Identitas/versi soal anchor serta hubungannya perlu eksplisit sebelum menyusun validasi otomatis.
- **ANC-03.** Anchor dipilih sebelum membuat varian. Bagaimana koreksi setelah proses berjalan/selesai atau paket mempunyai attempt; siapa berwenang dan bukti apa diperlukan Data/Curriculum? Proses baru tidak menulis ulang pilihan proses lama.
- **ANC-04.** DEFERRED/OPEN — pengguna akan menjelaskan generator Admin/impor eksternal dalam dokumen lanjutan. Jangan menanyakan ulang atau memilih jalur sendiri sambil menunggu.
- **ANC-05.** Terjawab: satu varian per proses. Hipotesis beberapa hasil dengan anchor bersama/per hasil tidak menjadi kebutuhan yang disepakati.
- **ANC-06.** Terjawab: anchor bagian dari total soal; Drill 3 anchor + 7 lainnya = 10, Tryout 5 anchor + 25 lainnya = 30. Bukan soal tambahan di luar total.

ANC-01–02 di atas dipertahankan sebagai pertanyaan historis. ANC-06 melengkapi jumlah/cakupan dan hubungan per proses dengan konfirmasi total soal; jangan menetapkan 5 anchor pada Drill atau Pretest.

## 5. Tujuan, ruang lingkup dan persetujuan

**Alur keputusan:** kebutuhan dicatat → sumber dan owner ditetapkan → disepakati → dipetakan ke modul/kontrak → diimplementasikan → diverifikasi → disetujui untuk rilis.

- **F-04.** Dari seluruh modul, mana wajib final untuk target terdekat, mana boleh tetap existing dan mana ditunda? Apakah “final” mencakup seluruh tiga subrole atau asesmen lebih dahulu?
- **F-05.** Siapa pembaca dokumen: Product, Curriculum, Data/AI, frontend, backend, database, QA atau operator? Rekomendasi keluaran adalah PRD Admin disertai spesifikasi teknis tertaut.
- **F-06.** Hasil operasional apa yang menandakan Admin berhasil, misalnya membuat paket sampai tersedia untuk siswa tanpa bantuan developer? Tentukan contoh tugas yang harus selesai mandiri.
- **F-07.** Siapa yang akan mengisi tiga peran persetujuan yang masih OPEN: kebutuhan produk Admin, validitas Curriculum, dan output/mapping Data/AI? Apakah boleh memberi persetujuan dalam kanal/dokumen berbeda dengan referensi yang disimpan?
- **F-08.** Apakah ada kebutuhan baru di luar modul existing? Untuk setiap tambahan, jelaskan masalah pengguna dan prioritasnya sebelum dimasukkan sebagai scope final.

## 6. Akun Admin, login dan keamanan akses

**Baseline izin:** Super mengelola akun; Operations mengelola operasional; Content mengelola konten/asesmen/IRT/moderasi dengan tampilan struktur terbatas. Admin invitation internal dan recovery sudah tercatat; tidak ada pendaftaran Admin publik atau izin khusus per akun di baseline.

**Alur acuan:** Super undang email + pilih subrole → penerima menerima undangan dan menyiapkan login → akses sesuai assignment aktif → perubahan subrole/nonaktif diperiksa server → recovery atau eskalasi operator bila perlu.

- **ACC-01.** Terjawab: Super undang email → penerima membuat password melalui tautan → Admin login email/password, lupa password lewat email. Siswa/Guru tetap Google; tidak ada pendaftaran Admin publik.
- **ACC-02.** Terjawab: nama, email dan satu dari tiga subrole wajib; daftar akun memuat subrole, status undangan/akun dan hasil pemrosesan pengiriman. Sukses diproses bukan bukti delivery atau acceptance.
- **ACC-03.** Terjawab: Super boleh batal undangan belum diterima dan kirim ulang/pemulihan. Email Siswa/Guru ditolak dengan arahan email lain. Rincian link lama, retry dan konflik masih perlu kontrak.
- **ACC-04.** Terjawab: Super mengubah subrole/nonaktif/aktif dengan konfirmasi, alasan wajib dan histori; akses mengikuti status terbaru. Super aktif terakhir tidak boleh dinonaktifkan/demosi; konflik dan pekerjaan belum tersimpan perlu rincian.
- **ACC-05.** Terjawab: cukup autentikasi dan kontrol akses existing; belum perlu OTP/MFA atau pembatasan perangkat/sesi tambahan. Proteksi existing dan penanggung jawab pemulihan yang masih OPEN tidak berubah.
- **ACC-06.** Alur terjawab: pemulihan melalui operator teknis di luar halaman Admin, dengan alasan insiden dan audit. Penanggung jawab/orang/tim berwenang belum ditentukan; tidak mengizinkan eksekusi prosedur dari jawaban kebutuhan.

## 7. Navigasi dan Dashboard

**Alur acuan:** masuk sesuai subrole → lihat informasi sesuai izin → buka pekerjaan yang perlu ditindaklanjuti → kembali dengan filter/konteks tersimpan.

- **DASH-01.** Terjawab: semua tiga subrole aktif masuk ke Dashboard sesuai lingkupnya. Menggantikan tujuan awal lama Operations → Sekolah dan Content → konten; assignment tidak sah tetap tanpa akses.
- **DASH-02.** Terjawab pada cakupan: semua melihat agregat siswa/kelas dan pengerjaan Drill/Tryout; Operations ditambah sekolah, verifikasi Guru/token dan status jadwal/rilis batch; Content ditambah kesiapan konten/laporan/proses IRT; Super gabungan. Definisi tiap metrik masih perlu rincian.
- **DASH-03.** Terjawab: filter tanggal, sekolah, jenis asesmen dan perbandingan periode. Periode default/pembanding, timestamp acuan, atribusi siswa multisekolah dan metrik tanpa dimensi filter masih OPEN.
- **DASH-04.** Terjawab: refresh otomatis lima menit serta tombol Perbarui, dengan waktu pembaruan dan keadaan belum tersedia/gagal terpisah dari nol. Interval UI bukan janji SLA sumber data.
- **DASH-05.** Terjawab: belum perlu unduhan Dashboard dalam scope ini. Ekspor audit/modul lain diputuskan terpisah.
- **NAV-01.** Dari empat kelompok menu existing—Pemantauan, Operasional, Konten & asesmen, Administrasi—nama atau pengelompokan mana yang masih membingungkan? Sebutkan tugas yang sulit ditemukan.
- **NAV-02.** Terjawab (ADM-DEC-073): search/filter/halaman daftar tetap dan draft autosave terakhir yang sukses dapat dilanjutkan sesuai izin.

## 8. Sekolah, guru dan credential

**ENGINEERING DECISION — ADM-DEC-031–034:** sekolah diinput manual oleh Operations/Super; nama/kode wajib dan alamat opsional berdasarkan mandat pengguna. Token bisa beberapa sekaligus, dibagikan offline. Guru tanpa token tetap terdaftar namun hanya melihat pending/input token; fungsi Guru setelah verifikasi. Reissue tidak membatalkan token lama secara otomatis.

**ENGINEERING DECISION — ADM-DEC-036–040:** demo sekitar satu bulan gratis untuk semua; sekolah nonaktif menjadikan kelas baca saja, membership tetap aktif/dihitung dan benefit sekolah lain tetap ada. Guru masih melihat hasil IRT terlambat bagi attempt selesai sebelum penonaktifan. Reaktivasi otomatis bagi membership/ownership sah mengikuti ADM-DEC-045; rincian teknis historis masih OPEN. Monetisasi ditunda.

- **SCH-01.** Terjawab dengan delegasi: cukup nama, kode internal dan alamat; engineering menetapkan nama/kode wajib dan alamat opsional. Sumber, duplikasi dan koreksi data masih perlu rincian; tidak menambah NPSN/wilayah/PIC.
- **SCH-02.** Dilengkapi SCH-08–12: sekolah nonaktif menjadi baca saja dengan penanda nonaktif; membership tetap aktif/dihitung dan benefit sekolah lain tetap ada. Hasil IRT terlambat tetap boleh bagi attempt selesai sebelum nonaktif. Seluruh fitur gratis selama demo; monetisasi setelahnya ditunda.
- **SCH-03.** Terjawab: dapat menerbitkan beberapa token sekaligus dan menyerahkan offline. Guru boleh terdaftar tanpa token, dengan halaman pending/informasi/input token; fitur Guru setelah verifikasi. Single-use, satu sekolah dan 3×24 jam tetap baseline; bulk/retry/penyerahan rinci belum ditentukan.
- **SCH-04.** Terjawab: token lama yang belum dipakai tetap berlaku sampai expiry, bukan otomatis dicabut ketika reissue. Token sudah dipakai/explicit revoked tidak valid lagi; revoke dan salah penerima masih perlu rincian.
- **SCH-05.** Jika guru memilih sekolah salah, gagal verifikasi, keluar sekolah atau kembali lagi, bagaimana tiket/eskalasi operasional berjalan dan bukti apa diperlukan?
- **SCH-06.** Apa yang Content perlu lihat dalam tampilan sekolah/guru terbatas: status dan jumlah apa? Jangan memasukkan token, roster atau identitas individu ke lingkup Content.
- **SCH-07.** Terjawab: Operations/Super memasukkan sekolah manual saja.
- **SCH-08.** Terjawab untuk demo: semua fitur gratis bagi semua pengguna sekitar satu bulan ke depan; detail monetisasi/benefit setelah demo ditunda. Tidak menetapkan tanggal akhir pasti, paywall atau pelepasan batas role/verifikasi.
- **SCH-09.** Terjawab: benefit melalui sekolah B yang masih aktif tetap berlaku ketika A nonaktif. Prioritas assignment batch belum ditentukan oleh jawaban ini.
- **SCH-10.** Terjawab: membership tetap aktif dan dihitung dalam batas lima; hanya benefit/akses sekolah dibatasi. Tidak menghapus/menangguhkan membership atau otomatis mengubah menjadi Mandiri.
- **SCH-11.** Terjawab: kelas sekolah nonaktif baca saja, tanpa join/create/takeover/feedback baru; Guru membaca data historis dengan penanda nonaktif dalam kewenangannya.
- **SCH-12.** Terjawab: Guru boleh membaca hasil IRT rilis setelah sekolah nonaktif bila attempt selesai sebelum penonaktifan. Tidak membekukan mutlak semua field atau membuka aktivitas baru setelah batas.
- **SCH-13.** Terjawab: akses kelas/monitoring otomatis pulih bagi membership/ownership yang masih sah, tanpa peninjauan manual wajib. Data selama periode nonaktif, token tersisa dan kontrak transisi masih perlu rincian.

## 9. Pengguna, kelas dan membership

**ENGINEERING DECISION — ADM-DEC-041–044:** Operations/Super membaca daftar/detail pengguna/kelas dan histori sesuai field yang disepakati; cukup mengarahkan pengguna, tanpa aksi koreksi membership/ownership Admin. Content tetap struktur/agregat tanpa identitas siswa.

**Alur acuan:** cari pengguna/kelas → lihat data sesuai izin → pahami membership aktif dan historis → arahkan pengguna ke pemilik aksi domain. Ban/unban dan takeover sah tetap melalui alur Teacher.

- **PEO-01.** Terjawab: daftar Operations/Super cukup nama, email, role Siswa/Guru, status akun, verifikasi Guru dan sekolah/kelas; pencarian/filter mengikuti data tersebut. Content tetap tanpa identitas individu.
- **PEO-02.** Terjawab: detail siswa memuat semua kelas/sekolah, sekolah aktif/nonaktif, hitungan batas lima, Mandiri/School dan riwayat join/leave/ban/unban. Progres/XP tetap akun; status akun/sekolah/membership dibedakan.
- **PEO-03.** Terjawab: detail kelas Operations/Super memuat nama/sekolah/status, Guru aktif/kosong, jumlah anggota, roster aktif/mantan dan waktu join/leave. Content tetap struktur/agregat tanpa identitas siswa.
- **PEO-04.** Terjawab: cukup membaca data/histori dan mengarahkan pengguna ke alur sah; tidak memerlukan aksi koreksi membership/ownership Admin. Ban/unban tetap Guru aktif kelas.
- **PEO-05.** Bagaimana kelas tanpa guru aktif ditandai dan diarahkan ke alur takeover oleh guru terverifikasi dari sekolah sama? Perlukah daftar tindak lanjut atau catatan kasus bagi Operations?

## 10. Struktur materi dan master akademik

**ENGINEERING DECISION — ADM-DEC-014:** Content/Super mengelola bab/subbab/indikator manual berdasarkan sumber Curriculum. Bab baru otomatis memiliki slot Pretest kosong yang belum dapat dikerjakan sampai 20 soal lengkap/valid disimpan. Pembatasan entry point Pretest tidak melarang pengelolaan master materi; impor soal tetap ada.

**PROPOSED — alur untuk diperinci:** terima master Curriculum → masukkan struktur manual → validasi relasi → review/persetujuan → dipakai soal/paket → perubahan menjadi revisi atau arsip yang menjaga histori. Pemberi persetujuan akademik belum ditentukan.

- **CUR-01.** Terjawab untuk bab/subbab/indikator: Content/Super boleh mengelola berdasarkan sumber Curriculum, bukan hanya melihat struktur tetap. CUR-06 menetapkan manual saja. Lima level/subbab tetap baseline; pengelolaan kategori dan aturan produk lain belum ditetapkan ulang.
- **CUR-02.** Terjawab (ADM-DEC-071/076): metadata/induk/kode mengikuti sumber Curriculum dan representasi DTO existing; data belum lengkap tetap draft.
- **CUR-03.** Siapa menyatakan master/blueprint sah, bukti apa disimpan dan bagaimana membedakan validasi teknis dari persetujuan akademik?
- **CUR-04.** Terjawab (ADM-DEC-072): arsip ditolak sampai ketergantungan paket aktif diselesaikan; histori tetap dipertahankan.
- **CUR-05.** Terjawab: tampilkan ringkasan kesiapan Pretest, jumlah soal/paket tiap level Drill, alasan belum siap dan tautan pengaturannya. Kelengkapan bukan persetujuan Curriculum/IRT; definisi count/status perlu kontrak.
- **CUR-06.** Terjawab: master bab/subbab/indikator diinput manual saja. Ini khusus struktur; impor soal JSON/Excel tetap dibutuhkan.
- **CUR-07.** Terjawab: saat bab dibuat pada master, slot Pretest otomatis tersedia dalam keadaan kosong dan belum dapat dikerjakan siswa sampai tepat 20 soal lengkap/valid disimpan.
- **CUR-08.** Terjawab: subbab baru otomatis memiliki lima slot Drill Level 1–5 kosong; belum dapat dikerjakan sampai paket lengkap dan memenuhi syarat. Tidak membuat soal atau menerbitkan paket otomatis.

## 11. Soal per asesmen, editor, media dan review

**Alur sesuai klarifikasi pemilik:** buka Pretest/paket tujuan → impor/tulis sesuai batas per jenis → cek konten dan media → Simpan draft atau versi lengkap/valid sesuai keputusan → buat revisi bila ada perubahan penting. Review/approval masih OPEN. Katalog global baca saja dibutuhkan untuk penelusuran; authoring tetap kontekstual.

- **QST-01.** Informasi utama di daftar/detail soal dalam Pretest/paket apa: jenis PG/MCMA/Kategori, materi, level, kesulitan, status, sumber, versi dan reviewer? Filter mana berguna dalam konteks tersebut?
- **QST-02.** Terjawab: semua bagian yang ditanyakan dapat diedit, yaitu teks, rumus/LaTeX, pilihan/pernyataan, kunci, pembahasan, gambar soal/pembahasan dan pemetaan materi/kesulitan. Input baru tetap manual khusus Pretest; Drill/Tryout melalui impor. Perbandingan dengan sumber asli dan konversi jenis soal belum dirinci.
- **QST-03.** Terjawab (ADM-DEC-070): warning dan penanda baris, keputusan Admin sebelum apply; tidak auto-merge lintas paket atau memintas constraint identitas.
- **QST-04.** Untuk setiap transisi DRAFT/READY/REVISION/ARCHIVED, siapa boleh bertindak, alasan apa wajib dan apa syaratnya? READY editorial tidak otomatis berarti scoring atau paket disetujui.
- **QST-05.** Terjawab: paket tetap tersedia selama perbaikan; tidak memerlukan aksi tahan penggunaan baru ketika soal aktif terbukti salah. Attempt berjalan tetap versi lama; revisi lengkap/valid mengikuti aturan pemberlakuan dan ketergantungan batch. Triase, audit dan batas review tetap relevan; histori tidak ditimpa.
- **QST-06.** Terjawab (ADM-DEC-069): PNG/JPG/WebP, preview/penggantian/alt text; batas teknis memakai implementasi existing.
- **QST-07.** Terjawab: cukup melihat tampilan soal, kunci dan pembahasan. Tidak membutuhkan simulasi pengerjaan/scoring; preview tidak menjadi attempt siswa. Navigasi dan versi lama belum dirinci.
- **QST-08.** Terjawab: tetap perlu katalog global baca saja dengan asal jenis asesmen/paket/varian, informasi IRT dan penanda ada/tidaknya laporan masalah. Entry point input kontekstual tidak berubah; rincian IRT/laporan dilanjutkan QST-09–10.
- **QST-09.** DEFERRED/OPEN — informasi “skor IRT” katalog mengikuti dokumen Data/AI nanti. Jangan meminta ulang metrik atau menebak parameter sebelum dokumen tersedia; nilai peserta tidak otomatis menjadi parameter soal.
- **QST-10.** Terjawab: jumlah/status laporan serta tautan membuka detail dan penanganan di modul Laporan. Scope laporan per versi/relasi soal, definisi hitungan dan rincian status masih perlu dipastikan.

## 12. Impor Excel/JSON dan progres kerja

**Arah baru dari AS-02–AS-03/IMP-02–03:** buka fitur/Pretest/paket tujuan → impor JSON/Excel satu file untuk satu paket/varian → preview/pemetaan/validasi → simpan progres dan perbaiki baris bermasalah di Admin → lanjutkan → simpan perubahan sah ke konteks tujuan. Simpan lengkap/valid dan approval mengikuti keputusan terkait. Alur root dengan tujuan dipilih belakangan perlu direkonsiliasi; progres intake bukan publikasi atau konten DRAFT yang otomatis sah.

- **IMP-01.** Format sumber apa yang benar-benar diterima tim dan siapa pembuatnya? Apakah template yang sekarang sesuai dengan berkas Curriculum yang nyata?
- **IMP-02.** Terjawab: satu file untuk satu paket/varian. Template/sheet/media, impor tambahan dan strategi mengganti/menambah isi revisi masih perlu rincian.
- **IMP-03.** Terjawab: simpan progres impor, perbaiki baris bermasalah di Admin lalu lanjutkan. Tidak otomatis melewati baris salah; paket tetap harus lengkap/valid sebelum dipakai siswa. Cara/waktu simpan dan recovery dilanjutkan IMP-05/06.
- **IMP-04.** Bagaimana pemetaan materi diperbaiki: per soal, massal atau dari tujuan? Saat tujuan berubah, nilai otomatis dihitung ulang tetapi pilihan manual dan sumber asli perlu diperlakukan bagaimana?
- **IMP-05.** Terjawab: autosave progres/draft + tombol Simpan. Autosave tidak memberlakukan revisi; Simpan lengkap/valid mengikuti ADM-DEC-006. Interval dan rincian recovery masih perlu spesifikasi.
- **IMP-06.** Bagaimana pengguna melanjutkan setelah refresh, upload gambar gagal, koneksi putus, retry draft atau konflik edit? Sistem harus menghindari paket/soal duplikat akibat retry.
- **IMP-07.** Sumber dan riwayat apa yang perlu terlihat: file asli, waktu, pelaku, baris asal, koreksi pemetaan, versi template dan paket hasil? Siapa berhak mengaksesnya dan berapa lama disimpan?
- **IMP-08.** Terjawab: saat impor ke konteks yang sudah berisi soal, Admin memilih Tambahkan atau Ganti isi dengan preview dampak pada revisi. Validasi jumlah, kelengkapan dan versi tetap berlaku; bukan overwrite histori.

## 13. Generator AI dan handoff Data

**Alur existing untuk dievaluasi:** pilih tujuan dan sumber sah → minta generate → pantau → preview hasil/download JSON → intake → validasi/review → DRAFT → approval/publikasi terpisah. Jika generator dipertahankan pada scope final, entry point dan penyimpanan soal harus konsisten dengan konteks tujuan AS-03. Status wajib/tidaknya generator belum diputuskan. Hasil generate bukan ORIGINAL baru atau persetujuan akademik.

- **GEN-01.** Ralat pemilik menetapkan anchor sebelum membuat varian. Detail generator, entry point, gate sumber/approval dan cara hasil memasuki master/impor masih ANC-04/dokumen lanjutan; apakah membuat varian, menyusun paket atau keduanya?
- **GEN-02.** Input apa yang boleh dipilih Admin: sumber, jenis asesmen, scope dan kesulitan? Mana yang berasal dari konfigurasi Data/Curriculum dan hanya boleh dibaca?
- **GEN-03.** Apakah hasil otomatis membuka preview impor pada konteks paket tujuan, atau perlu pemeriksaan kandidat dahulu? Mana yang wajib bisa diunduh/disimpan tanpa dianggap sudah terbit?
- **GEN-04.** Jika hasil kurang, kandidat ditolak, proses timeout atau retry, apa pilihan pengguna dan siapa menerima eskalasi? Jangan mengisi kekurangan dengan sumber/approval fiktif.
- **GEN-05.** Bukti lineage, versi generator/model, sumber, approval dan validasi apa yang dibutuhkan reviewer? Siapa memutuskan hasil layak akademik dan kapan boleh digunakan?

## 14. IRT, batch dan rilis hasil Tryout

**Batas ownership:** Data/AI menetapkan metode, threshold, kontrak output, mapping dan bukti ilmiah. Numora mengatur attempt/batch, snapshot input, request, validasi/adopsi dan publikasi yang sah. UI tidak memberikan force release atau editor formula.

**Alur acuan:** batch tutup → input dibekukan → request ke compute → pantau/retry sah → validasi/adopsi → cakupan hasil peserta lengkap → finalisasi → nilai dan pembahasan dirilis bersama → notifikasi/riwayat tersedia. Compute berhasil dan artefak diadopsi belum berarti hasil peserta terbit.

- **IRT-01.** Langkah mana otomatis dan mana butuh tindakan Admin: prepare, mulai compute, retry, adopsi dan publikasi? Aksi siapa yang harus dicatat, dengan syarat dan batas apa?
- **IRT-02.** Siapa dari Data menyerahkan kontrak respondent, mapping skor, quality gate dan formula fallback; dalam dokumen/versi apa dan siapa menyetujuinya? Dependency yang belum tersedia harus tetap eksplisit.
- **IRT-03.** Informasi batch/request apa yang diperlukan untuk bertindak: waktu tutup, deadline 72 jam, peserta, input valid, status compute, alasan gagal, versi policy dan coverage hasil?
- **IRT-04.** Pada failure atau data kurang, kapan retry diizinkan dan kapan eskalasi ke Data? Apa yang terlihat bagi siswa sambil menunggu? Jangan menyamakan data belum ada dengan skor 0.
- **IRT-05.** Siapa mengesahkan readiness hasil sebelum publikasi dan bukti apa harus lengkap? Apakah publikasi otomatis setelah syarat sah terpenuhi atau ada review operasional tambahan?
- **IRT-06.** Ketika batas 72 jam tiba tanpa hasil IRT valid, bagaimana alur fallback satu batch yang sudah diputuskan Product dioperasionalkan? Formula/mapping yang belum disahkan harus dijawab Data/Product, tidak dibuat oleh Admin atau engineering.
- **IRT-07.** Bagaimana koreksi masalah setelah hasil dirilis dikomunikasikan dan ditangani tanpa menimpa hasil immutable? Siapa menyetujui kebijakan tindak lanjut jika dibutuhkan?
- **IRT-08.** Diagnostik apa cukup sebagai agregat bagi Content dan Operations, dan data individual apa benar-benar diperlukan pihak yang berwenang? Batas izin existing tidak otomatis berubah karena kebutuhan investigasi.

## 15. Video rekomendasi

**Alur acuan:** tambah tautan dan metadata → kaitkan subbab/urutan → cek kelayakan → aktifkan sesuai alur sah → siswa mendapat rekomendasi → laporan video ditangani → revisi/nonaktif tanpa menghilangkan konteks lama.

**PRD RULE — §10.1:** rekomendasi video YouTube hanya muncul saat gagal Drill, terkait subbab dan maksimal tiga rekomendasi. Jika tidak ada video relevan, hasil Drill tetap ditampilkan. Keputusan pemilik berikutnya memperinci batas konten aktif dan pengelolaannya.

**ENGINEERING DECISION — ADM-DEC-026–030:** input manual saja; satu video hanya satu subbab; maksimal tiga video aktif per subbab. Video dilaporkan tetap tampil sampai diperiksa dan boleh dinonaktifkan Admin. Cukup pemeriksaan manual/laporan siswa, tanpa pemeriksaan otomatis berkala. Urutan tampil, metadata dan aktivasi tetap perlu rincian.

- **VID-01.** Terjawab (ADM-DEC-066/076): judul, URL YouTube dan subbab cukup; atribut memakai kontrak existing tanpa penambahan deskripsi wajib.
- **VID-02.** Terjawab: maksimal tiga video aktif per subbab. Tidak membutuhkan pemilihan dari pool aktif yang lebih besar atau rotasi sistem; urutan di antara ketiganya belum ditentukan. Jika tidak ada video relevan, hasil Drill tetap tersedia sesuai PRD.
- **VID-03.** Terjawab: video tetap tampil sampai diperiksa; Admin boleh menonaktifkan. Koreksi/penggantian setelah pemeriksaan mengikuti pengelolaan konten; bukti snapshot dan aktivasi ulang belum dirinci.
- **VID-04.** Terjawab: cukup pemeriksaan manual Admin dan laporan siswa; tidak membutuhkan pemeriksaan otomatis berkala pada scope ini.
- **VID-05.** Terjawab: input video manual saja. Impor file video tidak dibutuhkan dan tidak mengubah kebutuhan impor soal.
- **VID-06.** Terjawab: satu video hanya untuk satu subbab. Identitas/normalisasi URL, duplikasi dan koreksi pemetaan masih perlu rincian.
- **VID-07.** Terjawab (ADM-DEC-067): urutan otomatis mengikuti video ditambahkan; bukan pengurutan manual.

## 16. Laporan soal/video dan moderasi

**ENGINEERING DECISION — ADM-DEC-021–025:** laporan soal/versi sama digabung menjadi satu kasus dengan daftar laporan terkait; Content/Super menangani tanpa assignment. Alur Baru → Ditinjau → Selesai/Ditolak, dengan alasan penutupan wajib dan tautan revisi bila ada perbaikan. Paket tetap tersedia selama diperbaiki; siswa cukup menerima konfirmasi terkirim. Histori dan audit tetap dipertahankan.

- **RPT-01.** Terjawab: gabungkan laporan soal/versi sama menjadi satu kasus dengan daftar laporan terkait; jumlah laporan asli tetap ditelusuri. Kategori, urgensi, filter, laporan baru setelah penutupan dan perlakuan video masih perlu rincian.
- **RPT-02.** Terjawab: tanpa assignment; Content/Super boleh menangani. Catatan internal, konflik perubahan dan tenggat belum ditentukan; bedakan target operasional dari SLA produk yang disepakati.
- **RPT-03.** Bukti apa cukup untuk investigasi: versi soal saat attempt, kunci/pembahasan, snapshot video dan alasan siswa? Data pribadi/jawaban individual tidak otomatis dibuka ke Content.
- **RPT-04.** Terjawab: alur Baru → Ditinjau → Selesai/Ditolak sesuai, dengan alasan penutupan wajib dan tautan revisi jika ada perbaikan. Syarat penutupan rinci, reopen, propagasi status dan laporan baru setelah penutupan belum dirinci; perbaikan tidak diasumsikan otomatis menutup kasus.
- **RPT-05.** Terjawab: cukup konfirmasi laporan terkirim. Tidak menambahkan notifikasi hasil penyelesaian atau dashboard tiket siswa dari keputusan ini.
- **RPT-06.** Terjawab (ADM-DEC-068): laporan baru untuk soal/versi sama membuka kembali kasus lama menjadi Baru, tanpa menghapus histori penutupan.

## 17. Audit, ekspor dan penanganan insiden

**Alur acuan:** aksi penting terjadi → actor/target/waktu/alasan/versi tercatat → pembaca berwenang mencari sesuai domain → investigasi → tindak lanjut terpisah. Audit tidak menjadi editor sejarah.

- **AUD-01.** Terjawab: pelaku, waktu, modul/objek, tindakan, sebelum/sesudah, alasan dan berhasil/gagal; filter pelaku/modul/tanggal. Super seluruh lingkup, Operations/Content per domain, dengan redaksi rahasia dan batas identitas existing. Cakupan event/detail payload masih perlu kontrak.
- **AUD-02.** Terjawab: diperiksa saat ada masalah; belum perlu jadwal rutin. Tidak menetapkan orang/tim atau SLA baru.
- **AUD-03.** Terjawab: unduhan histori aktivitas belum diperlukan untuk versi ini. Histori tetap dibaca/filter sesuai izin; retensi tidak diputuskan oleh jawaban ini.
- **AUD-04.** Terjawab: telusuri masalah/histori → teruskan melalui kanal tim existing kepada pihak teknis/Curriculum/Data sesuai kasus → penanganan dicatat sesuai kewenangan. Tanpa modul tiket insiden baru.

## 18. Perilaku lintas halaman dan operasi sistem

**Alur acuan:** pengguna melakukan tindakan → server memvalidasi/menyimpan → UI mengakui hasil → jika gagal/konflik pengguna melihat status aktual dan dapat melanjutkan dengan aman.

- **SYS-01.** Terjawab (ADM-DEC-074): laptop utama; seluruh fungsi tetap dapat digunakan di ponsel.
- **SYS-02.** Apa yang harus terjadi jika login habis, subrole berubah atau akses dicabut ketika form/draft terbuka? Data sensitif tidak boleh tertinggal pada sesi yang kehilangan izin.
- **SYS-03.** Tindakan massal apa yang benar-benar dibutuhkan dan mana cukup satu per satu? Untuk setiap bulk action, tentukan preview dampak, kegagalan sebagian dan audit tanpa memperluas izin domain.
- **SYS-04.** Terjawab (ADM-DEC-075): status proses, modul dan Dashboard cukup; tanpa pusat notifikasi Admin baru.
- **SYS-05.** Target volume kerja dan waktu tunggu yang dapat diterima apa: jumlah soal/file, paket, pengguna, sekolah dan request generator? Engineering menyusun target/validasi teknis dari kebutuhan ini, bukan mengklaim SLO produksi dari tes lokal.
- **SYS-06.** Siapa menetapkan retensi file asli, media tidak tertaut, draft, audit dan data pribadi? Pengarsipan tidak sama dengan penghapusan; histori akademik tidak dihapus lewat keputusan pembersihan UI.
- **SYS-07.** Terjawab: deteksi konflik saat simpan, informasikan perubahan Admin lain, pertahankan salinan edit belum tersimpan dan bantu memuat versi terbaru sebelum melanjutkan. Cakupan autosave dan bentuk pembanding/merge perlu kontrak.

## 19. Penerimaan, migrasi dan batas versi final

**Bagian ini mengumpulkan kebutuhan penerimaan; belum menjalankan workflow QA atau mengubah aplikasi.**

- **UAT-01.** Siapa reviewer dan pengguna penerimaan untuk tiap subrole, termasuk pemeriksa alur Admin → siswa/guru? Siapa menyatakan dokumen final dan siapa menyatakan implementasi siap rilis?
- **UAT-02.** Contoh data akademik resmi apa yang digunakan untuk acceptance Pretest, lima level Drill dan Tryout; siapa memberi izin serta bukti blueprint/rubric-nya?
- **UAT-03.** Perjalanan minimum apa yang wajib lulus: membuat paket sampai siswa bisa mulai, resume, submit, histori dan rilis hasil? Sertakan direct access yang harus ditolak, konflik edit, retry dan pergantian paket.
- **UAT-04.** Data/fitur lama apa yang perlu migrasi atau kompatibilitas: paket legacy, draft impor, link lama, policy pin dan jadwal aktif? Siapa meninjau rencana dan bukti bahwa histori tetap utuh?
- **UAT-05.** Bila Curriculum/Data atau penerimaan layanan nyata belum siap, bagian mana boleh difinalkan sebagai spesifikasi dengan dependency OPEN dan mana harus menjadi penghalang aktivasi? Status dokumen final tidak otomatis berarti fitur siap produksi.

## 20. Format pencatatan keputusan berikutnya

**PROPOSED — satu record per keputusan:**

| Kolom | Isi |
| --- | --- |
| ID | Contoh `ADM-DEC-001`, menautkan ID pertanyaan. |
| Masalah dan contoh | Perilaku saat ini, perilaku yang diinginkan dan kasus konkret. |
| Status | OPEN / PROPOSED / APPROVED / SUPERSEDED. APPROVED hanya setelah ada persetujuan eksplisit pihak berwenang. |
| Klasifikasi | PRD RULE atau ENGINEERING DECISION jika sudah sah; selain itu PROPOSED/OPEN. |
| Cakupan | Subrole, jenis asesmen, versi baru/legacy/attempt berjalan/histori. |
| Aturan dan alur | Pemicu, prasyarat, langkah, hasil akhir dan larangan. |
| Izin | Siapa melihat/membuat/mengubah/review/menyetujui/mempublikasikan. |
| State dan kegagalan | Transisi, kondisi tertahan, stale edit, retry dan idempotensi. |
| Dampak | UI, API, data/migrasi, audit, event/notifikasi dan dependency. |
| Bukti keputusan | Pemberi persetujuan, tanggal dan referensi sumber; tidak mengarang identitas atau waktu persetujuan. |
| Acceptance | Contoh Given/When/Then serta apa yang harus ditolak dan apa yang wajib dipertahankan. |

## 21. Rancangan keluaran setelah jawaban disepakati

**PROPOSED — dua dokumen tertaut:**

1. **PRD khusus Admin:** tujuan/scope, aktor dan matriks hak, kebutuhan per modul, alur lintas modul, aturan/state, acceptance criteria, dependency dan daftar yang di luar scope. Ini acuan perilaku yang disepakati.
2. **Spesifikasi teknis Admin:** peta route/layar, endpoint dan kontrak shared/generated, authorization, model/versi data, transaksi/idempotensi, state machine, error, job/outbox, audit, compatibility/migrasi dan pemetaan acceptance ke verifikasi. Gunakan kontrak/code existing yang relevan; jangan membuat API/schema final berdasarkan jawaban yang belum ada.

Saat keputusan mengubah aturan existing, perbarui sumber keputusan/spec terlebih dahulu lalu PRODUCT_CONTEXT, OPEN_DECISIONS dan PRD_MAPPING sesuai disiplin repo. ADR hanya diperbarui bila ada perubahan arsitektur. Dokumen discovery ini tetap menjadi jejak pertanyaan/jawaban, bukan sumber aturan tandingan.

**Status akhir discovery, 10 November:** sepuluh jawaban terakhir dicatat sebagai ADM-DEC-066–075; instruksi penggunaan atribut existing sebagai ADM-DEC-076. Tidak ada pertanyaan aktif. [PRD Admin](ADMIN_PRD.md) dan [Spesifikasi Teknis Admin](../architecture/ADMIN_TECHNICAL_SPEC.md) menjadi keluaran yang dapat digunakan tim. Dependency substantif dirangkum pada PRD §17; bukan daftar atribut yang harus dijawab pengguna.

**Handoff:** implementasi mengikuti PRD, kontrak dan gap teknis yang tercatat. ANC-04/QST-09 tetap menunggu dokumen lanjutan; konflik distribusi Drill/konten invalid, penyerahan ilmiah dan penanggung jawab belum disamarkan sebagai keputusan selesai. Tidak membuka ulang pembahasan monetisasi atau atribut rutin. Anchor setelah impor/generate merupakan keterangan lama yang sudah diralat.
