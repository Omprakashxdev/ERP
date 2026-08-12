import { createOpenAI } from "@ai-sdk/openai";

let _client: ReturnType<typeof createOpenAI> | null = null;

function getClient() {
  if (_client) return _client;
  const baseURL = process.env.OMNIROUTE_BASE_URL ?? "http://localhost:20128/v1";
  const apiKey = process.env.OMNIROUTE_API_KEY ?? "omniroute";
  _client = createOpenAI({ baseURL, apiKey });
  return _client;
}

export function getChatModel() {
  const model = process.env.OMNIROUTE_MODEL ?? "auto";
  return getClient().chat(model);
}
