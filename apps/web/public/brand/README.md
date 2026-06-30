# Kora brand assets

**Source:** `kora-pack/` from `KORA_icon_sections.zip` (user-cut sections).

Re-ingest after updating pack files:

```bash
python scripts/ingest-kora-pack.py
```

## Logo (`logo/`)
| File | From |
|------|------|
| `kora-lockup.png` | `kora-pack/logo.png` |
| `kora-mark.png` | split from lockup |
| `kora-wordmark.png` | split from lockup |

## Platform icons
| Folder | Source sheet | Sizes |
|--------|--------------|-------|
| `windows/` | `windows.png` | 512, 256, 128, 64 |
| `macos/` | `macos.png` | 512, 256, 128, 64 |
| `android/` | `android.png` | 512, 192, 144, 96, 72, 48 |
| `browser/` | `browser.png` | 512, 256, 128, 64, 32, 16 |

## Hero / marketing

| File | Use |
|------|-----|
| `kora-landing-banner.png` | Full-width welcome page banner (`WelcomePage.tsx`) |
| `kora-banner.png` | Full marketing artwork (source) |
| `kora-banner-visual.png` | Cropped laptop visual (legacy split hero) |
| `kora-banner-hero.png` | Alternate hero crop |

## Site (`public/`)
`favicon-*.png`, `icon-192x192.png`, `icon-512x512.png`, `apple-touch-icon.png`

## Hero banner
`kora-banner-visual.png` — cropped from full marketing banner (not in icon zip).
