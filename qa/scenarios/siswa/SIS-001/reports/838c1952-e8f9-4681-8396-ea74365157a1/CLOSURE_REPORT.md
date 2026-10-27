# SIS-001 — retest penutupan 28 Oktober 2026 WIB

**ENGINEERING EVIDENCE.** Run **838c1952-e8f9-4681-8396-ea74365157a1**, parent **d537c6dc-e502-4058-a431-511b849ac44c**, source bersih **b33954b0678551bdea78e4bb40c9f7eb8568e9c1**. Profil full menghasilkan **FAIL**, 844.8 detik setelah build dari batas3600detik. Kasus: **13 PASS, 1 FAIL, 0 BLOCKED, 1 NOT_RUN** dari15. Ini bukan kelulusan seluruh Numora atau produksi.

## Perubahan dan batas

Delapan kegagalan CI Admin berasal dari interaksi/selector/fixture lama: buka editor revisi terlebih dahulu, heading langkah upload, mapping Tryout opsional, serta label Publish/tanggal dan jam WIB. Expected izin role, pagination/draft, review/publish dan overflow tetap diperiksa. Regresi terarah16/16 lulus, lalu CI source terbaru pada kedua PR hijau. Tidak ada kode produk yang diubah pada tahap QA ini.

Connected Windows **6/6 PASS** dengan PostgreSQL/Redis dan browser nyata. Konteks browser ditutup setelah tiap kasus, alih-alih menumpuk sampai akhir suite; data bisnis tetap durable. Redirect anonim yang dulu timeout lulus pada run ini tanpa timeout lebih longgar. Kegagalan startup/timeout lama tetap disimpan; hasil baru bukan bukti tunggal sebab akar timeout lama. Auth tetap fixture email, bukan Google OAuth.

Dependency ditangani bertahap berdasarkan parent/kompatibilitas; audit baru20 advisory turun menjadi **0 pada full maupun produksi**, tanpa suppression/force-fix. Cakupan dan kegagalan awal OOM/startup ada pada investigations/20261028-closure/DEPENDENCIES.md. Parser workbook asli tersedia dan lulus; ketersediaan file bukan persetujuan akademik.

## Pemeriksaan full

| Pemeriksaan | Hasil | Catatan |
| --- | --- | --- |
| quality | PASS | — |
| rewards | PASS | — |
| components | PASS | — |
| persistence | PASS | — |
| connected | PASS | — |
| accessibility | PASS | — |
| variety | PASS | — |
| recovery | PASS | — |
| velocity | PASS | — |
| volume | PASS | — |
| load | FAIL | DATABASE_RECONCILIATION_FAILED |
| dependencies | PASS | — |
| manual-keyboard | NOT_RUN | HUMAN_KEYBOARD_AND_USABILITY_REVIEW_REQUIRED |

## Load dan integritas

Diagnostik terpisah **535619d2-f5b3-4a89-b7c4-929fe2183a35**: **FAIL**. Lifecycle request/response per actor/attempt direkam ke stream metrik k6 tanpa request tambahan ke aplikasi. Snapshot durable membandingkan owner, hasil, ledger XP dan completion outbox per identitas/isi. Gate ketat count graded==accepted tetap berlaku; semua parameter VU/stage/gracefulStop/HTTP15s/drain120s/full60menit dipertahankan.

Ringkasan diagnostik:

