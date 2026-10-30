# Triase dan verifikasi lanjutan

Rekaman otomatis awal `result.json`, `findings.md` dan `report.md` dipertahankan. Dokumen ini menambahkan penjelasan; tidak mengubah FAIL awal menjadi PASS.

## QA-TOOL-001 — simulasi gangguan koneksi

Kategori: alat tes. Penyebab terverifikasi: objek URL upstream dimutasi menjadi alamat proxy setelah closure server dibuat, sehingga koneksi mengarah kembali ke proxy. Perbaikan menangkap host/port upstream yang immutable dan menguji forward → block → restore tanpa menghentikan layanan utama.

Retest: run `eec51046-9952-46ff-a8af-b3a479803f9d`, check recovery PASS, 6/6 pemeriksaan termasuk gangguan PostgreSQL, reconnect Redis dan restore aktual ke database lain. Bukti hanya lokal; probe Redis tidak membuktikan respons API saat Redis gagal atau pemulihan cloud.

## QA-TOOL-002 — query rekonsiliasi k6

Kategori: alat tes. Query awal memakai status COMPLETED yang tidak ada dalam enum canonical assessment_attempts. Query diperbaiki ke GRADED, menghitung attempt baru sejak baseline serta membandingkan total submit diterima dengan ledger/outbox, tanpa mengikutkan attempt historis sebagai hasil load baru.

Retest pada run yang sama: load/stress PASS sebagai eksperimen pengukuran, 2.378 submit diterima = 2.378 attempt graded baru, broken ledger/outbox 0. Tahap 10/25/50/100 VU dan stress 250 berjalan. Tidak ada SLO produksi yang disahkan.

Stress mencatat 500 submit berhasil dan 447 iterasi k6 berakhir normal; 53 iterasi dihentikan pada akhir graceful period setelah submit sudah dihitung, sebelum sleep akhir selesai. Seluruh 500 submit tersebut ikut rekonsiliasi database. Catat batas ini saat membandingkan eksperimen. Verifikasi workflow singkat juga sempat berjalan pada awal tahap 10 VU dalam retest; angka latensi retest bukan baseline terisolasi untuk perbandingan kapasitas.

## EXP-001 — volume besar belum tuntas

Kategori: eksperimen/kapasitas lokal; belum dinyatakan sebagai bug atau kehilangan data. Tahap 1.000 dan 10.000 selesai dengan mismatch 0; penambahan 100.000 mencapai batas drain 120 detik dengan 99.350 event pending dari total kumulatif 111.000. Hasil BLOCKED dipertahankan. Investigasi query/throughput dan rencana eksperimen lanjutan diperlukan; jangan menambah batas atau menurunkan volume diam-diam.

## DEP-001 — audit dependency

Kategori: dependency/security. Temuan 2 critical, 8 high, 17 moderate, 4 low tetap terbuka; lihat `DEPENDENCY_TRIAGE.md`. Developer perlu memverifikasi applicability dan remediation. QA tidak mengubah dependency aplikasi sebagai bagian dari perbaikan alat ini.

## Batas penerimaan

Retest recovery/load merupakan verifikasi terarah, bukan full run baru. Check lain berstatus NOT_RUN dalam run terarah, dan hasil lintas fingerprint tidak digabung menjadi kelulusan. Penambahan diagnostik setup Windows dan ledger proses setelah retest juga mengubah fingerprint alat QA; quick run berikutnya memverifikasi revisi akhir. Manual keyboard/UAT, volume 100k, audit remediation, akses tim Drive, onboarding WSL dan staging tetap terbuka.
