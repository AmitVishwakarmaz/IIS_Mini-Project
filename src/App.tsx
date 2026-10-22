import { Routes, Route, NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import DashboardPage from './pages/DashboardPage'
import DataPage from './pages/DataPage'
import CreateTimetablePage from './pages/CreateTimetablePage'
import SavedTimetablesPage from './pages/SavedTimetablesPage'
import { seedAll } from './data/seed'

export default function App() {
  const [seeding, setSeeding] = useState(true)

  useEffect(() => {
    seedAll().then(() => setSeeding(false)).catch(() => setSeeding(false))
  }, [])

  if (seeding) return <div className="loading">Loading data...</div>

  return (
    <div className="app">
      <nav className="nav">
        <NavLink to="/" className="nav-brand">Timetable Generator</NavLink>
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/data" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Data
          </NavLink>
          <NavLink to="/create" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Create Timetable
          </NavLink>
          <NavLink to="/saved" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Saved
          </NavLink>
        </div>
      </nav>

      <div className="page">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/create" element={<CreateTimetablePage />} />
          <Route path="/saved" element={<SavedTimetablesPage />} />
        </Routes>
      </div>
    </div>
  )
}
