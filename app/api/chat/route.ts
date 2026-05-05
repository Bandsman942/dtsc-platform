import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { chatRequestSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";
import {
  createOpenAIResponseStream,
  estimateCost,
  getOpenAIModel,
  type OpenAIInputMessage,
} from "@/lib/openai";
import { truncate } from "@/lib/format";
import { getAppSettings } from "@/lib/settings";

export const maxDuration = 60;

function parseOpenAIEvent(block: string) {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("");

  if (!data || data === "[DONE]") {
    return null;
  }

  return JSON.parse(data) as {
    type?: string;
    delta?: string;
    response?: {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
    };
  };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = rateLimit(`chat:${session.userId}`, 30, 60 * 60 * 1000);
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "Usage limit reached. Please try again later." },
      { status: 429 }
    );
  }

  const body = chatRequestSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid chat request" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true, dailyMessageLimit: true, dailyTokenLimit: true },
  });

  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Account unavailable" }, { status: 403 });
  }

  const settings = await getAppSettings();
  if (!settings.chatbotEnabled || settings.maintenanceMode) {
    return NextResponse.json({ error: "Chatbot temporarily disabled" }, { status: 503 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [messagesToday, tokensToday] = await Promise.all([
    prisma.message.count({
      where: { userId: session.userId, role: "user", createdAt: { gte: today } },
    }),
    prisma.usageLog.aggregate({
      where: { userId: session.userId, createdAt: { gte: today } },
      _sum: { totalTokens: true },
    }),
  ]);

  const totalTokensToday = tokensToday._sum.totalTokens ?? 0;
  if (messagesToday >= user.dailyMessageLimit || totalTokensToday >= user.dailyTokenLimit) {
    return NextResponse.json(
      {
        error: "Daily usage limit reached",
        code: "DAILY_LIMIT_REACHED",
        usage: {
          messagesToday,
          dailyMessageLimit: user.dailyMessageLimit,
          tokensToday: totalTokensToday,
          dailyTokenLimit: user.dailyTokenLimit,
        },
      },
      { status: 429 }
    );
  }

  const model = getOpenAIModel(body.data.model);
  const conversation = body.data.conversationId
    ? await prisma.conversation.findFirst({
        where: { id: body.data.conversationId, userId: session.userId },
      })
    : await prisma.conversation.create({
        data: {
          userId: session.userId,
          title: truncate(body.data.content.replace(/\s+/g, " "), 72),
        },
      });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: session.userId,
      role: "user",
      content: body.data.content,
      model,
    },
  });

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 24,
  });

  const messages: OpenAIInputMessage[] = history.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  let openAIStream: ReadableStream<Uint8Array>;
  try {
    openAIStream = await createOpenAIResponseStream({ model, messages });
  } catch (error) {
    console.error("OpenAI response failed", error);
    return NextResponse.json(
      { error: "Unable to generate the assistant response." },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = openAIStream.getReader();
      let buffer = "";
      let assistantContent = "";
      let usage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            const event = parseOpenAIEvent(block);
            if (!event) {
              continue;
            }

            if (event.type === "response.output_text.delta" && event.delta) {
              assistantContent += event.delta;
              controller.enqueue(encoder.encode(event.delta));
            }

            if (event.type === "response.completed" && event.response?.usage) {
              usage = {
                inputTokens: event.response.usage.input_tokens ?? 0,
                outputTokens: event.response.usage.output_tokens ?? 0,
                totalTokens: event.response.usage.total_tokens ?? 0,
              };
            }
          }
        }

        if (assistantContent.trim()) {
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: assistantContent,
              model,
              tokensUsed: usage.totalTokens || null,
            },
          });

          await prisma.usageLog.create({
            data: {
              userId: session.userId,
              conversationId: conversation.id,
              model,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
              estimatedCost: estimateCost(),
            },
          });

          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() },
          });
        }
      } catch (error) {
        console.error("Streaming failed", error);
        controller.enqueue(
          encoder.encode(
            "\n\nUne erreur est survenue pendant la génération. Veuillez réessayer."
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Conversation-Id": conversation.id,
    },
  });
}
