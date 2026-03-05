const authRouter = require("express").Router();
const { SignIn, SignUp } = require("../controllers/auth.controller");

authRouter.post("/signin", SignIn);
authRouter.post("/signup", SignUp);

module.exports = authRouter;
