import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ session_id: string }> },
) {
  const { session_id } = await context.params;
  const response = await fetch(`http://localhost:8000/transcripts/${session_id}`, {
    method: "GET",
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(data);
}
