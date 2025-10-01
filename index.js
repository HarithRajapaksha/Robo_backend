const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Configuration - Replace with actual IPs (discover via router or hardcode)
// Note: For the proxy to work, your Node.js server must be on a network that can reach BOTH ESP IPs.
// If main ESP is in AP mode (192.168.4.1), connect your laptop to "ESP32_Car" WiFi.
// Better: Switch main ESP to station mode on "Ayesh" SSID for unified access (see earlier code).
const ESP_CAR_IP = '192.168.4.1';  // Main ESP32 car control (AP mode) - Update if switched to station
const ESP_CAM_IP = '192.168.225.143';  // ESP32-CAM IP (station mode on home WiFi)

// Middleware
app.use(cors({
  origin: '*',  // Allow all for local dev; restrict in prod
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'User-Agent'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));  // Optional: Serve static files

// Health check endpoint
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(), 
    car_ip: ESP_CAR_IP, 
    cam_ip: ESP_CAM_IP 
  });
});

// Proxy for sensor data from main ESP32 (/sensor endpoint assumed in car code)
app.get('/api/sensor', createProxyMiddleware({
  target: `http://${ESP_CAR_IP}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api/sensor': '/sensor',  // Proxy /api/sensor -> /sensor on ESP
  },
  onProxyRes: (proxyRes) => {
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
  },
  onError: (err, req, res) => {
    console.error('Sensor proxy error:', err);
    res.status(500).json({ error: 'Proxy error for sensor' });
  },
}));

// Motor control proxies (forward, backward, left, right, stop)
const motorCommands = ['forward', 'backward', 'left', 'right', 'stop'];
motorCommands.forEach(command => {
  app.get(`/api/${command}`, createProxyMiddleware({
    target: `http://${ESP_CAR_IP}`,
    changeOrigin: true,
    pathRewrite: {
      [`^/api/${command}`]: `/${command}`,
    },
    onProxyRes: (proxyRes) => {
      // Ensure CORS headers
      proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    },
    onError: (err, req, res) => {
      console.error(`${command} proxy error:`, err);
      res.status(500).json({ error: `Proxy error for ${command}` });
    },
  }));
});

// Valve control proxies
const valveCommands = ['valve1_on', 'valve1_off', 'valve2_on', 'valve2_off'];
valveCommands.forEach(command => {
  app.get(`/api/${command}`, createProxyMiddleware({
    target: `http://${ESP_CAR_IP}`,
    changeOrigin: true,
    pathRewrite: {
      [`^/api/${command}`]: `/${command}`,
    },
    onProxyRes: (proxyRes) => {
      proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    },
    onError: (err, req, res) => {
      console.error(`${command} proxy error:`, err);
      res.status(500).json({ error: `Proxy error for ${command}` });
    },
  }));
});

// Camera stream proxy (MJPEG stream from ESP32-CAM) - Fixed: Use middleware directly, correct target
app.get('/api/stream', createProxyMiddleware({
  target: `http://${ESP_CAM_IP}`,  // Just the IP; pathRewrite appends /stream
  changeOrigin: true,
  pathRewrite: {
    '^/api/stream': '/stream',  // /api/stream -> /stream on CAM
  },
  onProxyRes: (proxyRes, req, res) => {
    proxyRes.headers['Content-Type'] = 'multipart/x-mixed-replace; boundary=123456789000000000000987654321';
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    proxyRes.headers['Pragma'] = 'no-cache';
    proxyRes.headers['Expires'] = '0';
  },
  onError: (err, req, res) => {
    console.error('Stream proxy error:', err);
    res.status(500).send('Stream unavailable - Check CAM IP connectivity');
  },
}));

// Fallback for root (optional dashboard with embedded stream)
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>ESP32 Control Backend</title></head>
      <body>
        <h1>Backend Running on Port ${PORT}</h1>
        <p>Flutter app should connect to <code>http://YOUR_IP:${PORT}/api</code></p>
        <p>Car IP: ${ESP_CAR_IP} | Cam IP: ${ESP_CAM_IP}</p>
        <h2>Live Stream Test:</h2>
        <img src="/api/stream" style="width:100%; max-width:640px; height:auto; border:1px solid #ccc;" alt="Live Feed">
        <p>If stream doesn't load, check console for errors and ensure Node can ping ${ESP_CAM_IP}.</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Node.js backend running at http://localhost:${PORT}`);
  console.log(`Car IP: ${ESP_CAR_IP} | Cam IP: ${ESP_CAM_IP}`);
  console.log(`Test stream at http://localhost:${PORT}/api/stream`);
  console.log(`Flutter: Set _backendURL to 'http://YOUR_PC_IP:${PORT}/api'`);
  console.log(`Tip: Run 'ping ${ESP_CAR_IP}' and 'ping ${ESP_CAM_IP}' from your terminal to verify connectivity.`);
});