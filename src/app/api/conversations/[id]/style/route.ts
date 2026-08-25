import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const rawOffset = body?.styleOffset
  if (
    typeof rawOffset !== "number" ||
    !Number.isFinite(rawOffset) ||
    rawOffset < 0 ||
    rawOffset > 100
  ) {
    return NextResponse.json(
      { error: "Invalid style offset. Must be between 0 and 100." },
      { status: 400 }
    )
  }

  const styleOffset = Math.round(rawOffset)
  const conversation = await prisma.conversation.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: { styleOffset },
  })

  if (conversation.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true, styleOffset })
}
