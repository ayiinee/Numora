# Handoff delivery frozen untuk IRT Tryout

**ENGINEERING IMPLEMENTATION — prioritas 1, 10 November 2026.** Kontrak tetap
`irt-calibration-v1`; tidak ada endpoint, migrasi atau estimator baru. Main
memiliki manifest dan snapshot canonical. AI menerima fixture mirror, bukan
otoritas alternatif. Semua approval contoh hanya sintetis dalam database
disposable. Kesiapan struktural tidak berarti linking atau produksi disetujui.

## Dua pembekuan dan mapping sumber

| Sumber authoritative Main | Field / pemeriksaan |
| --- | --- |
| `measurement_contexts`, `tryout_batches` | Context ID/revision, batch, starts/cutoff/resultDue. Batch harus CLOSED, cutoff sudah lewat, grading cutoff tidak di masa depan. |
| `tryout_batch_packages`, `assessment_arm_revisions`, `assessment_packages`, `package_items` | Seluruh paket/arm batch, package version dan urutan 30 question versions. Manifest digest PostgreSQL cocok; paket frozen sebelum batch mulai. Tidak memakai current package untuk menulis ulang delivery historis. |
| `assessment_arm_sets`, blueprint dan distribution policy | Set OPEN/CLOSED, blueprint SEALED dengan approval/reference, policy alokasi cocok context/ecosystem dan digest. Precedence sekolah/kelas tidak dihitung AI. |
| `question_versions`, `question_variants`, `scoring_rubric_versions` | Family/original lineage, jenis soal/model, content digest, rubric ID/maximum category; konten READY/CONTENT_VALID dan rubric SEALED/approved. Lima versi anchor yang sama hadir di seluruh arm. |
| `assessment_attempts` | Seluruh attempt TRYOUT dalam batch selain CANCELLED menjadi roster. Pending/ungraded menahan freeze. Duplikasi siswa atau penghilangan attempt ditolak; CANCELLED dikecualikan secara eksplisit, bukan dihapus dari histori. |
| Assignment dan delivery pin attempt | Assigned/delivered arm, paket aktual, mode dan first-valid evidence. Satu attempt per siswa/batch. Account ID hanya dipakai Main untuk pseudonym HMAC berscope context/key version. |
| `attempt_items`, `attempt_answers` | Identitas item/rubric/max points, waktu grade final, kategori ordinal dan poin authoritative. Nilai draft pemanggil tidak menjadi grading alternatif. |
| Manifest delivery dan ledger exposure | Item benar-benar disajikan serta paparan sebelum attempt mulai. Salah/kosong sah tetap nol; NOT_PRESENTED/INVALID membawa null dan excluded. Prior exposure/retry tetap excluded menurut jalur riset existing. |
| Policy versions dan configuration approvals | Lima jenis resource: model, quality, eligibility, scoring, scoreMapping. ID/version/definition/digest/scope cocok dan belum revoked. Comparison null, daftar comparison kosong. |

Sebelum batch dibuka, workflow delivery harus mem-pin daftar paket, urutan,
anchor, rubric, blueprint dan policy alokasi. Guard schema existing melindungi
paket/revisi serta membership batch. Sesudah batch tutup dan grading final,
adapter membekukan snapshot skor; bukan mengubah manifest paket tadi.

Inspeksi memakai transaksi **REPEATABLE READ READ ONLY**. Freeze memakai
REPEATABLE READ dan guard insert existing. Digest tetap
`PG_JSONB_IRT_RESEARCH_V1`: body tanpa inputDigest, resources serta runtime.
Inspeksi tidak membuat request, dispatch, outbox atau hasil. Freeze hanya
menyimpan request; dispatch tetap operasi terpisah dan tidak dijalankan tahap ini.

## Fixture canonical dan mirror

- Main: `packages/testing/fixtures/irt-delivery-v1/`.
- AI: `tests/fixtures/irt-delivery-v1/`, salinan byte-identik; perbaiki canonical
  terlebih dahulu dan perbarui mirror/checksum bersama.
- Dua arm: seed **20261119**, 1.000 + 1.000 peserta.
- Tiga arm: seed **20261120**, 1.000 + 1.000 + 100 peserta. Semua respons valid
  tetap eligible; ukuran 100 berada di bawah minimum riset 500, bukan eligibility
  palsu atau bukti keputusan ilmiah PARTIAL telah dihitung.
- `small/` berisi dua peserta/arm, semua PG/MCMA/Kategori. Dibentuk dari desain
  penuh dahulu lalu diambil subset deterministik; bukan regenerasi parameter.
- Recipe mem-pin source simulator, template input dan policy. Opsi MCMA eksplisit
  pada simulator existing tidak mengubah desain default. Versi/rubric sintetis
  baru dipakai untuk keluarga yang diubah menjadi MCMA.
