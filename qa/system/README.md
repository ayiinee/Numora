# Pemeriksaan bersama

ENGINEERING DECISION — workflow QA 27 Oktober 2026. Adapter `quality` menjalankan lint, typecheck dan validasi kontrak repository. Adapter `audit` menjalankan pemeriksaan dependency. Pemulihan memakai database milik run. Registry ada pada scripts/qa/adapters.mjs; manifest tidak menerima shell command.

Tes domain tetap dimiliki modul asal dan dirujuk dari skenario. Helper lintas suite berada di packages/testing ketika benar-benar digunakan bersama.
