const jwt = require('jsonwebtoken');

const auth = (requiredRoles = []) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (requiredRoles.length && (!decoded.role || !requiredRoles.includes(decoded.role))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
};

module.exports = auth;
