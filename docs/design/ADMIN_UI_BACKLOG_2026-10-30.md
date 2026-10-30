# Backlog UI/UX Admin — 30 Oktober 2026

**ENGINEERING DECISION — instruksi pemilik, 30 Oktober 2026:** rapikan backlog UI dan kriteria perbaikan sambil menunggu integrasi runtime/QA. Pekerjaan sekarang berupa dokumentasi; kode UI dilanjutkan setelah fondasi integrasi yang disepakati masuk main.

**PROPOSED:** urutan, prioritas dan kriteria penerimaan berikut adalah rencana pelaksanaan, bukan pernyataan bahwa semua halaman rusak. Audit boleh memperkecil cakupan atau menutup kandidat tanpa perubahan kode jika kriteria sudah dipenuhi.

## Acuan dan batas bukti

- Baseline Admin: hasil #110 pada main `ca28a87`; snapshot review #111: `4956199`. Periksa ulang SHA/status sebelum implementasi; ini bukan status GitHub live.
- Review snapshot #111 memiliki 155/155 tes regresi Admin lokal lulus dengan fixture dan 319/319 tes browser CI lulus. Ini bukan pengujian backlog baru, penerimaan layanan Development nyata, atau bukti deployment.
- Satu temuan kosmetik terkonfirmasi: ikon pencarian sekolah menimpa placeholder untuk Operations pada 390×900. Artefak sebelum #111 menunjukkan masalah yang sama; bukan regresi integrasi baru.
- Generator, Impor, Analytics dan Request IRT masih memerlukan audit perombakan baru. Inventaris source/tes existing adalah peta audit, bukan bukti kegagalan.
- Aturan produk mengikuti [PRODUCT_CONTEXT](../product/PRODUCT_CONTEXT.md), [OPEN_DECISIONS](../product/OPEN_DECISIONS.md), [PRD_MAPPING](../product/PRD_MAPPING.md) dan kontrak modul. Visual mengikuti keputusan pemilik serta [design system](NUMORA_UI_DESIGN_SYSTEM.md).

## Baseline yang dipertahankan

| Area                 | Acuan                                                  | Yang dipertahankan                                                      |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Akun Admin           | [Desain Akun Admin](ADMIN_ACCOUNTS_UX_2026-10-27.md)   | Daftar lebih awal, tab akun/undangan, dialog dan simpan akses eksplisit |
| Sekolah & credential | [Desain sekolah](ADMIN_SCHOOLS_UX_2026-10-27.md)       | Daftar/detail, URL context, konfirmasi dan kerahasiaan token            |
| Pengguna & kelas     | [Desain pengguna/kelas](ADMIN_PEOPLE_UX_2026-10-27.md) | Filter, detail, riwayat dan batas baca saja sesuai izin                 |
| Konten & assessment  | [Desain konten](ADMIN_ASSESSMENT_UX_2026-10-27.md)     | Soal lengkap, matematika sumber, versi dan pemisahan review/publikasi   |
| Pretest Authoring    | [Desain Pretest](ADMIN_PRETEST_UX_2026-10-27.md)       | Direktori/detail, picker lintas halaman, urutan pin, revisi dan arsip   |
| Shell Admin          | [Keputusan navigasi](README.md)                        | Ringkasan tetap dihapus; assignment landing, scroll menu dan keyboard   |

Status ini berarti baseline implementasi yang dipertahankan, bukan pengesahan seluruh layanan nyata atau kesiapan rilis. Jangan merombak ulang halaman yang sudah disetujui tanpa temuan baru.

## Arah desain

**ENGINEERING DECISION — persetujuan pemilik, 27 Oktober 2026:** pertahankan arah Akun Admin yang ringkas, profesional, mudah dipindai dan tidak membingungkan.

- Kanvas abu terang, permukaan putih, ungu Numora dan Plus Jakarta Sans lokal. Gunakan token/primitive existing serta CSS khusus halaman.
- Hierarki baseline: judul desktop 28/36, bagian 18/26, isi 14/22, metadata 12/18; judul mobile 24/32 dan input mobile 16 px sesuai kebutuhan. Keputusan Numora mengungguli rekomendasi generik.
- Direktori menampilkan konteks singkat, aksi utama dan awal daftar pada viewport pertama ketika ada data. Form panjang dibuka saat diperlukan.
- Identitas/status/aksi tetap terbaca pada tabel desktop maupun susunan mobile. UUID, provenance panjang dan detail teknis dapat dibuka bertahap; blocker penting tetap terlihat.
- Hindari banner besar, kartu bertingkat, statistik rekaan, form permanen yang mendominasi dan animasi dekoratif. Tidak membuat Ringkasan pengganti.

