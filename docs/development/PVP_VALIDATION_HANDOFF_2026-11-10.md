# Handoff validasi bank soal PvP — Database dan Curriculum

Tanggal: 10 November 2026 (Asia/Jakarta). Dokumen ini adalah brief penerusan pekerjaan; tidak mengirim pesan, tidak memberikan akses database, tidak mengubah data, dan tidak mengaktifkan mode official.

## Brief siap dibagikan

> Mohon lanjutkan validasi bank PG Drill yang dipakai PvP. Review awal berbantuan AI dan persetujuan pemilik telah menghasilkan 269 versi baru dalam sembilan batch; ini belum review Curriculum independen atau kalibrasi kesulitan empiris. Terakhir diverifikasi ada 81 EASY, 148 MEDIUM, 40 HARD yang lolos selector strict; 306 keluarga masih di pool sementara, termasuk satu HOLD invers matriks. Tim Curriculum menilai isi/kunci/pembahasan, cakupan kompetensi, kesulitan, keragaman dan kelayakan timer. Tim Database menyiapkan inventaris versi terbaru, rekonsiliasi provenance/audit, lalu menerbitkan revisi immutable berdasarkan keputusan reviewer berwenang. Jangan menganggap READY/CONTENT_VALID sebagai bukti kalibrasi atau menimpa versi lama. Aktivasi strict/official dikoordinasikan terpisah dengan Software/Operations setelah verifikasi dan penyelesaian room aktif.

## Status yang harus dipahami penerima

**ENGINEERING IMPLEMENTATION — bukti verifikasi terakhir di chat ini, 10 November 2026:**

| Status                                                   | Jumlah keluarga | Catatan                                                              |
| -------------------------------------------------------- | --------------: | -------------------------------------------------------------------- |
| Diterbitkan ulang setelah review dan persetujuan pemilik |             269 | 269 versi baru; 30 per batch kecuali batch 6 berisi 29               |
| Lolos selector strict EASY                               |              81 | Klasifikasi editorial, bukan parameter IRT                           |
| Lolos selector strict MEDIUM                             |             148 | Klasifikasi editorial, bukan parameter IRT                           |
| Lolos selector strict HARD                               |              40 | Klasifikasi editorial, bukan parameter IRT                           |
| Pool sementara                                           |             306 | 305 belum mendapat rilis baru + 1 HOLD yang sumbernya masih tersedia |
| Total keluarga PG dalam dua pool saat verifikasi         |             575 | Bukan seluruh bank/seluruh tipe soal                                 |

Angka adalah snapshot terakhir, bukan jaminan keadaan live saat tim mulai. Inventaris ulang secara READ ONLY lebih dulu. Tim tidak perlu mengulang penerbitan 269 versi; Curriculum boleh meninjau ulang keputusan tersebut dan membuat revisi baru jika perlu.

**Batas bukti:** review awal mencakup isi/kunci/pembahasan kandidat, pemeriksaan format/decoder dan beberapa perhitungan ulang. Simulasi transaksi, row sumber tetap utuh, audit/provenance dan pengulangan rilis diperiksa. Ini bukan bukti blueprint lengkap, kecukupan timer empiris, validasi psikometrik, sign-off Curriculum independen, penerimaan dua pemain di staging atau deployment produksi. Histori sumber dan hasil lama tidak diperbarui oleh rilis.

**Atribusi:** field reviewer DB pada rilis memakai operator Content/Data/Moderation existing yang juga menangani sumber, dengan provenance menjelaskan eksekusi atas persetujuan pemilik dan review berbantuan AI. Jangan menganggap nama/UUID pada kolom itu bukti bahwa orang tersebut sudah melakukan review Curriculum independen. Review berikutnya harus mencatat reviewer dan persetujuan yang sebenarnya; jangan menyalin identitas operator lama secara otomatis.

**Konfigurasi lokal terakhir:** `PVP_MODE=demo`, `PVP_CONTENT_MODE=temporary-owner-accepted`. Itu tidak membuktikan konfigurasi server deployment lain. Dalam mode tersebut pilihan Mudah/Sedang/Sulit masih memakai pool yang sama, dengan timer 30/45/60 detik. Bank baru strict belum diaktifkan hanya karena versi baru sudah tersedia. Entri hasil/leaderboard DEMO terpisah dari official.

