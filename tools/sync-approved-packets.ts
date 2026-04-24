import { parseArgs, printJson } from "./spec_story_lib.ts";
import { buildPacketsForApprovedStories } from "./build-agent-packet.ts";

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const ids =
    typeof args.get("ids") === "string"
      ? String(args.get("ids"))
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;

  const packets = buildPacketsForApprovedStories(ids);
  printJson({
    ok: true,
    packets
  });
}

main();
