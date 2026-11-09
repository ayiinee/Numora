# ADM-002 — Undangan dan pemulihan password Admin

Pemilik skenario adalah QA Admin. DevOps memasok konfigurasi Supabase Auth, SMTP, dan domain staging. Sumber perilaku adalah [runbook akun Admin](../../../../docs/development/ADMIN_ACCOUNTS_RUNBOOK.md) dan PRD v0.6 bagian 3.2.

Alur dimulai dari Super Admin mengundang identitas email uji dan selesai ketika penerima menetapkan password serta masuk dengan role yang tercatat pada undangan. Uji pemulihan pada akun Admin aktif, undangan tertunda, akun nonaktif, tautan kedaluwarsa dan tautan yang sudah dipakai. Pakai identitas sintetis dan inbox yang dikuasai tim.

Suite `auth-screen` mensimulasikan respons provider. Suite `accounts-db` memakai PostgreSQL lokal dan provider fixture untuk menguji status dan operasi durable. Bukti SMTP, template dan token sungguhan dicatat pada [checklist manual](MANUAL_CHECKLIST.md) setelah staging tersedia.
