# Delivery Admin dan penyelesaian IRT Tryout

**Checkpoint implementasi prioritas 1:**
[handoff frozen, fixture dan pemeriksa kesiapan](IRT_DELIVERY_HANDOFF_V1.md).
Manifest canonical milik Main; mirror AI, validator lintas bahasa dan harness
snapshot disposable tersedia. Ini belum menyelesaikan runtime produksi,
adopsi/rilis canonical atau linking ilmiah.

**ENGINEERING DECISION — pemilik, 10 November 2026.** Target berikutnya adalah
mesin IRT Tryout dan layanan antarrepo yang berfungsi dalam kurang dari 24 jam.
Utamakan IRT; **fallback per arm diizinkan sesuai dokumen Admin**. Jawaban ini
menggantikan pembatasan sementara sebelumnya yang mewajibkan semua nilai resmi
IRT. Self-adjustment ditunda. Pengujian Tryout dibatasi **total tiga jam**.

Dokumen ini dipelihara identik di Numora dan Numora-ai-service. Ini adalah
rekonsiliasi konteks dan rencana kerja, bukan laporan bahwa implementasi,
pengujian baru, deployment atau persetujuan produksi telah selesai. Semua
contoh integrasi memakai data sintetis dan database lokal terisolasi; database
bersama, hasil canonical, XP dan histori siswa tidak diubah oleh pembaruan ini.

## Sumber, prioritas dan baseline

- [Sumber Admin utuh beserta SHA-256](sources/admin-delivery-2026-11-10/README.md):
  PRD §6–8, §17; spesifikasi teknis §5, §7.4–7.5, §13–14.
- [Keputusan pemilik varian/IRT v2](AI_IRT_V2_CONTEXT.md) tetap berlaku di luar
  pembaruan eksplisit; PROPOSED dan OPEN pada sumber Admin tidak otomatis disahkan.
- [Kontrak kalibrasi v1](IRT_CALIBRATION_CONTRACT_V1.md) dan
  [handoff mesin/transport](IRT_AI_HANDOFF.md) tetap dipakai. Tidak membuat mesin,
  payload ilmiah atau kontrak generator tandingan untuk perubahan UI Admin.
