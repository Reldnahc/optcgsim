import type { Story } from "./spec_story_lib.ts";

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function hasSpecRef(story: Story, prefix: string): boolean {
  return story.spec_refs.some((ref) => ref.startsWith(prefix));
}

export function chooseIdPrefix(story: Story): string {
  const text = `${story.title} ${story.summary}`.toLowerCase();

  if (story.type === "ambiguity") {
    return "AMB";
  }

  switch (story.area) {
    case "contracts":
      return "CON";
    case "cards":
      return "CAR";
    case "database":
      return "DB";
    case "docs":
      return "DOC";
    case "infra":
      return "INF";
    case "replay":
      return "RPL";
    case "security":
      return "SEC";
    case "client":
      return "CLI";
    case "server":
      if (has(text, /\blobby\b|\bpassword\b|\brematch\b/)) {
        return "LOB";
      }
      if (
        has(
          text,
          /\bqueue\b|\bmatchmaking\b|\bticket\b|\bqueue control\b|\bban(?:s|ned)?\b/
        )
      ) {
        return "QUE";
      }
      if (
        has(
          text,
          /\bformat\b|\bladder\b|\belo\b|\branked\b|\bdisconnect discipline\b/
        )
      ) {
        return "FMT";
      }
      return "SRV";
    case "engine":
      if (
        hasSpecRef(story, "04-effect-runtime.") ||
        has(
          text,
          /\beffect queue\b|\beffect runtime\b|\beffect block\b|\bdsl\b|\breplacement effect\b|\bcontinuous effect\b|\btrigger order\b|\btrigger ordering\b|\btransient-set\b|\bsource presence\b|\brevealrecord\b|\bconditiontiming\b/
        )
      ) {
        return "EFF";
      }
      return "ENG";
    default:
      return "STY";
  }
}
