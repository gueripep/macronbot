import { RememberService } from '../src/services/remember-service.js';

/**
 * Test file for RememberService
 * Note: This test requires Ollama to be running with the mistral:7b model
 * This tests the core business logic, not the Discord interaction handling
 */

async function testRememberService() {
  console.log('Testing RememberService core functionality...');
  
  try {
    const testUserId = 'test_user_123';
    const testUsername = 'TestUser';
    
    // Test 1: Adding first information
    console.log('\n--- Test 1: Adding first information ---');
    const firstInfo = "J'aime le développement web et je travaille avec TypeScript";
    const result1 = await RememberService.processRememberCommand(testUserId, testUsername, firstInfo);
    console.log('Result 1:', result1);
    
    // Test 2: Adding additional information (should combine with existing)
    console.log('\n--- Test 2: Adding additional information ---');
    const secondInfo = "Je vis en France et j'utilise Discord quotidiennement";
    const result2 = await RememberService.processRememberCommand(testUserId, testUsername, secondInfo);
    console.log('Result 2:', result2);
    
    // Test 3: Retrieving stored information
    console.log('\n--- Test 3: Retrieving stored information ---');
    const storedInfo = await RememberService.getUserInformation(testUserId);
    console.log('Stored Info:', storedInfo);
    
    console.log('\n✅ All core functionality tests completed successfully!');
    console.log('\n📝 Note: Discord interaction handling is tested separately via handleRememberCommand method');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRememberService();
}

export { testRememberService };

