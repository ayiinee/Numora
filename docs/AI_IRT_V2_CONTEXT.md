# Konteks arsitektur varian dan IRT v2

**Pembaruan pemilik — 10 November 2026:** baca
[rekonsiliasi delivery Admin dan strategi 24 jam](TRYOUT_IRT_DELIVERY_CONTEXT.md).
Target terdekat: IRT Tryout multi-arm dan integrasi main, dengan IRT diutamakan
serta fallback per arm diizinkan. Self-adjustment ditunda; uji total tiga jam.
Anchor dipin per proses/pasangan sebelum generate, sedangkan runtime bersama
masih membutuhkan lima versi identik lintas arm. Alokasi sekolah/kelas dan
approval yang OPEN pada sumber Admin tetap dependency. Urutan tindak lanjut
lama di bawah bukan jadwal target 24 jam dan bukan klaim semua mesin belum ada.

**ENGINEERING DECISION — perubahan produk/arsitektur disetujui pemilik, 8 November 2026.** Dokumen ini mencatat rancangan target yang menggantikan kebijakan lama pada bagian yang bertentangan. Ini bukan laporan implementasi atau pengesahan statistik. PRD v0.6 dan keputusan lain tetap berlaku di luar perubahan yang disebutkan di sini.

Salinan dokumen ini dipelihara identik di repo Numora dan Numora-ai-service. Perubahan berikutnya harus diselaraskan pada keduanya. Pembaruan ini hanya dokumentasi; tidak mengubah kode, kontrak executable, migrasi, database, konfigurasi deployment, atau hasil siswa.

## Sumber dan pengesahan

- Sumber pemilik: [DOCX rancangan v2.0](sources/Numora_Rancangan_Arsitektur_AI_IRT_v2_0_Draft.docx), bertanggal 31 Oktober 2026, tetap disimpan utuh dengan label Draft aslinya.
- [Ekstraksi teks sumber](sources/Numora_Rancangan_Arsitektur_AI_IRT_v2_0_Draft.docx.txt) mempertahankan urutan paragraf dan baris tabel; format visual tetap mengacu ke DOCX. Ada 157 blok body dan 21 tabel, tanpa gambar atau persamaan OMML.
- SHA256 DOCX: `3A3806E3FAA979D058CF558F3CA3CA3F5C5B74EAA136BB38D35C7C82E1E8441E`.
- Baseline audit Numora: `43787398dcf40ca13ebbeb2d80a85e31b39a6a16`.
- Baseline audit Numora-ai-service: `22aeafb9beb166b69658f4a1c65f609f0fdb6c5b`.
- Dalam percakapan 8 November 2026, pemilik menjawab “aku setuju semuanya” atas delapan rekomendasi rekonsiliasi. Nomor 3 kemudian dijelaskan melalui contoh Rani dan disetujui eksplisit: “Setuju: retry baru memakai V2 (Rekomendasi)”.
- Pada klarifikasi berikutnya di tanggal yang sama, pemilik menyetujui rekomendasi kebijakan operasional nomor 1–5 dan 9–12; menetapkan pengecualian exposure lintas fitur untuk beta Drill (nomor 6); dan menetapkan 3 anchor Drill serta 5 anchor Tryout (nomor 8).
- Pemilik kemudian menutup nomor 7: kasus A dijawab “Boleh sementara pindah ke original”; kasus B dijawab “Setuju: siswa lama bukan peserta fresh”. Jadi saat arm varian dihentikan tanpa pengganti siap, original dapat menjadi fallback distribusi sementara; eksperimen baru tidak menghapus riwayat Drill. Ini pengecualian eksplisit terhadap konsistensi arm saat paket tidak tersedia, bukan perubahan soal di tengah attempt.
- Persetujuan pemilik ini menetapkan arah dan kebijakan di bawah; tidak mengklaim review lintas tim, validasi Curriculum atas setiap item, penerapan ke production, atau kesiapan integrasi telah selesai.

## Delapan keputusan pemilik

