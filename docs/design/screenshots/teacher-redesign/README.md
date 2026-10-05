# Teacher frontend visual QA

Screenshots contain fictional browser test identities and mocked HTTP responses. They verify frontend rendering, not live seed/API integration. The PNG references provided by the owner drive visual composition; product/API contracts drive data and capabilities.

| Screen                        | Mobile, 390 px                              | Desktop, 1280 px                              |
| ----------------------------- | ------------------------------------------- | --------------------------------------------- |
| Dashboard                     | [Mobile](classes-390.png)                   | [Desktop](classes-1280.png)                   |
| Class and members             | [Mobile](students-390.png)                  | [Desktop](students-1280.png)                  |
| Student progress and history  | [Mobile](progress-390.png)                  | [Desktop](progress-1280.png)                  |
| Monitoring Progres            | [Mobile](monitoring-390.png)                | [Desktop](monitoring-1280.png)                |
| Invite/code/QR                | [Mobile](invite-390.png)                    | [Desktop content](invite-1280.png)            |
| Class settings, read-only     | [Mobile](settings-390.png)                  | [Desktop](settings-1280.png)                  |
| Feedback                      | [Mobile](feedback-390.png)                  | [Desktop](feedback-1280.png)                  |
| Pusat Notifikasi, unavailable | [Mobile](notifications-unavailable-390.png) | [Desktop](notifications-unavailable-1280.png) |
| Tryout, unavailable           | [Mobile](tryout-unavailable-390.png)        | [Desktop](tryout-unavailable-1280.png)        |
| Leaderboard, unavailable      | [Mobile](leaderboard-unavailable-390.png)   | [Desktop](leaderboard-unavailable-1280.png)   |
| Profile/account               | [Mobile](profile-390.png)                   | [Desktop](profile-1280.png)                   |

Reference comparisons: [Mobile dashboard](mobile-classes-comparison.png), [Desktop dashboard](desktop-classes-comparison.png), [Mobile monitoring](mobile-monitoring-comparison.png), [Desktop monitoring](desktop-monitoring-comparison.png).

Frames/glow are excluded from reference comparison. This checks composition, palette, geometry and responsive behavior; intentionally omitted unsupported metrics/actions mean the implemented page heights differ. Local font and icon identity differ from unverified Figma metadata. Native browser full-page captures show the fixed mobile bar at the initial viewport position.

All 13 viewport captures and geometry reports remain in ignored `.tmp/teacher-redesign/`: 320/360/375/390/393/430/768/834/1024/1280/1366/1440/1920 px. The complete report records final checks and known backend gaps.
