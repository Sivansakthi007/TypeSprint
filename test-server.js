const http = require('http');
const assert = require('assert');
const { spawn } = require('child_process');

console.log('🧪 Starting TypeSprint Server Integration Tests...');

// Launch the server as a background process on a test port
const serverEnv = { ...process.env, PORT: '3001', NODE_ENV: 'test' };
const serverProcess = spawn('node', ['server.js'], { env: serverEnv });

let serverOutput = '';
serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
});

serverProcess.stderr.on('data', (data) => {
    console.error('SERVER ERROR LOG:', data.toString());
});

// Wait for server to boot up
setTimeout(() => {
    runTests();
}, 2500);

async function makeRequest(path, method, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const options = {
            hostname: 'localhost',
            port: 3001,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, rawBody: data });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function runTests() {
    let testToken = '';
    const testUsername = `tester_${Math.floor(Math.random() * 1000)}`;
    const testEmail = `${testUsername}@typesprint.com`;

    try {
        console.log('\n--- 1. Testing Registration ---');
        const regRes = await makeRequest('/api/auth/register', 'POST', {
            username: testUsername,
            email: testEmail,
            password: 'password123'
        });
        
        console.log('Response Status:', regRes.statusCode);
        assert.strictEqual(regRes.statusCode, 201, 'Registration should return 201 Created');
        assert.ok(regRes.body.token, 'Response should contain a JWT token');
        assert.strictEqual(regRes.body.user.username, testUsername, 'Returned user object username should match');
        testToken = regRes.body.token;
        console.log('✅ Registration Passed');

        console.log('\n--- 2. Testing Login ---');
        const loginRes = await makeRequest('/api/auth/login', 'POST', {
            usernameOrEmail: testUsername,
            password: 'password123'
        });

        console.log('Response Status:', loginRes.statusCode);
        assert.strictEqual(loginRes.statusCode, 200, 'Login should return 200 OK');
        assert.ok(loginRes.body.token, 'Response should contain a JWT token');
        console.log('✅ Login Passed');

        console.log('\n--- 3. Testing Auth Status ---');
        const statusRes = await makeRequest('/api/auth/status', 'GET', null, {
            'Authorization': `Bearer ${testToken}`
        });

        console.log('Response Status:', statusRes.statusCode);
        assert.strictEqual(statusRes.statusCode, 200, 'Status endpoint should be online');
        assert.strictEqual(statusRes.body.authenticated, true, 'User should be authenticated');
        console.log('✅ Auth Status Checked');

        console.log('\n--- 4. Testing Profile retrieval ---');
        const profileRes = await makeRequest('/api/profile', 'GET', null, {
            'Authorization': `Bearer ${testToken}`
        });

        console.log('Response Status:', profileRes.statusCode);
        assert.strictEqual(profileRes.statusCode, 200, 'Profile fetch should return 200');
        assert.ok(profileRes.body.profile.xp !== undefined, 'Profile should have XP logged');
        console.log('✅ Profile Retrieval Passed');

        console.log('\n--- 5. Testing Typing text fetch ---');
        const textRes = await makeRequest('/api/typing/text?mode=quote&difficulty=medium', 'GET');
        
        console.log('Response Status:', textRes.statusCode);
        assert.strictEqual(textRes.statusCode, 200, 'Should load text targets successfully');
        assert.ok(textRes.body.text, 'Should return text content to type');
        console.log('✅ Practice Text Loading Passed');

        console.log('\n--- 6. Testing Result submission ---');
        const resultsRes = await makeRequest('/api/typing/results', 'POST', {
            mode: 'quote',
            wpm: 85,
            cpm: 425,
            accuracy: 98.50,
            errors: { 'e': 1 },
            keyHeatmap: { 'e': { total: 10, error: 1 } },
            replayData: [],
            typingSeconds: 30
        }, {
            'Authorization': `Bearer ${testToken}`
        });

        console.log('Response Status:', resultsRes.statusCode);
        assert.strictEqual(resultsRes.statusCode, 200, 'Result submission should return 200 OK');
        assert.ok(resultsRes.body.rewards.xp > 0, 'Results should award XP points');
        console.log('✅ Results Submission Passed');

        console.log('\n--- 7. Testing Shop catalog ---');
        const shopRes = await makeRequest('/api/shop', 'GET', null, {
            'Authorization': `Bearer ${testToken}`
        });

        console.log('Response Status:', shopRes.statusCode);
        assert.strictEqual(shopRes.statusCode, 200, 'Should return 200 OK');
        assert.ok(shopRes.body.catalog.length > 0, 'Shop should contain items catalog');
        console.log('✅ Shop API Checked');

        console.log('\n🌟 ALL SERVER TESTS COMPLETED SUCCESSFULLY! 🎉');
        cleanup(0);

    } catch (error) {
        console.error('\n❌ TEST SUITE FAILURE:', error);
        cleanup(1);
    }
}

function cleanup(exitCode) {
    console.log('Shutting down test server process...');
    serverProcess.kill('SIGTERM');
    process.exit(exitCode);
}
