// Tests for M6 trace phase-order validation.

import { describe, it, expect } from 'vitest';
import { checkPhaseOrder, edgeToPhase } from './phase_check';
import type { InteractionTrace, TraceEdge } from '../trace';

function edge(index: number, kind: TraceEdge['kind']): TraceEdge {
  return { index, ts: new Date().toISOString(), kind };
}

function traceOf(kinds: TraceEdge['kind'][]): InteractionTrace {
  return {
    trace_id: 'test',
    started_at: new Date().toISOString(),
    edges: kinds.map((k, i) => edge(i, k))
  };
}

describe('edgeToPhase', () => {
  it('maps user_message → retrieve', () => {
    expect(edgeToPhase('user_message')).toBe('retrieve');
  });
  it('maps llm_call/mcp_call/act/assistant_message → act', () => {
    expect(edgeToPhase('llm_call')).toBe('act');
    expect(edgeToPhase('mcp_call')).toBe('act');
    expect(edgeToPhase('act')).toBe('act');
    expect(edgeToPhase('assistant_message')).toBe('act');
  });
  it('maps observe → learn', () => {
    expect(edgeToPhase('observe')).toBe('learn');
  });
  it('tolerates the "perception" alias used by the teach flow', () => {
    expect(edgeToPhase('perception')).toBe('retrieve');
  });
});

describe('checkPhaseOrder', () => {
  it('empty trace is ok with zero cycles', () => {
    const r = checkPhaseOrder({ trace_id: 't', started_at: '', edges: [] });
    expect(r.ok).toBe(true);
    expect(r.cycles).toBe(0);
  });

  it('a monotone one-cycle trace passes', () => {
    const t = traceOf(['user_message', 'llm_call', 'assistant_message', 'observe']);
    const r = checkPhaseOrder(t);
    expect(r.ok).toBe(true);
    expect(r.cycles).toBe(1);
    expect(r.violations).toHaveLength(0);
  });

  it('two cycles delimited by a new user_message both pass independently', () => {
    const t = traceOf([
      'user_message', 'assistant_message',
      'user_message', 'assistant_message'
    ]);
    const r = checkPhaseOrder(t);
    expect(r.ok).toBe(true);
    expect(r.cycles).toBe(2);
  });

  it('detects backward phase: observe (learn) → assistant_message (act) within one cycle', () => {
    const t = traceOf(['user_message', 'observe', 'assistant_message']);
    const r = checkPhaseOrder(t);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].from_phase).toBe('learn');
    expect(r.violations[0].to_phase).toBe('act');
  });

  it('cycle index is correctly attributed to the second cycle', () => {
    const t = traceOf([
      'user_message', 'assistant_message',
      'user_message', 'observe', 'assistant_message'
    ]);
    const r = checkPhaseOrder(t);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].cycle_index).toBe(1);
  });
});
