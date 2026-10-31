# Bukti load SIS-001

**ENGINEERING DECISION — diagnostik yang diminta pengguna, 28 Oktober 2026 WIB.**
Konfigurasi VU/tahap/gracefulStop/HTTP timeout mengikuti config dan skrip k6 yang
disetujui. Jangan menjalankan file ini terhadap cloud atau mengganti target localhost.

K6 mengeluarkan metrik `qa_client_event` ke JSON stream lokal melalui `--out`.
Tidak ada request tambahan ke aplikasi untuk mengirim receipt. Setiap operasi
memiliki phase, scenario, VU, iteration, actor sintetis dan ID attempt ketika
tersedia. Event mencatat start request/response, gagal save, submit request/response
serta akhir iterasi. Respons submit menyimpan status, validitas, nilai dan XP;
token, header autentikasi dan body soal tidak menjadi receipt.

`scripts/qa/load-receipts.mjs` membaca stream secara bertahap. Adapter menyimpan:

- `load-client-receipts.json`: lifecycle per operasi; tidak menganggap request
  yang dimulai sebagai respons sukses.
- `load-durable-snapshot.json`: attempt baru, ledger XP dan completion outbox
  dalam satu snapshot baca-saja, terpisah dari fixture sebelum load.
- `load-identity-reconciliation.json`: identitas/isi hasil yang diakui, owner,
  jumlah efek bisnis tepat satu, nilai/XP, dan commit tanpa respons yang teramati.

Artefak mentah tetap ignored. Laporan yang dibagikan memuat ringkasan dan contoh
identitas sintetis yang diperlukan, bukan token, dump atau seluruh stream.

Gate lama `graded == qa_completed` tetap berlaku, ditambah pemeriksaan identitas
dan isi. Nol/malformed receipt tidak lulus. Submit yang belum final pada snapshot
ditandai incomplete; graded tanpa acknowledgment tetap temuan, termasuk ketika
terkait interupsi atau respons gagal. Tidak ada klaim kehilangan data hanya dari
selisih counter. Snapshot sesudah penghentian server, bila dikumpulkan, adalah
follow-up terpisah dan tidak menggantikan snapshot/hasil awal.

Instrumentation menambah pekerjaan pada generator, sehingga angka latensi tetap
baseline lokal dan tidak dibandingkan sebagai bukti sebab-akibat kapasitas.
Pemeriksaan load memeriksa persistensi outbox; delivery analytics diuji terpisah
melalui volume/velocity/recovery. Tidak ada SLO produksi yang diciptakan.

# Investigasi commit tanpa respons — 28 Oktober 2026

Lihat [laporan OOM/response](../investigations/20261028-submit-oom/REPORT.md).
Fault API terarah membuktikan SQLSTATE53200 sesudah grading dan timeout klien15s
sebelum respons siap, dengan GET/concurrent retry idempoten. Bukti ini bukan
kelulusan load. Receipt117 tanpa respons pada full838c1952 seluruhnya berada
538–1184ms sebelum metric akhir fase; jangan menyebutnya117 timeout HTTP15s.
Observer HTTP opt-in hanya ada dalam harness QA dan tidak merekam token/body.
Metadata status/jumlah soal pada start ditambahkan untuk investigasi race berikutnya.
VU, stage, gracefulStop, drain dan batas full tidak berubah.
