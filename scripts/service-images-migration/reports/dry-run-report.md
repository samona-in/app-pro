# Service image migration — dry run

Generated: 2026-11-12T17:30:48.296Z

| Metric | Value |
|---|---|
| Total images | 385 |
| Original size | 667.52 MB |
| Destination | `s3://samona-staging-services-072842665972/services/` |
| Region | us-east-1 |
| Target per image | 50.0 KB |
| Filename collisions | 0 |
| Non-image objects skipped | 0 |

## Sample optimization

| Source | Original | Optimized | Quality | Dimensions | Under target |
|---|---|---|---|---|---|
| `2 way switch installreplace.png` | 1.96 MB | 49.0 KB | 65 | 1280×853 | yes |
| `2-pin plug replacement.png` | 2.12 MB | 48.9 KB | 72 | 1280×853 | yes |
| `3-phase.png` | 2.09 MB | 45.6 KB | 72 | 1024×683 | yes |
| `3-pin plug replacement.png` | 2.11 MB | 48.9 KB | 72 | 1280×853 | yes |
| `AC and Applications/ac install.png` | 2.02 MB | 49.1 KB | 65 | 1280×853 | yes |
| `AC and Applications/ac repair.png` | 2.23 MB | 43.7 KB | 72 | 1024×683 | yes |
| `AC and Applications/ac service.png` | 2.20 MB | 47.5 KB | 58 | 1024×683 | yes |
| `AC and Applications/ac uninstall.png` | 2.05 MB | 48.7 KB | 65 | 1024×683 | yes |
| `AC and Applications/AC-applications.jpeg` | 338.9 KB | 47.6 KB | 80 | 1024×683 | yes |
| `AC and Applications/chimney checkup.png` | 2.05 MB | 46.7 KB | 58 | 1024×683 | yes |
| `AC and Applications/chimney service2.png` | 2.38 MB | 47.3 KB | 58 | 800×533 | yes |
| `AC and Applications/chimney uninstall.png` | 2.08 MB | 49.0 KB | 58 | 1024×683 | yes |

## Next step

Confirm the destination and the sample sizes, then run:

```bash
node scripts/service-images-migration/migrate-service-images.mjs --execute --concurrency 4
```

