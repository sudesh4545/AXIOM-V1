import { env } from 'cloudflare:workers';

import { ensureDatabase } from '../../../../db';
import { enforceRateLimit, secureJson } from '../../../lib/server/http-security';
import { requestIdentity } from '../../../lib/server/request-identity';
import { resolveWorkspaceAccess } from '../../../lib/server/workspace-access';

export const dynamic = 'force-dynamic';

type AiContext = {
  workspace?: { id?: string; name?: string; objective?: string; environment?: string };
  dataSource?: string;
  dataSourceNote?: string;
  metrics?: Array<{ label?: string; displayValue?: string; deltaPct?: number; direction?: string; comparisonLabel?: string; isImprovement?: boolean }>;
  growth?: { metricLabel?: string; currentDisplay?: string; rangeLabel?: string };
  bottleneck?: { stage?: string; severity?: string; summary?: string; evidenceWindowDays?: number };
  recommendation?: { title?: string; description?: string; predictedUpliftPct?: number; confidencePct?: number; riskLevel?: string; focusMetric?: string };
  experiments?: Array<{ name?: string; focusMetric?: string; status?: string; progressPct?: number; observedLiftPct?: number; isConclusive?: boolean }>;
  decisions?: Array<{ title?: string; outcome?: string; impactPct?: number; summary?: string }>;
};

function json(body: unknown, status = 200) {
  return secureJson(body, status);
}

function fallbackReply(question: string, context: AiContext): string {
  const lower = question.toLowerCase();
  const bottleneck = context.bottleneck;
  const recommendation = context.recommendation;
  const metric = context.metrics?.find((item) => lower.includes((item.label ?? '').toLowerCase()));
  const evidenceLabel = context.dataSource === 'demo_seed'
    ? 'These numbers are demo seed data, so validate the recommendation with real customer events before making a production decision.'
    : 'This answer uses the latest governed workspace evidence.';

  if (metric) {
    return `${metric.label} is ${metric.displayValue}, moving ${metric.direction ?? 'flat'} by ${Math.abs(metric.deltaPct ?? 0)}% versus ${metric.comparisonLabel ?? 'the prior period'}. ${metric.isImprovement ? 'The direction is favorable.' : 'The direction needs attention.'} ${evidenceLabel}`;
  }
  if (lower.includes('experiment') || lower.includes('recommend') || lower.includes('next')) {
    return `${recommendation?.title ?? 'The current recommendation'} targets ${recommendation?.focusMetric ?? 'the leading constraint'} with a predicted ${recommendation?.predictedUpliftPct ?? 0}% uplift, ${recommendation?.confidencePct ?? 0}% confidence, and ${recommendation?.riskLevel ?? 'unknown'} risk. Review the evidence and guardrails before approving a bounded canary. ${evidenceLabel}`;
  }
  if (lower.includes('bottleneck') || lower.includes('why') || lower.includes('problem')) {
    return `${bottleneck?.stage ?? 'The current funnel stage'} is the strongest detected bottleneck with ${bottleneck?.severity ?? 'unknown'} severity. ${bottleneck?.summary ?? ''} The signal uses a ${bottleneck?.evidenceWindowDays ?? 30}-day window. ${evidenceLabel}`;
  }
  return `${bottleneck?.summary ?? 'AXIOM is monitoring the workspace.'} The current next step is ${recommendation?.title ?? 'to collect more governed evidence'}. ${evidenceLabel}`;
}

function readOutputText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';
  return output.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => part && typeof part === 'object' && (part as { type?: string }).type === 'output_text' && typeof (part as { text?: unknown }).text === 'string' ? [(part as { text: string }).text] : []);
  }).join('\n').trim();
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 32_000) return json({ message: 'Question context is too large.' }, 413);
    const body = JSON.parse(raw) as { question?: unknown; context?: unknown };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return json({ message: 'A question is required.' }, 400);
    if (question.length > 2_000) return json({ message: 'Keep the question under 2,000 characters.' }, 400);
    const context = body.context && typeof body.context === 'object' ? body.context as AiContext : {};
    const workspaceId = context.workspace?.id;
    if (!workspaceId) return json({ message: 'A workspace is required.' }, 400);
    const identity = requestIdentity(request);
    if (!identity) return json({ message: 'Sign in to use AXIOM AI.' }, 401);
    await ensureDatabase();
    const access = await resolveWorkspaceAccess(identity, workspaceId);
    if (access.active.id !== workspaceId) return json({ message: 'That workspace is not available.' }, 403);
    const limited = await enforceRateLimit(request, 'axiom-ai:ask', 20, 60);
    if (limited) return limited;
    const fallback = fallbackReply(question, context);
    const apiKey = env.OPENAI_API_KEY?.trim();

    if (!apiKey) return json({ reply: fallback, mode: 'evidence_fallback' });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.AXIOM_AI_MODEL?.trim() || 'gpt-5.6-sol',
        reasoning: { effort: 'medium' },
        text: { verbosity: 'medium' },
        store: false,
        max_output_tokens: 900,
        instructions: 'You are AXIOM AI, an evidence-aware growth operating copilot for B2B SaaS teams. Answer the operator directly in the language they use. Use only the supplied workspace context for business claims. Clearly distinguish demo seed data from measured data. Never present predicted uplift, simulation, or correlation as causal proof. Recommend bounded, reversible next steps and preserve human approval for experiments. Be concise, practical, and specific.',
        input: `Operator question:\n${question}\n\nGoverned workspace context:\n${JSON.stringify(context)}`,
      }),
    });

    if (!response.ok) {
      console.error('AXIOM AI model request failed', response.status);
      return json({ reply: fallback, mode: 'evidence_fallback' });
    }
    const payload = await response.json();
    const reply = readOutputText(payload);
    return json({ reply: reply || fallback, mode: reply ? 'model' : 'evidence_fallback' });
  } catch (error) {
    console.error('AXIOM AI request failed', error);
    return json({ message: 'AXIOM AI could not process that question.' }, 500);
  }
}
