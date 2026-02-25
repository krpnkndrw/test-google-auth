import path from "path";

export const htmlDir = path.join(process.cwd(), "src/html");
export const allowedOrigins = [process.env.BACKEND_URL];
