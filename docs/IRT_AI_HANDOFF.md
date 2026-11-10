# Handoff mesin IRT Tryout — Data/AI ke Software

**Prioritas 1 — 10 November 2026:** [handoff delivery frozen](IRT_DELIVERY_HANDOFF_V1.md)
menetapkan mapping sumber, preflight read-only, fixture canonical/mirror dan
harness snapshot tanpa dispatch/R. Ini kesiapan input riset, bukan adopsi atau
publikasi hasil siswa. Kontrak ilmiah/transport existing tetap digunakan.

**Konteks delivery — 10 November 2026:**
[rekonsiliasi Admin dan strategi 24 jam](TRYOUT_IRT_DELIVERY_CONTEXT.md)
menjadi acuan urutan kerja terbaru: IRT Tryout multi-arm, fallback per arm di
main, dan self-adjustment ditunda. Pilihan anchor per proses harus kompatibel
dengan lima versi anchor bersama yang diwajibkan runtime. Tidak ada perubahan
payload, capability, approval produksi atau deployment melalui pembaruan ini.

**ENGINEERING IMPLEMENTATION, 10 November 2026.** Mesin riset lokal memakai
data sintetis. Dokumen ini tidak menyetujui penggunaan peserta asli, publikasi
nilai, kebijakan statistik produksi, atau deployment. Salinan di kedua repo
harus identik. Nama/kontak PIC dan jadwal rilis nyata tetap ditetapkan pemilik
tim; dokumen ini tidak mengarang approval atau estimasi tanggal produksi.

## Acuan tunggal

| Bagian | Sumber |
| --- | --- |
| Service AI | `ShafwanAdhi/numora-ai-service`, branch `main` |
| Kontrak ilmiah | `irt-calibration-v1`: AI `contracts/`, utama `packages/contracts/` |
| Transport | `irt-calibration-service-v1`, notification compute v3 |
| Implementasi Linux | `Dockerfile.irt-producer`, `research/irt-linux-image-v1.json` |
| Policy riset | `research/irt/policy-v1.json`, `tryout-irt-research-v1` |
| Bukti keluaran peserta | AI `research/irt/outcome-acceptance-v1.json`; utama `docs/IRT_OUTCOME_ACCEPTANCE_V1.json` |
| Bukti Linux/kapasitas | AI `research/irt/linux-acceptance-v1.json`; utama `docs/IRT_LINUX_ACCEPTANCE_V1.json` |
| Penjelasan ilmiah | AI `research/irt/README.md`; utama `docs/IRT_RESEARCH_RUNTIME.md` |
| Generator existing | `docs/GENERATOR_SERVICE_V2_HANDOFF.md`; kontrak generator v1/v2 tetap digunakan |

Manifest image/profile adalah acuan digest; jangan mengandalkan tag mutable.
Image yang diuji masih lokal dan tidak otomatis tersedia pada registry VPS.
Transfer image membutuhkan kanal/registry yang disepakati, atau `docker save`
dan `docker load`, kemudian pemeriksaan image ID. Build baru yang menghasilkan
digest berbeda memerlukan profil baru serta verifikasi, bukan penggantian pin.

## Tanggung jawab layanan

Software/main memiliki paket, batch, delivery pin, approval, rubric/grading,
eligibility authoritative, pemetaan akun privat ke pseudonym, outbox/dispatch,
verifikasi/adopsi artifact, penerbitan hasil dan fallback produk. Main juga
memiliki seluruh migrasi, RLS dan grants. Jangan membuat skema tandingan di AI.

AI menerima snapshot frozen dan resources yang sudah dipin, memvalidasinya,
mengkalibrasi 2PL/GPCM, menghitung EAP dan prediksi poin paket acuan, kemudian
menyegel artifact immutable beserta diagnostics. AI tidak melakukan grading
ulang, menerima PII/jawaban mentah, menulis hasil canonical, atau mengubah XP.
Perubahan alur admin harus diselesaikan pada adapter snapshot main selama
kontrak ilmiah tetap sama; tidak perlu membuat mesin kedua.

Kapabilitas saat ini: TRYOUT, satu dimensi, 2PL D=1/GPCM, beberapa arm dengan
lima versi anchor identik, partial/data-kurang, dan hasil tiap attempt.
Drill, comparison PASS/DRIFT, self-adjustment, serta publikasi belum didukung
runtime ini. Permintaan di luar kapabilitas ditolak, bukan diberi hasil palsu.

