declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    OPENAI_API_KEY?: string;
    AXIOM_AI_MODEL?: string;
  }
}
