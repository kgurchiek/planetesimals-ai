const fs = require('fs');
const http = require('http');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(fs.readFileSync(`practice/aim/${JSON.parse(fs.readFileSync('practice/aim/config.json').toString()).winners}`));
}).listen(8081, () => {});