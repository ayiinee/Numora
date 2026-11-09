# Kontrak kalibrasi IRT dan hasil peserta v1

**ENGINEERING DECISION — 8 November 2026:** paket ini menetapkan boundary antarlayanan untuk input kalibrasi Drill/Tryout dan artifact hasilnya, berdasarkan keputusan pemilik dalam konteks varian/IRT v2. Schema, contoh, validator dan pengujian dipelihara identik di kedua repo. Tidak ada nilai threshold, rubrik akademik baru, engine kalibrasi, migrasi, endpoint atau aktivasi publikasi yang dibuat oleh paket ini.

Lokasi Numora: `packages/contracts/irt-calibration-v1/`. Lokasi AI: `contracts/irt-calibration-v1/`. Versi payload adalah **`irt-calibration-v1`**, terpisah dari envelope/notification compute **v3** dan HTTP **generator-service-v1** yang tetap dipertahankan. Legacy v3 `calibration-payload-v3` masih item-only dan menolak respondents; jangan memasukkan payload baru ke adopter lama. Scope v1 adalah `LEVEL` Drill dan `TRYOUT_BATCH`; IRT Indikator/Bab memerlukan kontrak versi berikutnya, bukan averaging theta atau pemaksaan ke konteks Level.

## Artifact dan cara menguji

