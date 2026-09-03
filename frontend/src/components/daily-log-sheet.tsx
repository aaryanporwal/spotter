import { useId } from "react"

import type { DailyLog, DutyStatus, LogSegment } from "@/types/trip"

const VIEW_WIDTH = 1200
const VIEW_HEIGHT = 850
const GRID_X = 190
const GRID_Y = 190
const GRID_WIDTH = 840
const ROW_HEIGHT = 52

const rows: { status: DutyStatus; label: string; shortLabel: string }[] = [
  { status: "off_duty", label: "1. Off duty", shortLabel: "OFF" },
  { status: "sleeper_berth", label: "2. Sleeper berth", shortLabel: "SB" },
  { status: "driving", label: "3. Driving", shortLabel: "D" },
  {
    status: "on_duty_not_driving",
    label: "4. On duty (not driving)",
    shortLabel: "ON",
  },
]

function xForMinute(minute: number) {
  return GRID_X + (Math.max(0, Math.min(1440, minute)) / 1440) * GRID_WIDTH
}

function yForStatus(status: DutyStatus) {
  const index = Math.max(
    0,
    rows.findIndex((row) => row.status === status),
  )
  return GRID_Y + index * ROW_HEIGHT + ROW_HEIGHT / 2
}

function dutyPath(segments: LogSegment[]) {
  const sorted = [...segments].sort((a, b) => a.startMinute - b.startMinute)
  if (!sorted.length) return ""
  const first = sorted[0]
  let path = `M ${xForMinute(first.startMinute)} ${yForStatus(first.status)}`
  let priorStatus = first.status
  let priorEnd = first.startMinute
  for (const segment of sorted) {
    const start = xForMinute(segment.startMinute)
    const end = xForMinute(segment.endMinute)
    if (segment.startMinute !== priorEnd) path += ` H ${start}`
    if (segment.status !== priorStatus) path += ` V ${yForStatus(segment.status)}`
    path += ` H ${end}`
    priorStatus = segment.status
    priorEnd = segment.endMinute
  }
  return path
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return { month: "—", day: "—", year: "—", full: value }
  return {
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
    day: String(date.getUTCDate()).padStart(2, "0"),
    year: String(date.getUTCFullYear()),
    full: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(date),
  }
}

function hoursLabel(minutes: number) {
  const value = minutes / 60
  return Number.isInteger(value) ? `${value.toFixed(0)}.00` : value.toFixed(2)
}

