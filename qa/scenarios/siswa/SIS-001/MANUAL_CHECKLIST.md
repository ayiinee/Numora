# SIS-001 — checklist keyboard dan usability

**ENGINEERING DECISION — workflow QA yang disetujui.** Checklist ini disiapkan
untuk pengujian manusia; seluruh hasil awal **NOT_RUN**, bukan hasil otomatis.
Gunakan aturan dari `scenario.json`, PRODUCT_CONTEXT dan DRILL_V06_REWARDS.

## Identitas pelaksanaan

- Penguji / tanggal WIB: belum diisi.
- Run / commit aplikasi / versi aturan: isi dari laporan run yang diperiksa.
- URL dan lingkungan: localhost tes terisolasi atau staging yang sudah terverifikasi.
- Akun: identitas sintetis milik run; Google OAuth nyata dicatat terpisah.
- Desktop: catat browser/OS dan ukuran, contoh 1280×900.
- Mobile: catat perangkat/browser dan ukuran, contoh 390×844. Jika memakai
  emulasi browser, tulis **emulasi**, bukan bukti perangkat fisik.
- Bukti: simpan tangkapan layar/catatan tanpa token atau data siswa nyata.

Mulai pada build yang sama dengan run. Minta Codex menyiapkan sesi manual
terisolasi jika server milik run sudah dihentikan; jangan memakai database
Development bersama. Jangan mengubah hasil run lama untuk menempelkan bukti
build baru. UI fixture bukan bukti Google login atau validitas akademik soal.

## Langkah dan expected result

| ID  | Langkah penguji                                                            | Expected result                                                                             | Desktop | Mobile  | Bukti / catatan aktual                                           |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- | ------- | ---------------------------------------------------------------- |
| M01 | Buka materi, subbab dan Level 1; baca instruksi                            | Tombol dan informasi jelas; level terkunci tidak bisa dimulai                               | NOT_RUN | NOT_RUN | Belum diisi                                                      |
| M02 | Gunakan Tab dan Shift+Tab melalui navigasi/tombol                          | Fokus terlihat, urutan masuk akal, tidak terjebak atau tertutup elemen lain                 | NOT_RUN | NOT_RUN | Catat penggunaan keyboard eksternal pada mobile bila ada         |
| M03 | Pilih jawaban dengan keyboard; ubah pilihan dan pindah soal                | Radio/opsi dapat dioperasikan; nomor soal dan pilihan aktif dapat dipahami                  | NOT_RUN | NOT_RUN | Belum diisi                                                      |
| M04 | Pilih jawaban memakai sentuhan/pointer dan baca konten matematika          | Target dapat disentuh, teks/rumus tidak terpotong, tidak ada scroll horizontal tak sengaja  | NOT_RUN | NOT_RUN | Belum diisi                                                      |
| M05 | Tunggu penyimpanan jawaban, lalu refresh                                   | Status tersimpan sesuai respons nyata; jawaban tetap ada dan timer count-up berlanjut       | NOT_RUN | NOT_RUN | Belum diisi                                                      |
| M06 | Putuskan koneksi browser pada sesi tes, ubah jawaban                       | UI menunjukkan belum tersimpan/gagal, tidak mengaku berhasil                                | NOT_RUN | NOT_RUN | Jangan mematikan layanan umum                                    |
| M07 | Sambungkan kembali dan pilih retry                                         | Pilihan tidak hilang; status tersimpan muncul setelah acknowledgment                        | NOT_RUN | NOT_RUN | Belum diisi                                                      |
| M08 | Coba keluar saat Drill belum selesai; pilih batal lalu lanjut              | Peringatan menjelaskan timer/risiko jawaban; batal mempertahankan pengerjaan                | NOT_RUN | NOT_RUN | Belum diisi                                                      |
| M09 | Buka dialog submit, batalkan, lalu buka dan konfirmasi                     | Fokus dan pilihan jelas; batal tidak submit; konfirmasi memproses satu penyelesaian         | NOT_RUN | NOT_RUN | Belum diisi                                                      |
| M10 | Tinjau nilai, bintang, XP dan akses level setelah submit                   | Nilai dan XP sesuai jawaban/durasi/policy tersimpan; 80 membuka level berikutnya            | NOT_RUN | NOT_RUN | Catat nilai dan XP aktual, jangan menebak pembulatan             |
| M11 | Refresh hasil, buka pembahasan, lalu kembali ke hasil                      | Hasil tetap sama, jawaban read-only, navigasi pembahasan jelas                              | NOT_RUN | NOT_RUN | Belum diisi                                                      |
| M12 | Buka kembali dari riwayat dan coba submit ulang melalui alur yang tersedia | Tidak ada hasil/XP ganda; kegagalan akses ditampilkan dengan jelas                          | NOT_RUN | NOT_RUN | QA memeriksa ledger/outbox melalui alat tes                      |
| M13 | Baca pesan kosong/error dan coba tombol pemulihannya                       | Pesan dapat dipahami; tersedia tindakan yang sesuai dan pilihan pengguna terjaga            | NOT_RUN | NOT_RUN | Catat layar/kondisi yang benar-benar diuji                       |
| M14 | Nilai alur keseluruhan: mulai → jawab → submit → hasil                     | Penguji dapat menjelaskan langkah berikutnya tanpa bantuan; catat bagian yang membingungkan | NOT_RUN | NOT_RUN | Jangan menyamakan opini satu penguji dengan UAT seluruh pengguna |

Gunakan PASS/FAIL/BLOCKED/NOT_RUN per baris. Bila suatu cara input tidak
tersedia, catat batasnya; jangan menandai PASS. Catat temuan dengan langkah,
expected/actual, dampak dan bukti. Hasil otomatis axe tetap terpisah.

## Pencatatan setelah penguji mengirim hasil

Codex memeriksa kecocokan fingerprint run dan identitas penguji sebelum mengisi
`manual.json`. Contoh perintah **hanya setelah** seluruh pemeriksaan wajib
benar-benar dilakukan dan disetujui penguji:

```powershell
pnpm qa manual --scenario SIS-001 --run <RUN_ID> --check manual-keyboard --status <PASS|FAIL|BLOCKED> --reviewer "<nama penguji>" --note "<hasil desktop/mobile dan rujukan bukti>"
pnpm qa report --scenario SIS-001 --run <RUN_ID>
```

Jika ada baris wajib yang belum diperiksa, pertahankan NOT_RUN/incomplete dan
laporkan cakupan aktual. Tidak ada PASS yang boleh diisi oleh AI tanpa hasil manusia.
