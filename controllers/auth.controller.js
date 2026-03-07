const User = require("../model/user.model");
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET_KEY || "secret_key";

const SignUp = (req, res) => {
  const { username, email, password, "confirm-password": confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "Passwords and Confirm Password do not Match",
    });
  }

  try {
    const user = User.createUser(username, email, password);

    // extract only those details you want to send to frontend.
    const payload = {id: user.id, username: user.username, email: user.email};

    // Wrap the data to send in an encrypted token.
    const token = jwt.sign( payload,  JWT_SECRET, {expiresIn: '7d'});

    // send this token to frontend as cookie.
    return res.cookie("token", token, {
      httpOnly: true, // Prevents JavaScript access (XSS protection)
      // secure: true, 
      maxAge: 7 * 24 * 60 * 60 * 1000
    }).status(200).json({ success: true, message: "Login Successfull", user: payload });
    
  } catch (error) {
    console.log(`Error in Signup:\n${error}`);
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }
    return res.status(500).json({ success: false, message: "Database error" });
  }
};
const SignIn = (req, res) => {
  const { email, password } = req.body;
  try {
    const user = User.findUserByEmail(email);
    if (!user) {
      return res.status(400).json({success:false, message: "User not found"});
    }
    if (user.password != password){
      return res.status(400).json({success: false, message: "Passwords do not match"});
    }
    
    // extract only those details you want to send to frontend.
    const payload = {id: user.id, username: user.username, email: user.email};

    // wrap the details to send in encrypted token.
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // send the token to frontend as a cookie.
    return res.cookie("token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }).status(200).json({ success: true, message: "Login Successfull", user: payload });

  } catch (error) {
    console.log(`Error in SignIn:\n${error}`);
    return res.status(500).json({ success: false, message: "Database error" });
  }
};

const SignOut = (req, res) => {
  res.clearCookie("token");
  return res.status(200).json({success: true, message: "Logged Out successfully"});
}

module.exports = {
  SignIn,
  SignUp,
  SignOut
};
