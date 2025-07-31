import { REST, Routes, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

export const commands = [
    new SlashCommandBuilder().setName('portfolio').setDescription('Je réponds avec mes positions actuelles'),
    new SlashCommandBuilder().setName('remember').setDescription('Je mémorise une information sur toi ou quelqu\'un d\'autre')
        .addStringOption(option =>
            option.setName('information')
                .setDescription('Ce que je dois mémoriser')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('L\'utilisateur concerné (optionnel, par défaut c\'est toi)')
                .setRequired(false)),
    new SlashCommandBuilder().setName('trade').setDescription('Lance une recherche et analyse de nouvelles opportunités de trading (max 1 fois par heure)'),
    new SlashCommandBuilder().setName('wordle').setDescription('Résout le Wordle du jour'),
].map(command => command.toJSON());

export const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN!);

// Function to deploy commands (call this manually when needed)
export async function deployCommands() {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), { body: commands });
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
        throw error;
    }
}

// Run deployment when this file is executed directly
deployCommands().catch(console.error);