Panduan UX Pro Max yang dipakai untuk checklist: label form, feedback submit, pemulihan error, fokus keyboard dan tabel responsif. Tidak membuat design system baru.

## Prioritas, status dan urutan

P0 berarti risiko akses/data/keamanan; P1 berarti alur utama terhalang atau tindakan berisiko salah; keduanya memerlukan bukti konkret dan triase pemilik. P2 adalah perbaikan kejelasan/konsistensi/visual yang direncanakan. P3 adalah penyempurnaan opsional. Belum ada P0/P1 baru yang dikonfirmasi oleh penyusunan backlog ini.

**CONFIRMED** berarti temuan dengan bukti. **AUDIT_FIRST** berarti masalah/cakupan harus dibuktikan sebelum mengubah kode. **GATE** berarti kriteria lintas item. Seluruh implementasi masih **WAITING_INTEGRATION** saat dokumen disiapkan, mengikuti urutan yang disepakati pengguna.

| Urutan      | ID    | Prioritas | Item                                                  | Status bukti | DRI                          |
| ----------- | ----- | --------- | ----------------------------------------------------- | ------------ | ---------------------------- |
| 1           | UI-01 | P2        | Jarak ikon/teks pencarian sekolah Operations          | CONFIRMED    | Ferdi                        |
| 2           | UI-02 | P2        | Generator paket: konfigurasi, progres dan hasil       | AUDIT_FIRST  | Ferdi                        |
| 3           | UI-03 | P2        | Impor soal: langkah, preview dan pemulihan            | AUDIT_FIRST  | Ferdi                        |
| 4           | UI-04 | P2        | Analytics: hierarki metrik dan keadaan data           | AUDIT_FIRST  | Ferdi                        |
| 5           | UI-05 | P2        | Request IRT & publikasi: status, blocker dan tindakan | AUDIT_FIRST  | Ferdi                        |
| Setiap item | UI-06 | P2        | Konsistensi, responsif dan aksesibilitas              | GATE         | Ferdi pada area yang berubah |

UI-01 adalah perbaikan kecil dengan repro; UI-02 menjadi audit halaman berikutnya. Urutan halaman mengikuti menu Admin. Temuan P0/P1 baru boleh mendahului urutan setelah dampaknya dibuktikan. Tidak menetapkan tanggal selesai atau mengambil alih pemilik backend/QA.

## UI-01 — Pencarian sekolah Operations

**Repro:** `/admin/schools`, Operations, 390×900; ikon bertumpuk dengan awal placeholder `Nama atau kode sekolah`. Bukti lokal: `D:/CodexCache/Numora-pr111-admin-review-20261030/browser-results/admin-schools-ux-School-wo-c0d9d-visual-audit-for-OPERATIONS/schools-list-390.png`. Lampirkan screenshot sintetis baru pada PR perbaikan agar tersedia bagi reviewer checkout lain.

**Cakupan:** audit cascade `admin-schools.css`, `admin-operations.css` dan `admin-management.css`, lalu perbaiki selector sumber yang tepat; jangan memberi padding global ke semua form.

**Kriteria penerimaan:**

1. Teks/caret dimulai setelah batas kanan ikon dengan ruang minimal 8 px, baik placeholder maupun input terisi.
2. Lulus pada 320/390/768/1440 px untuk Operations dan Super Admin; tidak ada overflow halaman atau kehilangan fokus keyboard.
3. Submit/reset pencarian, URL context, reload dan Back tetap sesuai baseline tanpa endpoint atau mutasi baru.
4. Tes sekolah memeriksa geometri input terhadap ikon; pemeriksaan sekadar visible tidak cukup untuk menangkap overlap.

**Verifikasi:** kasus terdampak pada `admin-schools-ux.spec.ts`, screenshot sebelum/sesudah, serta regresi Operations/sidebar bila selector bersama berubah.

## UI-02 — Generator paket

**Tujuan:** Admin mengetahui apa yang dibuat, mengapa belum bisa dibuat, dan langkah setelah hasil tersedia.

**Peta:** `/admin/content/generator`, detail hasil existing; `generator-packages.tsx`, `generator-import-workflow.tsx`, `generator-package-api.ts`. Route `/admin/content/generator/results` sudah redirect ke generator; jangan membuat direktori hasil kedua.

**Kriteria penerimaan:**

