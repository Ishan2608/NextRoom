const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET_KEY || "secret_key";

const authMiddleware = (req, res, next) => {
  const token = req.cookies.token;
  // Check if browser sent a cookie with name 'token'
  // the name 'token' is something that we define in signup and signin methods
  // when we send a cookie to frontend after successful login.
  // since browser is sending back that same thing, use same identifier, here 'token';
  if (!token) {
    return res.status(401).json({ success: false, message: "No token, authorization denied" });
  }
  try{
    // Verify if this token has same secret as defined in backend.
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded){
      // You can assign any method or property to the req object. Here, we provide it user.
      req.user = decoded;
      // Proceed to next function - another middleware of controller.
      next();
    }
    
  }
  catch (error){
    console.log(`ERROR in authMiddleware: ${error}`);
    return res.status(401).json({ success: false, message: "Token is not valid" });
  }
}

module.exports = { authMiddleware };