```json
{
  "operations": 2137,
  "startRequests": 2137,
  "submitRequests": 2112,
  "submitResponses": 2095,
  "missingSubmitResponses": 17,
  "graded": 2112,
  "acknowledgedDistinctAttempts": 2078,
  "acceptedCounter": 2078,
  "broken": 0,
  "accepted": 2078,
  "identityStatus": "FAIL",
  "failureCount": 1,
  "incompleteCount": 0,
  "unacknowledgedGraded": 34,
  "classifications": {
    "RESPONSE_FAILED_AFTER_COMMIT": 17,
    "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED": 17
  },
  "sampleUnacknowledged": [
    {
      "attemptId": "fdd7be6e-464e-48e3-92d4-7559b8c98b3a",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:43:5"
      ]
    },
    {
      "attemptId": "8825f8fa-8f2d-4c3d-9053-6a6ed2299219",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:65:5"
      ]
    },
    {
      "attemptId": "cd625465-50ad-4291-ac79-79c9cab29295",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:50:6"
      ]
    },
    {
      "attemptId": "87b14fb3-adb2-4c6a-a2a4-fe154a4dcc4e",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:82:5"
      ]
    },
    {
      "attemptId": "5526abdb-7a4b-4480-b6b1-0237e9161daf",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:40:6"
      ]
    },
    {
      "attemptId": "c4443395-d43c-4479-a24a-53afa59095e4",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:44:6"
      ]
    },
    {
      "attemptId": "532a1add-1da1-4734-9da0-8e87577294a0",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:66:5"
      ]
    },
    {
      "attemptId": "c14e814a-f002-458b-ac91-ffc796c0b8c1",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:34:6"
      ]
    },
    {
      "attemptId": "e0b895b6-3cfa-4fa3-8d3b-5c8317d65799",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:48:6"
      ]
    },
    {
      "attemptId": "783be6bc-028e-40ff-a512-508922ad84ed",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "load:vus_50:43:8"
      ]
    },
    {
      "attemptId": "8add8a21-5c4f-4faf-be3c-86c3a8d85d0c",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:33:6"
      ]
    },
    {
      "attemptId": "dcb71e36-a74b-4128-a77b-dccbb8332b21",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:52:6"
      ]
    },
    {
      "attemptId": "ebcac1bb-0a6d-4ff6-8301-daf2d4a13079",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:45:6"
      ]
    },
    {
      "attemptId": "0fea23a1-7255-4590-9338-273e90873dad",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:51:5"
      ]
    },
    {
      "attemptId": "43ad975f-959a-45ef-8e27-9248be624614",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:79:6"
      ]
    },
    {
      "attemptId": "cdee5bed-46f0-4117-9ecc-852f49a7517a",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_50:68:6"
      ]
    },
    {
      "attemptId": "ebb3a802-77f3-4faf-a4e0-171dfa6fc3b6",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "load:vus_50:51:8"
      ]
    },
    {
      "attemptId": "18469774-9c45-40be-aa5b-eb28c78d19e5",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "load:vus_50:79:9"
      ]
    },
    {
      "attemptId": "64e55848-fb9a-4439-a8f7-65073c47e917",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "load:vus_50:69:9"
      ]
    },
    {
      "attemptId": "8ee4afff-b120-4e2a-8e6f-9eb01997cce1",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "load:vus_50:44:9"
      ]
    }
  ]
}
```

Ringkasan full:

