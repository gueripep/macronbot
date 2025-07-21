import { RememberService } from '../src/services/remember-service.js';

/**
 * Test file for RememberService with multiple users
 * Note: This test requires Ollama to be running with the mistral:7b model
 */

async function testRememberServiceMultipleUsers() {
  console.log('Testing RememberService with multiple users...');
  
  try {
    const user1Id = 'user_123';
    const user1Username = 'Alice';
    const user2Id = 'user_456';
    const user2Username = 'Bob';
    
    // Test 1: Store info about Alice
    console.log('\n--- Test 1: Store info about Alice ---');
    const aliceInfo = "Alice aime la programmation Python et travaille dans l'IA";
    const result1 = await RememberService.processRememberCommand(user1Id, user1Username, aliceInfo);
    console.log('Alice Info:', result1);
    
    // Test 2: Store info about Bob
    console.log('\n--- Test 2: Store info about Bob ---');
    const bobInfo = "Bob est designer UX et adore les jeux vidéo";
    const result2 = await RememberService.processRememberCommand(user2Id, user2Username, bobInfo);
    console.log('Bob Info:', result2);
    
    // Test 3: Add more info about Alice
    console.log('\n--- Test 3: Add more info about Alice ---');
    const moreAliceInfo = "Alice vit à Paris et boit beaucoup de café";
    const result3 = await RememberService.processRememberCommand(user1Id, user1Username, moreAliceInfo);
    console.log('Updated Alice Info:', result3);
    
    // Test 4: Retrieve stored information for both users
    console.log('\n--- Test 4: Retrieve stored information ---');
    const aliceStored = await RememberService.getUserInformation(user1Id);
    const bobStored = await RememberService.getUserInformation(user2Id);
    console.log('Alice Stored:', aliceStored);
    console.log('Bob Stored:', bobStored);
    
    console.log('\n✅ Multi-user tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRememberServiceMultipleUsers();
}

export { testRememberServiceMultipleUsers };
