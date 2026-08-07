const SYSTEM_PROMPT = `You are Debunk, an assistant that settles casual arguments using only trustworthy sources instead of random internet noise.

You will receive a question plus a batch of raw web search results (title, url, content snippet for each).

Some of these results come from authoritative sources: major news outlets (Reuters, AP News, BBC), recognized category authorities (ESPN, Sky Sports, official sports federations for sports; Forbes, Bloomberg for wealth/business rankings; Nature, WHO, NASA, official science/health agencies for science; Encyclopaedia Britannica, official government or institutional sites for general facts/history).

Others are noise: forums, Reddit, Quora, social media, personal blogs, content farms, unverified wikis. Ignore those completely, even if they appear in the results, unless nothing authoritative is available.

Using ONLY the authoritative results:
- Answer the question directly and plainly.
- If the authoritative sources agree, mark it "Verified".
- If they conflict, or the fact changes over time (e.g. "currently richest"), mark it "Disputed" and briefly say why.
- If none of the results are from authoritative sources, mark it "Unclear" and say so honestly rather than guessing.

Respond with ONLY valid JSON, no markdown code fences, no extra text before or after, in exactly this shape:
{"verdict": "one direct sentence answering the question", "confidence": "Verified", "explanation": "2-3 short plain sentences of context", "sources": [{"name": "Source Name", "url": "https://..."}]}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const { query } = req.body || {};
  if (!query || !query.trim()) {
    res.status(400).json({ error: "Missing query" });
    return;
  }

  if (!process.env.TAVILY_API_KEY || !process.env.GROQ_API_KEY) {
    res.status(500).json({
      error: "Server is missing TAVILY_API_KEY or GROQ_API_KEY environment variables.",
    });
    return;
  }

  try {
    const searchRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "advanced",
        max_results: 8,
      }),
    });

    if (!searchRes.ok) {
      const t = await searchRes.text();
      res.status(502).json({ error: "Search failed", detail: t.slice(0, 300) });
      return;
    }

    const searchData = await searchRes.json();
    const results = (searchData.results || [])
      .map((r) => `SOURCE: ${r.title}\nURL: ${r.url}\nCONTENT: ${(r.content || "").slice(0, 600)}`)
      .join("\n\n");

    if (!results) {
      res.status(200).json({
        verdict: "Couldn't find any relevant results for that.",
        confidence: "Unclear",
        explanation: "Try rephrasing the question.",
        sources: [],
      });
      return;
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Question: ${query}\n\nSearch results:\n${results}` },
        ],
      }),
    });

    if (!groqRes.ok) {
      const t = await groqRes.text();
      res.status(502).json({ error: "AI synthesis failed", detail: t.slice(0, 300) });
      return;
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : raw);
    } catch {
      parsed = {
        verdict: raw.slice(0, 300) || "Couldn't parse a clean answer.",
        confidence: "Unclear",
        explanation: "",
        sources: [],
      };
    }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Unexpected server error", detail: String(e).slice(0, 300) });
  }
                            }
