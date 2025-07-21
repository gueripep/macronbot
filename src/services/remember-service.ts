import { ChatInputCommandInteraction } from 'discord.js';
import db from '../dbSetup.js';
import { queryAICombineUserInfo, queryAIFormatUserInfo } from './ollama.js';

export class RememberService {
  /**
   * Handles the remember command interaction
   * @param interaction - Discord ChatInputCommandInteraction
   */
  static async handleRememberCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Get the information option from the command
      const information = interaction.options.getString('information');
      // Get the optional user parameter
      const targetUser = interaction.options.getUser('user');
      
      if (!information) {
        await interaction.reply({ content: 'Erreur: Aucune information fournie.', ephemeral: true });
        return;
      }

      // Defer the reply since AI processing might take some time
      await interaction.deferReply();

      // Use target user if specified, otherwise use the command author
      const userId = targetUser ? targetUser.id : interaction.user.id;
      const username = targetUser ? targetUser.username : interaction.user.username;
      const displayName = targetUser ? targetUser.displayName : interaction.user.displayName;

      // Process the remember command using the service
      const response = await this.processRememberCommand(
        userId,
        username,
        information
      );

      // Reply with the AI-generated response, mentioning who the info is about
      const aboutWho = targetUser ? `sur ${displayName}` : 'sur toi';
      await interaction.editReply({ 
        content: `Voici ce que je retiens ${aboutWho} :\n\n${response}` 
      });

    } catch (error) {
      console.error('Error in remember command:', error);
      
      // Handle the error response appropriately
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: 'Désolé, une erreur s\'est produite lors du traitement de votre demande.' 
        });
      } else {
        await interaction.reply({ 
          content: 'Désolé, une erreur s\'est produite lors du traitement de votre demande.', 
          ephemeral: true 
        });
      }
    }
  }
  /**
   * Processes the remember command by either creating new user info or combining with existing info
   * @param userId - Discord user ID
   * @param username - Discord username
   * @param newInformation - New information to remember
   * @returns AI-generated response string
   */
  static async processRememberCommand(
    userId: string, 
    username: string, 
    newInformation: string
  ): Promise<string> {
    try {
      // Check if user already has stored information
      const existingInfo = this.getUserInfo(userId);
      
      let finalResponse: string;

      if (existingInfo) {
        // User has existing information - ask AI to combine it
        finalResponse = await queryAICombineUserInfo(
          username,
          existingInfo.information,
          newInformation
        );
        
        // Update the database with the combined information
        this.updateUserInfo(userId, username, finalResponse);
      } else {
        // No existing information - ask AI to format the new information
        finalResponse = await queryAIFormatUserInfo(username, newInformation);
        
        // Save the new information to database
        this.saveUserInfo(userId, username, finalResponse);
      }

      return finalResponse;
    } catch (error) {
      console.error('Error processing remember command:', error);
      throw new Error('Erreur lors du traitement de la commande remember');
    }
  }

  /**
   * Retrieves user information from the database
   * @param userId - Discord user ID
   * @returns User information object or null if not found
   */
  private static getUserInfo(userId: string): { user_id: string; username: string; information: string; created_at: string; updated_at: string } | null {
    try {
      const stmt = db.prepare('SELECT * FROM user_info WHERE user_id = ?');
      return stmt.get(userId) || null;
    } catch (error) {
      console.error('Error retrieving user info:', error);
      return null;
    }
  }

  /**
   * Saves new user information to the database
   * @param userId - Discord user ID
   * @param username - Discord username
   * @param information - Information to save
   */
  private static saveUserInfo(userId: string, username: string, information: string): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO user_info (user_id, username, information) 
        VALUES (?, ?, ?)
      `);
      stmt.run(userId, username, information);
    } catch (error) {
      console.error('Error saving user info:', error);
      throw new Error('Erreur lors de la sauvegarde des informations');
    }
  }

  /**
   * Updates existing user information in the database
   * @param userId - Discord user ID
   * @param username - Discord username
   * @param information - Updated information
   */
  private static updateUserInfo(userId: string, username: string, information: string): void {
    try {
      const stmt = db.prepare(`
        UPDATE user_info 
        SET username = ?, information = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ?
      `);
      stmt.run(username, information, userId);
    } catch (error) {
      console.error('Error updating user info:', error);
      throw new Error('Erreur lors de la mise à jour des informations');
    }
  }

  /**
   * Retrieves all stored information for a user (optional utility method)
   * @param userId - Discord user ID
   * @returns User information string or null
   */
  static async getUserInformation(userId: string): Promise<string | null> {
    const userInfo = this.getUserInfo(userId);
    return userInfo ? userInfo.information : null;
  }
}