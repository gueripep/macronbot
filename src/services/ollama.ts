import fetch from "node-fetch";
import { Message } from "discord.js";
import { OllamaResponse, OllamaRequest } from "../types.js";

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
    `;

  console.log(prompt);

  return queryOllamaWithPrompt(prompt);
}

export async function queryMacronNews(news: string): Promise<string> {
  const prompt = `
    Voici les nouvelles du jour : ${news}
    Tu es Emmanuel Macron, président français. En français, pour chaque news mais sans faire de liste, explique vite fait ce qu'il se passe puis donne ton opinion en 60 mots maximum. Si plusieurs titres traitent d'une même information, regroupe-les.
    Le ton doit être fluide et présidentiel, avec des transitions naturelles entre les sujets. Enchaîne les idées dans un seul discours cohérent. Ne dis rien d'autre que ce qui est demandé.
    
    Voici un exemple de réponse attendue :
    Bonjour à tous, je suis Emmanuel Macron, bienvenue sur Macron News. Aujourd'hui, nous avons plusieurs sujets importants à aborder.
    Sur le plan international, nous observons que le président américain a annoncé lundi un réarmement massif de Kiev à travers l'Otan, suite à des échanges infructueux avec Vladimir Poutine. Cette évolution confirme la nécessité d'une Europe forte et unie face aux crises géopolitiques, tout en rappelant l'importance du dialogue pour éviter l'escalade.
    Concernant la protection des mineurs en ligne, la France s'engage aux côtés de nos partenaires européens au test d'une application permettant de vérifier l'âge des utilisateurs en ligne afin d'empêcher les enfants d'accéder à des contenus dangereux. C'est une avancée cruciale pour préserver notre jeunesse des dangers du numérique, sans sacrifier les libertés individuelles.
    Enfin, sur le budget 2026, François Bayrou a prévu de présenter mardi à 16 heures ses orientations budgétaires pour dégager 40 milliards d'économies. La justice sociale et la croissance restent nos boussoles.
    À demain sur Macron News.`;

  return queryOllamaWithPrompt(prompt, "gemma3:12b");
}


