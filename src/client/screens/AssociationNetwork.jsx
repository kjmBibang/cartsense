import AnalysisScreen, { AnalysisPanel, DataTable, EmptyState, MetricCard } from '../AnalysisScreen.jsx'
import '../style/association-network.css'

const viewWidth = 900
const viewHeight = 560
function nodePosition(index, count) {
  const angle = (2 * Math.PI * index) / Math.max(count, 1) - Math.PI / 2
  return {
    x: viewWidth / 2 + Math.cos(angle) * 330,
    y: viewHeight / 2 + Math.sin(angle) * 215,
  }
}

export default function AssociationNetwork() {
  return (
    <AnalysisScreen title="Association Network" description="Explore the strongest product links, with a ranked list for precise follow-up when the network gets dense.">
      {(payload) => {
        const allNodes = Array.isArray(payload.network?.nodes) ? payload.network.nodes : []
        const allEdges = Array.isArray(payload.network?.edges) ? payload.network.edges : []
        const nodeById = new Map(allNodes.map((node) => [String(node.id), node]))
        const rankedEdges = [...allEdges].sort((a, b) => (Number(b.lift) || 0) - (Number(a.lift) || 0)
          || (Number(b.support) || 0) - (Number(a.support) || 0))
        const selectedEdges = rankedEdges.slice(0, 30)
        const degree = new Map()
        selectedEdges.forEach((edge) => {
          degree.set(String(edge.source), (degree.get(String(edge.source)) || 0) + 1)
          degree.set(String(edge.target), (degree.get(String(edge.target)) || 0) + 1)
        })
        const selectedNodeIds = [...degree.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 14)
          .map(([id]) => id)
        const visibleNodes = selectedNodeIds
          .map((id) => nodeById.get(id))
          .filter(Boolean)
        const visibleNodeIds = new Set(visibleNodes.map((node) => String(node.id)))
        const visibleEdges = selectedEdges.filter((edge) => visibleNodeIds.has(String(edge.source)) && visibleNodeIds.has(String(edge.target)))
        const positions = new Map(visibleNodes.map((node, index) => [String(node.id), nodePosition(index, visibleNodes.length)]))
        const departmentList = [...new Set(visibleNodes.map((node) => node.department).filter(Boolean))]
        const departmentColor = new Map(departmentList.map((department, index) => [
          department,
          `hsl(${Math.round((index * 360) / Math.max(departmentList.length, 1))} 55% 38%)`,
        ]))
        const relationshipRows = rankedEdges.slice(0, 100).map((edge, index) => ({
          ...edge,
          rank: index + 1,
          sourceProduct: nodeById.get(String(edge.source))?.label ?? `Product ${edge.source}`,
          targetProduct: nodeById.get(String(edge.target))?.label ?? `Product ${edge.target}`,
        }))

        return <>
          <div className="analysis-grid">
            <MetricCard label="Products with network nodes" value={allNodes.length.toLocaleString()} />
            <MetricCard label="Relationships available" value={allEdges.length.toLocaleString()} />
            <MetricCard label="Relationships in visual" value={visibleEdges.length.toLocaleString()} />
          </div>
          <AnalysisPanel title="Strongest relationship network" description={`Showing up to ${selectedEdges.length} highest-lift edges and ${visibleNodes.length} connected product nodes to keep the visual readable.`}>
            {visibleNodes.length && visibleEdges.length
              ? <div className="network-visual-wrap">
                <svg className="network-visual" viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="img" aria-label="Product relationship network, limited to strongest available relationships">
                  <title>Product relationship network. Nodes are products; links are ranked by lift.</title>
                  {visibleEdges.map((edge, index) => {
                    const source = positions.get(String(edge.source))
                    const target = positions.get(String(edge.target))
                    if (!source || !target) return null
                    const lift = Number(edge.lift) || 0
                    const strokeWidth = Math.max(1, Math.min(4, 1 + lift / 5))
                    return <line
                      key={`${edge.source}-${edge.target}-${index}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="#94a3b8"
                      strokeWidth={strokeWidth}
                      strokeOpacity="0.55"
                    >
                      <title>{`${nodeById.get(String(edge.source))?.label ?? edge.source} and ${nodeById.get(String(edge.target))?.label ?? edge.target}: lift ${lift.toLocaleString(undefined, { maximumFractionDigits: 2 })}×`}</title>
                    </line>
                  })}
                  {visibleNodes.map((node) => {
                    const point = positions.get(String(node.id))
                    return <g key={node.id}>
                      <circle cx={point.x} cy={point.y} r="9" fill={departmentColor.get(node.department) ?? '#1e3a8a'} stroke="#fff" strokeWidth="2">
                        <title>{`${node.label}${node.department ? ` · ${node.department}` : ''}`}</title>
                      </circle>
                      <text x={point.x} y={point.y + 24} textAnchor="middle" className="network-node-label">{node.label}</text>
                    </g>
                  })}
                </svg>
                {departmentList.length > 0 && <ul className="network-legend" aria-label="Department legend">
                  {departmentList.map((department) => <li key={department}><span style={{ backgroundColor: departmentColor.get(department) }} />{department}</li>)}
                </ul>}
              </div>
              : <EmptyState>No network relationships are available to visualize.</EmptyState>}
          </AnalysisPanel>
          <AnalysisPanel title="Ranked relationships" description="Lift ranks the relative association; support and confidence add reach and conditional likelihood.">
            <DataTable
              searchLabel="Search network relationships"
              columns={ [['rank', 'Rank'], ['sourceProduct', 'Product'], ['targetProduct', 'Related product'], ['orders', 'Orders'], ['support', 'Support'], ['confidence', 'Confidence'], ['lift', 'Lift']] }
              rows={relationshipRows}
            />
          </AnalysisPanel>
        </>
      }}
    </AnalysisScreen>
  )
}
