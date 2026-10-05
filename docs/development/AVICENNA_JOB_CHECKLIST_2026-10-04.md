# Checklist pekerjaan Avicenna

**Pembaruan:** 4 Oktober 2026  
**Acuan:** [MVP Joblist 2026-10-02](./MVP_JOBLIST_2026-10-02.md), khusus bagian assignment Avicenna dan JOB-04, JOB-10, JOB-12–14, JOB-18, JOB-21, JOB-22.

Dokumen ini mencatat status frontend dan kontribusi Avicenna saja. Checklist ini tidak menyatakan JOB lintas-owner selesai apabila backend, policy, acceptance QA, atau release evidence masih menjadi tanggung jawab pihak lain.

## Ringkasan

| JOB | Lingkup Avicenna | Status |
| --- | --- | --- |
| JOB-04 | UI Admin publisher Drill | Parsial — UI publisher tersedia; acceptance end-to-end masih perlu |
| JOB-10 | State IRT di Admin | Parsial — status batch dan status rilis ditampilkan terpisah |
| JOB-12 / P1 | Riwayat hasil Student | Implementasi endpoint, OpenAPI/types, UI riwayat, dan pagination sudah ada; target-environment QA masih perlu |
| JOB-13 / P2 | Lifecycle Pretest dan Skip | Belum selesai — lifecycle API dan flow Student belum tersedia |
| JOB-14 | Admin review/resolve laporan | Parsial — UI laporan dan tindak lanjut tersedia; acceptance keseluruhan belum ditutup |
| JOB-18 | Admin pengguna/kelas | Frontend baca-saja selesai; JOB keseluruhan masih parsial |
| JOB-21 | Acceptance/release | Parsial — validasi lokal JOB-18 lulus; acceptance independen dan release gate belum dicatat |
| JOB-22 | Status docs/handoff | Berjalan — checklist ini dan status JOB-18 didokumentasikan |

**Legenda:** `[x]` tersedia/terverifikasi pada lingkup yang dinyatakan; `[ ]` masih perlu dikerjakan atau dibuktikan. Status “parsial” membatasi klaim pada bagian frontend Avicenna, bukan keseluruhan JOB.

## Tambahan tugas prioritas yang diperiksa

### P1 — Riwayat hasil Penilaian Student (JOB-12)

**Hasil pemeriksaan:** klaim bahwa `GET /students/me/assessment-results` belum diimplementasikan tidak cocok dengan kode saat ini. Endpoint Student sudah terdaftar pada controller dan OpenAPI. Frontend Penilaian menggunakan endpoint tersebut. Status implementasi bukan berarti acceptance/release sudah ditutup.

- [x] Backend menyediakan endpoint riwayat Student dengan otorisasi Student.
- [x] Riwayat memakai pagination cursor (hingga 20 record per halaman), dapat difilter berdasarkan level, dan mengembalikan status hasil Tryout.
- [x] Endpoint tercantum pada OpenAPI; tipe `AssessmentHistoryDto` dan tipe frontend berasal dari kontrak tersebut.
- [x] Layar Penilaian memakai infinite query dan menyediakan aksi memuat halaman berikutnya.
- [x] Integration test backend mencakup role/access, cursor/pagination, score nol, serta Tryout yang belum dirilis.
- [x] Kontrak menyatakan skor Drill historis tetap tersedia ketika akses pembahasan kedaluwarsa; hasil tersimpan tidak dihapus oleh expiry pembahasan.
- [ ] Jalankan integration test pada database/environment kandidat yang dituju dan catat hasil serta SHA.
- [ ] QA alur nyata: temukan Drill lama melalui daftar, buka hasil dengan attempt ID, dan pastikan nilai masih terlihat setelah pembahasan kedaluwarsa.
- [ ] Konfirmasi status review kontrak. Dokumen kontrak di repo masih berstatus “awaiting FE/BE/QA review” secara keseluruhan, walaupun endpoint riwayat sudah ada.