| No. | Keputusan yang disetujui | Batas penerapan |
|---|---|---|
| 1 | V2 menjadi acuan target dan menggantikan kebijakan lama yang bertentangan. | Aturan lama disimpan sebagai sejarah. Parameter statistik yang belum disahkan tetap OPEN. |
| 2 | A/B Drill sejak awal adalah pembelajaran reguler: nilai, XP, bintang, dan unlock mengikuti kebijakan produk yang berlaku. | Konten harus disetujui Curriculum sebelum disajikan. Provisional psikometrik tidak berarti bebas dari validasi konten. |
| 3 | Sesi berjalan tetap memakai versi paket awal; retry baru setelah pergantian memakai versi aktif terbaru dalam arm yang sama selama eksperimen tersebut berlaku. | Pengecualian nomor 7: bila arm varian dihentikan dan pengganti belum siap, start/retry baru boleh memakai original sementara. Simpan assignment dan paket aktual secara terpisah; retry tetap bukan evidence utama baru. |
| 4 | Fallback Tryout berlaku per paket/arm yang belum layak; nilai dan pembahasan diterbitkan maksimal 72 jam setelah batch tutup. | Catat mode dan versi kebijakan; jangan menyatakan nilai antarpaket setara tanpa linking tervalidasi. Menggantikan fallback seluruh batch. |
| 5 | Nilai fallback Tryout = 100 × poin diperoleh / poin maksimum, memakai bobot PG=2, MCMA=3, Kategori=3 serta rubrik parsial yang disahkan. | Definisi operasional kontribusi poin, soal invalid, pembulatan, dan kasus maksimum nol harus dipin dalam policy sebelum implementasi. Mapping theta ke nilai tetap OPEN. |
| 6 | Hapus ranking/percentile berdasarkan nilai Tryout dari hasil siswa. | Kontribusi XP Tryout ke leaderboard aktivitas kelas/global tetap berlaku. PvP tidak berubah. |
| 7 | DRIFT tidak mengubah otomatis nilai, XP, bintang, atau unlock historis. | Hentikan distribusi baru versi bermasalah. Kompensasi, bila diperlukan, harus diputuskan eksplisit dan dicatat sebagai tambahan yang dapat diaudit. |
| 8 | Pada tahap awal, tiap output generator, termasuk setelah adjustment, diperiksa manusia sebelum disajikan. | Otomatisasi validasi hanya setelah ada policy dan batas yang disetujui Curriculum. Lolos validator generator bukan approval Curriculum atau PASS IRT. |

### Contoh retry yang disetujui

Rani mendapat arm B/varian pada level tertentu. Attempt pertamanya dipin ke paket V1. Setelah V1 terbukti DRIFT material, paket pengganti V2 dibuat, divalidasi, direview, lalu diaktifkan secara terkendali.

1. Jika Rani masih mengerjakan V1 saat pergantian, attempt itu tetap V1 sampai selesai; jangan mengganti soal di tengah sesi.
2. Jika Rani memulai retry setelah pergantian, pilih V2 dalam arm B yang sama. Jangan mengacak ulang ke original hanya karena refresh atau retry.
3. Hasil V1 tetap merujuk versi konten/rubrik/paket yang dikerjakan. XP dan unlock yang sudah diberikan tidak ditarik otomatis.
4. Retry Rani bukan evidence utama baru, meskipun V2 memakai seed berbeda. Paparan keluarga lintas modul tetap diperiksa.

Pengecualian insiden konten yang mengharuskan penghentian sesi perlu prosedur eksplisit; bukan izin untuk menukar item diam-diam. Bila V2 belum siap setelah V1 dihentikan, nomor 7 mengizinkan start/retry baru memakai original sementara. Pergantian eksperimen tidak membuat siswa lama menjadi peserta fresh; detail kontrak lifecycle tetap perlu implementasi.

## Klarifikasi dua belas kebijakan operasional

**ENGINEERING DECISION — pemilik, 8 November 2026.** Bagian ini mengubah target kebijakan sesuai jawaban terbaru dan menggantikan bagian rancangan sumber maupun daftar OPEN lama yang bertentangan. Persetujuan arah/metode bukan pengesahan threshold statistik, validasi akademik tiap soal, atau bukti implementasi.

