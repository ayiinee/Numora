# SIS-001 — OOM dan commit tanpa respons

**ENGINEERING EVIDENCE — 28 Oktober 2026 WIB.** Investigasi
`d854de9e-a511-4d80-8e20-c11609ccdf2f`, parent full
`838c1952-e8f9-4681-8396-ea74365157a1`. Dua fault diagnostic **PASS**;
hasil full sebelumnya tetap **FAIL:13 PASS /1 FAIL /1 NOT_RUN**.
Ini investigasi penyebab dan pemulihan, bukan retest kapasitas atau penerimaan produksi.

## Hasil yang dapat dibuktikan

| Temuan                                       | Bukti                                                                                                                                                                                                          | Kesimpulan dan batas                                                                                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 117 submit tanpa respons pada full lama      | 116 di stress,1 di load; seluruhnya dikirim538–1184ms sebelum metric terakhir fase. Fase load berlangsung280002ms, stress69998ms, sesuai durasi+gracefulStop existing                                          | Konsisten dengan interupsi generator di akhir fase, bukan bukti117 HTTP15s timeout. Timestamp metric terakhir adalah proksi batas generator, bukan timestamp pembatalan socket persis                                                        |
| OOM lintas backend PostgreSQL                | 27 error pada11 PID di dua run lama; alokasi gagal48–27336byte, berbagai konteks. Dump konteks sekitar6–8MB; beberapa error berasal dari `record_assessment_delivery`, beberapa dari pembacaan attempt/package | Kegagalan alokasi kecil pada banyak backend memperkuat dugaan tekanan commit sistem. Dump backend tidak mencakup seluruh memori native/shared, dan tidak membuktikan puncak Windows saat run lama                                            |
| Tekanan commit Windows sekarang              | 60 sampel pada06:25:12–06:27:28 WIB: headroom minimum213008384byte, penggunaan commit maksimum98,88%; RAM fisik tersedia minimum2638503936byte                                                                 | RAM fisik tersedia tidak sama dengan kemampuan commit baru. Satu startup PowerShell pada investigasi ini juga gagal `System.OutOfMemoryException`; waktu persis kejadian shell tidak direkam. Bukan bukti identitas proses penyebab terbesar |
| HTTP500 setelah commit                       | Fault SQLSTATE53200 di pencatatan delivery pembahasan menghasilkan500 pada attempt yang sudah GRADED                                                                                                           | Grading/progres/ledger/outbox dapat sukses sementara pembentukan/pencatatan respons sesudah commit gagal. Fault disengaja membuktikan mekanisme, bukan atribusi stack setiap500 historis                                                     |
| Klien berhenti menunggu sebelum respons siap | Delay16s di delivery; klien memakai timeout15s yang sama. Socket tertutup pada15013ms tanpa `writableFinished`; respons201 baru disiapkan16067ms                                                               | Respons yang disiapkan server tidak sama dengan respons diterima klien. Tidak ada `response_finished` sukses pada koneksi yang telah putus                                                                                                   |
| GET/retry sesudah error/timeout              | Untuk kedua attempt: GET200 dan dua concurrent retry201 memiliki seluruh DTO identik;1 ledger XP,1 completion event,1 manifest pembahasan                                                                      | Jalur pemulihan idempoten pada dua fault ini lulus. Tidak mengubah gate strict count/identity full dan tidak menutup seluruh load                                                                                                            |

`EVIDENCE.json`, `HTTP_OBSERVATIONS.json`, `HISTORICAL_OOM.json` dan
`INTERRUPTION_ATTRIBUTION.json` menyimpan identitas/timestamp/assertion yang
disanitasi. Tidak ada header autentikasi, payload soal, stack atau parameter SQL
di bukti bersama. Event `response_finished` hanya membuktikan lifecycle server,
bukan acknowledgment klien; receipt klien tetap diperlukan.

## Cara diagnostik dilakukan

Database baru khusus run, prefix Redis dan proses fixture terpisah; guard localhost
dan migrasi resmi dipakai. Tidak ada akses cloud Development/staging. API produk
dibangun lalu dijalankan nyata; hanya autentikasi dan konten merupakan fixture.
Trigger test-only terikat pada UUID attempt serta jenis manifest pembahasan:
SQLSTATE53200 atau `pg_sleep(16)`. Trigger/tabel/function fault dihapus setelah
kasus; proses API milik run dihentikan, dengan exit1 akibat terminasi harness
yang disengaja. Hasil assertion/diagnostic exit0 dicatat terpisah dari exit child.