## Pembagian pekerjaan

**PROPOSED — tim Curriculum:**

1. Tetapkan PIC reviewer akademik dan pemberi approval, kriteria kesulitan serta cakupan kompetensi yang dipakai. Jangan menebak batas OPEN akademik/statistik.
2. Tinjau 305 keluarga yang belum mendapat rilis baru, putuskan HOLD B6-17, dan lakukan review independen atas 269 keluarga yang sudah dirilis sesuai kebutuhan penerimaan tim. Prioritaskan soal hasil revisi dan saran opsional yang belum diterapkan.
3. Untuk setiap versi: periksa kesesuaian SMP/TKA/indikator, kejelasan redaksi dan asumsi, penyelesaian independen, tepat satu jawaban benar pada PG, kualitas pengecoh, pembahasan, satuan, pembulatan dan rumus/media.
4. Konfirmasi EASY/MEDIUM/HARD berdasarkan kriteria akademik yang dicatat; cek keterbacaan pada 30/45/60 detik. Label editorial bukan kalibrasi IRT. Kecukupan waktu/kemampuan diskriminasi empiris perlu data/uji tersendiri.
5. Tandai duplikasi/soal sangat mirip lintas ID keluarga. Selector mencegah sepuluh ID keluarga sama, tetapi tidak menjamin independensi psikometrik, keragaman topik, atau blueprint seimbang.
6. Beri keputusan terpisah: disetujui, perlu revisi, atau ditahan beserta alasan. Label ini untuk dokumen review, bukan enum/status DB baru yang boleh diinventasikan.

**PROPOSED — tim Database:**

1. Konfirmasi target lingkungan bersama pemilik/Operations, berikan akses melalui kanal aman dan mulai READ ONLY. Jangan kirim `.env`, URL berkredensial, token atau dump berisi PII ke grup.
2. Rekonsiliasi inventaris terbaru dengan manifest rilis, provenance dan audit. Hitung keluarga unik, bukan jumlah semua row versi. Jangan memakai nomor urut ekspor/offset lama sebagai identitas.
3. Ekspor worklist berisi identitas keluarga/varian/versi, nomor versi, sumber bab/subbab/kompetensi, tipe, difficulty, status, soal/opsi/kunci/pembahasan/media dan sumber approval. Tidak perlu data siswa atau email reviewer.
4. Catat perubahan hasil review baru sebagai versi baru dengan `revised_from_question_version_id`. Pertahankan ID keluarga dan garis revisi bila memang revisi soal yang sama. Jangan menimpa payload versi READY/imported/used atau menghapus histori.
5. Pertahankan provenance impor, audit dan pin. Jangan memindahkan `package_items`, `attempt_items`, atau `pvp_match_questions` lama ke versi baru; hasil, skor/XP dan kebijakan historis tidak dihitung ulang.
6. Publikasikan melalui lifecycle/operator yang ditinjau tim: manifest approval eksplisit, pemeriksaan drift sumber, concurrency/transaction, idempotensi dan rehearsal/rollback. Perubahan schema memerlukan migrasi resmi; jangan membuat schema manual.
7. Verifikasi memakai selector backend aktual dan decoder, bukan SQL count difficulty saja. Pastikan versi tidak valid tidak dipad/diganti lintas difficulty. Daftar temuan invalid/urgent diserahkan untuk keputusan penanganan konten; status HOLD di laporan tidak otomatis menghentikan distribusi.

## Soal HOLD yang wajib dilanjutkan