| No. | Keputusan terbaru | Detail yang tetap perlu diselesaikan |
|---|---|---|
| 1 | Arah rubrik Drill memakai prinsip per keputusan seperti Tryout: PG benar/nol; MCMA ketepatan memilih opsi benar dan tidak memilih opsi salah; Kategori ketepatan per pernyataan; kosong nol. Simpan kategori integer sebelum konversi poin produk untuk GPCM. | Review akademik Curriculum atas rubrik Drill dan pengujian kecocokan kategori untuk GPCM tetap diperlukan. Rubrik Tryout existing telah disetujui 7 Oktober; tidak dibuka ulang sebagai seluruhnya OPEN. |
| 2 | Aritmetika desimal dan aturan rounding eksplisit; pertahankan poin Tryout existing dua desimal; agregasi dari poin tersimpan; mastery/bintang ditentukan sebelum rounding tampilan; tampilkan dua desimal atau presisi tambahan pada batas. | Half/tie rounding serta representasi kontrak perlu dipatok. XP tetap mengikuti policy attempt, termasuk perbedaan legacy dan jalur PGK; tidak ada perubahan/backfill XP. |
| 3 | Soal salah konten/kunci dikeluarkan dari pembilang dan penyebut nilai yang belum diterbitkan melalui keputusan insiden tercatat. Soal yang benar akademik tetapi gagal kelayakan IRT tetap dapat berkontribusi ke fallback. Error teknis bukan jawaban salah. Maksimum valid nol menghasilkan UNSCORABLE, bukan nilai nol. | Curriculum menetapkan cakupan minimum paket setelah exclusion. Insiden setelah publikasi mengikuti koreksi/kompensasi terpisah tanpa menulis ulang histori. |
| 4 | Beta menerbitkan hasil dan pembahasan serentak pada satu waktu rilis per batch, maksimal 72 jam setelah tutup. Paket/arm yang layak memakai IRT; lainnya fallback rubrik. Mode, policy dan alasan disimpan. | Waktu rilis tepatnya dan cutoff operasional perlu dikonfigurasi sebelum batch; terminal UNSCORABLE tidak boleh dipaksa menjadi nilai nol. Late IRT tidak menimpa hasil final. |
| 5 | First valid berasal dari assignment resmi, versi dipin, penyelesaian manual/auto-submit sah, dan respons server terverifikasi. Nilai rendah/kosong/gagal mastery tidak membatalkan attempt. Reconnect/resume tetap attempt yang sama. | Prosedur pembatalan teknis/penggantian dan evidence audit perlu kontrak. Pergantian seed/config/eksperimen tidak otomatis mereset kesempatan evidence utama. |
| 6 | **Pengecualian beta Drill:** paparan keluarga sebelumnya dari fitur lain, termasuk Pretest/PvP, diperbolehkan dan tidak menjadi exclusion otomatis dari evidence utama Drill. Tetap simpan provenance exposure. Retry Drill tetap bukan evidence utama baru. | Jangan melabeli respons terpapar sebagai fresh. Keseimbangan exposure/anchor dan quality gate tetap diperiksa; izin produk bukan bukti tidak ada bias. Kebijakan Tryout tidak dilonggarkan oleh pengecualian ini. |
| 7 | **DISETUJUI:** saat arm varian dihentikan dan pengganti belum siap, start/retry baru boleh sementara memakai original yang valid/aktif. Eksperimen baru menerima siswa baru sesuai policy; siswa lama boleh belajar/retry tetapi bukan peserta fresh karena ID eksperimen/seed berubah. | Catat assigned arm, paket/arm aktual, alasan dan periode fallback; pin setiap sesi. Respons crossover tidak boleh disamarkan menjadi original hasil randomisasi atau varian. Setelah pengganti aktif, start/retry berikutnya kembali mengikuti arm asal; sesi original yang sudah berjalan tetap original. |
| 8 | Komposisi beta memakai **3 anchor + 7 focal pada Drill (10 soal)** dan **5 anchor + 25 focal pada Tryout (30 soal)**. Common anchor identik antararm, keluarga berbeda dari focal. | Curriculum memilih anchor/blueprint; Data memvalidasi kestabilan, coverage dan linking pada jumlah tersebut. Jika tidak layak, tahan klaim IRT, jangan menambah anchor atau menyatakan cukup otomatis. |
| 9 | Kecukupan data berbasis ketelitian dan keterwakilan; jumlah peserta hanya checkpoint yang ditentukan sebelum analisis. Simulasi mempertimbangkan tipe item, kemampuan, missingness, exposure, ketimpangan arm dan kategori langka. | Angka minimum/precision/fit dan jadwal checkpoint tetap perlu simulasi/policy. Tidak memilih ulang subset/model demi mendapatkan PASS. |
| 10 | PASS memerlukan dukungan kesetaraan dalam batas akademik dan seluruh gate mutu; DRIFT memerlukan bukti perbedaan material. Hasil tidak meyakinkan = INSUFFICIENT; skala/linking gagal = NOT_COMPARABLE; masalah konten/scoring/model = ANOMALY. | Toleransi a/b/kurva/kategori, uncertainty serta pengendalian keputusan berulang/banyak perbandingan belum bernilai produksi. Tidak signifikan saja bukan PASS. |
| 11 | Metode nilai IRT adalah prediksi poin pada satu paket acuan yang dibekukan per batch, dinormalisasi ke 0–100. Semua arm memakai acuan yang sama setelah linking lolos; bukan min–max atau percentile peserta. Benar semua tidak otomatis nilai IRT tepat 100. | Paket acuan, estimator/prior konsisten untuk respons ekstrem, rumus/versi mapping dan validasinya masih perlu spesifikasi. Bila mapping belum layak, gunakan fallback; jangan menamai nilai rubrik sebagai IRT. |
| 12 | Adjustment hanya DRIFT material, dengan kontrol/bounds per generator yang disahkan serta budget kandidat/evidence/waktu dan stop rule sebelum berjalan. Setiap output awal direview manusia. Tanpa kontrol/kandidat/budget, berhenti dan eskalasi; versi bermasalah tidak menerima distribusi baru. | Daftar kontrol, angka budget, standar reusable config dan policy insiden/kompensasi rinci tetap perlu review. Stok konseptual diganti lewat review stok, bukan kontrol angka palsu. |

