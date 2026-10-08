# TBG Caribbean Intelligence Spotlight — Photography staging

STATUS: ASSET RIGHTS AND EXACT FILE PENDING. DO NOT MERGE OR DEPLOY.

## Selections
1. Turks & Caicos: **South Bank Waterfront Residences — Option A**. Actual South Bank development image photographed by Jack Hobhouse / presented by Blee Halligan. Source: https://www.bleehalligan.co.uk/work/south-bank-masterplan/ . Candidate source image shown at https://www.bleehalligan.co.uk/media/filer_public_thumbnails/filer_public/17/a6/17a6c40e-ca6f-461a-80b9-cc8f7950613d/240719_bh_southbank_jackhobhouse_067.jpg__1920x0_q85_subsampling-2_upscale.jpg . Rights: NOT APPROVED. Seek written permission/license for corporate marketing site and derivative crops.
2. Curaçao: **previously approved Willemstad blue-hour waterfront photograph**. Preserve EXACT selected source, not a visually similar substitution. Source image identifier from earlier chat was not available in repository inspection; retrieve original approved file and secure required commercial license. DO NOT assume Getty search result is the identical photograph.

## Current mappings in index.html
- .priority-card.turks-caicos => assets-images/bahamas.webp [incorrect jurisdiction]
- .priority-card.curacao => assets-images/barbados.webp [incorrect jurisdiction]

## Asset acceptance and deployment checklist
- Upon verification of licensing and original files, generate:
  - assets-images/turks-caicos-south-bank.webp
  - assets-images/curacao-willemstad-blue-hour.webp
- Use real source photographs only. No synthesized buildings, retouched geography, or watermarks removed.
- Desktop source width ~2400px; responsive ~1200px derivative if used; maintain image aspect and avoid distortion.
- Preserve existing .priority-card gradient, typography, hover and card structure.
- Frame villa development and waterfront for TCI; keep recognizable illuminated Handelskade facades for Curaçao; ensure text overlay legibility at desktop and 375px mobile.
- Then update only these two CSS rules (after asset approval):
  `.priority-card.turks-caicos{background-image:url("assets-images/turks-caicos-south-bank.webp");}`
  `.priority-card.curacao{background-image:url("assets-images/curacao-willemstad-blue-hour.webp");}`
- Verify files exist in same branch; browser/device screenshot QA; only then merge/release following explicit authorization.

No production assets or CSS rules have been changed in this staging document.
