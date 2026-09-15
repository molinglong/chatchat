import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { auth } from "@/lib/auth"
import { nanoid } from "nanoid"
import {
  UPLOAD_DIR,
  sanitizeUploadName,
  deleteUploadFile,
  collectReferencedUploadNames,
  sweepOrphanUploads,
} from "@/lib/uploads"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
// 上传体总大小:略大于单文件上限,避免多文件/表单元数据占位,但仍可被 Next.js 拒掉超大请求。
const MAX_REQUEST_SIZE = 12 * 1024 * 1024 // 12MB
// 孤儿文件保留时长:超过 24 小时且未被任何消息引用则清理
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000

// 真正允许的 MIME(只放图片)。不允许 text/* / html 防止上传恶意 HTML 被浏览器内联渲染造成 XSS。
const ALLOWED_IMAGE_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
])

/**
 * 用 magic bytes 嗅探真实文件类型,防止客户端篡改 Content-Type 上传 text/html 等可执行内容。
 * 只覆盖我们真正接受的几种图片格式。命中失败返回 null。
 */
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png"
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg"
  }
  // GIF: GIF87a / GIF89a
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x39 || buf[4] === 0x37) &&
    buf[5] === 0x61
  ) {
    return "image/gif"
  }
  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp"
  }
  return null
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 先看 Content-Length,在流被读取前拦截超限请求,避免大请求直接吃光内存。
  const contentLengthHeader = req.headers.get("content-length")
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
    return NextResponse.json(
      { error: `Request too large. Maximum is ${MAX_REQUEST_SIZE / 1024 / 1024}MB` },
      { status: 413 }
    )
  }

  const contentType = req.headers.get("content-type") ?? ""
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  // Validate size(单文件)
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 413 }
    )
  }

  // 把客户端声明的 MIME 与 magic-byte 嗅探结果交叉验证:
  // - 客户端声明必须命中白名单(防止 text/html 直接被上传)
  // - 真实字节必须能识别为图片(防止改 Content-Type 上传二进制恶意内容)
  const declared = file.type.toLowerCase()
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const sniffed = sniffImageMime(buffer)
  if (!ALLOWED_IMAGE_MIME.has(declared) || !sniffed) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "(unknown)"}` },
      { status: 415 }
    )
  }
  // 嗅探与声明不一致时,以嗅探为准(更可信);但拒绝声明为图片但字节不是图片的请求。
  const finalMime = sniffed

  // Generate unique filename(扩展名按嗅探结果固定,不再信任客户端声明)
  const extByMime: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
  }
  const ext = extByMime[finalMime] ?? ""
  const uniqueName = `${nanoid(12)}${ext}`

  // Ensure uploads directory exists
  const uploadDir = UPLOAD_DIR
  await mkdir(uploadDir, { recursive: true })

  // Write file to disk
  const filePath = path.join(uploadDir, uniqueName)
  await writeFile(filePath, buffer)

  // 顺手清理孤儿文件(上传了但从未发送、超过 24 小时未被引用的文件)
  sweepOrphanUploads(ORPHAN_MAX_AGE_MS).catch((err) => {
    console.error("[upload] Orphan sweep failed:", err)
  })

  return NextResponse.json({
    url: `/uploads/${uniqueName}`,
    name: file.name,
    type: finalMime,
    size: file.size,
  })
}

/**
 * 删除上传文件。仅允许删除"未被任何消息引用"的文件,
 * 已发送的附件文件需通过删除会话/消息级联清理。
 * Query: ?file=<​filename>
 */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const fileParam = searchParams.get("file")
  if (!fileParam) {
    return NextResponse.json({ error: "file query parameter is required" }, { status: 400 })
  }

  const name = sanitizeUploadName(fileParam)
  if (!name) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 })
  }

  // 已被消息引用的文件不允许单独删除(避免破坏历史消息展示)
  const referenced = await collectReferencedUploadNames()
  if (referenced.has(name)) {
    return NextResponse.json(
      { error: "File is referenced by a message and cannot be deleted" },
      { status: 409 }
    )
  }

  await deleteUploadFile(name)
  return NextResponse.json({ success: true })
}
