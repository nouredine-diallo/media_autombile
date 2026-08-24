export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("Initializing cron and db...");
    const { initCron } = await import("./lib/startup");
    initCron();
  }
}