**Kesimpulan checklist:** bagian “endpoint belum diimplementasikan” ditandai selesai berdasarkan kode saat ini; sisa P1 adalah verifikasi pada environment dan acceptance hasil historis/pembahasan kedaluwarsa.

## P2 — Flow Student Pretest (JOB-13)

**Hasil pemeriksaan:** lifecycle Pretest Student belum ditemukan. Dashboard menampilkan Pretest sebagai “Belum tersedia” dan menonaktifkan kontrolnya. Adanya tipe/schema/record PRETEST untuk history tidak membuktikan bahwa Student dapat memulai atau menyelesaikan Pretest.

- [x] UI saat ini dengan jujur menandai Pretest belum tersedia; tidak menampilkan flow palsu.
- [ ] Owner backend menyediakan eligibility dan lifecycle API Student sebelum integrasi frontend.
- [ ] Setelah kontrak/generated types tersedia, implementasikan UI Student untuk mulai, 20 soal per bab sesuai baseline yang disetujui, resume, submit, status/result, dan state error/loading/empty.
- [ ] Pastikan batas satu kali selesai per bab dan tidak ada XP mengikuti kontrak/domain yang disetujui.
- [ ] Pastikan eligibility “Student Sekolah” ditetapkan eksplisit oleh Product/PO sebelum UI mengasumsikannya; jangan memperluas eligibility sendiri.
- [ ] Tutup distribusi 20 soal dan placement dengan Curriculum/PO melalui OPEN-01–03 sebelum memfinalkan perilaku.
- [ ] Uji perfect result dan batas level yang terbuka hanya setelah mapping placement disetujui; angka “maksimal tiga level per subbab” masih berasal dari baseline lama dan tidak boleh dikodekan sebagai rule final sebelum OPEN-03 diselesaikan.
- [ ] Buktikan level yang sudah terbuka tidak terkunci kembali setelah Pretest/Skip.
- [ ] Jalankan backend concurrency/lifecycle tests serta frontend flow/E2E setelah API, content, dan policy tersedia.

## JOB-04 — UI Admin publisher Drill

**Status Avicenna: PARSIAL**

- [x] Halaman Admin konten menggunakan publisher/API dan tipe yang sudah ada.
- [x] UI mendukung alur draf paket Drill, edit, publish, dan archive sesuai workflow yang tersedia.
- [x] Tes UI mencakup pembuatan draf, edit/retry, konfirmasi archive, dan publish.
- [ ] Verifikasi satu alur penuh pada environment/release SHA: Admin publish → Student start/save/submit.
- [ ] Buktikan role selain Admin tidak dapat menjalankan operasi Admin, termasuk akses langsung.
- [ ] QA memastikan hasil attempt historis tidak berubah setelah paket baru dipublikasikan atau versi lama diarsipkan.

**Bukti kode:** `apps/web/src/features/admin/content.tsx` dan `apps/web/src/features/admin/content.spec.tsx`.

## JOB-10 — State IRT di Admin

**Status Avicenna: PARSIAL**

- [x] Admin menampilkan status batch IRT terpisah dari status rilis hasil.
- [x] Tes UI memastikan status batch berhasil tidak disalahartikan sebagai hasil yang sudah dirilis.
- [ ] Lengkapi dan verifikasi state yang didukung kontrak, termasuk insufficient/failure/retry bila tersedia.
- [ ] Integrasikan hasil penerimaan kontrak/pipeline final tanpa menyamakan status analisis batch dengan publikasi hasil.
- [ ] QA memastikan score, kunci, dan pembahasan tidak terlihat sebelum state rilis yang sah.

**Bukti kode:** tab IRT pada `apps/web/src/features/admin/content.tsx`; skenario UI pada `apps/web/src/features/admin/content.spec.tsx`. Pipeline dan policy tetap milik owner JOB-10 terkait.

## JOB-12 — Penilaian dan riwayat tersimpan (P1)

**Status Avicenna: PARSIAL**

