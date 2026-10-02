require("dotenv").config();
const path = require("path");
const express = require("express");
const { connectDB } = require("./db");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "fronted")));

const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  // fotos y audios viajan como base64 dentro del mensaje, necesitan más espacio que el 1MB por defecto
  maxHttpBufferSize: 15 * 1024 * 1024,
});

const MAX_HISTORY = 100;
// room -> Map<socket.id, username>
const roomUsers = new Map();

function getUsersInRoom(room) {
  return Array.from(roomUsers.get(room)?.values() ?? []);
}

connectDB()
  .then((db) => {
    const messages = db.collection("messages");

    app.get("/api/rooms/:room/messages", async (req, res) => {
      const history = await messages
        .find({ room: req.params.room })
        .sort({ createdAt: -1 })
        .limit(MAX_HISTORY)
        .toArray();
      res.json(history.reverse());
    });

    io.on("connection", (socket) => {
      socket.on("join-room", async ({ room, username }) => {
        if (!room || !username) return;
        socket.data.room = room;
        socket.data.username = username;
        socket.join(room);

        if (!roomUsers.has(room)) roomUsers.set(room, new Map());
        roomUsers.get(room).set(socket.id, username);

        const history = await messages
          .find({ room })
          .sort({ createdAt: -1 })
          .limit(MAX_HISTORY)
          .toArray();
        socket.emit("room-history", history.reverse());

        socket.to(room).emit("system-message", `${username} se unió a la sala`);
        io.to(room).emit("online-users", getUsersInRoom(room));
      });

      socket.on("message", async ({ room, username, message, type, mediaData }) => {
        if (!room || !username) return;

        const kind = type === "image" || type === "audio" ? type : "text";
        const text = (message || "").trim();

        if (kind === "text" && !text) return;
        if (kind !== "text" && !mediaData) return;

        const doc = {
          room,
          username,
          type: kind,
          message: text,
          mediaData: kind === "text" ? null : mediaData,
          createdAt: new Date(),
        };
        await messages.insertOne(doc);
        io.to(room).emit("messages", doc);
      });

      socket.on("typing", ({ room, username }) => {
        if (room && username) socket.to(room).emit("typing", username);
      });

      socket.on("stop-typing", ({ room }) => {
        if (room) socket.to(room).emit("stop-typing");
      });

      socket.on("disconnect", () => {
        const { room, username } = socket.data;
        if (room && roomUsers.has(room)) {
          roomUsers.get(room).delete(socket.id);
          io.to(room).emit("online-users", getUsersInRoom(room));
          socket.to(room).emit("system-message", `${username} salió de la sala`);
          if (roomUsers.get(room).size === 0) roomUsers.delete(room);
        }
      });
    });

    http.listen(3000, () => {
      console.log("Server Running en http://localhost:3000");
    });
  })
  .catch((err) => {
    console.error("Error al conectar a MongoDB:", err);
    process.exit(1);
  });
