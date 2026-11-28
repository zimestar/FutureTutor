import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  ASSISTANT_MAX_HISTORY_MESSAGES,
  ASSISTANT_MAX_HISTORY_MESSAGE_CHARS,
  ASSISTANT_MAX_IMAGE_BASE64_CHARS,
  ASSISTANT_MAX_OUTPUT_TOKENS,
  ASSISTANT_MAX_QUESTION_CHARS,
  ASSISTANT_MODEL,
  isAssistantConfigured,
} from "@/lib/assistant/config";
import { assistantSystemPrompt } from "@/lib/assistant/systemPrompt";
import { resolveAssistantAudience } from "@/lib/assistant/access";
import { completeQuestion, reserveQuestion } from "@/services/assistantQuota";
import { refreshIkaPlanIfStale } from "@/services/ikaBilling";

/**
 * Ika — FutureTutor's AI assistant. POST { locale, question, history, image? }.
 * Response: newline-delimited JSON events —
 *   {"type":"text","text":"…"}            streamed answer text
 *   {"type":"done","remaining":7}         answer complete (questions left, all allowances)
 *   {"type":"refused"} / {"type":"error","code":"…"}
 * Parents and approved tutors only; each question is reserved against the
 * allowance (free, Ika+, credits) before the model is called and released if
 * no answer was delivered. Neither the question, the photo nor the answer is
 * stored.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  locale: z.enum(["fr", "en"]),
  question: z.string().trim().max(ASSISTANT_MAX_QUESTION_CHARS).default(""),
  /** A photo of the homework, resized in the browser; sent to the model, never stored. */
  image: z
    .object({
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      data: z.string().min(100).max(ASSISTANT_MAX_IMAGE_BASE64_CHARS).regex(/^[A-Za-z0-9+/]+=*$/),
    })
    .optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(ASSISTANT_MAX_HISTORY_MESSAGE_CHARS) }))
    .max(ASSISTANT_MAX_HISTORY_MESSAGES * 2)
    .default([]),
}).refine((body) => body.question.length > 0 || body.image, { message: "EMPTY" });

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers may omit it; cookies are SameSite=Lax
  try {
    return new URL(origin).host === new URL(request.url).host || new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** Keep the most recent turns, starting with a user turn and alternating. */
function trimHistory(history: { role: "user" | "assistant"; text: string }[]) {
  const recent = history.filter((m) => m.text.trim()).slice(-ASSISTANT_MAX_HISTORY_MESSAGES);
  while (recent.length && recent[0].role !== "user") recent.shift();
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of recent) {
    if (out.length && out[out.length - 1].role === m.role) continue;
    out.push({ role: m.role, content: m.text });
  }
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

/** The new question: the photo first (when there is one), then the text. */
function userContent(
  locale: "fr" | "en",
  question: string,
  image?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }
): Anthropic.Beta.BetaMessageContentParam {
  if (!image) return question;
  const text = question || (locale === "fr" ? "Voici une photo de l'exercice. Explique-le étape par étape." : "Here is a photo of the exercise. Explain it step by step.");
  return [
    { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
    { type: "text", text },
  ];
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "FORBIDDEN" }, 403);
  const session = await auth();
  const user = session?.user;
  if (!user) return json({ error: "UNAUTHORIZED" }, 401);
  const audience = await resolveAssistantAudience(user);
  if (!audience) return json({ error: "FORBIDDEN" }, 403);
  if (!isAssistantConfigured()) return json({ error: "NOT_CONFIGURED" }, 503);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "INVALID_REQUEST" }, 400);
  const { locale, question, history, image } = parsed.data;

  await refreshIkaPlanIfStale(user.id);
  const reservation = await reserveQuestion(user.id, ASSISTANT_MODEL, audience, new Date(), { hasImage: Boolean(image) });
  if (!reservation.ok) return json({ error: "QUOTA_EXHAUSTED" }, 429);

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, event: unknown) =>
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

  const body = new ReadableStream({
    async start(controller) {
      let delivered = false;
      try {
        const stream = client.beta.messages.stream(
          {
            model: ASSISTANT_MODEL,
            max_tokens: ASSISTANT_MAX_OUTPUT_TOKENS,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "medium" },
            system: [{ type: "text", text: assistantSystemPrompt(locale, audience), cache_control: { type: "ephemeral" } }],
            messages: [...trimHistory(history), { role: "user", content: userContent(locale, question, image) }],
          },
          { signal: request.signal }
        );
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            delivered = true;
            send(controller, { type: "text", text: event.delta.text });
          }
        }
        const message = await stream.finalMessage();
        const usage = {
          inputTokens: message.usage.input_tokens ?? 0,
          outputTokens: message.usage.output_tokens ?? 0,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        };
        if (message.stop_reason === "refusal") {
          await completeQuestion(reservation.usageId, "REFUSED", usage);
          send(controller, { type: "refused", remaining: reservation.allowanceAfter.total + 1 });
        } else {
          await completeQuestion(reservation.usageId, delivered ? "COMPLETED" : "FAILED", usage);
          send(controller, { type: "done", remaining: delivered ? reservation.allowanceAfter.total : reservation.allowanceAfter.total + 1 });
        }
      } catch (error) {
        // Nothing useful was delivered: give the question back.
        await completeQuestion(reservation.usageId, "FAILED").catch(() => undefined);
        const code = error instanceof Anthropic.RateLimitError ? "BUSY" : error instanceof Anthropic.APIError ? "UPSTREAM" : "FAILED";
        if (!request.signal.aborted) {
          console.error("[assistant] request failed", code, error instanceof Anthropic.APIError ? error.status : "");
          try {
            send(controller, { type: "error", code });
          } catch {
            /* stream already closed */
          }
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
