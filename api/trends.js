export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Use GET"
    });
  }

  try {

    /*
      Google Trends does not provide a simple
      unrestricted official public API.

      For now this endpoint uses Google's public
      Trends RSS feed to retrieve current trending
      searches.
    */

    const response = await fetch(
      "https://trends.google.com/trending/rss?geo=US"
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "Could not fetch trending searches"
      });
    }

    const xml = await response.text();

    /*
      Extract RSS item titles.
    */

    const matches = [
      ...xml.matchAll(
        /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/gi
      )
    ];

    const trends = matches
      .map(match =>
        match[1]
          .replace(/<!\[CDATA\[/g, "")
          .replace(/\]\]>/g, "")
          .trim()
      )
      .filter(Boolean)
      .slice(0, 20);


    /*
      Turn trending topics into questions
      that fit Debunk's purpose.
    */

    const suggestions = trends.map(topic => {

      return `What is actually true about ${topic}?`;

    });


    return res.status(200).json({

      trends,

      suggestions

    });

  } catch (error) {

    console.error(
      "Trends error:",
      error
    );

    return res.status(500).json({
      error: "Failed to load trends"
    });

  }

}