1. Jenis, scope, judul dan jumlah/kelayakan mengikuti katalog server; tidak menebak difficulty, mapping atau aturan akademik.
2. Konfigurasi, proses aktif dan hasil memiliki hierarki jelas. Status/alasan disabled terbaca tanpa membuka UUID atau log teknis.
3. Pending/success/error jelas; klik ganda dicegah dan kegagalan mempertahankan input/idempotency key sesuai operasi existing.
4. Preview memperlihatkan stem, seluruh pilihan/pernyataan dan media yang tersedia. Export/generate tidak disebut sebagai publikasi atau penilaian.
5. Handoff ke Impor memakai package identity dan entry preview/tujuan existing. Back/reload tidak memulai generate baru; fitur yang nonaktif memiliki sebab yang jelas.

**Verifikasi:** baseline desktop/mobile; keadaan berjalan/gagal/selesai, reload, handoff dan 401/403. Rujuk tes generator/component/importer existing; tambah tes browser untuk celah interaksi yang terbukti.

## UI-03 — Impor soal

**Tujuan:** Admin memahami posisi proses, masalah yang harus diperbaiki dan status simpan.

**Peta:** `/admin/content/imports`, jalur JSON dan generator; `content-import.tsx`, `content-import-steps.tsx`, `content-import-json.tsx`, `content-upload-panels.tsx` dan preview existing.

**Kriteria penerimaan:**

1. Empat langkah existing — Upload Excel, Preview & tujuan, Pemetaan & validasi, Publish — menjelaskan posisi/next action. JSON/generator tetap masuk melalui jalur yang berlaku tanpa kewajiban upload ulang Excel.
2. File/session, tujuan dan status simpan mudah dipindai; riwayat/resume mudah ditemukan tanpa mendominasi tugas aktif.
3. Preview mempertahankan pilihan/pernyataan, matematika dan provenance. Source tidak diperbaiki atau dinilai diam-diam; masalah media/validasi menunjukkan lokasi, penyebab dan cara koreksi.
4. File JSON tetap disabled sampai detail paket siap; namespace/pilihan tidak hilang akibat respons terlambat. Gagal simpan/409 mempertahankan draft untuk koreksi.
5. Preview tetap unscored. Tersimpan/DRAFT, siap direview dan terbit dibedakan; satu konfirmasi Publish serta gate server/jadwal/approval existing dipertahankan.
6. Riwayat, pagination, refresh/resume dan Back tetap bekerja; credential tidak ditambahkan ke URL atau browser storage.

**Verifikasi:** `admin.spec.ts` untuk detail paket tertunda, namespace dan preview; publisher serta JSON/Excel tests yang terdampak. Uji happy path dan failure/recovery pada setiap tahap yang berubah.

## UI-04 — Analytics

**Tujuan:** Admin yang berwenang memahami arti angka dan batas datanya.

**Peta:** `/admin/analytics`, `analytics.tsx`, DTO generated dan tes IRT/analytics existing.

**Kriteria penerimaan:**

1. Kelompokkan metrik existing menurut konteks tugas; label, satuan dan waktu pembaruan jelas. Angka kumulatif tidak disajikan seolah periode tertentu.
2. Nol yang sah berbeda dari tidak tersedia; loading, empty dan gagal memuat memiliki feedback serta recovery yang sesuai.
3. Tidak membuat tren/persentase/grafik yang memerlukan data baru. Kebutuhan endpoint tambahan menjadi dependency terpisah.
4. Capability/redirect tiap subrole dipertahankan; Analytics tidak dikembalikan untuk role yang dibatasi dan tidak menjadi Ringkasan pengganti.
5. Metrik terbaca di mobile tanpa kartu bertingkat atau overflow horizontal halaman.

**Verifikasi:** fixture 0/null/error, generatedAt, permission/redirect dan `admin-irt-analytics.spec.ts`. Tampilan tidak membuktikan akurasi agregasi backend.

## UI-05 — Request IRT & publikasi

**Tujuan:** Admin membedakan request/execution/batch, memahami blocker dan memilih tindakan yang benar.

**Peta:** `/admin/irt`, `irt-requests.tsx`, DTO generated, tes IRT existing dan [runbook IRT v3](../development/IRT_V3_RUNBOOK.md).

**Kriteria penerimaan:**

1. Daftar/status penting menjadi fokus awal; konfigurasi/detail teknis dibuka sesuai kebutuhan dengan konteks batch tetap terlihat.
2. Request, execution, adoption dan publikasi tidak disatukan sebagai “selesai”. Alasan server diberi penjelasan ringkas tanpa mengubah makna; detail asli tetap dapat dibuka.
3. Blocker menunjukkan penyebab dan tindakan yang memang tersedia. Menunggu Data/AI atau flag environment disebut secara spesifik.
4. Retry/adopt/publikasi, jika diizinkan endpoint existing, mempertahankan eligibility, konfirmasi, pending dan idempotensi. Membuka detail tidak memicu mutasi.
5. Timestamp/SLA memakai data server dengan zona jelas; tidak membuat perhitungan ilmiah, ambang statistik atau kebijakan fallback/rilis baru di frontend.
6. Refresh/Back menjaga konteks; 401/403 menutup payload dan tindakan sensitif.

