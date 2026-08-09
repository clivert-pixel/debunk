export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Use GET"
    });
  }

  try {

    const googleUrl =
      "https://trends.google.com/trending/rss?geo=US";

    const response = await fetch(googleUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        "Accept":
          "application/rss+xml, application/xml, text/xml, */*"
      }
    });

    if (!response.ok) {

      console.error(
        "Google Trends error:",
        response.status
      );

      return res.status(502).json({
        error: "Google Trends unavailable"
      });

    }

    const xml = await response.text();

    if (!xml || xml.length < 100) {

      return res.status(502).json({
        error: "Empty Google Trends response"
      });

    }


    /* -----------------------------
       EXTRACT TREND TITLES
    ----------------------------- */

    const trends = [];

    const titleRegex =
      /<title>([\s\S]*?)<\/title>/gi;

    let match;

    while ((match = titleRegex.exec(xml)) !== null) {

      const title =
        match[1]
          .replace(/<!\[CDATA\[/g, "")
          .replace(/\]\]>/g, "")
          .trim();

      /*
        Skip the RSS channel title.
      */

      if (
        title &&
        title !== "Daily Search Trends"
      ) {

        trends.push(title);

      }

    }


    /* -----------------------------
       REMOVE DUPLICATES
    ----------------------------- */

    const uniqueTrends =
      [...new Set(trends)]
        .slice(0, 20);


    /* -----------------------------
       FALLBACK
    ----------------------------- */

    if (uniqueTrends.length === 0) {

      return res.status(200).json({

        trends: [
          "Cristiano Ronaldo vs Messi",
          "Android vs iPhone",
          "Latest football news",
          "New movie releases",
          "AI news"
        ],

        suggestions: [
          "Cristiano Ronaldo vs Messi",
          "Android vs iPhone",
          "Who is the best football player?",
          "What is trending today?",
          "Latest AI news"
        ]

      });

    }


    /* -----------------------------
       CREATE CLICKABLE SUGGESTIONS
    ----------------------------- */

    const suggestions =
      uniqueTrends
        .slice(0, 8)
        .map(
          trend =>
            `What is actually true about ${trend}?`
        );


    /* -----------------------------
       RESPONSE
    ----------------------------- */

    return res.status(200).json({

      trends: uniqueTrends,

      suggestions

    });


  } catch (error) {

    console.error(
      "Trends API error:",
      error
    );


    /*
      IMPORTANT:
      Never leave the frontend
      loading forever.
    */

    return res.status(200).json({

      trends: [
        "Cristiano Ronaldo vs Messi",
        "Android vs iPhone",
        "Latest football news",
        "New movie releases",
        "AI news"
      ],

      suggestions: [
        "Cristiano Ronaldo vs Messi",
        "Android vs iPhone",
        "Who is the best football player?",
        "What is trending today?",
        "Latest AI news"
      ]

    });

  }

}
