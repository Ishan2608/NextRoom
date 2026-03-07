const authRouter = require("express").Router();
const { SignIn, SignUp, SignOut } = require("../controllers/auth.controller");

authRouter.post("/signin", SignIn);
authRouter.post("/signup", SignUp);
authRouter.post("/signout", SignOut);

module.exports = authRouter;
