const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  // Get token from cookie (requires cookie-parser, which we added to server.js)
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, "secretkey");

    // Add user info (id, role) from payload to request object
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: "Token is not valid" });
  }
};

module.exports = authMiddleware;
