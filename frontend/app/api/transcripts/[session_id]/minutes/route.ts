import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ session_id: string }> },
) {
  const { session_id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const response = await fetch(`http://localhost:8000/transcripts/${session_id}/minutes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ session_id: string }> },
) {
  const { session_id } = await context.params;
  const body = await request.json();

  const response = await fetch(`http://localhost:8000/transcripts/${session_id}/minutes`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(data);
}
