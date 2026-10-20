# Temuan flow Guru — increment polish FE (Aliwafa)

Tanggal: 20 Oktober 2026. Basis kode: `main` pada `6ba9638`. Metode: baca dokumen produk/design/joblist, pembacaan kode FE/BE, pemeriksaan `packages/contracts/openapi/openapi.json`, dan pelaksanaan gate FE. Tidak ada runtime cloud, OAuth nyata, atau audit database yang dilakukan di sini.

Rujukan pembagian: [SE Joblist 19 Oktober](SE_JOBLIST_2026-10-19.md) butir AW-01, AW-03 dan §7. Dokumen ini melaporkan temuan; ia **tidak** menetapkan keputusan produk dan **tidak** mengklaim kapabilitas sudah selesai.

Aturan "satu temuan, satu pelaksana" berlaku. Setiap tiket di bawah menyebut pemilik tindak lanjut. FE Guru tidak mengubah kontrak, DTO, atau skema milik domain lain.

## GF-01 — Kontrol Guru atas ban/unban, takeover, dan leave belum punya jalur UI

Status: **BLOCKED on keputusan scope** (Farel/FR-01, FR-04). Prioritas usulan: **P1**.

**PRD RULE** yang berlaku (v0.6):

- §5.3 — Ban menghapus membership dan mencegah rejoin sampai **unban**; hanya Guru kelas aktif yang melakukan ban/unban.
- §6.1 — Takeover dilakukan **di dalam Create Class**: Guru memilih opsi mengambil alih, memasukkan kode kelas lama, sistem memvalidasi kode dan kesesuaian sekolah.
- §6 — Guru keluar sekolah membuat kelas tetap aktif tanpa Guru; monitoring dan feedback berhenti.

**Fakta kode terverifikasi.** Endpoint dan kontraknya sudah ada dan sudah punya aturan otorisasi di sisi server:

| Kapabilitas | Implementasi API | Terbit di OpenAPI | Konsumen FE Guru |
| --- | --- | --- | --- |
| Takeover kelas | `apps/api/src/modules/classes/classes.controller.ts:97-105` | `/api/v1/classes/takeover` | **0** |
| Keluar kelas | `classes.controller.ts:108-115` | `/api/v1/classes/{classId}/leave` | **0** |
| Ban siswa | `classes.controller.ts:117-125` | `/api/v1/classes/{classId}/students/{studentId}/ban` | **0** |
| Unban siswa | `classes.controller.ts:127-133` | `/api/v1/classes/{classId}/students/{studentId}/unban` | **0** |
| Keluar sekolah | `schools.controller.ts:75-81` | `/api/v1/schools/{schoolId}/leave` | **0** |

`git grep` atas `takeover`, `ban`, `unban`, `leave` di `apps/web/src` tidak menemukan satu pun pemanggil.

**Dampak yang dapat dijelaskan ke QA.** Roster Guru hanya mengambil anggota dengan `leftAt IS NULL` (`apps/api/src/modules/classes/classes.service.ts`, metode `students`). Karena tidak ada UI ban, Guru tidak dapat memban lewat produk. Seandainya ban dilakukan lewat API, siswa itu hilang dari roster dan **tidak ada layar tempat Guru menemukan atau meng-unban-nya** — jadi kemampuan §5.3 saat ini adalah jalan buntu, bukan sekadar fitur yang belum rapi.

**Kenapa FE tidak langsung mengerjakan.** Joblist AW-03 menyatakan kontrol yang masih deferred secara visual harus difinalkan lebih dulu pada flow review; §9 juga mencatat prioritas leave/takeover sebagai keputusan yang belum boleh diasumsikan. Revisi UI 5 Oktober secara eksplisit menunda rename, leave, dan takeover.

**Keputusan yang dibutuhkan dari Farel, per kontrol:** masuk increment ini atau tetap deferred. Bila masuk, FE butuh dari Andi (AD-02): bentuk request/response takeover pada Create Class, dan cara roster menampilkan anggota yang di-ban (kolom status atau daftar terpisah) karena `StudentSummaryDto` saat ini hanya memuat `id` dan `displayName`.

