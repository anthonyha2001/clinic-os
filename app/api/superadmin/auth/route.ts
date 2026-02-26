import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const SUPERADMIN_PIN = process.env.SUPERADMIN_PIN ?? "clinic-super-2024";
const TOKEN = "sa_authenticated";

export async function POST(request: NextRequest) {
  const { pin } = await request.json();
  if (pin !== SUPERADMIN_PIN) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sa_token", TOKEN, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("sa_token");
  return res;
}