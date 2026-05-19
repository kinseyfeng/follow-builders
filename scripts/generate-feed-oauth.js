// follow-builders generate-feed-oauth.js (OAuth 1.0 版本)
const crypto = require('crypto');
const https = require('https');

// OAuth 1.0a 签名生成
function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
  const normalizedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(normalizedParams)}`;
  
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

// 生成 OAuth 1.0 header
function getOAuthHeader(url, method = 'GET', oauthParams = {}) {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    console.log('❌ OAuth credentials 不完整');
    return null;
  }
  
  const params = {
    oauth_consumer_key: consumerKey,
    oauth_token: accessToken,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_version: '1.0',
    ...oauthParams
  };
  
  params.oauth_signature = generateOAuthSignature(method, url, params, consumerSecret, accessTokenSecret);
  
  const header = Object.keys(params)
    .map(key => `${key}="${encodeURIComponent(params[key])}"`)
    .join(', ');
  
  return `OAuth ${header}`;
}

// 调用 X API (OAuth 1.0)
async function callXAPI(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const url = `https://api.x.com${endpoint}`;
    const method = 'GET';
    
    const oauthHeader = getOAuthHeader(url, method, {});
    
    const options = {
      hostname: 'api.x.com',
      path: endpoint + (params ? '?' + new URLSearchParams(params) : ''),
      method: method,
      headers: {
        'Authorization': oauthHeader,
        'User-Agent': 'follow-builders'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: jsonData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// 获取用户推文
async function getUserTweets(username) {
  // 第 1 步：获取用户 ID
  const userRes = await callXAPI(`/2/users/by/username/${username}`);
  
  if (userRes.status !== 200) {
    console.log(`❌ 获取用户 @${username} 失败：${userRes.status}`);
    return null;
  }
  
  const userId = userRes.data.data?.id;
  if (!userId) {
    console.log(`❌ 用户 @${username} 不存在`);
    return null;
  }
  
  // 第 2 步：获取用户推文
  const tweetsRes = await callXAPI(`/2/users/${userId}/tweets`, {
    max_results: '10',
    tweet_fields: 'created_at,public_metrics,text'
  });
  
  if (tweetsRes.status !== 200) {
    console.log(`❌ 获取推文失败：${tweetsRes.status}`);
    return null;
  }
  
  return tweetsRes.data.data || [];
}

// 主逻辑
async function generateFeed() {
  console.log('🚀 follow-builders (OAuth 1.0 版本)');
  console.log('');
  
  // 测试 1: 获取 @karpathy 信息
  console.log('📋 测试：获取 @karpathy 用户信息...');
  const userRes = await callXAPI('/2/users/by/username/karpathy');
  
  console.log('   HTTP 状态：', userRes.status);
  
  if (userRes.status === 200) {
    console.log('   ✅ OAuth 1.0 认证成功！');
    console.log('   用户：', userRes.data.data?.name || '未知');
    console.log('   用户 ID:', userRes.data.data?.id);
  } else if (userRes.status === 401) {
    console.log('   ❌ 401 - OAuth 签名无效');
    return;
  } else if (userRes.status === 403) {
    console.log('   ❌ 403 - 权限不足');
    return;
  } else {
    console.log('   ⚠️ 其他错误:', userRes.data);
    return;
  }
  
  console.log('');
  
  // 测试 2: 获取推文
  console.log('📋 测试：获取 @karpathy 最近推文...');
  const tweets = await getUserTweets('karpathy');
  
  if (tweets && tweets.length > 0) {
    console.log(`   ✅ 成功获取 ${tweets.length} 条推文！`);
    tweets.forEach((t, i) => {
      const text = t.text?.substring(0, 60) || '无内容';
      const likes = t.public_metrics?.like_count || 0;
      console.log(`   [${i+1}] ${text}... (❤️ ${likes})`);
    });
  } else {
    console.log('   ⚠️ 没有获取到推文（可能用户最近没发）');
  }
  
  console.log('');
  console.log('--- 测试完成 ---');
}

generateFeed().catch(console.error);
