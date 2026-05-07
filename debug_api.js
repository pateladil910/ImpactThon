const http = require('http');

const url = 'https://impactthon-wjut.onrender.com/api/analytics/data?type=day&date=2026-01-31';

http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log('Response Code:', res.statusCode);
        console.log('Response Body:', data);
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
