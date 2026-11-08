# Konteks arsitektur varian dan IRT v2

**ENGINEERING DECISION — perubahan produk/arsitektur disetujui pemilik, 8 November 2026.** Dokumen ini mencatat rancangan target yang menggantikan kebijakan lama pada bagian yang bertentangan. Ini bukan laporan implementasi atau pengesahan statistik. PRD v0.6 dan keputusan lain tetap berlaku di luar perubahan yang disebutkan di sini.

Salinan dokumen ini dipelihara identik di repo Numora dan Numora-ai-service. Perubahan berikutnya harus diselaraskan pada keduanya. Pembaruan ini hanya dokumentasi; tidak mengubah kode, kontrak executable, migrasi, database, konfigurasi deployment, atau hasil siswa.

## Sumber dan pengesahan

- Sumber pemilik: [DOCX rancangan v2.0](sources/Numora_Rancangan_Arsitektur_AI_IRT_v2_0_Draft.docx), bertanggal 31 Oktober 2026, tetap disimpan utuh dengan label Draft aslinya.
- [Ekstraksi teks sumber](sources/Numora_Rancangan_Arsitektur_AI_IRT_v2_0_Draft.docx.txt) mempertahankan urutan paragraf dan baris tabel; format visual tetap mengacu ke DOCX. Ada 157 blok body dan 21 tabel, tanpa gambar atau persamaan OMML.
- SHA256 DOCX: `3A3806E3FAA979D058CF558F3CA3CA3F5C5B74EAA136BB38D35C7C82E1E8441E`.
- Baseline audit Numora: `43787398dcf40ca13ebbeb2d80a85e31b39a6a16`.
- Baseline audit Numora-ai-service: `22aeafb9beb166b69658f4a1c65f609f0fdb6c5b`.
- Dalam percakapan 8 November 2026, pemilik menjawab “aku setuju semuanya” atas delapan rekomendasi rekonsiliasi. Nomor 3 kemudian dijelaskan melalui contoh Rani dan disetujui eksplisit: “Setuju: retry baru memakai V2 (Rekomendasi)”.
- Persetujuan pemilik ini menetapkan arah dan kebijakan di bawah; tidak mengklaim review lintas tim, validasi Curriculum atas setiap item, penerapan ke production, atau kesiapan integrasi telah selesai.

## Delapan keputusan pemilik

| No. | Keputusan yang disetujui | Batas penerapan |
|---|---|---|
| 1 | V2 menjadi acuan target dan menggantikan kebijakan lama yang bertentangan. | Aturan lama disimpan sebagai sejarah. Parameter statistik yang belum disahkan tetap OPEN. |
| 2 | A/B Drill sejak awal adalah pembelajaran reguler: nilai, XP, bintang, dan unlock mengikuti kebijakan produk yang berlaku. | Konten harus disetujui Curriculum sebelum disajikan. Provisional psikometrik tidak berarti bebas dari validasi konten. |
| 3 | Sesi berjalan tetap memakai versi paket awal; retry baru setelah pergantian memakai versi aktif terbaru dalam arm yang sama selama eksperimen tersebut berlaku. | Simpan assignment dan pin paket per attempt. Retry/paparan keluarga sebelumnya tidak menjadi evidence fresh utama. |
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

Pengecualian insiden konten yang mengharuskan penghentian sesi perlu prosedur eksplisit; bukan izin untuk menukar item diam-diam. Perpindahan ke eksperimen baru dan kebijakan re-enrollment masih memerlukan rancangan operasional.

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

Evidence utama Drill adalah attempt pertama yang valid per siswa per level; Tryout per siswa per batch. Retry bukan responden independen. Periksa paparan **keluarga** soal melalui Pretest, Drill, Tryout, PvP dan pembahasan; first attempt saja tidak menjamin fresh. Perubahan seed/versi tidak menghapus riwayat paparan keluarga.

Snapshot minimum mencakup versi item/rubrik/paket/config, family ID, arm, timestamp, score/max score, exposure state, attempt index, alasan eligibility dan scoring policy version. Definisi valid, attempt tidak selesai/invalid, exclusion, window dan cutoff harus dipatok dalam policy; jangan memilih ulang attempt secara ad hoc agar data terlihat cukup.

Quality gate mencakup eligible per item/arm, keseimbangan alokasi, reach/coverage, profil awal, linking, convergence, SE, fit, DIF/invariance, local dependence, dimensi dan perubahan kemampuan selama belajar. X respons, 2%/70% reach, serta jumlah anchor contoh bukan threshold validitas produksi.

## Drill dan self-adjustment

