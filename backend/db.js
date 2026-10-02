const dns = require("dns");
const { MongoClient } = require("mongodb");

// Algunas redes bloquean las consultas DNS SRV que usa el resolutor
// por defecto de Node; forzamos DNS públicos para evitar ECONNREFUSED.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db;

async function connectDB() {
  await client.connect();
  db = client.db(process.env.MONGO_DB_NAME || "chat");
  console.log("Conectado a MongoDB Atlas");
  return db;
}

function getDB() {
  if (!db) throw new Error("La base de datos no ha sido inicializada. Llama a connectDB() primero.");
  return db;
}

module.exports = { connectDB, getDB };
