import AnalysisScreen, { AnalysisPanel, DataTable, DetailDisclosure, EmptyState, HorizontalBarChart, MetricCard } from '../AnalysisScreen.jsx'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const formatHour = (hour) => `${String(hour).padStart(2, '0')}:00`

export default function ShoppingBehavior() {
  return (
    <AnalysisScreen title="Shopping Behavior" description="See when customers shop, how large baskets are, and what the payload says about repeat purchasing.">
      {(payload) => {
        const byDay = Array.isArray(payload.dashboard?.ordersByDay)
          ? payload.dashboard.ordersByDay.map((row) => ({ ...row, label: days[Number(row.day)] ?? `Day ${row.day}` }))
          : []
        const byHour = Array.isArray(payload.dashboard?.ordersByHour)
          ? payload.dashboard.ordersByHour.map((row) => ({ ...row, label: formatHour(row.hour) }))
          : []
        const reorders = Array.isArray(payload.behavior?.reorders) ? payload.behavior.reorders : []
        const basketSizes = Array.isArray(payload.behavior?.basketSizes) ? payload.behavior.basketSizes : []
        const intervals = Array.isArray(payload.behavior?.daysSincePriorOrder) ? payload.behavior.daysSincePriorOrder : []
        const heatmap = Array.isArray(payload.behavior?.heatmap) ? payload.behavior.heatmap : []
        const reorderedItems = reorders.find((row) => Number(row.reordered) === 1)?.items
        const totalReorderItems = reorders.reduce((sum, row) => sum + (Number(row.items) || 0), 0)
        const repeatShare = reorderedItems != null && totalReorderItems > 0 ? (Number(reorderedItems) / totalReorderItems) * 100 : null
        const peakDay = [...byDay].sort((a, b) => (Number(b.orders) || 0) - (Number(a.orders) || 0))[0]
        const peakHour = [...byHour].sort((a, b) => (Number(b.orders) || 0) - (Number(a.orders) || 0))[0]
        const frequentInterval = [...intervals].sort((a, b) => (Number(b.items) || 0) - (Number(a.items) || 0))[0]

        return <>
          <div className="analysis-grid">
            <MetricCard label="Orders analyzed" value={payload.summary?.orders?.toLocaleString() ?? '—'} />
            <MetricCard label="Customers represented" value={payload.summary?.customers?.toLocaleString() ?? '—'} />
            <MetricCard label="Average basket size" value={payload.summary?.averageBasketSize == null ? '—' : `${Number(payload.summary.averageBasketSize).toLocaleString(undefined, { maximumFractionDigits: 2 })} items`} />
            <MetricCard label="Reorder rate" value={payload.summary?.reorderRate == null ? '—' : `${Number(payload.summary.reorderRate).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`} />
          </div>
          <div className="analysis-chart-grid">
            <AnalysisPanel title="Orders by day" description="Observed order volume by weekday.">
              <HorizontalBarChart rows={byDay} labelKey="label" valueKey="orders" label="Orders by day of week" detailLabel="See weekday observations below" />
            </AnalysisPanel>
            <AnalysisPanel title="Orders by hour" description="Observed order volume by hour of day.">
              <HorizontalBarChart rows={byHour} labelKey="label" valueKey="orders" label="Orders by hour" detailLabel="See hour observations below" />
            </AnalysisPanel>
          </div>
          {(peakDay || peakHour) && <div className="analysis-insight-strip">
            {peakDay && <p><strong>Peak weekday in this payload:</strong> {peakDay.label}, with {Number(peakDay.orders).toLocaleString()} orders.</p>}
            {peakHour && <p><strong>Peak hour:</strong> {peakHour.label}, with {Number(peakHour.orders).toLocaleString()} orders.</p>}
          </div>}
          <div className="analysis-chart-grid">
            <AnalysisPanel title="Basket size distribution" description="Order counts are shown as supplied by the analysis.">
              {basketSizes.length
                ? <HorizontalBarChart rows={basketSizes} labelKey="size" valueKey="orders" label="Orders by basket size" valueFormat={(value) => `${value.toLocaleString()} orders`} />
                : <EmptyState>Basket-size distribution is not available in this payload.</EmptyState>}
              <DetailDisclosure title="How to read basket size">This distribution counts baskets by the number of items they contain. It describes observed shopping behavior, not a forecast of future basket size.</DetailDisclosure>
            </AnalysisPanel>
            <AnalysisPanel title="Reordered items" description="Counts distinguish items marked as reorders from first-time items.">
              {reorders.length
                ? <>
                  {repeatShare != null && <p className="analysis-callout">{repeatShare.toLocaleString(undefined, { maximumFractionDigits: 1 })}% of items in the reorder breakdown are marked as reordered.</p>}
                  <HorizontalBarChart rows={reorders.map((row) => ({ ...row, label: Number(row.reordered) === 1 ? 'Reordered' : 'Not reordered' }))} labelKey="label" valueKey="items" label="Items by reorder status" valueFormat={(value) => `${value.toLocaleString()} items`} />
                </>
                : <EmptyState>Reorder breakdown is not available in this payload.</EmptyState>}
            </AnalysisPanel>
          </div>
          {frequentInterval && <p className="analysis-footnote">Most represented prior-order interval: {Number(frequentInterval.days).toLocaleString()} days ({Number(frequentInterval.items).toLocaleString()} items). This is an observed interval distribution, not a forecast.</p>}
          <AnalysisPanel title="Observed day-and-hour combinations" description="Only combinations present in the payload are listed; absent combinations are not treated as measured zeroes.">
            <DataTable
              searchLabel="Search day and hour observations"
              columns={ [['day', 'Weekday'], ['hour', 'Hour'], ['orders', 'Orders']] }
              rows={heatmap.map((row) => ({ ...row, day: days[Number(row.day)] ?? `Day ${row.day}`, hour: formatHour(row.hour) }))}
            />
          </AnalysisPanel>
        </>
      }}
    </AnalysisScreen>
  )
}
