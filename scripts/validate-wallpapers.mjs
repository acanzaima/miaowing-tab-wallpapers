import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = path.join(ROOT_DIR, 'wallpapers.json')
const SCHEMA_PATH = path.join(ROOT_DIR, 'schema', 'wallpapers.schema.json')
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

const errors = []

function addError(pathLabel, message) {
  errors.push(`${pathLabel}: ${message}`)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertAllowedKeys(value, allowedKeys, pathLabel) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      addError(`${pathLabel}.${key}`, 'unexpected property')
    }
  }
}

function assertNonEmptyString(value, pathLabel) {
  if (typeof value !== 'string' || value.length === 0) {
    addError(pathLabel, 'must be a non-empty string')
  }
}

function validateTags(tags, pathLabel) {
  if (tags === undefined) {
    return
  }

  if (!Array.isArray(tags)) {
    addError(pathLabel, 'must be an array')
    return
  }

  const seenTags = new Set()
  tags.forEach((tag, index) => {
    if (typeof tag !== 'string') {
      addError(`${pathLabel}.${index}`, 'must be a string')
      return
    }

    if (seenTags.has(tag)) {
      addError(`${pathLabel}.${index}`, `duplicate tag "${tag}"`)
      return
    }

    seenTags.add(tag)
  })
}

function validateWallpaper(wallpaper, pathLabel, usedWallpaperIds) {
  if (!isPlainObject(wallpaper)) {
    addError(pathLabel, 'must be an object')
    return
  }

  assertAllowedKeys(wallpaper, ['id', 'title', 'thumb', 'url', 'type', 'color', 'tags', 'source'], pathLabel)

  for (const key of ['id', 'title', 'thumb', 'url', 'type']) {
    if (!(key in wallpaper)) {
      addError(`${pathLabel}.${key}`, 'is required')
    }
  }

  if (typeof wallpaper.id === 'string') {
    if (!SLUG_PATTERN.test(wallpaper.id)) {
      addError(`${pathLabel}.id`, 'must be kebab-case')
    }

    if (usedWallpaperIds.has(wallpaper.id)) {
      addError(`${pathLabel}.id`, `duplicate wallpaper id "${wallpaper.id}"`)
    }

    usedWallpaperIds.add(wallpaper.id)
  } else {
    addError(`${pathLabel}.id`, 'must be a string')
  }

  assertNonEmptyString(wallpaper.title, `${pathLabel}.title`)
  assertNonEmptyString(wallpaper.thumb, `${pathLabel}.thumb`)
  assertNonEmptyString(wallpaper.url, `${pathLabel}.url`)

  if (!['image', 'video'].includes(wallpaper.type)) {
    addError(`${pathLabel}.type`, 'must be image or video')
  }

  if (wallpaper.color !== undefined && (typeof wallpaper.color !== 'string' || !COLOR_PATTERN.test(wallpaper.color))) {
    addError(`${pathLabel}.color`, 'must be a hex color')
  }

  validateTags(wallpaper.tags, `${pathLabel}.tags`)

  if (wallpaper.source !== undefined && typeof wallpaper.source !== 'string') {
    addError(`${pathLabel}.source`, 'must be a string')
  }
}

function validateCategory(category, pathLabel, usedCategoryKeys, usedWallpaperIds) {
  if (!isPlainObject(category)) {
    addError(pathLabel, 'must be an object')
    return
  }

  assertAllowedKeys(category, ['key', 'label', 'wallpapers'], pathLabel)

  for (const key of ['key', 'label', 'wallpapers']) {
    if (!(key in category)) {
      addError(`${pathLabel}.${key}`, 'is required')
    }
  }

  if (typeof category.key === 'string') {
    if (!SLUG_PATTERN.test(category.key)) {
      addError(`${pathLabel}.key`, 'must be kebab-case')
    }

    if (usedCategoryKeys.has(category.key)) {
      addError(`${pathLabel}.key`, `duplicate category key "${category.key}"`)
    }

    usedCategoryKeys.add(category.key)
  } else {
    addError(`${pathLabel}.key`, 'must be a string')
  }

  if (!isPlainObject(category.label)) {
    addError(`${pathLabel}.label`, 'must be an object')
  } else {
    assertAllowedKeys(category.label, ['zh-CN', 'en'], `${pathLabel}.label`)
    assertNonEmptyString(category.label['zh-CN'], `${pathLabel}.label.zh-CN`)
    assertNonEmptyString(category.label.en, `${pathLabel}.label.en`)
  }

  if (!Array.isArray(category.wallpapers)) {
    addError(`${pathLabel}.wallpapers`, 'must be an array')
    return
  }

  category.wallpapers.forEach((wallpaper, index) => {
    validateWallpaper(wallpaper, `${pathLabel}.wallpapers.${index}`, usedWallpaperIds)
  })
}

async function main() {
  JSON.parse(await fs.readFile(SCHEMA_PATH, 'utf8'))

  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'))

  if (!isPlainObject(manifest)) {
    addError('<root>', 'must be an object')
  } else {
    assertAllowedKeys(manifest, ['version', 'categories'], '<root>')

    if (!Number.isInteger(manifest.version) || manifest.version < 1) {
      addError('version', 'must be an integer greater than or equal to 1')
    }

    if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) {
      addError('categories', 'must be a non-empty array')
    } else {
      const usedCategoryKeys = new Set()
      const usedWallpaperIds = new Set()
      manifest.categories.forEach((category, index) => {
        validateCategory(category, `categories.${index}`, usedCategoryKeys, usedWallpaperIds)
      })
    }
  }

  if (errors.length) {
    for (const error of errors) {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  console.log('wallpapers.json is valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
