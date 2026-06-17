import type { DisasterAlert } from '../data/disasters'

export default function DisasterStrip({
  alerts,
  onNotify,
}: {
  alerts: DisasterAlert[]
  onNotify?: (a: DisasterAlert) => void
}) {
  return (
    <div className="dz-strip">
      <div className="dz-head">
        <i className="ti ti-alert-triangle" aria-hidden="true" /> 재난·기상 경보
      </div>
      {alerts.length === 0 ? (
        <div className="dz-item ok">
          <i className="ti ti-circle-check" aria-hidden="true" />
          <span>현재 발효 중인 경보가 없습니다.</span>
        </div>
      ) : (
        alerts.map((a) => (
          <div key={a.id} className={`dz-item ${a.severity}`}>
            <i className={`ti ${a.icon}`} aria-hidden="true" />
            <div style={{ flex: 1 }}>
              <span className="dz-title">{a.title}</span>
              <span className="dz-detail"> · {a.detail}</span>
            </div>
            {onNotify && (
              <button className="btn small" onClick={() => onNotify(a)}>
                <i className="ti ti-send" aria-hidden="true" /> 긴급 공지
              </button>
            )}
          </div>
        ))
      )}
      <div className="dz-foot">
        태풍·홍수·지진 등 공식 특보는 기상청·행정안전부 연동 시 함께 표시됩니다.
      </div>
    </div>
  )
}
