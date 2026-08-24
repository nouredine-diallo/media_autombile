export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("Instrumentation registered (cron moved to layout to avoid segfault).");
  }
}
