// src/components/CoachAdviceCard.jsx
import { useState } from 'react'

// ─── Type tokens ──────────────────────────────────────────────────────────────

const T = {
  down: { color: '#FF4B3E', bg: 'rgba(255,75,62,0.07)',  border: 'rgba(255,75,62,0.28)' },
  up:   { color: '#22C55E', bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.22)' },
  hold: { color: '#3E7CB1', bg: 'rgba(62,124,177,0.05)', border: 'rgba(62,124,177,0.18)' },
}

const TYPE_ICON = { down: '↓', up: '↑', hold: '=' }

function rpeColor(rpe) {
  if (rpe == null) return '#22C55E'
  if (rpe >= 9) return '#FF4B3E'
  if (rpe >= 8) return '#D9A441'
  return '#22C55E'
}

// ─── Data adapter (raw coachAdvice → spec format) ─────────────────────────────

function mapAction(action) {
  switch (action) {
    case 'gewicht_omlaag': return { type: 'down', subLabel: 'gewicht omlaag' }
    case 'gewicht_omhoog': return { type: 'up',   subLabel: 'gewicht omhoog' }
    case 'reps_omhoog':    return { type: 'up',   subLabel: 'reps omhoog' }
    case 'handhaven':      return { type: 'hold', subLabel: 'handhaven' }
    case 'consolideren':   return { type: 'hold', subLabel: 'consolideren' }
    default:               return { type: 'hold', subLabel: action }
  }
}

function targetHintFor(subLabel) {
  switch (subLabel) {
    case 'gewicht omhoog': return 'volgende stap in gewicht'
    case 'reps omhoog':    return 'push naar bovenkant range'
    case 'handhaven':      return 'handhaven op huidig gewicht'
    case 'consolideren':   return 'nog een ronde consolideren'
    case 'gewicht omlaag': return 'gewicht verlagen'
    default:               return null
  }
}

function buildTarget(action, bestSet, targetWeight, targetReps, repRange) {
  switch (action) {
    case 'gewicht_omhoog':
      return targetWeight ? `${targetWeight} kg × ${repRange.min}–${repRange.max}` : null
    case 'reps_omhoog':
      return `${bestSet.weight_kg} kg × ${targetReps || `${repRange.min}–${repRange.max}`}`
    case 'gewicht_omlaag':
      return targetWeight ? `${targetWeight} kg × ${repRange.min}–${repRange.max}` : null
    default:
      return null
  }
}

