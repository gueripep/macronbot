export interface OllamaResponse {
  response: string;
}

export interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
}
