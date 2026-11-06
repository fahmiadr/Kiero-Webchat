const http = require('http');

const PORT = 3010;

const server = http.createServer((req, res) => {
    // Enable CORS just in case
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            console.log('\n=======================================');
            console.log(`[${new Date().toISOString()}] Received Webhook Request`);
            console.log('=======================================');

            // Log Headers
            console.log('\n--- HEADERS ---');
            console.log('Authorization:', req.headers['authorization']);
            console.log('Content-Type:', req.headers['content-type']);
            console.log('X-WebChat-Event:', req.headers['x-webchat-event']);
            console.log('X-WebChat-Client-Id:', req.headers['x-webchat-client-id']);
            console.log('X-Hub-Signature:', req.headers['x-hub-signature']);

            // Parse and Log Body
            try {
                if (body) {
                    const jsonBody = JSON.parse(body);
                    console.log('\n--- PAYLOAD ---');
                    console.dir(jsonBody, { depth: null, colors: true });

                    // Basic Validation Logic based on user request
                    const messages = jsonBody.messages || [];
                    messages.forEach((msg, index) => {
                        console.log(`\n--- Message #${index + 1} Details ---`);
                        console.log(`Type: ${msg.type}`);
                        console.log(`From: ${msg.from?.name} (${msg.from?.id})`);

                        if (msg.type === 'text') {
                            console.log(`Text: "${msg.text}"`);
                        } else if (msg.type === 'image') {
                            console.log('Image Attachment:');
                            console.log(`- URL: ${msg.image?.fileurl}`);
                            console.log(`- Type: ${msg.image?.mime_type}`);
                            console.log(`- Filename: ${msg.image?.filename}`);
                        }
                    });
                } else {
                    console.log('\n--- BODY IS EMPTY ---');
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', message: 'Webhook received' }));

            } catch (e) {
                console.error('\n!!! Error Parsing JSON !!!');
                console.error(e.message);
                console.log('Raw Body:', body);

                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
            }
            console.log('=======================================\n');
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`Mock External Server running on http://localhost:${PORT}`);
    console.log('Waiting for requests...');
});