## Input, identitas dan keluaran

Main mem-pin respondent–attempt–package/version–batch, assigned/delivered arm,
versi question/rubric, mask paket acuan, grade ordinal/poin, exposure, policy
resources dan approval, snapshot/digest, runtime serta dispatch generation.
Paket aktif saat komputasi bukan sumber identitas attempt historis. ORIGINAL
berasal dari mapping canonical/version yang disetujui, bukan tebak susunan paket.

`POST /api/v1/irt/compute/execute` menerima notification ID/digest/generation,
bukan body ilmiah; respons adalah ACK/status. `GET
/api/v1/irt/compute/requests/{requestId}?inputDigest=...&dispatchGeneration=...`
membaca status pin yang sama. `/api/v1/irt/capabilities` memerlukan bearer token.
Main menyiapkan input frozen lewat jalur riset existing. Jangan meneruskan
payload kontrak baru ke adopter legacy yang masih menolak respondent contract.

Contoh lengkap sintetis yang dapat divalidasi tersedia dalam
`irt-calibration-v1/examples/`: `tryout-input.json`, `tryout-result.json`,
`tryout-insufficient.json`, `tryout-not-comparable.json`,
`tryout-unscorable.json`, dan `tryout-timeout.json`. ACK sintetis ada dalam
`irt-calibration-service-v1/examples/accepted.json`. ID/digest contoh bukan
request yang terdaftar dan tidak dapat langsung dieksekusi sebagai approval.

| Kondisi | Keluaran yang diharapkan |
| --- | --- |
| Layak dan presisi cukup | `SUCCEEDED`, peserta `SCORED`, theta/SD/nilai dan pin acuan |
| Sampel/kategori/precision belum cukup | `SUCCEEDED`, `INSUFFICIENT`, nilai null |
| Linking tidak layak dengan parameter tersedia | `NOT_COMPARABLE`, nilai null |
| Anchor/item juga gagal gate lain | Dapat `INSUFFICIENT`; baca diagnostics, jangan menebak hanya dari satu status |
| Tidak ada observasi sah | `UNSCORABLE`, nilai null |
| Model tidak konvergen dengan output ilmiah valid | `INSUFFICIENT`, parameter/nilai yang tidak layak tetap null |
| Exception engine | `FAILED + INTERNAL_ERROR`, diagnostics tahap/kode aman |
| Timeout/dependency | `FAILED`, retryable sesuai kontrak |
| Approval revoked, digest berbeda, execution stale | Ditolak sebelum adopsi; artifact usang tidak diterbitkan |

Satu hasil untuk setiap attempt input, dengan identitas/version yang cocok.
Semua salah atau kosong yang sah bukan otomatis UNSCORABLE. Nilai memakai
prediksi poin pada mask acuan frozen yang sama, bukan percentile/min–max atau
jaminan semua benar =100. Posterior SD bersifat kondisional pada parameter item.

## Operasi Linux lokal dan konfigurasi

Jalankan dari AI:

```text
docker build --platform linux/amd64 -f Dockerfile.irt-producer -t numora-irt-producer:linux-v1 .
python -B tools/verify_irt_linux.py --main-repo ../Numora --output .scratch/irt-linux-check --capacity
```

Perintah kedua membutuhkan image tepat yang dipin pada manifest, Node/build
database main yang sudah tersedia, PostgreSQL image disposable yang dipin,
serta Docker. Ia membuat dan membersihkan resource miliknya sendiri. Tidak
menggunakan dotenv, database bersama, atau peserta asli. Jangan mengubah source
selama verifikasi: pemeriksaan hash sengaja menolak perubahan tersebut.

| Konfigurasi | Arti |
| --- | --- |
| `NUMORA_IRT_RESEARCH_ENABLED` | Default false; true hanya untuk proses riset yang dikonfigurasi |
| `NUMORA_IRT_RUNTIME_PROFILE` | Eksplisit `linux-v1` atau `windows-v4`; pilihan lain ditolak |
| `NUMORA_IRT_PRODUCER_IMAGE` | Harus cocok digest image producer Linux pada profile |
| Mount profile Linux read-only | `/app/research/irt-runtime-linux-v1.json`, tidak digenerasi otomatis saat startup |
| `NUMORA_IRT_RESEARCH_TOKEN` | Bearer rahasia, disalurkan privat |
| `COMPUTE_DATABASE_URL` | Role compute terbatas; tidak boleh pemilik/superuser/penulis canonical |
| `COMPUTE_SERVICE_PRINCIPAL_ID` | Principal aktif yang disetujui main |
| `NUMORA_IRT_WORK_ROOT` | Direktori kerja privat; UID producer dan proses R harus dapat mengaksesnya |
| `NUMORA_IRT_WORK_VOLUME` | Named volume privat yang sama pada supervisor dan R, termasuk subdirektori execution |
| `NUMORA_IRT_DOCKER_WORK_ROOT` | Alternatif pemetaan bind root pada host Docker; bukan URL atau path peserta |

