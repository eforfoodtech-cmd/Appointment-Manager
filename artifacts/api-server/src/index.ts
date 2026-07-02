import app from "./app";
import { logger } from "./lib/logger";
import { seedDemoUsers } from "./seed";

const rawPort = process.env["PORT"] === "3000" ? "8080" : process.env["PORT"] ?? "8080";

const port = Number(rawPort);
console.log("port:",port);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  await seedDemoUsers();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start();