```json
{
  "operations": 2509,
  "startRequests": 2509,
  "submitRequests": 2508,
  "submitResponses": 2391,
  "missingSubmitResponses": 117,
  "graded": 2459,
  "acknowledgedDistinctAttempts": 2389,
  "acceptedCounter": 2389,
  "broken": 0,
  "accepted": 2389,
  "identityStatus": "FAIL",
  "failureCount": 1,
  "incompleteCount": 49,
  "unacknowledgedGraded": 70,
  "classifications": {
    "RESPONSE_FAILED_AFTER_COMMIT": 2,
    "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED": 68
  },
  "sampleUnacknowledged": [
    {
      "attemptId": "8dd9cd2b-96f7-493e-8e15-eb6d44dc0c9c",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_25:14:1"
      ]
    },
    {
      "attemptId": "49761e24-7b61-48ec-9764-95ef3a4b5a44",
      "classification": "RESPONSE_FAILED_AFTER_COMMIT",
      "operationIds": [
        "load:vus_25:32:1"
      ]
    },
    {
      "attemptId": "d9a6648e-f232-45e2-bd0e-d5aef5cfba53",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "load:vus_100:43:15"
      ]
    },
    {
      "attemptId": "bf87683e-c9ca-463f-9f86-ccd6037275c3",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:7:2"
      ]
    },
    {
      "attemptId": "96f1e19c-0394-4c41-afb2-954eab8ec1db",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:122:2"
      ]
    },
    {
      "attemptId": "6cd36ccd-3d75-4a75-8e02-f509cb73eda4",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:8:2"
      ]
    },
    {
      "attemptId": "3332c302-a318-45fc-aea6-fccce6867287",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:15:2"
      ]
    },
    {
      "attemptId": "65f6672a-792d-4bfd-b212-ea1256f5a5cc",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:137:2"
      ]
    },
    {
      "attemptId": "c4385a94-3f1f-4e15-a14d-308705fedc47",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:10:2"
      ]
    },
    {
      "attemptId": "5cc7bbe3-685b-4230-8d76-2bc02f6d5a50",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:18:2"
      ]
    },
    {
      "attemptId": "7f917cfa-e8e3-47a6-9a23-b21b9807295f",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:14:2"
      ]
    },
    {
      "attemptId": "6e50a307-c98c-4c4d-8d98-f7ed3a51412c",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:3:2"
      ]
    },
    {
      "attemptId": "3f012c06-2e35-4335-99ad-e0494ef4f710",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:6:2"
      ]
    },
    {
      "attemptId": "de766a46-d62b-4e88-9406-f36152fa8b3d",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:43:2"
      ]
    },
    {
      "attemptId": "aff4c5bc-c81c-4407-b43c-94a5db3efa3f",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:49:2"
      ]
    },
    {
      "attemptId": "7169a0b5-9cf9-491c-b495-0d332c314e11",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:74:2"
      ]
    },
    {
      "attemptId": "aa75b0c2-7563-417b-9659-ae1a4ac0c3ca",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:121:2"
      ]
    },
    {
      "attemptId": "31428322-b080-404f-a9ba-002f422e7621",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:11:2"
      ]
    },
    {
      "attemptId": "dfa18a42-60d9-4c10-8d26-d148bbb088cb",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:136:2"
      ]
    },
    {
      "attemptId": "f1e89ec5-7440-4a5d-bd94-89ac28a732a4",
      "classification": "SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED",
      "operationIds": [
        "stress:vus_250:127:2"
      ]
    }
  ]
}
```

Run lama tetap FAIL: snapshot3603graded vs3573accepted. Pemeriksaan ulang baca-saja pada paket historis menemukan3618graded dengan ledger/outbox masing-masing satu. Identitas acknowledgment klien tidak direkam pada run lama dan tidak bisa direkonstruksi dari counter; tidak ada klaim kehilangan data atau kelulusan retrospektif. Lihat file identity reconciliation untuk klasifikasi run baru; commit tanpa respons tetap temuan, bukan otomatis diterima.

## Regresi versi akhir

- database: 61 PASS, 0 FAIL, 0 NOT_RUN.
- assessment-engine: 21 PASS, 0 FAIL, 0 NOT_RUN.
- irt-orchestration: 14 PASS, 0 FAIL, 0 NOT_RUN.
- api: 245 PASS, 0 FAIL, 0 NOT_RUN.
- worker: 25 PASS, 0 FAIL, 0 NOT_RUN.
- web: 273 PASS, 0 FAIL, 0 NOT_RUN.
- Guard fixture bersama3 PASS; workflow49 PASS (termasuk9 regresi receipt).
- Local lint/typecheck/contracts/build selesai; quality-local.json mencatat tahap yang dimulai sebelum commit. CI pada source bersih adalah bukti head yang terpisah.

## Pekerjaan terbuka dan keputusan QA

