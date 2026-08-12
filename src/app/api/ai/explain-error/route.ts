import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateText } from "ai";
import { getChatModel } from "@/lib/ai/openrouter";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { error, context } = body as { error: string; context?: string };

    if (!error || typeof error !== "string") {
      return NextResponse.json(
        { success: false, error: "Error message is required" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a helpful ERP system assistant. A user encountered an error while using the ERP system. Explain the error in simple, non-technical language and suggest how to fix it. Keep your response concise (2-3 sentences max). Do not use markdown formatting.`;

    const userPrompt = `Error encountered: "${error}"${context ? `\nContext: ${context}` : ""}\n\nExplain this error and suggest a fix in simple language:`;

    const { text } = await generateText({
      model: getChatModel(),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
      maxOutputTokens: 200,
    });

    return NextResponse.json({ success: true, explanation: text.trim() });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to get AI explanation" },
      { status: 500 }
    );
  }
}