function minuteLabel(minute: number) {
  const safe = Math.max(0, Math.min(1439, Math.round(minute)))
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  const suffix = hours >= 12 ? "PM" : "AM"
  const hour = hours % 12 || 12
  return `${hour}:${String(mins).padStart(2, "0")} ${suffix}`
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

export function DailyLogSheet({ log, index = 0 }: { log: DailyLog; index?: number }) {
  const titleId = useId()
  const descriptionId = useId()
  const date = formatDate(log.date)
  const path = dutyPath(log.segments)
  const totalMinutes = rows.reduce(
    (total, row) =>
      total +
      ({
        off_duty: log.totalsMinutes.offDuty,
        sleeper_berth: log.totalsMinutes.sleeperBerth,
        driving: log.totalsMinutes.driving,
        on_duty_not_driving: log.totalsMinutes.onDutyNotDriving,
      }[row.status] ?? 0),
    0,
  )
  const onDutyToday =
    log.recap?.onDutyTodayMinutes ??
    log.totalsMinutes.driving + log.totalsMinutes.onDutyNotDriving

  return (
    <figure className="daily-log-page overflow-hidden rounded-xl border border-border bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="block h-auto w-full min-w-[760px] bg-white text-neutral-950"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Driver&apos;s daily log for {date.full}</title>
        <desc id={descriptionId}>
          A 24-hour record of duty status with off-duty, sleeper-berth, driving, and on-duty segments.
        </desc>
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="white" />

        <g fill="currentColor" fontFamily="Geist, Arial, sans-serif">
          <text x="46" y="53" fontSize="31" fontWeight="700" letterSpacing="-1">
            DRIVER&apos;S DAILY LOG
          </text>
          <text x="48" y="76" fontSize="12" fontWeight="600" letterSpacing="1.5">
            24 HOURS · PROPERTY CARRIER
          </text>
          <text x="1150" y="52" textAnchor="end" fontSize="13" fontWeight="600">
            DAY {index + 1}
          </text>
          <text x="1150" y="74" textAnchor="end" fontSize="11" fill="#737373">
            {log.timezone || "Local terminal time"}
          </text>

          <text x="400" y="42" textAnchor="middle" fontSize="18" fontWeight="650">
            {date.month}
          </text>
          <line x1="365" x2="435" y1="49" y2="49" stroke="currentColor" strokeWidth="1.5" />
          <text x="400" y="66" textAnchor="middle" fontSize="10">
            MONTH
          </text>
          <text x="485" y="42" textAnchor="middle" fontSize="18" fontWeight="650">
            {date.day}
          </text>
          <line x1="450" x2="520" y1="49" y2="49" stroke="currentColor" strokeWidth="1.5" />
          <text x="485" y="66" textAnchor="middle" fontSize="10">
            DAY
          </text>
          <text x="570" y="42" textAnchor="middle" fontSize="18" fontWeight="650">
            {date.year}
          </text>
          <line x1="535" x2="605" y1="49" y2="49" stroke="currentColor" strokeWidth="1.5" />
          <text x="570" y="66" textAnchor="middle" fontSize="10">
            YEAR
          </text>

          <text x="48" y="116" fontSize="13" fontWeight="700">FROM</text>
          <text x="108" y="116" fontSize="14" fontWeight="550">
            {truncate(log.from || "Trip origin", 50)}
          </text>
          <line x1="105" x2="565" y1="124" y2="124" stroke="currentColor" strokeWidth="1.2" />
          <text x="625" y="116" fontSize="13" fontWeight="700">TO</text>
          <text x="660" y="116" fontSize="14" fontWeight="550">
            {truncate(log.to || "Trip destination", 50)}
          </text>
          <line x1="657" x2="1152" y1="124" y2="124" stroke="currentColor" strokeWidth="1.2" />

          <text x="48" y="159" fontSize="11" fontWeight="650" letterSpacing="0.8">
            DUTY STATUS
          </text>
          <text x="1090" y="159" fontSize="11" fontWeight="650" letterSpacing="0.8">
            TOTAL HOURS
          </text>

          {Array.from({ length: 24 }, (_, hour) => {
            const label = hour === 0 ? "MID" : hour === 12 ? "NOON" : String(hour % 12)
            return (
              <text
                key={`hour-${hour}`}
                x={GRID_X + (hour + 0.5) * (GRID_WIDTH / 24)}
                y="177"
                textAnchor="middle"
                fontSize={hour === 0 || hour === 12 ? "9" : "10"}
                fontWeight="600"
              >
                {label}
              </text>
            )
          })}

          {rows.map((row, rowIndex) => {
            const totals = {
              off_duty: log.totalsMinutes.offDuty,
              sleeper_berth: log.totalsMinutes.sleeperBerth,
              driving: log.totalsMinutes.driving,
              on_duty_not_driving: log.totalsMinutes.onDutyNotDriving,
            }
            return (
              <g key={row.status}>
                <text
                  x="48"
                  y={GRID_Y + rowIndex * ROW_HEIGHT + 23}
                  fontSize="12"
                  fontWeight="650"
                >
                  {row.label}
                </text>
                <text
                  x="1140"
                  y={GRID_Y + rowIndex * ROW_HEIGHT + 31}
                  textAnchor="end"
                  fontFamily="Geist Mono, monospace"
                  fontSize="13"
                  fontWeight="650"
                >
                  {hoursLabel(totals[row.status])}
                </text>
              </g>
            )
          })}

          <rect
            x={GRID_X}
            y={GRID_Y}
            width={GRID_WIDTH}
            height={ROW_HEIGHT * 4}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          {Array.from({ length: 5 }, (_, index) => (
            <line
              key={`row-${index}`}
              x1={GRID_X}
              x2={GRID_X + GRID_WIDTH}
              y1={GRID_Y + index * ROW_HEIGHT}
              y2={GRID_Y + index * ROW_HEIGHT}
              stroke="currentColor"
              strokeWidth={index === 0 || index === 4 ? 1.5 : 1}
            />
          ))}
          {Array.from({ length: 25 }, (_, hour) => (
            <line
              key={`grid-hour-${hour}`}
              x1={GRID_X + (hour / 24) * GRID_WIDTH}
              x2={GRID_X + (hour / 24) * GRID_WIDTH}
              y1={GRID_Y}
              y2={GRID_Y + ROW_HEIGHT * 4}
              stroke="#737373"
              strokeWidth={hour === 0 || hour === 12 || hour === 24 ? 1.3 : 0.8}
            />
          ))}
          {Array.from({ length: 96 }, (_, quarter) => {
            if (quarter % 4 === 0) return null
            const height = quarter % 2 === 0 ? 18 : 10
            const x = GRID_X + (quarter / 96) * GRID_WIDTH
            return rows.map((row, rowIndex) => (
              <line
                key={`tick-${quarter}-${row.status}`}
                x1={x}
                x2={x}
                y1={GRID_Y + rowIndex * ROW_HEIGHT}
                y2={GRID_Y + rowIndex * ROW_HEIGHT + height}
                stroke="#737373"
                strokeWidth="0.8"
              />
            ))
          })}
          {path ? (
            <path
              d={path}
              fill="none"
              stroke="#0a0a0a"
              strokeWidth="4"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
          ) : null}
          <text x="1090" y="420" fontSize="10" fill="#737373">24-HOUR TOTAL</text>
          <text
            x="1140"
            y="420"
            textAnchor="end"
            fontFamily="Geist Mono, monospace"
            fontSize="12"
            fontWeight="650"
          >
            {hoursLabel(totalMinutes)}
          </text>

          <text x="48" y="461" fontSize="14" fontWeight="700">REMARKS</text>
          <line x1={GRID_X} x2={GRID_X + GRID_WIDTH} y1="456" y2="456" stroke="currentColor" strokeWidth="1.4" />
          {Array.from({ length: 25 }, (_, hour) => (
            <line
              key={`remarks-hour-${hour}`}
              x1={GRID_X + (hour / 24) * GRID_WIDTH}
              x2={GRID_X + (hour / 24) * GRID_WIDTH}
              y1="449"
              y2="463"
              stroke="#737373"
              strokeWidth="0.8"
            />
          ))}
          {log.remarks.slice(0, 6).map((remark, remarkIndex) => {
            const x = xForMinute(remark.minute)
            const listY = 495 + remarkIndex * 24
            return (
              <g key={`${remark.minute}-${remarkIndex}`}>
                <circle cx={x} cy="456" r="4" fill="currentColor" />
                <text x="190" y={listY} fontFamily="Geist Mono, monospace" fontSize="11" fontWeight="650">
                  {minuteLabel(remark.minute)}
                </text>
                <text x="285" y={listY} fontSize="12" fontWeight="550">
                  {truncate(remark.label || "Duty status change", 62)}
                </text>
                <text x="790" y={listY} fontSize="11" fill="#525252">
                  {truncate(remark.location, 46)}
                </text>
              </g>
            )
          })}
          {!log.remarks.length ? (
            <text x="190" y="500" fontSize="12" fill="#737373">No status-change remarks reported.</text>
          ) : null}

          <line x1="48" x2="1152" y1="655" y2="655" stroke="currentColor" strokeWidth="2" />
          <text x="48" y="682" fontSize="13" fontWeight="700">70 HOUR / 8 DAY RECAP</text>
          <text x="48" y="713" fontSize="10" fill="#737373">ON DUTY TODAY</text>
          <text x="48" y="738" fontFamily="Geist Mono, monospace" fontSize="21" fontWeight="650">
            {hoursLabel(onDutyToday)} h
          </text>
          <line x1="245" x2="245" y1="675" y2="753" stroke="#d4d4d4" />
          <text x="275" y="713" fontSize="10" fill="#737373">CYCLE USED AT DAY END</text>
          <text x="275" y="738" fontFamily="Geist Mono, monospace" fontSize="21" fontWeight="650">
            {hoursLabel(log.recap?.cycleUsedEndMinutes ?? 0)} h
          </text>
          <line x1="525" x2="525" y1="675" y2="753" stroke="#d4d4d4" />
          <text x="555" y="713" fontSize="10" fill="#737373">CYCLE AVAILABLE</text>
          <text x="555" y="738" fontFamily="Geist Mono, monospace" fontSize="21" fontWeight="650">
            {hoursLabel(log.recap?.cycleRemainingMinutes ?? 0)} h
          </text>
          <line x1="790" x2="790" y1="675" y2="753" stroke="#d4d4d4" />
          <text x="820" y="713" fontSize="10" fill="#737373">TOTAL MILES DRIVING TODAY</text>
          <text x="820" y="738" fontFamily="Geist Mono, monospace" fontSize="21" fontWeight="650">
            {Math.round(log.totalMiles).toLocaleString("en-US")}
          </text>

          <rect x="48" y="780" width="1104" height="42" rx="3" fill="#f5f5f5" />
          <text x="65" y="806" fontSize="11" fontWeight="600">
            Generated from the planned route · Review against your ELD and carrier records before driving.
          </text>
          <text x="1132" y="806" textAnchor="end" fontSize="11" fontWeight="650">
            MILEMARK
          </text>
        </g>
      </svg>
    </figure>
  )
}
