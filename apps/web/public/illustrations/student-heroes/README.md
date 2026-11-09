# Student hero artwork

The Home carousel uses `drill-owl.webp` and `tryout-exam.webp` in the same two-column hero as PvP. Both were extracted with the built-in ImageGen tool from the original Home banners, then encoded as 680 px WebP with alpha.

- `drill-owl.webp` — Extract the existing cheerful purple and cream owl, its open math book, yellow set square and pencil. Match the input character face, color and shaded 2.5D finish. Complete the book and pencil contours at the bottom where the reference was cut off. Keep one compact unified composition.
- `tryout-exam.webp` — Extract the existing white-and-blue checklist sheet, orange pencil and blue stopwatch as one compact cluster. Preserve their shape, arrangement, blue/gold colors and smooth 2.5D cartoon finish. Keep all three objects fully inside the frame.

Shared prompt for both assets: Remove all of the rectangular banner, frame, background waves and the empty left side. Create a clean tightly framed transparent RGBA cutout with small margins around the complete objects, no text, no shadows outside the subject. This will sit on a CSS gradient next to text in a student dashboard. Preserve the existing artwork identity.

**ENGINEERING DECISION — 8 November 2026:** the four supplied PNGs are the active artwork for the PvP lobby and the Mudah, Sedang, and Sulit leaderboard arenas. The `*-trophy.webp` assets retain the source dimensions and transparency. Each arena has its own gradient. The illustration and copy have separate columns so the text wraps beside the artwork on narrow screens.

**Owner correction, 4 November 2026:** PvP now uses the original `pvp.webp` again with a slightly reduced CSS scale. `pvp-characters.webp` is retained as an unused iteration. The three transparent leaderboard assets remain active.

**ENGINEERING DECISION — owner request, 4 November 2026:** simplify the four owner-supplied banners following the 31 October density audit. Original banners remain unchanged. Active images are transparent foreground illustrations; CSS supplies palette and quiet background waves.

| Asset                               | Bytes  | Content                                     |
| ----------------------------------- | ------ | ------------------------------------------- |
| `pvp-characters.webp`               | 55,632 | Owl and orange opponent, star books         |
| `leaderboard-easy-character.webp`   | 67,786 | Owl, blue-ribbon medal, trophy              |
| `leaderboard-medium-character.webp` | 66,200 | Owl, red-ribbon medal, simple crown, trophy |
| `leaderboard-hard-character.webp`   | 64,396 | Owl, red-jewel crown, trophy                |

Generated with the built-in image_gen editing tool, one separate edit per original WebP. Transparent PNG outputs were trimmed to their content and encoded as 640px-wide WebP, quality 88/alpha quality 100, with Sharp. No background flattening. Consuming stylesheet: `apps/web/src/features/core-learning/student-illustrated-hero.css`.

## Exact prompt set

### PvP — reference/edit target `pvp.webp`

Edit target: provided PvP illustration. Extract and simplify ONLY its purple owl and orange red-panda/fox opponents into one compact horizontal character cutout, preserving exact cute faces, smooth 2.5D painted cartoon shading, purple/cream and orange/cream colors and their purple/red star books. They face one another in friendly competition. Remove floating trophy, lightning bolt, ALL sparkle stars, motion swooshes and ALL background. Remove raised pencils so no tall thin object crowds the left text. Keep both characters complete with a small comfortable gap and no extra props. Tight compact two-character composition fitting a 1.35:1 bounding box, full bodies visible, transparent alpha background, no shadow plate, no border, no text.

### Easy — reference/edit target `leaderboard-easy.webp`

Edit target: provided easy arena owl. Extract its same friendly purple owl into a clean standalone cutout. Preserve face, purple cream coloring, blue-ribbon gold medal, gently raised wing holding one small golden star trophy. Remove crown, all podium bases, laurels, stars, sparkle, rays, glow, motion lines and every background. Full body, natural floating celebratory pose, soft smooth 2.5D cartoon shading identical to input, quiet gold highlights without emissive bloom, compact nearly square composition, transparent alpha background, no text, no floor.

### Medium — reference/edit target `leaderboard-medium.webp`

Edit target: provided medium arena owl. Extract its same purple owl into a simplified standalone cutout. Preserve exact cute face, purple and cream colors, red-ribbon gold medal, holding one modest gold star trophy. Keep a SMALL simple gold crown but remove jewel complexity. Remove every podium base, laurel, star, sparkle, ray, bloom, motion line, and all background. Full body, joyful celebratory pose, smooth soft 2.5D cartoon shading identical to original, restrained gold highlights, compact nearly square composition. True transparent alpha background, no text, no floor.

### Hard — reference/edit target `leaderboard-hard.webp`

Edit target: provided hard arena owl. Extract same jubilant purple owl holding a moderately sized gold star trophy and wearing its gold crown with one red jewel. Preserve distinctive face, purple cream colors and painted soft 2.5D cartoon style. Simplify drastically: remove ALL podium bases, crystals, laurels, ribbons, sparkle stars, rays, glowing highlights and all background. Retain only full-body owl, simple crown and single trophy. Gold satin highlights, no bloom/emissive effect. Compact nearly square cutout with full wings/feet/crown/trophy visible. Transparent alpha background, no text or floor.
