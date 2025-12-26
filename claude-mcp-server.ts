#!/usr/bin/env node
import { run } from "./src/server.js";

run().catch((error) => {
  console.error("Server failed to start", error);
  process.exit(1);
});
