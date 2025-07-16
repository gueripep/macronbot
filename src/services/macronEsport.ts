import dotenv from "dotenv";

dotenv.config();

const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN;

if (!PANDASCORE_TOKEN) {
  console.error('PANDASCORE_TOKEN is not set in environment variables');
  process.exit(1);
}

const options = {
  method: 'GET',
  headers: {
    'accept': 'application/json',
    'Authorization': `Bearer ${PANDASCORE_TOKEN}`
  }
};

export async function fetchLoLSeries() {
  try {
    const response = await fetch('https://api.pandascore.co/lol/series/running', options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching LoL series:', error);
    throw error;
  }
}

// Test the function
fetchLoLSeries()
  .then(data => console.log(data))
  .catch(error => console.error('Failed to fetch data:', error));