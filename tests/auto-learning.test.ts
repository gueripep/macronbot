import { queryAIExtractUserInfo } from '../src/services/ollama.js';

/**
 * Test file for the auto-learning user information extraction
 * Note: This test requires Ollama to be running with the mistral:7b model
 */

async function testAutoLearning() {
  console.log('Testing AI auto-learning from messages...');
  
  const testMessages = [
    {
      username: "Alice",
      content: "Salut tout le monde!",
      expected: false,
      description: "Simple greeting - should not extract info"
    },
    {
      username: "Bob",
      content: "Je suis développeur JavaScript et j'adore React, je travaille chez Google",
      expected: true,
      description: "Rich personal info - should extract info"
    },
    {
      username: "Charlie",
      content: "Oui",
      expected: false,
      description: "Single word response - should not extract info"
    },
    {
      username: "Diana",
      content: "Je viens de déménager à Paris, j'adore la cuisine française et je joue de la guitare",
      expected: true,
      description: "Multiple personal details - should extract info"
    },
    {
      username: "Eve",
      content: "Qu'est-ce que tu penses de ça?",
      expected: false,
      description: "Generic question - should not extract info"
    },
    {
      username: "Frank",
      content: "Je suis étudiant en médecine à la Sorbonne, j'ai 23 ans",
      expected: true,
      description: "Educational and age info - should extract info"
    }
  ];

  for (const testCase of testMessages) {
    console.log(`\n--- Testing: ${testCase.description} ---`);
    console.log(`Message: "${testCase.content}"`);
    
    try {
      const result = await queryAIExtractUserInfo(testCase.username, testCase.content);
      
      console.log(`Expected info extraction: ${testCase.expected}`);
      console.log(`Actual result: ${result.hasInfo}`);
      
      if (result.hasInfo) {
        console.log(`Extracted info: "${result.information}"`);
      }
      
      const isCorrect = result.hasInfo === testCase.expected;
      console.log(`✅ Test ${isCorrect ? 'PASSED' : 'FAILED'}`);
      
    } catch (error) {
      console.error(`❌ Test failed with error:`, error);
    }
  }

  console.log('\n🎯 Auto-learning tests completed!');
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAutoLearning();
}

export { testAutoLearning };
