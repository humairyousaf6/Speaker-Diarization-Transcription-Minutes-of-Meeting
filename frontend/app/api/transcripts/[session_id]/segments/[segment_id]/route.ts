import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ session_id: string; segment_id: string }> },
) {
  const { session_id, segment_id } = await context.params;
  const body = await request.json();

  const response = await fetch(`http://localhost:8000/transcripts/${session_id}/segments/${segment_id}`, {
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