### Contoh kebijakan nomor tujuh yang disetujui

**Kasus A:** Rani ditetapkan arm B/varian pada suatu level. V1 dihentikan dan V2 belum lolos review. Pemilik mengizinkan Rani memulai attempt pada paket original sementara. Catat assignment asal B, paket/arm yang benar-benar diterima, versi paket, alasan varian tidak tersedia, dan status fallback distribusi. Original pengganti harus memiliki approval konten dan status distribusi yang sah; ini bukan izin melewati gate konten.

Jika V2 aktif ketika Rani masih mengerjakan original fallback, ia menyelesaikan sesi original itu. Start/retry setelahnya mengikuti kembali assignment B dan memakai V2. Assignment randomisasi tidak ditimpa seolah-olah Rani sejak awal mendapat A. Fallback distribusi adalah perilaku belajar sementara, berbeda dari fallback **nilai** Tryout.

Konsekuensi untuk analisis: pisahkan respons crossover dari perbandingan utama yang mensyaratkan delivered arm sesuai assignment. Tetap simpan dan laporkan assignment/penyimpangan untuk audit randomisasi; jangan menghilangkannya dari laporan alokasi atau menganggapnya peserta original acak. Jika ini attempt valid pertama Rani, attempt berikutnya tetap retry, bukan kesempatan fresh baru. Metode analisis penyimpangan dan pelaporan attrition perlu dipin sebelum eksperimen.

**Kasus B:** eksperimen baru dimulai pada level yang sama dengan config/seed baru. Siswa baru dapat dialokasikan sesuai policy; Rani yang telah mengerjakan level itu tetap boleh belajar/retry, tetapi bukan peserta fresh. Riwayat first valid, retry dan exposure tidak direset oleh ID eksperimen. Izin paparan lintas fitur untuk beta Drill tidak mengubah aturan ini.

## Struktur dan kepemilikan

Struktur akademik target adalah **Bab → Indikator → Level → Soal**. Paket adalah susunan item berversi untuk distribusi/eksperimen, bukan pengganti indikator. Bank Drill lokal Paket 1 memiliki 23 indikator, masing-masing 5 level × 10 soal.

Numora masih menggunakan entitas chapter/subchapter/level dan relasi kompetensi. Mapping indikator ke ID canonical dan blueprint harus eksplisit, mempertahankan ID dan referensi historis; dokumen ini tidak memerintahkan rename atau penghapusan entitas database.

| Pihak | Tanggung jawab target |
|---|---|
| Curriculum/Research | Blueprint, label level/target kesulitan akademik, rubrik, kunci, pembahasan, validasi konten sebelum distribusi. |
| Data/AI | Generator, desain eksperimen dan eligibility ilmiah, kalibrasi, linking, quality gate, evaluasi kesetaraan, adjustment terbatas dan bukti reusable config. |
| Product/Admin | Paket/batch aktif, kebijakan nilai, fairness, kompensasi dan penerimaan scope. |
| Software/QA | Assignment, versioning, exposure/snapshot, integrasi, otorisasi, persistence, penerbitan hasil dan pengujian end-to-end. |

