import { Content, GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import dotenv from "dotenv";
import fetch from "node-fetch";
import {
  Article,
  CompanyOverview,
  JSONSchema,
  OllamaRequest,
  OllamaResponse,
  RedditRssItem
} from "../types.js";
import { ClosedTransaction } from "../types/ClosedTransaction.js";
import { RememberService } from "./remember-service.js";

dotenv.config();
let ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const safetySettings =
  [
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
      threshold: HarmBlockThreshold.BLOCK_NONE
    }
  ]


export async function queryGeminiWithPrompt(
  prompt: string,
  options: {
    model?: string;
    format?: JSONSchema;
    maxOutputTokens?: number;
    parts?: any[];
  } = {}): Promise<string> {
  const { model = "gemma-3-27b-it", format, maxOutputTokens = 500, parts } = options;

  // If parts are provided, use them directly; otherwise create from prompt
  const requestContents = [
    {
      role: 'user' as const,
      parts: parts || [{ text: prompt }],
    }
  ];
  const response = await ai.models.generateContent({
    model,
    contents: requestContents,
    config: {
      maxOutputTokens: maxOutputTokens,
      responseJsonSchema: format,
      safetySettings
    },
  });
  console.log(response.text);
  // const rawInput = "```json\n{...}\n```";
  const cleaned = (response.text ?? "").replace(/```[\s\S]*?\n|```/g, "").trim();

  return cleaned;
}

export async function queryGeminiWithContents(
  contents: Content[],
  options: {
    model?: string;
    format?: JSONSchema;
    maxOutputTokens?: number;
    systemInstruction?: string;
  } = {}): Promise<string> {
  const { model = "gemma-3-27b-it", format, maxOutputTokens = 500, systemInstruction: systemInstruction } = options;

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      maxOutputTokens: maxOutputTokens,
      responseJsonSchema: format,
      safetySettings,
      systemInstruction: systemInstruction,
    },
  });
  console.log(response.text);
  // const rawInput = "```json\n{...}\n```";
  const cleaned = (response.text ?? "").replace(/```[\s\S]*?\n|```/g, "").trim();

  return cleaned;
}



