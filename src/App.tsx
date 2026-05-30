import { Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Bills } from './pages/Bills'
import { Friends } from './pages/Friends'
import { Capture } from './pages/Capture'
import { Review } from './pages/Review'
import { Assign } from './pages/Assign'
import { Results } from './pages/Results'

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/new/capture" element={<Capture />} />
        <Route path="/new/review" element={<Review />} />
        <Route path="/new/assign" element={<Assign />} />
        <Route path="/bill/:id" element={<Results />} />
      </Routes>
    </div>
  )
}
