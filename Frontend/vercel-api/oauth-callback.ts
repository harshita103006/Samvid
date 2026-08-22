import express from "express";
import { registerOAuthRoutes } from "../server/_core/oauth.ts";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerOAuthRoutes(app);

export default app;