- Baseline inspeksi utama: `0296235` (`main`, termasuk handoff Linux PR #137).
  Baseline AI bersama: `c7ffb88`. Eksperimen lokal anchor-v2 pada `a2a32c7`,
  `b581ec5`, `da17c33` belum menjadi profil yang diterima untuk target ini.
- Referensi path pada sumber teknis perlu dikoreksi saat implementasi:
  Tryout berada di `apps/api/src/modules/learning/`, bukan `assessments/`;
  migrasi `0051` adalah active clock Drill, `0052` assessment arms,
  `0053` generator stok/media, `0054` riset IRT. Migrasi lama tidak ditulis ulang.

## Aturan delivery yang harus dibawa ke IRT

| Bidang | Acuan integrasi |
| --- | --- |
| Master dan batch | Master/revisi paket berbeda dari pelaksanaan batch. Daftar versi paket dan policy alokasi dipin sebelum batch dibuka. Save master berikutnya tidak mengubah batch frozen. |
| Kesempatan | Satu siswa maksimal satu attempt per batch, termasuk lintas paket, arm, kelas dan sekolah. Resume memakai attempt yang sama. |
| Identitas | Snapshot membawa respondent pseudonymous–attempt–package/version–batch, assigned arm dan delivered arm. Gunakan delivery pin authoritative, bukan paket aktif atau membership saat compute. |
| Grading | Main membekukan grade final, kategori ordinal, poin, rubric dan exposure/eligibility; AI tidak grading ulang dan tidak menerima kunci, jawaban mentah atau PII. |
| Proses varian | Pilih anchor manual sebelum generate, pin revisi sumber serta question-version IDs, satu varian per proses. Set berikutnya boleh berbeda tanpa mengubah pasangan lama. |
| Anchor | Drill 3+7, Tryout 5+25. Anchor merupakan relasi proses/pasangan, bukan flag global pada original. Jumlah/pilihan manual belum membuktikan invariance. |
| Pemilik hasil | Compute sukses, artifact tervalidasi/diadopsi, coverage lengkap dan publikasi adalah keadaan berbeda. Main memutuskan fallback dan rilis; AI hanya menghasilkan artifact ilmiah. |
| Rilis | Hasil dan pembahasan serentak per batch, maksimal 72 jam setelah tutup; mode per arm dan policy/alasan tersimpan. Tanpa ranking/percentile nilai Tryout; XP tetap terpisah. |

**Batas multi-arm penting:** runtime sekarang memerlukan lima question versions
anchor identik yang hadir di seluruh arm yang dikalibrasi bersama. Lima anchor
per pasangan dalam dokumen Admin belum menjamin syarat tersebut. Untuk jalur
24 jam, validasi kesamaan set sebelum dispatch; fixture memakai set yang sama.
Jika paket nyata berbeda set, tahan jalur IRT dengan blocker eksplisit dan
tangani melalui policy fallback yang sah. Jangan diam-diam mengambil irisan,
mengganti anchor atau mengklaim runtime mendukung desain linking lain.

Contoh sekolah A memakai original dan sekolah B memakai varian adalah contoh
alokasi operasional, bukan randomisasi. Confounding sekolah/kemampuan, exposure
dan asumsi model tetap diperiksa; parameter hasil tidak membuktikan efek kausal
generator atau kelayakan self-adjustment.

## Mode nilai dan tanggung jawab fallback

**ENGINEERING DECISION — jawaban eksplisit pemilik, 10 November 2026:**
"Utamakan IRT; izinkan fallback per arm sesuai dokumen Admin".

| Kondisi | Keluaran AI | Tindakan main sebelum rilis |
| --- | --- | --- |
| Seluruh gate arm dan hasil peserta layak | Parameter/theta/nilai serta evidence sesuai kontrak | Gunakan mode IRT dengan pin paket acuan/mask yang sama. |
| Data kurang atau linking tidak layak | INSUFFICIENT atau NOT_COMPARABLE sesuai kontrak; nilai null bila tidak layak | Pilih fallback untuk arm yang belum layak sesuai policy approved; jangan mengarang theta/parameter. |
| Compute gagal teknis | FAILED; alasan aman dan retryability | Retry terbatas dengan input/pin sama atau eskalasi. Fallback hanya dari grade authoritative yang valid, bukan akibat menelan error. |
| Maksimum poin valid nol | Tidak membuat nilai pengganti | UNSCORABLE, nilai null; bukan nol dan bukan label IRT. |
| Hasil/identitas/coverage tidak sah | Tolak artifact | Tahan penerimaan/rilis; investigasi atau rekonsiliasi sah. Jangan rilis subset untuk mengejar deadline. |

Fallback = `100 × poin valid terbobot / maksimum poin valid`, memakai rubric
approved serta policy attempt yang dipin (bobot PG=2, MCMA=3, Kategori=3).
Item invalid akademik dikeluarkan dari pembilang dan penyebut sesuai keputusan
insiden; item yang hanya gagal kelayakan IRT tidak otomatis invalid akademik.
Coverage minimum pasca-exclusion dan aturan pembulatan fallback harus tersedia
dalam policy sah; jangan meminjam angka policy riset sebagai approval produk.
Arm yang layak tetap memakai IRT; nilai fallback antarpaket tidak otomatis setara.
Status peserta yang tidak layak di arm IRT membutuhkan aturan terminal yang
dipin, bukan fallback individual tersembunyi. Hasil terlambat tidak menimpa hasil
final; XP yang sudah diposting dan histori tidak dihitung ulang.

## Kondisi implementasi yang sudah terbukti dan yang belum

| Bagian | Kondisi pada baseline |
| --- | --- |
| Mesin AI | R 4.5.2 / mirt 1.48; mixed 2PL D=1 dan GPCM; multi-arm common anchor; covariance/SE, EAP dan mapping prediksi poin paket acuan. Tersedia sebagai runtime riset opt-in. |
| Bukti sintetis existing | Recovery parameter 30 replikasi memenuhi target numerik; baseline lama tetap menahan linking 20/30 tanpa injeksi DIF. Penahanan ini tidak boleh disembunyikan atau threshold dilonggarkan. |
| Bukti Linux existing | Dua arm/2.000 peserta menghasilkan 2.000 SCORED dalam 146,56 detik; tiga arm/4.998 peserta selesai 373,95 detik dengan NOT_COMPARABLE. Selesai komputasi tidak sama dengan linking lulus atau sertifikasi kapasitas VPS. Fresh checkout profil juga memiliki blocker digest di bawah. |
| Transport AI | Execute/status/capabilities v1, inbox PostgreSQL idempoten, daemon, lease/fencing dan artifact immutable tersedia. Capability masih RESEARCH_ONLY, comparison=false, publication=false. |
| Main | Snapshot/digest/outbox dan verifikasi artifact tersedia pada jalur riset. Migrasi 0054 membatasi database disposable `irt_research_test_%`; belum merupakan jalur adopsi/rilis siswa produksi. |
| Gap utama | Boundary penggunaan produksi dengan approval sah, adopter canonical multi-paket, coverage, mode per arm dan finalizer/rilis atomik perlu dituntaskan serta diuji. Guard legacy RESPONDENT_CONTRACT_NOT_APPROVED tetap berlaku pada adopter lama. |
| Generator | Gunakan kontrak v1/v2 existing untuk numerik, stok, media dan DRAFT. Tidak ada kebutuhan mengubah config atau menunggu adjuster untuk melayani IRT. |

Bukti existing bersumber dari handoff serta acceptance reports yang dirujuk
di sana; tidak dijalankan ulang oleh pekerjaan dokumentasi ini. Eksperimen
anchor-v2 dan studi besar belum memenuhi acceptance konfirmasi. Gunakan baseline
yang sudah dipin, pertahankan gate konservatif dan fallback main. Tidak menjanjikan
semua batch, termasuk batch kecil, akan menghasilkan nilai IRT.

**Blocker reproduksibilitas yang ditemukan pada pemeriksaan konteks:**
`tools/check_irt_handoff.py` gagal dengan `Linux profile digest mismatch` pada
worktree AI baru. Manifest image mem-pin profil Linux-v1 berakhiran CRLF
(`552a427c…`), sedangkan blob Git/profil checkout LF menghasilkan `f9724f7e…`.
Ini perbedaan byte nyata, bukan izin mengabaikan hash. Rekonsiliasi serialisasi
profil, pin image dan acceptance pada tahap boundary runtime; pertahankan bukti
lama dan jangan otomatis mengganti digest ketika service mulai. Kontrak dan
salinan dokumen dapat diperiksa terpisah, tanpa mengklaim seluruh handoff lulus.

## Strategi 24 jam — urutan eksekusi yang diusulkan

**PROPOSED — timebox kerja, bukan jaminan durasi atau approval produksi.**
Jam dihitung dari mulai run implementasi berikutnya. Pengembangan memakai
fixture, tanpa menunggu seluruh UI Admin selesai. Setiap tahap memberi commit
kecil teruji; utama melalui PR, AI stabil langsung ke main sesuai workflow pemilik.

| Waktu | Pekerjaan / penanggung jawab per fungsi | Bukti selesai |
| --- | --- | --- |
| 0–2 jam | Main + AI: bekukan handoff delivery dan fixture dua/tiga arm. Inventory pin paket/30 item, lima anchor global, rubrik, assignment/delivery, eligibility, approval dan policy nilai/fallback. | Satu manifest sintetis authoritative diterima validator; input tidak cocok ditolak. Daftar gap tim delivery eksplisit. |
| 2–6 jam | AI: benahi blocker digest fresh checkout, tuntaskan boundary runtime/konfigurasi yang dipin, auth/resources, worker, status, timeout dan runbook Linux. Bedakan profil riset dari profil penggunaan nyata; capability tidak mengiklankan fitur yang belum ada. | Execute → status → artifact dapat dipakai main. Pin/digest dapat diverifikasi pada fresh checkout; approval hilang menahan eksekusi/penerimaan. |
| 6–12 jam | Main: adapter delivery frozen dan forward schema/adopter artifact v1 untuk beberapa paket. Pertahankan guard lama; buat jalur eksplisit sesuai kontrak dan scope yang sah. | Adopsi idempoten, tepat satu hasil/status tiap attempt snapshot, tidak menulis XP/histori atau menerbitkan hasil otomatis. |
| 12–17 jam | Main: finalizer per arm IRT/fallback/UNSCORABLE, coverage lengkap, publikasi hasil+pembahasan serentak melalui reader existing. | Fixture normal, parsial dan gagal menghasilkan mode/alasan benar; replay dan late artifact tidak menimpa hasil final. |
| 17–20 jam | Main + AI/QA: penerimaan terintegrasi dengan anggaran uji total tiga jam di bawah. | Laporan pass/fail, pin dan blocker; compute berhasil tidak dicatat sebagai publikasi berhasil. |
| 20–24 jam | Kedua repo: perbaikan prioritas, required CI, PR/handoff, prosedur aktivasi/rollback dan review pihak berwenang. | Keputusan go/no-go berbukti. Jika tes butuh ulang setelah budget habis, minta revisi jadwal; jangan menyebut belum diuji sebagai lulus. |

Bagian main adalah dependency keberhasilan layanan end-to-end, bukan pekerjaan
yang bisa diselesaikan AI dengan menulis langsung ke database canonical.
Pekerjaan AI dapat selesai secara teknis dengan fixture kontrak sebelum UI
batch siap; integrasi nyata menunggu delivery pins dan persetujuan yang sah.

### Anggaran pengujian total 180 menit

| Anggaran | Fokus |
| --- | --- |
| 20 menit | Parity kontrak/digest, probabilitas 2PL/GPCM dan EAP/mapping terhadap oracle existing; tidak mengubah estimator. |
| 35 menit | Migrasi fresh/upgrade disposable, adopsi multi-arm, histori/XP tetap utuh, coverage dan fallback. |
| 45 menit | Pipeline HTTP/worker/R nyata pada fixture dua arm dan tiga arm; reuse artifact sah untuk skenario lanjutan dengan pin identik. |
| 30 menit | Duplicate/replay, timeout/cancel/restart, stale fencing, revoke approval, tampering dan penolakan identitas. |
| 20 menit | Browser reader existing: locked → rilis serentak, label mode, UNSCORABLE dan tanpa ranking nilai. |
| 30 menit | CI/regresi prioritas dan buffer perbaikan/retest; hitung runtime verifikasi di tahap lain dalam budget yang sama. |

Mulai dari pengukuran satu fit pada host saat itu. Concurrency satu, timeout
proses 15 menit, heartbeat 15 detik, lease 60 detik dan maksimum tiga execution
per request tetap berlaku. Tidak memulai studi 700 replikasi/800 bootstrap atau
menurunkan gate untuk memenuhi timer. Hentikan penambahan uji mahal ketika
anggaran tersisa tidak cukup; simpan hasil gagal/tertahan serta status belum diuji.
Tiga jam adalah penerimaan teknis terbatas, bukan sertifikasi statistik universal.

## Yang perlu disiapkan tim lain, tanpa menghalangi fixture lokal

| Kebutuhan | Pihak / konsekuensi jika belum siap |
| --- | --- |
| Manifest delivery frozen dan sumber grade final | Software delivery: paket/versi, item/rubric, batch, assigned/delivered arm, attempt, exposure. Tanpa ini tidak dispatch data nyata. |
| Alokasi sekolah/kelas, multisekolah/Mandiri dan perubahan membership | ADM-DEP-03 masih OPEN; gunakan assignment yang sudah authoritative atau fixture eksplisit. Jangan menebak precedence atau membuat algoritma alokasi dalam AI. |
| Lima anchor bersama dan approval konten/rubrik/blueprint | Curriculum + Data. Perbedaan set menahan desain IRT existing; review manusia dan jumlah anchor bukan approval linking. |
| Policy numerik/quality/eligibility/mapping dan fallback/exclusion | Data + Curriculum/Product sesuai domain. Pin ID/version/digest/scope. Policy riset tidak berubah menjadi approved production karena deadline. |
| PIC bernama, reviewer dan operator insiden/72 jam | Pemilik tim, ADM-DEP-05. Pembuat tidak otomatis pemeriksa. Catat kontak di kanal tim, tanpa credential/data asli dalam Git. |
| VPS/network/credential privat serta image terpin | Software/operasional + AI. Pisahkan akses compute dan canonical; image lokal perlu transfer/build tervalidasi. Deployment membutuhkan penerimaan dan langkah terpisah. |

ADM-DEP-01 (discovery Drill), ADM-DEP-02 (availability invalid/DRIFT) dan
ADM-DEP-06 (histori akses sekolah) tetap tercatat pada sumber. Tidak diselesaikan
dengan asumsi dalam mesin Tryout. Hormati izin reader saat hasil lama dirilis.

## Definisi selesai dan keputusan aktivasi

**Siap secara teknis** berarti fixture frozen melewati main → HTTP → inbox/worker
→ R → artifact → verifikasi/adopsi → finalizer → reader, mencakup multi-arm,
parsial, data kurang, fallback, UNSCORABLE dan gagal teknis; replay tidak membuat
hasil ganda dan histori/XP tetap utuh. Pin versi dan bukti pengujian diserahkan.

**Siap untuk peserta nyata** juga memerlukan delivery authoritative, persetujuan
akademik/policy/scope, kapasitas host tujuan, migrasi/deployment terkontrol dan
penerimaan operasional. Jika syarat ini belum tersedia, serahkan layanan teknis
dengan status terblokir untuk aktivasi; jangan mengklaim siap produksi penuh.
Fallback mengurangi ketergantungan rilis pada linking yang lulus, tetapi tidak
menggantikan grading, approval, coverage atau perlindungan histori.

Comparison PASS/DRIFT, self-adjustment, validasi reuse config, laporan HTML baru,
IRT Drill dan studi konfirmasi besar berada di luar target 24 jam ini.

## Rekonsiliasi runtime ? Prioritas 2

**ENGINEERING IMPLEMENTATION ? 10 November 2026:** blocker CRLF/LF di atas
ditangani dengan manifest image v2 yang mem-pin profil Git LF secara exact.
Profil JSON, image dan policy statistik tetap; manifest v1 tidak ditulis ulang.
Lihat [runtime handoff v2](IRT_RUNTIME_HANDOFF_V2.md) dan laporan acceptance
prioritas 2 untuk hasil integrasi serta batas bukti. Bukan approval produksi.