Numora tetap memiliki canonical content, lifecycle assessment, raw scoring, XP, progres, approvals dan publikasi; service AI memiliki komputasi serta artifact/evidence compute. Migrasi kedua namespace tetap hanya melalui repo Numora. Pemisahan runtime/schema dan prinsip immutable artifact pada ADR-011 tetap berlaku.

## Model IRT dan eligibility

| Konteks | Scale ID target | Tujuan |
|---|---|---|
| Level | `L:{chapter_id}:{indicator_id}:{level_id}` | Mutu original/anchor serta kesetaraan varian pada level tersebut. |
| Indikator | `I:{chapter_id}:{indicator_id}` | Analisis urutan kesulitan L1–L5 pada respons yang terhubung dan cakupan memadai. |
| Bab | `C:{chapter_id}` | Estimasi kemampuan bab, SE/interval dan tren pada skala longitudinal yang tertaut. |

Ketiganya diestimasi terpisah; jangan merata-ratakan theta Level menjadi theta Indikator/Bab. Simpan estimasi per **item_version × model_context × calibration_version**. PG memakai **2PL**; PGK multi-select/kategori memakai **GPCM**, satu soal sebagai satu unit psikometrik. Kategori ordinal GPCM dan bobot poin produk adalah konsep berbeda. Perubahan konten, stimulus, kunci atau rubrik menghasilkan versi baru.

IRT tidak memindahkan label level Curriculum secara otomatis. Tren bab hanya dapat dibandingkan bila linking, invariance, coverage dan precision mendukung. Theta bab tidak otomatis menjadi prior personal Tryout. Pretest placement tetap mengikuti kebijakan produk yang berlaku; rancangan ini tidak menggantinya dengan IRT.

Evidence utama Drill adalah attempt pertama yang valid per siswa per level; Tryout per siswa per batch. Retry bukan responden independen. Periksa dan catat paparan **keluarga** soal melalui Pretest, Drill, Tryout, PvP dan pembahasan; first attempt saja tidak menjamin fresh. **Dalam beta Drill, paparan dari fitur lain seperti Pretest/PvP diperbolehkan dan tidak otomatis menggugurkan eligibility.** Status terpapar tetap disimpan, bukan dianggap fresh. Pengecualian ini tidak membolehkan retry Drill menjadi evidence utama baru dan tidak mengubah eligibility Tryout. Perubahan seed/versi tidak menghapus riwayat paparan keluarga.

Snapshot minimum mencakup versi item/rubrik/paket/config, family ID, arm, timestamp, score/max score, exposure state, attempt index, alasan eligibility dan scoring policy version. First valid mengikuti keputusan operasional nomor 5; prosedur teknis invalidasi/exclusion, window dan cutoff harus dipatok dalam policy. Jangan memilih ulang attempt secara ad hoc agar data terlihat cukup. Laporkan komposisi paparan per arm; izin menerima paparan lintas fitur pada beta tidak menghilangkan kebutuhan memeriksa kualitas dan keterbandingan data.

Quality gate mencakup eligible per item/arm, keseimbangan alokasi, reach/coverage, profil awal, linking, convergence, SE, fit, DIF/invariance, local dependence, dimensi dan perubahan kemampuan selama belajar. X respons, 2%/70% reach, serta jumlah anchor contoh bukan threshold validitas produksi.

## Drill dan self-adjustment