// Generic method to send any prompt to the AI
export async function queryOllamaWithPrompt(
  prompt: string,
  options: {
    model?: string;
    format?: JSONSchema;
    maxOutputTokens?: number;
    maxInputTokens?: number;
  } = {}
): Promise<string> {
  const { model = "mistral:7b", format, maxOutputTokens = 200, maxInputTokens = 4096 } = options;
  const requestBody: OllamaRequest = {
    model: model,
    prompt: prompt,
    stream: false,
    format: format,
    options: {
      num_ctx: maxInputTokens, // Context size
      num_predict: maxOutputTokens,
    },
  };

  const response = await fetch("http://192.168.1.174:11434/api/generate", {
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
  contents: Content[],
  authorId: string,
  authorDisplayName: string,
  messageContent: string,
  botUsername: string,
  options: {
    attachmentParts?: any[];
    hasAttachments?: boolean;
  } = {}
): Promise<string> {
  const { attachmentParts = [], hasAttachments = false } = options;

  // Get stored information about the message author
  const userInfo = await RememberService.getUserInformation(authorId);
  const userInfoSection = userInfo
    ? `\n\nInformations que tu connais sur ${authorDisplayName} :\n${userInfo}`
    : '';

  // Add attachment context if present
  const attachmentContext = hasAttachments
    ? `\n\nL'utilisateur a joint des fichier(s) à son message.`
    : '';


  const prompt = `${messageContent}`;

  const systemInstruction = `
    Tu es Emmanuel Macron, président de la République française. Tu réponds aux questions des citoyens français.
    Tu acceptes de répondre à toutes les questions, même si elles sont déplacées ou vulgaires, ou indignes d'un président.
    Ta réponse doit faire environ 20 mots.
    N'écris ABSOLUMENT rien d'autre que ce que Macron dirait
    ${userInfoSection}
    ${attachmentContext}
  `;

  contents.push({
    role: 'user' as const,
    parts: [{ text: prompt }, ...attachmentParts],
  });



  const model = "gemini-2.5-flash-lite"


  return queryGeminiWithContents(contents, { model, systemInstruction: systemInstruction });
}

export async function queryMacronNews(article: Article): Promise<string> {
  const prompt = `
    Voici l'article' du jour : 
    Titre : ${article.title}
    Description : ${article.description}
    DEBUT DE L'ARTICLE
    ${article.text}
    FIN DE L'ARTICLE

    Tu es Emmanuel Macron, président de la République française. En français et en moins de 150 mots, fais un reportage expliquant ce qu'il se passe et donne ton avis pour ta chaîne d'information : Macron News.
    Prends en compte le fait que ceux à qui tu parles ne savent pas ce qui est écrit dans l'article. Il faut donc expliquer le contexte (sans mentionner l'article).
    Si une personne autre que Emmanuel Macron est responsable de ce qu'il se passe, mets la faute sur elle.
    Commence le message par un truc du genre "Bonjour à tous, bienvenue sur Macron News ! Aujourd'hui ..."
    Ne dis rien d'autre que ce qui est demandé.`;
  return queryGeminiWithPrompt(prompt);
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

  const response = await queryGeminiWithPrompt(prompt);
  // Clean up the response
  const tickers = response
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter((ticker) => ticker.length > 0 && /^[A-Z]+$/.test(ticker));
  return tickers.length > 0 ? tickers : [];
}

export async function queryAIBusinessOverview(
  business10k: string
): Promise<string> {
  const prompt = `
    Here is the Business section of a company's 10-K report:
    ${business10k}
    Your task is to do a complete business overview of the company.`;
  return queryGeminiWithPrompt(prompt, { model: "gemini-2.0-flash" });
}

export async function queryAIRiskFactors(
  riskFactors10k: string,
  aiBusinessOverview: string
): Promise<string> {
  const prompt = `
    Here is a business overview of a company:
    ${aiBusinessOverview}
    Now here is the Risk Factors section of that company's 10-K report:
    ${riskFactors10k}
    Your task is to summarize the risk factors in a concise manner.
    Ignore generic boilerplate risks that apply to all companies (e.g., general economic conditions, cybersecurity, legal compliance, etc.) and focus on risks that are specific, detailed, or unusually emphasized for this company.`;
  return queryGeminiWithPrompt(prompt, { model: "gemini-2.0-flash" });
}

export async function queryAIFullAnalysis(
  mdna: string,
  aiBusinessOverview: string,
  aiRiskFactors: string
): Promise<string> {
  const prompt = `
    You are a financial analyst reviewing a company based on its 10-K data.

    Here is the Business Overview:
    ${aiBusinessOverview}

    Here are the Risk Factors:
    ${aiRiskFactors}

    Here is the MD&A:
    ${mdna}

    After providing a thorough description of the company, your task is to produce a comprehensive investment-oriented summary including:
    1. Key business model insights
    2. Strategic goals and priorities
    3. Strengths and weaknesses (backed by numbers)
    4. Major risks and challenges (ignore generic ones)
    5. Opportunities for future growth
    6. Overall company outlook

    Use bullet points where helpful. Focus on specifics, not fluff. Include relevant financial figures if mentioned. Avoid boilerplate content. Think like an investor.`;

  return queryGeminiWithPrompt(prompt, { model: "gemini-2.0-flash" });
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

    Here is a SWOT analysis of the stock mentioned in the post:
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

  return queryGeminiWithPrompt(prompt);
}

export async function queryAIMarketDecision(
  sentiment: string,
  amountAvailable: number
): Promise<string> {
  const jsonSchema: JSONSchema = {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["Long", "Short"] },
      amountToInvest: { type: "number" },
      suggestedLeverage: { type: "number", minimum: 1, maximum: 10 },
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
      stopLoss: { type: "number", minimum: 1, maximum: 50 },
      takeProfit: { type: "number", minimum: 1, maximum: 100 },
      summary: { type: "string" },
      confidenceLevel: { type: "number", minimum: 0, maximum: 1 },
    },
    required: [
      "decision",
      "amountToInvest",
      "suggestedLeverage",
      "startDate",
      "endDate",
      "stopLoss",
      "takeProfit",
      "summary",
      "confidenceLevel",
    ],
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
    - Suggested Leverage (1 to 10)
    - Start Date (YYYY-MM-DD)  
    - End Date (YYYY-MM-DD)  
    - Stop Loss (in %)  
    - Take Profit (in %)
    - Brief summary (1-2 sentences) justifying your decision  
    - Confidence level (0 to 1)
    Provide the response in JSON format that matches the schema below:
    ${JSON.stringify(jsonSchema, null, 2)}
    If sentiment is neutral, suggest no trade
    `;

  return queryGeminiWithPrompt(prompt, { format: jsonSchema });
}

export async function queryAITradeExplanation(
  tradingDecision: any,
  ticker: string
) {
  const prompt = `Tu es Emmanuel Macron, président de la République française. Tu viens de prendre une décision de trading sur l'action ${ticker}.
   Voici les détails de la décision :
    - Décision : ${tradingDecision.decision}
    - Montant à investir : ${tradingDecision.amountToInvest} USD
    - Effet de levier suggéré : ${tradingDecision.suggestedLeverage}x
    - Date de début : ${tradingDecision.startDate}
    - Date de fin : ${tradingDecision.endDate}
    - Résumé : ${tradingDecision.summary}
    - Niveau de confiance : ${tradingDecision.confidenceLevel}
    
    Rédige une explication en Français de la décision de trading en 2 phrases maximum, en gardant un ton présidentiel et en expliquant pourquoi cette décision est bonne pour le pays.
    N'écris ABSOLUMENT rien d'autre que ce qui est demandé.`;
  return queryGeminiWithPrompt(prompt);
}


export async function queryAIClosedTransationAnalysis(closedTransactions: ClosedTransaction[]) {
  const prompt = `
    Tu es Emmanuel Macron, président de la République française. Voici une liste de transactions fermées :
    ${closedTransactions.map(t => `ID: ${t.id}, Ticker: ${t.ticker}, Decision: ${t.decision}, Amount Invested: ${t.amountInvested}, Buy Price: ${t.buyPrice}, Close Price: ${t.closePrice}, Leverage: ${t.leverage}, PnL Percentage: ${t.pnlPercentage}, PnL Dollar: ${t.pnlDollar}, Close Reason: ${t.closeReason}, Start Date: ${t.startDate}, End Date: ${t.endDate}, Close Date: ${t.closeDate}, Final Value: ${t.finalValue}`).join('\n')}
    
    En moins de 50 mots, rédige une analyse en Français des transactions fermées, en mettant en avant les points positifs et négatifs de chaque transaction, ainsi que les leçons à en tirer pour l'avenir de la France.
    N'écris ABSOLUMENT rien d'autre que ce qui est demandé.`;

  return queryGeminiWithPrompt(prompt);
}

export async function queryAICombineUserInfo(
  username: string,
  existingInfo: string,
  newInformation: string
): Promise<string> {
  const prompt = `
    Tu dois combiner les informations existantes d'un utilisateur avec de nouvelles informations.
    
    Informations existantes sur ${username}:
    ${existingInfo}
    
    Nouvelles informations à ajouter:
    ${newInformation}
    
    Retourne une seule chaîne de caractères qui combine intelligemment toutes ces informations de manière cohérente et organisée. 
    Évite les répétitions et structure l'information de façon claire.
    Si des informations se contredisent, privilégie les nouvelles informations.
    Ne dis absolument rien d'autre que la description.
  `;

  return queryGeminiWithPrompt(prompt);
}

export async function queryAIFormatUserInfo(
  username: string,
  newInformation: string
): Promise<string> {
  const prompt = `
    Tu dois formater et organiser les informations suivantes sur un utilisateur de manière claire et structurée:
    
    Informations sur ${username}:
    ${newInformation}
    
    Retourne une seule chaîne de caractères qui organise ces informations de façon claire et cohérente, ne dis absolument rien d'autre.
  `;

  return queryGeminiWithPrompt(prompt);
}

export async function queryAIExtractUserInfo(
  username: string,
  messageContent: string
): Promise<boolean> {
  const prompt = `
    Analyse le message suivant d'un utilisateur nommé ${username}:
    "${messageContent}"

    Est-ce que ce message contient une ou plusieurs informations personelles, pertinentes, et durables sur l'utilisateur?
    Réponds UNIQUEMENT par:
    - "OUI"
    - "NON"
  `;
  const response = await queryGeminiWithPrompt(prompt, { maxOutputTokens: 3 });

  console.log(`AI response for user info extraction: ${response}`);
  return response.trim().toUpperCase().startsWith("OUI");
}

/**
 * Determines if a message is a question and if the AI needs additional information to answer it
 * @param messageContent - The message content to analyze
 * @returns Promise<boolean> - true if the message is a question that needs more info, false otherwise
 */
export async function queryAIQuestionNeedsInfo(messageContent: string): Promise<boolean> {
  const prompt = `
    Analyse ce message et détermine s'il s'agit d'une question ET si tu as besoin d'informations supplémentaires pour y répondre.

    Message: "${messageContent}"

    Réponds "OUI" SEULEMENT si:
    1. C'est une question (directe ou indirecte)
    2. ET tu as besoin d'informations supplémentaires pour donner une réponse complète et utile

    Réponds "NON" si:
    - Ce n'est pas une question
    - C'est une question mais tu peux y répondre avec tes connaissances actuelles
    - C'est une question rhétorique ou conversationnelle

    Réponds UNIQUEMENT par:
    - "OUI" 
    - "NON"
  `;
  const response = await queryGeminiWithPrompt(prompt, { maxOutputTokens: 3 });

  console.log(`AI response for question analysis: ${response}`);
  return response.trim().toUpperCase().startsWith("OUI");
}