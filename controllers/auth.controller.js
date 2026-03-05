const User = require("../model/user.model");

const SignUp = (req, res) => {
  const {
    username,
    email,
    password,
    "confirm-password": confirmPassword,
  } = req.body;
  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "Passwords and Confirm Password do not Match",
    });
  }

  try {
    const user = User.createUser(username, email, password);
    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.log(`Error in Signup:\n${error}`);
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res
        .status(400)
        .json({ success: false, message: "Email already exists" });
    }
    return res.status(500).json({ success: false, message: "Database error" });
  }
};
const SignIn = (req, res) => {
  const { email, password } = req.body;
  try {
    const user = User.findUserByEmail(email);
    if (!user || user.password != password) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Credentials" });
    }
    return res
      .status(200)
      .json({
        success: true,
        message: "Login Successfull",
        user: { id: user.id, username: user.username, email: user.email },
      });
  } catch (error) {
    console.log(`Error in SignIn:\n${error}`);
    return res.status(500).json({ success: false, message: "Database error" });
  }
};

module.exports = {
  SignIn,
  SignUp,
};