- Satu paket original dan satu paket varian aktif per level, dengan randomisasi persisten A/B dan sasaran alokasi awal 1:1. Original dan varian yang lolos konten dapat disajikan sejak awal, tanpa fase pilot original terpisah.
- Jika varian dihentikan sebelum pengganti siap, start/retry baru boleh memakai original aktif sementara sesuai nomor 7. Assignment asal dan delivered package dicatat terpisah. Ini kondisi degradasi sementara, bukan perubahan target dua arm atau penggantian item di tengah attempt; crossover tidak otomatis menjadi evidence utama A/B.
- Common anchor memakai versi identik antararm dan keluarga berbeda dari focal yang dibandingkan. **Komposisi beta disetujui: 3 anchor + 7 focal dalam 10 item.** Ini menggantikan contoh 7+3 pada DOCX. Jumlah tiga bukan jaminan kestabilan/linking; bila gate tidak layak, tahan keputusan empiris tanpa mengubah jumlah diam-diam.
- Kalibrasi original/anchor dan evaluasi kesetaraan dilakukan pada episode concurrent yang terhubung, dengan gate mutu original, anchor, serta perbandingan yang terpisah; tidak perlu baseline hasil pilot terdahulu sebagai prasyarat distribusi awal.
- **PASS:** bekukan config version khusus item/family (`FROZEN_ITEM`) dan pertahankan varian aktif. Satu PASS bukan bukti seluruh seed/family/output setara.
- **DRIFT material:** hanya parameter yang diizinkan policy boleh diubah. Buat config/item version dan seed baru, validasi dan review konten, ganti distribusi secara terkendali, lalu kumpulkan evidence baru dari siswa yang memenuhi first-valid policy. Paparan lintas fitur yang diizinkan beta tetap dicatat; jangan memakai retry sebagai evidence utama baru. Versi lama menjadi INACTIVE, tidak dihapus.
- **INSUFFICIENT:** tambah evidence tanpa adjustment. **NOT_COMPARABLE:** perbaiki linking/desain tanpa klaim kesetaraan. **ANOMALY/konten bermasalah:** quarantine dan review; jangan mengartikan semua kegagalan sebagai DRIFT.
- `VALIDATED_FOR_REUSE` memerlukan bukti lintas keluaran/kasus serta batas yang disahkan. Generate massal tetap memerlukan validasi setiap output; tidak mewarisi PASS psikometrik otomatis.
- Stok konseptual tetap finite. Jangan membuat parameter numerik palsu untuk stok; pemilihan/penggantian stok harus direview dan memiliki lineage/evidence sendiri.

`SEALED` pada snapshot teknis bukan `FROZEN_ITEM`, bukan approval Curriculum, dan bukan `VALIDATED_FOR_REUSE`. Retry transport memakai input/seed yang dipin; iterasi ilmiah akibat DRIFT membuat versi/input baru. Keduanya harus dibedakan dalam audit.

## Tryout beta dan hasil peserta

Dua batch mingguan berturut-turut, masing-masing satu original dan beberapa paket varian/config arm. Total dua original untuk beta; setiap paket tetap 30 soal. Admin dapat create/read/deactivate original, membuat varian dengan pin sumber/config/seed, memilih anchor, serta membekukan daftar paket aktif sebelum batch dimulai. **Komposisi beta disetujui: 5 common anchor + 25 focal per paket.** Ini menggantikan contoh 4–5 pada DOCX; kecukupan/stabilitas lima anchor tetap perlu gate empiris, bukan diasumsikan valid.

Satu siswa mendapat tepat satu paket melalui alokasi terkendali dalam satu batch. Keunikan attempt per paket saja tidak cukup: jangan membolehkan siswa mengerjakan arm lain dari batch yang sama. Session dan assignment harus persisten.

Kalibrasi/linking dilakukan within-batch. Batch kedua menambah evidence reuse; tidak otomatis mengesahkan equating lintas batch. Hasil siswa hanya nilai dan pembahasan, tanpa ranking/percentile Tryout. Leaderboard aktivitas berbasis XP tetap berlaku.

Simpan pencocokan pseudonymous respondent ke attempt, package version, mode IRT/fallback, mapping/rubric policy version dan provenance artifact. Numora memvalidasi, menyimpan dan menerbitkan hasil; AI tidak langsung menerbitkan hasil siswa. **Untuk beta, hasil dan pembahasan terbit serentak pada satu waktu rilis per batch, maksimal 72 jam setelah tutup.** Jika paket/arm belum layak untuk IRT, gunakan fallback yang disahkan dan label eksplisit. Penanganan kegagalan teknis/UNSCORABLE dan cutoff operasional perlu kontrak; nilai nol tidak boleh menggantikan error teknis atau maksimum valid nol.

Metode mapping theta → nilai telah dipilih: prediksi poin pada satu paket acuan frozen per batch, dinormalisasi ke 0–100; semua arm memakai acuan sama setelah linking lolos. Ini bukan min–max/percentile, dan benar semua tidak menjamin nilai IRT tepat 100. Rincian estimator/prior, paket acuan, implementasi rumus/version dan validasinya tetap perlu diselesaikan; jika belum layak, pakai fallback. Dua nilai pada rentang 0–100 tidak otomatis comparable. Late IRT tidak boleh mengganti nilai final historis diam-diam. XP tetap diposting menurut policy attempt yang berlaku saat selesai, independen dari publikasi IRT; pembaruan ini tidak mengubah formula, pembulatan atau pin XP lama.

## Status yang harus dipisahkan

