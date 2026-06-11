// brain-gym — plugin entry
export default class BrainGymPlugin {
  async onload() {
    const ctx = this.ctx;
    if (!ctx) {
      console.error("[brain-gym] ctx is undefined");
      return;
    }
    if (ctx.log) ctx.log.info("[brain-gym] loaded");
    // Routes are auto-discovered from routes/ directory (manifest declares "routes": true)
    // Tools are auto-discovered from tools/ directory (manifest declares tools by name)
  }
}
