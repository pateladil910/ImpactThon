const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  // 1. Check for token in cookie
  let token = req.cookies.token;

  // 2. Fallback to Authorization Header (e.g. Bearer <token> for Edge Agents)
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    // Verify token using secretkey
    const decoded = jwt.verify(token, "secretkey");

    // Add user info (id, role) from payload to request object
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: "Token is not valid" });
  }
};

module.exports = authMiddleware;
