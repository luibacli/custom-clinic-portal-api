require('dotenv').config();

const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}

const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const app = require('./app');

const WILDCARD_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?myclinicaccess\.com$/;

const isAllowedOrigin = (origin) => {
  if (!origin) return false;
  if (origin === 'http://localhost:5173' || origin === 'http://localhost:5174') return true;
  return WILDCARD_ORIGIN.test(origin);
};

const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
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
  if (isDev) logger.debug({ socketId: socket.id }, '[socket] connected');

  socket.on('join:patient', (patientId) => {
    if (patientId) {
      socket.join(`patient:${patientId}`);
      if (isDev) logger.debug({ patientId }, '[socket] patient joined room');
    }
  });

  socket.on('disconnect', (reason) => {
    if (isDev) logger.debug({ socketId: socket.id, reason }, '[socket] disconnected');
  });

  socket.on('error', (err) => {
    logger.error({ err, socketId: socket.id }, '[socket] error');
  });
});

const PORT = process.env.PORT || 3001;

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      logger.info(`[server] custom-clinic-portal-api running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  })
  .catch((err) => {
    logger.error({ err }, '[server] Failed to connect to MongoDB');
    process.exit(1);
  });
