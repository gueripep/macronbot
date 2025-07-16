import fetch from "node-fetch";
import { Message } from "discord.js";
import { OllamaResponse, OllamaRequest, Article, RedditRssItem } from "../types.js";

// Generic method to send any prompt to the AI
export async function queryOllamaWithPrompt(prompt: string, model = "mistral:7b"): Promise<string> {
  const requestBody: OllamaRequest = {
    model: model,
    prompt: prompt,
    stream: false,
  };

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const data = (await response.json()) as OllamaResponse;
  // Remove <think> tags and trim the response
  let trimmedResponse = data.response.replace(/<think>[\s\S]*?<\/think>/, '').trim();
  // Remove the quotes if any
  trimmedResponse = trimmedResponse.replace(/^"|"$/g, '').trim();

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
export async function queryAITickerListFromRedditPost(redditPost: RedditRssItem): Promise<string> {
  const prompt = `
    Here is a Reddit post:
    Title: ${redditPost.title}
    Date: ${redditPost.published}
    Content: ${redditPost.content}
    END OF REDDIT POST
    You are a financial AI assistant. Extract the list of stock tickers mentioned in the post.
    Return the list of tickers in a comma-separated format, without any additional text or explanation.
    If no tickers are mentioned, return "No tickers found".`;

  const response = await queryOllamaWithPrompt(prompt, "gemma3:12b");
  // Clean up the response
  const tickers = response
    .split(",")
    .map(ticker => ticker.trim().toUpperCase())
    .filter(ticker => ticker.length > 0 && /^[A-Z]+$/.test(ticker));
  return tickers.length > 0 ? tickers.join(", ") : "No tickers found";
}

export async function getStrengthAndWeaknessesFromMDNA(mdna: string): Promise<string> {
  const prompt = `
    Here is the Management's Discussion and Analysis (MD&A) section of a company's 10-K report:
    ${mdna}
    Your task is to analyze the MD&A and extract the company's strengths and weaknesses.
    Provide a complete summary of the strengths and weaknesses in bullet points format.
    Please use the exact numbers provided in the document to back up your claims.
    Do NOT add any info not in the MD&A.`;

  return queryOllamaWithPrompt(prompt, "mistral:7b");
}