# Checklist keyboard dan usability

Gunakan build/fingerprint yang sama dengan run. Pakai akun sintetis dan catat reviewer serta waktu.

1. Buka materi dan Drill dengan keyboard; fokus terlihat, urutan logis, pilihan radio bisa dioperasikan.
2. Navigasikan soal, konfirmasi submit, batal/lanjut, hasil dan pembahasan tanpa mouse; tidak ada keyboard trap.
3. Pada lebar 390, 768 dan 1440 piksel, baca soal, pesan save/error dan hasil; tidak ada kontrol terpotong.
4. Dengan jaringan terputus, pesan belum tersimpan memberi tindakan yang jelas; setelah pulih pengguna bisa menyimpan lagi.
5. Periksa nilai, XP, latest/best dan penjelasan secara manual terhadap fixture serta aturan; loading/empty/access denied dapat dipahami.

Rekam hanya setelah benar-benar dilakukan:

`pnpm qa manual --scenario SIS-001 --run <run-id> --check manual-keyboard --status PASS --reviewer <alias> --note "Checklist 1–5 dijalankan pada build ini; tulis hasil nyata"`

Gunakan FAIL bila ada hambatan, tulis langkah reproduksi dan bukti yang disanitasi. Lalu `pnpm qa report --scenario SIS-001 --run <run-id>`. Otomatisasi axe tidak menggantikan checklist ini.