**Batas:** tiket ini tidak menyatakan endpoint tersebut sudah lulus uji otorisasi; itu lingkup RY-01/FR-02.

## GF-02 — Undangan kelas lewat link belum ada di kontrak maupun FE

Status: **READY untuk pemilik kontrak** (Andi, AD-02). Prioritas usulan: **P1**.

**PRD RULE** §5.2: "Sistem menghasilkan kode, link, dan QR." §20 mencatat data minimum Class memuat `code, link/QR`.

**Fakta terverifikasi.**

- Kode: ada. `GET/POST /classes` mengembalikan `joinCode` dan FE Guru menampilkannya.
- QR: ada, tapi payload-nya **kode mentah**, bukan URL. `apps/web/src/features/monitoring/teacher-class-tools.tsx` memanggil `QRCode.toDataURL(code, …)`, dan UI-nya sendiri menulis "QR ini bukan tautan otomatis untuk bergabung."
- Link: **tidak ada**. `git grep` atas `joinUrl`, `join_url`, `inviteUrl`, `shareUrl` di `apps`, `packages`, dan `docs` menghasilkan nol. Tidak ada satu pun kode Guru yang menyusun URL `/student/join?code=…`, padahal sisi penerima sudah ada dan diuji (`apps/web/src/app/student/join/page.tsx`, `features/onboarding/class-join.tsx`, dengan regex kode dan lima kode kegagalan server).

**Usulan bentuk kontrak (keputusan tetap milik Andi sebagai pemilik endpoint).**

- Tambahkan `joinUrl: string` pada `ClassSummaryDto`, `CreatedClassDto`, dan respons `GET /classes/{classId}/students` — disusun server dari origin yang dipercaya, bukan dari nilai browser.
- Alasan field server yang menghasilkan: `AUTHORIZATION.md` dan `AGENTS.md` membatasi FE sebagai penyaji aturan, dan QR/tautan harus tetap benar ketika origin produksi berubah. FE tidak boleh menebak origin.
- Setelah field terbit dan generated types diperbarui pada PR yang sama, FE Guru mengganti payload QR menjadi `joinUrl`, menampilkan tombol salin tautan, dan tetap menampilkan kode untuk entri manual. Perubahan FE menyusul di branch sendiri dan tidak mendahului kontrak.

**Batas:** selama `joinUrl` belum ada, label "undangan link" pada joblist Guru belum dapat dinyatakan selesai. QR kode mentah yang ada sekarang tidak boleh dilaporkan sebagai pemenuhan §5.2.

## GF-03 — Kontrak feedback dan riwayat Guru tidak menggambarkan kegagalan yang dikonsumsi FE

Status: **READY untuk pemilik kontrak** (Andi untuk feedback/riwayat, Ferdi untuk dukungan FE). Prioritas usulan: **P1**.

Tiga ketidaksesuaian pada `packages/contracts/openapi/openapi.json` di `main` yang saya periksa ulang hari ini dan masih ada:

1. `GET` dan `POST /classes/{classId}/students/{studentId}/feedback` hanya mendeklarasikan respons `200` dan `201`. `GET /classes/{classId}/students/{studentId}/assessment-results` hanya `200`. Padahal FE Guru **bergantung** pada 401/403/404 untuk menyembunyikan composer dan riwayat sama sekali (`teacherAccessFailure` di `features/monitoring/teacher-query.ts`, dipakai `teacher-feedback.tsx` dan `teacher-assessment-history.tsx`), dan 409 untuk reuse `clientRequestId` berbeda payload.
2. Parameter `offset` dan `limit` terbit sebagai `allOf: [$ref Object]`, sehingga `maximum: 100` dan `default: 20` hilang dari generated types dan tidak dapat dipakai mesin.
3. Parameter `cursor` pada `assessment-results` ditandai `required: true`, sementara kodenya `@Query('cursor', new ParseUUIDPipe({ optional: true }))` (`apps/api/src/modules/feedback/feedback.controller.ts:54-61`). Halaman pertama memang dikirim tanpa cursor, jadi kontrak tidak sesuai perilaku.

