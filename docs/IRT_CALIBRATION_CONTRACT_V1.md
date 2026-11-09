# Handoff kontrak kalibrasi IRT dan hasil Tryout v1

**Konteks integrasi terbaru — 10 November 2026:**
[delivery Admin dan strategi 24 jam](TRYOUT_IRT_DELIVERY_CONTEXT.md) membekukan
pembagian tanggung jawab dan keputusan fallback per arm. Mesin/transport riset
Tryout sudah tersedia; tabel gap pada dokumen kontrak awal di bawah bersifat
historis untuk producer/adapter riset. Approval produksi, adopter canonical,
finalizer multi-paket dan publikasi tetap perlu bukti implementasi. Kontrak
ilmiah v1 tidak berubah dan guard adopter legacy tidak dicabut oleh dokumentasi.

**ENGINEERING IMPLEMENTATION — 8 November 2026.** Kontrak boundary kalibrasi dan hasil peserta telah ditulis untuk kedua repo berdasarkan [keputusan varian/IRT v2](AI_IRT_V2_CONTEXT.md). Paket berisi JSON Schema, generated TypeScript types, validator independen JavaScript/Python, contoh tersanitasi dan shared conformance vectors. Ini menyelesaikan bentuk pertukaran data dan pemeriksaan kompatibilitas; bukan implementasi scientific engine atau aktivasi hasil siswa.

| Repo              | Lokasi paket kontrak                     |
| ----------------- | ---------------------------------------- |
| Numora            | `packages/contracts/irt-calibration-v1/` |
| Numora-ai-service | `contracts/irt-calibration-v1/`          |

README dalam paket adalah rujukan teknis lengkap. Seluruh isi paket dipelihara identik; `check-parity.mjs` membandingkan byte seluruh file. `contractVersion` payload bernilai `irt-calibration-v1`. Notification compute v3, artifact legacy item-only, serta HTTP/kontrak generator-service-v1 tetap dipertahankan. Jangan menambahkan respondents ke payload legacy atau mengirim payload baru ke adopter lama.

## Kontrak yang sudah ditetapkan

1. **Input frozen:** request/snapshot/digest/calibration/context revision, window pengumpulan dan grading yang berbeda, versi policy/approval, manifest versi item/rubrik/paket, common anchor, lineage, respondent–attempt–package–batch, skor ordinal dan poin desimal serta exposure/eligibility.
2. **Output item:** parameter 2PL atau GPCM yang dipisahkan secara eksplisit, SE, eligible count yang cocok input, gate/check evidence dan measurement state. GPCM memakai absolute step difficulty, tanpa menambah b kedua.
3. **Output peserta Tryout:** satu row untuk setiap attempt dalam snapshot; identitas/version/batch harus cocok. SCORED membawa theta/SE/nilai dan pin mapping/reference. Status data kurang/tidak comparable/tidak dapat dinilai membawa null dan alasan, bukan nilai nol palsu. Respondents output Drill kosong.
4. **Multi-arm dan perbandingan:** hasil per paket/arm, outcome PARTIAL bila sebagian layak, keputusan PASS/DRIFT terpisah dari measurement, serta metrics/uncertainty. Hanya focal yang diminta mendapatkan keputusan; tidak ada pewarisan PASS ke seluruh seed.
5. **Kegagalan eksekusi:** timeout/dependency dapat di-retry dengan input identik dan execution/generation baru. Input/policy/digest invalid bukan auto-loop. INSUFFICIENT adalah hasil ilmiah, bukan kegagalan transport.
6. **Pencocokan/proteksi:** expected execution/generation berasal dari main, bukan artifact AI. Schema, field tambahan/PII, ID/versi berbeda, coverage responden hilang, duplikasi, stale execution dan parameter/status yang bertentangan ditolak.

Kontrak v1 mencakup kalibrasi **Level Drill dan batch Tryout**. Scope Indikator/Bab belum ditambahkan sebagai payload yang dapat dieksekusi; membutuhkan desain linking dan revisi kontrak tersendiri sesuai konteks v2.

## Keputusan produk yang direpresentasikan

