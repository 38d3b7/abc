/**
 * Skill content scanner. Any skill text the agent will read at loop time —
 * vendored or reference-only — must pass this scan first. A finding refuses
 * the import outright; there is no "install with warnings" path, because the
 * content lands in the model's context where a warning cannot follow it.
 *
 * Patterns are deliberately broad string/regex matches over the raw text.
 * False positives cost an operator review (vendor manually with a commit as
 * the record); false negatives put hostile text in front of the model.
 */

export interface ScanFinding {
  /** Stable pattern id, cited in refusals and PROVENANCE.json. */
  pattern: string
  /** The matched text, truncated. */
  match: string
  line: number
}

export interface ScanResult {
  ok: boolean
  findings: ScanFinding[]
}

// Lines are scanned one at a time, so `.` never crosses a newline; URLs
// contain dots, so the windows are `.`-based, not dot-excluding.
const PATTERNS: Array<{ id: string; re: RegExp }> = [
  // prompt override / instruction hijack
  { id: 'prompt-override', re: /ignore\s+(all|any|every|the)\s+(previous|prior|above|earlier|preceding)?\s*(instructions|prompts|rules|messages)/i },
  { id: 'prompt-override', re: /disregard\s+(all|any|previous|prior|the\s+above)\b/i },
  { id: 'prompt-override', re: /you\s+are\s+now\s+(a|an|the)\b/i },
  { id: 'prompt-override', re: /new\s+system\s+prompt/i },
  { id: 'prompt-override', re: /forget\s+(your|all|any)\s+(instructions|training|rules|guidelines)/i },
  { id: 'prompt-override', re: /\bjailbreak\b|\bDAN\s+mode\b/i },
  { id: 'prompt-override', re: /do\s+not\s+tell\s+the\s+(user|operator|owner)/i },
  // exfiltration of keys / secrets / wallet material
  { id: 'exfiltration', re: /exfiltrat/i },
  { id: 'exfiltration', re: /(send|post|upload|transmit|email|dm)\b.{0,80}\b(api[_ -]?key|private[_ -]?key|secret|seed\s+phrase|mnemonic|password|credentials?)\b/i },
  { id: 'exfiltration', re: /\b(api[_ -]?key|private[_ -]?key|secret|seed\s+phrase|mnemonic)\b.{0,80}\b(send|post|upload|transmit|email)\b/i },
  { id: 'exfiltration', re: /\b(curl|wget|nc|ncat)\b.{0,120}\b(key|secret|token|seed|credential)/i },
  // shell-outs and code execution smuggled into prose
  { id: 'shell-out', re: /child_process|subprocess|os\.system|spawnSync|\bexec(Sync)?\s*\(/ },
  { id: 'shell-out', re: /\brm\s+-rf\b|\bbash\s+-c\b|\bsh\s+-c\b|\/bin\/(ba|z)?sh\b/ },
  { id: 'shell-out', re: /\beval\s*\(\s*(atob|Buffer|require|process)/ },
  { id: 'shell-out', re: /process\.env\.[A-Z_]*(KEY|SECRET|TOKEN|SEED)/ },
  // wallet drainers phrased as instructions to the agent
  { id: 'drainer', re: /\btransfer\s+(all|everything|the\s+entire\s+balance)\b/i },
  { id: 'drainer', re: /\bdrain\b.{0,40}\b(wallet|balance|account)/i },
  { id: 'drainer', re: /\bsweep\b.{0,40}\b(wallet|funds|balance)/i }
]

export function scanSkillContent (content: string): ScanResult {
  const findings: ScanFinding[] = []
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    for (const { id, re } of PATTERNS) {
      const m = re.exec(line)
      if (m) {
        findings.push({ pattern: id, match: m[0].slice(0, 120), line: i + 1 })
      }
    }
  })
  return { ok: findings.length === 0, findings }
}
