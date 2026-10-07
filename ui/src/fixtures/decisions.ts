import { ago } from './time'
import type { Decision } from './types'

export const decisions: Decision[] = [
  {
    id: 'd_solver_degraded',
    key: 'DEC-041',
    title: 'A solve that misses its deadline returns a flagged degraded solution, never a silent fallback',
    rationale:
      'The failure mode that hurt us was not slowness, it was a fallback nobody could see. Every consumer of a solution can cope with "this is the best we found in 4 seconds" if it is told; none of them can cope with being told nothing. Making degradation part of the contract moves the decision about what to do with a bad route to the layer that has the context to make it.',
    rejectedAlternatives: [
      {
        title: 'Raise the request budget to 12 seconds',
        why: 'Moves the cliff rather than removing it, and the dispatch engine holds a lock for the duration. The largest tenant would still fall off the edge inside a quarter.',
      },
      {
        title: 'Fail the solve outright on deadline',
        why: 'A degraded route beats no route on the morning of a shift. Dispatchers told us they would rather have a mediocre plan they can fix by hand.',
      },
      {
        title: 'Cache the previous day\'s solution as the fallback',
        why: 'Plausible, and quietly wrong on any day the job mix differs — which is the day the solver is slow.',
      },
    ],
    componentIds: ['c_routing', 'c_dispatch'],
    evidenceRunIds: ['run_412_eval_3', 'run_base_dispatch'],
    state: 'accepted',
    authorId: 'u_wei',
    decidedAt: ago({ d: 5, h: 2 }),
    workOrderIds: ['wo_solver_timeout'],
  },
  {
    id: 'd_fairness_weight',
    key: 'DEC-046',
    title: 'Fairness weight of 0.35 in the assignment objective, per tenant, defaulting on',
    rationale:
      'At 0.35 the Gini coefficient of jobs per technician falls from 0.41 to 0.264 while total drive time rises 4.1% — inside the 6% we said we would tolerate. Higher weights bought little further fairness and cost drive time quickly. The number is arbitrary in the sense that any number is; it is not arbitrary in the sense that we measured four of them.',
    rejectedAlternatives: [
      {
        title: 'Hard cap on jobs per technician per day',
        why: 'Simple to explain and brittle in practice: the cap binds on exactly the days when someone needs to absorb an emergency.',
      },
      {
        title: 'Leave it to dispatchers to rebalance by hand',
        why: 'That is the status quo, and the status quo is the complaint.',
      },
    ],
    componentIds: ['c_dispatch', 'c_routing'],
    evidenceRunIds: ['run_415_eval'],
    state: 'proposed',
    authorId: 'u_wei',
    decidedAt: ago({ h: 6 }),
    workOrderIds: ['wo_dispatch_fairness'],
  },
  {
    id: 'd_eta_estimator',
    key: 'DEC-039',
    title: 'Arrival windows are computed from telematics-weighted travel times, not historical averages',
    rationale:
      'Normalised accuracy on the pinned corpus goes from 0.835 to 0.906, and the gain concentrates in the cases that generate support contact: bad weather and recovery after a late job. The contract is unchanged, so this is reversible per tenant by flag for one release.',
    rejectedAlternatives: [
      {
        title: 'Buy a third-party ETA service',
        why: 'Two vendors evaluated. Neither ingests our own technician telematics, which is the signal that produced most of the improvement.',
      },
      {
        title: 'Keep the average and widen the published window',
        why: 'Honest, and the wrong direction — a wider window is a worse promise, and the promise is the product.',
      },
    ],
    componentIds: ['c_eta', 'c_notify'],
    evidenceRunIds: ['run_398_eval', 'run_base_eta'],
    state: 'accepted',
    authorId: 'u_priya',
    decidedAt: ago({ h: 19 }),
    workOrderIds: ['wo_eta_v2'],
  },
  {
    id: 'd_quiet_hours_tz',
    key: 'DEC-047',
    title: 'Quiet hours resolve in recipient-local time, with tenant timezone as the fallback',
    rationale:
      'Any other reading is wrong for at least one party in a multi-timezone tenant. Recipient-local is the only interpretation that means the same thing to the person receiving the message, which is whose sleep the setting exists to protect.',
    rejectedAlternatives: [
      {
        title: 'Tenant timezone, as today',
        why: 'Correct only for single-timezone tenants, and silently wrong for the rest.',
      },
      {
        title: 'Per-crew timezone',
        why: 'Matches how tenants think about their own operations and not at all how the recipient experiences a 6am text.',
      },
    ],
    componentIds: ['c_notify'],
    evidenceRunIds: [],
    state: 'contested',
    settlingCondition:
      'Pull 30 days of suppressed and delivered notifications for the three multi-timezone tenants and count how many recipient-local resolutions would have moved a message outside the tenant business day. If it is under 2%, ship recipient-local; if it is higher, the migration needs a per-tenant opt-in.',
    positions: [
      {
        holder: 'u_sam',
        summary:
          'Recipient-local, no opt-in. The setting protects the recipient; interpreting it any other way is a bug we are choosing to keep. Tenants who dislike the new behaviour can widen their window.',
      },
      {
        holder: 'u_marguerite',
        summary:
          'Recipient-local behind a per-tenant opt-in for one release. Changing the meaning of an existing setting silently is the kind of thing that produces an angry call from an operations manager who had a working configuration on Friday.',
      },
    ],
    authorId: 'u_sam',
    decidedAt: ago({ d: 3, h: 6 }),
    workOrderIds: ['wo_quiet_hours'],
  },
  {
    id: 'd_board_virtualisation',
    key: 'DEC-048',
    title: 'The day board virtualises rows but keeps the full week of data in the store',
    rationale:
      'The memory cost is dominated by rendered DOM, not by the data. Windowing the renderer gets first paint under the target while leaving horizontal scroll instant, because the data never has to be refetched. Keeping the store whole also keeps keyboard navigation over unmounted rows tractable.',
    rejectedAlternatives: [
      {
        title: 'Paginate the week and fetch on scroll',
        why: 'Kills the scroll feel, which is the reason the board is used instead of the console.',
      },
      {
        title: 'Cap tenants at 150 visible technicians with a filter',
        why: 'Solves our problem by giving the customer a worse product. Rejected on principle and because the largest tenant is the reference account.',
      },
    ],
    componentIds: ['c_board'],
    evidenceRunIds: ['run_419_a11y'],
    state: 'contested',
    settlingCondition:
      'Measure heap on the 400-technician fixture after 20 minutes of continuous use. If retained heap exceeds 120MB, the store gets windowed too and we accept a refetch on long scrolls.',
    positions: [
      {
        holder: 'u_tomas',
        summary:
          'Render windowing only. The store is 8MB of plain objects; the DOM was the problem and windowing it fixed first paint from 9s to 1.2s already.',
      },
      {
        holder: 'u_priya',
        summary:
          'Window both. A dispatcher leaves this tab open for an eight hour shift with three tenants switched between — the number that matters is retained heap at hour three, and nobody has measured it.',
      },
    ],
    authorId: 'u_tomas',
    decidedAt: ago({ d: 2, h: 1 }),
    workOrderIds: ['wo_board_virtualise'],
  },
  {
    id: 'd_webhook_signing_scheme',
    key: 'DEC-045',
    title: 'Webhook signatures use HMAC-SHA256 over a timestamped raw body, with two keys valid at once',
    rationale:
      'It is the scheme every customer integration team has already implemented for someone else, which makes the verification recipe a page rather than a project. Two concurrent keys mean rotation is our operation, not a co-ordinated release with every customer.',
    rejectedAlternatives: [
      {
        title: 'Asymmetric signatures with a published JWKS',
        why: 'Better in a threat model where customers cannot hold a shared secret. Ours can, and every one of them asked for the simpler thing.',
      },
      {
        title: 'mTLS to customer endpoints',
        why: 'Correct and unshippable — half our customers terminate TLS at a CDN they do not control.',
      },
    ],
    componentIds: ['c_egress', 'c_auth'],
    evidenceRunIds: [],
    state: 'accepted',
    authorId: 'u_sam',
    decidedAt: ago({ d: 8, h: 4 }),
    workOrderIds: ['wo_egress_signing'],
  },
  {
    id: 'd_idempotency_window',
    key: 'DEC-043',
    title: 'Billing idempotency window is 30 days, matching event retention',
    rationale:
      'The June incident replayed events four hours old against a window that had rolled at 24 hours, because the window was a default nobody had chosen. Tying it to retention makes the two numbers impossible to drift apart, and the replay of the incident window now produces zero duplicate charges against the fixture.',
    rejectedAlternatives: [
      {
        title: 'Seven days',
        why: 'Cheaper, and shorter than the longest provider outage we have actually experienced.',
      },
      {
        title: 'Unbounded, keyed on a content hash',
        why: 'Storage grows without a ceiling and the dedupe index becomes the slowest thing in the write path.',
      },
    ],
    componentIds: ['c_billing'],
    evidenceRunIds: ['run_402_integration'],
    state: 'accepted',
    authorId: 'u_marguerite',
    decidedAt: ago({ d: 1, h: 8 }),
    workOrderIds: ['wo_billing_idem'],
  },
  {
    id: 'd_token_rotation',
    key: 'DEC-031',
    title: 'Service-to-service tokens rotate on overlapping validity windows with a published key set',
    rationale:
      'Rotation that requires ordered restarts does not happen. Overlapping keys plus a cached key-set endpoint removes the co-ordination, and the drill shows a full rotation with zero failed verifications and no restarts.',
    rejectedAlternatives: [
      {
        title: 'Long-lived tokens with manual rotation on incident',
        why: 'What we had. Rotated once in fourteen months, during an incident, badly.',
      },
      {
        title: 'Short-lived tokens refreshed per request',
        why: 'Adds a hard dependency on the auth service being up for every internal call.',
      },
    ],
    componentIds: ['c_auth', 'c_tf'],
    evidenceRunIds: ['run_355_integration', 'run_355_policy'],
    state: 'accepted',
    authorId: 'u_marguerite',
    decidedAt: ago({ d: 40 }),
    workOrderIds: ['wo_session_v2'],
  },
  {
    id: 'd_keyset_caching',
    key: 'DEC-034',
    title: 'The key-set endpoint is cached for 60 seconds',
    rationale:
      'The first attempt published the key set with no cache headers and every internal call fetched it, which took the auth service to 40k req/s in staging and caused the revert. Sixty seconds bounds the fetch rate while staying far inside the 24 hour rotation overlap.',
    rejectedAlternatives: [
      {
        title: 'No caching',
        why: 'Tried. Reverted the same day.',
      },
      {
        title: 'Cache for the full rotation window',
        why: 'Makes an emergency key revocation take a day to propagate.',
      },
    ],
    componentIds: ['c_auth'],
    evidenceRunIds: ['run_355_integration'],
    state: 'accepted',
    authorId: 'u_marguerite',
    decidedAt: ago({ d: 41 }),
    workOrderIds: ['wo_session_v2'],
  },
  {
    id: 'd_trace_context',
    key: 'DEC-036',
    title: 'Trace context travels in the message envelope, not in the payload',
    rationale:
      'Payload schemas are contracts with consumers; telemetry is not. Putting traceparent in the envelope means adding, changing or removing it never versions a consumer contract.',
    rejectedAlternatives: [
      {
        title: 'Add traceparent as a payload field',
        why: 'Every telemetry change becomes a contract change with four consumers.',
      },
      {
        title: 'Correlate by job id after the fact',
        why: 'What we were doing. It works until a job touches two queues.',
      },
    ],
    componentIds: ['c_obs', 'c_dispatch', 'c_eta'],
    evidenceRunIds: ['run_388_policy'],
    state: 'accepted',
    authorId: 'u_wei',
    decidedAt: ago({ d: 36 }),
    workOrderIds: ['wo_obs_traces'],
  },
  {
    id: 'd_tenant_label',
    key: 'DEC-038',
    title: 'Tenant identity is a span attribute, never a metric label',
    rationale:
      'Tenant as a metric label multiplied our active series by the tenant count and cost more in one week than the observability stack does in a quarter. As a span attribute it is still queryable where it matters.',
    rejectedAlternatives: [
      {
        title: 'Keep the label, drop other dimensions',
        why: 'Tenant is the highest-cardinality dimension we have; trimming around it does not help.',
      },
      {
        title: 'Label only the top twenty tenants',
        why: 'Produces metrics that silently mean different things for different tenants.',
      },
    ],
    componentIds: ['c_obs'],
    evidenceRunIds: [],
    state: 'accepted',
    authorId: 'u_wei',
    decidedAt: ago({ d: 24, h: 2 }),
    workOrderIds: ['wo_obs_traces'],
  },
  {
    id: 'd_contract_ownership',
    key: 'DEC-040',
    title: 'Consumers own the contract; the provider verifies against every registered consumer',
    rationale:
      'Provider-authored contracts describe what the provider intends, which is not the thing that breaks. Two production incidents came from changes that satisfied the provider spec and violated an assumption dispatch-web had been making for a year.',
    rejectedAlternatives: [
      {
        title: 'Provider-published OpenAPI as the contract',
        why: 'We had this. Both incidents passed it.',
      },
      {
        title: 'Shared integration environment as the gate',
        why: 'Slower, flakier, and it tells you something broke without telling you which assumption.',
      },
    ],
    componentIds: ['c_dispatch', 'c_board', 'c_console'],
    evidenceRunIds: ['run_409_contract'],
    state: 'accepted',
    authorId: 'u_tomas',
    decidedAt: ago({ d: 25 }),
    workOrderIds: ['wo_pact_consumers'],
  },
  {
    id: 'd_no_graphql',
    key: 'DEC-035',
    title: 'No GraphQL surface — three aggregate REST endpoints instead',
    rationale:
      'Both partners who asked for GraphQL wanted the same three shapes. We built those in a week. A general query surface would have committed us to depth limiting, cost analysis and a schema we could never narrow.',
    rejectedAlternatives: [
      {
        title: 'Read-only GraphQL with complexity limits',
        why: 'Spiked. The limits needed to make it safe made it less expressive than the three endpoints.',
      },
      {
        title: 'Let partners query the read replica directly',
        why: 'Ties our schema to their integrations permanently.',
      },
    ],
    componentIds: ['c_sched', 'c_dispatch', 'c_auth'],
    evidenceRunIds: [],
    state: 'accepted',
    authorId: 'u_tomas',
    decidedAt: ago({ d: 46 }),
    workOrderIds: ['wo_graphql'],
  },
  {
    id: 'd_eta_avg_superseded',
    key: 'DEC-018',
    title: 'Arrival windows use a rolling 90-day travel-time average',
    rationale:
      'Chosen when we had no telematics feed and three months of trip data. Cheap, explainable, and good enough to ship the first version of customer notifications.',
    rejectedAlternatives: [
      {
        title: 'Live traffic API',
        why: 'Per-request cost at our volume exceeded the notification revenue it protected.',
      },
    ],
    componentIds: ['c_eta'],
    evidenceRunIds: ['run_base_eta'],
    state: 'superseded',
    supersededBy: 'd_eta_estimator',
    authorId: 'u_priya',
    decidedAt: ago({ d: 180 }),
    workOrderIds: [],
  },
  {
    id: 'd_solver_inprocess_superseded',
    key: 'DEC-022',
    title: 'The routing solver runs in-process inside the API',
    rationale:
      'Solves finished in under 400ms for every tenant shape we had. A separate service would have added deployment surface for no measured benefit.',
    rejectedAlternatives: [
      {
        title: 'Solver as a separate service behind a queue',
        why: 'More moving parts than the workload justified at the time.',
      },
    ],
    componentIds: ['c_routing'],
    evidenceRunIds: [],
    state: 'superseded',
    supersededBy: 'd_solver_degraded',
    authorId: 'u_wei',
    decidedAt: ago({ d: 152 }),
    workOrderIds: [],
  },
]
