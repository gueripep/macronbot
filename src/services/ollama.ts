import fetch from "node-fetch";
import { Message } from "discord.js";
import {
  OllamaResponse,
  OllamaRequest,
  Article,
  RedditRssItem,
  PriceInformation,
  CompanyOverview,
  JSONSchema,
} from "../types.js";

// Generic method to send any prompt to the AI
export async function queryOllamaWithPrompt(
  prompt: string,
  model = "mistral:7b",
  format?: JSONSchema
): Promise<string> {
  const requestBody: OllamaRequest = {
    model: model,
    prompt: prompt,
    stream: false,
    format: format,
  };

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const data = (await response.json()) as OllamaResponse;
  // Remove <think> tags and trim the response
  let trimmedResponse = data.response
    .replace(/<think>[\s\S]*?<\/think>/, "")
    .trim();
  // Remove the quotes if any
  trimmedResponse = trimmedResponse.replace(/^"|"$/g, "").trim();

  return trimmedResponse;
}

// Refactored method to use the generic prompt method
export async function queryMacronAI(
  pastMessages: string,
  msg: Message,
  botUsername: string
): Promise<string> {
  const prompt = `
    Tu es ${botUsername}. Voici la conversation précédant la demande :
    ${pastMessages}
    Réponds au message suivant en tant que Emmanuel Macron : ${msg.content}.
    Sois un peu con, ta réponse doit faire 20 mots MAX. N'hésite pas à mentionner le nom de celui qui fait la demande : ${msg.author.displayName}
    N'écris ABSOLUMENT rien d'autre que ce que Macron dirait`;

  console.log(prompt);

  return queryOllamaWithPrompt(prompt);
}

export async function queryMacronNews(article: Article): Promise<string> {
  const prompt = `
    Voici l'article' du jour : 
    Titre : ${article.title}
    Description : ${article.description}
    DEBUT DE L'ARTICLE
    ${article.text}
    FIN DE L'ARTICLE

    Tu es Emmanuel Macron, président de la République française. En français et en moins de 200 mots, fais un reportage expliquant ce qu'il se passe et donne ton avis pour ta chaîne d'information : Macron News.
    Fais genre que ce qu'il se passe t'énerve légèrement tout en gardant un ton Présidentiel. Si une personne autre que Emmanuel Macron est responsable de ce qu'il se passe, mets la faute sur elle.
    Commence le message par un truc du genre "Bonjour à tous, bienvenue sur Macron News ! Aujourd'hui ..."
    Ne dis rien d'autre que ce qui est demandé.`;
  return queryOllamaWithPrompt(prompt, "gemma3:12b");
}

//gets the list of sticker mentionned in a message
export async function queryAITickerListFromRedditPost(
  redditPost: RedditRssItem
): Promise<string[]> {
  const prompt = `
    Here is a Reddit post:
    Title: ${redditPost.title}
    Date: ${redditPost.published}
    Content: ${redditPost.content}
    END OF REDDIT POST
    You are a financial AI assistant. Extract the list of stock tickers from the companies mentioned in the post.
    Return the list of tickers in a comma-separated format, without any additional text or explanation.
    If no tickers are mentioned, return "No tickers found".`;

  const response = await queryOllamaWithPrompt(prompt, "gemma3:27b");
  // Clean up the response
  const tickers = response
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter((ticker) => ticker.length > 0 && /^[A-Z]+$/.test(ticker));
  return tickers.length > 0 ? tickers : [];
}

export async function getStrengthAndWeaknessesFromMDNA(
  mdna: string
): Promise<string> {
  const prompt = `
    Here is the Management's Discussion and Analysis (MD&A) section of a company's 10-K report:
    ${mdna}
    Your task is to analyze the MD&A and extract the company's strengths and weaknesses.
    Provide a complete summary of the strengths and weaknesses in bullet points format.
    Please use the exact numbers provided in the document to back up your claims.
    Do NOT add any info not in the MD&A.`;

  return queryOllamaWithPrompt(prompt, "mistral:7b");
}

