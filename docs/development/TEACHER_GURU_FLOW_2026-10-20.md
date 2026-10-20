# Peta flow Guru — output AW-01 (Aliwafa)

Tanggal: 20 Oktober 2026. Basis kode: `main` pada `6ba9638`, pekerjaan polish berjalan di `feat/teacher-polishv1`.

Dokumen ini adalah keluaran **AW-01** (serah-terima dan pemetaan flow Guru) dan pasangan dari [Temuan flow Guru](TEACHER_GURU_FINDINGS_2026-10-20.md). Isinya daftar langkah, kondisi tiap langkah, dan batas siapa yang mengerjakan file mana. Tidak ada keputusan produk di sini; aturan produk tetap di PRD v0.6.

Batas klaim: seluruh baris "Status" di bawah berasal dari pembacaan kode FE/BE dan kontrak OpenAPI pada basis di atas, ditambah gate FE yang saya jalankan. Yang belum punya bukti eksekusi ditandai **belum diverifikasi saat runtime**. Serah-terima formal dari Farel (FR-01) belum diterima, jadi kolom "Sumber" menyebut dari mana perilaku itu saya kenal.

## 1. Alur langkah dan kondisinya

Basis path API: `/api/v1`.

| # | Langkah | URL | Komponen | Endpoint | Sumber |
| --- | --- | --- | --- | --- | --- |
| 1 | Masuk Google dan pilih peran | `/onboarding` | `features/onboarding/screens.tsx` | sesi auth, profil | kode `main` |
| 2 | Profil Guru | `/teacher/profile` | `features/onboarding/teacher-profile.tsx` | `GET /classes` | kode `main` |
| 3 | Verifikasi sekolah | `/teacher/verification-required` | `TeacherVerificationScreen` | `GET /schools`, `POST /schools/{id}/teacher-verifications` | kode `main` |
| 4 | Daftar kelas dan buat kelas | `/teacher` | `TeacherDashboardScreen` | `GET /classes`, `POST /classes` | kode `main` |
| 5 | Undang siswa | `/teacher/classes/{classId}/invite` | `TeacherClassToolsScreen` | `GET /classes`, `GET /classes/{id}/students` | kode `main` |
| 6 | Roster dan pencarian siswa | `/teacher/classes/{classId}` | `ClassStudentsScreen` | `GET /classes/{id}/students` | kode `main` |
| 7 | Progres siswa dan level terpantau | `/teacher/classes/{classId}/students/{studentId}` | `TeacherStudentProgressScreen` | `GET .../progress` (termasuk level terpantau), `GET .../assessment-results?cursor=` | kode `main` |
| 8 | Feedback ke siswa | `/teacher/feedback?classId=&studentId=` | `TeacherFeedbackScreen` | `GET/POST .../feedback` | kode `main` |
| 9 | Keluar dan ganti akun | di dalam `TeacherShell` | `teacher-gate.tsx` | `logout()` | kode `main` |

## 2. Kondisi yang harus diuji per langkah

Tabel ini untuk Farel (FR-02) dan Reyhan; angka kolom # mengacu tabel di atas.

| Kondisi | Muncul di | Perilaku saat ini | Status |
| --- | --- | --- | --- |
| Guru belum terverifikasi | 2, 4–8 | `TeacherGate` menahan layar dan mengarahkan ke verifikasi; menu samping tidak dirender | sudah ada |
| Token verifikasi kedaluwarsa, sudah dipakai, atau salah sekolah | 3 | satu `403 INVALID_TEACHER_TOKEN` dengan detail server, ditambah baris "Minta credential baru dari Admin sekolah." pada field token | diperbaiki di branch ini |
| Sesi habis | 3, 4, 6–8 | `401` → tautan "Masuk kembali" ke `/`; form tidak dikunci permanen | sudah ada, lock submit diperbaiki |
| Kelas kosong (belum ada siswa) | 6 | empty state pada roster, jumlah siswa tidak ditebak FE | sudah ada |
| Guru tidak punya kelas | 4 | empty state + form buat kelas tetap terbuka | sudah ada |
| Daftar kelas belum menjawab saat undangan dibuka | 5 | "Memuat kode kelas…" bukan "kode belum tersedia" | diperbaiki di branch ini |
| Kelas milik Guru lain / akses dicabut | 4–8 | `403` memicu `refresh()` identitas, bukan tombol "Coba lagi" yang pasti gagal | diperbaiki di branch ini |
| Respons create tidak pernah kembali | 4 | nama form dikosongkan, muncul pesan ketidakpastian, daftar dimuat ulang | diperbaiki di branch ini (mitigasi GF-08) |
| Cache Guru A terlihat oleh Guru B setelah ganti akun | 9 | `QueryClient` dipisah dengan `key={profile.id}` dan dibersihkan saat unmount | dipatok tes regresi |
| Route lama | 4, 6 | `/teacher/monitoring` dan `/teacher/classes/{id}/settings` redirect, bukan layar mati | sudah ada, diverifikasi |
| Batas lima kelas aktif | 8 pada sisi Siswa | aturan v0.6; pesan server ditampilkan, tapi masih ada teks aturan satu kelas di layar gabung kelas | temuan GF-06, menunggu pemilik file |
| Ban/unban, takeover, leave | 4, 6 | endpoint dan kontrak ada, tidak ada pemanggil FE | deferred atas keputusan PM (GF-01) |
| Undangan lewat tautan/QR otomatis | 5 | QR berisi kode mentah; tidak ada `joinUrl` di kontrak | blocked pada Andi (GF-02) |

