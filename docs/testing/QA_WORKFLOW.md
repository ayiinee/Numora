# Workflow QA Numora

ENGINEERING DECISION — disepakati pengguna, 27 Oktober 2026.

## Persetujuan eksekusi tim

**ENGINEERING DECISION — persetujuan eksplisit pengguna, 27 Oktober 2026:** "Review PIC itu sudah selesai karena saya sudah approved semuanya, mereka cukup menjalankan". Review PIC untuk penggunaan workflow ini ditutup berdasarkan persetujuan pengguna. Anggota siswa, guru dan admin langsung mengikuti setup → skenario → laporan → langkah berikutnya; jangan meminta review PIC, chat developer atau persetujuan yang sama lagi sebagai syarat mulai.

Persetujuan menjalankan workflow dan hasil tes dicatat terpisah. Temuan dependency/aplikasi tetap dilaporkan sesuai bukti dan menjadi tindak lanjut; persetujuan tidak mengubah FAIL/BLOCKED/NOT_RUN menjadi PASS. Prasyarat lingkungan nyata dan kebutuhan spesifikasi kasus tetap diperiksa. Hanya kasus yang memang terhalang yang ditandai, sementara pemeriksaan independen berlanjut. Anggota memakai revisi panduan yang sama dan sesi lokal masing-masing.

## Mulai sampai laporan

1. Orientasi: ikuti AGENTS.md, QA_GUIDE dan sumber yang relevan; tentukan role dan sesi. Gunakan skill repository numora-qa; bila belum muncul di UI, baca file skill secara eksplisit.
2. Setup: pnpm qa setup --profile full menyalin template env hanya bila belum ada dan memeriksa alat serta konektivitas. Jangan menimpa konfigurasi, memasang OS/restart atau memigrasikan cloud diam-diam.
3. Definisi: pilih skenario dari pnpm qa list; cocokkan source, scope, expected result, akses, data dan edge case. Validasi manifest. OPEN memblokir kasus terkait.
4. Implementasi: audit tes lama dan rujuk yang benar. Tambahkan tes khusus di folder skenario. Patuh pada instruksi package/kontrak. Perbaikan aplikasi menjadi tugas developer.
5. Eksekusi: pnpm qa run --scenario SIS-001 --profile full. Checkpoint dan laporan disimpan setelah setiap check. Pemeriksaan independen tetap berjalan setelah failure.
6. Laporan: tampilkan hasil nyata, batas kesimpulan, temuan, satu rekomendasi dan maksimal dua alternatif. Berhenti setelah satu skenario.
7. Tindak lanjut: pilih skenario, triase, retest setelah perubahan, manual review, cleanup resource milik run, atau Bagikan.

## Sesi dan lanjut

pnpm qa start --role siswa membuat ID sesi. Pilih --session bila beberapa sesi cocok. status/continue menampilkan tindakan lokal selanjutnya dan tanda stale; Codex mengeksekusi tindakan yang sesuai setelah membaca hasil. continue tidak menjalankan instruksi bebas atau mengunggah laporan.

Fase sesi: STARTED, SETUP_REQUIRED, READY, RUNNING, AWAITING_SELECTION, INTERRUPTED. State per sesi berada pada qa/.local/sessions. Satu sesi hanya mempunyai satu proses eksekusi aktif. Lock usang hanya dibersihkan ketika PID tidak aktif.

Proses runner, API fixture dan consumer yang dibuat workflow dicatat pada qa/.local/processes/run-id dengan PID, parent dan waktu mulai/selesai, tanpa argumen berisi kredensial. status menampilkan catatan milik run. Cleanup menolak proses tercatat yang belum selesai dan masih hidup; periksa command/waktu mulai sebelum tindakan manual karena Windows dapat memakai ulang PID. Jangan menghentikan layanan umum atau PID hanya berdasarkan angka lama.

Saat terputus, pertahankan bukti, tandai interrupted dan mulai run verifikasi baru yang konsisten. Jangan mencampur PASS antar-run/versi. Chat baru membaca state dan handoff.md; perangkat lain menerima handoff/report yang disanitasi dan membuat state lokalnya sendiri.

Identitas mencakup SHA, isi tracked/untracked yang relevan, aturan, konfigurasi, manifest dan hash konfigurasi lingkungan lokal tanpa memuat nilainya. Perubahan membuat bukti lama stale. Retest tanpa perubahan memerlukan --diagnostic untuk investigasi eksplisit. Jangan mengulang sampai hijau tanpa alasan.

## Batas dan hasil

Full dibatasi 3600 detik setelah setup/build. Check terputus BLOCKED, yang belum dimulai NOT_RUN. Jangan diam-diam menurunkan volume, melewatkan kasus atau mengganti expected. Quick dapat berjalan saat layanan connected belum siap, tetapi full tetap belum lengkap.

Required/optional/not-applicable adalah keberlakuan; PASS/FAIL/BLOCKED/NOT_RUN adalah hasil. Machine evidence harus positif, sesuai file yang dipilih, memenuhi minimum dan tanpa skip wajib. Static check dinilai dari pemeriksaan yang benar-benar selesai. Benchmark menghasilkan baseline tanpa SLO produksi.

