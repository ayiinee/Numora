# JOB-11 — XP TryOut ×10

**PRD RULE:** PRD v0.6 §12 menetapkan XP dari skor benar ekuivalen, tanpa bonus waktu, langsung saat attempt selesai dan tanpa menunggu IRT. XP bukan nilai simulasi.

**ENGINEERING DECISION — keputusan produk Aini, 5 Oktober 2026:** gunakan multiplier **×10**. Keputusan ini menyelesaikan konflik §12 dengan AC-15 ×100; teks sumber asli dipertahankan sebagai bukti historis. Contoh: 24,5 benar ekuivalen menghasilkan 245 XP; 30 benar menghasilkan 300 XP. Ini koreksi formula, bukan perubahan skor IRT atau rubrik PGK.

Implementasi prospektif mem-pin kebijakan `TRYOUT_PRD_V06` versi 1 ketika attempt baru dimulai. Attempt lama (pin null), termasuk yang masih aktif, mempertahankan perilaku sebelumnya tanpa posting/backfill XP. Submit manual, deadline, dan recovery worker memakai finalizer yang sama; hasil, ledger unik per attempt, dan outbox berada dalam satu transaksi.

Jalur assessment saat ini mendukung PG. Benar ekuivalen PG dihitung per butir (`awardedPoints / maxPoints`), bukan raw points berbobot atau skor persentase. Kunci/pembahasan dan nilai simulasi tetap menunggu release, tetapi XP tersimpan dapat dibaca pemilik attempt segera setelah submit, termasuk XP 0. PGK tetap membutuhkan rubrik Research/Curriculum dan jalur assessment PGK; tidak ada rumus partial scoring atau pembulatan baru yang dibuat di sini. Dukungan nilai XP pecahan yang tidak integral juga harus diselaraskan dengan ledger/leaderboard sebelum aktivasi PGK.

Migrasi maju menambah pin nullable dan memperluas guard ledger untuk kebijakan TryOut; tidak mengubah nilai, jawaban, ataupun XP lama. JOB-17 leaderboard account-based/global, IRT, paket Past, konten resmi, dan independent QA tetap terpisah. Migrasi baru diuji pada PostgreSQL lokal terlebih dahulu; aktivasi Cloud memerlukan penerapan migrasi sebelum build API/worker terbaru digunakan.

## Klarifikasi fallback XP — 5 Oktober 2026

**ENGINEERING DECISION — klarifikasi produk Aini:** XP selalu dihitung dan dicatat saat submit, terpisah dari skor maupun status proses IRT. Jika perhitungan parsial dapat dilakukan, gunakan `(jumlah benar penuh + benar ekuivalen parsial) ×10` dan jangan menjalankan fallback. Jika perhitungan parsial terkendala saat submit, gunakan `jumlah soal benar penuh ×10`; kontribusi parsial tidak dimasukkan. Fallback XP ini tidak dipicu oleh kegagalan IRT atau batas waktu rilis hasil. Hasil IRT yang muncul kemudian tidak menghitung ulang XP yang sudah dicatat.

**ENGINEERING DECISION — klarifikasi lanjutan Aini:** XP TryOut pecahan dibulatkan ke atas. Formula final normal adalah `ceil((jumlah benar penuh + benar ekuivalen parsial) ×10)`; formula fallback tetap `jumlah soal benar penuh ×10`. Pembulatan diterapkan pada total XP, bukan setiap kontribusi butir. Contoh `(20 + 0,25) ×10 = 202,5` menjadi `203 XP`. Keputusan ini khusus TryOut; Drill tetap memakai kebijakan pembulatannya sendiri.

**ENGINEERING DECISION — rilis hasil, terpisah dari XP:** pembahasan dibuka bersama hasil. Jika IRT belum menghasilkan hasil valid hingga batas 3×24 jam setelah batch ditutup, gunakan scoring biasa. Aini mengonfirmasi bahwa mode hasil fallback berlaku untuk seluruh batch. Rumus nilai scoring biasa, mapping nilai IRT dan perlakuan data tidak cukup masih memerlukan spesifikasi; fallback XP saat submit tidak menetapkan rumus nilai hasil ini.

**ENGINEERING DECISION — bobot dan Drill, Aini:** bobot produk PG=2, MCMA=3 dan Kategori=3 adalah final. Partial credit diperhitungkan untuk scoring ketuntasan Drill dan benar ekuivalen XP Drill, dengan bonus kecepatan existing; bintang mengikuti nilai akhir Drill. Pengesahan bobot tidak mengesahkan tabel rubrik MCMA yang masih Draft. [Rincian Drill dan batas implementasi](DRILL_V06_REWARDS.md#klarifikasi-pgk--5-oktober-2026).

**OPEN — rincian implementasi PGK:** rubrik benar ekuivalen dan evidence benar penuh perlu disahkan sebelum jalur PGK diaktifkan. Pemicu produk fallback XP sudah jelas: perhitungan parsial tidak memungkinkan saat submit; implementasi perlu mengidentifikasi kendala tersebut, tanpa menjadikan seluruh kegagalan transaksi sebagai alasan fallback. Penanganan presisi dan penyimpanan mengikuti keputusan pembulatan ke atas di atas. Total `225 XP` pada contoh lama memerlukan `22,5` benar ekuivalen sebelum pembulatan; contoh `20 + 0,25` telah dikoreksi.

**Status implementasi:** jalur PG existing tetap berlaku. Fallback parsial PGK belum diimplementasikan atau diuji; bukti engineering di bawah mencakup implementasi PG pada SHA sebelumnya.

## Verifikasi

Tes policy mencakup 30 benar, 24,5 ekuivalen, XP 0 dan bobot PG yang berbeda. PostgreSQL menguji manual/auto/recovery concurrent, ledger unik/immutable, pin immutable, rollback outbox, legacy tanpa reward dan LOGIN main non-owner dengan RLS. API menguji ownership/auth dan XP saat waiting tanpa nilai/kunci; UI menampilkan XP 0/persisted tanpa menghitung ulang dari skor. `pnpm tryout:reconcile` hanya membaca canonical grades/ledger; jangan menjalankan backfill.

Gate lint/typecheck/build, contract validation/freshness, integration tanpa skip dan connected browser pada satu SHA tetap wajib. Connected fixture berlabel TEST ONLY, bukan acceptance Curriculum/Google/IRT engine/QA independen. Artefak `.tmp/job06-evidence/connected.json` memuat check `tryout-mandiri-school-snapshot-idempotency-xp-at-submit-irt-privacy-level-and-teacher-history`.

**Local engineering evidence — 5 Oktober 2026:** policy 3, database 24, API 148, worker 16 dan UI 207 tes lulus (398 total) tanpa skipped suite; root script checks 68 lulus. Integration memakai PostgreSQL terisolasi dan Redis 7. Lint, typecheck dan contract validation/freshness lulus; checker TryOut dan Drill melaporkan nol reward/progress error. Dua prop XP nullable yang ditemukan typecheck sudah diperbaiki, lalu seluruh gate typecheck diulang dan lulus. Bukti connected final mengikuti artefak pada SHA commit bersih, bukan hasil suite ini saja.
