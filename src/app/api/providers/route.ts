import { NextResponse } from "next/server"
import { providers } from "@/lib/ai/registry"

/**
 * GET /api/providers
 * Returns the list of registered AI providers with their metadata.
 */
export async function GET() {
  const list = Object.values(providers).map((p) => ({
    id: p.id,
    name: p.name,
    models: p.models.map((m) => m.id),
  }))
  return NextResponse.json(list)
}
