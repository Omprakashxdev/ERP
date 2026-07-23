import { createGroq, type GroqProvider } from "@ai-sdk/groq";

let _groq: GroqProvider | null = null;

function getGroqClient(): GroqProvider {
  if (_groq) return _groq;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not configured. Set it in your environment variables."
    );
  }
  _groq = createGroq({ apiKey });
  return _groq;
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
}

export function getGroqChatModel() {
  return getGroqClient()(getGroqModel());
}
