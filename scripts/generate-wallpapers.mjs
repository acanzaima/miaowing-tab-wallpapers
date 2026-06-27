import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IMAGES_DIR = path.join(ROOT_DIR, 'images')
const MANIFEST_PATH = path.join(ROOT_DIR, 'wallpapers.json')
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])
const THUMB_DIR_NAME = '_thumbs'
const THUMB_WIDTH = 480
const THUMB_HEIGHT = 270
const THUMB_QUALITY = 78

const BUILT_IN_CATEGORIES = [
  {
    key: 'nature',
    label: { 'zh-CN': '自然', en: 'Nature' },
    color: '#2f6b4f'
  },
  {
    key: 'animal',
    label: { 'zh-CN': '动物', en: 'Animal' },
    color: '#8b5e34'
  },
  {
    key: 'city',
    label: { 'zh-CN': '城市', en: 'City' },
    color: '#334155'
  },
  {
    key: 'space',
    label: { 'zh-CN': '宇宙', en: 'Space' },
    color: '#111827'
  },
  {
    key: 'abstract',
    label: { 'zh-CN': '抽象', en: 'Abstract' },
    color: '#4f46e5'
  },
  {
    key: 'minimal',
    label: { 'zh-CN': '极简', en: 'Minimal' },
    color: '#e5e7eb'
  },
  {
    key: 'illustration',
    label: { 'zh-CN': '插画', en: 'Illustration' },
    color: '#f59e0b'
  },
  {
    key: 'architecture',
    label: { 'zh-CN': '建筑', en: 'Architecture' },
    color: '#64748b'
  },
  {
    key: 'car',
    label: { 'zh-CN': '汽车', en: 'Car' },
    color: '#334155'
  }
]

const categoryConfigMap = new Map(BUILT_IN_CATEGORIES.map((category) => [category.key, category]))
const checkOnly = process.argv.includes('--check')
const thumbnailCheckErrors = []

function normalizeKey(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function humanize(value) {
  const text = value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) {
    return value
  }

  return text.replace(/\b[a-z]/g, (char) => char.toUpperCase())
}

function hash(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 8)
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

function toManifestPath(value) {
  return toPosixPath(path.relative(ROOT_DIR, value))
}

function isThumbnailName(name) {
  return /(?:[-_.](?:thumb|thumbnail))$/i.test(name)
}

function getThumbnailBase(name) {
  return name.replace(/(?:[-_.](?:thumb|thumbnail))$/i, '')
}

function getGeneratedThumbnailPath(file) {
  const slug = normalizeKey(file.baseName) || 'wallpaper'
  const fingerprint = hash(toManifestPath(file.absolutePath))

  return path.join(path.dirname(file.absolutePath), THUMB_DIR_NAME, `${slug}-${fingerprint}.webp`)
}

async function createThumbnailBuffer(sourcePath) {
  return sharp(sourcePath)
    .rotate()
    .resize(THUMB_WIDTH, THUMB_HEIGHT, {
      fit: 'cover',
      position: 'center'
    })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer()
}

async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function syncGeneratedThumbnail(sourcePath, thumbPath) {
  const nextContent = await createThumbnailBuffer(sourcePath)
  const currentContent = await readFileIfExists(thumbPath)
  const manifestThumbPath = toManifestPath(thumbPath)

  if (checkOnly) {
    if (!currentContent) {
      thumbnailCheckErrors.push(`${manifestThumbPath} is missing. Run \`npm run generate\`.`)
      return
    }

    if (!currentContent.equals(nextContent)) {
      thumbnailCheckErrors.push(`${manifestThumbPath} is out of date. Run \`npm run generate\`.`)
    }

    return
  }

  if (currentContent?.equals(nextContent)) {
    return
  }

  await fs.mkdir(path.dirname(thumbPath), { recursive: true })
  await fs.writeFile(thumbPath, nextContent)
}

async function cleanupGeneratedThumbnails(categoryDir, usedThumbPaths) {
  if (checkOnly) {
    return
  }

  const thumbDir = path.join(IMAGES_DIR, categoryDir, THUMB_DIR_NAME)
  let entries

  try {
    entries = await fs.readdir(thumbDir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return
    }

    throw error
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.webp')
      .map(async (entry) => {
        const thumbPath = path.join(thumbDir, entry.name)
        if (!usedThumbPaths.has(thumbPath)) {
          await fs.rm(thumbPath)
        }
      })
  )

  try {
    await fs.rmdir(thumbDir)
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code)) {
      throw error
    }
  }
}

function createWallpaperId(categoryKey, baseName, manifestPath, usedIds) {
  const slug = normalizeKey(baseName)
  const baseId = slug ? `${categoryKey}-${slug}` : `${categoryKey}-${hash(manifestPath)}`

  if (!usedIds.has(baseId)) {
    usedIds.add(baseId)
    return baseId
  }

  const id = `${baseId}-${hash(manifestPath)}`
  usedIds.add(id)
  return id
}

