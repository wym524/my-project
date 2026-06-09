const https = require('https');
const Database = require('better-sqlite3');
const db = new Database('/data/users.db');

const cfg = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
console.log('Config:', JSON.stringify(cfg));

const urlMatch = cfg.base_url.match(/^https?:\/\/([^\/]+)(\/.*)?$/);
const hostname = urlMatch[1];
const basePath = urlMatch[2] || '';
const apiPath = basePath.endsWith('/chat/completions') ? basePath : basePath + '/chat/completions';
const modelName = cfg.model || 'qwen-plus';

function callAPI(prompt) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });
    const options = {
      hostname: hostname,
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.api_key
      }
    };
    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        try {
          const r = JSON.parse(data);
          if (r.choices && r.choices[0] && r.choices[0].message) {
            resolve({ success: true, content: r.choices[0].message.content });
          } else {
            resolve({ success: false, content: data.substring(0, 300) });
          }
        } catch(e) { resolve({ success: false, content: e.message }); }
      });
    });
    req.on('error', (e) => { resolve({ success: false, content: e.message }); });
    req.write(postData);
    req.end();
  });
}

(async () => {
  console.log('\n=== 测试1: 单词生成 ===');
  const wordPrompt = '请生成3个雅思高频单词，严格返回 JSON 数组，不要任何解释文字。格式：[{"word":"...","meaning":"中文释义","example":"英文例句"}]';
  const wordResult = await callAPI(wordPrompt);
  console.log('Success:', wordResult.success);
  if (wordResult.success) {
    console.log('Content:', wordResult.content.substring(0, 400));
    try {
      let arr = JSON.parse(wordResult.content.replace(/```json|```/g, '').trim());
      if (!Array.isArray(arr)) {
        const m = wordResult.content.match(/\[[\s\S]*\]/);
        if (m) arr = JSON.parse(m[0]);
      }
      console.log('Parsed words:', JSON.stringify(arr, null, 2));
    } catch(e) { console.log('Parse failed:', e.message); }
  }

  console.log('\n=== 测试2: 选择题生成 ===');
  const qPrompt = '请生成3道雅思阅读选择题，严格返回 JSON 数组，不要任何解释。格式：[{"prompt":"题目内容","options":["选项A","选项B","选项C","选项D"],"answer":0,"explanation":"答案解析","difficulty":2}]。answer必须是0到3的数字，表示options数组中正确选项的索引。';
  const qResult = await callAPI(qPrompt);
  console.log('Success:', qResult.success);
  if (qResult.success) {
    console.log('Content:', qResult.content.substring(0, 500));
    try {
      let arr = JSON.parse(qResult.content.replace(/```json|```/g, '').trim());
      if (!Array.isArray(arr)) {
        const m = qResult.content.match(/\[[\s\S]*\]/);
        if (m) arr = JSON.parse(m[0]);
      }
      console.log('Parsed questions count:', arr.length);
      for (const q of arr) {
        console.log('- prompt:', q.prompt);
        console.log('  answer:', q.answer);
      }
    } catch(e) { console.log('Parse failed:', e.message); }
  }
})();
