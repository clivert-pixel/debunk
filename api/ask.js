const SYSTEM_PROMPT = `You are Debunk, an assistant that settles casual arguments using trustworthy sources.

You will receive a question plus raw web search results. Each result contains a title, URL, and content snippet.

AUTHORITATIVE SOURCES include:
- Reuters, AP News, BBC and other major reputable news organizations
- Official government and institutional websites
- Official sports federations, leagues, and clubs
- ESPN and Sky Sports for sports
- Forbes and Bloomberg for wealth/business rankings
- Nature, WHO, NASA and recognized scientific/health institutions
- Encyclopaedia Britannica for general facts/history

UNRELIABLE SOURCES include:
- Reddit
- Quora
- Forums
- Social media
- Personal blogs
- Content farms
- Unverified wikis
- Random websites with no clear authority

Use authoritative sources whenever they are available. Ignore unreliable sources.

RULES:
1. Answer the question directly and plainly.
2. If authoritative sources agree, set confidence to "Verified".
3. If authoritative sources conflict, or the answer changes over time, set confidence to "Disputed".
4. If there are no trustworthy sources available, set confidence to "Unclear".
5. Never invent facts or sources.
6. Only include sources that actually appeared in the supplied search results.
7. Return exactly 3 short related follow-up questions.
8. Return ONLY valid JSON. No markdown and no extra text.

Return exactly this structure:
{
  "verdict": "one direct sentence answering the question",
  "confidence": "Verified",
  "explanation": "2-3 short plain sentences explaining the answer",
  "sources": [
    {
      "name": "Source Name",
      "url": "https://example.com"
    }
  ],
  "related": [
    "related question 1",
    "related question 2",
    "related question 3"
  ]
}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Use POST"
    });
  }

  const { query } = req.body || {};

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({
      error: "Missing query"
    });
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!tavilyKey || !groqKey) {
    return res.status(500).json({
      error: "Server is missing TAVILY_API_KEY or GROQ_API_KEY environment variables."
    });
  }

  try {
    // -----------------------------
    // 1. SEARCH TAVILY
    // -----------------------------
    const searchRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: query.trim(),
        search_depth: "advanced",
        max_results: 8,
        include_answer: false
      })
    });

    if (!searchRes.ok) {
      const errorText = await searchRes.text();

      console.error("Tavily error:", searchRes.status, errorText);

      return res.status(502).json({
        error: "Search failed",
        status: searchRes.status,
        detail: errorText.slice(0, 500)
      });
    }

    const searchData = await searchRes.json();

    const rawResults = Array.isArray(searchData.results)
      ? searchData.results
      : [];

    if (rawResults.length === 0) {
      return res.status(200).json({
        verdict: "I couldn't find reliable sources for that question.",
        confidence: "Unclear",
        explanation: "Tavily returned no relevant search results. Try rephrasing the question.",
        sources: [],
        related: [
          "What is the evidence for this?",
          "What do reliable sources say?",
          "Is there another way to verify this?"
        ]
      });
    }

    // Keep the search results compact before sending them to Groq.
    const results = rawResults
      .map((r, index) => {
        return [
          `RESULT ${index + 1}`,
          `TITLE: ${r.title || "Untitled"}`,
          `URL: ${r.url || ""}`,
          `CONTENT: ${(r.content || "").slice(0, 1000)}`
        ].join("\n");
      })
      .join("\n\n");

    // -----------------------------
    // 2. SEND RESULTS TO GROQ
    // -----------------------------
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT
            },
            {
              role: "user",
              content: `Question: ${query.trim()}

Search results:
${results}`
            }
          ],
          response_format: {
            type: "json_object"
          }
        })
      }
    );

    if (!groqRes.ok) {
      const errorText = await groqRes.text();

      console.error("Groq error:", groqRes.status, errorText);

      return res.status(502).json({
        error: "AI synthesis failed",
        status: groqRes.status,
        detail: errorText.slice(0, 500)
      });
    }

    const groqData = await groqRes.json();

    const raw =
      groqData.choices?.[0]?.message?.content || "";

    if (!raw) {
      return res.status(502).json({
        error: "AI returned an empty response"
      });
    }

    // -----------------------------
    // 3. PARSE AI RESPONSE
    // -----------------------------
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("JSON parse error:", raw);

      return res.status(502).json({
        error: "AI returned invalid JSON",
        detail: raw.slice(0, 500)
      });
    }

    // -----------------------------
    // 4. VALIDATE RESPONSE
    // -----------------------------
    const confidenceValues = [
      "Verified",
      "Disputed",
      "Unclear"
    ];

    if (!confidenceValues.includes(parsed.confidence)) {
      parsed.confidence = "Unclear";
    }

    if (typeof parsed.verdict !== "string") {
      parsed.verdict = "I couldn't determine a reliable answer.";
    }

    if (typeof parsed.explanation !== "string") {
      parsed.explanation = "";
    }

    if (!Array.isArray(parsed.sources)) {
      parsed.sources = [];
    }

    if (!Array.isArray(parsed.related)) {
      parsed.related = [];
    }

    parsed.related = parsed.related
      .filter((q) => typeof q === "string")
      .slice(0, 3);

    return res.status(200).json(parsed);

  } catch (error) {
    console.error("Unexpected server error:", error);

    return res.status(500).json({
      error: "Unexpected server error",
      detail: String(error).slice(0, 500)
    });
  }
    }