## 3. Batas file supaya tidak ada perbaikan ganda

Farel tidak perlu menyentuh file berikut selama `feat/teacher-polishv1` berjalan; kalau ada repro di luar daftar ini, kirim lewat chat dan saya kerjakan di branch ini.

- `apps/web/src/features/monitoring/**` (layar Guru, helper query, gate, feedback)
- `apps/web/src/features/onboarding/screens.tsx` dan `teacher-profile.tsx` (hanya bagian Guru)
- `apps/web/src/features/onboarding/teacher-session.ts` — pembungkus lock/pesan gagal keluar dari `TeacherShell` dan Profil. Ia memakai `logout()` apa adanya dan tidak mengubah `auth.ts`, yang tetap masuk koordinasi Andi dan handoff Farel (§7 joblist).
- `apps/web/src/components/shell/teacher-*.tsx`
- `apps/web/e2e/teacher.spec.ts`
- bagian `.teacher-*` di `apps/web/src/app/numora.css` dan `teacher.css`

Dimiliki orang lain dan tidak saya ubah: layar Student termasuk `class-join.tsx` (Avicenna), Admin (Ferdi/Tangguh), kontrak dan skema kelas/sekolah (Andi), shared UI (`@tka/ui`, Ferdi FD-05).

## 4. Yang saya butuhkan dari serah-terima Farel

AW-01 mensyaratkan daftar pekerjaan aktif Farel untuk profil, session, route protection, join, dan monitoring. Sampai dokumen ini ditulis saya hanya punya `main` yang sudah merge, jadi tolong kirim:

1. Branch atau daftar PR Guru yang belum merge, plus status tiap item (selesai / diteruskan / dibatalkan).
2. Repro yang membuat Farel pernah membetulkan verifikasi Guru, supaya saya tidak membetulkan ulang arah yang berbeda.
3. Keputusan scope untuk GF-01: kontrol kelas deferred atau masuk iteration ini.

## 5. Gerbang yang sudah dijalankan di branch ini

`pnpm lint` root, `pnpm --filter @tka/web typecheck`, vitest web penuh, `pnpm test:checks`, `pnpm --filter @tka/web build`, dan `e2e/teacher.spec.ts` Playwright. Keluaran suite browser Admin dicatat sebagai GF-07 karena gagal juga di `main`.

Angka pada `feat/teacher-polishv1` setelah seluruh perubahan hari ini (mesin development Windows, 21 Oktober): vitest web **279/279** (41 file), `test:checks` **68/68**, browser **Guru 23/23** dan **auth + account 34/34** dalam mode produksi. Satu-satunya suite browser yang belum hijau di branch ini adalah Admin, dan itu GF-07.

Cara menjalankan suite Guru dengan benar (dipakai saat dokumen ini ditulis, belum ada skrip repo untuk ini):

```powershell
# 1. Build ke direktori yang dipakai webServer mode produksi
$env:NUMORA_WEB_DIST_DIR='.next-e2e'
$env:NEXT_PUBLIC_API_URL='http://localhost:3301/api/v1'
$env:NEXT_PUBLIC_SUPABASE_URL='https://numora-e2e.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-only-public-key'
$env:NODE_ENV='production'
pnpm --filter @tka/web exec next build

# 2. Jalankan suite terhadap bundel itu
$env:NUMORA_E2E_PRODUCTION='true'
pnpm --filter @tka/web exec playwright test e2e/teacher.spec.ts
```

Tanpa langkah 1, `next start` keluar dengan pesan "Could not find a production build in the '.next-e2e' directory". Mode default `pnpm test:e2e` memakai `next dev` dan biayanya ±43 detik per tes Guru, sehingga 23 tes saja sudah mendekati `globalTimeout` 900 detik — angka yang sama yang membuat suite Admin terpotong (GF-07). Nilai `NEXT_PUBLIC_*` harus sama dengan `playwright.config.ts` karena inline saat build. Ukuran pada mesin development yang sama: `e2e/teacher.spec.ts` **23 lulus dalam 1,5 menit** di mode produksi, dibanding ±43 detik per tes di mode dev — jadi untuk suite 194 kasus, mode produksi bukan kemewahan.

Rencananya pengujian aliran ini ada di QA (Farel untuk Guru/Student), jadi peta ini dibuat agar QA cukup menambah kasus, bukan mengulang tes unit yang sudah ada.