- Truth terpisah dari input AI. Manifest SHA-256 mengikat byte file; hash file
  **bukan** inputDigest PostgreSQL. `inputDigest` pada contoh kecil masih sentinel
  kontrak dan ditandai UNBOUND; jangan dispatch file contoh sebagai request sah.
- `research-resources.json` berisi definisi riset. Ref/approval/digest resource
  diikat ulang oleh harness PostgreSQL lokal. Fallback sidecar dimiliki Main,
  BLOCKED_UNAPPROVED sampai policy sah tersedia; tidak masuk payload ilmiah.

Dari root Main, gunakan AI checkout yang memuat fixture MCMA terbaru:

```powershell
python -B scripts/build-irt-delivery-fixtures.py --ai-repo ../Numora-ai-service --small --output packages/testing/fixtures/irt-delivery-v1/small --check
python -B scripts/build-irt-delivery-fixtures.py --ai-repo ../Numora-ai-service --output <direktori-temporer>
node --test scripts/test-irt-delivery-fixtures.test.mjs packages/irt-orchestration/src/calibration-research.test.mjs
```

Dataset besar hanya dibentuk lokal bila diperlukan; jangan commit hasilnya.
Flag `--check` memverifikasi reproduksibilitas tanpa menulis file.

## Inspeksi dan bukti freeze lokal

CLI `scripts/inspect-irt-delivery.mjs` menerima bundle JSON `{value, resources,
runtime}` dari file atau stdin. Koneksi wajib eksplisit lewat
`IRT_RESEARCH_MAIN_DATABASE_URL`, localhost dan nama `irt_research_test_*`.
Tidak membaca dotenv atau beralih ke database bersama.

Set `NUMORA_IRT_RESEARCH_ENABLED=true`, `IRT_PSEUDONYM_SECRET` minimal 32 byte,
dan `IRT_PSEUDONYM_KEY_VERSION` nonkosong melalui environment privat. Jangan
menaruh secret dalam bundle, Git atau log. Jalankan:

```powershell
node scripts/inspect-irt-delivery.mjs <bundle-lokal.json>
```

Output aggregate: `structuralReady`, `sourceComplete`, jumlah peserta/respons dan
included responses per arm, sample check terhadap policy, serta blocker aman.
`scientificGate=NOT_EVALUATED`, `productionApproved=false`. Pemeriksaan fail-fast:
perbaiki blocker pertama lalu ulang; tidak mengklaim daftar seluruh error.
Atau jalankan harness yang membangun semua sumber/binding sendiri:

```powershell
$env:NUMORA_AI_SERVICE_PATH = '<root-Numora-ai-service>'
python -B scripts/test-irt-delivery-local.py --output <direktori-temporer>
$env:IRT_RESEARCH_UPGRADE_TEST = 'true'
python -B scripts/test-irt-delivery-local.py
```

Harness membutuhkan PostgreSQL 16 lokal dan build database existing. Ia membuat
cluster privat, menerapkan migrasi existing, menyiapkan approval/grade sintetis,
menguji lalu membersihkan cluster. Tidak menonaktifkan trigger. Export opsional
memuat snapshot pseudonymous dengan digest PostgreSQL serta binding sintetis;
approval tersebut tidak dapat di-resolve pada database lain. Runtime pin pada
bundle adalah input uji, bukan validasi host/image produksi.

## Bukti dan dependency berikutnya

Penerimaan lokal mencakup kedua bahasa, source/checksum/parity, dua/tiga arm,
seluruh format, penghilangan/duplikasi attempt, anchor/versi/rubric/max points
salah, response hilang, policy berbeda/revoked, grade belum final, replay dan
konflik idempotensi. Kosong sah, tidak-disajikan dan invalid diuji terpisah;
perubahan paket frozen ditolak dan body snapshot tetap sama. Upgrade memakai
histori serta XP nonkosong dan memeriksa keduanya tetap utuh. Tidak ada R,
dispatch, compute job atau adopsi canonical pada harness prioritas 1.

**Batas kontrak:** ORIGINAL_FALLBACK/crossover pada kontrak v1 hanya didukung
untuk Drill. Crossover Tryout ditolak atau menjadi blocker, tidak disamarkan
sebagai assigned delivery. Fallback **nilai per arm** tetap diizinkan; itu
berbeda dari fallback **delivery paket** dan dikerjakan finalizer Main nanti.

Dependency produksi tetap eksplisit: manifest delivery dan roster authoritative,
kelengkapan ledger exposure, approval akademik/blueprint/rubric dan policy
ilmiah/fallback, PIC, aturan alokasi ADM-DEP-03 serta adopsi/rilis Main. Runtime
Linux fresh-checkout masih mempunyai blocker digest yang dicatat di
[konteks delivery](TRYOUT_IRT_DELIVERY_CONTEXT.md). Penanganannya prioritas 2;
tidak ada pin atau threshold yang dilonggarkan pada tahap ini.