scenario.json adalah daftar case/check; result.json rekaman otomatis; report.md/handoff.md ringkasan. Artefak mentah tetap lokal. Temuan awal pada findings.md memerlukan triase aplikasi/tes/lingkungan/requirement. Retest ditautkan ke run sebelumnya dan tidak menghapus failure awal.

Manual keyboard/UAT dicatat pada manual.json setelah manusia benar-benar memeriksa build yang sama. Regenerasi report menggabungkan bukti manual yang masih sesuai versi tanpa menghapus rekaman otomatis. Axe tidak membuktikan seluruh kepatuhan aksesibilitas.

Hanya database, prefix dan proses milik run yang boleh dibersihkan: pnpm qa cleanup --run ID. Tidak menghentikan layanan umum atau menggunakan data pengguna nyata. Lihat strategi aktif untuk batas eksperimen dan recovery.

## Bagikan ke Google Docs

Jalankan hanya setelah pengguna memilih Bagikan untuk run tertentu.

1. share --scenario ID --run RUN menyiapkan permintaan lokal dengan reportHash; ini tidak mengunggah dari shell.
2. Gunakan konektor Google Drive/Docs milik operator. Jika tidak tersedia, pertahankan PENDING_CONNECTOR dan laporan lokal.
3. Baca metadata folder pada qa/config.json dan subfolder role yang benar. Verifikasi akses anggota saat onboarding; tidak memakai anyone/public.
4. Cari judul exact dan run ID sebelum create. Ketika outcome sebelumnya tidak jelas, baca kembali sebelum retry agar tidak duplikat.
5. Buat Google Doc native dan isi report yang disanitasi dengan heading/list/tabel native mengikuti skill Google Docs. Pindahkan ke folder role bila parent tidak didukung saat create.
6. Readback memverifikasi MIME Google Doc, run ID, SHA/fingerprint, hasil, limitation dan next action. Gunakan URL yang benar-benar dikembalikan.
7. Jalankan publication dengan --document-url dan --verified-run. Simpan publikasi terpisah dari hasil tes. Jika reportHash berubah, revisi dokumen milik run yang sama dengan catatan koreksi dan readback ulang.

Komentar/perubahan Google Docs tidak otomatis mengubah hasil repository. Bagikan tidak memberi izin mengirim email/pesan, membuat issue, push, merge atau deploy.

## Staging dan role lain

Staging NOT_CONFIGURED sampai URL, SHA web/API, akun, OAuth, isolasi dan izin terverifikasi. Database cloud Development bukan staging. Google login nyata tidak dibuktikan fixture. Beban/fault/restore tetap lokal sampai target khusus disepakati.

Guru/admin memakai template dengan ID GRU/ADM dan alur aktual. XROLE memiliki satu pemilik utama. Manifest tanpa implementasi tes bukan skenario siap jalan. Pembagian PIC infra/helper/CI disepakati tim dan tidak otomatis menjadi tugas QA Admin.

## Isolasi eksperimen nonfungsional

Setiap eksperimen volume, velocity, variety dan recovery membuat clone database disposable dari baseline run, menggunakan suffix yang dicatat pada resource ledger. Backlog eksperimen besar tidak ikut menjadi data awal eksperimen berikutnya. Source baseline harus tidak memiliki koneksi aktif saat clone; bila prasyarat ini tidak terpenuhi, laporkan Blocked dan jangan memaksa mematikan koneksi lain.

Consumer diperiksa dalam batch kecil agar batas drain diperiksa berkala. Backlog yang belum habis pada batas eksperimen dilaporkan Blocked/incomplete, bukan kehilangan data. Cleanup memverifikasi nama parent, clone dan restore terhadap identitas run. Server fixture/API test-only bind ke loopback IPv4 untuk kompatibilitas browser, Node dan k6 pada Windows.

Mode build low-memory menggunakan pilihan yang memang sudah disediakan next.config.ts; hasil dan fingerprint mencatat konfigurasi itu. Ini bukan pengukuran kapasitas produksi.

## Regresi optimasi SIS-001 — 27 Oktober 2026

ENGINEERING DECISION — implementasi optimasi yang diminta pengguna: worker memproses maksimal sepuluh event per statement atomik, dengan rollback kelompok dan fallback per event bila terjadi kegagalan. Limit publik, retry cooldown, SKIP LOCKED dan deduplikasi tetap berlaku. Ukur jumlah statement serta event yang benar-benar diakui; jangan mengasumsikan satu BEGIN eksplisit untuk setiap event atau menambah limit untuk menyatakan lulus.

Pembentukan hasil Drill memakai satu projection untuk metadata, reward, hitungan dan soal. Pencatatan delivery tetap setelah commit dan kegagalannya tetap terlihat. Autentikasi dan rekomendasi merupakan query terpisah. Verifikasi kesetaraan DTO, reward historis/legacy, ownership, rollback dan retry melalui tes database nyata sebelum membandingkan latensi.

Runner diagnostik harus mengambil akar repository aktif dari cwd dan memvalidasi guard lokal; jangan memakai path checkout lama yang tertanam di skrip investigasi. Simpan ID attempt untuk memisahkan respons yang diakui klien dari status GRADED. Tes tambahan di luar manifest yang kehilangan fixture tetap dicatat BLOCKED/NOT_RUN secara terpisah, tanpa mengubah kelulusan kasus wajib atau menyatakan seluruh suite lulus.
