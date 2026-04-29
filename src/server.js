require('dotenv').config();
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/db');
const app = require('./app');

const ALLOWED_ORIGINS = [
  'https://careboard.dev',
  'https://myclinicaccess.com',
  'https://www.myclinicaccess.com',
  'https://staging.myclinicaccess.com',
  'https://uat.myclinicaccess.com',
  'https://demo.clinicaccess.com',
  'https://primawellmc.com',
  'https://www.primawellmc.com',
  'https://dongonmc.com',
  'https://www.dongonmc.com',
  'http://localhost:5173',
  'http://localhost:5174',
];

const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
  pingTimeout:    20000,
  pingInterval:   10000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
});

app.set('socketio', io);

const isDev = process.env.NODE_ENV !== 'production';

io.on('connection', (socket) => {
  if (isDev) console.log('[socket] connected:', socket.id);

  socket.on('join:patient', (patientId) => {
    if (patientId) {
      socket.join(`patient:${patientId}`);
      if (isDev) console.log(`[socket] patient ${patientId} joined room`);
    }
  });

  socket.on('disconnect', (reason) => {
    if (isDev) console.log('[socket] disconnected:', socket.id, reason);
  });
});

const PORT = process.env.PORT || 3001;

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[server] custom-clinic-portal-api running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
