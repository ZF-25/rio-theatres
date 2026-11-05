import { Route, Routes } from 'react-router-dom'

import CustomerLayout from './layouts/CustomerLayout.jsx'
import Home from './pages/Home.jsx'
import Setup from './pages/Setup.jsx'
import NotFound from './pages/NotFound.jsx'

import './App.css'

function App() {
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<Home />} />
        <Route path="setup" element={<Setup />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default App