- [x] Endpoint `GET /students/me/assessment-results` diimplementasikan pada `LearningController` dengan otorisasi Student.
- [x] Endpoint tercantum pada `packages/contracts/openapi/openapi.json`, dengan `AssessmentHistoryDto` yang memuat records dan `nextCursor`.
- [x] Backend membatasi halaman menjadi 20 record; cursor tervalidasi terhadap Student/filter yang sama dan level dapat difilter.
- [x] Layar Penilaian mengambil riwayat melalui infinite query dan memberi akses ke halaman berikutnya.
- [x] Status Tryout waiting/released direpresentasikan; score tidak dipaparkan sebelum hasil dirilis.
- [x] Kontrak menyebut score historis tetap tersedia saat pembahasan Drill kedaluwarsa.
- [ ] Verifikasi acceptance dengan API final untuk latest/best, seluruh attempt, konteks level/aktivitas, XP/bintang pending, dan Tryout waiting/released.
- [ ] QA target environment untuk menemukan ulang hasil Drill lama dengan attempt ID dan memastikan score tetap ada setelah pembahasan kedaluwarsa.
- [ ] Catat hasil tes ownership/cursor serta QA pada SHA/environment yang akan dirilis.

**Bukti kode:** `apps/api/src/modules/learning/learning.controller.ts`, `apps/api/src/modules/learning/assessment-history.service.ts`, `apps/api/src/modules/learning/assessment-history.integration.spec.ts`, `apps/web/src/features/core-learning/assessment-history.tsx`, dan `apps/web/src/features/core-learning/assessment-queries.ts`. Backend sudah memiliki endpoint; penerimaan ownership/environment tetap perlu dicatat terpisah.

## JOB-13 — Lifecycle Pretest dan Skip (P2)

**Status Avicenna: BELUM SELESAI**

- [x] UI secara eksplisit menandai Pretest yang belum tersedia; tidak menjanjikan flow yang belum didukung.
- [ ] Backend menyediakan lifecycle API dan eligibility Student; schema/record assessment PRETEST yang ada belum cukup untuk menandai flow selesai.
- [ ] Setelah API/generated contract tersedia, implementasikan eligibility, dialog Mulai/Skip, dan state unavailable.
- [ ] Implementasikan 20 soal per bab, start/save/resume/submit/result serta state completed/skipped sesuai kontrak dan keputusan produk.
- [ ] Pastikan batas sekali selesai per bab dan Pretest tidak menghasilkan XP.
- [ ] Verifikasi eligibility Student Sekolah setelah aturan akses disetujui.
- [ ] Tutup distribusi dan placement lewat OPEN-01–03; jangan menerapkan cap tiga level sebelum OPEN-03 diputuskan.
- [ ] Buktikan level yang sudah terbuka tidak terkunci kembali setelah placement/Skip.
- [ ] Tutup QA untuk state loading/error/empty, refresh/resume, dan concurrency setelah backend siap.

**Catatan dependency:** belum ditemukan API lifecycle Pretest pada modul backend maupun halaman Student aktif. Kontrak/backend, konten, eligibility, dan aturan placement harus tersedia/disetujui sebelum perilaku final dibangun. Tipe PRETEST pada assessment history hanya merepresentasikan record bila tersedia, bukan implementasi lifecycle.

## JOB-14 — Admin review dan tindak lanjut laporan

**Status Avicenna: PARSIAL**

- [x] UI Admin menyediakan tampilan laporan soal/video, konteks tujuan video, dan pemfilteran jenis laporan.
- [x] UI dapat mengirim status tindak lanjut beserta catatan melalui API Admin yang tersedia.
- [x] Tes UI mencakup resolve laporan soal dan filter/konteks laporan video.
- [ ] Verifikasi validasi dan state loading/error/retry serta hak akses Admin pada environment integrasi.
- [ ] QA memastikan data konteks laporan cukup untuk tindakan yang dimaksud dan tidak membocorkan PII yang tidak diperlukan.
- [ ] Tutup acceptance end-to-end bersama validasi backend, idempotency, kepemilikan, dan rekomendasi video; seluruhnya bukan klaim selesai hanya karena UI tersedia.

