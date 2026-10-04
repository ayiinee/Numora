# NUMORA redesign — screenshot gallery

**ENGINEERING DECISION — 4 October 2026:** the owner authorized publishing all redesign phases in a pull request. These 41 screen pairs are checked into Git so teammates can inspect the final mobile and desktop presentation from another checkout. All images are original browser captures with synthetic auth/API identities and data. They contain no real credentials, teacher verification token or student PII. Reference screenshots are not used as page implementations.

Mobile: 390 px. Desktop: 1440 px. The complete responsive regression also checks 320, 360, 393, 430, 768, 1024 and 1280 px. Frame metadata and original Figma asset access remain unavailable; actual DTO/product constraints and derived Teacher/Auth/Admin designs are documented in the phase reports. This gallery shows current behavior, not unsupported reference features.

[Final phase report](../../UI_REDESIGN_PHASE_10_2026-10-04.md) · [Baseline and phase ledger](../../UI_REDESIGN_BASELINE_2026-10-03.md) · [Capture provenance](manifest.json)

| Screen                      | Mobile 390 px                       | Desktop 1440 px                      |
| --------------------------- | ----------------------------------- | ------------------------------------ |
| Student Home                | [PNG](student-home-390.png)         | [PNG](student-home-1440.png)         |
| Materi: Bab                 | [PNG](learning-catalog-390.png)     | [PNG](learning-catalog-1440.png)     |
| Materi: Subbab              | [PNG](learning-chapter-390.png)     | [PNG](learning-chapter-1440.png)     |
| Peta level                  | [PNG](learning-levels-390.png)      | [PNG](learning-levels-1440.png)      |
| Drill                       | [PNG](drill-390.png)                | [PNG](drill-1440.png)                |
| Konfirmasi Drill            | [PNG](drill-submit-390.png)         | [PNG](drill-submit-1440.png)         |
| Hasil Drill                 | [PNG](drill-result-390.png)         | [PNG](drill-result-1440.png)         |
| Tryout: Katalog             | [PNG](tryout-catalog-390.png)       | [PNG](tryout-catalog-1440.png)       |
| Tryout: Detail              | [PNG](tryout-detail-390.png)        | [PNG](tryout-detail-1440.png)        |
| Tryout: Sesi                | [PNG](tryout-attempt-390.png)       | [PNG](tryout-attempt-1440.png)       |
| Tryout: Menunggu IRT        | [PNG](tryout-waiting-390.png)       | [PNG](tryout-waiting-1440.png)       |
| Tryout: Hasil dirilis       | [PNG](tryout-result-390.png)        | [PNG](tryout-result-1440.png)        |
| Riwayat penilaian           | [PNG](assessment-history-390.png)   | [PNG](assessment-history-1440.png)   |
| PvP: Buat room              | [PNG](pvp-create-390.png)           | [PNG](pvp-create-1440.png)           |
| PvP: Gabung                 | [PNG](pvp-join-390.png)             | [PNG](pvp-join-1440.png)             |
| PvP: Ruang tunggu           | [PNG](pvp-waiting-390.png)          | [PNG](pvp-waiting-1440.png)          |
| PvP: Battle terkunci        | [PNG](pvp-battle-390.png)           | [PNG](pvp-battle-1440.png)           |
| PvP: Hasil                  | [PNG](pvp-outcome-390.png)          | [PNG](pvp-outcome-1440.png)          |
| Leaderboard Mudah           | [PNG](leaderboard-easy-390.png)     | [PNG](leaderboard-easy-1440.png)     |
| Leaderboard Sedang          | [PNG](leaderboard-medium-390.png)   | [PNG](leaderboard-medium-1440.png)   |
| Leaderboard Sulit           | [PNG](leaderboard-hard-390.png)     | [PNG](leaderboard-hard-1440.png)     |
| Profil Student              | [PNG](student-profile-390.png)      | [PNG](student-profile-1440.png)      |
| Feedback Guru               | [PNG](student-feedback-390.png)     | [PNG](student-feedback-1440.png)     |
| Teacher: Verifikasi         | [PNG](teacher-verification-390.png) | [PNG](teacher-verification-1440.png) |
| Teacher: Kelas              | [PNG](teacher-classes-390.png)      | [PNG](teacher-classes-1440.png)      |
| Teacher: Siswa              | [PNG](teacher-students-390.png)     | [PNG](teacher-students-1440.png)     |
| Teacher: Progres            | [PNG](teacher-progress-390.png)     | [PNG](teacher-progress-1440.png)     |
| Teacher: Profil             | [PNG](teacher-profile-390.png)      | [PNG](teacher-profile-1440.png)      |
| Login                       | [PNG](auth-login-390.png)           | [PNG](auth-login-1440.png)           |
| Onboarding                  | [PNG](auth-onboarding-390.png)      | [PNG](auth-onboarding-1440.png)      |
| Callback error              | [PNG](auth-callback-390.png)        | [PNG](auth-callback-1440.png)        |
| Admin: Sekolah/token        | [PNG](admin-schools-390.png)        | [PNG](admin-schools-1440.png)        |
| Admin: Materi               | [PNG](admin-curriculum-390.png)     | [PNG](admin-curriculum-1440.png)     |
| Admin: Soal                 | [PNG](admin-questions-390.png)      | [PNG](admin-questions-1440.png)      |
| Admin: Verifikasi & riwayat | [PNG](admin-verification-390.png)   | [PNG](admin-verification-1440.png)   |
| Admin: Video                | [PNG](admin-videos-390.png)         | [PNG](admin-videos-1440.png)         |
| Admin: Draf Tryout          | [PNG](admin-tryout-390.png)         | [PNG](admin-tryout-1440.png)         |
| Admin: Paket Drill          | [PNG](admin-drill-390.png)          | [PNG](admin-drill-1440.png)          |
| Admin: Laporan              | [PNG](admin-reports-390.png)        | [PNG](admin-reports-1440.png)        |
| Admin: IRT                  | [PNG](admin-irt-390.png)            | [PNG](admin-irt-1440.png)            |
| Admin: Audit                | [PNG](admin-audit-390.png)          | [PNG](admin-audit-1440.png)          |

Images preserve the original capture pixels. No reference crops, overlays, traces, storage states, real OAuth exchange URLs or one-time token captures are included. Historical full-matrix/overlay evidence stays in ignored local artifacts and can be regenerated by the Playwright suite; only representative final pairs are tracked here.
