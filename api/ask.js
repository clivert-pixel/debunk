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

Use authoritative sources whenever they are available.

RULES:

1. Answer the question directly and plainly.
2. Compare multiple sources before deciding.
3. If authoritative sources agree, set confidence to "Verified".
4. If authoritative sources conflict, or the answer changes over time, set confidence to "Disputed".
5. If there are no trustworthy sources available, set confidence to "Unclear".
6. Never invent facts.
7. Never invent sources.
8. Only include sources that actually appeared in the supplied search results.
9. Prefer sources that directly support the verdict.
10. Return exactly 3 short related follow-up questions.
11. Return ONLY valid JSON.

Return exactly this structure:

{
  "verdict": "one direct sentence answering the question",
  "confidence": "Verified",
  "explanation": "2-3 short plain sentences explaining the answer using the evidence",
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

  /* -----------------------------
     METHOD CHECK
  ----------------------------- */

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Use POST"
    });

  }


  /* -----------------------------
     GET QUESTION
  ----------------------------- */

  const { query } = req.body || {};

  if (
    !query ||
    typeof query !== "string" ||
    !query.trim()
  ) {

    return res.status(400).json({
      error: "Missing query"
    });

  }


  const cleanQuery = query.trim();


  /* -----------------------------
     ENVIRONMENT VARIABLES
  ----------------------------- */

  const tavilyKey =
    process.env.TAVILY_API_KEY;

  const groqKey =
    process.env.GROQ_API_KEY;


  if (!tavilyKey || !groqKey) {

    return res.status(500).json({
      error:
        "Server is missing TAVILY_API_KEY or GROQ_API_KEY."
    });

  }


  try {

    /* -----------------------------
       1. TAVILY SEARCH
    ----------------------------- */

    const searchRes = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({

  api_key: tavilyKey,

  query: cleanQuery,

  search_depth: "advanced",

  max_results: 8,

  include_answer: false,

  include_raw_content: false,

  include_images: true

})
      }
    );


    if (!searchRes.ok) {

      const errorText =
        await searchRes.text();

      console.error(
        "Tavily error:",
        searchRes.status,
        errorText
      );

      return res.status(502).json({
        error: "Search failed",
        status: searchRes.status
      });

    }


    const searchData =
      await searchRes.json();


    const rawResults =
      Array.isArray(searchData.results)
        ? searchData.results
        : [];


    /* -----------------------------
       NO RESULTS
    ----------------------------- */

    if (rawResults.length === 0) {

      return res.status(200).json({

        verdict:
          "I couldn't find reliable sources for that question.",

        confidence:
          "Unclear",

        explanation:
          "The search did not return enough relevant evidence. Try rephrasing the question.",

        sources: [],

        related: [
          "What evidence supports this?",
          "What do reliable sources say?",
          "How can this be verified?"
        ]

      });

    }


    /* -----------------------------
       2. CLEAN SEARCH RESULTS
    ----------------------------- */

    const cleanedResults =
      rawResults
        .filter(result =>
          result &&
          typeof result.url === "string" &&
          result.url.trim()
        )
        .map((result, index) => {

          return {

            index: index + 1,

            title:
              result.title ||
              "Untitled source",

            url:
              result.url,

            content:
              (result.content || "")
                .slice(0, 1400)

          };

        });


    /* -----------------------------
       3. REMOVE DUPLICATE URLS
    ----------------------------- */

    const uniqueResults = [];

    const seenUrls =
      new Set();


    for (const result of cleanedResults) {

      const normalizedUrl =
        result.url
          .toLowerCase()
          .replace(/\/$/, "");


      if (seenUrls.has(normalizedUrl)) {
        continue;
      }


      seenUrls.add(normalizedUrl);

      uniqueResults.push(result);

    }


    /* -----------------------------
       4. PREPARE EVIDENCE
    ----------------------------- */

    const evidence =
      uniqueResults
        .slice(0, 8)
        .map(result => {

          return [
            `RESULT ${result.index}`,

            `TITLE: ${result.title}`,

            `URL: ${result.url}`,

            `CONTENT: ${result.content}`

          ].join("\n");

        })
        .join("\n\n");


    /* -----------------------------
       5. SEND EVIDENCE TO GROQ
    ----------------------------- */

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${groqKey}`

        },

        body: JSON.stringify({

          model:
            "llama-3.3-70b-versatile",

          temperature:
            0.2,

          messages: [

            {
              role: "system",

              content:
                SYSTEM_PROMPT
            },

            {
              role: "user",

              content:
                `Question:

