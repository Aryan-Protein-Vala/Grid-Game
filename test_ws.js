const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws');

ws.on('open', () => {
    console.log('Connected to backend');
});

ws.on('message', (data) => {
    console.log('Received:', data.toString());
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('Error:', err);
    process.exit(1);
});
