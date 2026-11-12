# Service image migration report

Generated: 2026-11-12T17:28:24.587Z

| Metric | Description | Value |
|---|---|---|
| Total images | Images discovered in Supabase | 385 |
| Successful | Images uploaded successfully | 385 |
| Failed | Images that failed | 0 |
| Original size | Total original image size | 667.52 MB |
| Optimized size | Total WebP image size | 16.64 MB |
| Space saved | Total storage reduction | 650.88 MB (97.5%) |
| Above 50 KB | Images exceeding target | 1 |

## Additional status

| Status | Count |
|---|---|
| Already present (verified, skipped) | 0 |
| Conflicts (existing object not created by this migration) | 0 |
| Above target but uploaded at best quality | 1 |

## Largest optimized images

| Source | Output | Quality | Dimensions | Above target |
|---|---|---|---|---|
| `samona-graphics.jpeg` | 77.0 KB | 50 | 640×427 | YES |
| `AC and Applications/microwave3.png` | 50.0 KB | 58 | 1024×683 | no |
| `wallfan_install.png` | 50.0 KB | 65 | 1280×853 | no |
| `AC and Applications/purifier wall install.png` | 49.9 KB | 72 | 1024×683 | no |
| `desktop & pc repair/Installing an SSD in a Desktop PC.png` | 49.9 KB | 65 | 800×533 | no |
| `desktop & pc repair/Technician Repairing a Desktop Tower.png` | 49.9 KB | 58 | 800×533 | no |
| `Switch installation(Regular).png` | 49.9 KB | 72 | 1280×853 | no |
| `paintings/Painting interior.png` | 49.9 KB | 65 | 1280×853 | no |
| `Applying White Grout Between Beige Tiles.png` | 49.9 KB | 65 | 1280×853 | no |
| `paintings/painting doors and windows.png` | 49.9 KB | 58 | 1024×683 | no |

## Images above 50 KB

These were uploaded at the lowest acceptable setting rather than shrinking further.

| Source | Output | Dimensions |
|---|---|---|
| `samona-graphics.jpeg` | 77.0 KB | 640×427 |

## Verification

Every upload was verified with `HeadObject`: the object must exist, report the exact byte length written, and carry `Content-Type: image/webp`.

