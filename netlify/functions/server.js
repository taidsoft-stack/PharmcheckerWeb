const serverless = require('serverless-http');
const app = require('../../app');

// Express 앱을 Netlify Functions로 내보내기
const handler = serverless(app);

module.exports.handler = async (event, context) => {
  // AWS Lambda 환경 변수 설정
  process.env.NETLIFY = 'true';
  
  try {
    const result = await handler(event, context);
    return result;
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error', message: error.message })
    };
  }
};
