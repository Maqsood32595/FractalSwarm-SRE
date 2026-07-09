import https from 'https';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('d:/HiDevs/GoogleAgents/.env') });

const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  console.error('GOOGLE_API_KEY is not defined in .env file.');
  process.exit(1);
}

const data = JSON.stringify({
  contents: [{
    parts: [{ text: 'Hello, reply with only the word OK.' }]
  }]
});

const options = {
  hostname: 'generativelanguage.googleapis.com',
  port: 443,
  path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Sending request to Gemini API...');
const req = https.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    try {
      const parsed = JSON.parse(responseData);
      console.log('Response:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Raw Response:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('Request Error:', error.message);
});

req.write(data);
req.end();
