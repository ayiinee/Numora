# Sprint IRT dan generator - 11 November 2026

**ENGINEERING DECISION - scope sprint yang ditetapkan pemilik:** generator dari Admin, IRT Tryout end-to-end, dan kalibrasi parameter item Drill per LEVEL. Dokumen ini membekukan baseline dan acceptance urutan 1; bukan laporan bahwa urutan 2-8 selesai atau persetujuan produksi. Salinan kedua repo harus identik.

## Baseline dan sumber kebenaran

Manifest: [IRT_SPRINT_BASELINE_2026-11-11.json](IRT_SPRINT_BASELINE_2026-11-11.json). Timestamp observasi UTC; jadwal bisnis Asia/Jakarta. SHA baseline menunjuk source sebelum dokumen ini ditambahkan, bukan SHA commit dokumen.

- Main remote dan deployment: `75d32d1cdc589a09f2a6c5d71a6928654ed53f60`.
- Kandidat boundary produksi Main: PR #157, `a4cf0ab941cb9a19987ca6b01ea869acb7cbe5ef`; masih open, mergeable, tujuh required checks success pada SHA itu. Kelulusan ini tidak mencakup perubahan Drill berikutnya.
- AI remote: `27cc419b33ef3717870de654707933b738260efc`.
- IRT candidate image/profile/policy dan source R dipin dalam manifest. Hash file adalah SHA256 byte blob Git; tree ID adalah identitas pohon Git. Keduanya bukan `inputDigest` request. Digest input tetap memakai recipe PostgreSQL existing.
- Empat service Main aktif. VPS: 8 CPU, RAM 7936 MiB, tersedia 6779 MiB pada observasi, tanpa swap. Stack riset API/worker/PostgreSQL sehat, masih producer `2df35c956960...`; bukan image kandidat baru. Kapasitas tersedia bukan sertifikasi beban.
- Status generator produksi dan enrollment belum diverifikasi pada langkah ini. Tidak membaca `.env`, credential, database peserta atau mengubah host.

Acuan perilaku: `AI_IRT_V2_CONTEXT.md`, `TRYOUT_IRT_DELIVERY_CONTEXT.md`, kontrak `irt-calibration-v1`, `GENERATOR_SERVICE_V2_HANDOFF.md`, serta ADR-011. Catatan OPEN akademik tidak menjadi approval karena ada fixture. Nomor migrasi di dokumen lama bersifat historis; ambil urutan canonical dari main terbaru dan verifikasi journal melalui operator, bukan nama file.

## Parity dan keterbatasan baseline

- Seluruh tracked blob kontrak `irt-calibration-v1` dan `irt-calibration-service-v1` identik berdasarkan tree Git kedua repo.
- Generator v1 berbeda pada `fingerprint.ts`: format dan cara membuang properti fingerprint (rest destructuring versus copy/delete). Perilaku tampak setara; ekuivalensi executable belum diuji ulang. Generator v2 hanya memiliki `contract.test.mjs` tambahan di Main. Schema/payload yang tersisa identik. Jangan mengklaim kedua direktori generator identik byte.
- Tryout producer dan adapter masih membatasi scope TRYOUT. Schema yang mengizinkan LEVEL tidak berarti engine/adopter Drill sudah tersedia.
- Evidence lama mencakup 2.000 peserta SCORED dan 2.100 peserta partial/fallback pada pin historis. Kandidat baru memiliki smoke empat peserta INSUFFICIENT, bukan acceptance ukuran penuh.
- Freeze 2.000 peserta pada rangkaian delivery berikutnya pernah gagal alokasi PostgreSQL `53200`. Status regresi pada candidate/host tujuan belum terbukti; retest termasuk acceptance, bukan dianggap sudah diperbaiki.
- Gate anchor memakai point estimates dan LRT/Holm; baseline tanpa DIF tertahan 20/30. Metode uncertainty kandidat belum diterima. Perubahan metode harus punya policy/profile baru dan evidence baru; tidak melonggarkan threshold diam-diam.

## Acceptance wajib tiga jalur