- Drill 10 soal: 3 common anchor + 7 focal; Tryout 30: 5 anchor + 25 focal. Jumlah tidak membuktikan kelayakan linking.
- First valid saja sebagai evidence utama. Retry/siswa lama tidak dibuat fresh oleh ID eksperimen atau seed baru.
- Paparan lintas fitur seperti Pretest/PvP diperbolehkan untuk beta Drill, tetap diberi KNOWN_PRIOR dan alasan eksplisit. Tryout tidak mewarisi pengecualian ini.
- Original fallback sementara mempertahankan assigned arm dan actual delivery. Respons crossover dipisahkan dari evidence utama tanpa menghilangkan audit alokasi.
- Poin produk dan kategori GPCM disimpan terpisah. Error teknis bukan jawaban salah; maksimum/observasi valid tidak tersedia bukan nilai nol.
- Mapping nilai IRT merujuk satu original/package reference dan mask item acuan frozen yang sama untuk seluruh arm setelah linking layak. Nilai 0–100 sendiri bukan bukti equating.
- Main memiliki fallback, publikasi, XP dan histori; AI tidak menerbitkan nilai. IRT per arm memerlukan hasil peserta lengkap; bila inference peserta belum layak, pilih fallback pada tingkat arm, bukan menyelipkan nilai nol.

## Verifikasi dan batas penerimaan

Paket menyediakan shared positive/negative conformance vectors untuk kedua validator, pengujian non-finite numbers, schema compilation, generated-type freshness dan cross-repo byte parity. Semua contoh memakai identitas/policy/gate/estimasi **sintetis**; bukan data nyata, approval yang bisa dipakai produksi, atau bukti statistik.

JavaScript memakai dependency Ajv existing Numora. Python memakai jsonschema yang sudah dipin service AI. Tes kontrak tidak memerlukan database, Redis, credential atau akses data peserta. Jalur generator existing harus tetap lulus regression test dan tidak diubah untuk menampung kalibrasi.

Verifikasi lokal 8 November 2026: **113 shared conformance vectors** lulus pada kedua validator, ditambah pemeriksaan non-finite numbers; 15 schema Numora berhasil dikompilasi dan 5 tes validator schema existing lulus. Generated types, TypeScript strict, ESLint dan format paket lulus. Import validator AI lulus 2 tes; regresi generator lulus 14 tes API/content serta 7 fingerprint + 4 candidate fixtures. Seluruh 25 berkas paket dan dokumen handoff/konteks diperiksa identik antarrepo. Ini pemeriksaan boundary lokal, bukan simulasi ilmiah atau acceptance terintegrasi siswa. Node lokal 24.15.0 berbeda dari pin repo 24.22.1 dan shim pnpm lokal tidak tersedia; pemeriksaan Node dijalankan langsung memakai dependency terpasang. CI dengan toolchain yang dipin tetap harus dijalankan saat perubahan diajukan.

## Yang harus diimplementasikan berikutnya

| Area                      | Tanggung jawab                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy akademik/statistik | Curriculum/Data memfinalkan angka toleransi, precision/fit, rubrik Drill, pemilihan anchor, estimator/prior/mapping, minimum coverage dan budget. Kontrak hanya membawa referensi immutable ke policy approved. |
| Main adapter              | Ekspor snapshot ke payload baru, mapping pseudonym privat, verifikasi source/digest/approval, resource policy terotorisasi dan pemilihan kontrak eksplisit.                                                     |
| AI producer               | Baca input/policy yang sah, jalankan model/gate, hasilkan dan seal artifact sesuai kontrak, dengan execution lease/fencing. `numora_service.irt_contracts` hanya validator opt-in, bukan worker baru.           |
| Main adoption/storage     | Forward schema/contracts untuk artifact baru, validasi di boundary, transaksi adopsi idempotent, seluruh participant coverage, status/approval/provenance serta immutable policy pins.                          |
| Main publication          | Finalisasi multi-arm, fallback, release serentak ≤72 jam, hasil/pembahasan, insiden dan perlindungan XP/histori.                                                                                                |

`RESPONDENT_CONTRACT_NOT_APPROVED` tetap ada di runtime saat ini sampai producer, policy/mapping approval, adapter/adopter, persistence dan publication tests selesai. Ketersediaan kontrak bukan izin menghapus guard. Tidak ada migrasi, database, deployment, kredensial atau hasil siswa yang diubah pada pekerjaan ini.
