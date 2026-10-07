import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { assembleContext } from '../context/assemble.js'
import { assembleGenerativeContext } from '../context/generative.js'
import { finishWork, startWork } from '../domain/changes.js'
import type { Ctx } from '../domain/ctx.js'
import { DomainError } from '../domain/errors.js'
import { captureIdea } from '../domain/ideas.js'
import { createDecision } from '../domain/decisions.js'
import { findRepoByRemote } from '../domain/repos.js'
import { runDoneWhen } from '../domain/runs.js'
import { search } from '../domain/search.js'
import { createWorkOrder } from '../domain/workOrders.js'
import type { Services } from '../services.js'

/**
 * The MCP surface: seven tools, fixed.
 *
 * Small and stable is a requirement, not a preference — tool definitions that
 * vary per session or per repo break prompt caching for every agent that
 * connects. Nothing here is generated from the corpus.
 *
 * The session's repo is inferred from its git remote wherever it can be, and
 * `neon_propose` and `neon_search` work with no repo context at all.
 */

const repoArg = z
  .string()
  .optional()
  .describe('git remote url of the working repo; inferred by the plugin, omit if there is none')

export function createMcpServer(services: Services, ctx: Ctx): McpServer {
  const server = new McpServer(
    { name: 'neon', version: '0.1.0' },
    {
      instructions: [
        'Neon serves bounded context for a unit of work and executes its definition of done.',
        'Call neon_get_context before starting work, neon_check before claiming to be finished,',
        'and neon_propose the moment an idea appears — it costs nothing and returns prior rejections.',
      ].join(' '),
    },
  )

  const resolveRepo = async (remote?: string) => {
    if (!remote) return null
    return (await findRepoByRemote(ctx.db, remote)) ?? null
  }

  const ok = (payload: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  })

  const fail = (message: string) => ({
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  })

  const guard = async (fn: () => Promise<{ content: { type: 'text'; text: string }[] }>) => {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof DomainError) return fail(`${err.code}: ${err.message}`)
      throw err
    }
  }

  // -- The highest-value tool in the system ---------------------------------
  server.registerTool(
    'neon_get_context',
    {
      title: 'Get the context pack for a unit of work',
      description:
        'Returns the intent, the executable definition of done, the decisions that constrain the components in scope, the contracts you must not break, recent related work and open questions. References and summaries only — fetch detail with neon_search.',
      inputSchema: {
        work_order_key: z.string().describe('e.g. ATL-102'),
        repo: repoArg,
      },
    },
    async ({ work_order_key }) =>
      guard(async () =>
        ok(
          await assembleContext(ctx.db, work_order_key, {
            budgetTokens: services.config.contextTokenBudget,
            requestedBy: ctx.actorId,
          }),
        ),
      ),
  )

  server.registerTool(
    'neon_start_work',
    {
      title: 'Claim a work order',
      description:
        'Claims the work order, creates a Change, and returns the branch name and the path where its spec or record belongs. Refuses drafts: a work order without a done_when is not something anyone can commit to.',
      inputSchema: {
        work_order_key: z.string(),
        repo: repoArg,
      },
    },
    async ({ work_order_key, repo }) =>
      guard(async () => {
        const repoRow = await resolveRepo(repo)
        if (!repoRow) {
          return fail(
            'no registered repo matches this session. Register it first, or pass the git remote as `repo`.',
          )
        }
        const result = await startWork(ctx, { workOrderKey: work_order_key, repoId: repoRow.id })
        return ok({
          changeId: result.change.id,
          branch: result.branch,
          specPath: result.specPath,
          resumed: result.resumed,
          workOrder: {
            key: result.workOrder.key,
            kind: result.workOrder.kind,
            title: result.workOrder.title,
          },
        })
      }),
  )

  server.registerTool(
    'neon_check',
    {
      title: 'Run the definition of done',
      description:
        'Resolves and executes the work order\'s done_when against this change. Returns pass/fail per check with the run ids. This is what the Stop hook calls: do not claim work is finished without it.',
      inputSchema: {
        change_id: z.string(),
        workdir: z.string().optional().describe('absolute path to the checkout, for checks that run commands'),
        config_commit: z.string().optional().describe('HEAD sha, so the run can be cited later'),
        artifact_version: z.string().optional(),
      },
    },
    async ({ change_id, workdir, config_commit, artifact_version }) =>
      guard(async () =>
        ok(
          await runDoneWhen(ctx, {
            changeId: change_id,
            workdir: workdir ?? null,
            trigger: 'local',
            pins: {
              configCommit: config_commit ?? null,
              artifactVersion: artifact_version ?? null,
            },
          }),
        ),
      ),
  )

  server.registerTool(
    'neon_finish_work',
    {
      title: 'Record completion and draft the artifacts',
      description:
        'Records that the work is finished and returns drafts for a human to edit: what the spec delta should say, which decisions are worth recording, and a PR body citing the runs. It does not write to the repo.',
      inputSchema: {
        change_id: z.string(),
        summary: z.string().describe('what changed and why, in a few sentences'),
        pr_url: z.string().optional(),
      },
    },
    async ({ change_id, summary, pr_url }) =>
      guard(async () => {
        const change = await finishWork(ctx, {
          changeId: change_id,
          summary,
          prUrl: pr_url ?? null,
        })
        const report = await runDoneWhen(ctx, { changeId: change_id })
        return ok({
          change: { id: change.id, state: change.state, branch: change.branch },
          drafts: {
            prBody: [
              summary,
              '',
              `Work order: ${report.workOrderKey}`,
              '',
              'Evidence:',
              ...report.results.map(
                (r) => `- ${r.check}: ${r.result}${r.citable ? '' : ' (not citable)'} — run ${r.runId}`,
              ),
            ].join('\n'),
            commitTrailer: `Neon-Work-Order: ${report.workOrderKey}`,
            decisionCandidates:
              'If anything in this change was a judgment call with a rejected alternative, record it with neon_propose(kind: "decision").',
          },
          checks: report,
        })
      }),
  )

  server.registerTool(
    'neon_search',
    {
      title: 'Search decisions, contracts, components, ideas and rejected alternatives',
      description:
        'Returns references and summaries, not full content. Rejected alternatives are searchable on purpose: the most useful answer to "should we try X" is often "we did, and here is why it did not work". Works with no repo context.',
      inputSchema: {
        query: z.string(),
        kind: z
          .enum(['decision', 'rejected_alternative', 'idea', 'component', 'contract', 'work_order'])
          .optional(),
        limit: z.number().optional(),
      },
    },
    async ({ query, kind, limit }) =>
      guard(async () => ok({ hits: await search(ctx.db, query, { kind, limit }) })),
  )

  // -- The front door -------------------------------------------------------
  server.registerTool(
    'neon_propose',
    {
      title: 'Propose an idea, a decision or a work order',
      description:
        'Writes a draft record. kind "idea" needs a title and nothing else, works with no repo context, and returns close matches and prior rejections immediately. Use it the moment something worth remembering appears — capture is meant to cost nothing.',
      inputSchema: {
        kind: z.enum(['idea', 'decision', 'work_order']),
        title: z.string(),
        body: z.string().optional().describe('idea: the thought. decision: the rationale.'),
        rejected_alternatives: z
          .array(z.object({ title: z.string(), why: z.string() }))
          .optional()
          .describe('decision: what was considered and discarded, and why'),
        intent: z.string().optional().describe('work_order: why we are doing this'),
        acceptance_criteria: z.array(z.string()).optional(),
        work_order_kind: z.enum(['code', 'inquiry']).optional(),
        tags: z.array(z.string()).optional(),
        repo: repoArg,
      },
    },
    async (args) =>
      guard(async () => {
        const repoRow = await resolveRepo(args.repo)

        if (args.kind === 'idea') {
          const result = await captureIdea(ctx, {
            title: args.title,
            body: args.body ?? '',
            source: 'session',
            tags: args.tags ?? [],
            repoId: repoRow?.id ?? null,
          })
          return ok({
            idea: { id: result.idea.id, title: result.idea.title, expiresAt: result.idea.expiresAt },
            closeMatches: result.matches,
            priorRejections: result.priorRejections,
            note:
              result.priorRejections.length > 0
                ? 'Something like this was already rejected. Read why before continuing — either it still holds, or the constraint has expired and you now have a much better idea.'
                : null,
          })
        }

        if (args.kind === 'decision') {
          const decision = await createDecision(ctx, {
            title: args.title,
            rationale: args.body ?? '',
            rejectedAlternatives: args.rejected_alternatives ?? [],
            state: 'proposed',
          })
          return ok({
            decision: { id: decision.id, key: decision.key, state: decision.state },
            note: 'Recorded as proposed. A decision with no rejected alternative is usually a decision nobody made.',
          })
        }

        const workOrder = await createWorkOrder(ctx, {
          kind: args.work_order_kind ?? 'code',
          title: args.title,
          intent: args.intent ?? args.body ?? '',
          acceptanceCriteria: args.acceptance_criteria ?? [],
          repoId: repoRow?.id ?? null,
        })
        return ok({
          workOrder: { id: workOrder.id, key: workOrder.key, state: workOrder.state },
          note: 'Draft. It needs an executable done_when before anyone can claim it.',
        })
      }),
  )

  server.registerTool(
    'neon_generative_context',
    {
      title: 'Material to think with',
      description:
        'Raw material for generating ideas rather than executing them: rejected alternatives whose blocking constraint may have expired, contested decisions, recurring friction, and ideas near expiry. Provocation, not recommendation — do not treat it as a ranked list.',
      inputSchema: {
        focus: z.string().optional().describe('optional area to bias the material towards'),
      },
    },
    async ({ focus }) =>
      guard(async () =>
        ok(
          await assembleGenerativeContext(ctx.db, {
            focus: focus ?? null,
            requestedBy: ctx.actorId,
          }),
        ),
      ),
  )

  return server
}
