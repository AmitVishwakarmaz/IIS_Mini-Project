import { useEffect, useState, useMemo } from 'react'
import { getAll, create } from '../data/firestore'
import { solve, validateTimetable } from '../scheduling/solver'
import { exportSinglePDF, exportAllPDF } from '../utils/pdfExport'
import type {
  Subject, Faculty, Room, Division, TimeSlot, DaySchedule,
  TimetableEntry, Timetable, ExamEntry, Day, SolverInput
} from '../types'
import { DAYS, computeWeeklyLoad } from '../types'

export default function CreateTimetablePage() {
  const [mode, setMode] = useState<'daily' | 'exam'>('daily')

  // Data
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>([])

  // Selection
  const [selectedDivIds, setSelectedDivIds] = useState<string[]>([])
  const [semester, setSemester] = useState(6)

  // Generated timetable
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [generated, setGenerated] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [conflicts, setConflicts] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)

  // View
  const [viewDiv, setViewDiv] = useState<string | 'all' | 'faculty'>('all')

  // Edit
  const [editingCell, setEditingCell] = useState<{ day: Day; tsId: string; divId: string } | null>(null)

  // Exam
  const [examEntries, setExamEntries] = useState<ExamEntry[]>([])
  const [examDate, setExamDate] = useState('')
  const [examSlot, setExamSlot] = useState('')
  const [examSubject, setExamSubject] = useState('')
  const [examDiv, setExamDiv] = useState('')
  const [examRoom, setExamRoom] = useState('')

  // Timetable name
  const [ttName, setTtName] = useState('')

  useEffect(() => {
    async function load() {
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
    load()
  }, [])

  const filteredDivs = divisions.filter(d => d.semester === semester)
  const filteredSubjects = subjects.filter(s => s.semester === semester)
  const selectedDivs = divisions.filter(d => selectedDivIds.includes(d.id))

  function toggleDiv(id: string) {
    setSelectedDivIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // ── Generate ──
  function handleGenerate() {
    setError('')
    setWarnings([])
    setConflicts([])
    setGenerating(true)

    const input: SolverInput = {
      divisions: selectedDivs,
      subjects: filteredSubjects,
      faculty,
      rooms,
      timeSlots,
      daySchedules,
      lockedEntries: entries.filter(e => e.isLocked),
    }

    // Run solver (synchronous for MVP — fast enough)
    setTimeout(() => {
      try {
        const result = solve(input)
        setGenerating(false)

        if (result.success) {
          setEntries(result.entries)
          setGenerated(true)
          setWarnings(result.warnings)
          if (selectedDivIds.length > 0) setViewDiv(selectedDivIds[0])
        } else {
          setError(result.error || 'Failed to generate timetable.')
        }
      } catch (err: any) {
        setGenerating(false)
        setError('Error during timetable generation: ' + (err?.message || String(err)))
      }
    }, 50)
  }

  // ── Validate ──
  function runValidation() {
    const input: SolverInput = { divisions: selectedDivs, subjects: filteredSubjects, faculty, rooms, timeSlots, daySchedules, lockedEntries: [] }
    const errs = validateTimetable(entries, input)
    setConflicts(errs)
  }

  // ── Edit cell ──
  function handleCellClick(day: Day, tsId: string, divId: string) {
    if (editingCell && editingCell.day === day && editingCell.tsId === tsId && editingCell.divId === divId) {
      setEditingCell(null)
    } else {
      setEditingCell({ day, tsId, divId })
    }
  }

  function updateEntry(day: Day, tsId: string, divId: string, field: string, value: string) {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.day === day && e.timeSlotId === tsId && e.divisionId === divId)
      if (idx === -1) {
        const subjectId = field === 'subjectId' ? value : ''
        const sub = subjects.find(s => s.id === subjectId)
        // Add new entry
        const newEntry: TimetableEntry = {
          day, timeSlotId: tsId, divisionId: divId,
          subjectId,
          facultyId: field === 'facultyId' ? value : (sub?.facultyIds?.[0] || sub?.facultyId || ''),
          roomId: field === 'roomId' ? value : '',
          isLocked: false,
        }
        return [...prev, newEntry]
      }
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      // Auto-fill faculty when subject changes
      if (field === 'subjectId') {
        const sub = subjects.find(s => s.id === value)
        if (sub) updated[idx].facultyId = sub.facultyIds?.[0] || sub.facultyId || ''
      }
      return updated
    })
    runValidation()
  }

  function toggleLock(day: Day, tsId: string, divId: string) {
    setEntries(prev => prev.map(e =>
      e.day === day && e.timeSlotId === tsId && e.divisionId === divId
        ? { ...e, isLocked: !e.isLocked }
        : e
    ))
  }

  function deleteEntry(day: Day, tsId: string, divId: string) {
    setEntries(prev => prev.filter(e => !(e.day === day && e.timeSlotId === tsId && e.divisionId === divId)))
    setEditingCell(null)
    runValidation()
  }

  // ── Save ──
  async function handleSave() {
    const name = ttName || `Timetable ${new Date().toLocaleDateString()}`
    const tt: Omit<Timetable, 'id'> = {
      name,
      type: mode,
      departmentId: 'comp',
      semester,
      divisionIds: selectedDivIds,
      status: 'draft',
      entries: mode === 'daily' ? entries : [],
      examEntries: mode === 'exam' ? examEntries : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await create('timetables', tt)
    alert('Timetable saved!')
  }

  // ── Exam add ──
  function addExamEntry() {
    if (!examDate || !examSlot || !examSubject || !examDiv || !examRoom) return
    // Check clashes
    const clash = examEntries.find(e =>
      e.date === examDate && e.timeSlotId === examSlot && (e.divisionId === examDiv || e.roomId === examRoom)
    )
    if (clash) {
      alert('Clash detected! Division or room already scheduled at this date/time.')
      return
    }
    setExamEntries(prev => [...prev, {
      date: examDate, timeSlotId: examSlot, subjectId: examSubject,
      divisionId: examDiv, roomId: examRoom,
    }])
  }

  // ── Grid rendering ──
  const visibleEntries = useMemo(() => {
    if (viewDiv === 'all') return entries
    if (viewDiv === 'faculty') return entries
    return entries.filter(e => e.divisionId === viewDiv)
  }, [entries, viewDiv])

  // Faculty view: group by faculty
  const facultyView = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>()
    for (const e of entries) {
      if (!map.has(e.facultyId)) map.set(e.facultyId, [])
      map.get(e.facultyId)!.push(e)
    }
    return map
  }, [entries])

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Create Timetable</h1>
        <div className="toggle-group">
          <button className={`toggle-btn ${mode === 'daily' ? 'active' : ''}`} onClick={() => setMode('daily')}>Daily Timetable</button>
          <button className={`toggle-btn ${mode === 'exam' ? 'active' : ''}`} onClick={() => setMode('exam')}>Exam Timetable</button>
        </div>
      </div>

      {mode === 'daily' ? (
        <div className={generated ? 'create-layout' : ''}>
          {/* Sidebar */}
          <div className="create-sidebar no-print">
            <div className="sidebar-section">
              <div className="section-title">Semester</div>
              <select className="form-select" value={semester} onChange={e => { setSemester(parseInt(e.target.value)); setSelectedDivIds([]); setGenerated(false) }}>
                {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}
              </select>
            </div>

            <div className="sidebar-section">
              <div className="section-title">Divisions</div>
              <div className="checkbox-group">
                {filteredDivs.map(d => (
                  <div
                    key={d.id}
                    className={`checkbox-item ${selectedDivIds.includes(d.id) ? 'selected' : ''}`}
                    onClick={() => toggleDiv(d.id)}
                  >
                    {d.name}
                  </div>
                ))}
              </div>
              {filteredDivs.length === 0 && <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>No divisions for semester {semester}</p>}
            </div>

            <div className="sidebar-section">
              <div className="section-title">Subjects ({filteredSubjects.length})</div>
              {filteredSubjects.map(s => (
                <div key={s.id} style={{ fontSize: 12, padding: '2px 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>{s.code}</strong> {s.name}</span>
                  <span style={{ color: 'var(--gray-400)' }}>{s.weeklyPeriods}/wk</span>
                </div>
              ))}
              {filteredSubjects.length > 0 && (() => {
                const load = computeWeeklyLoad(filteredSubjects)
                return (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--gray-100)' }}>
                    <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', overflow: 'hidden', fontSize: 11 }}>
                      {[
                        { label: 'Theory', val: load.theory, bg: 'var(--blue-50)' },
                        { label: 'Prac', val: load.practical, bg: 'var(--orange-50)' },
                        { label: 'Tut', val: load.tutorial, bg: 'var(--emerald-50)' },
                        { label: 'PBL', val: load.pbl, bg: 'var(--violet-50)' },
                        { label: 'Total', val: load.total, bg: 'var(--gray-100)' },
                      ].map(({ label, val, bg }) => (
                        <div key={label} style={{ flex: 1, textAlign: 'center', padding: '4px 2px', background: bg, borderRight: '1px solid var(--gray-200)' }}>
                          <div style={{ fontWeight: 700, color: 'var(--gray-800)', fontSize: 13 }}>{val}</div>
                          <div style={{ color: 'var(--gray-500)', fontSize: 9 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 4 }}>periods / week</div>
                  </div>
                )
              })()}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '8px 16px' }}
              onClick={handleGenerate}
              disabled={selectedDivIds.length === 0 || generating}
            >
              {generating ? 'Generating...' : 'Generate Timetable'}
            </button>

            {generated && (
              <>
                <div className="form-group">
                  <label className="form-label">Timetable Name</label>
                  <input className="form-input" value={ttName} onChange={e => setTtName(e.target.value)} placeholder="e.g. TE Comp Sem 6" />
                </div>
                <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={handleSave}>Save</button>
                  <button className="btn btn-secondary" onClick={runValidation}>Validate</button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div className="section-title" style={{ marginBottom: 6 }}>Export PDF</div>
                  <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => exportAllPDF({ entries, subjects, faculty, rooms, divisions, timeSlots, semester, timetableName: ttName }, selectedDivIds)}
                    >
                      All Divisions
                    </button>
                    {selectedDivs.map(div => (
                      <button
                        key={div.id}
                        className="btn btn-secondary btn-small"
                        onClick={() => exportSinglePDF({ entries, subjects, faculty, rooms, divisions, timeSlots, semester, timetableName: ttName }, div.id)}
                      >
                        {div.name}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => window.print()}>Print</button>
              </>
            )}
          </div>

          {/* Main area */}
          <div className="create-main">
            {error && <div className="alert alert-error">{error}</div>}
            {warnings.map((w, i) => <div key={i} className="alert alert-warning">{w}</div>)}
            {conflicts.map((c, i) => <div key={i} className="alert alert-error">{c}</div>)}

            {generated && (
              <>
                {/* Division tabs */}
                <div className="div-tabs no-print">
                  {selectedDivs.map(d => (
                    <button key={d.id} className={`div-tab ${viewDiv === d.id ? 'active' : ''}`} onClick={() => setViewDiv(d.id)}>
                      {d.name}
                    </button>
                  ))}
                  <button className={`div-tab ${viewDiv === 'all' ? 'active' : ''}`} onClick={() => setViewDiv('all')}>
                    All Divisions
                  </button>
                  <button className={`div-tab ${viewDiv === 'faculty' ? 'active' : ''}`} onClick={() => setViewDiv('faculty')}>
                    Faculty View
                  </button>
                </div>

                {/* Faculty view */}
                {viewDiv === 'faculty' ? (
                  <div>
                    {Array.from(facultyView.entries()).map(([fId, fEntries]) => {
                      const fac = faculty.find(f => f.id === fId)
                      return (
                        <div key={fId} style={{ marginBottom: 16 }}>
                          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--gray-800)' }}>{fac?.name || fId}</h3>
                          <table className="data-table">
                            <thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Room</th><th>Division</th></tr></thead>
                            <tbody>
                              {fEntries
                                .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day))
                                .map((e, i) => {
                                  const ts = timeSlots.find(t => t.id === e.timeSlotId)
                                  const sub = subjects.find(s => s.id === e.subjectId)
                                  const rm = rooms.find(r => r.id === e.roomId)
                                  const div = divisions.find(d => d.id === e.divisionId)
                                  return (
                                    <tr key={i}>
                                      <td>{e.day}</td>
                                      <td>{ts?.startTime}–{ts?.endTime}</td>
                                      <td>{sub?.code}</td>
                                      <td>{rm?.name}</td>
                                      <td>{div?.name}</td>
                                    </tr>
                                  )
                                })}
                            </tbody>
                          </table>
                        </div>
                      )
                    })}
                  </div>
                ) : viewDiv === 'all' ? (
                  /* All divisions - show each grid */
                  selectedDivs.map(div => (
                    <div key={div.id} style={{ marginBottom: 24 }}>
                      <TimetableHeader division={div} semester={semester} />
                      <TimetableGridView
                        entries={entries.filter(e => e.divisionId === div.id)}
                        timeSlots={timeSlots}
                        subjects={subjects}
                        faculty={faculty}
                        rooms={rooms}
                        divisionId={div.id}
                        onCellClick={handleCellClick}
                        editingCell={editingCell}
                        onUpdate={updateEntry}
                        onToggleLock={toggleLock}
                        onDelete={deleteEntry}
                        allSubjects={filteredSubjects}
                        allRooms={rooms}
                        daySchedules={daySchedules}
                      />
                    </div>
                  ))
                ) : (
                  /* Single division */
                  <>
                    <TimetableHeader division={selectedDivs.find(d => d.id === viewDiv)!} semester={semester} />
                    <TimetableGridView
                      entries={visibleEntries}
                      timeSlots={timeSlots}
                      subjects={subjects}
                      faculty={faculty}
                      rooms={rooms}
                      divisionId={viewDiv}
                      onCellClick={handleCellClick}
                      editingCell={editingCell}
                      onUpdate={updateEntry}
                      onToggleLock={toggleLock}
                      onDelete={deleteEntry}
                      allSubjects={filteredSubjects}
                      allRooms={rooms}
                      daySchedules={daySchedules}
                    />
                  </>
                )}
              </>
            )}

            {!generated && !error && (
              <div style={{ padding: '40px 20px', color: 'var(--gray-400)', fontSize: 13 }}>
                Select divisions and click <strong>Generate Timetable</strong> to start.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Exam mode ── */
        <div>
          <div className="no-print" style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--gray-200)' }}>
            <div className="section-title">Add Exam</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Time Slot</label>
                <select className="form-select" value={examSlot} onChange={e => setExamSlot(e.target.value)}>
                  <option value="">Select</option>
                  {timeSlots.filter(t => !t.isBreak).map(t => (
                    <option key={t.id} value={t.id}>{t.startTime}–{t.endTime}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Subject</label>
                <select className="form-select" value={examSubject} onChange={e => setExamSubject(e.target.value)}>
                  <option value="">Select</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Division</label>
                <select className="form-select" value={examDiv} onChange={e => setExamDiv(e.target.value)}>
                  <option value="">Select</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Room</label>
                <select className="form-select" value={examRoom} onChange={e => setExamRoom(e.target.value)}>
                  <option value="">Select</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={addExamEntry}>+ Add</button>
            </div>
          </div>

          {examEntries.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="section-title" style={{ margin: 0 }}>Exam Timetable</div>
                <div className="btn-group no-print">
                  <button className="btn btn-primary btn-small" onClick={handleSave}>Save</button>
                  <button className="btn btn-secondary btn-small" onClick={() => window.print()}>Print</button>
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Time</th><th>Subject</th><th>Code</th><th>Division</th><th>Room</th><th className="no-print"></th></tr>
                </thead>
                <tbody>
                  {examEntries
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((e, i) => {
                      const sub = subjects.find(s => s.id === e.subjectId)
                      const div = divisions.find(d => d.id === e.divisionId)
                      const rm = rooms.find(r => r.id === e.roomId)
                      const ts = timeSlots.find(t => t.id === e.timeSlotId)
                      return (
                        <tr key={i}>
                          <td>{e.date}</td>
                          <td>{ts?.startTime}–{ts?.endTime}</td>
                          <td>{sub?.name}</td>
                          <td><strong>{sub?.code}</strong></td>
                          <td>{div?.name}</td>
                          <td>{rm?.name}</td>
                          <td className="no-print">
                            <button className="btn btn-danger btn-small" onClick={() => setExamEntries(prev => prev.filter((_, j) => j !== i))}>Del</button>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function TimetableHeader({ division, semester }: { division: Division; semester: number }) {
  return (
    <div className="timetable-header">
      <div className="timetable-header-info">
        <h2>CLASS TIME TABLE</h2>
        <p>Computer Engineering • Semester {semester} • {division.name} • Strength: {division.strength}</p>
      </div>
    </div>
  )
}

function TimetableGridView({
  entries, timeSlots, subjects, faculty, rooms, divisionId,
  onCellClick, editingCell, onUpdate, onToggleLock, onDelete,
  allSubjects, allRooms, daySchedules,
}: {
  entries: TimetableEntry[]
  timeSlots: TimeSlot[]
  subjects: Subject[]
  faculty: Faculty[]
  rooms: Room[]
  divisionId: string
  onCellClick: (day: Day, tsId: string, divId: string) => void
  editingCell: { day: Day; tsId: string; divId: string } | null
  onUpdate: (day: Day, tsId: string, divId: string, field: string, value: string) => void
  onToggleLock: (day: Day, tsId: string, divId: string) => void
  onDelete: (day: Day, tsId: string, divId: string) => void
  allSubjects: Subject[]
  allRooms: Room[]
  daySchedules?: DaySchedule[]
}) {
  function getEntry(day: Day, tsId: string) {
    return entries.find(e => e.day === day && e.timeSlotId === tsId && e.divisionId === divisionId)
  }

  // Check if a slot is available on a given day
  function isSlotAvailableOnDay(ts: TimeSlot, day: Day): boolean {
    const ds = daySchedules?.find(s => s.day === day)
    if (ds && ts.order > ds.maxSlotOrder) return false
    if (ts.availableDays && ts.availableDays.length > 0) {
      return ts.availableDays.includes(day)
    }
    return true
  }

  // Summary: periods per day
  const periodsPerDay = DAYS.map(day => ({
    day,
    count: entries.filter(e => e.day === day && e.divisionId === divisionId).length
  }))
  const totalPeriods = periodsPerDay.reduce((sum, d) => sum + d.count, 0)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="timetable-grid">
        <thead>
          <tr>
            <th>TIME</th>
            {DAYS.map(d => {
              const ds = daySchedules?.find(s => s.day === d)
              const reserved = ds?.reservedForTypes ?? []
              const isAlt = ds?.pattern === 'alternate'
              return (
                <th key={d} style={{
                  background: reserved.length > 0 ? 'var(--violet-50, #f5f3ff)' : undefined,
                  fontSize: 11,
                }}>
                  <div>{d}{isAlt ? ' ⇄' : ''}</div>
                  {reserved.length > 0 && (
                    <div style={{ fontSize: 9, fontWeight: 400, color: '#7c3aed', letterSpacing: '0.02em' }}>
                      {reserved.join('/')}
                    </div>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map(ts => {
            if (ts.isBreak) {
              return (
                <tr key={ts.id} className="break-row">
                  <td className="time-label">{ts.startTime}–{ts.endTime}</td>
                  {DAYS.map(d => <td key={d}>BREAK</td>)}
                </tr>
              )
            }
            return (
              <tr key={ts.id}>
                <td className="time-label">{ts.startTime}<br/>{ts.endTime}</td>
                {DAYS.map(d => {
                  const available = isSlotAvailableOnDay(ts, d)
                  if (!available) {
                    return (
                      <td key={d}>
                        <div className="timetable-cell" style={{ background: 'var(--gray-100)', cursor: 'default' }} />
                      </td>
                    )
                  }

                  const entry = getEntry(d, ts.id)
                  const sub = entry ? subjects.find(s => s.id === entry.subjectId) : null
                  const fac = entry ? faculty.find(f => f.id === entry.facultyId) : null
                  const rm = entry ? rooms.find(r => r.id === entry.roomId) : null
                  const isEditing = editingCell && editingCell.day === d && editingCell.tsId === ts.id && editingCell.divId === divisionId

                  return (
                    <td key={d} style={{ position: 'relative' }}>
                      <div
                        className={`timetable-cell ${sub ? sub.type : 'free-cell'} ${entry?.isLocked ? 'locked' : ''}`}
                        onClick={() => onCellClick(d, ts.id, divisionId)}
                      >
                        {entry && sub ? (
                          <>
                            <div className="cell-subject">{sub.code}</div>
                            <div className="cell-faculty">{fac?.shortName}</div>
                            <div className="cell-room">{rm?.name}</div>
                            {entry.isLocked && <span className="cell-lock">●</span>}
                          </>
                        ) : null}
                      </div>

                      {/* Edit popup */}
                      {isEditing && (
                        <div className="cell-edit-popup no-print" onClick={e => e.stopPropagation()}>
                          <div className="form-group">
                            <label className="form-label">Subject</label>
                            <select className="form-select" value={entry?.subjectId || ''} onChange={e => onUpdate(d, ts.id, divisionId, 'subjectId', e.target.value)}>
                              <option value="">— Free —</option>
                              {allSubjects.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Room</label>
                            <select className="form-select" value={entry?.roomId || ''} onChange={e => onUpdate(d, ts.id, divisionId, 'roomId', e.target.value)}>
                              <option value="">Select</option>
                              {allRooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type})</option>)}
                            </select>
                          </div>
                          {entry && (
                            <div className="form-group">
                              <label className="form-label">Teacher</label>
                              <select className="form-select" value={entry.facultyId} onChange={e => onUpdate(d, ts.id, divisionId, 'facultyId', e.target.value)}>
                                {(sub?.facultyIds?.length ? sub.facultyIds : sub?.facultyId ? [sub.facultyId] : []).map(id => {
                                  const teacher = faculty.find(f => f.id === id)
                                  return <option key={id} value={id}>{teacher?.name || id}</option>
                                })}
                              </select>
                            </div>
                          )}
                          <div className="btn-group" style={{ marginTop: 8 }}>
                            {entry && <button className="btn btn-secondary btn-small" onClick={() => onToggleLock(d, ts.id, divisionId)}>{entry.isLocked ? 'Unlock' : 'Lock'}</button>}
                            {entry && <button className="btn btn-danger btn-small" onClick={() => onDelete(d, ts.id, divisionId)}>Remove</button>}
                          </div>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {/* Summary footer row */}
          <tr style={{ background: 'var(--gray-50)' }}>
            <td className="time-label" style={{ fontWeight: 700, fontSize: 10, color: 'var(--gray-600)' }}>TOTAL</td>
            {periodsPerDay.map(({ day, count }) => (
              <td key={day} style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--gray-700)', padding: '4px' }}>
                {count > 0 ? count : ''}
              </td>
            ))}
          </tr>
          <tr style={{ background: 'var(--gray-100)' }}>
            <td className="time-label" style={{ fontWeight: 700, fontSize: 10, color: 'var(--gray-600)' }}>WEEK</td>
            <td colSpan={DAYS.length} style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--gray-800)', padding: '4px' }}>
              {totalPeriods} periods / week
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
