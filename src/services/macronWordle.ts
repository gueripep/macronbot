import { DailyWordleService, LetterState, SolveResult, solveWordle } from "@gueripep/wordle-solver";
import { BaseMessageOptions, ChatInputCommandInteraction, TextChannel } from "discord.js";
import { squeegeeChannelId } from "../config.js";

export async function getWordleSolvingMessage(): Promise<BaseMessageOptions> {
    const wordle = await DailyWordleService.getTodaysWordle();
    const solution = wordle.solution.toUpperCase();
    const solveResult = await solveWordle(solution, 6);
    
    return await getWordleSolveResultMessage(solveResult);
}

/**
 * Converts a letter state to its corresponding colored emoji
 */
function getColorForLetterState(state: LetterState): string {
    switch (state) {
        case LetterState.CORRECT:
            return "🟩"; // Green - correct position
        case LetterState.PRESENT:
            return "🟨"; // Yellow - wrong position
        case LetterState.ABSENT:
            return "⬛"; // Black - not in word
        default:
            return "⬜"; // White - unknown
    }
}

export async function getWordleSolveResultMessage(
  solveResult: SolveResult
): Promise<BaseMessageOptions> {
    const attempts = solveResult.attempts.map((attempt, index) => {
        // Create visual feedback with colored squares
        const visualFeedback = attempt.feedback.map(letterFeedback => {
            const color = getColorForLetterState(letterFeedback.state);
            return color;
        }).join("");
        
        
        return `${visualFeedback}`;
    }).join('\n');
    
    // Check if solved based on the last attempt having all CORRECT states
    const lastAttempt = solveResult.attempts[solveResult.attempts.length - 1];
    const isSolved = lastAttempt?.feedback.every(fb => fb.state === LetterState.CORRECT) || false;
    
    const resultText = isSolved 
        ? `Wordle résolu en ${solveResult.attempts.length} essais !`
        : `😔 Échec après ${solveResult.attempts.length} essais`;
    
    return {
        content: `${resultText}\n${attempts}`,
        allowedMentions: { parse: [] } // Prevent mentions in the message
    };
}

export async function handleWordleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel = interaction.channel;
    if (!channel) return;

    const message = await getWordleSolvingMessage();
    await interaction.reply(message);
}

export async function sendDailyWordleMessage(client: any): Promise<void> {
    console.log("Daily Wordle message sent at:", new Date().toISOString());
    
    const channel = client.channels.cache.get(squeegeeChannelId) as TextChannel;
    if (channel) {
        const message = await getWordleSolvingMessage();
        await channel.send(message);
    }
}