API dan daemon adalah proses terpisah: API memakai CMD image; worker memakai
`python -m numora_service.irt.daemon`. API tidak membutuhkan Docker socket.
Supervisor worker menggunakan Docker pada host tepercaya untuk membuat proses
R yang tidak berjaringan, read-only, tanpa credential database. Akses Docker
memberi kewenangan host yang luas; itu bukan sandbox untuk pengguna yang tidak
dipercaya. Jangan mengekspos daemon Docker ke jaringan atau menyalin token DB
ke container R. Volume per execution tetap privat (0700), R memakai UID yang
sama pada Linux dan direktori dibersihkan setelah selesai/gagal.

ACK timeout 10 detik, proses 15 menit, heartbeat 15 detik, lease 60 detik,
concurrency 1, maksimum tiga execution/request. Redis bukan durable job store.
Retry notification mempertahankan ID/digest/generation dan mendapat artifact
yang sama. Redispatch teknis memerlukan generation baru yang diotorisasi main,
dengan input/policy/seed identik; data kurang tidak di-retry untuk mencari nilai
lain. Snapshot/policy berbeda membuat request baru.

## Acceptance dan batas penggunaan

Gunakan laporan per tahap, bukan menjumlahkan tes yang tumpang tindih. Laporan
numerical recovery v1 berisi 30 replikasi; hanya empat memakai producer penuh.
Outcome acceptance melengkapi success/failure path. Bukti Linux memisahkan
pengujian correctness dan sampling kapasitas dari klaim perangkat produksi.
Host awal satu CPU/sekitar 1,8 GiB RAM berhasil menyelesaikan 2.000 peserta,
namun terputus saat menyiapkan snapshot 4.998 peserta. Pemilik mengizinkan
resource sementara dua CPU/sekitar 3,8 GiB RAM dan 2 GiB swap. Run tersebut
menyelesaikan 2.000 peserta SCORED dan 4.998 peserta NOT_COMPARABLE. Limit
producer dinaikkan di tengah run dari 512 MiB ke 1 GiB karena menyentuh batas;
ini eksplorasi sizing, bukan benchmark dengan resource tetap. R dibatasi
2 GiB dan satu thread numerik. Sampling RAM dapat melewatkan puncak; tidak ada
sertifikasi kapasitas VPS 2 CPU/2 GiB atau SLO produksi.

Baseline tanpa DIF ditahan pada 20/30 replikasi. Sampel lebih besar membantu
pada kasus sintetis yang diuji, tetapi belum membuktikan equivalence atau bebas
DIF. Tidak ada threshold yang dilonggarkan. Validasi dimensi data sekolah,
ketidakpastian efek anchor, blueprint/approval akademik dan kebijakan produksi
tetap diperlukan. Main menahan publikasi/fallback sesuai kebijakan Product;
AI tidak mengisi angka alternatif.

Rollback: hentikan intake riset, biarkan job dengan pin lama selesai pada
runtime lamanya atau batalkan secara tercatat, lalu jalankan source + profile +
image yang tepat. Jangan mengubah pin request berjalan atau menjalankan source
baru dengan hash lama. Tidak ada migrasi database bersama atau deployment
dalam pekerjaan ini.


Pemeriksaan handoff lintas repo:

```text
python -B tools/check_irt_handoff.py --main-repo ../Numora
```

Gunakan checkout main dengan seluruh dependency PR riset; validator menolak
kontrak/dokumentasi yang berbeda byte atau source pin yang tidak sesuai.
Status teknis boleh siap untuk integrasi lokal sementara status akademik dan
rilis produksi tetap belum disetujui. PIC operasional tim AI bertanggung jawab
atas image/runtime/diagnostics; PIC Software bertanggung jawab atas adapter,
role database, outbox, penerimaan dan publikasi. Nama individu harus diisi tim
sebelum deployment lintas VPS.
