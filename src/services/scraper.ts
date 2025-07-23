import * as cheerio from "cheerio";
import fetch from "node-fetch"; // If Node.js < 18, or for explicit import
import { Article, RssItem } from "../types.js";



export async function scrapeFranceInfoArticle(rssItem: RssItem): Promise<Article> {
  try {
    // 1. Fetch the HTML content
    const response = await fetch(rssItem.link);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${rssItem.link}: ${response.statusText}`);
    }

    const html = await response.text();

    // 2. Load the HTML into Cheerio
    const $ = cheerio.load(html);

    let article: Article;

    // 3. Use Cheerio selectors to find and extract data
    const text = $("article .c-body").first().text().trim();
    article = {
        title: rssItem.title,
        description: rssItem.description || "No description available.",
        text: text || "No content available.",
    }

    return article;
  } catch (error) {
    console.error("Error during scraping:", error);
    return { title: "", description: "", text: "" };
  }
}

export async function scrapeWikipediaPage(searchTerm: string): Promise<string> {
  try {
    // 1. Search for the article using Wikipedia's OpenSearch API
    const searchResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchTerm)}&format=json`);
    
    if (!searchResponse.ok) {
      throw new Error(`Wikipedia search failed: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json() as [string, string[], string[], string[]];
    
    // OpenSearch returns [term, titles, descriptions, urls]
    if (!searchData[1] || searchData[1].length === 0) {
      return `No Wikipedia article found for "${searchTerm}".`;
    }

    const articleTitle = searchData[1][0]; // Get the first (most relevant) result
    const articleUrl = searchData[3][0]; // Get corresponding URL
    
    // 2. Get the article content using Wikipedia's API
    const contentResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(articleTitle)}&prop=extracts&exintro=1&explaintext=1&exsectionformat=plain`
    );

    if (!contentResponse.ok) {
      throw new Error(`Wikipedia content fetch failed: ${contentResponse.statusText}`);
    }

    const contentData = await contentResponse.json() as {
      query: {
        pages: {
          [key: string]: {
            extract?: string;
            title?: string;
          }
        }
      }
    };
    
    const pages = contentData.query.pages;
    const pageId = Object.keys(pages)[0];
    
    if (pageId === '-1') {
      return `Wikipedia article "${articleTitle}" not found.`;
    }

    const extract = pages[pageId].extract;
    
    if (!extract) {
      return `No content available for Wikipedia article "${articleTitle}".`;
    }

    // 3. Return formatted result with title and content
    return `**${articleTitle}**\n\n${extract}\n\nSource: ${articleUrl}`;

  } catch (error) {
    console.error("Error scraping Wikipedia:", error);
    return `Error retrieving Wikipedia information for "${searchTerm}": ${error instanceof Error ? error.message : String(error)}`;
  }
}