**Yang saya tahan:** FE tidak menyunting kontrak atau hasil generate. Perbaikan DTO/dekorator OpenAPI dilakukan pada PR pemilik endpoint, lalu generated types diperbarui di PR yang sama sesuai joblist §7.

**Batas:** temuan ini adalah ketidaksesuaian dokumen terhadap kode, bukan bukti bahwa otorisasi server salah. Verifikasi penolakan lintas Guru/kelas tetap milik AD-03 dan FR-02.

## GF-04 — Kode onboarding mati yang masih ikut terbaca sebagai area Guru

Status: **READY** (Aliwafa), perlu dikonfirmasi Ferdi untuk penghapusan. Prioritas usulan: **P2**.

`apps/web/src/features/onboarding/onboarding-ui.tsx` (498 baris) dan `RoleHomeScreen` di `features/onboarding/screens.tsx` tidak punya importer di seluruh repo — dicek dengan `git grep` pada nama file dan seluruh nama ekspor. Keduanya masih memakai gaya inline `style` dan emoji, berbeda dari `@tka/ui` dan design system yang berlaku.

Saya tidak menghapusnya di increment ini karena `onboarding-ui.tsx` menyentuh login dan pemilihan role yang secara resmi masih menunggu handoff FR-01, dan perapian struktur FE lintas fitur adalah milik Ferdi (FD-06). Menunggu konfirmasi pemilik sebelum file dibuang.

## GF-05 — Hasil audit visual dan responsif layar Guru (AW-02)

Status: **DONE sebagai audit**, dengan perbaikan state yang menyertainya sudah masuk `feat/teacher-polishv1`. Prioritas: **P1**.

Bukti: `apps/web/e2e/teacher.spec.ts` dijalankan pada SHA increment ini, **23/23 lulus**, menghasilkan 23 layar × 13 viewport (320, 360, 375, 390, 393, 430, 768, 834, 1024, 1280, 1366, 1440, 1920). Setiap capture menguji `overflow === false` atas geometri node; **nol overflow** pada seluruh artefak.

Layar yang diaudit: `verification`, `verification-empty`, `verification-school-error`, `verification-token-error`, `verification-session-expired`, `verification-disabled`, `classes`, `classes-loading`, `classes-empty`, `create-class`, `create-error`, `students`, `students-empty`, `progress`, `progress-empty`, `progress-forbidden`, `progress-session-expired`, `invite`, `feedback`, `profile`, `long-identity`, `class-redirect`.

Satu catatan pembacaan bukti: pada tangkapan full-page, navigasi bawah `position: fixed` tampil di posisi viewport-nya sehingga tampak menimpa konten di bawah 768px. Itu perilaku capture, bukan cacat tata letak — overlap sidebar/bottom bar yang sesungguhnya diuji terpisah oleh `Teacher viewport transition switches navigation without overlapping sidebar and bottom bar`.

Temuan yang saya perbaiki sebagai hasil audit ini, semuanya cacat state dan bukan preferensi visual:

| Layar | Sebelum | Sesudah |
| --- | --- | --- |
| Verifikasi — token ditolak | satu state error dipakai bersama kegagalan muat sekolah, pesan muncul di bawah field tanpa relasi ARIA | error token memakai slot `error` milik `Input` (`aria-invalid` + `aria-describedby` + `role="alert"`), kegagalan muat sekolah punya alert sendiri; arahan tindakan lanjut untuk 403 |
| Verifikasi — setelah sukses | `busy` hanya dilepas di cabang gagal, sehingga Guru yang identity-nya belum berpindah terkunci pada form dengan tombol "Memverifikasi…" | status dilepas pada jalur apa pun |
| Daftar siswa — dialog undang | `code` masih dalam perjalanan dirender sebagai "Kode kelas belum tersedia", dead-end permanen | `pending` menampilkan "Memuat kode kelas…"; fallback hanya untuk kelas yang benar-benar tanpa kode |
| Daftar siswa — header kode | `—` selama query kelas belum menjawab | "Memuat…" |
| Profil — daftar kelas kosong | paragraf polos, berbeda dari permukaan Guru lain | `EmptyState` bersama |

