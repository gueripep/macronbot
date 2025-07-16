import fetch from "node-fetch";
import { Message } from "discord.js";
import { OllamaResponse, OllamaRequest } from "../types.js";
import { Article } from "./scraper.js";

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
  const trimmedResponse = data.response.replace(/<think>[\s\S]*?<\/think>/, '').trim();
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
    Commence le message par un truc du genre "Bonjour à tous, bienvenue sur Macron News !"
    Le ton doit être fluide et présidentiel. Ne dis rien d'autre que ce qui est demandé.`;
  console.log(prompt);
  return queryOllamaWithPrompt(prompt, "gemma3:12b");
}


