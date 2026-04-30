// Client-side image resize. Phone photos are routinely 5-15 MB at 4032x3024 —
// far larger than any avatar/banner needs. We scale down before upload so the
// user never has to think about file size.

type ResizeOptions = {
  // Cap on the longest side (width or height) in pixels.
  maxDim: number
  // Output MIME. Defaults to image/jpeg unless the input is image/png and
  // alpha must be preserved (favicon).
  mime?: 'image/jpeg' | 'image/png' | 'image/webp'
  // JPEG/WebP quality 0..1. Ignored for PNG.
  quality?: number
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = url
  })
}

export async function resizeImage(
  file: File,
  { maxDim, mime = 'image/jpeg', quality = 0.9 }: ResizeOptions
): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const longest = Math.max(img.width, img.height)
    const ratio = longest > maxDim ? maxDim / longest : 1

    // Already small enough AND already the desired MIME — just return the
    // original bytes to preserve quality (no re-encode round-trip).
    if (ratio === 1 && file.type === mime) {
      return file
    }

    const w = Math.round(img.width * ratio)
    const h = Math.round(img.height * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')

    // For JPEG output, paint a white background so transparent PNGs don't
    // composite onto black.
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(img, 0, 0, w, h)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
        mime,
        quality
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Per-slot defaults. Avatars are rendered at most 80px in the profile hero
// (160px on retina); 512 is generous headroom. Banners reach ~1200px wide on
// large desktop screens; 1600 covers retina with margin.
export const SLOT_RESIZE: Record<
  'avatar' | 'banner' | 'favicon',
  ResizeOptions
> = {
  avatar: { maxDim: 512, mime: 'image/jpeg', quality: 0.9 },
  banner: { maxDim: 1600, mime: 'image/jpeg', quality: 0.85 },
  favicon: { maxDim: 128, mime: 'image/png' },
}