| Dimensi | Status konseptual target |
|---|---|
| Konten | DRAFT / CONTENT_VALID / REVIEW |
| Pengukuran | UNCALIBRATED / CALIBRATED / INSUFFICIENT / ANOMALY |
| Perbandingan | PENDING / PASS / DRIFT / NOT_COMPARABLE |
| Distribusi | PROVISIONAL / READY / HOLD / INACTIVE |

Ini adalah kontrak konseptual, bukan perintah mengganti enum database sekarang. Content READY/valid tidak membuktikan PASS. Distribusi PROVISIONAL hanya boleh melalui validasi konten dan kebijakan distribusi baru yang diimplementasikan eksplisit; jangan menonaktifkan guard database untuk memaksakannya.

## Audit implementasi pada commit acuan

**Pembaruan implementasi lokal, 9 November 2026:** PR #125 menambahkan audit mapping read-only; PR #126 menambahkan schema/guard arm, assignment dan delivery melalui migrasi 0051. Tahap 5 menambahkan `generator-service-v2`, stok/media dan DRAFT melalui migrasi 0052; [handoff dan bukti uji](GENERATOR_SERVICE_V2_HANDOFF.md) menjadi acuan operasional terbarunya. Routing siswa belum dialihkan, fitur v2 nonaktif secara default, dan database bersama belum dimigrasikan. Tabel berikut adalah snapshot sebelum tahap 3–5: gap schema/generator tersebut sudah ditangani secara lokal, sedangkan scientific IRT, approval akademik, aktivasi distribusi dan deployment tetap bukan hasil tahap ini.

| Area | Yang tersedia | Gap terhadap v2 |
|---|---|---|
| Drill utama | Attempt/policy pins, scoring/reward dan exposure foundation; `selectDrillPackage()` memilih paket pertama. | Random A/B persisten dan dua paket aktif belum diterapkan. Index satu paket reguler published per level dan guard baseline-before-A/B perlu migrasi forward. |
| Eksperimen lama | ORIGINAL_PILOT/VARIANT_AB dan aturan tanpa reward; varian reguler memerlukan READY dengan Compare PASS. | Diganti sebagai target oleh A/B reguler provisional tanpa pilot. Guard/code lama tetap nyata sampai perubahan implementasi teruji. |
| Tryout utama | Batch menunjuk satu `package_id`, alur snapshot/adoption, deadline dan reader operasi. | Multi-arm, satu attempt/batch lintas paket, fallback per arm, hasil tanpa ranking dan kontrak publikasi baru belum end-to-end. |
| IRT v3 | Dispatch/outbox, input frozen pseudonymous, retry fencing, evidence/item-parameter adoption. | Payload executable kalibrasi masih `items`; producer hasil peserta v3, mapping approved dan scientific engine belum tersedia. Publication blocker `RESPONDENT_CONTRACT_NOT_APPROVED` tetap berlaku. |
| IRT bertingkat | Fondasi konteks level Drill/batch Tryout. | Model/linking Indikator dan Bab, ability snapshots serta gate longitudinal belum diimplementasikan. |
| Generator | HTTP `generator-service-v1`, envelope compute v3, mapping canonical, config pins, lease/artifact durable, preview dan Simpan VARIANT DRAFT di Numora. | Belum ada otomatisasi keputusan IRT/adjustment/aktivasi. V1 produksi belum melayani stok konseptual/media aktif; dukungan lokal tidak membuktikan dukungan endpoint. |
| Penyimpanan | Engine/CLI/workbench numerik stateless; service integrasi menyimpan kandidat/artifact compute secara durable. | Paket terdistribusi harus menunjuk versi tetap. Tidak boleh generate seed baru per siswa dan menganggapnya item kalibrasi yang sama. |
| Dokumentasi | Handoff generator lebih baru daripada sebagian narasi arsitektur lama. | Entry point diarahkan ke dokumen ini; laporan dan sumber lama dipertahankan sebagai sejarah. |

Inventaris lokal yang diperiksa: **Drill 1.150 original = 1.067 generator + 83 original berstok konseptual; Tryout 30 = 27 generator + 3 berstok; total 1.180 = 1.094 generator + 86 berstok; 0 HOLD**. Ini cakupan bank lokal, bukan bukti semua item sudah approved, dapat dipakai endpoint produksi, tersimpan di database saat ini, atau PASS IRT. Katalog generator ini tidak memuat Pretest; arsip/import Pretest adalah cakupan terpisah.

## Handoff kontrak kalibrasi dan hasil peserta — 8 November 2026

