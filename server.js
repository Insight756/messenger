const express = require("express");
const http = require("http");
const session = require("express-session");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const MONGO_URI =
  "mongodb+srv://winwan2006wanwin_db_user:iyUrcloBOVwWBQXF@cluster0.njgkkv5.mongodb.net/messenger?retryWrites=true&w=majority";

const SESSION_SECRET = "secret123456";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB подключена"))
  .catch((err) => console.error("Ошибка MongoDB:", err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true }
});

const messageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Введите логин и пароль" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "Пользователь уже существует" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, passwordHash });
    await user.save();

    req.session.user = { username };
    res.json({ message: "Регистрация успешна", username });
  } catch (error) {
    res.status(500).json({ error: "Ошибка регистрации" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: "Пользователь не найден" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ error: "Неверный пароль" });
    }

    req.session.user = { username };
    res.json({ message: "Вход выполнен", username });
  } catch (error) {
    res.status(500).json({ error: "Ошибка входа" });
  }
});

app.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  res.json({ user: req.session.user });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Выход выполнен" });
  });
});

app.get("/messages", async (req, res) => {
  const messages = await Message.find().sort({ createdAt: 1 }).limit(100);
  res.json(messages);
});

io.on("connection", (socket) => {
  socket.on("chat message", async (data) => {
    try {
      if (!data.username || !data.text) return;

      // команда очистки чата
      if (data.text === "/homelender") {
        await Message.deleteMany({});
        io.emit("chat cleared");
        return;
      }

      const newMessage = new Message({
        username: data.username,
        text: data.text
      });

      await newMessage.save();
      io.emit("chat message", newMessage);
    } catch (error) {
      console.error("Ошибка сохранения сообщения:", error);
    }
  });
});