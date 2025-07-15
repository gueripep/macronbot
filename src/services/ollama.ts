import fetch from "node-fetch";
import { Message } from "discord.js";
import { OllamaResponse, OllamaRequest } from "../types.js";

export async function queryOllama(pastMessages: string, msg: Message, botUsername: string): Promise<string> {
  const prompt = `
    Tu es ${botUsername}. Voici la conversation précédant la demande :
    ${pastMessages}
    Réponds au message suivant en tant que emmanuel macron : ${msg.content}.
    Sois un peu con, ta réponse doit faire 20 mots MAX, hésite pas à lacher 2 ou 3 insultes de temps en temps. N'hésite pas à mentionner le nom de celui qui fait la demande : ${msg.author.displayName}
    `;
  
  console.log(prompt);
  
  const requestBody: OllamaRequest = {
    model: "mistral:7b",
    prompt: prompt,
    stream: false,
  };
  
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json() as OllamaResponse;
  return data.response;
}
