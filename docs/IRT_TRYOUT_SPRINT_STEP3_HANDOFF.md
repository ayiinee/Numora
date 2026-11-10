# Sprint urutan 3: acceptance Tryout, 11 November 2026

**NOT READY untuk acceptance menyeluruh.** Perubahan tahap ini memperkuat pengujian dan pelaporan; tidak mengubah estimator, threshold, API publik, policy produk, atau database bersama. Urutan 4 belum dimulai.

Baseline Main `66a0dc808dba4cbf8f5b9240a23182881b7281b6` (PR #157 dan #159 merged); AI `8b8a4672109f6e51cc015035c64741404038d3f4`, clean. Pin lengkap dan hasil berada pada [laporan mesin](IRT_TRYOUT_SPRINT_STEP3_ACCEPTANCE.json). Required checks pada head PR final tetap authoritative; merge/bypass tidak menggantikan acceptance yang belum selesai.

## Bukti dan batas

| Jalur | Evidence baru | Batas |
| --- | --- | --- |
| Login API dan IRT terpisah | Start/resume/paralel, delivery pin, private projection dan revoke lulus | Database disposable; bukan enrollment produksi |
| Start aplikasi sampai freeze | HTTP Nest, grader asli, batch close, reconciler/replay lulus; fresh install dan upgrade dengan histori nonkosong | Auth identity provider sintetis; bukan tes Supabase produksi |
| Native snapshot dua arm | 2.000 peserta, 60.000 respons; digest PostgreSQL valid, satu dispatch, replay digest sama | Tidak menjalankan R |
| Native snapshot tiga arm | 2.100 peserta, 63.000 respons; digest PostgreSQL valid, satu dispatch | Bukan bukti linking atau kalibrasi |
| Container Linux kecil | HTTP/API/worker, artifact, adopsi, fallback/publikasi dan reader lulus | Empat peserta: R tidak dipanggil karena kurang sampel |
| Rilis dengan artifact kontraktual | 1.000 peserta IRT; replay publikasi, reader dan integritas isi lulus | Engine double; bukan hasil estimasi R |
| Cabang keputusan | Fallback, gagal teknis, cancel, revoke, UNSCORABLE null dan coverage kurang lulus | Sampel kecil; tidak menjalankan R |
| Kontrak dan rumus | Byte parity kedua repo; 118 tes kontrak/adapter, 12 tes keputusan/adopter, 6 tes matematika lulus | Oracle lintas R belum dijalankan ulang |
| Linux besar | Gagal saat seeding 2.000 peserta; koneksi PostgreSQL dan API Docker hilang | Tidak mencapai freeze/R besar; tiga arm Linux NOT_RUN |

Freeze native membutuhkan 205,922 detik untuk dua arm dan 203,625 detik untuk tiga arm, termasuk seeding dan pemeriksaan. Body JSONB sekitar 30,75 MB dan 32,30 MB. Error historis `53200` tidak terulang pada PostgreSQL native. Penyebab pasti kegagalan Docker belum ditetapkan; jangan menyebutnya fix memori atau SLO kapasitas. Host lokal Docker teramati 2 CPU/4.107.378.688 byte RAM; VPS tidak diuji atau diubah.

Regresi transport penuh sempat timeout pada scientific-fault scenario setelah pemeriksaan auth/replay/fencing/tampering sebelumnya lulus. Rerun terisolasi enam scientific fault dan no-observation lulus: dua tes dalam 544,969 detik, memakai engine kontraktual tanpa R. Timeout awal tetap tercatat; tidak diklaim sebagai satu suite utuh yang lulus dalam 300 detik. Timeout runner diperbaiki agar menghentikan descendants milik tes. Regresi stdlib membuktikan child tidak melanjutkan kerja setelah timeout. Tambahan konservatif 60 detik dibebankan ke ledger untuk aktivitas descendant/cleanup sebelum fix; anggaran tidak ditambah.

## Batas integritas exposure

Compute, adopsi, dan publikasi wajib mempertahankan isi attempt, item, jawaban, exposure, XP dan hasil historis. Pembacaan pembahasan melalui aplikasi memang menambah exposure `EXPLANATION_PAYLOAD_ISSUED`: tes wajib memeriksa baris lama tetap identik, tepat 30 event baru per peserta, dan relasi event ke delivery item/attempt/question-version. Event sah ini tidak boleh dianggap mutasi histori oleh mesin, atau dihapus demi membuat assertion hijau.

## Peta review

- `calibration-research.mjs`: canonical roster/grade/pin, validasi resource, digest freeze serta transaksi snapshot/outbox existing.
- Migrasi 0068: assertion delivery sempit untuk login API; private compute assertion/projection tetap terpisah. Tidak ada migrasi baru pada tahap ini.
- `adoption-v1.ts`: validator artifact canonical, current generation/execution, approval/digest dan receipt replay.
- `tryout-release-v1.ts` dan `release-decisions-v1.ts`: coverage snapshot, keputusan per arm, fallback, publikasi atomik, replay dan late-result guard.
- Reader Tryout: hasil/pembahasan mengikuti gerbang rilis dan kepemilikan attempt; XP tidak dihitung ulang.

## Reproduksi dan resume

Gunakan checkout AI bersih pada SHA acuan. Set `NUMORA_AI_SERVICE_PATH` dan `POSTGRES_BIN` ke checkout/executable lokal; jangan memuat `.env`. Ledger urutan 3 adalah `.tmp/irt-sprint-step3/ledger.json`, batas 3.600 detik, termasuk CI dan retest. Ledger lama tidak direset. Semua perintah verifikasi baru harus dibungkus `scripts/run-irt-acceptance-check.py --ledger .tmp/irt-sprint-step3/ledger.json --budget-seconds 3600 --name <case> --timeout <seconds> -- <command>`.

- Snapshot native: `python scripts/test-irt-sprint-freeze.py`.
- Cabang rilis tanpa R: `python scripts/test-irt-release-local.py --output .tmp/irt-sprint-step3/release-cases.json`.
- Artifact kontraktual: tambahkan `--engine-double`; jangan melabeli hasilnya R nyata.
- Linux besar setelah Docker pulih: jalankan verifier AI existing dengan `--main-repo . --delivery --main-release-check`, output baru per run. Cocokkan SHA, recipe, kontrak, policy/profile dan image terlebih dahulu. Jangan reuse artifact dengan pin berbeda.

Docker gagal saat cleanup; resource milik run bersufiks `bbb653c44c41` belum terbukti terhapus. Setelah daemon pulih, inspeksi container PostgreSQL/API/worker `numora-irt-linux-*-bbb653c44c41` dan volume kerja bernama sesuai report, lalu hapus hanya resource milik run yang sudah diverifikasi. Jangan restart Docker/WSL atau menghapus resource proyek lain otomatis.

## Keputusan dan pekerjaan tersisa

- Integrasi lokal lengkap: **NOT READY**, menunggu dua ukuran penuh dengan R nyata, oracle R. Scientific fault kontraktual sudah lulus melalui rerun terisolasi.
- Host/produksi: **NOT READY**. Kapasitas host tujuan, policy/approval ilmiah sah, konfigurasi privat dan operator tetap gerbang terpisah.
- Gap browser generator khusus urutan 2 tetap terbuka meski CI umum #159 hijau.
- Langkah berikutnya adalah pemulihan runtime lokal dan retest kasus yang tertahan pada ledger sama. Tidak ada deployment, migrasi shared, comparison, self-adjustment atau pekerjaan Drill tahap 4 dalam run ini.