**ENGINEERING IMPLEMENTATION:** [kontrak `irt-calibration-v1`](IRT_CALIBRATION_CONTRACT_V1.md) menetapkan input frozen, parameter 2PL/GPCM, hasil peserta Tryout, identitas respondent–attempt–package–batch, assigned/delivered arm, status data kurang/gagal dan pin eksekusi. Schema, contoh tersanitasi serta validator JavaScript/Python dipelihara identik di kedua repo dan diuji dengan shared conformance vectors. Kontrak generator HTTP v1 dan notification compute v3 tidak berubah.

Bentuk pertukaran data bukan lagi OPEN seluruhnya. Policy numerik/akademik, adapter snapshot/digest/resource policy, scientific producer, adopter/persistence dan finalizer publikasi masih diperlukan. Scope executable kontrak baru adalah Level Drill dan batch Tryout; Indikator/Bab belum dicakup. Guard `RESPONDENT_CONTRACT_NOT_APPROVED` tetap berlaku pada runtime v3 item-only sampai jalur baru selesai diuji. Kontrak tidak memublikasikan nilai, mengubah database atau menulis ulang XP/histori.

## Keputusan yang tetap OPEN

| Topik | Yang masih perlu diselesaikan | Pemilik |
|---|---|---|
| Sampel dan quality gate | Checkpoint X, minimum item/arm, precision, convergence/fit, toleransi PASS/DRIFT dan uncertainty; validasi melalui simulasi/evidence. | Data/AI + Curriculum |
| Anchor/linking | Jumlah beta sudah ditetapkan: Drill 3, Tryout 5. Pemilihan anchor/blueprint, kestabilan dan kecukupan pada batas itu, DIF/leakage, linking indikator, reach/selection bias dan learning over time masih perlu validasi. | Data/AI + Curriculum |
| IRT Bab | Dimensi, window/reference scale, minimum coverage, invariance dan interval laporan. | Data/AI + Product |
| Nilai dan rubrik | Metode mapping acuan, per-arm fallback, serentak per batch, first valid, prinsip item invalid/maksimum nol dan presisi telah diputuskan. Review rubrik Drill, minimum cakupan setelah exclusion, tie rounding, spesifikasi estimator/prior/mapping serta implementasi producer/adopter hasil peserta masih diperlukan. Bentuk payload sudah ditetapkan pada kontrak v1. | Product + Curriculum + Data/AI + Software |
| Eksperimen/assignment | Nomor 7 selesai: original boleh menjadi fallback distribusi sementara; siswa lama bukan fresh di eksperimen baru. Assigned-vs-delivered arm, identitas/version dan exclusion crossover sudah direpresentasikan kontrak v1; analisis crossover/attrition, lifecycle, invalidasi teknis, mapping blueprint/ID dan pergantian paket atomik masih perlu implementasi/validasi. Exposure lintas fitur diterima untuk beta Drill; jangan menerapkan exclusion global lama pada scope itu. | Data/AI + Software + Curriculum |
| Adjustment/reuse | Daftar kontrol yang boleh diubah, bounds, budget/stop rule, multi-output evidence dan validasi otomatis yang kelak boleh digunakan. | Data/AI + Curriculum |
| Insiden/fairness | Kapan/berapa kompensasi atau penghentian sesi perlu dilakukan; prinsip tidak menulis ulang histori sudah disepakati. | Product + Curriculum |
| Beta/integrasi | Kalender dua batch, paket/anchor yang dipilih, PIC bernama, kesiapan runtime/deployment dan penerimaan QA. Tidak ada ETA/PIC yang diasumsikan dari dokumen ini. | Product/Admin + Data/AI + Software/QA |

## Urutan tindak lanjut

1. Gunakan keputusan ini untuk menyelaraskan PRD, acceptance criteria dan handoff lintas tim.
2. Rancang perubahan forward untuk versi/paket/assignment/exposure dan kontrak first eligible attempt; pertahankan histori serta migrasi lama.
3. Implementasikan dan uji Drill A/B, concurrent IRT Level, gate serta adjustment terkendali.
4. Implementasikan Tryout multi-arm, kontrak hasil peserta, mapping/fallback dan publikasi immutable.
5. Validasi IRT Indikator sebelum klaim urutan kesulitan produksi; validasi IRT Bab/linking sebelum grafik tren siswa/guru.

Urutan ini adalah rancangan pelaksanaan dari sumber v2, bukan komitmen tanggal rilis atau pernyataan bahwa seluruh fitur siap untuk uji sekolah pertama.
