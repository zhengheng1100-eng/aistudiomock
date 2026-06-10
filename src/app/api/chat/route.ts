import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model, webSearch } = body;

    const apiKey =
      process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured. Set GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable.' },
        { status: 500 }
      );
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // Convert messages to Gemini format with support for inline_data (images/files)
    const contents = messages.map((msg: { role: string; content: string; attachments?: { mimeType: string; data: string; name: string }[] }) => {
      const parts: unknown[] = [];

      // Add text content if present
      if (msg.content) {
        parts.push({ text: msg.content });
      }

      // Add attachments as inline_data
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          parts.push({
            inline_data: {
              mime_type: att.mimeType,
              data: att.data,
            },
          });
        }
      }

      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    const requestBody: Record<string, unknown> = { contents };

    if (webSearch) {
      requestBody.tools = [
        {
          google_search: {},
        },
      ];
    }

    console.log(`Calling Gemini API: model=${model}, webSearch=${webSearch}, parts count:`, contents.length);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google AI API error:', response.status, errorText);

      let userMessage = `API error: ${response.status}`;
      if (response.status === 503) {
        userMessage =
          'Service temporarily unavailable for this model. Please try again in a moment, or switch to a different model like "Gemini 2.5 Flash" or "Gemini 3 Flash Preview".';
      } else if (response.status === 429) {
        userMessage =
          'Rate limited. This model requires Early Access quota in Google AI Studio. Please switch to another model, or apply for Early Access at: https://aistudio.google.com/app/apikey';
      }

      return NextResponse.json({ error: userMessage }, { status: response.status });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'No response body' }, { status: 500 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.slice(6);
                try {
                  const data = JSON.parse(jsonStr);
                  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    controller.enqueue(encoder.encode(text));
                  }
                } catch {
                  // Skip malformed JSON
                }
              }
            }
          }
        } catch (err) {
          console.error('Stream error:', err);
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}