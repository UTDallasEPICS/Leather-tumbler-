// Retired: the former unauthenticated push relay bypassed account authorization.
// Reintroduce only with server-owned device registration and delivery permissions.
import { NextResponse } from "next/server"
export async function POST() {
  return NextResponse.json({detail:"Push relay retired; use local notifications."},{status:410})
}