Semua pengujian baru memakai data sintetis dan database terisolasi. Setiap laporan mencatat SHA Main/AI, kontrak, policy/runtime/image, input/artifact digest, durasi, expected/actual, dan status PASS/FAIL/BLOCKED/NOT_RUN. Evidence lama hanya reusable jika pin dan bagian yang diuji cocok. Keberhasilan eksekusi dan kelayakan ilmiah adalah dua keputusan berbeda.

| ID | Skenario | Bukti selesai |
| --- | --- | --- |
| GEN-01 | Content Admin/Super Admin meminta generasi melalui aplikasi | Main membuat request durable; AI membaca source/config/stock terotorisasi; status dan provenance dapat dilihat Admin. |
| GEN-02 | Numerik, stok konseptual, dan media melalui kontrak yang relevan | Output tervalidasi, source/rubric/renderer/hash cocok; preview terbaca, media terverifikasi; penggunaan stok ulang ditandai. |
| GEN-03 | Preview lalu simpan/import paket DRAFT | Lineage serta versi dipertahankan; replay/parallel save mengembalikan objek sama. Tidak otomatis READY/publish/routing siswa. |
| GEN-04 | Auth salah, role terlarang, approval revoked, pin berubah, payload/media tampered | Ditolak tanpa membuat DRAFT atau receipt sukses. Token tidak mencapai browser/log. |
| GEN-05 | Timeout, respons HTTP hilang, lease usang, retry | Status durable dan fencing benar; reservasi/seed input tidak berubah pada retry transport; tidak ada duplikasi. |
| TRY-01 | Start/resume/paralel, grade final, batch tutup | Pin attempt authoritative dan satu attempt/siswa/batch; open batch/nonfinal grade tidak dispatch; coverage lengkap. |
| TRY-02 | Fixture dua arm 1000+1000; tiga arm 1000+1000+100 | Snapshot - HTTP - worker - R - artifact - adopter - finalizer - reader pada candidate dan host tujuan. Tidak menganggap fixture kurang data sebagai tes kalibrasi positif. |
| TRY-03 | Data kurang, linking gagal, peserta gagal presisi, teknis gagal | Outcome aktual dipertahankan; fallback sah per arm, bukan AI membuat nilai pengganti. Peserta gagal presisi pada arm layak memicu fallback seluruh arm sesuai policy. |
| TRY-04 | Maksimum valid nol dan exclusion akademik | UNSCORABLE bernilai null; item yang hanya gagal gate IRT tidak otomatis dikeluarkan dari fallback. Minimum coverage dan rounding mengikuti policy terpin. |
| TRY-05 | Adoption/finalization/publication replay dan late artifact | Exact coverage snapshot, receipt sukses tidak ditimpa konflik, rilis batch atomik, hasil+pembahasan satu gerbang, akses peserta lain ditolak. |
| DRL-01 | Fixture LEVEL sepuluh item, tiga anchor sama + tujuh focal | Versi item/rubric/paket dan source original-varian tepat; manifest/grade authoritative dapat dibekukan. |
| DRL-02 | First-valid, retry, exposure lintas fitur dan crossover | Retry tidak menjadi evidence baru meski versi/eksperimen berubah. Paparan beta Drill tercatat tanpa exclusion otomatis lintas fitur; crossover dipisah dari evidence utama. |
| DRL-03 | Request Admin/checkpoint pengumpulan yang dipin | Snapshot immutable dan dispatch idempoten. Bukan refit setiap submit. Tidak meminjam policy Tryout tanpa validasi scope Drill. |
| DRL-04 | Respons PG/MCMA/Kategori - R - artifact - adopsi item - Admin | Parameter 2PL D=1/GPCM, SE, count dan diagnostics sesuai kontrak; output respondents Drill kosong. Capability LEVEL baru diumumkan setelah implementasi dan tes lulus. |
| DRL-05 | Cohort cukup, data kurang, kategori langka, anchor/covariance/identifikasi gagal | Oracle/recovery terpin untuk kasus positif; gate gagal menghasilkan status/alasan sah, tanpa parameter valid palsu. Jumlah cohort dan seed ditetapkan sebelum run berdasarkan policy/sizing, bukan dipilih setelah melihat hasil. |
| ALL-01 | Fresh install dan upgrade dengan histori nonkosong | Migrasi forward diterapkan tepat sekali; isi attempts, jawaban, nilai historis dan XP sebelum/sesudah sama. |
| ALL-02 | Cancel, revoke, stale generation, duplicate notification, tampering, identity/coverage salah | Tidak ada sealing/adoption/publication usang atau lintas konteks; receipt/artifact immutable. |
| OPS-01 | Stack privat dengan limit tetap dan Main aktif | Auth/readiness benar, tidak ada API Docker socket/credential DB pada R; beban penuh tidak mengganggu Main; durasi/RAM/CPU/OOM dicatat. |
| OPS-02 | SIGTERM saat idle/aktif, restart, rollback | Tidak mengambil job baru setelah stop; R milik worker dibersihkan, execution usang tidak disegel, artifact/receipt/hasil terbit tetap utuh. |
| OPS-03 | Monitoring dan deadline | Backlog, heartbeat/lease, timeout/retry, rejection, coverage, fallback, deadline 72 jam tersedia; operator dan tujuan alert bernama. |

