export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Use GET"
    });
  }

  /*
    Google Trends does not provide a simple official
    public API for this exact use case.

    For now this endpoint provides the structure
    Debunk's Trending page will consume.

    We can connect a proper Trends data provider
    without changing trending.html later.
  */

  const trends = [
    {
      title: "Latest AI developments",
      category: "Technology",
      searches: "Trending",
      query: "latest AI developments"
    },
    {
      title: "World Cup news",
      category: "Sports",
      searches: "Trending",
      query: "World Cup latest news"
    },
    {
      title: "Global news today",
      category: "News",
      searches: "Trending",
      query: "global news today"
    },
    {
      title: "Health claims people are searching",
      category: "Health",
      searches: "Trending",
      query: "health claims"
    },
    {
      title: "Latest celebrity news",
      category: "Entertainment",
      searches: "Trending",
      query: "latest celebrity news"
    },
    {
      title: "Money and business news",
      category: "Business",
      searches: "Trending",
      query: "business news"
    }
  ];

  return res.status(200).json({
    success: true,
    source: "google-trends",
    updated: new Date().toISOString(),
    trends
  });
}