export async function queryAISentiment(
  rssItem: RedditRssItem,
  aiAnalysis: string,
  companyOverview: CompanyOverview
): Promise<string> {
  const prompt = `
    Here is a Reddit post:
    Title: ${rssItem.title}
    Date: ${rssItem.published}
    Content: ${rssItem.content}
    END OF REDDIT POST

    Here is the analysis of the stock mentioned in the post:
    ${aiAnalysis}

    Here is the company overview:
    Symbol: ${companyOverview.Symbol}
    Name: ${companyOverview.Name}
    Sector: ${companyOverview.Sector}
    Industry: ${companyOverview.Industry}
    Description: ${companyOverview.Description}
    Market Capitalization: ${companyOverview.MarketCapitalization}
    Revenue (TTM): ${companyOverview.RevenueTTM}
    P/E Ratio: ${companyOverview.PERatio}
    Forward P/E: ${companyOverview.ForwardPE}
    Dividend Yield: ${companyOverview.DividendYield}
    Dividend Per Share: ${companyOverview.DividendPerShare}
    EPS: ${companyOverview.EPS}
    Profit Margin: ${companyOverview.ProfitMargin}
    Operating Margin TTM: ${companyOverview.OperatingMarginTTM}

    Here is the price information for the stock:
    Current Price: ${companyOverview.PriceInformation.CurrentPrice}
    Yesterday's Price: ${companyOverview.PriceInformation.YesterdayPrice}
    52 Week High: ${companyOverview.PriceInformation.Week52High}
    52 Week Low: ${companyOverview.PriceInformation.Week52Low}
    50 Day Moving Average: ${companyOverview.PriceInformation.MovingAverage50Day}
    200 Day Moving Average: ${companyOverview.PriceInformation.MovingAverage200Day}
    Beta (Volatility): ${companyOverview.PriceInformation.Beta}

    Your task is to determine your sentiment about the company based on the AI analysis, company overview, and price information.
    You can use the Reddit post information but consider it as additional context rather than the primary source.
    Please explain your reasoning clearly and objectively and do not provide a Disclaimer.`;

  return queryOllamaWithPrompt(prompt, "gemma3:12b");
}

export async function queryAIMarketDecision(sentiment: string, amountAvailable: number): Promise<string> {
  const jsonSchema: JSONSchema = {
    "type": "object",
    "properties": {
      "decision": { "type": "string", "enum": ["Long", "Short"] },
      "amountToInvest": { "type": "number" },
      "suggestedLeverage": { "type": "number", "minimum": 1, "maximum": 10 },
      "startDate": { "type": "string", "format": "date" },
      "endDate": { "type": "string", "format": "date" },
      "summary": { "type": "string" },
      "confidenceLevel": { "type": "number", "minimum": 0, "maximum": 1 },
    },
    "required": ["decision", "amountToInvest", "suggestedLeverage", "startDate", "endDate", "summary", "confidenceLevel"],
  };
  const currendDate = new Date();
  const prompt = `
    Today is ${currendDate.toISOString().split("T")[0]}.
    You have ${amountAvailable} available to invest.
    You are a financial AI assistant. Based on the sentiment provided, make a market decision.
    Sentiment: ${sentiment}
    Based on the above information, **make a trading decision** with these details:  
    - Decision: 'Long' or 'Short'  
    - Amount to invest (in USD)
    - Suggested Leverage (1x to 10x)  
    - Start Date (YYYY-MM-DD)  
    - End Date (YYYY-MM-DD)  
    - Brief summary (1-2 sentences) justifying your decision  
    - Confidence level (0 to 1)
    Provide the response in JSON format that matches the schema below:
    ${JSON.stringify(jsonSchema, null, 2)}
    If sentiment is neutral, suggest no trade
    `;

  return queryOllamaWithPrompt(prompt, "gemma3:12b", jsonSchema);
}