- Review ID: **B6-17**.
- Family/question ID: `05f45988-9eb3-5a3f-973c-66f82161005a`.
- Source version ID: `4c5ed075-d8e4-5134-855d-c7811de0a9aa`.
- Materi: penyelesaian SPLDV melalui invers matriks 2×2.
- Aljabar/kunci A cocok, tetapi cakupan materi dan kompetensi sah untuk SMP/PvP belum dikonfirmasi oleh Curriculum dalam review ini; konteks harga tiket juga perlu diperjelas.
- **Tidak dibuatkan versi baru. Sumber masih READY dan masih lolos pool sementara. HOLD hanya catatan review, bukan blokir runtime.** Jika dinyatakan tidak layak, koordinasikan penonaktifan/revisi melalui lifecycle dengan memeriksa dependency paket; jangan hapus soal atau membatalkan sesi secara sepihak.

## Tabel dan cara menelusuri perubahan

| Tabel                          | Peran                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `questions`                    | Identitas keluarga, `usage_type`, status, kompetensi utama                                                                  |
| `question_variants`            | Hubungan keluarga dan varian                                                                                                |
| `question_versions`            | Payload versi, difficulty, review, status, `revised_from_question_version_id`                                               |
| `content_imports`              | Operasi rilis/import, namespace, fingerprint/idempotensi                                                                    |
| `content_import_versions`      | Versi yang dirilis, hash konten dan provenance                                                                              |
| `audit_logs`                   | Aksi `PVP_OWNER_REVIEW_RELEASE` serta referensi/reason rilis                                                                |
| `content_validation_decisions` | Keputusan validasi eksplisit bila jalur itu digunakan; jangan menganggap semua CONTENT_VALID punya row keputusan tersendiri |

Batch 2–9 dapat dicari melalui namespace yang memuat `PVP_BATCH02` sampai `PVP_BATCH09`. **Batch pertama bukan `PVP_BATCH01`:** referensinya `PROJECT_OWNER_2026_11_10_PVP_30_REVIEW_AND_SEVEN_CORRECTIONS`. Hubungkan `content_imports.id` ke `content_import_versions.import_id`, kemudian ke `question_versions.id`. Bandingkan versi baru dengan `revised_from_question_version_id`.

SQL berikut hanya membaca rilis/provenance, **bukan penghitung eligibility PvP**:

```sql
SELECT c.source_namespace, v.id AS version_id, va.question_id AS family_id,
       v.version_number, v.revised_from_question_version_id,
       v.difficulty, v.content_status, v.validation_state,
       i.provenance->'ownerPvpRelease' AS release_evidence
FROM content_imports c
JOIN content_import_versions i ON i.import_id = c.id
JOIN question_versions v ON v.id = i.question_version_id
JOIN question_variants va ON va.id = v.variant_id
WHERE c.source_namespace LIKE 'PROJECT_OWNER_2026_11_10_PVP_%'
ORDER BY c.source_namespace, v.id;
```

Jangan menyalin keputusan validasi versi lama ke versi baru: keputusan yang ditautkan harus milik versi tersebut. Field READY/CONTENT_VALID memenuhi pemeriksaan struktural/approval tertentu; tidak menggantikan pembuktian akademik atau validitas IRT.

## Eligibility dan perilaku distribusi yang harus dijaga

Acuan aktual: `apps/api/src/modules/pvp/pvp-drill-bank.ts`.

- `usage_type=DRILL`, keluarga/versi serta hierarchy bab/subbab/kompetensi READY; level READY jika ditautkan.
- PG `SINGLE_CHOICE`, payload diterima decoder dan media yang didukung. PvP sekarang tidak mengambil PGK/Pretest/Tryout hanya karena kontennya valid.
- Ada review atau bukti CONTENT_VALID yang sesuai; versi READY terbaru per varian, lalu kandidat dikelompokkan menurut keluarga.
- Strict memakai metadata EASY/MEDIUM/HARD; sementara memakai marker persis `OWNER_ACCEPTED_UNCALIBRATED`.
- Minimal sepuluh keluarga unik per difficulty. Sampling sepuluh keluarga tanpa duplikasi, memilih varian eligible, menyimpan snapshot/order per room. Kedua pemain dan reconnect memakai versi yang sama.
- Menerbitkan versi READY baru dalam varian yang sama dapat mengeluarkan keluarga itu dari pool sementara karena selector memakai versi READY terbaru; bukan menambahnya ke kedua pool sekaligus.
- Paket Drill/room/sesi lama masih merujuk versi yang sudah dipin. Jangan berasumsi revisi keluarga otomatis memperbarui paket Drill yang frozen.