Yang sengaja **tidak** saya ubah: hierarki, token warna, tipografi, dan komposisi layout layar Guru. Area ini sudah melewati redesign delapan fase dan revisi umpan balik UI 5 Oktober yang disetujui pemilik, dan joblist §7 menempatkan shared UI serta struktur FE di tangan Ferdi (FD-05/FD-06). Perubahan visual baru perlu keputusan, bukan inisiatif pemilik area.

### AW-03 — akses yang dicabut (diverifikasi dan diperbaiki)

Konsumsi status server untuk kehilangan akses setelah keluar sekolah semula berupa jalan buntu. `GET /classes` menjawab 403 `SCHOOL_FORBIDDEN` begitu keanggotaan sekolah Guru berakhir, tetapi identitas hasil refresh masih menyebut Guru itu terverifikasi, jadi `TeacherGate` tidak mengarahkan ke mana pun. Dashboard menampilkan "Akses ditolak" dengan tombol **Coba lagi** yang mengulang permintaan yang pasti ditolak selamanya.

Dashboard Guru kini memisahkan 403 dari kegagalan sementara: tindakannya memeriksa ulang identitas, sehingga `TeacherGate` dapat mengarahkan Guru ke verifikasi atau login, bukan mengulang permintaan kelas. 401 tetap memakai jalur "Masuk kembali" yang sudah benar.

### AW-03 — cache antar akun Guru (diverifikasi, kini dipatok tes)

AW-03 meminta pemeriksaan account switch, logout, dan cache pengguna sebelumnya. Jawabannya: isolasi cache Guru bergantung pada satu prop — `TeacherGate` membungkus layarnya dengan `<LearningProvider key={state.profile.id}>`, dan `LearningProvider` membuat `QueryClient` baru tiap mount lalu `client.clear()` saat unmount. Karena kunci query Guru (`teacherKeys` di `features/monitoring/teacher-query.ts`) **tidak** memuat ID Guru, hilangnya prop `key` itu akan membuat roster, daftar siswa, progres, dan riwayat feedback Guru A tampil untuk Guru B sebelum respons server pertama tiba.

`features/monitoring/teacher-gate.test.tsx` sekarang mematok dua arah itu: akun berikutnya mendapat cache kosong, dan sesi yang berakhir melepas cache. Pemeriksaan mutasi dilakukan dengan menghapus `key` tersebut — tes pertama gagal dengan nilai cache Guru A terbaca di sesi Guru B, lalu kode dikembalikan utuh.

## Ringkasan tindak lanjut

| Tiket | Pemilik tindak lanjut | Butuh keputusan sebelum FE kerja |
| --- | --- | --- |
| GF-01 | Farel (scope) → Andi (kontrak) → Aliwafa (UI) | Ya |
| GF-02 | Andi (field `joinUrl`) → Aliwafa (konsumi) | Tidak untuk bentuk, ya untuk waktu |
| GF-03 | Andi / Ferdi (kontrak) | Tidak |
| GF-04 | Ferdi (FD-06) bersama Aliwafa | Ya, untuk penghapusan |
| GF-05 | Aliwafa (selesai di branch ini); Ferdi mereview sebagai reviewer FE | Tidak |

Pekerjaan polish yang tidak bergantung pada keempat tiket ini sudah berjalan di branch `feat/teacher-polishv1` dan dicatat pada PR-nya masing-masing.