## Urutan dan proporsi usaha

**PROPOSED - estimasi perencanaan**, dengan pengaturan pengguna: 6.1 Sol light untuk kode dan high untuk plan. Angka berdasarkan besarnya perubahan, bukan benchmark kecepatan model atau jaminan selesai dalam satu malam. Total mencakup pengembangan dan verifikasi yang akan disepakati; tidak mencakup tunggu review tim, provisioning eksternal, atau studi ilmiah besar jika diwajibkan reviewer.

| Urutan | Pekerjaan | Proporsi |
| --- | --- | ---: |
| 1 | Baseline dan acceptance | 5% |
| 2 | Generator-Admin | 12% |
| 3 | Tryout end-to-end | 12% |
| 4 | Input dan policy Drill | 15% |
| 5 | Engine dan adopsi Drill | 22% |
| 6 | Request/status/hasil IRT di Admin | 10% |
| 7 | Operasi privat VPS | 9% |
| 8 | Penerimaan terpadu dan handoff | 15% |
| | Total | 100% |

Drill menyerap porsi terbesar karena membutuhkan implementasi scope baru, bukan aktivasi flag. Generator telah memiliki banyak komponen; proporsinya naik bila audit produksi menemukan mapping/konten yang belum siap.

## Anggaran, dependency dan batas aktivasi

Ledger lama: 10787.967/10800 detik; tersisa sekitar 12 detik. **Anggaran pengujian baru UNALLOCATED.** Jangan reset ledger atau memulai simulasi/CI/retest baru tanpa menetapkan alokasi. Urutan 1 hanya inspeksi metadata read-only dan pemeriksaan konsistensi dokumen, tidak mengklaim tes runtime baru lulus.

Dependency eksternal: review/merge #157; verifikasi journal migrasi oleh operator (runtime sebelumnya ditolak 42501); mapping/source/rubric/context generator terotorisasi; policy Drill dan Tryout yang diterima reviewer; approval ilmiah; credential privat dan role terbatas; operator dan alert tujuan. Nama yang belum disepakati tetap TBD. Masing-masing blocker dicatat dalam manifest.

Selesai teknis sprint: generator dari Admin dan dua jalur IRT dapat dijalankan sesuai scope dengan evidence acceptance. Produksi memerlukan penerimaan terpisah. Tidak ada self-adjustment, comparison PASS/DRIFT, IRT Indikator/Bab, theta individual Drill, perubahan mastery/nilai/XP, migrasi shared, publikasi peserta nyata atau deployment otomatis melalui dokumen ini.

Urutan 1 selesai dengan manifest dan acceptance terpin; urutan 2 baru dimulai setelah instruksi berikutnya. Main melalui PR ke main, AI mengikuti otorisasi push existing. Dokumen tidak memindahkan atau menghapus perubahan lokal/eksperimen pada worktree lain.
