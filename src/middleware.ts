import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

// 启动期硬校验:next-auth 在 AUTH_SECRET 缺失时会静默用 undefined 签名,
// 所有 cookie 都校验失败 → 全站 401。这里强制 fail-fast。
if (!process.env.AUTH_SECRET) {
  throw new Error(
    "AUTH_SECRET is required. Set it in .env (see .env.example) before starting the server."
  )
}

const AUTH_SECRET = process.env.AUTH_SECRET

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: AUTH_SECRET })
  const isLoggedIn = !!token
  const { pathname } = req.nextUrl

  // Public routes — always allow
  // 注意:精确匹配 /api/auth 与前缀 /api/auth/,防止 /api/auth-evil 之类的旁路。
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/test-toast"

  if (isPublic) {
    // Keep auth pages reachable so a stale JWT after a database restore can be replaced.
    return NextResponse.next()
  }

  // Protected routes — require auth
  if (!isLoggedIn) {
    // API 路由必须返回 JSON,浏览器 fetch 才会拿到结构化错误并正确 toast;
    // 走 HTML 重定向会导致客户端 JSON.parse 抛 SyntaxError。
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
}

export const config = {
  // 排除 _next 静态资源、_next/image 优化端点、favicon 与 _next/data RSC payload。
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico).*)"],
}
