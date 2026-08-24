export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("Skipping cron initialization to avoid segfault.");
    // const { initCron } = await import("./lib/startup");
    // initCron();
  }
}