## Format hasil review yang diserahkan kembali

**PROPOSED — satu baris per versi, dengan file pengganti bila ada:**

`reviewId, familyId, variantId, sourceVersionId, sourceVersionNumber, sourceFingerprint, bab/subbab/kompetensi, reviewer, tanggal, keputusan, alasan, hasilHitungIndependen, proposedDifficulty, kriteriaKesulitan, perubahanStem/Opsi/Kunci/Pembahasan, duplicateGroup, holdReason, approvalReference, publishedVersionId`.

Pisahkan koreksi wajib, saran opsional, dan dependency OPEN. Persetujuan atas koreksi tidak otomatis menyetujui saran opsional. Jika kunci, opsi atau angka diubah, mintakan approval terhadap pengganti konkret dan gunakan manifest baru; operator existing sengaja melarang perubahan opsi/kunci untuk sembilan batch yang sudah dipin.

## Peralatan dan berkas yang diberikan

- `docs/development/PVP_OWNER_REVIEW_2026-11-10.md`: riwayat sembilan batch, keputusan dan hasil penerbitan.
- `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10*.json`: sembilan manifest tetap, sumber/pengganti, ID, solusi, alasan, approval dan saran tidak diterapkan.
- `apps/api/scripts/release-owner-reviewed-pvp.mjs`: operator terbatas batch 1–9, default READ ONLY; `--rehearse` rollback, `--apply` menyimpan. **Bukan alat otomatis batch berikutnya:** manifest/digest/klasifikasi/koreksi dan identitas actor harus direview terlebih dahulu.
- `docs/development/PVP_RANDOM_DRILL_BANK.md` dan `PVP_TEMPORARY_READY_CONTENT.md`: aturan selector dan rollout; angka konten lama di dokumen tersebut adalah historis.
- `apps/api/src/modules/pvp/pvp-drill-bank.ts` dan `pvp.policy.ts`: implementasi eligibility/notice/timer.
- `.tmp/pvp-academic-review-2026-11-10/`: laporan lengkap kandidat dan bukti per batch. **Ignored/lokal, tidak otomatis ikut clone/pull Git.** Paket handoff lokal menyertakan salinan berkas yang dipilih secara eksplisit.

Pada saat brief ini dibuat, operator, manifest dan laporan permanen masih berupa perubahan working tree yang belum di-commit. Jangan berasumsi rekan sudah mendapatnya lewat Git; serahkan ZIP atau lakukan review/commit melalui workflow tim. Tidak ada push, pesan atau berbagi cloud otomatis dalam handoff ini.

## Batas penyelesaian dan aktivasi

**PROPOSED — keluaran handoff:** inventaris terbaru dan pemetaan versi, keputusan akademik per soal, revisi berprovenance/audit, daftar duplicate/HOLD/OPEN, hitungan eligibility per difficulty dan laporan pemeriksaan. Tidak perlu menyelesaikan seluruh sisa bank untuk sekadar memenuhi minimum teknis sepuluh per difficulty; kelengkapan bank dan mutu cakupan merupakan keputusan akademik terpisah. Jangan menganggap minimum teknis sebagai kecukupan akademik.

**ENGINEERING DECISION — rollout existing:** aktivasi dikerjakan Software/Operations terpisah. Matikan new starts, biarkan room selesai dan verifikasi tidak ada room WAITING/READY/RUNNING, alihkan `PVP_CONTENT_MODE=strict` serta `PVP_MODE=official` sesuai readiness yang disetujui, lalu restart secara terkendali. Restart API existing dapat membatalkan room yang belum selesai. Verifikasi `/api/v1/pvp/availability` tanpa notice sementara, kedua pemain mendapat soal/order sama, answer/reconnect/results dan pemisahan leaderboard DEMO/official, lalu buka new starts kembali. Jangan mengubah hasil atau XP lama. Tidak ada aktivasi dalam handoff ini.