- Satu paket original dan satu paket varian aktif per level, dengan randomisasi persisten A/B dan sasaran alokasi awal 1:1. Original dan varian yang lolos konten dapat disajikan sejak awal, tanpa fase pilot original terpisah.
- Common anchor memakai versi identik antararm dan keluarga berbeda dari focal yang dibandingkan. Contoh 7 anchor + 3 focal dari 10 item bukan komposisi final yang otomatis berlaku.
- Kalibrasi original/anchor dan evaluasi kesetaraan dilakukan pada episode concurrent yang terhubung, dengan gate mutu original, anchor, serta perbandingan yang terpisah; tidak perlu baseline hasil pilot terdahulu sebagai prasyarat distribusi awal.
- **PASS:** bekukan config version khusus item/family (`FROZEN_ITEM`) dan pertahankan varian aktif. Satu PASS bukan bukti seluruh seed/family/output setara.
- **DRIFT material:** hanya parameter yang diizinkan policy boleh diubah. Buat config/item version dan seed baru, validasi dan review konten, ganti distribusi secara terkendali, lalu kumpulkan evidence cohort fresh. Versi lama menjadi INACTIVE, tidak dihapus.
- **INSUFFICIENT:** tambah evidence tanpa adjustment. **NOT_COMPARABLE:** perbaiki linking/desain tanpa klaim kesetaraan. **ANOMALY/konten bermasalah:** quarantine dan review; jangan mengartikan semua kegagalan sebagai DRIFT.
- `VALIDATED_FOR_REUSE` memerlukan bukti lintas keluaran/kasus serta batas yang disahkan. Generate massal tetap memerlukan validasi setiap output; tidak mewarisi PASS psikometrik otomatis.
- Stok konseptual tetap finite. Jangan membuat parameter numerik palsu untuk stok; pemilihan/penggantian stok harus direview dan memiliki lineage/evidence sendiri.

`SEALED` pada snapshot teknis bukan `FROZEN_ITEM`, bukan approval Curriculum, dan bukan `VALIDATED_FOR_REUSE`. Retry transport memakai input/seed yang dipin; iterasi ilmiah akibat DRIFT membuat versi/input baru. Keduanya harus dibedakan dalam audit.

## Tryout beta dan hasil peserta

Dua batch mingguan berturut-turut, masing-masing satu original dan beberapa paket varian/config arm. Total dua original untuk beta; setiap paket tetap 30 soal. Admin dapat create/read/deactivate original, membuat varian dengan pin sumber/config/seed, memilih anchor, serta membekukan daftar paket aktif sebelum batch dimulai. Empat sampai lima calon anchor adalah titik awal review, bukan bukti kecukupan.

Satu siswa mendapat tepat satu paket melalui alokasi terkendali dalam satu batch. Keunikan attempt per paket saja tidak cukup: jangan membolehkan siswa mengerjakan arm lain dari batch yang sama. Session dan assignment harus persisten.

Kalibrasi/linking dilakukan within-batch. Batch kedua menambah evidence reuse; tidak otomatis mengesahkan equating lintas batch. Hasil siswa hanya nilai dan pembahasan, tanpa ranking/percentile Tryout. Leaderboard aktivitas berbasis XP tetap berlaku.

Simpan pencocokan pseudonymous respondent ke attempt, package version, mode IRT/fallback, mapping/rubric policy version dan provenance artifact. Numora memvalidasi, menyimpan dan menerbitkan hasil; AI tidak langsung menerbitkan hasil siswa. Nilai dan pembahasan terbit bersama maksimal 72 jam setelah batch tutup. Jika paket/arm belum layak untuk IRT, gunakan fallback yang disahkan dan label eksplisit. Kebijakan pelepasan parsial batch dan penanganan kegagalan teknis perlu kontrak operasional.

Fallback berbasis poin yang disetujui tidak menyelesaikan mapping theta → nilai. Dua nilai pada rentang 0–100 tidak otomatis comparable. Late IRT tidak boleh mengganti nilai final historis diam-diam. XP tetap diposting menurut policy attempt yang berlaku saat selesai, independen dari publikasi IRT; pembaruan ini tidak mengubah formula, pembulatan atau pin XP lama.

## Status yang harus dipisahkan

| Dimensi | Status konseptual target |
|---|---|
| Konten | DRAFT / CONTENT_VALID / REVIEW |
| Pengukuran | UNCALIBRATED / CALIBRATED / INSUFFICIENT / ANOMALY |
| Perbandingan | PENDING / PASS / DRIFT / NOT_COMPARABLE |
| Distribusi | PROVISIONAL / READY / HOLD / INACTIVE |

Ini adalah kontrak konseptual, bukan perintah mengganti enum database sekarang. Content READY/valid tidak membuktikan PASS. Distribusi PROVISIONAL hanya boleh melalui validasi konten dan kebijakan distribusi baru yang diimplementasikan eksplisit; jangan menonaktifkan guard database untuk memaksakannya.

## Audit implementasi pada commit acuan

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

## Keputusan yang tetap OPEN

| Topik | Yang masih perlu diselesaikan | Pemilik |
|---|---|---|
| Sampel dan quality gate | Checkpoint X, minimum item/arm, precision, convergence/fit, toleransi PASS/DRIFT dan uncertainty; validasi melalui simulasi/evidence. | Data/AI + Curriculum |
| Anchor/linking | Komposisi Drill, kecukupan anchor Tryout, DIF/leakage, linking indikator, reach/selection bias dan learning over time. | Data/AI + Curriculum |
| IRT Bab | Dimensi, window/reference scale, minimum coverage, invariance dan interval laporan. | Data/AI + Product |
| Nilai dan rubrik | Mapping theta ke nilai; detail poin fallback, item invalid, denominator nol, pembulatan, kontrak responden/attempt serta release per arm. | Product + Curriculum + Data/AI + Software |
| Eksperimen/assignment | Definisi first valid, exclusion, lifecycle eksperimen, enrollment ulang, mapping blueprint/ID dan pergantian paket atomik. | Data/AI + Software + Curriculum |
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
