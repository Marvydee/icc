require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const mainRoutes = require("./routes/main");
const adminRoutes = require("./routes/admin");

const app = express();
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

// Site-wide values available in every template without passing them
// through every single res.render() call.
app.locals.communityName = process.env.COMMUNITY_NAME || "Our Community";
app.locals.instagramUrl = process.env.INSTAGRAM_URL || "";
app.locals.telegramUrl = process.env.TELEGRAM_URL || "";

app.use(
  helmet({
    contentSecurityPolicy: false, // keep simple for now; tighten later if you add inline scripts
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// Rate limit the application + claim endpoints to deter abuse/spam
const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many attempts from this IP. Please try again later.",
});
app.use("/apply", applyLimiter);
app.use("/join", applyLimiter);

app.use("/", mainRoutes);
app.use("/", adminRoutes);

app.use((req, res) => {
  res.status(404).render("error", { message: "Page not found." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Community gate running on port ${PORT}`);
});
