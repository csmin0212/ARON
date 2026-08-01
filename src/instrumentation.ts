export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installServerLogConsolePatch } = await import("@/lib/serverLog");
    installServerLogConsolePatch();
  }
}
