import dotenv from "dotenv";
import express from "express";

console.log("start");

dotenv.config();
const app = express();
const port = Number(process.env.PORT) || 3000;

app.get("/", (req, res) => {
  res.send("test");
});

console.log(port);
app.listen(port, () => {
  console.log(`Listening ${port}`);
});
