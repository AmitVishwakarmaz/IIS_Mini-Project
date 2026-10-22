import { useEffect, useState } from 'react'
import { getAll, create, update, remove, set as firestoreSet } from '../data/firestore'
import type { Subject, Faculty, Room, Division, TimeSlot, DaySchedule, SubjectType } from '../types'
import { DAYS, computeWeeklyPeriods, computeWeeklyLoad } from '../types'

type Tab = 'subjects' | 'faculty' | 'rooms' | 'divisions' | 'timeSlots' | 'daySchedules'

export default function DataPage() {
  const [tab, setTab] = useState<Tab>('subjects')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>([])
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function loadAll() {
    const [s, f, r, d, t, ds] = await Promise.all([
      getAll<Subject>('subjects'),
      getAll<Faculty>('faculty'),
      getAll<Room>('rooms'),
      getAll<Division>('divisions'),
      getAll<TimeSlot>('timeSlots'),
      getAll<DaySchedule>('daySchedules'),
    ])
    setSubjects(s)
    setFaculty(f)
    setRooms(r)
    setDivisions(d)
    setTimeSlots(t.sort((a, b) => a.order - b.order))
    setDaySchedules(ds)
  }

  useEffect(() => { loadAll() }, [])

  function handleAdd() {
    setEditItem(null)
    setShowForm(true)
  }

  function handleEdit(item: Record<string, unknown>) {
    setEditItem(item)
    setShowForm(true)
  }

  async function handleDelete(collection: string, id: string) {
    if (!confirm('Delete this item?')) return
    await remove(collection, id)
    loadAll()
  }

  async function handleSave(data: Record<string, unknown>) {
    const colMap: Record<Tab, string> = {
      subjects: 'subjects',
      faculty: 'faculty',
      rooms: 'rooms',
      divisions: 'divisions',
      timeSlots: 'timeSlots',
      daySchedules: 'daySchedules',
    }
    const col = colMap[tab]
    if (editItem && (editItem as { id?: string }).id) {
      const { id, ...rest } = { ...data }
      void id
      await update(col, (editItem as { id: string }).id, rest)
    } else {
      await create(col, data)
    }
    setShowForm(false)
    loadAll()
  }

  // Quick upsert of a DaySchedule (one per day — use day as doc ID prefix)
  async function saveDaySchedule(
    day: string,
    maxSlotOrder: number,
    reservedForTypes: SubjectType[],
    pattern: 'every' | 'alternate'
  ) {
    const existing = daySchedules.find(ds => ds.day === day)
    const data = { day: day as typeof DAYS[number], maxSlotOrder, reservedForTypes, pattern }
    if (existing) {
      await update('daySchedules', existing.id, data)
    } else {
      await firestoreSet<DaySchedule>('daySchedules', `ds_${day.toLowerCase()}`, data)
    }
    loadAll()
  }

  // Compute weekly load summary for a semester
  const [previewSemester, setPreviewSemester] = useState(6)
  const semSubjects = subjects.filter(s => s.semester === previewSemester)
  const load = computeWeeklyLoad(semSubjects)

  return (
    <div>
      <h1 className="page-title">Manage Data</h1>

      <div className="tabs">
        {(['subjects', 'faculty', 'rooms', 'divisions', 'timeSlots', 'daySchedules'] as Tab[]).map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'timeSlots' ? 'Time Slots'
              : t === 'daySchedules' ? 'Day Schedules'
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Weekly load summary for subjects tab */}
      {tab === 'subjects' && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label className="form-label" style={{ margin: 0 }}>Semester</label>
            <select className="form-select" style={{ width: 120 }} value={previewSemester} onChange={e => setPreviewSemester(parseInt(e.target.value))}>
              {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Sem {s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', overflow: 'hidden', fontSize: 12 }}>
            {[
              { label: 'Theory', val: load.theory, color: 'var(--blue-50)' },
              { label: 'Practical', val: load.practical, color: 'var(--orange-50)' },
              { label: 'Tutorial', val: load.tutorial, color: 'var(--emerald-50)' },
              { label: 'PBL', val: load.pbl, color: 'var(--violet-50)' },
              { label: 'Total/Week', val: load.total, color: 'var(--gray-100)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ padding: '4px 12px', background: color, borderRight: '1px solid var(--gray-200)', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: 'var(--gray-800)' }}>{val}</div>
                <div style={{ color: 'var(--gray-500)', fontSize: 10 }}>{label}</div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={handleAdd}>+ Add Subject</button>
        </div>
      )}

      {tab !== 'subjects' && tab !== 'daySchedules' && (
        <div style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={handleAdd}>+ Add</button>
        </div>
      )}

      {tab === 'subjects' && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Type</th><th>Periods/Week</th><th>Sem Hrs</th><th>Faculty</th><th>Room</th><th>Sem</th><th></th>
            </tr>
          </thead>
          <tbody>
            {subjects.map(s => (
              <tr key={s.id}>
                <td><strong>{s.code}</strong></td>
                <td>{s.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{s.type}</td>
                <td style={{ fontWeight: 600 }}>{s.weeklyPeriods}</td>
                <td style={{ color: 'var(--gray-500)', fontSize: 12 }}>{s.semesterHours ? `${s.semesterHours}h` : '—'}</td>
                <td>{(s.facultyIds?.length ? s.facultyIds : s.facultyId ? [s.facultyId] : [])
                  .map(id => faculty.find(f => f.id === id)?.shortName || id).join(', ') || '—'}</td>
                <td>{s.roomType}</td>
                <td>{s.semester}</td>
                <td>
                  <div className="btn-group">
                    <button className="btn btn-secondary btn-small" onClick={() => handleEdit(s as unknown as Record<string, unknown>)}>Edit</button>
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete('subjects', s.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'faculty' && (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Short Name</th><th></th></tr></thead>
          <tbody>
            {faculty.map(f => (
              <tr key={f.id}>
                <td>{f.name}</td><td>{f.shortName}</td>
                <td>
                  <div className="btn-group">
                    <button className="btn btn-secondary btn-small" onClick={() => handleEdit(f as unknown as Record<string, unknown>)}>Edit</button>
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete('faculty', f.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'rooms' && (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Type</th><th>Capacity</th><th></th></tr></thead>
          <tbody>
            {rooms.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td><td>{r.type}</td><td>{r.capacity}</td>
                <td>
                  <div className="btn-group">
                    <button className="btn btn-secondary btn-small" onClick={() => handleEdit(r as unknown as Record<string, unknown>)}>Edit</button>
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete('rooms', r.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'divisions' && (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Semester</th><th>Strength</th><th></th></tr></thead>
          <tbody>
            {divisions.map(d => (
              <tr key={d.id}>
                <td>{d.name}</td><td>{d.semester}</td><td>{d.strength}</td>
                <td>
                  <div className="btn-group">
                    <button className="btn btn-secondary btn-small" onClick={() => handleEdit(d as unknown as Record<string, unknown>)}>Edit</button>
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete('divisions', d.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'timeSlots' && (
        <table className="data-table">
          <thead>
            <tr><th>Order</th><th>Start</th><th>End</th><th>Break</th><th>Available Days</th><th></th></tr>
          </thead>
          <tbody>
            {timeSlots.map(t => (
              <tr key={t.id}>
                <td>{t.order}</td>
                <td>{t.startTime}</td>
                <td>{t.endTime}</td>
                <td>{t.isBreak ? 'Yes' : ''}</td>
                <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {t.availableDays && t.availableDays.length > 0 ? t.availableDays.join(', ') : 'All days'}
                </td>
                <td>
                  <div className="btn-group">
                    <button className="btn btn-secondary btn-small" onClick={() => handleEdit(t as unknown as Record<string, unknown>)}>Edit</button>
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete('timeSlots', t.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'daySchedules' && (
        <DaySchedulePanel
          timeSlots={timeSlots}
          daySchedules={daySchedules}
          onSave={saveDaySchedule}
          onDelete={(id) => { handleDelete('daySchedules', id) }}
        />
      )}

      {showForm && tab !== 'daySchedules' && (
        <FormModal
          tab={tab}
          editItem={editItem}
          faculty={faculty}
          timeSlots={timeSlots}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

// ── Day Schedule panel (inline editor, one row per day) ──

const ALL_TYPES: { value: SubjectType; label: string; color: string }[] = [
  { value: 'pbl',       label: 'PBL',       color: 'var(--violet-50)' },
  { value: 'tutorial',  label: 'Tutorial',  color: 'var(--emerald-50)' },
  { value: 'practical', label: 'Practical', color: 'var(--orange-50)' },
  { value: 'theory',    label: 'Theory',    color: 'var(--blue-50)' },
]

function DaySchedulePanel({
  timeSlots, daySchedules, onSave, onDelete,
}: {
  timeSlots: TimeSlot[]
  daySchedules: DaySchedule[]
  onSave: (day: string, maxSlotOrder: number, reservedForTypes: SubjectType[], pattern: 'every' | 'alternate') => void
  onDelete: (id: string) => void
}) {
  const nonBreak = [...timeSlots].filter(ts => !ts.isBreak).sort((a, b) => a.order - b.order)
  const lastOrder = nonBreak[nonBreak.length - 1]?.order ?? 9

  const [draft, setDraft] = useState<Record<string, {
    maxSlotOrder: number
    reservedForTypes: SubjectType[]
    pattern: 'every' | 'alternate'
  }>>(() => {
    const init: Record<string, { maxSlotOrder: number; reservedForTypes: SubjectType[]; pattern: 'every' | 'alternate' }> = {}
    for (const day of DAYS) {
      const ds = daySchedules.find(d => d.day === day)
      init[day] = {
        maxSlotOrder: ds?.maxSlotOrder ?? lastOrder,
        reservedForTypes: ds?.reservedForTypes ?? [],
        pattern: ds?.pattern ?? 'every',
      }
    }
    return init
  })

  function toggleType(day: string, type: SubjectType) {
    setDraft(prev => {
      const cur = prev[day].reservedForTypes
      const updated = cur.includes(type) ? cur.filter(t => t !== type) : [...cur, type]
      return { ...prev, [day]: { ...prev[day], reservedForTypes: updated } }
    })
  }

  function setMaxOrder(day: string, order: number) {
    setDraft(prev => ({ ...prev, [day]: { ...prev[day], maxSlotOrder: order } }))
  }

  function setPattern(day: string, pattern: 'every' | 'alternate') {
    setDraft(prev => ({ ...prev, [day]: { ...prev[day], pattern } }))
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
        Configure each day's end time and optionally <strong>reserve it for specific subject types</strong> (e.g.
        reserve Saturday for PBL/IP only). Reserved types will only be scheduled on those days.
        Use <em>Alternate</em> to mark a day as every-other-week.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {DAYS.map(day => {
          const d = draft[day]
          const saved = daySchedules.find(ds => ds.day === day)
          const periodsCount = nonBreak.filter(ts => ts.order <= d.maxSlotOrder).length

          return (
            <div key={day} style={{
              border: '1px solid var(--gray-200)',
              borderRadius: 'var(--radius)',
              padding: '12px 14px',
              background: d.reservedForTypes.length > 0 ? 'var(--violet-50)' : 'var(--gray-50)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {/* Day label */}
                <div style={{ fontWeight: 700, fontSize: 14, minWidth: 36 }}>{day}</div>

                {/* End time selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>End after:</span>
                  <select
                    className="form-select"
                    style={{ width: 150, fontSize: 12 }}
                    value={d.maxSlotOrder}
                    onChange={e => setMaxOrder(day, parseInt(e.target.value))}
                  >
                    {nonBreak.map(ts => (
                      <option key={ts.id} value={ts.order}>
                        {ts.startTime}–{ts.endTime}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    ({periodsCount} period{periodsCount !== 1 ? 's' : ''})
                  </span>
                </div>

                {/* Pattern selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Pattern:</span>
                  {(['every', 'alternate'] as const).map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`pattern-${day}`}
                        checked={d.pattern === p}
                        onChange={() => setPattern(day, p)}
                      />
                      {p === 'every' ? 'Every week' : 'Alternate'}
                    </label>
                  ))}
                </div>

                {/* Save/Reset */}
                <div className="btn-group" style={{ marginLeft: 'auto' }}>
                  <button
                    className="btn btn-primary btn-small"
                    onClick={() => onSave(day, d.maxSlotOrder, d.reservedForTypes, d.pattern)}
                  >
                    {saved ? 'Update' : 'Save'}
                  </button>
                  {saved && (
                    <button className="btn btn-danger btn-small" onClick={() => onDelete(saved.id)}>Reset</button>
                  )}
                </div>
              </div>

              {/* Reserve for subject types */}
              <div style={{ marginTop: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--gray-500)', marginRight: 8 }}>Reserve for types only:</span>
                {ALL_TYPES.map(({ value, label, color }) => (
                  <label
                    key={value}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      marginRight: 10,
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: d.reservedForTypes.includes(value) ? color : 'transparent',
                      border: `1px solid ${d.reservedForTypes.includes(value) ? 'var(--gray-300)' : 'transparent'}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={d.reservedForTypes.includes(value)}
                      onChange={() => toggleType(day, value)}
                    />
                    {label}
                  </label>
                ))}
                {d.reservedForTypes.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>None — all subject types allowed</span>
                )}
                {d.reservedForTypes.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--gray-600)', marginLeft: 8 }}>
                    Only <strong>{d.reservedForTypes.join(', ')}</strong> subjects will be scheduled on {day}
                    {d.pattern === 'alternate' ? ' (alternate weeks)' : ''}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary strip */}
      {nonBreak.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--gray-200)' }}>
          <div className="section-title" style={{ marginBottom: 8 }}>Weekly Slot Summary</div>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {DAYS.map(day => {
              const maxOrder = daySchedules.find(ds => ds.day === day)?.maxSlotOrder ?? Infinity
              const res = daySchedules.find(ds => ds.day === day)?.reservedForTypes ?? []
              const pat = daySchedules.find(ds => ds.day === day)?.pattern
              const count = nonBreak.filter(t => t.order <= maxOrder).length
              const lastTs = nonBreak.filter(t => t.order <= maxOrder).pop()
              return (
                <div key={day} style={{
                  flex: 1,
                  padding: '8px 6px',
                  borderRight: '1px solid var(--gray-200)',
                  textAlign: 'center',
                  background: res.length > 0 ? 'var(--violet-50)' : 'white',
                  minWidth: 70
                }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{day}</div>
                  <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>{count} periods</div>
                  <div style={{ fontSize: 9, color: 'var(--gray-400)' }}>until {lastTs?.endTime ?? '—'}</div>
                  {res.length > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--violet-600, #7c3aed)', marginTop: 2, fontWeight: 600 }}>
                      {res.join('/')}{pat === 'alternate' ? ' ↔' : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6 }}>
            ↔ = Alternate weeks. Reserved days only accept the listed subject types.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Generic form modal ──

function FormModal({
  tab, editItem, faculty, onSave, onClose,
}: {
  tab: Tab
  editItem: Record<string, unknown> | null
  faculty: { id: string; name: string }[]
  timeSlots?: TimeSlot[]
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
}) {
  function getDefaults(t: Tab): Record<string, unknown> {
    switch (t) {
      case 'subjects': return { name: '', code: '', type: 'theory', weeklyPeriods: 3, semesterHours: 45, semesterWeeks: 15, facultyIds: [], roomType: 'classroom', semester: 6, departmentId: 'comp' };
      case 'faculty': return { name: '', shortName: '', departmentId: 'comp' };
      case 'rooms': return { name: '', type: 'classroom', capacity: 70 };
      case 'divisions': return { name: '', departmentId: 'comp', semester: 6, strength: 60 };
      case 'timeSlots': return { startTime: '', endTime: '', order: 1, isBreak: false, availableDays: [] };
      case 'daySchedules': return { day: 'MON', maxSlotOrder: 7 };
    }
  }

  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const initial = editItem || getDefaults(tab)
    if (tab === 'subjects' && !Array.isArray(initial.facultyIds)) {
      return { ...initial, facultyIds: initial.facultyId ? [initial.facultyId] : [] }
    }
    return initial
  })

  function set(key: string, value: unknown) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Auto-calculate weeklyPeriods when semesterHours or semesterWeeks changes
  function handleHoursChange(hrs: number) {
    const weeks = (form.semesterWeeks as number) || 15
    const computed = computeWeeklyPeriods(hrs, weeks)
    setForm(prev => ({ ...prev, semesterHours: hrs, weeklyPeriods: computed }))
  }

  function handleWeeksChange(weeks: number) {
    const hrs = (form.semesterHours as number) || 45
    const computed = computeWeeklyPeriods(hrs, weeks)
    setForm(prev => ({ ...prev, semesterWeeks: weeks, weeklyPeriods: computed }))
  }

  function toggleAvailableDay(day: string) {
    const current = (form.availableDays as string[]) || []
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day]
    set('availableDays', updated)
  }

  function toggleFaculty(id: string) {
    const current = (form.facultyIds as string[]) || []
    set('facultyIds', current.includes(id) ? current.filter(f => f !== id) : [...current, id])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (tab === 'subjects' && ((form.facultyIds as string[]) || []).length === 0) {
      alert('Select at least one eligible teacher for this subject.')
      return
    }
    onSave(form)
  }

  const availDays = (form.availableDays as string[]) || []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{editItem ? 'Edit' : 'Add'} {tab === 'timeSlots' ? 'Time Slot' : tab === 'daySchedules' ? 'Day Schedule' : tab.slice(0, -1)}</h3>
        <form onSubmit={handleSubmit}>
          {tab === 'subjects' && (
            <>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={(form.name as string) || ''} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Code</label>
                <input className="form-input" value={(form.code as string) || ''} onChange={e => set('code', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={(form.type as string) || 'theory'} onChange={e => set('type', e.target.value)}>
                  <option value="theory">Theory</option>
                  <option value="practical">Practical</option>
                  <option value="tutorial">Tutorial</option>
                  <option value="pbl">PBL</option>
                </select>
              </div>

              {/* Semester hours calculator */}
              <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginBottom: 8 }}>
                  Auto-calculate Periods
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ margin: 0, flex: 1 }}>
                    <label className="form-label">Semester Contact Hours</label>
                    <input
                      className="form-input"
                      type="number" min={1} max={200}
                      value={(form.semesterHours as number) || ''}
                      onChange={e => handleHoursChange(parseInt(e.target.value) || 1)}
                      placeholder="e.g. 45"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: 1 }}>
                    <label className="form-label">Semester Weeks</label>
                    <input
                      className="form-input"
                      type="number" min={1} max={30}
                      value={(form.semesterWeeks as number) || 15}
                      onChange={e => handleWeeksChange(parseInt(e.target.value) || 15)}
                    />
                  </div>
                  <div style={{ textAlign: 'center', padding: '0 4px 4px' }}>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>periods/week</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
                      {computeWeeklyPeriods((form.semesterHours as number) || 45, (form.semesterWeeks as number) || 15)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Periods / Week (override)</label>
                <input className="form-input" type="number" min={1} max={20} value={(form.weeklyPeriods as number) || 3} onChange={e => set('weeklyPeriods', parseInt(e.target.value))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Eligible Teachers</label>
                <div className="checkbox-group">
                  {faculty.map(f => {
                    const selected = ((form.facultyIds as string[]) || []).includes(f.id)
                    return <label key={f.id} className={`checkbox-item ${selected ? 'selected' : ''}`}>
                      <input type="checkbox" checked={selected} onChange={() => toggleFaculty(f.id)} />
                      {f.name}
                    </label>
                  })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 5 }}>
                  One teacher is chosen for each scheduled period, spreading load where possible.
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Room Type</label>
                <select className="form-select" value={(form.roomType as string) || 'classroom'} onChange={e => set('roomType', e.target.value)}>
                  <option value="classroom">Classroom (Theory)</option>
                  <option value="lab">Lab (Practical)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Semester</label>
                <input className="form-input" type="number" min={1} max={8} value={(form.semester as number) || 6} onChange={e => set('semester', parseInt(e.target.value))} required />
              </div>
            </>
          )}

          {tab === 'faculty' && (
            <>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={(form.name as string) || ''} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Short Name</label>
                <input className="form-input" value={(form.shortName as string) || ''} onChange={e => set('shortName', e.target.value)} required />
              </div>
            </>
          )}

          {tab === 'rooms' && (
            <>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={(form.name as string) || ''} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={(form.type as string) || 'classroom'} onChange={e => set('type', e.target.value)}>
                  <option value="classroom">Classroom</option>
                  <option value="lab">Lab</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Capacity</label>
                <input className="form-input" type="number" min={1} value={(form.capacity as number) || 70} onChange={e => set('capacity', parseInt(e.target.value))} required />
              </div>
            </>
          )}

          {tab === 'divisions' && (
            <>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={(form.name as string) || ''} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Semester</label>
                <input className="form-input" type="number" min={1} max={8} value={(form.semester as number) || 6} onChange={e => set('semester', parseInt(e.target.value))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Strength</label>
                <input className="form-input" type="number" min={1} value={(form.strength as number) || 60} onChange={e => set('strength', parseInt(e.target.value))} required />
              </div>
            </>
          )}

          {tab === 'timeSlots' && (
            <>
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input className="form-input" value={(form.startTime as string) || ''} onChange={e => set('startTime', e.target.value)} placeholder="09:30" required />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input className="form-input" value={(form.endTime as string) || ''} onChange={e => set('endTime', e.target.value)} placeholder="10:30" required />
              </div>
              <div className="form-group">
                <label className="form-label">Order (position in day)</label>
                <input className="form-input" type="number" min={1} value={(form.order as number) || 1} onChange={e => set('order', parseInt(e.target.value))} required />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="isBreakCheck" checked={(form.isBreak as boolean) || false} onChange={e => set('isBreak', e.target.checked)} />
                <label htmlFor="isBreakCheck" className="form-label" style={{ margin: 0 }}>Break period</label>
              </div>
              <div className="form-group">
                <label className="form-label">Available on days (leave all unchecked = all days)</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {DAYS.map(day => (
                    <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={availDays.includes(day)}
                        onChange={() => toggleAvailableDay(day)}
                      />
                      {day}
                    </label>
                  ))}
                </div>
                {availDays.length > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                    Only scheduled on: {availDays.join(', ')}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editItem ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