| File                                                            | Fungsi                                                                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.schema.json`, `input.schema.json`, `result.schema.json` | JSON Schema draft 2020-12, field eksplisit, unknown properties ditolak.                                                                       |
| `types.d.ts`                                                    | Tipe TypeScript yang dihasilkan dari schema, bukan interface handwritten kedua.                                                               |
| `validate.mjs`, `validate.py`                                   | Validator independen JavaScript/Ajv dan Python/jsonschema; selain shape, memeriksa referensi, coverage, state dan pencocokan input/output.    |
| `examples/`                                                     | Contoh sintetis Drill/Tryout normal, data kurang, mixed-arm, not-comparable, anomaly, unscorable dan timeout. Tidak memuat data peserta asli. |
| `conformance.fixture.json`                                      | Vektor positif/negatif yang sama untuk kedua implementasi validator.                                                                          |
| `dispatch.fixture.json`                                         | Contoh identitas lease/dispatch yang diharapkan main; bukan body notification baru.                                                           |
| `check-parity.mjs`                                              | Membandingkan seluruh isi paket dua repo secara byte-for-byte; tidak memakai network/credential.                                              |

Semua UUID, approval, digest, gate dan estimasi pada contoh adalah **TEST ONLY**. Jumlah responden contoh kecil untuk keterbacaan kontrak dan bukan minimum IRT. `SYNTHETIC_EXAMPLE_GATE`, parameter dan interval contoh tidak menyatakan kalibrasi atau PASS empiris yang benar. Validator boundary tidak dapat membuktikan scientific gate; itu tugas engine dan review evidence/policy yang diadopsi.

Dari root Numora:

```powershell
node scripts/validate-contracts.mjs
node --test packages/contracts/irt-calibration-v1/contract.test.mjs
node packages/contracts/irt-calibration-v1/generate-types.mjs --check
node packages/contracts/irt-calibration-v1/check-parity.mjs ../Numora-ai-service/contracts/irt-calibration-v1
```

Dari root AI, dengan dependency `jsonschema` yang sudah dipin dalam `requirements-service.lock`:

```powershell
python contracts/irt-calibration-v1/test_contract.py
```

Python tidak memerlukan Node, database, Redis atau koneksi Numora. Untuk menjalankan validator/test JavaScript dari salinan AI tanpa dependency Node lokal, set `NUMORA_REPO_PATH` ke root Numora yang sudah memiliki dependency Ajv, lalu jalankan `node --test contracts/irt-calibration-v1/contract.test.mjs`. Default resolver JavaScript adalah workspace Numora, bukan fallback ke package global.

Regenerasi tipe menggunakan `node <lokasi-paket>/generate-types.mjs`, memakai Prettier existing Numora (resolver `NUMORA_REPO_PATH` yang sama saat dijalankan dari AI). `--check` gagal jika tipe tertinggal dari schema. Tipe hanya bentuk struktural; selalu jalankan validator boundary untuk invariants. Perubahan payload yang mengubah arti field/status atau melonggarkan eligibility perlu versi baru, contoh dan tes yang diselaraskan. Nama `v1` tidak boleh dipakai untuk implementasi yang menyisipkan field tambahan diam-diam.

## Transport dan kepemilikan

1. Main membentuk snapshot immutable berisi assessment/scoring/exposure yang sudah terverifikasi, memilih policy yang approved, lalu mem-pin `requestId`, `snapshotId`, `inputDigest`, `calibrationId` dan konteks. Main memvalidasi input sebelum dispatch.
2. Notification v3 tetap hanya `contractVersion: 3`, `requestId`, `inputDigest`, `dispatchGeneration`. Jangan kirim data siswa di Redis. Adapter compute mengambil payload baru dari sumber main yang terotorisasi, dan hanya jika kontrak payload ini dipilih eksplisit.
3. Eksekusi memakai lease/dispatch generation yang berlaku. Compute membaca snapshot dan definisi policy yang cocok pin, menghitung, lalu menyegel result artifact. Ia tidak menulis canonical grades, XP, unlock atau publication.
4. Main memanggil `validateResult(result, frozenInput, expectedDispatch)` / `validate_result(...)`, memeriksa kembali authorization/approval, digest, status request/lease dan provenance artifact dalam transaksi adopsi, kemudian menerapkan policy finalisasi/publikasi. Pure validator bukan pengganti pemeriksaan database tersebut.

Tidak ada endpoint kalibrasi baru yang diklaim sudah berjalan. Registry/adapter, input views, artifact-kind negotiation, adopter responden dan finalisasi multi-arm harus diimplementasikan forward pada pekerjaan runtime berikutnya. Jangan menghapus `RESPONDENT_CONTRACT_NOT_APPROVED` hanya karena file kontrak ini tersedia. Guard dapat diganti hanya setelah producer, mapping approved, adapter, migrasi dan tes publication selesai.

`inputDigest` adalah digest otorisasi frozen request milik main yang sudah digunakan foundation v3. Field ini diteruskan persis; bukan hash ad hoc seluruh JSON yang mengandung dirinya sendiri. Adapter harus membuktikan bahwa payload lengkap, manifest dan semua pin merupakan bagian dari komitmen frozen input. SQL/serialization/digest recipe serta policy resources harus dipasang bersama adapter dan tidak boleh diasumsikan dari JSON stringify lintas bahasa.

## Input dan identitas

| Kelompok          | Makna                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identitas request | `requestId`, `snapshotId`, `inputDigest`, `calibrationId` wajib sama pada output. `context` juga harus identik, termasuk revision.                                                                                                                                                                                                    |
| Konteks           | Drill: `LEVEL`, chapter/indicator/level UUID canonical, `L:{chapter}:{indicator}:{level}`, batch null. Tryout: `TRYOUT_BATCH`, `T:{batchId}`, chapter/indicator/level null. `scaleId` adalah identitas skala, bukan bukti equating.                                                                                                   |
| Window            | `startsAt ≤ collectionCutoffAt ≤ gradingCutoffAt`. Submit harus di collection window; grading boleh sesudah collection cutoff tetapi tidak sesudah grading cutoff. Tryout due tidak boleh lewat close +72 jam. Timestamp UTC `Z`, maksimal milidetik, tahun bukan 0000, tanpa leap second agar ordering identik di JavaScript/Python. |
| Policy            | Model, quality gate, eligibility dan scoring membawa ID/version/digest/approvalId. Comparison/mapping nullable bila tidak diminta/belum approved. Tidak ada default threshold, estimator/prior atau rubrik yang dikarang.                                                                                                             |
| Item              | Versi item, family, versi original, rubric, content digest, tipe, model, maksimum kategori dan poin. Lineage harus ada pada manifest. Item yang belakangan invalid tetap dapat dicatat dengan state INVALID, namun tidak menjadi evidence/parameter valid.                                                                            |
| Paket/arm         | `packageId` adalah UUID row canonical assessment package, `packageVersion` adalah versi yang dipin; keduanya dibandingkan. Satu paket/versi per arm per snapshot, satu original dan sedikitnya satu varian. Jangan mencampur episode versi lama/baru ke arm yang sama.                                                                |
| Responden         | `respondentId` UUID pseudonymous yang ditetapkan main untuk scope pengukuran; bukan user ID, nama/email atau ID sekolah. Mapping ke siswa asli tetap privat di main. Satu respondent/attempt per snapshot.                                                                                                                            |
| Pengerjaan        | `attemptId`, package/versi, batch, assigned/delivered arm, firstValidAttempt dan attemptIndex dipin. Tryout satu attempt/siswa/batch harus dijamin main sebelum pseudonymization; UUID semata tidak membuktikan akun unik.                                                                                                            |
| Respons           | Satu row untuk setiap attempt-item paket yang diterima, dengan `attemptItemId`, rubric/item version dan respondent–attempt yang cocok. Tidak mengirim teks jawaban, kunci atau identitas personal.                                                                                                                                    |

Paket Drill tepat 10 soal dengan 3 common anchor; Tryout 30 dengan 5. Set anchor menggunakan versi yang identik pada seluruh arm, dan family anchor tidak menjadi focal. Satu family tidak diulang dalam paket yang sama. Hanya focal yang tercantum dalam `comparisons` dievaluasi; PASS tidak diwariskan ke focal lain/seed/config. Manifest input tidak boleh menyisipkan item di luar paket atau menghilangkan response row yang seharusnya ada.

Setiap policyRef harus dapat di-resolve ke definisi frozen melalui resources terotorisasi milik main. JSON tidak membawa approval yang sah hanya karena UUID/digest valid secara bentuk. Sebelum pekerjaan dijalankan, adapter membuktikan approval belum revoked, versi/digest cocok dan jenis/scope policy tepat. Parameter akademik/statistik yang masih OPEN menahan penggunaan policy tersebut pada produksi, bukan menahan penulisan kontrak.

UUID pada wire harus lowercase dengan tanda hubung standar. Adapter menormalisasi UUID canonical sebelum membentuk snapshot, agar beda kapitalisasi tidak membuat identitas duplikat tampak berbeda. JSON integer dibatasi rentang aman JavaScript; representasi `1.0` tetap bilangan bulat menurut JSON Schema. Referensi approval dan identitas harus diperiksa terhadap sumber otoritatif, bukan sekadar pola string.

## Skor, eligibility dan paparan

`scoreCategory` adalah integer ordinal untuk 2PL/GPCM; `awardedPoints` dan `maxPoints` adalah string desimal nonnegatif dengan maksimal dua digit pecahan. PG kategori 0/1; GPCM kategori 0 sampai maximumScoreCategory. Produk memakai policy/rubrik yang dipin, dengan bobot yang disahkan. Validator mengecek proporsi poin terhadap kategori dalam toleransi representasi setengah sen; tie rounding tepatnya tetap mengikuti policy, bukan toleransi baru untuk mastery.

- `RESPONDED`: skor/category dari grading sah. `OMITTED`: kategori dan poin nol. Jangan membuang jawaban salah/kosong demi menaikkan kecukupan data.
- `NOT_PRESENTED` / `INVALID`: kategori dan poin null, tidak dimasukkan ke kalibrasi, alasan eksplisit. Gangguan teknis tidak berubah menjadi jawaban salah.
- Retry/firstValidAttempt false, item invalid dan original-fallback crossover tidak menjadi primary calibration evidence. Riwayat tidak direset karena seed/ID eksperimen baru.
- Pada beta Drill, paparan keluarga dari fitur lain (termasuk Pretest/PvP) dapat included dengan `KNOWN_PRIOR`, sumber paparan dan `BETA_PRIOR_EXPOSURE_ALLOWED`; jangan mengubahnya menjadi FRESH. Paparan Drill/retry tetap tidak boleh dimasukkan seolah fresh. Tryout tidak mewarisi pengecualian ini.
- `UNKNOWN` mempertahankan alasan UNKNOWN_EXPOSURE. Include/exclude untuk kondisi unknown ditetapkan approved eligibility policy dan diaudit main; schema tidak diam-diam menganggapnya fresh atau menetapkan threshold baru.
- Original fallback memakai paket original valid saat assigned arm varian tidak tersedia. Assignment asal disimpan, actual delivery berbeda, `deliveryMode=ORIGINAL_FALLBACK`, included false dengan ARM_CROSSOVER. Tetap tampilkan penyimpangan di laporan alokasi; jangan menyebutnya original randomisasi atau fresh pada retry berikutnya.

## Output parameter, perbandingan dan hasil peserta

`executionStatus` dan `measurementState` berbeda. Sukses transport/eksekusi tidak berarti model atau item layak. Result SUCCEEDED membawa outcome lengkap: tepat satu hasil per item, paket dan perbandingan input, serta **tepat satu hasil untuk setiap attempt Tryout**. Drill mengirim respondents kosong karena kontrak ini tidak menerbitkan theta/nilai personal Drill.

Item CALIBRATED membawa discrimination a dan SE, serta bukti gate. 2PL menggunakan logistic `1/(1+exp(-a*(theta-b)))`, D=1 dan tanpa guessing parameter; b/SE wajib, steps kosong. GPCM memakai `P(X=k|theta) ∝ exp(sum(s=1..k, a*(theta-d_s)))`: `steps.value` adalah **absolute step difficulty d_s** pada scale context, bukan deviasi step ditambah b. Oleh karena itu GPCM mengirim b/SE null dan tepat maximumScoreCategory steps bernomor 1..m. Step tidak dipaksa terurut karena diagnosis kategori/fit ditangani model/gate. State selain CALIBRATED mengirim parameters null dan reasonCodes, bukan parameter tebakan.

`eligibleRespondentCount` harus sama dengan jumlah respons included per item pada snapshot, bukan jumlah seluruh retries. Quality evidence menyebut check code, status, statistic dan SE; threshold/method-nya ada pada policy yang dipin. Parameter/hasil finite, SE nonnegatif, a positif. Validator memeriksa konsistensi, bukan menjalankan ulang estimasi atau membuktikan check PASS.

Perbandingan mengirim PASS/DRIFT/INSUFFICIENT/NOT_COMPARABLE/ANOMALY. PASS/DRIFT hanya boleh menyertai parameter original, varian dan anchor yang calibrated. PG membawa DELTA_B, DELTA_LOG_A dan NORMALIZED_CURVE_GAP beserta SE/interval. GPCM memakai DELTA_LOG_A dan NORMALIZED_CURVE_GAP. Toleransi akademik, metode uncertainty, covariance/bootstrap, multiplicity dan sequential checkpoints berasal dari policy; tidak ada angka produksi pada schema.

Package measurementState menentukan kelayakan arm. Outcome keseluruhan diturunkan: seluruh paket calibrated → CALIBRATED; sebagian → PARTIAL; tidak ada → ANOMALY bila ada anomaly, lalu NOT_COMPARABLE bila ada, selebihnya INSUFFICIENT. PARTIAL sah dan tidak boleh memaksa seluruh batch menjadi IRT atau fallback.

Untuk peserta Tryout:

- **SCORED:** theta, SE dan score 0–100 wajib; mapping ref cocok input dan package arm calibrated. `usedQuestionVersionIds` adalah item valid/calibrated yang benar-benar disajikan/dinilai pada attempt. Jangan memakai item dari paket siswa lain.
- Semua arm merujuk `referencePackage` yang sama serta **mask acuan `referenceQuestionVersionIds` frozen dalam input**. Mask harus subset valid original acuan, dan seluruh item acuan yang digunakan harus calibrated sebelum score IRT diterima. Formula prediksi/estimator/prior dan rounding ada pada mapping policy. Benar semua tidak otomatis 100; tidak ada min–max atau percentile/rank dalam output.
- **INSUFFICIENT / NOT_COMPARABLE:** theta/SE/score/mapping/reference null, used items kosong dan alasan wajib. Main menghitung fallback rubrik dari grades canonical, bukan AI menyisipkan raw score berlabel IRT.
- **UNSCORABLE:** tidak ada item/observasi valid untuk menilai peserta; field nilai null, bukan nol. Cakupan minimum dan insiden tetap ditentukan policy main/Curriculum. Menyatakan semua salah/kosong bukan alasan UNSCORABLE jika respons/item valid.

## Kegagalan, retry dan publikasi

| Kondisi                                                  | Representasi                                                         | Tindakan main                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Data kurang, coverage/precision gagal                    | SUCCEEDED + INSUFFICIENT dan alasan                                  | Jangan retry pekerjaan yang sama untuk mengubah kesimpulan. Tambah evidence/new snapshot bila sah; gunakan fallback nilai sesuai deadline. |
| Linking/anchor tidak comparable                          | SUCCEEDED + NOT_COMPARABLE                                           | Tahan klaim kesetaraan/adjustment; review desain dan fallback bila perlu.                                                                  |
| Konten/model anomaly                                     | SUCCEEDED + ANOMALY                                                  | Quarantine/review; jangan otomatis adjust semua anomaly sebagai DRIFT.                                                                     |
| Timeout/dependency sementara                             | FAILED, outcome null, TIMEOUT/DEPENDENCY_UNAVAILABLE, retryable true | Retry terkontrol dengan input identik, execution/dispatch generation baru. Tidak ada fallback XP karena IRT gagal.                         |
| Input/digest/policy/contract invalid atau internal error | FAILED, outcome null, retryable false                                | Investigasi; jangan auto-loop. Koreksi input/policy membuat frozen request baru sesuai prosedur, bukan mengubah snapshot lama.             |

`expectedDispatch` berasal dari state otoritatif main, bukan output AI. Execution ID atau generation yang berbeda ditolak; hasil duplikat eksekusi yang sama harus ditangani idempotent oleh transaksi adoption existing. Hasil lama/stale, approval revoked, request superseded atau hasil yang sudah published tidak boleh diadopsi lagi.

Main tetap menerbitkan nilai+pembahasan serentak per batch maksimal 72 jam setelah tutup, dengan mode IRT/fallback per paket/arm dan provenance policy. Kelayakan parameter paket berbeda dari kelengkapan hasil peserta: untuk menerbitkan satu arm dalam mode IRT, semua attempt yang wajib dinilai pada arm itu harus mempunyai hasil SCORED yang valid. Jika ada peserta yang gagal inference, gunakan jalur fallback per arm sesuai keputusan produk, bukan mode campuran diam-diam per peserta; UNSCORABLE tetap eksplisit bila nilai rubrik pun tidak dapat dihitung. XP dan unlock historis tidak dihitung ulang; late IRT tidak menimpa hasil final.

## Batas penyelesaian pekerjaan kontrak

Selesai pada tahap ini: schema input/output, identitas/provenance, bentuk parameter PG/GPCM, status eksekusi/ilmiah/peserta, contoh tersanitasi, generated types serta pengujian lintas bahasa/repo. Belum selesai: definisi policy numerik/akademik, adapter snapshot dan resource policy, scientific producer, penyimpanan/adoption versi baru, finalizer/release multi-arm, deployment atau penerimaan siswa end-to-end. Tidak ada mock result yang digunakan sebagai producer produksi.
