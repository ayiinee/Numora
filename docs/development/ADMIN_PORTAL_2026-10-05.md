# Portal Admin terpadu — 5 Oktober 2026

**PRD RULE:** PRD v0.6 §3.2–3.3, §18–19 dan §23.7 menetapkan login internal Admin, tiga subrole (`SUPER_ADMIN`, `OPERATIONS`, `CONTENT_DATA_MODERATION`), akses modul sesuai permission, dan audit tindakan penting. Admin Operasional tidak mengubah konten/hasil akademik; Content/Data/Moderation hanya mendapat view operasional terbatas.

**ENGINEERING DECISION — instruksi Aini:** hapus mock `/admin/preview` dan tautannya, gunakan satu portal `/admin` serta shell bersama. Login internal berada di `/admin/login`; autentikasi tetap melalui Supabase Auth dan identitas/assignment tetap dari NestJS. Tidak menyediakan registrasi Admin atau assignment dari browser. Tidak melakukan backfill atau mengubah assignment Cloud.

Navigasi awal mengelompokkan modul existing: Ringkasan, Sekolah & credential, Pengguna & kelas, Konten & assessment, dan Impor JSON. Pilihan modul memakai assignment identity; menu aktif menggunakan route paling spesifik. Ringkasan tidak mengunduh seluruh dataset operasional/konten.

Preview soal hasil impor tetap menjadi alur internal Konten di `/admin/content/preview-sessions/:id`, bukan mock desain. Import tetap DRAFT, skor tetap null, dan feature flag/media gate existing tetap berlaku.

**OPEN / implementation gap:** tahap ini menyatukan entry point dan navigasi, bukan menyelesaikan seluruh RBAC. Endpoint konten tetap dilindungi `ContentAdminGuard`; endpoint operasional existing masih memakai pemeriksaan Admin aktif dan memerlukan pembatasan subrole di server serta DTO view terbatas sebelum acceptance matriks v0.6. Menyembunyikan menu tidak memberi jaminan otorisasi tambahan. Pengelolaan akun/permission Super Admin, granular audit scope, dan limited operational view Content Admin belum tersedia. Tidak tampilkan aksi untuk modul yang belum dibuat.

## Verifikasi

**ENGINEERING DECISION — follow-up Aini:** `pnpm qa:accounts` tetap menyediakan enam akun lama (satu Admin Content). `pnpm qa:admins` menambahkan dua fixture QA khusus Super Admin/Operasional, dengan vault terpisah `.qa-seed/admin-roles/accounts.json`. CLI hanya menerima sandbox Development yang dipin dan koneksi operator; profil/assignment ditransaksikan dan diaudit dengan actor QA Content existing. Tidak mengganti password/assignment akun lama dan tidak memperluas permission endpoint. `--check` melakukan preflight baca saja. Bila Auth sukses tetapi penulisan profil gagal, vault/journal dipertahankan untuk replay; Auth dan PostgreSQL tidak diklaim atomik lintas layanan.

- Login internal memanggil provider Auth; role dan subrole berasal dari identity API, bukan email/JSON form.
- Admin masuk ke `/admin`; Student/Teacher diarahkan ke area sendiri. Akun tanpa assignment diberi penjelasan dan pemeriksaan ulang akses.
- Menu konten hanya tampil dengan capability `CONTENT_MANAGE`; pintasan operasional ditampilkan untuk Super/Operations.
- Mock lama menghasilkan 404; preview impor tetap tersedia melalui modul Konten.
- Uji desktop/mobile, keyboard, status loading/error/disabled/denied, logout, dan indikator route nested.

Acceptance Cloud importer/R2, review Curriculum, dan QA independen tetap mengikuti bukti sebelumnya.

## Hasil pengujian lokal

