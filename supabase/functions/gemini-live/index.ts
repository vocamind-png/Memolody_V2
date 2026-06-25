import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

serve(async (req: Request) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set in environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  const { socket: clientWs, response } = Deno.upgradeWebSocket(req);

  // Connect to Gemini
  const targetUrl = `${GEMINI_WS_URL}?key=${GEMINI_API_KEY}`;
  const geminiWs = new WebSocket(targetUrl);

  // Buffer messages from client if Gemini WS is not yet open
  const clientMessageQueue: any[] = [];
  
  geminiWs.onopen = () => {
    console.log("Connected to Gemini API");
    // Send any queued messages
    while (clientMessageQueue.length > 0) {
      const msg = clientMessageQueue.shift();
      geminiWs.send(msg);
    }
  };

  geminiWs.onmessage = (event) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(event.data);
    }
  };

  geminiWs.onerror = (e) => {
    console.error("Gemini WS Error", e);
  };

  geminiWs.onclose = () => {
    console.log("Gemini WS Closed");
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  };

  // Client WS handlers
  clientWs.onopen = () => {
    console.log("Client connected to proxy");
  };

  clientWs.onmessage = (event) => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(event.data);
    } else {
      clientMessageQueue.push(event.data);
    }
  };

  clientWs.onclose = () => {
    console.log("Client WS closed");
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  };

  clientWs.onerror = (e) => {
    console.error("Client WS Error", e);
  };

  return response;
});
