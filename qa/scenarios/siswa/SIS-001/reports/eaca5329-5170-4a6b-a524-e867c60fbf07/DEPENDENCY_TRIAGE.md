# Audit dependency — handoff developer

Run: eaca5329-5170-4a6b-a524-e867c60fbf07. Sumber: `pnpm audit --json`, registry yang digunakan lockfile pada waktu eksekusi 27 Oktober 2026 WIB. Kategori: dependency/security; belum diverifikasi sebagai eksploitasi aplikasi. Bukti awal `result.json` tetap utuh.

Hasil audit: critical 2, high 8, moderate 17, low 4. Angka merupakan temuan audit, bukan jumlah jalur eksploitasi atau jumlah bug aplikasi yang terkonfirmasi. Runtime/dev/transitive scope dan konfigurasi aktual harus diperiksa sebelum keputusan remediation.

Prioritas developer pertama: dua advisory critical pada jalur `apps__web>next`. Audit menyebut rentang terdampak >=16.0.0 <=16.4.0 dan patched >=16.4.1:

- [Image Optimization SVG RCE — GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw).
- [use cache typed arrays RCE — GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr).

Temuan high juga mencakup source-map-js, Next.js, Vite, Zod, body-parser, multer dan undici. Detail/rantai dependency lengkap terdapat pada artefak audit lokal; jangan menyimpulkan semua dapat dieksploitasi hanya dari severity registry.

Reproduksi: dari branch/SHA dan lockfile run, jalankan `pnpm audit --json`. Expected: tidak ada advisory tanpa penilaian dan keputusan risiko yang disetujui. Actual: audit nonzero dengan severity di atas. Dampak potensial mengikuti advisory dan perlu dicocokkan dengan fitur/konfigurasi yang dipakai Numora.

Aksi developer: periksa versi dan jalur yang terpasang; validasi applicability; siapkan pembaruan dependency atau mitigasi dalam pekerjaan developer; jalankan regresi dan audit pada lockfile baru. Workflow QA tidak mengubah dependency aplikasi untuk menyembunyikan temuan. Retest remediation: NOT_RUN.

Tinjauan lanjutan 27 Oktober 2026: `docs/testing/dependency-reviews/2026-10-27.md` menambahkan hasil audit production terpisah, workaround sharp yang teramati, applicability source, risiko runtime Node di luar npm audit dan antrean developer. Bukti audit awal tetap dipertahankan. Review developer dan chat tujuan masih menunggu anggota yang ditentukan pengguna; tidak ada persetujuan rollout yang diklaim.

Keputusan terbaru pengguna, 27 Oktober 2026: review PIC sudah selesai melalui persetujuan pengguna dan tim cukup menjalankan workflow. Status menunggu review/chat pada catatan sebelumnya bersifat historis dan sudah digantikan. Eksekusi tim APPROVED; hasil audit FAIL dan pekerjaan remediasi tetap sesuai bukti. Rujuk QA_WORKFLOW bagian Persetujuan eksekusi tim.