- Web: **199 tes PASS**, tanpa skip. Sesudah penyesuaian selector tipe, suite portal 10 tes dijalankan ulang dan PASS.
- `pnpm lint`, `pnpm typecheck` seluruh workspace, build web produksi (`.next-e2e`), contract type freshness, dan `git diff --check`: **PASS**.
- Browser produksi: 45 skenario Admin/Auth diperiksa. Run awal meluluskan 40; lima kegagalan selector diperbaiki (mobile nav memiliki label berbeda dan Next route announcer juga memakai role alert). Rerun terkait plus lintas role meluluskan 11/11. Total **49 skenario unik terverifikasi**, termasuk empat pemeriksaan lintas Student/Teacher/Admin.
- Browser memakai SDK/AuthProvider dan HTTP clients nyata dengan endpoint provider/API fixture **TEST ONLY**, bukan acceptance Cloud. Tidak ada write ke database/role/media Cloud.
- Screenshot dan pemeriksaan overflow disimpan lokal di `.tmp/redesign-phase9/portal-*-390.png`, `portal-*-1280.png` serta `.tmp/redesign-phase8/admin-internal-login-{390,1280}.png`. Ringkasan Content mobile, Super desktop, dan kedua login diperiksa secara visual. Panel existing juga diuji 320–1440 px.
- Connected PostgreSQL chain tidak dijalankan ulang untuk perubahan frontend ini. Ekspektasi redirect Admin pada suite tersebut diperbarui ke `/admin`; bukti satu SHA sebelumnya tetap historis dan tidak diklaim sebagai bukti perubahan ini.

## Follow-up fixture QA tiga subrole

**ENGINEERING DECISION — follow-up lokasi kredensial:** Aini meminta Content Admin dipindahkan juga ke `.qa-seed/admin-roles/accounts.json`. Layout terkini memiliki `accounts.admin`, `accounts.adminSuper`, dan `accounts.adminOperations` di satu vault Admin; file root hanya lima Guru/Siswa. Pembaca smoke menggabungkan kedua vault di memori agar workflow enam actor dan manifest seed tetap kompatibel. Kedua grup provisioning memakai lock root yang sama, menjaga journal/recovery dan tidak menyalin ulang Admin ke file root saat replay atau rotation. Bukti pemisahan dua akun tambahan di bawah adalah hasil awal sebelum konsolidasi ini.

**Verifikasi konsolidasi:** `pnpm test:checks` **68 PASS**, integration PostgreSQL **PASS** tanpa skip, dan lint **PASS**. Pemindahan terputus, konflik dua salinan, lock lintas grup, dan recovery journal rotasi legacy diuji. `pnpm qa:accounts` nyata dan replay berhasil; fingerprint seluruh delapan kredensial serta manifest enam actor tidak berubah, dan file root tidak lagi memuat Admin. Preflight operator `qa:admins --check` memakai layout baru berhasil. Tidak ada perubahan assignment/role Cloud dalam konsolidasi ini.

- `pnpm test:checks`: **63 PASS**, tanpa skip. Termasuk pemisahan vault, recovery Auth ambigu, penolakan identitas asing, guard target dan preflight tanpa write.
- `pnpm test:qa-admins`: **PASS** pada PostgreSQL 16 localhost terisolasi dengan seluruh migrasi committed. Membuktikan assignment profil existing yang belum diberi subrole, concurrent replay, actor/owner guard, konflik profil, dan rollback seluruh profil/audit saat audit kedua gagal. CI menyertakan suite ini; status CI remote belum diklaim.
- `pnpm lint` dan `git diff --check`: **PASS**. Tidak ada perubahan schema/kontrak untuk fixture tambahan ini.
- Sandbox Development `pkamenfnwmoeisccnrnk`: koneksi operator existing diverifikasi lalu digunakan sementara hanya dalam proses provisioning; `.env` tidak diubah. Dua identitas QA tambahan dibuat dan replay mempertahankan tepat **dua audit assignment**. Hash vault enam akun lama tidak berubah.
- Login Supabase nyata dan production identity service diverifikasi untuk Content, Super Admin, dan Operations; masing-masing `ADMIN/ACTIVE` dengan subrole yang sesuai. Capability `CONTENT_MANAGE` diberikan pada Content/Super, tidak pada Operations. Kredensial hanya di file ignored lokal.
- Verifikasi ini tidak mengklaim pengujian browser Cloud, acceptance matriks permission seluruh endpoint, maupun smoke importer/R2 selesai. Akun tambahan tidak mengubah assignment akun Content lama.
