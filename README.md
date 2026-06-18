# Miaowing Tab Wallpapers

Remote wallpaper manifest and static assets for Miaowing Tab.

## Usage

Install dependencies once:

```bash
npm install
```

Put wallpaper images into a category directory under `images/`, then run:

```bash
npm run generate
```

The script scans `images/*` and rewrites `wallpapers.json` automatically. The extension loads this manifest from jsDelivr.
If no manual thumbnail is provided, the script also generates a WebP preview image under `_thumbs/`.

```text
https://cdn.jsdelivr.net/gh/<github-user>/miaowing-tab-wallpapers@main/wallpapers.json
```

## Categories

Built-in category directories:

```text
images/
  nature/
  animal/
  city/
  space/
  abstract/
  minimal/
  illustration/
```

You can add a new first-level directory under `images/` to create a new category. If the directory is not one of the built-in categories, the script uses the directory name as both the category key and display label.

## File Rules

Supported image formats:

```text
.jpg .jpeg .png .webp .avif .gif
```

Example:

```text
images/nature/mountain-lake.webp
```

Generates a 480x270 WebP thumbnail:

```text
images/nature/_thumbs/mountain-lake-xxxxxxxx.webp
```

And writes:

```json
{
  "id": "nature-mountain-lake",
  "title": "Mountain Lake",
  "thumb": "images/nature/_thumbs/mountain-lake-xxxxxxxx.webp",
  "url": "images/nature/mountain-lake.webp",
  "type": "image",
  "tags": ["nature", "mountain", "lake"]
}
```

If you want a separate thumbnail, put it next to the original image with the same base name plus `-thumb` or `-thumbnail`.

```text
images/nature/mountain-lake.webp
images/nature/mountain-lake-thumb.webp
```

Manual thumbnails are used as-is and will not be overwritten by the script.

## Validation

Check that `wallpapers.json` matches the current files:

```bash
npm run check
```

Validate the manifest fields:

```bash
npm run validate
```

GitHub Actions also checks that the generated manifest is up to date and validates the manifest fields.

## Cache Note

Use new file names when replacing images. For example, prefer `mountain-lake-002.webp` instead of overwriting `mountain-lake.webp`, so CDN caches do not keep serving an old image.