${cleanQuery}

Search evidence:

${evidence}`
            }

          ],

          response_format: {
            type: "json_object"
          }

        })

      }
    );


    /* -----------------------------
       GROQ ERROR
    ----------------------------- */

    if (!groqRes.ok) {

      const errorText =
        await groqRes.text();

      console.error(
        "Groq error:",
        groqRes.status,
        errorText
      );

      return res.status(502).json({
        error: "AI synthesis failed",
        status: groqRes.status
      });

    }


    const groqData =
      await groqRes.json();


    const raw =
      groqData
        .choices?.[0]
        ?.message
        ?.content || "";


    if (!raw) {

      return res.status(502).json({
        error:
          "AI returned an empty response"
      });

    }


    /* -----------------------------
       6. PARSE GROQ JSON
    ----------------------------- */

    let parsed;


    try {

      parsed =
        JSON.parse(raw);

    } catch (error) {

      console.error(
        "Groq JSON error:",
        raw
      );

      return res.status(502).json({
        error:
          "AI returned invalid JSON"
      });

    }


    /* -----------------------------
       7. VALIDATE CONFIDENCE
    ----------------------------- */

    const confidenceValues = [
      "Verified",
      "Disputed",
      "Unclear"
    ];


    if (
      !confidenceValues
        .includes(parsed.confidence)
    ) {

      parsed.confidence =
        "Unclear";

    }


    /* -----------------------------
       8. VALIDATE VERDICT
    ----------------------------- */

    if (
      typeof parsed.verdict !==
      "string"
    ) {

      parsed.verdict =
        "I couldn't determine a reliable answer.";

    }


    /* -----------------------------
       9. VALIDATE EXPLANATION
    ----------------------------- */

    if (
      typeof parsed.explanation !==
      "string"
    ) {

      parsed.explanation = "";

    }


    /* -----------------------------
       10. VALIDATE SOURCES
    ----------------------------- */

    if (
      !Array.isArray(parsed.sources)
    ) {

      parsed.sources = [];

    }


    /*
      Only allow sources that
      actually came from Tavily.
    */

    const allowedUrls =
      new Set(
        uniqueResults.map(
          result => result.url
        )
      );


    parsed.sources =
      parsed.sources
        .filter(source => {

          return (
            source &&
            typeof source.name ===
              "string" &&
            typeof source.url ===
              "string" &&
            allowedUrls.has(
              source.url
            )
          );

        })
        .slice(0, 8);


    /*
      If Groq returned no valid
      sources, use the best Tavily
      results instead.
    */

    if (
      parsed.sources.length === 0
    ) {

      parsed.sources =
        uniqueResults
          .slice(0, 5)
          .map(result => ({

            name:
              result.title,

            url:
              result.url

          }));

    }


    /* -----------------------------
       11. VALIDATE RELATED
    ----------------------------- */

    if (
      !Array.isArray(parsed.related)
    ) {

      parsed.related = [];

    }


    parsed.related =
      parsed.related
        .filter(
          question =>
            typeof question ===
            "string"
        )
        .slice(0, 3);


    /*
      Always give the frontend
      exactly 3 related questions.
    */

    const fallbackRelated = [

      "What evidence supports this?",

      "What do reliable sources say?",

      "How can this be verified?"

    ];


    while (
      parsed.related.length < 3
    ) {

      const fallback =
        fallbackRelated[
          parsed.related.length
        ];

      if (
        !parsed.related.includes(
          fallback
        )
      ) {

        parsed.related.push(
          fallback
        );

      } else {

        break;

      }

    }


    /* -----------------------------
       12. RETURN FINAL RESULT
    ----------------------------- */

    return res.status(200).json({

  verdict:
    parsed.verdict,

  confidence:
    parsed.confidence,

  explanation:
    parsed.explanation,

  sources:
    parsed.sources,

  related:
    parsed.related.slice(0, 3),

  images:
    Array.isArray(searchData.images)
      ? searchData.images.slice(0, 8)
      : []

});

  } catch (error) {

    console.error(
      "Unexpected server error:",
      error
    );


    return res.status(500).json({

      error:
        "Unexpected server error",

      detail:
        String(error).slice(0, 500)

    });

  }

}