function adaptAdvices(rawAdvices) {
  // Group exercises by action — same action → one card
  const groups = new Map()
  for (const a of rawAdvices) {
    if (!groups.has(a.action)) groups.set(a.action, [])
    groups.get(a.action).push(a)
  }

  const items = []
  let id = 1
  for (const [action, list] of groups) {
    const { type, subLabel } = mapAction(action)
    const grouped = list.length > 1
    if (grouped) {
      items.push({
        id: id++, type, subLabel,
        exercises: list.map((a) => a.exercise_title),
        grouped: true,
        current: null,
        target: null,
        targetHint: targetHintFor(subLabel),
        reason: list[0].advice,
        urgent: type === 'down',
      })
    } else {
      const a = list[0]
      items.push({
        id: id++, type, subLabel,
        exercises: [a.exercise_title],
        grouped: false,
        current: { load: `${a.bestSet.weight_kg} kg × ${a.bestSet.reps}`, rpe: a.bestSet.rpe ?? null },
        target: buildTarget(action, a.bestSet, a.targetWeight, a.targetReps, a.repRange),
        targetHint: null,
        reason: a.advice,
        urgent: type === 'down',
      })
    }
  }

  // Fixed sort: down → up → hold
  const ORDER = { down: 0, up: 1, hold: 2 }
  items.sort((a, b) => ORDER[a.type] - ORDER[b.type])
  return items
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateHuman(dateStr) {
  if (!dateStr) return ''
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const [, month, day] = dateStr.split('-')
  return `${parseInt(day)} ${months[parseInt(month) - 1]}`
}

// ─── SummaryBar ───────────────────────────────────────────────────────────────

function SummaryBar({ items }) {
  const chips = [
    { type: 'down', label: 'pas aan',    color: '#FF4B3E', bg: 'rgba(255,75,62,0.10)',  border: 'rgba(255,75,62,0.28)' },
    { type: 'up',   label: 'progressie', color: '#22C55E', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.22)' },
    { type: 'hold', label: 'handhaven',  color: '#3E7CB1', bg: 'rgba(62,124,177,0.08)', border: 'rgba(62,124,177,0.18)' },
  ].map((c) => ({ ...c, count: items.filter((i) => i.type === c.type).length }))
    .filter((c) => c.count > 0)

  if (chips.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {chips.map((chip) => (
        <span
          key={chip.type}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: chip.color,
            background: chip.bg,
            border: `1px solid ${chip.border}`,
            borderRadius: 20,
            padding: '3px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontWeight: 800 }}>{chip.count}</span>
          {chip.label}
        </span>
      ))}
    </div>
  )
}

// ─── AdviceRow ────────────────────────────────────────────────────────────────

function AdviceRow({ item, onNavigate }) {
  const tok = T[item.type]
  const icon = TYPE_ICON[item.type]

  function ExerciseLabel({ name }) {
    if (!onNavigate) {
      return <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{name}</span>
    }
    return (
      <button
        onClick={() => onNavigate('oefeningen', { exercise: name })}
        style={{
          fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
          color: tok.color, background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, textDecoration: 'underline', textDecorationColor: `${tok.color}50`,
          textUnderlineOffset: 2,
        }}
      >
        {name}
      </button>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        background: tok.bg,
        border: item.urgent ? '1px solid #FF4B3E' : `1px solid ${tok.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 6,
        ...(item.urgent ? {
          boxShadow: '0 0 0 1px #B23B3230, 0 4px 16px -4px rgba(255,75,62,0.15)',
        } : {}),
      }}
    >
      {/* Accent balk links */}
      <div
        style={item.urgent
          ? { width: 4, background: 'linear-gradient(to bottom, #FF4B3E, #B23B32)', flexShrink: 0, alignSelf: 'stretch' }
          : { width: 3, background: tok.color, flexShrink: 0, alignSelf: 'stretch' }
        }
      />

      {/* Content */}
      <div style={{ flex: 1, padding: '10px 12px 10px 10px', minWidth: 0 }}>

        {/* Rij 1 — naam(en) + badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {item.grouped ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 1 }}>
                {item.exercises.map((ex, i) => (
                  <span key={ex} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <ExerciseLabel name={ex} />
                    {i < item.exercises.length - 1 && <span style={{ color: 'var(--color-text-secondary)', marginLeft: 2 }}> ·</span>}
                  </span>
                ))}
              </div>
            ) : (
              <ExerciseLabel name={item.exercises[0]} />
            )}
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: tok.color,
            background: `${tok.color}18`,
            border: `1px solid ${tok.border}`,
            borderRadius: 4,
            padding: '2px 6px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}>
            {icon} {item.subLabel}
          </span>
        </div>

        {/* Rij 2 — cijfers (alleen als current !== null) */}
        {item.current !== null && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-text-tertiary)',
              textDecoration: 'line-through',
            }}>
              {item.current.load}
            </span>
            {item.current.rpe !== null && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                color: rpeColor(item.current.rpe),
                background: `${rpeColor(item.current.rpe)}18`,
                border: `1px solid ${rpeColor(item.current.rpe)}40`,
                borderRadius: 4,
                padding: '1px 5px',
              }}>
                RPE {item.current.rpe}
              </span>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-border)' }}>→</span>
            {item.target && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: tok.color }}>
                {item.target}
              </span>
            )}
          </div>
        )}

        {/* TargetHint (alleen als grouped && targetHint && current === null) */}
        {item.grouped && item.targetHint && item.current === null && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: tok.color, opacity: 0.7 }}>
              → {item.targetHint}
            </span>
          </div>
        )}

        {/* Rij 3 — reason (coach-conclusie) */}
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: item.urgent ? 500 : 400,
          color: item.urgent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          margin: 0,
          lineHeight: 1.45,
        }}>
          {item.reason}
        </p>

      </div>
    </div>
  )
}

// ─── CoachAdviceCard ──────────────────────────────────────────────────────────

export default function CoachAdviceCard({ advice, onNavigate }) {
  const [holdExpanded, setHoldExpanded] = useState(false)
  const { workoutTitle, date, advices: rawAdvices } = advice

  const items    = adaptAdvices(rawAdvices)
  const downUp   = items.filter((i) => i.type !== 'hold')
  const hold     = items.filter((i) => i.type === 'hold')
  const visible  = holdExpanded ? items : downUp

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8, paddingLeft: 2 }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: '#22C55E',
        }}>
          {workoutTitle}
        </span>
        {date && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--color-text-tertiary)',
          }}>
            · op basis van {formatDateHuman(date)}
          </span>
        )}
      </div>

      {/* Card */}
      <div style={{
        background: 'linear-gradient(160deg, var(--color-card-raised), var(--color-card))',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 14,
        boxShadow: '0 8px 24px -12px rgba(0,0,0,0.5)',
        padding: 14,
        overflow: 'hidden',
      }}>
        <SummaryBar items={items} />

        {visible.map((item) => (
          <AdviceRow key={item.id} item={item} onNavigate={onNavigate} />
        ))}

        {hold.length > 0 && (
          <button
            onClick={() => setHoldExpanded((v) => !v)}
            style={{
              marginTop: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 0',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          >
            {holdExpanded ? '↑ inklappen' : `+${hold.length} handhaven bekijken`}
          </button>
        )}
      </div>
    </div>
  )
}