function createTags(categoryKey, baseName) {
  const slug = normalizeKey(baseName)
  return Array.from(new Set([categoryKey, ...slug.split('-').filter(Boolean)]))
}

async function readManifestVersion() {
  try {
    const content = await fs.readFile(MANIFEST_PATH, 'utf8')
    const manifest = JSON.parse(content)
    return Number.isInteger(manifest.version) ? manifest.version : 1
  } catch {
    return 1
  }
}

async function readCategoryDirectories() {
  const entries = await fs.readdir(IMAGES_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
    .map((entry) => ({
      dirname: entry.name,
      key: normalizeKey(entry.name)
    }))
    .filter((entry) => entry.key)
}

async function readCategoryImages(categoryDir) {
  const categoryPath = path.join(IMAGES_DIR, categoryDir)
  const entries = await fs.readdir(categoryPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .filter((entry) => IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const parsed = path.parse(entry.name)
      return {
        name: entry.name,
        baseName: parsed.name,
        absolutePath: path.join(categoryPath, entry.name)
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

async function createWallpapers(category, usedIds) {
  const files = await readCategoryImages(category.dirname)
  const thumbnails = new Map()
  const images = []
  const usedGeneratedThumbPaths = new Set()

  for (const file of files) {
    if (isThumbnailName(file.baseName)) {
      thumbnails.set(getThumbnailBase(file.baseName).toLowerCase(), file)
      continue
    }

    images.push(file)
  }

  const wallpapers = []

  for (const file of images) {
    const url = toManifestPath(file.absolutePath)
    const thumbnail = thumbnails.get(file.baseName.toLowerCase())
    const generatedThumbnailPath = thumbnail ? undefined : getGeneratedThumbnailPath(file)
    const thumb = thumbnail ? toManifestPath(thumbnail.absolutePath) : toManifestPath(generatedThumbnailPath)
    const config = categoryConfigMap.get(category.key)

    if (generatedThumbnailPath) {
      usedGeneratedThumbPaths.add(generatedThumbnailPath)
      await syncGeneratedThumbnail(file.absolutePath, generatedThumbnailPath)
    }

    wallpapers.push({
      id: createWallpaperId(category.key, file.baseName, url, usedIds),
      title: humanize(file.baseName),
      thumb,
      url,
      type: 'image',
      ...(config?.color ? { color: config.color } : {}),
      tags: createTags(category.key, file.baseName)
    })
  }

  await cleanupGeneratedThumbnails(category.dirname, usedGeneratedThumbPaths)

  return wallpapers
}

function getCategoryLabel(categoryKey) {
  const config = categoryConfigMap.get(categoryKey)
  if (config) {
    return config.label
  }

  const label = humanize(categoryKey)
  return {
    'zh-CN': label,
    en: label
  }
}

function sortCategories(categories) {
  const order = new Map(BUILT_IN_CATEGORIES.map((category, index) => [category.key, index]))
  return categories.sort((a, b) => {
    const aOrder = order.get(a.key) ?? Number.MAX_SAFE_INTEGER
    const bOrder = order.get(b.key) ?? Number.MAX_SAFE_INTEGER

    if (aOrder !== bOrder) {
      return aOrder - bOrder
    }

    return a.key.localeCompare(b.key, 'en')
  })
}

async function createManifest() {
  const [version, directories] = await Promise.all([readManifestVersion(), readCategoryDirectories()])
  const usedIds = new Set()
  const categories = []

  for (const directory of sortCategories(directories)) {
    categories.push({
      key: directory.key,
      label: getCategoryLabel(directory.key),
      wallpapers: await createWallpapers(directory, usedIds)
    })
  }

  return {
    version,
    categories
  }
}

async function main() {
  const manifest = await createManifest()
  const content = `${JSON.stringify(manifest, null, 2)}\n`

  if (checkOnly) {
    const current = await fs.readFile(MANIFEST_PATH, 'utf8')
    const manifestOutOfDate = current !== content

    if (manifestOutOfDate) {
      console.error('wallpapers.json is out of date. Run `npm run generate` and commit the result.')
    }

    for (const error of thumbnailCheckErrors) {
      console.error(error)
    }

    if (manifestOutOfDate || thumbnailCheckErrors.length) {
      process.exitCode = 1
      return
    }

    console.log('wallpapers.json is up to date.')
    return
  }

  await fs.writeFile(MANIFEST_PATH, content)
  const total = manifest.categories.reduce((sum, category) => sum + category.wallpapers.length, 0)
  console.log(`Generated wallpapers.json with ${manifest.categories.length} categories and ${total} wallpapers.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
