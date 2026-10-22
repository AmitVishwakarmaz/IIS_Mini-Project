import { useEffect, useState } from 'react'
import { getAll, remove, create } from '../data/firestore'
import { exportSinglePDF, exportAllPDF } from '../utils/pdfExport'
import type { Timetable, Subject, Faculty, Room, Division, TimeSlot } from '../types'
import { DAYS } from '../types'

export default function SavedTimetablesPage() {
  const [timetables, setTimetables] = useState<Timetable[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [viewing, setViewing] = useState<Timetable | null>(null)
  const [viewDiv, setViewDiv] = useState<string>('')

  async function load() {
    const [tt, s, f, r, d, t] = await Promise.all([
      getAll<Timetable>('timetables'),
      getAll<Subject>('subjects'),
      getAll<Faculty>('faculty'),
      getAll<Room>('rooms'),
      getAll<Division>('divisions'),
      getAll<TimeSlot>('timeSlots'),
    ])
    setTimetables(tt.sort((a, b) => b.createdAt - a.createdAt))
    setSubjects(s)
    setFaculty(f)
    setRooms(r)
    setDivisions(d)
    setTimeSlots(t.sort((a, b) => a.order - b.order))
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Delete this timetable?')) return
    await remove('timetables', id)
    load()
    if (viewing?.id === id) setViewing(null)
  }

  async function handleDuplicate(tt: Timetable) {
    const copy: Omit<Timetable, 'id'> = {
      ...tt,
      name: tt.name + ' (Copy)',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const { ...data } = copy
    await create('timetables', data)
    load()
  }

  function openView(tt: Timetable) {
    setViewing(tt)
    if (tt.divisionIds.length > 0) setViewDiv(tt.divisionIds[0])
  }

  return (
    <div>
      <h1 className="page-title">Saved Timetables</h1>

      {!viewing ? (
        <div className="saved-list">
          {timetables.length === 0 && (
            <p style={{ color: 'var(--gray-400)', padding: 40, fontSize: 13 }}>
              No saved timetables yet. Create one first.
            </p>
          )}
          {timetables.map(tt => (
            <div key={tt.id} className="saved-item">
              <div className="saved-item-info">
                <h3>{tt.name}</h3>
                <p>
                  {tt.type === 'daily' ? 'Daily' : 'Exam'} • Semester {tt.semester} •
                  {' '}{tt.divisionIds.map(id => divisions.find(d => d.id === id)?.name || id).join(', ')} •
                  {' '}{new Date(tt.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className={`status-badge status-${tt.status}`}>{tt.status}</span>
                <button className="btn btn-secondary btn-small" onClick={() => openView(tt)}>View</button>
                {tt.type === 'daily' && (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => exportAllPDF({ entries: tt.entries, subjects, faculty, rooms, divisions, timeSlots, semester: tt.semester, timetableName: tt.name }, tt.divisionIds)}
                  >PDF</button>
                )}
                <button className="btn btn-secondary btn-small" onClick={() => handleDuplicate(tt)}>Duplicate</button>
                <button className="btn btn-danger btn-small" onClick={() => handleDelete(tt.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={() => setViewing(null)}>Back</button>
            <button className="btn btn-secondary" onClick={() => window.print()}>Print</button>
            {viewing.type === 'daily' && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => exportAllPDF({ entries: viewing.entries, subjects, faculty, rooms, divisions, timeSlots, semester: viewing.semester, timetableName: viewing.name }, viewing.divisionIds)}
                >
                  Export All PDF
                </button>
                {viewing.divisionIds.map(did => {
                  const div = divisions.find(d => d.id === did)
                  return (
                    <button
                      key={did}
                      className="btn btn-secondary btn-small"
                      onClick={() => exportSinglePDF({ entries: viewing.entries, subjects, faculty, rooms, divisions, timeSlots, semester: viewing.semester, timetableName: viewing.name }, did)}
                    >
                      {div?.name || did} PDF
                    </button>
                  )
                })}
              </>
            )}
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{viewing.name}</h2>
          <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 16 }}>
            {viewing.type === 'daily' ? 'Daily Timetable' : 'Exam Timetable'} • Semester {viewing.semester}
          </p>

          {viewing.type === 'daily' ? (
            <>
              <div className="div-tabs no-print">
                {viewing.divisionIds.map(did => {
                  const div = divisions.find(d => d.id === did)
                  return (
                    <button key={did} className={`div-tab ${viewDiv === did ? 'active' : ''}`} onClick={() => setViewDiv(did)}>
                      {div?.name || did}
                    </button>
                  )
                })}
              </div>

              <div className="timetable-header">
                <div className="timetable-header-info">
                  <h2>CLASS TIME TABLE</h2>
                  <p>Computer Engineering • Semester {viewing.semester} • {divisions.find(d => d.id === viewDiv)?.name}</p>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="timetable-grid">
                  <thead>
                    <tr>
                      <th>TIME</th>
                      {DAYS.map(d => <th key={d}>{d}</th>)}
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
                          <td className="time-label">{ts.startTime}<br />{ts.endTime}</td>
                          {DAYS.map(d => {
                            const entry = viewing.entries.find(e => e.day === d && e.timeSlotId === ts.id && e.divisionId === viewDiv)
                            const sub = entry ? subjects.find(s => s.id === entry.subjectId) : null
                            const fac = entry ? faculty.find(f => f.id === entry.facultyId) : null
                            const rm = entry ? rooms.find(r => r.id === entry.roomId) : null

                            return (
                              <td key={d}>
                                <div className={`timetable-cell ${sub ? sub.type : 'free-cell'} ${entry?.isLocked ? 'locked' : ''}`}>
                                  {entry && sub ? (
                                    <>
                                      <div className="cell-subject">{sub.code}</div>
                                      <div className="cell-faculty">{fac?.shortName}</div>
                                      <div className="cell-room">{rm?.name}</div>
                                      {entry.isLocked && <span className="cell-lock">●</span>}
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* Exam view */
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Time</th><th>Subject</th><th>Code</th><th>Division</th><th>Room</th></tr>
              </thead>
              <tbody>
                {(viewing.examEntries || [])
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
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