**Bukti kode:** bagian laporan pada `apps/web/src/features/admin/content.tsx` dan tes di `apps/web/src/features/admin/content.spec.tsx`.

## JOB-18 — Admin pengguna dan kelas

**Status Avicenna: FRONTEND BACA-Saja SELESAI; JOB KESELURUHAN PARSIAL**

- [x] Route `/admin/operations` menampilkan daftar/detail pengguna dan kelas dengan endpoint serta generated types yang tersedia.
- [x] Filter pengguna: nama, role, status; filter kelas: nama, ID sekolah, ID Guru, status.
- [x] Pagination meneruskan `nextOffset` dari server.
- [x] Tersedia state loading, empty, error, retry, akses ditolak, dan redirect akun non-Admin.
- [x] UI hanya menampilkan data minimum yang tersedia; tidak menambahkan aksi ban/koreksi atau mutasi lain.
- [x] Tes terfokus: 6 tes lulus, termasuk filter, detail, pagination, retry, authorization rejection, dan akun non-Admin.
- [x] Validasi lokal: typecheck, ESLint untuk file TypeScript terkait, Prettier untuk file frontend baru, `git diff --check`, dan production build lulus.
- [ ] Salim menyelesaikan acceptance akses dan data minimum secara independen pada environment/SHA yang disepakati.
- [ ] Audit operasional serta correction/wrong-class/ban tetap menunggu policy dan skenario yang disetujui; tidak termasuk implementasi frontend baca-saja ini.

**Bukti kode:** `apps/web/src/app/admin/operations/page.tsx`, `apps/web/src/features/admin/operations.tsx`, `apps/web/src/features/admin/operations-api.ts`, `apps/web/src/features/admin/operations.test.tsx`, dan tautan navigasi pada `apps/web/src/components/shell/app-shell.tsx`.

## JOB-21 — Acceptance dan operasi release

**Status kontribusi Avicenna: PARSIAL**

- [x] Untuk perubahan JOB-18, tes UI terfokus, typecheck, lint, pemeriksaan format file frontend baru, `git diff --check`, dan production build lulus secara lokal.
- [ ] Catat SHA/branch dan hasil CI untuk kandidat release yang akan diuji.
- [ ] Serahkan bukti dan batas scope JOB-18 kepada Salim untuk acceptance independen.
- [ ] Tutup browser/mobile/accessibility, akses langsung per role, serta acceptance environment untuk setiap layar Avicenna yang masuk release.
- [ ] Catat residual defects dan status tiap acceptance criteria; jangan menganggap validasi lokal sebagai sign-off release.

**Catatan:** bukti validasi lokal di atas hanya merujuk perubahan JOB-18 pada sesi implementasi ini, bukan seluruh fitur Avicenna atau keseluruhan JOB-21.

## JOB-22 — Status docs dan handoff visual

**Status kontribusi Avicenna: BERJALAN**

- [x] Checklist ini merangkum lingkup Avicenna dan membedakan implementasi frontend dari acceptance keseluruhan JOB.
- [x] Status JOB-18 pada [MVP Joblist](./MVP_JOBLIST_2026-10-02.md) diperbarui menjadi parsial, dengan frontend baca-saja dan pekerjaan tersisa dinyatakan.
- [ ] Setelah merge/QA, tambahkan tautan PR/SHA, acceptance evidence, dan status OPEN yang relevan.
- [ ] Catat handoff visual final hanya setelah UIUX menyetujui handoff; jangan mengubah rule produk atau status QA hanya demi penyesuaian visual.
- [ ] Perbarui checklist dan joblist ketika pekerjaan atau evidence baru terverifikasi.

## Referensi kerja

- [MVP Joblist 2026-10-02](./MVP_JOBLIST_2026-10-02.md)
- [Panduan QA](../testing/QA_GUIDE.md)
- [Runbook IRT v3](./IRT_V3_RUNBOOK.md)
