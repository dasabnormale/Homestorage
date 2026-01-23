import { init } from "./router.js";
import { loadState } from "./state.js";

async function start() {
  await loadState();
  init();
}

start();
