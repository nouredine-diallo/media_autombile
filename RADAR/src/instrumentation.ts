export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("Initializing cron and db via instrumentation (safe with serverExternalPackages)...");
    const { initCron } = await import("./lib/startup");
    initCron();
  }
}
