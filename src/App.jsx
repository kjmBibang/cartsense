import { useState } from 'react'
import UploadDataCheck from './client/screens/UploadDataCheck.jsx'
import ExecutiveDashboard from './client/screens/ExecutiveDashboard.jsx'
import BundleOpportunities from './client/screens/BundleOpportunities.jsx'
import ReliabilityReport from './client/screens/ReliabilityReport.jsx'
import BuyingPatterns from './client/screens/BuyingPatterns.jsx'
import ProductExplorer from './client/screens/ProductExplorer.jsx'
import HowItWorks from './client/screens/HowItWorks.jsx'
import ShoppingBehavior from './client/screens/ShoppingBehavior.jsx'
import DepartmentInsights from './client/screens/DepartmentInsights.jsx'
import AnalysisSettings from './client/screens/AnalysisSettings.jsx'
import ReportsExport from './client/screens/ReportsExport.jsx'
import AssociationNetwork from './client/screens/AssociationNetwork.jsx'
import './client/style/App.css'

const screens = [
  ['upload', 'Upload & Data Check', UploadDataCheck],
  ['dashboard', 'Executive Dashboard', ExecutiveDashboard],
  ['bundles', 'Bundle Opportunities', BundleOpportunities],
  ['reliability', 'Reliability Report', ReliabilityReport],
  ['patterns', 'Buying Patterns', BuyingPatterns],
  ['products', 'Product Explorer', ProductExplorer],
  ['how-it-works', 'How It Works', HowItWorks],
  ['behavior', 'Shopping Behavior', ShoppingBehavior],
  ['departments', 'Department Insights', DepartmentInsights],
  ['settings', 'Analysis Settings', AnalysisSettings],
  ['reports', 'Reports / Export', ReportsExport],
  ['network', 'Association Network', AssociationNetwork],
]

function App() {
  const [activeScreen, setActiveScreen] = useState('dashboard')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const activeEntry = screens.find(([id]) => id === activeScreen) ?? screens[0]
  const Screen = activeEntry[2]
  const activeTitle = activeEntry[1]

  return (
    <div className="app-shell">
      {isDrawerOpen && (
        <button
          className="drawer-backdrop"
          type="button"
          aria-label="Close screen navigation"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}
      <aside className={isDrawerOpen ? 'screen-nav drawer-open' : 'screen-nav'} aria-label="Screen navigation">
        <div className="drawer-header">
          <div className="brand"><span className="brand-mark" aria-hidden="true">C</span>CartSense</div>
          <button
            className="drawer-close"
            type="button"
            aria-label="Close screen navigation"
            onClick={() => setIsDrawerOpen(false)}
          >
            ×
          </button>
        </div>
        <p className="nav-label">Screens</p>
        <nav>
          {screens.map(([id, label]) => (
            <button
              className={activeScreen === id ? 'nav-item active' : 'nav-item'}
              aria-current={activeScreen === id ? 'page' : undefined}
              key={id}
              type="button"
              onClick={() => {
                setActiveScreen(id)
                setIsDrawerOpen(false)
              }}
            >
              <span className="nav-item-indicator" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="global-header">
          <button
            className="menu-trigger"
            type="button"
            aria-label="Open screen navigation"
            aria-expanded={isDrawerOpen}
            onClick={() => setIsDrawerOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="header-context">
            <span>Workspace</span>
            <span className="header-divider" aria-hidden="true">/</span>
            <strong>{activeTitle}</strong>
          </div>
          <span className="header-meta">CartSense Analysis</span>
        </header>
        <main className="screen-stage">
          <Screen onNavigate={setActiveScreen} />
        </main>
      </div>
    </div>
  )
}

export default App
