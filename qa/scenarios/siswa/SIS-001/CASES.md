# Pelaksanaan kasus SIS-001

Rujukan dan keberlakuan setiap kasus tercatat di scenario.json. Expected result mengikuti sumber yang disahkan, bukan respons aplikasi yang sedang diuji.

| Kasus  | Langkah inti                                                                                        | Expected dan bukti                              |
| ------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| TC-001 | Save, offline retry, refresh, submit and reopen preserve the correct result                         | components, connected; sumber DRILL             |
| TC-002 | 70 fails mastery; 80 unlocks; latest zero never erases best/unlock                                  | persistence, connected; sumber DRILL            |
| TC-003 | Student A/B, anonymous and wrong-role access are denied                                             | connected; sumber AUTH                          |
| TC-004 | Invalid input, premature results and locked levels are rejected                                     | connected; sumber AUTH                          |
| TC-005 | XP formula, rounding and 900-second boundaries                                                      | rewards, persistence, connected; sumber REWARDS |
| TC-006 | Concurrent submit posts one result, XP and completion event; rollback is atomic                     | persistence, connected; sumber REWARDS          |
| TC-007 | Code quality and contract checks remain visible                                                     | quality; sumber WORKFLOW                        |
| TC-008 | Supported viewports and automated accessibility                                                     | accessibility; sumber WORKFLOW                  |
| TC-009 | HTTP load/stress produces measurable latency and reconciled accepted results                        | load; sumber WORKFLOW                           |
| TC-010 | Volume preserves event identity/content at 1k, 10k and 100k                                         | volume; sumber OUTBOX                           |
| TC-011 | Velocity records incoming/processed rate, backlog and drain time                                    | velocity; sumber OUTBOX                         |
| TC-012 | Supported payload variety survives the worker; invalid generator envelopes are rejected by contract | variety; sumber EVENT                           |
| TC-013 | Worker redelivery and DB/Redis transport recovery preserve durable data; local backup restores      | recovery; sumber OUTBOX                         |
| TC-014 | Dependency findings are recorded for triage                                                         | dependencies; sumber WORKFLOW                   |
| TC-015 | Human keyboard and usability review                                                                 | manual-keyboard; sumber WORKFLOW                |

E2E utama membuka materi, memulai latihan melalui UI, memutus jaringan saat save, mencoba ulang, refresh, menjawab 8 benar, submit, membuka kembali hasil, mengulang request submit dan memeriksa ledger/outbox/pin database. Kasus API terpisah memeriksa 7→8→0, akses antar-identitas dan validasi input. Fixture tiap kasus memakai siswa baru agar tidak mengandalkan hasil kasus sebelumnya.

Untuk setiap kegagalan simpan expected/actual yang spesifik dari assertion dan lakukan triase sebelum menyebutnya bug aplikasi. Benchmark memakai data sintetis; query rekonsiliasi membandingkan event ID dan payload. Input envelope invalid diperiksa pada batas generator kontrak, tidak diklaim sebagai pengujian validasi worker terhadap baris database yang diinjeksi secara ilegal.
