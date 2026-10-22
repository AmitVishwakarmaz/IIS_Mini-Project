import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAll } from '../data/firestore'
import type { College, Subject, Faculty, Room, Division, Timetable } from '../types'

export default function DashboardPage() {
  const [college, setCollege] = useState<College | null>(null)
  const [counts, setCounts] = useState({ subjects: 0, faculty: 0, rooms: 0, divisions: 0, timetables: 0 })

  useEffect(() => {
    async function load() {
      const [colleges, subjects, faculty, rooms, divisions, timetables] = await Promise.all([
        getAll<College>('colleges'),
        getAll<Subject>('subjects'),
        getAll<Faculty>('faculty'),
        getAll<Room>('rooms'),
        getAll<Division>('divisions'),
        getAll<Timetable>('timetables'),
      ])
      if (colleges.length > 0) setCollege(colleges[0])
      setCounts({
        subjects: subjects.length,
        faculty: faculty.length,
        rooms: rooms.length,
        divisions: divisions.length,
        timetables: timetables.length,
      })
    }
    load()
  }, [])

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      {college && (
        <div className="dashboard-info">
          <h2>{college.name}</h2>
          <p>{college.address}</p>
        </div>
      )}

      <div className="dashboard-stats">
        <div className="stat-item">
          <div className="stat-number">{counts.subjects}</div>
          <div className="stat-label">Subjects</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{counts.faculty}</div>
          <div className="stat-label">Faculty</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{counts.rooms}</div>
          <div className="stat-label">Rooms / Labs</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{counts.divisions}</div>
          <div className="stat-label">Divisions</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{counts.timetables}</div>
          <div className="stat-label">Saved</div>
        </div>
      </div>

      <div className="dashboard-actions">
        <Link to="/create"><button className="btn btn-primary">Create Timetable</button></Link>
        <Link to="/data"><button className="btn btn-secondary">Manage Data</button></Link>
        <Link to="/saved"><button className="btn btn-secondary">Saved Timetables</button></Link>
      </div>
    </div>
  )
}