**Verifikasi:** disabled/menunggu/gagal/berhasil/belum layak adopsi, akses Operations/null dan kehilangan akses. Penerimaan ilmiah tetap milik Data/AI.

## UI-06 — Kriteria bersama dan loop audit

Checklist berikut **PROPOSED** untuk setiap item mendatang; belum merupakan hasil tes backlog baru.

- Catat role/capability, awal/akhir tugas, API existing, masalah terbukti dan hal yang dipertahankan. Backend/kontrak baru menjadi handoff terpisah.
- Tinjau 320/390/768/1024/1440 px; dialog juga pada 390×568 dan zoom 125%. Tidak ada overflow horizontal halaman. Tabel lebar hanya boleh memakai scroll lokal yang jelas tanpa memotong aksi penting.
- Label terhubung ke input, fokus terlihat, Tab logis, dialog menangani Escape/fokus kembali, status tidak hanya memakai warna, tombol/ikon interaktif minimal 44 px. Kontras baseline 4,5:1 teks biasa dan 3:1 teks besar.
- Loading, data kosong, pencarian kosong, validation/dependency error, pending, success, disabled dan denied dibedakan. Error dekat isian dengan langkah pemulihan; placeholder bukan satu-satunya label.
- Simpan eksplisit; form/pagination tidak memicu mutasi tak disengaja. Network error mempertahankan draft; logout/identitas berubah/401/403 membuang data sensitif sesuai baseline. Respons lama tidak menghidupkan workspace kembali.
- DTO generated dan nilai/status server tetap canonical; ukuran halaman/offset mengikuti modul. Jangan mengklaim total global dari jumlah baris halaman. Versi/pin/result/XP historis, source akademik dan token dipertahankan.
- Gunakan primitive existing dan CSS scoped; pisahkan presentasi dari data/aturan domain. Refactor hanya untuk kebutuhan konkret; tidak menambah framework atau mengganti shared token tanpa regresi consumer.

Loop per item: **audit baseline + SHA → cakupan/desain kecil → implementasi → tes interaksi dan audit screenshot → koreksi serta retest terdampak → review**. Jika audit sudah memenuhi kriteria, tutup kandidat dengan bukti tanpa merombak ulang. Simpan bukti gagal dan bedakan masalah aplikasi/tes/lingkungan/requirement.

Item selesai setelah AC terbukti, lint/typecheck/build dan tes terkait lulus, serta review tercatat sesuai Definition of Done repository. Perubahan shared shell/CSS/pagination memerlukan regresi consumer terdampak. Bukti fixture, connected, CI, manusia dan deployment dicatat terpisah; jangan mengulang seluruh suite hanya untuk dokumentasi.

## Gate integrasi dan handoff

- **Pembagian yang disepakati pengguna:** Aini integrasi/migrasi/guard XP/tes; Ferdi review dan UI Admin; Farel runtime/QA dan verifikasi. Keputusan ilmiah tetap pada Data/AI. Backlog ini tidak memindahkan tanggung jawab mereka.
- Sebelum kode UI: periksa hasil integrasi yang disepakati, fondasi Admin masuk main dengan pemeriksaan gabungan yang berlaku, lalu sinkronkan checkout tanpa menimpa pekerjaan lokal. Tidak mensyaratkan tiga tombol merge terpisah untuk #102/#109/#111.
- Catat SHA main baru dan smoke alur Admin relevan sebelum perubahan; jika head bergeser dari snapshot review, periksa delta. Penerimaan deployment/layanan eksternal memiliki bukti terpisah.
- Temuan permission, persistensi, scoring, migrasi atau kebutuhan data baru ditriase kepada pemilik dengan repro. QA lain yang bukan dependency Admin tidak otomatis memperluas backlog UI.

Template handoff/penutupan: **ID; DRI; route/role; branch/PR/SHA; repro atau desain akhir; AC; tes/screenshot; batas fixture/connected; dependency/OPEN; reviewer; next action**. Dokumen ini tidak otomatis membuat issue, mengirim pesan, push, merge atau deploy.

**Langkah berikutnya setelah gate terpenuhi:** verifikasi/perbaiki UI-01, kemudian audit Generator paket (UI-02). Bila muncul blocker baru, triase bukti dan ubah urutan secara eksplisit.