- Keyboard/usability manusia **NOT_RUN**. Gunakan MANUAL_CHECKLIST.md dan catat build/penguji/bukti; tidak ada PASS manual buatan AI.
- Google OAuth nyata, akun staging, deployment SHA dan acceptance staging belum terkonfirmasi. Cloud Development tidak dipakai sebagai pengganti.
- Persetujuan integrasi journal Admin/runtime masih terpisah; enam rehearsal lulus, journal aktif tidak diubah.
- APP-ADMIN-01: teks Tryout “Kesulitan tetap wajib” bertentangan dengan keputusan terakhir. Kandidat patch tersimpan untuk developer, belum diterapkan.
- Publikasi **PUBLISHED_VERIFIED**: [Google Docs](https://docs.google.com/document/d/17lmSWzGYNi2ajl7WDoBA1pMVZqWiXyE6j5maU7PHwQw) di folder siswa dan [Person A/dashboard](https://docs.google.com/spreadsheets/d/1YW-7ikBhBhptl_d600O8TTiZ6bdtqz0PpnJ8I2syPDs/edit). Run baru ditambahkan pada baris50–78; formula hanya menghitung15 kasus55–69, menghasilkan13/1/0/1. Riwayat Person A/C dan blok dashboard lama tetap sama. Kegagalan konektor sebelumnya tetap historis. Izin folder warisan tidak diubah.

Rekomendasi QA mengikuti hasil di atas: tidak menganggap CI hijau, audit nol atau hasil lokal sebagai sign-off penuh. Prioritas berikutnya adalah menutup temuan yang masih gagal/terhalang berdasarkan identitas, menjalankan checklist manusia dan menyediakan acceptance nyata. Tidak ada merge/deployment.

## Perbandingan benchmark lokal

| Fase | Accepted lama | Accepted baru | HTTP p95 lama (ms) | HTTP p95 baru (ms) | Error rate baru |
| --- | ---: | ---: | ---: | ---: | ---: |
| load | 2823 | 1889 | 691.66625 | 1417.815154999999 | 0.00013155586739168568 |
| stress | 750 | 500 | 4028.9835 | 5714.728425 | 0 |

Distribusi mencakup seluruh request alur k6, bukan hanya endpoint submit. Generator/server berbagi host; instrumentasi identitas menambah pekerjaan generator. Ini dua sampel lokal, bukan bukti kausal kapasitas atau kelulusan SLO produksi. Volume memakai parameter1k/10k/100k yang sama; rincian drain dan rekonsiliasi berada dalam CLOSURE_SUMMARY.json/result.json.

## Follow-up setelah layanan berhenti

Pembacaan READ ONLY berdasarkan identitas attempt asli menemukan **2508 GRADED**, termasuk **49 commit setelah snapshot**, dibanding **2389 acknowledgment sukses**. Semua 2508 graded memiliki ledger/outbox konsisten; tidak ada submitted attempt yang masih nonfinal pada follow-up. Selisih119 terdiri dari2 HTTP500 setelah commit dan117 submit tanpa respons teramati. Snapshot2459 dan FAIL awal tetap utuh. Ini membuktikan late commit/acknowledgment gap pada run baru, bukan kehilangan hasil yang sudah diakui. Tidak ada klaim sebab tunggal atau kelulusan load.

Pada rentang full, PostgreSQL mencatat **3 out-of-memory**; detail waktu disanitasi pada full-environment-errors.json. Diagnostik terpisah memiliki24 OOM dan24 respons500 (17submit/7start). Satu integrity counter diagnostik belum teratribusi pasti; kandidat kondisi balapan terlihat saat actor/attempt yang sama dipakai di akhir fase50 dan awal100. Body status/jumlah soal tidak tersimpan dalam receipt awal, sehingga hipotesis bukan konfirmasi bug aplikasi.

## Latensi khusus submit

| Run/fase | Sampel | p50 ms | p95 ms | p99 ms | Respons |
| --- | ---: | ---: | ---: | ---: | --- |
| Diagnostik / load | 2095 | 604.54 | 1902.83 | 2304.44 | {"201:none":2078,"500:1500":17} |
| Full / load | 1891 | 497.18 | 2578.22 | 2839.75 | {"201:none":1889,"500:1500":2} |
| Full / stress | 500 | 5229.38 | 8140.42 | 8177.03 | {"201:none":500} |

Diambil hanya dari metric http_req_duration pada endpoint submit; request terinterupsi tanpa sampel tidak diberi estimasi latency. HTTP15s/gracefulStop10s tidak berubah. Audit0 dan CI sukses tidak menutup selisih respons tersebut.