Versi yang diuji adalah worktree parent70188e8 ditambah patch observer QA;
`dirty:true` dan fingerprint lengkap dicatat, bukan klaim acceptance pada SHA
bersih baru. Pemindahan helper ke lokasi repository dan format tidak diartikan
sebagai full baru. Tidak ada kode aplikasi, schema/migrasi bersama, formula XP,
pool koneksi atau konfigurasi OS yang diubah.

Observer opt-in pada `qa/runtime/serve.mjs` merekam correlation operation/attempt,
SQLSTATE dari cause error, metadata respons yang dibatasi, serta finish/close.
Filter problem-details produk tetap dipanggil sehingga error tidak disembunyikan.
Metadata start k6 kini merekam status attempt/jumlah soal dan correlation header
untuk membedakan kandidat race dari payload salah. Belum ada klaim bahwa satu
integrity counter diagnostik lama telah teratribusi atau terselesaikan.

## Regresi dan pengulangan

- Workflow58/58 PASS,0 skip, termasuk sanitasi observer dan receipt metadata.
- Dua fault API/PostgreSQL PASS dengan GET/retry/result dan jumlah efek idempoten.
- Lint terarah PASS; build API serta migrasi diagnostik PASS.
- Beban/full baru **NOT_RUN**: tekanan commit masih teramati dan belum ada
  perbaikan sumber daya untuk membandingkan kapasitas. Tidak mengulang sampai hijau.
- Parameter baseline tetap VU10/25/50/100+250, stage60s, HTTP15s,
  gracefulStop10s, drain120s, full3600s setelah build. Delay16s adalah fault
  terarah di database disposable, bukan perubahan profil kapasitas.

Untuk diagnostik fault eksplisit pada repository aktif:

```powershell
pnpm qa validate
pnpm qa doctor --profile full
node qa/scenarios/siswa/SIS-001/recovery/submit-response.mjs
```

Pakai Node sesuai repository. Helper membuat run/database baru dan menulis raw
evidence pada `qa/.local/submit-oom-diagnostics/<id>`. Jangan memindahkan fault
tersebut ke schema aplikasi. Observer aktif hanya ketika
`QA_HTTP_EVIDENCE_FILE` mengarah ke file baru di `qa/.local`; source produksi
tidak mengimpor observer. Pengukuran berinstrumentasi harus diberi label karena
logging dapat menambah overhead. Hasil lama tidak diubah.

## Handoff dan tindakan berikutnya

**PROPOSED — perlu tindak lanjut engineering/lingkungan:**

1. Pemilik lingkungan meninjau kapasitas commit/pagefile dan proses host;
   pilih target tes terisolasi dengan headroom memadai. Jangan menyimpulkan
   penambahan RAM, `work_mem`, pool atau timeout sebagai perbaikan tanpa pengukuran.
   Investigasi ini tidak mengubah pagefile atau menghentikan aplikasi pengguna.
2. Pada run beban berikutnya, aktifkan telemetry aman request/response dan commit
   Windows sepanjang eksperimen. Korelasikan SQLSTATE dan response close ke
   receipt/attempt, termasuk status/jumlah soal pada start untuk kandidat race.
   Pertahankan seluruh parameter dan strict gate. Redis/database/proses baru.
3. Developer mempertahankan retry/GET memakai attempt yang sama ketika hasil
   submit ambigu. Jangan mengabaikan kegagalan delivery atau memindahkannya ke
   transaksi grading hanya untuk membuat500 hilang. Respons pending/recovery yang
   lebih spesifik memerlukan desain kontrak dan regresi sebelum perubahan produk.

Manual desktop/mobile tetap **NOT_RUN**, Google OAuth nyata **NOT_RUN**,
staging **NOT_CONFIGURED**, acceptance akademik/eksternal dan integrasi migrasi
tetap **OPEN/BLOCKED** sesuai matriks. Tidak ada PASS manual buatan AI, merge,
deployment atau pernyataan siap produksi.

## Acuan teknis

- [Microsoft: ukuran commit dan RAM fisik](https://learn.microsoft.com/en-us/windows/win32/memory/memory-performance-information)
  serta [CommitLimit/CommitTotal](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-performance_information).
- [PostgreSQL16: resource consumption](https://www.postgresql.org/docs/16/runtime-config-resource.html).
- [k6 graceful stop dan interupsi iterasi](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/graceful-stop/).
- [Node24 HTTP lifecycle](https://nodejs.org/docs/latest-v24.x/api/http.html).
